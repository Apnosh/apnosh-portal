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
import { ADMIN_SETTABLE_STATUSES, STATUS_LABEL, requestTypeById, type RequestStatus } from '@/lib/requests/catalog'
import { notifyClientOwners } from '@/lib/notifications'
import { markHandover, handoverGuard, handoverFor, handoverProgress } from '@/lib/campaigns/handover'
import { adminStatusBlockedByPayment } from '@/lib/requests/desk-guards'

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

  let body: { status?: string; team_note?: string; quote_cents?: unknown; claim?: boolean; handover?: { id?: unknown; done?: unknown; note?: unknown } }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Bad request body' }, { status: 400 })
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.status !== undefined) {
    /* 'awaiting_payment' is missing from this list on purpose: it is the till's, and a person
     * moving a request into it by hand would say "not paid" about an order nobody is charging. */
    if (!ADMIN_SETTABLE_STATUSES.includes(body.status as RequestStatus)) {
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
  const admin = createAdminClient()

  /* THE HANDOVER (a website order): what has to change hands before this is delivered, ticked by
   * the person who moved it. It lives on the order's work order, not on the request row, because
   * that is the row the delivery is made from. Best-effort on the write (pre-258 the column is
   * absent) but NEVER on the guard below — the guard is the promise. */
  // select('*') so paid_at being absent (pre-258) reads as "not paid", never as an error.
  const { data: reqRow } = await admin.from('creative_requests').select('*').eq('id', id).maybeSingle()
  const serviceKey = `request:${String((reqRow as { type?: string } | null)?.type ?? '')}`
  const woKey = `request:${id}`

  /* MONEY MAKES A STATUS ONE-WAY. A paid order sent back to 'quoted' would offer the owner a
   * second yes on money already taken, and the accept route's paid_at check reads that as "nothing
   * due" and mints the work for free. The wrong price is a refund, not a re-quote. */
  const paidBlock = adminStatusBlockedByPayment(
    update.status as string | undefined,
    (reqRow as { paid_at?: string | null } | null)?.paid_at ?? null,
  )
  if (paidBlock) return NextResponse.json({ error: paidBlock }, { status: 409 })
  if (body.handover && typeof body.handover.id === 'string') {
    const { data: wo } = await admin.from('creator_work_orders').select('id, handover').eq('campaign_piece_key', woKey).limit(1).maybeSingle()
    if (wo) {
      const next = markHandover((wo as { handover?: unknown }).handover, {
        id: body.handover.id,
        done: body.handover.done === undefined ? undefined : body.handover.done === true,
        note: typeof body.handover.note === 'string' ? body.handover.note : undefined,
      }, new Date().toISOString())
      const { error: hErr } = await admin.from('creator_work_orders').update({ handover: next }).eq('id', (wo as { id: string }).id)
      if (hErr) console.warn('[requests] handover not saved (apply migration 258):', hErr.message)
    }
  }

  /* Delivered means the owner HOLDS it. A site whose domain is still in an Apnosh account is not
   * delivered, whatever the screen says, so the flip is refused until every required row is
   * ticked. Enforced here and not only in the UI. */
  if (update.status === 'delivered' && handoverFor(serviceKey).length > 0) {
    const { data: wo } = await admin.from('creator_work_orders').select('handover').eq('campaign_piece_key', woKey).limit(1).maybeSingle()
    const guard = handoverGuard(serviceKey, (wo as { handover?: unknown } | null)?.handover ?? null)
    if (!guard.ok) return NextResponse.json({ error: guard.reason }, { status: 400 })
  }

  // A tick on its own is a real save, not "nothing to update".
  if (Object.keys(update).length === 1) {
    return body.handover
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

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
        // Two moments are worth a phone buzzing: the work landing, and a person answering.
        // Every other status move stays an in-app row.
        email: body.status === 'delivered' || (noteChanged && body.status === undefined),
        // Delivered is their work landing; a note is a person answering them. Different switches.
        emailCategory: body.status === 'delivered' ? 'content' : 'messages',
      })
    } catch (e) {
      console.error('[requests] owner notify failed (update still saved)', e)
    }
    /* Email leaves the portal only for the moment that needs a yes: the quote. Through
     * emailClientOwners so the owner's email settings decide here too — this was the last
     * owner email that wrote straight to the address and skipped the page. */
    if (body.status === 'quoted') {
      try {
        const { emailClientOwners } = await import('@/lib/notifications')
        await emailClientOwners(row.client_id, {
          subject: `Your ${type?.label?.toLowerCase() ?? 'request'} price is ready`,
          body: `${row.team_note ?? 'Your price and plan are ready.'}\n\nSay yes in the portal and we start.`,
          link: '/dashboard/requests',
          category: 'billing',
        })
      } catch { /* best-effort */ }
    }
  }

  return NextResponse.json({ ok: true, request: row })
}

/**
 * GET /api/requests/:id/… the handover state for ONE desk order (admins only).
 *
 * The admin board reads creative_requests; the handover lives on the order's work order, and it
 * needs both to show staff what still has to change hands before they can mark it delivered.
 * Returns an empty list for work that hands nothing over, so the board renders nothing there.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const me = await adminUser(user.id)
  if (!me.isAdmin) return NextResponse.json({ error: 'Admins only' }, { status: 403 })

  const admin = createAdminClient()
  const { data: reqRow } = await admin.from('creative_requests').select('type').eq('id', id).maybeSingle()
  const serviceKey = `request:${String((reqRow as { type?: string } | null)?.type ?? '')}`
  if (handoverFor(serviceKey).length === 0) return NextResponse.json({ handover: { items: [], doneCount: 0, requiredOpen: [] } })
  // select('*') so the handover column being absent (pre-258) reads as "nothing ticked yet"
  // instead of erroring the board.
  const { data: wo } = await admin.from('creator_work_orders').select('*').eq('campaign_piece_key', `request:${id}`).limit(1).maybeSingle()
  return NextResponse.json({ handover: handoverProgress(serviceKey, (wo as { handover?: unknown } | null)?.handover ?? null) })
}
