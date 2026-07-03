/**
 * POST /api/work/campaigns/[id]/lifecycle
 *
 * Drives email_campaigns through the state machine:
 *   - save: update subject / previewText / bodyText (status stays)
 *   - schedule: draft|in_review|approved → scheduled (sets scheduled_for)
 *   - send: any pre-send → sent (simulated dispatch, NO metrics)
 *   - cancel: scheduled|sending → cancelled
 *
 * The actual ESP wiring (Postmark/Resend) is downstream; until it lands,
 * 'send' only flips status and flags the row as a simulated send. It must
 * NOT invent recipients/opens/clicks — the owner email pages render those
 * columns as real performance, so metrics stay at their defaults (0 =
 * never tracked) until a real ESP writes them.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isCapable } from '@/lib/auth/require-any-capability'

export const dynamic = 'force-dynamic'

type Action = 'save' | 'schedule' | 'send' | 'cancel'

interface Body {
  action: Action
  subject?: string
  previewText?: string | null
  bodyText?: string
  scheduledFor?: string
}

const SEND_FROM: Record<Action, string[]> = {
  save:     ['draft', 'in_review', 'approved'],
  schedule: ['draft', 'in_review', 'approved'],
  send:     ['draft', 'in_review', 'approved', 'scheduled', 'sending'],
  cancel:   ['scheduled', 'sending'],
}

// Simulated sends are flagged in notes (the only free-text column the row
// has) so every reader can tell the campaign never really went out. The
// owner email pages look for this exact marker and hide metrics for it —
// keep the string in sync with src/app/dashboard/email-sms/*.
const SIMULATED_NOTE = '[simulated send]'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  if (!(await isCapable(['email_specialist']))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id } = await ctx.params
  const body = (await req.json().catch(() => null)) as Body | null
  if (!body || !body.action) return NextResponse.json({ error: 'action required' }, { status: 400 })

  const { data: existing } = await supabase
    .from('email_campaigns')
    .select('id, client_id, status, notes')
    .eq('id', id)
    .maybeSingle()
  if (!existing) return NextResponse.json({ error: 'campaign not found' }, { status: 404 })
  if (!SEND_FROM[body.action].includes(existing.status as string)) {
    return NextResponse.json({ error: `cannot ${body.action} from status ${existing.status}` }, { status: 409 })
  }

  const admin = createAdminClient()
  const patch: Record<string, unknown> = {}

  if (body.action === 'save') {
    if (typeof body.subject === 'string') patch.subject = body.subject
    if (body.previewText !== undefined) patch.preview_text = body.previewText
    if (typeof body.bodyText === 'string') patch.body_text = body.bodyText
  }
  if (body.action === 'schedule') {
    patch.status = 'scheduled'
    patch.scheduled_for = body.scheduledFor ?? new Date(Date.now() + 30 * 60_000).toISOString()
  }
  if (body.action === 'cancel') {
    patch.status = 'cancelled'
  }
  if (body.action === 'send') {
    // Simulated dispatch: nothing actually goes out, so nothing is written
    // to recipient_count/opens/clicks/unsubscribes/bounces — those stay at
    // their column defaults until a real ESP fills them. The row is flagged
    // in notes (appended, so an existing admin note survives).
    const priorNotes = (existing.notes as string | null) ?? ''
    patch.status = 'sent'
    patch.sent_at = new Date().toISOString()
    if (!priorNotes.includes(SIMULATED_NOTE)) {
      patch.notes = priorNotes ? `${priorNotes}\n${SIMULATED_NOTE}` : SIMULATED_NOTE
    }
  }

  const { error } = await admin.from('email_campaigns').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await admin.from('events').insert({
    client_id: existing.client_id,
    event_type: `campaign.${body.action === 'send' ? 'sent' : body.action === 'cancel' ? 'cancelled' : body.action === 'schedule' ? 'scheduled' : 'saved'}`,
    subject_type: 'email_campaign',
    subject_id: id,
    actor_id: user.id,
    actor_role: 'staff',
    summary: body.action === 'send'
      ? 'Sent (simulated dispatch, no delivery metrics)'
      : `Campaign ${body.action}`,
    payload: body.action === 'send' ? { simulated: true } : {},
  })

  return NextResponse.json({
    ok: true,
    status: patch.status ?? existing.status,
    ...(body.action === 'send' ? { simulated: true } : {}),
  })
}
