/**
 * PATCH /api/requests/[id] — the team answers a request (admin only).
 *
 * Sets status and/or the team note (the quote, the plan, or why declined). Every
 * status change tells the owner in their inbox, with the note carried in the body —
 * "quote later" only works if the quote reliably reaches them (law: no silent stalls).
 */

import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { REQUEST_STATUSES, STATUS_LABEL, requestTypeById, type RequestStatus } from '@/lib/requests/catalog'
import { notifyClientOwners } from '@/lib/notifications'

export const runtime = 'nodejs'

async function isAdminUser(userId: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data } = await admin.from('profiles').select('role').eq('id', userId).maybeSingle()
  return data?.role === 'admin'
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  if (!(await isAdminUser(user.id))) return NextResponse.json({ error: 'Admins only' }, { status: 403 })

  let body: { status?: string; team_note?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Bad request body' }, { status: 400 })
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.status !== undefined) {
    if (!REQUEST_STATUSES.includes(body.status as RequestStatus)) {
      return NextResponse.json({ error: `Bad status: ${body.status}` }, { status: 400 })
    }
    update.status = body.status
  }
  if (body.team_note !== undefined) {
    const note = String(body.team_note).slice(0, 4000)
    update.team_note = note || null
  }
  if (Object.keys(update).length === 1) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: row, error } = await admin
    .from('creative_requests')
    .update(update)
    .eq('id', id)
    .select('id, client_id, type, status, team_note')
    .single()
  if (error || !row) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  }

  /* The owner hears about every status move. Best-effort: notify failure must not
   * roll back the update, but it is logged loudly. */
  if (body.status !== undefined) {
    try {
      const type = requestTypeById(row.type)
      const status = row.status as RequestStatus
      await notifyClientOwners(row.client_id, {
        kind: 'request_update',
        title: `${type?.label ?? 'Your request'}: ${STATUS_LABEL[status]}`,
        body: row.team_note ? String(row.team_note).slice(0, 300) : undefined,
        link: '/dashboard/requests',
      })
    } catch (e) {
      console.error('[requests] owner notify failed (update still saved)', e)
    }
  }

  return NextResponse.json({ ok: true, request: row })
}
