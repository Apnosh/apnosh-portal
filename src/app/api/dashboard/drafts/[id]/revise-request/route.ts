/**
 * POST /api/dashboard/drafts/[id]/revise-request
 *
 * Client asks for changes. Logs a human_judgments row with
 * judgment='revise', tags=['client_request'], note=client message.
 * This loops the draft back to staff with the client's feedback in
 * the same retrieval pipeline AI helpers use, so the next AI batch
 * avoids whatever didn't land.
 *
 * Body: { note: string }
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'

export const dynamic = 'force-dynamic'

interface Body { note: string }

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => null)) as Body | null
  if (!body?.note?.trim()) {
    return NextResponse.json({ error: 'note required' }, { status: 400 })
  }

  const { id } = await ctx.params

  const admin = createAdminClient()
  const { data: draft } = await admin
    .from('content_drafts')
    .select('id, client_id, status, revision_count')
    .eq('id', id)
    .maybeSingle()
  if (!draft) return NextResponse.json({ error: 'draft not found' }, { status: 404 })

  const { clientId } = await resolveCurrentClient(draft.client_id as string)
  if (clientId !== draft.client_id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  // Move the draft back to 'revising' and log the judgment
  const { error: updateErr } = await admin
    .from('content_drafts')
    .update({
      status: 'revising',
      revision_count: Number(draft.revision_count ?? 0) + 1,
    })
    .eq('id', id)
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  await admin.from('human_judgments').insert({
    subject_type: 'content_draft',
    subject_id: id,
    judgment: 'revise',
    reason_tags: ['client_request'],
    reason_note: body.note.trim(),
    context_snapshot: { client_id: draft.client_id, source: 'client_signoff_page' },
    judged_by: user.id,
  })

  await admin.from('events').insert({
    client_id: draft.client_id,
    event_type: 'draft.client_revise_requested',
    subject_type: 'content_draft',
    subject_id: id,
    actor_id: user.id,
    actor_role: 'client',
    summary: 'Client requested revisions',
    payload: { note_chars: body.note.length },
  })

  return NextResponse.json({ ok: true, status: 'revising' })
}
