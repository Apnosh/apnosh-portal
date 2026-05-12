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
  const { data: task } = await supabase
    .from('client_tasks')
    .select('id, client_id, title, body, status, content_id, source, created_by')
    .eq('id', id)
    .maybeSingle()
  if (!task) return NextResponse.json({ error: 'task not found' }, { status: 404 })
  if (task.status === 'done' || task.status === 'dismissed') {
    return NextResponse.json({ error: `cannot accept from status ${task.status}` }, { status: 409 })
  }
  if (task.content_id) {
    return NextResponse.json({ error: 'task already has a draft', draftId: task.content_id }, { status: 409 })
  }

  const admin = createAdminClient()

  // Seed the idea from the title + body
  const idea = task.title ?? 'Untitled request'
  const captionSeed = task.body ?? null

  const { data: draft, error: insertErr } = await admin
    .from('content_drafts')
    .insert({
      client_id: task.client_id,
      service_line: 'social',  // Default; can be edited
      status: 'idea',
      idea,
      caption: captionSeed,
      proposed_by: task.created_by ?? user.id,
      proposed_via: 'client_request',
      target_platforms: ['instagram'],
    })
    .select('id')
    .maybeSingle()

  if (insertErr || !draft) {
    return NextResponse.json({ error: insertErr?.message ?? 'draft insert failed' }, { status: 500 })
  }

  // Mark the task in_progress and link the draft
  const { error: updateErr } = await admin
    .from('client_tasks')
    .update({
      status: 'in_progress',
      content_id: draft.id,
      assignee_type: 'admin',
      assignee_id: user.id,
    })
    .eq('id', id)
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
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
