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
import { validateRequestPayload, summaryLine, validateAttachments, validateDueDate } from '@/lib/requests/catalog'
import { priceCreativeRequest } from '@/lib/requests/pricing'
import { mintRequestWorkOrder } from '@/lib/requests/bridge'
import { priceDesignOrder, type DesignOrderAnswers } from '@/lib/design/design-pricing'
import { DESTINATIONS, type DestinationId } from '@/lib/design/destinations'
import { RATE_CARD } from '@/lib/design/rate-card'
import { notifyStaffForClient } from '@/lib/notifications'

export const runtime = 'nodejs'

/**
 * THE ORDER LANE (owner call 2026-08-09: price included, no quote round trip).
 * `order: true` turns a request into an order at the SERVER's own price: the sheet
 * (pricing.ts) for creatives, the design engine for graphics. The row lands already
 * accepted at that price and the work order mints immediately on the house team —
 * the same bridge the quote-accept path proved. The client's displayed number is
 * never trusted; the server computes its own.
 */
function graphicOrderCents(design: unknown): number | null {
  if (typeof design !== 'object' || design === null) return null
  const d = design as Record<string, unknown>
  const destIds = (Array.isArray(d.destinations) ? d.destinations : [])
    .filter((x): x is DestinationId => typeof x === 'string' && DESTINATIONS.some((s) => s.id === x))
  if (destIds.length === 0) return null
  const photosVal = ['own', 'source', 'none', 'shoot'].includes(String(d.photos)) ? (d.photos as 'own' | 'source' | 'none' | 'shoot') : undefined
  const due = typeof d.dueDateISO === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.dueDateISO) ? d.dueDateISO : undefined
  const answers: DesignOrderAnswers = {
    jobType: { value: 'other', source: 'asked' },
    destinations: { value: destIds, source: 'asked' },
    ...(photosVal ? { photos: { value: photosVal, source: 'asked' as const } } : {}),
    /* print runs are off, so qty/printer cannot exist and no print-mgmt line can
     * price; revisit this sanitizer when PRINT_AVAILABLE flips back on */
    tier: d.tier === 1 || d.tier === 3 ? d.tier : 2,
    ...(due ? { dueDateISO: { value: due, source: 'asked' as const } } : {}),
    todayISO: new Date().toISOString().slice(0, 10),
    rushConfirmed: d.rushConfirmed === true,
  }
  return Math.round(priceDesignOrder(answers, RATE_CARD).total * 100)
}

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

  let body: { type?: string; answers?: unknown; attachments?: unknown; due_date?: unknown; order?: unknown; design?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Bad request body' }, { status: 400 })
  }

  const v = validateRequestPayload(String(body.type ?? ''), body.answers ?? {})
  if (!v.ok) return NextResponse.json({ error: v.problem }, { status: 400 })
  const attachments = validateAttachments(body.attachments)
  const dueDate = validateDueDate(body.due_date, new Date().toISOString().slice(0, 10))

  /* The order lane: price at the server's own number and land pre-accepted. */
  const isOrder = body.order === true
  let orderCents: number | null = null
  if (isOrder) {
    orderCents = v.type.id === 'graphic'
      ? graphicOrderCents(body.design)
      : priceCreativeRequest(v.type.id, v.clean)?.totalCents ?? null
    if (orderCents == null) {
      return NextResponse.json({ error: 'Could not price this order. Send it as a request instead.' }, { status: 400 })
    }
  }

  const admin = createAdminClient()
  const baseRow = {
    client_id: clientId,
    type: v.type.id,
    brief: v.clean,
    status: isOrder ? 'in_progress' : 'requested',
    created_by: user.id,
  }
  const orderCols = isOrder ? { quote_cents: orderCents, accepted_at: new Date().toISOString() } : {}
  let { data: row, error } = await admin
    .from('creative_requests')
    .insert({ ...baseRow, attachments, due_date: dueDate, ...orderCols })
    .select('id, type, status, created_at')
    .single()
  /* Migration 236 not applied yet (42703 unknown column): the request still
   * lands, just without the new columns. Never lose an owner's ask to a schema lag. */
  if (error && (error as { code?: string }).code === '42703') {
    ;({ data: row, error } = await admin
      .from('creative_requests')
      .insert(baseRow)
      .select('id, type, status, created_at')
      .single())
  }
  if (error || !row) {
    console.error('[requests] insert failed', error?.message)
    return NextResponse.json({ error: isMissingTable(error?.message) ? SETUP_MSG : 'Could not save your request. Try again.' }, { status: 500 })
  }

  /* An order mints its work order NOW, on the house team, same bridge the
   * quote-accept path proved. Best-effort: the order stands even if the mint hiccups
   * (the admin queue shows it either way). */
  let workOrderId: string | null = null
  if (isOrder) {
    workOrderId = await mintRequestWorkOrder({
      id: row.id as string,
      client_id: clientId,
      type: v.type.id,
      brief: v.clean,
      attachments,
      due_date: dueDate,
      quote_cents: orderCents,
    })
  }

  /* Staff hear about every request the moment it lands (law: no silent stalls).
   * Best-effort: a notification hiccup must not fail the owner's submit. */
  try {
    /* notifications.body is NOT NULL: always send one (owner notes when given,
     * else the request summary). */
    await notifyStaffForClient(clientId, ['strategist', 'designer'], {
      kind: 'client_request',
      title: isOrder
        ? `New ORDER ($${Math.round((orderCents ?? 0) / 100)}): ${summaryLine(v.type.id, v.clean)}`
        : `New request: ${summaryLine(v.type.id, v.clean)}`,
      body: v.clean.notes?.slice(0, 200) || summaryLine(v.type.id, v.clean),
      link: '/admin/requests',
    })
  } catch (e) {
    console.error('[requests] staff notify failed (request still saved)', e)
  }

  return NextResponse.json({
    ok: true,
    request: row,
    ...(isOrder ? { order: { amount_cents: orderCents, work_order_id: workOrderId, assigned: 'Your Apnosh creative team' } } : {}),
  })
}

export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const clientId = await resolveClientId(user.id)
  if (!clientId) return NextResponse.json({ error: 'No client context' }, { status: 403 })

  const admin = createAdminClient()
  const V2_SELECT = 'id, type, brief, status, team_note, created_at, updated_at, due_date, attachments, quote_cents, accepted_at, notes:creative_request_notes(id, author_role, body, created_at)'
  let { data, error } = await admin
    .from('creative_requests')
    .select(V2_SELECT)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(50)
  /* Pre-236 schema: fall back to the v1 shape so the list still loads. */
  if (error) {
    const fb = await admin
      .from('creative_requests')
      .select('id, type, brief, status, team_note, created_at, updated_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(50)
    data = fb.data as unknown as typeof data
    error = fb.error
  }
  if (error) {
    if (isMissingTable(error.message)) return NextResponse.json({ requests: [] })
    return NextResponse.json({ error: 'Could not load requests' }, { status: 500 })
  }
  return NextResponse.json({ requests: data ?? [] })
}
