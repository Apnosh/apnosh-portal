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
import { jobSpec } from '@/lib/design/job-registry'
import { priceCreativeRequest } from '@/lib/requests/pricing'
import { mintRequestWorkOrder } from '@/lib/requests/bridge'
import { AWAITING_PAYMENT } from '@/lib/requests/desk-guards'
import { priceDesignOrder, type DesignOrderAnswers } from '@/lib/design/design-pricing'
import { DESTINATIONS, type DestinationId } from '@/lib/design/destinations'
import type { RateCard } from '@/lib/design/rate-card'
import { getActiveRateCard } from '@/lib/design/price-sheet'
import { TIER_SPECS } from '@/lib/design/tier-specs'
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
function graphicOrderCents(design: unknown, card: RateCard): number | null {
  if (typeof design !== 'object' || design === null) return null
  const d = design as Record<string, unknown>
  const destIds = (Array.isArray(d.destinations) ? d.destinations : [])
    .filter((x): x is DestinationId => typeof x === 'string' && DESTINATIONS.some((s) => s.id === x))
  if (destIds.length === 0) return null
  const photosVal = ['own', 'source', 'none', 'shoot'].includes(String(d.photos)) ? (d.photos as 'own' | 'source' | 'none' | 'shoot') : undefined
  const due = typeof d.dueDateISO === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.dueDateISO) ? d.dueDateISO : undefined
  const slidesVal = typeof d.slides === 'number' && Number.isInteger(d.slides) && d.slides >= 2 && d.slides <= 10 ? d.slides : undefined
  const writtenVal = Array.isArray(d.written)
    ? d.written.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 80).slice(0, 5)
    : []
  const answers: DesignOrderAnswers = {
    jobType: { value: 'other', source: 'asked' },
    destinations: { value: destIds, source: 'asked' },
    ...(slidesVal ? { slides: slidesVal } : {}),
    ...(writtenVal.length ? { written: writtenVal } : {}),
    ...(photosVal ? { photos: { value: photosVal, source: 'asked' as const } } : {}),
    /* print runs are off, so qty/printer cannot exist and no print-mgmt line can
     * price; revisit this sanitizer when PRINT_AVAILABLE flips back on */
    tier: d.tier === 1 || d.tier === 3 ? d.tier : 2,
    ...(due ? { dueDateISO: { value: due, source: 'asked' as const } } : {}),
    todayISO: new Date().toISOString().slice(0, 10),
    rushConfirmed: d.rushConfirmed === true,
  }
  /* fee-inclusive, same rounding as the flow shows: listed total = charged total */
  const t = priceDesignOrder(answers, card).total
  return Math.round((t + Math.round(t * 0.1)) * 100)
}

/** The tier the sanitizer will price with — mirrored so the spec snapshot matches. */
function graphicTier(design: unknown): 1 | 2 | 3 {
  if (typeof design !== 'object' || design === null) return 2
  const t = (design as Record<string, unknown>).tier
  return t === 1 || t === 3 ? t : 2
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

  /* The order lane: price at the server's own number and land pre-accepted.
   * Graphic orders price from the ACTIVE price sheet (GD-1) and snapshot the
   * sheet version + the tier's delivery spec into the brief, so what this
   * client bought is on the record even after prices or specs change. */
  const isOrder = body.order === true
  let orderCents: number | null = null
  /* 'monthly' when the price sheet priced this by the month. NOTHING bills a second month today —
   * the desk stores one quote and mints one work order — so the screen says "for the first month"
   * and this column is only the record. When the desk goes through the till, it is what says which
   * orders were meant to repeat instead of guessing from the answers. */
  let cadence: 'once' | 'monthly' = 'once'
  let brief: Record<string, unknown> = v.clean
  /* P1 TAG SPINE: the graphic TYPE rides the brief as queryable data
   * (registry-validated), so "what does what" is a query later — never
   * just a sentence inside the notes. */
  if (v.type.id === 'graphic') {
    const dt = (body.answers as Record<string, unknown> | null | undefined)?.designType
    const spec = jobSpec(typeof dt === 'string' ? dt : null)
    if (spec) brief = { ...brief, _type: spec.id, _tags: ['graphic', spec.tag] }
  }
  if (isOrder) {
    if (v.type.id === 'graphic') {
      const { card, version } = await getActiveRateCard()
      orderCents = graphicOrderCents(body.design, card)
      const tier = graphicTier(body.design)
      brief = { ...v.clean, _pricing: { priceSheetVersion: version, tier, spec: TIER_SPECS[tier] } }
      /* GD-2: the order remembers the draft it upgrades, so the designer opens
       * the client's existing draft instead of a blank page. */
      const fd = (body.design as Record<string, unknown> | null | undefined)?.fromDraftId
      if (typeof fd === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(fd)) {
        brief = { ...brief, _source: { draftId: fd } }
      }
    } else {
      const priced = priceCreativeRequest(v.type.id, v.clean)
      orderCents = priced?.totalCents ?? null
      if (priced?.monthly) cadence = 'monthly'
    }
    if (orderCents == null) {
      return NextResponse.json({ error: 'Could not price this order. Send it as a request instead.' }, { status: 400 })
    }
  }

  /* THE TILL TAKES ONE ORDER AT A TIME.
   *
   * A desk order now pays before anything is made (see below). The GRAPHIC flow is the one
   * exception, and it is a shape problem, not an oversight: "add another graphic" lets an owner
   * place several pieces in a single submit, and the till prices one creative_requests row per
   * PaymentIntent. Charging a batch would mean either N cards or a cart the desk does not have.
   * Until it does, a graphic order behaves exactly as it did before this move — minted on
   * placement, billed by the team — and no worse. Nothing else in the desk works this way. */
  const payAtPlacement = isOrder && v.type.id === 'graphic'
  const paysFirst = isOrder && !payAtPlacement

  const admin = createAdminClient()
  const baseRow: Record<string, unknown> = {
    client_id: clientId,
    type: v.type.id,
    brief,
    // A priced order waits for the card in its OWN status. It used to land 'in_progress' with an
    // accepted_at stamp and a work order already on a designer's queue, before anyone had paid a
    // cent — which is how the desk ran for months with no bill behind "Goes on your Apnosh bill".
    // Then it landed 'quoted', which is a person's quote, and the accept route mints work from any
    // quoted row: the owner could say yes to their own price and get it made for nothing.
    // 'awaiting_payment' is the till's own status and the accept route refuses it.
    // accepted_at is stamped by finalizePaidDeskOrder, on the far side of a verified payment.
    status: paysFirst ? AWAITING_PAYMENT : isOrder ? 'in_progress' : 'requested',
    created_by: user.id,
  }
  const orderCols = isOrder ? { quote_cents: orderCents, ...(payAtPlacement ? { accepted_at: new Date().toISOString() } : {}) } : {}
  let { data: row, error } = await admin
    .from('creative_requests')
    .insert({ ...baseRow, attachments, due_date: dueDate, ...orderCols, cadence })
    .select('id, type, status, created_at')
    .single()
  /* Migration 258 not applied yet: the status CHECK does not know 'awaiting_payment' (23514). Fall
   * back to 'requested' — NEVER 'quoted' — so the accept route cannot mint free work from it. The
   * owner sees "Sent"; the till still prices and charges the order from its own row. */
  if (error && (error as { code?: string }).code === '23514' && baseRow.status === AWAITING_PAYMENT) {
    console.warn('[requests] awaiting_payment is not in the status CHECK yet (apply migration 258); saved as requested')
    baseRow.status = 'requested'
    ;({ data: row, error } = await admin
      .from('creative_requests')
      .insert({ ...baseRow, attachments, due_date: dueDate, ...orderCols, cadence })
      .select('id, type, status, created_at')
      .single())
  }
  /* Migration 255 not applied yet: drop ONLY cadence and keep everything 236 gave us — a request
   * must not lose its price to a column that is only a record. */
  if (error && (error as { code?: string }).code === '42703') {
    ;({ data: row, error } = await admin
      .from('creative_requests')
      .insert({ ...baseRow, attachments, due_date: dueDate, ...orderCols })
      .select('id, type, status, created_at')
      .single())
  }
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

  /* An order that PAYS FIRST mints nothing here. Its work order and its promise are made by
   * finalizePaidDeskOrder (src/lib/requests/desk-order.ts) once /api/checkout/complete has
   * verified the charge with Stripe — work follows money. When the checkout kill switch is off,
   * the order still lands here, priced and waiting, and nothing is made, which is exactly what a
   * closed till should do. The graphic lane (payAtPlacement) still mints on the spot; see above. */
  let workOrderId: string | null = null
  if (payAtPlacement) {
    workOrderId = await mintRequestWorkOrder({
      id: row.id as string,
      client_id: clientId,
      type: v.type.id,
      brief: v.clean,
      attachments,
      due_date: dueDate,
      quote_cents: orderCents,
    }, (() => {
      const dz = (body as { design?: Record<string, unknown> }).design
      const mv = dz && typeof dz.makerVendorId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dz.makerVendorId) ? dz.makerVendorId : undefined
      return mv ? { vendorId: mv } : undefined
    })())
    ;(async () => {
      const { recordRequestPromise } = await import('@/lib/promises/record')
      await recordRequestPromise({ clientId, requestId: row.id as string, type: v.type.id, label: v.type.label ?? v.type.id })
    })().catch(() => {})
  }

  /* Remember the owner's usual (ask-once law): the maker, tier, and brand choice
   * they just ordered with become the next order's defaults. Best-effort and
   * 42703-tolerant until migration 244 runs; the order stands regardless. */
  if (isOrder && v.type.id === 'graphic') {
    try {
      const dz = ((body as { design?: Record<string, unknown> }).design ?? {}) as Record<string, unknown>
      const prefs: Record<string, unknown> = {}
      if (typeof dz.makerVendorId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dz.makerVendorId)) {
        prefs.makerVendorId = dz.makerVendorId
        if (typeof dz.makerName === 'string') prefs.makerName = dz.makerName.slice(0, 80)
      }
      if (dz.tier === 1 || dz.tier === 2 || dz.tier === 3) prefs.tier = dz.tier
      if (dz.brand === 'none' || dz.brand === 'file') prefs.brandMode = dz.brand
      if (Object.keys(prefs).length) await admin.from('clients').update({ design_prefs: prefs }).eq('id', clientId)
    } catch { /* prefs are a nicety */ }
  }

  /* Staff hear about every request the moment it lands (law: no silent stalls).
   * Best-effort: a notification hiccup must not fail the owner's submit. */
  try {
    /* notifications.body is NOT NULL: always send one (owner notes when given,
     * else the request summary). */
    await notifyStaffForClient(clientId, ['strategist', 'designer'], {
      kind: 'client_request',
      // "unpaid" is not a detail: the paid notice comes from finalizePaidDeskOrder, and staff must
      // never start work on the strength of this one.
      title: paysFirst
        ? `Order placed, not paid yet ($${Math.round((orderCents ?? 0) / 100)}): ${summaryLine(v.type.id, v.clean)}`
        : isOrder
        ? `New ORDER ($${Math.round((orderCents ?? 0) / 100)}): ${summaryLine(v.type.id, v.clean)}`
        : `New request: ${summaryLine(v.type.id, v.clean)}`,
      body: v.clean.notes?.slice(0, 200) || summaryLine(v.type.id, v.clean),
      link: '/admin/requests',
    // A desk ORDER is money placed. Admins stay on those beside the assignee; a plain request
    // is the assignee's to answer.
    }, { alsoAdmins: isOrder })
  } catch (e) {
    console.error('[requests] staff notify failed (request still saved)', e)
  }

  return NextResponse.json({
    ok: true,
    request: row,
    ...(isOrder ? { order: {
      amount_cents: orderCents,
      /* True when the order is priced and saved and the next step is the card. False on the
       * graphic lane, which still mints on placement. */
      needs_payment: paysFirst,
      work_order_id: workOrderId,
      monthly: cadence === 'monthly',
      assigned: (() => {
        const dz = (body as { design?: Record<string, unknown> }).design
        const mn = dz && typeof dz.makerName === 'string' && dz.makerName.trim() ? String(dz.makerName).trim().slice(0, 60) : null
        return mn ?? 'Your Apnosh creative team'
      })(),
    } } : {}),
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
