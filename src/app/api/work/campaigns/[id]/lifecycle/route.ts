/**
 * POST /api/work/campaigns/[id]/lifecycle
 *
 * Drives email_campaigns through the state machine:
 *   - save: update subject / previewText / bodyText (status stays)
 *   - schedule: draft|in_review|approved → scheduled (sets scheduled_for)
 *   - send: any pre-send → sent (simulated dispatch + simulated metrics)
 *   - cancel: scheduled|sending → cancelled
 *
 * The actual ESP wiring (Postmark/Resend) is downstream; for now
 * 'send' simulates dispatch with a recipient count and ~20% open
 * rate / ~3% click rate seeded on the row.
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
    .select('id, client_id, status, segment_name')
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
  let simulatedMetrics: { recipients: number; opens: number; clicks: number } | null = null
  if (body.action === 'send') {
    // Simulate dispatch: recipient count keyed off segment, then metrics
    // seeded with rough industry rates so the Sent rail shows something.
    const segmentSize: Record<string, number> = {
      'all-subscribers': 1840,
      'lapsed': 420,
      'loyalty': 310,
      'new-local': 95,
    }
    const seg = (existing.segment_name as string) ?? 'all-subscribers'
    const recipients = segmentSize[seg] ?? 1000
    const opens = Math.round(recipients * (0.18 + Math.random() * 0.06))   // 18-24%
    const clicks = Math.round(opens * (0.06 + Math.random() * 0.04))        // 6-10% CTR of opens
    patch.status = 'sent'
    patch.sent_at = new Date().toISOString()
    patch.recipient_count = recipients
    patch.opens = opens
    patch.clicks = clicks
    patch.unsubscribes = Math.max(0, Math.round(recipients * 0.002))
    patch.bounces = Math.max(0, Math.round(recipients * 0.01))
    simulatedMetrics = { recipients, opens, clicks }
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
    summary: body.action === 'send' && simulatedMetrics
      ? `Sent ${simulatedMetrics.recipients} (${simulatedMetrics.opens} open / ${simulatedMetrics.clicks} click — simulated)`
      : `Campaign ${body.action}`,
    payload: simulatedMetrics ? simulatedMetrics : {},
  })

  return NextResponse.json({
    ok: true,
    status: patch.status ?? existing.status,
    ...(simulatedMetrics ? { recipientCount: simulatedMetrics.recipients, opens: simulatedMetrics.opens, clicks: simulatedMetrics.clicks } : {}),
  })
}
