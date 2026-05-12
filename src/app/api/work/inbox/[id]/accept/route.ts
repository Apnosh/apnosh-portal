/**
 * POST /api/work/inbox/[id]/accept
 *
 * Staff accepts a client_tasks row (typically a client content
 * request) and seeds a content_draft from it. Side effects:
 *  - Creates a content_drafts row (status='idea', proposed_via='client',
 *    proposed_by=request.created_by, idea seeded from task title+body)
 *  - Updates the task: status='in_progress', content_id=new draft id
 *  - Writes an event for audit
 *
 * Returns the new draft id so the UI can route to /work/drafts.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isCapable } from '@/lib/auth/require-any-capability'

export const dynamic = 'force-dynamic'

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  if (!(await isCapable(['strategist', 'copywriter', 'community_mgr', 'onboarder']))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id } = await ctx.params

  // Read once for early 404 + audit metadata. We re-claim atomically below.
  const { data: task } = await supabase
    .from('client_tasks')
    .select('id, client_id, title, body, status, draft_id, source, created_by')
    .eq('id', id)
    .maybeSingle()
  if (!task) return NextResponse.json({ error: 'task not found' }, { status: 404 })
  if (task.status === 'done' || task.status === 'canceled') {
    return NextResponse.json({ error: `cannot accept from status ${task.status}` }, { status: 409 })
  }
  if (task.draft_id) {
    return NextResponse.json({ error: 'task already has a draft', draftId: task.draft_id }, { status: 409 })
  }

  const admin = createAdminClient()

  // Race-safe claim: only one concurrent caller will get a row back.
  // The WHERE clause matches only tasks still in todo AND with no draft
  // yet — concurrent callers will see a second-write of 0 rows.
  const { data: claimed, error: claimErr } = await admin
    .from('client_tasks')
    .update({
      status: 'doing',
      assignee_type: 'admin',
      assignee_id: user.id,
    })
    .eq('id', id)
    .eq('status', 'todo')
    .is('draft_id', null)
    .select('id, client_id, title, body, created_by')
    .maybeSingle()
  if (claimErr) {
    return NextResponse.json({ error: claimErr.message }, { status: 500 })
  }
  if (!claimed) {
    // Someone else won the race; re-read to return the winning draft id.
    const { data: winner } = await admin
      .from('client_tasks')
      .select('draft_id')
      .eq('id', id)
      .maybeSingle()
    return NextResponse.json({
      error: 'task already accepted',
      draftId: winner?.draft_id ?? null,
    }, { status: 409 })
  }

  // We own the task. Seed the draft.
  const idea = (claimed.title as string) ?? 'Untitled request'
  const captionSeed = (claimed.body as string) ?? null

  const { data: draft, error: insertErr } = await admin
    .from('content_drafts')
    .insert({
      client_id: claimed.client_id,
      service_line: 'social',
      status: 'idea',
      idea,
      caption: captionSeed,
      proposed_by: (claimed.created_by as string) ?? user.id,
      proposed_via: 'client_request',
      target_platforms: ['instagram'],
    })
    .select('id')
    .maybeSingle()

  if (insertErr || !draft) {
    // Insert failed — release the claim so the user can retry.
    await admin
      .from('client_tasks')
      .update({ status: 'todo', assignee_type: 'admin', assignee_id: null })
      .eq('id', id)
    return NextResponse.json({ error: insertErr?.message ?? 'draft insert failed' }, { status: 500 })
  }

  // Link the new draft id back onto the task we already claimed.
  const { error: linkErr } = await admin
    .from('client_tasks')
    .update({ draft_id: draft.id })
    .eq('id', id)
  if (linkErr) {
    return NextResponse.json({ error: linkErr.message }, { status: 500 })
  }

  // Audit
  await admin.from('events').insert({
    client_id: task.client_id,
    event_type: 'client_request.accepted',
    subject_type: 'client_task',
    subject_id: id,
    actor_id: user.id,
    actor_role: 'staff',
    summary: `Accepted request → draft created`,
    payload: { draft_id: draft.id, request_title: task.title },
  })

  return NextResponse.json({ ok: true, draftId: draft.id })
}
