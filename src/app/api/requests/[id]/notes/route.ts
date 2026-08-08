/**
 * POST /api/requests/[id]/notes — the request's running thread, both sides.
 *
 * An owner reply or a team note appends to creative_request_notes (append-only,
 * so nothing is ever destroyed) and notifies the other side. This is how a
 * clarifying question gets answered without leaving the request — before this,
 * the rail had one overwritable note field and the owner had no way to speak.
 */

import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requestTypeById } from '@/lib/requests/catalog'
import { notifyClientOwners, notifyStaffForClient } from '@/lib/notifications'

export const runtime = 'nodejs'

async function resolveClientId(userId: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data: biz } = await admin
    .from('businesses').select('client_id').eq('owner_id', userId).maybeSingle()
  if (biz?.client_id) return biz.client_id
  const { data: cu } = await admin
    .from('client_users').select('client_id').eq('auth_user_id', userId).maybeSingle()
  return cu?.client_id ?? null
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  let body: { body?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Bad request body' }, { status: 400 })
  }
  const text = String(body.body ?? '').trim().slice(0, 2000)
  if (!text) return NextResponse.json({ error: 'Say something first' }, { status: 400 })

  const admin = createAdminClient()
  const { data: row } = await admin
    .from('creative_requests')
    .select('id, client_id, type')
    .eq('id', id)
    .maybeSingle()
  if (!row) return NextResponse.json({ error: 'Request not found' }, { status: 404 })

  /* Who is speaking? Admins write as 'team'; the request's own client writes as
   * 'owner'; anyone else is refused. */
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle()
  const isAdmin = profile?.role === 'admin'
  let role: 'team' | 'owner'
  if (isAdmin) {
    role = 'team'
  } else {
    const clientId = await resolveClientId(user.id)
    if (!clientId || clientId !== row.client_id) {
      return NextResponse.json({ error: 'Not your request' }, { status: 403 })
    }
    role = 'owner'
  }

  const { data: note, error } = await admin
    .from('creative_request_notes')
    .insert({ request_id: id, author_role: role, author_id: user.id, body: text })
    .select('id, author_role, body, created_at')
    .single()
  if (error || !note) {
    const missing = error?.message?.includes('creative_request_notes') || error?.message?.toLowerCase().includes('does not exist')
    return NextResponse.json(
      { error: missing ? 'We are still setting this up. Try again in a bit.' : 'Could not save your note. Try again.' },
      { status: 500 },
    )
  }

  await admin.from('creative_requests').update({ updated_at: new Date().toISOString() }).eq('id', id)

  const type = requestTypeById(row.type)
  try {
    if (role === 'owner') {
      await notifyStaffForClient(row.client_id, ['strategist', 'designer'], {
        kind: 'client_request',
        title: `Reply on ${type?.label?.toLowerCase() ?? 'a request'}`,
        body: text.slice(0, 300),
        link: '/admin/requests',
      })
    } else {
      await notifyClientOwners(row.client_id, {
        kind: 'request_update',
        title: `${type?.label ?? 'Your request'}: a note from the team`,
        body: text.slice(0, 300),
        link: '/dashboard/requests',
      })
    }
  } catch (e) {
    console.error('[requests] note notify failed (note still saved)', e)
  }

  return NextResponse.json({ ok: true, note })
}
