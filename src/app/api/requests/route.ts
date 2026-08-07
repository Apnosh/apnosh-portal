/**
 * /api/requests — the creative request rail (owner side).
 *
 * POST: submit a request. The payload is re-validated against the catalog server side
 * (same rules as the UI) so a hand-rolled call cannot land garbage. Requests never
 * charge; they notify staff and land in the admin queue.
 * GET: the signed-in owner's own requests, newest first.
 *
 * Failure honesty: if the creative_requests table is missing (migration 235 not applied
 * yet), the owner gets a calm "still setting up" message, never a stack trace.
 */

import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { validateRequestPayload, summaryLine } from '@/lib/requests/catalog'
import { notifyStaffForClient } from '@/lib/notifications'

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

const SETUP_MSG = 'We are still setting this up. Try again in a bit.'
const isMissingTable = (msg: string | undefined) =>
  Boolean(msg && (msg.includes('creative_requests') || msg.includes('42P01') || msg.toLowerCase().includes('does not exist')))

export async function POST(req: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const clientId = await resolveClientId(user.id)
  if (!clientId) return NextResponse.json({ error: 'No client context' }, { status: 403 })

  let body: { type?: string; answers?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Bad request body' }, { status: 400 })
  }

  const v = validateRequestPayload(String(body.type ?? ''), body.answers ?? {})
  if (!v.ok) return NextResponse.json({ error: v.problem }, { status: 400 })

  const admin = createAdminClient()
  const { data: row, error } = await admin
    .from('creative_requests')
    .insert({
      client_id: clientId,
      type: v.type.id,
      brief: v.clean,
      status: 'requested',
      created_by: user.id,
    })
    .select('id, type, status, created_at')
    .single()
  if (error || !row) {
    console.error('[requests] insert failed', error?.message)
    return NextResponse.json({ error: isMissingTable(error?.message) ? SETUP_MSG : 'Could not save your request. Try again.' }, { status: 500 })
  }

  /* Staff hear about every request the moment it lands (law: no silent stalls).
   * Best-effort: a notification hiccup must not fail the owner's submit. */
  try {
    await notifyStaffForClient(clientId, ['strategist', 'designer'], {
      kind: 'client_request',
      title: `New request: ${summaryLine(v.type.id, v.clean)}`,
      body: v.clean.notes ? v.clean.notes.slice(0, 200) : undefined,
      link: '/admin/requests',
    })
  } catch (e) {
    console.error('[requests] staff notify failed (request still saved)', e)
  }

  return NextResponse.json({ ok: true, request: row })
}

export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const clientId = await resolveClientId(user.id)
  if (!clientId) return NextResponse.json({ error: 'No client context' }, { status: 403 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('creative_requests')
    .select('id, type, brief, status, team_note, created_at, updated_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) {
    if (isMissingTable(error.message)) return NextResponse.json({ requests: [] })
    return NextResponse.json({ error: 'Could not load requests' }, { status: 500 })
  }
  return NextResponse.json({ requests: data ?? [] })
}
