/**
 * PATCH /api/requests/[id] — the team answers a request (admin only).
 *
 * Sets status, the team note (the quote, the plan, or why declined), the
 * structured quote amount, or claims the request. Every status change AND every
 * note change tells the owner in their inbox — "quote later" only works if the
 * quote reliably reaches them (law: no silent stalls). Notes also append to
 * creative_request_notes so a later reply never destroys the quote, and a
 * quoted status additionally goes out by email when the email rail is configured.
 */

import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { REQUEST_STATUSES, STATUS_LABEL, requestTypeById, type RequestStatus } from '@/lib/requests/catalog'
import { notifyClientOwners } from '@/lib/notifications'
import { sendEmailIfConfigured, ownerEmailsForClient } from '@/lib/email/send'

export const runtime = 'nodejs'

async function adminUser(userId: string): Promise<{ isAdmin: boolean; email: string | null }> {
  const admin = createAdminClient()
  const { data } = await admin.from('profiles').select('role').eq('id', userId).maybeSingle()
  if (data?.role !== 'admin') return { isAdmin: false, email: null }
  const { data: u } = await admin.auth.admin.getUserById(userId)
  return { isAdmin: true, email: u?.user?.email ?? null }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const me = await adminUser(user.id)
  if (!me.isAdmin) return NextResponse.json({ error: 'Admins only' }, { status: 403 })

  let body: { status?: string; team_note?: string; quote_cents?: unknown; claim?: boolean }
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
  let noteChanged = false
  if (body.team_note !== undefined) {
    const note = String(body.team_note).slice(0, 4000)
    update.team_note = note || null
    noteChanged = Boolean(note.trim())
  }
  if (body.quote_cents !== undefined) {
    const cents = Number(body.quote_cents)
    if (!Number.isFinite(cents) || cents < 0 || cents > 5_000_000) {
      return NextResponse.json({ error: 'Bad quote amount' }, { status: 400 })
    }
    update.quote_cents = Math.round(cents)
  }
  if (body.claim === true) {
    update.assigned_to = user.id
    update.assigned_name = me.email ? me.email.split('@')[0] : 'admin'
  }
  if (Object.keys(update).length === 1) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const admin = createAdminClient()
  let { data: row, error } = await admin
    .from('creative_requests')
    .update(update)
    .eq('id', id)
    .select('id, client_id, type, status, team_note')
    .single()
  /* Pre-236 schema (42703): retry with only the v1 columns so status/note moves
   * keep working before the owner runs the migration. */
  if (error && (error as { code?: string }).code === '42703') {
    const v1: Record<string, unknown> = { updated_at: update.updated_at }
    if (update.status !== undefined) v1.status = update.status
    if (update.team_note !== undefined) v1.team_note = update.team_note
    if (Object.keys(v1).length > 1) {
      ;({ data: row, error } = await admin
        .from('creative_requests')
        .update(v1)
        .eq('id', id)
        .select('id, client_id, type, status, team_note')
        .single())
    }
  }
  if (error || !row) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  }

  /* Thread history: a saved note is appended, never only overwritten, so a later
   * reply can't destroy the quote. Best-effort (table lands with 236). */
  if (noteChanged && row.team_note) {
    try {
      await admin.from('creative_request_notes').insert({
        request_id: id, author_role: 'team', author_id: user.id, body: row.team_note,
      })
    } catch { /* pre-236 */ }
  }

  /* The owner hears about every status move AND every note (F11a: a quote update
   * with no status change used to be silent). Best-effort: notify failure must
   * not roll back the update, but it is logged loudly. */
  if (body.status !== undefined || noteChanged) {
    const type = requestTypeById(row.type)
    const status = row.status as RequestStatus
    const title = body.status !== undefined
      ? `${type?.label ?? 'Your request'}: ${STATUS_LABEL[status]}`
      : `${type?.label ?? 'Your request'}: a note from the team`
    try {
      await notifyClientOwners(row.client_id, {
        kind: 'request_update',
        title,
        body: row.team_note ? String(row.team_note).slice(0, 300) : undefined,
        link: '/dashboard/requests',
      })
    } catch (e) {
      console.error('[requests] owner notify failed (update still saved)', e)
    }
    /* Email leaves the portal only for the moment that needs a yes: the quote. */
    if (body.status === 'quoted') {
      try {
        const emails = await ownerEmailsForClient(row.client_id)
        await sendEmailIfConfigured({
          to: emails,
          subject: `Your ${type?.label?.toLowerCase() ?? 'request'} price is ready`,
          text: `${row.team_note ?? 'Your price and plan are ready.'}\n\nSay yes in the portal and we start: https://portal.apnosh.com/dashboard/requests`,
        })
      } catch { /* best-effort */ }
    }
  }

  return NextResponse.json({ ok: true, request: row })
}
