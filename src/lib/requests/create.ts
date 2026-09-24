/**
 * createCreativeRequest — the one place a creative request (or a priced order) is minted.
 *
 * Lifted out of POST /api/requests (owner 2026-09-17) so a server route that already knows the
 * client — the Announce commit — can land the same rows the Request Desk does, under the same
 * rules: the catalog re-validates the answers, the SERVER prices an order (the sheet for
 * creatives, the design engine for graphics), a graphic order mints its work order on the spot,
 * every other order waits for the card, and staff hear about it the moment it lands.
 *
 * Nothing here reads the session: the caller has already proven who is asking.
 */
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

export interface CreateRequestInput {
  clientId: string
  userId: string
  type: string
  answers: unknown
  attachments?: unknown
  due_date?: unknown
  order?: boolean
  design?: unknown
  /** a rush order: a quarter more, two days sooner */
  rush?: boolean
}

export type CreateRequestResult =
  | { ok: true; row: { id: string; type: string; status: string; created_at: string }; orderCents: number | null; needsPayment: boolean; workOrderId: string | null; monthly: boolean; assigned: string; summary: string }
  | { ok: false; error: string; status: 400 | 500 }

export const SETUP_MSG = 'We are still setting this up. Try again in a bit.'
export const isMissingRequestsTable = (msg: string | undefined) =>
  Boolean(msg && (msg.includes('creative_requests') || msg.includes('42P01') || msg.toLowerCase().includes('does not exist')))

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The order lane's graphic price: the ACTIVE price sheet, fee included, same rounding the flow shows. */
export function graphicOrderCents(design: unknown, card: RateCard): number | null {
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
    tier: d.tier === 1 || d.tier === 3 ? d.tier : 2,
    ...(due ? { dueDateISO: { value: due, source: 'asked' as const } } : {}),
    todayISO: new Date().toISOString().slice(0, 10),
    rushConfirmed: d.rushConfirmed === true,
  }
  const t = priceDesignOrder(answers, card).total
  return Math.round((t + Math.round(t * 0.1)) * 100)
}

function graphicTier(design: unknown): 1 | 2 | 3 {
  if (typeof design !== 'object' || design === null) return 2
  const t = (design as Record<string, unknown>).tier
  return t === 1 || t === 3 ? t : 2
}

export async function createCreativeRequest(input: CreateRequestInput): Promise<CreateRequestResult> {
  const { clientId, userId } = input
  const v = validateRequestPayload(String(input.type ?? ''), input.answers ?? {})
  if (!v.ok) return { ok: false, error: v.problem, status: 400 }
  const attachments = validateAttachments(input.attachments)
  const dueDate = validateDueDate(input.due_date, new Date().toISOString().slice(0, 10))

  const isOrder = input.order === true
  let orderCents: number | null = null
  let cadence: 'once' | 'monthly' = 'once'
  let brief: Record<string, unknown> = v.clean
  if (v.type.id === 'graphic') {
    const dt = (input.answers as Record<string, unknown> | null | undefined)?.designType
    const spec = jobSpec(typeof dt === 'string' ? dt : null)
    if (spec) brief = { ...brief, _type: spec.id, _tags: ['graphic', spec.tag] }
  }
  const design = (input.design && typeof input.design === 'object' ? input.design : null) as Record<string, unknown> | null
  if (isOrder) {
    if (v.type.id === 'graphic') {
      const { card, version } = await getActiveRateCard()
      orderCents = graphicOrderCents(input.design, card)
      const tier = graphicTier(input.design)
      brief = { ...v.clean, _pricing: { origin: 'price_sheet', priceSheetVersion: version, tier, spec: TIER_SPECS[tier] } }
      const fd = design?.fromDraftId
      if (typeof fd === 'string' && UUID.test(fd)) brief = { ...brief, _source: { draftId: fd } }
    } else {
      const priced = priceCreativeRequest(v.type.id, v.clean)
      orderCents = priced?.totalCents ?? null
      if (priced?.monthly) cadence = 'monthly'
      if (orderCents != null) brief = { ...brief, _pricing: { origin: 'price_sheet' } }
    }
    if (orderCents == null) return { ok: false, error: 'Could not price this order. Send it as a request instead.', status: 400 }
    /* RUSH (owner 2026-09-24): the piece is wanted two days sooner; a quarter more on it, said in the brief */
    if (input.rush === true && orderCents > 0) { orderCents = Math.round(orderCents * 1.25); brief = { ...brief, _rush: { rate: 0.25, note: 'Rush: wanted two days sooner' } } }
  }

  /* The till takes one order at a time: a graphic order mints on placement and is billed by the
     team; every other order pays first and mints in finalizePaidDeskOrder. */
  const payAtPlacement = isOrder && v.type.id === 'graphic'
  const paysFirst = isOrder && !payAtPlacement

  const admin = createAdminClient()
  const baseRow: Record<string, unknown> = {
    client_id: clientId,
    type: v.type.id,
    brief,
    status: paysFirst ? AWAITING_PAYMENT : isOrder ? 'in_progress' : 'requested',
    created_by: userId,
  }
  const orderCols = isOrder ? { quote_cents: orderCents, ...(payAtPlacement ? { accepted_at: new Date().toISOString() } : {}) } : {}
  let { data: row, error } = await admin
    .from('creative_requests')
    .insert({ ...baseRow, attachments, due_date: dueDate, ...orderCols, cadence })
    .select('id, type, status, created_at')
    .single()
  /* Schema-lag fallbacks, in order: 258 (awaiting_payment), 255 (cadence), 236 (v2 columns). */
  if (error && (error as { code?: string }).code === '23514' && baseRow.status === AWAITING_PAYMENT) {
    console.warn('[requests] awaiting_payment is not in the status CHECK yet (apply migration 258); saved as requested')
    baseRow.status = 'requested'
    ;({ data: row, error } = await admin.from('creative_requests').insert({ ...baseRow, attachments, due_date: dueDate, ...orderCols, cadence }).select('id, type, status, created_at').single())
  }
  if (error && (error as { code?: string }).code === '42703') {
    ;({ data: row, error } = await admin.from('creative_requests').insert({ ...baseRow, attachments, due_date: dueDate, ...orderCols }).select('id, type, status, created_at').single())
  }
  if (error && (error as { code?: string }).code === '42703') {
    ;({ data: row, error } = await admin.from('creative_requests').insert(baseRow).select('id, type, status, created_at').single())
  }
  if (error || !row) {
    console.error('[requests] insert failed', error?.message)
    return { ok: false, error: isMissingRequestsTable(error?.message) ? SETUP_MSG : 'Could not save your request. Try again.', status: 500 }
  }

  let workOrderId: string | null = null
  if (payAtPlacement) {
    const mv = design && typeof design.makerVendorId === 'string' && UUID.test(design.makerVendorId) ? design.makerVendorId : undefined
    workOrderId = await mintRequestWorkOrder({
      id: row.id as string, client_id: clientId, type: v.type.id, brief: v.clean, attachments, due_date: dueDate, quote_cents: orderCents,
    }, mv ? { vendorId: mv } : undefined)
    ;(async () => {
      const { recordRequestPromise } = await import('@/lib/promises/record')
      await recordRequestPromise({ clientId, requestId: row.id as string, type: v.type.id, label: v.type.label ?? v.type.id })
    })().catch(() => {})
  }

  /* Ask-once law: the maker, tier and brand choice become the next order's defaults. */
  if (isOrder && v.type.id === 'graphic' && design) {
    try {
      const prefs: Record<string, unknown> = {}
      if (typeof design.makerVendorId === 'string' && UUID.test(design.makerVendorId)) {
        prefs.makerVendorId = design.makerVendorId
        if (typeof design.makerName === 'string') prefs.makerName = design.makerName.slice(0, 80)
      }
      if (design.tier === 1 || design.tier === 2 || design.tier === 3) prefs.tier = design.tier
      if (design.brand === 'none' || design.brand === 'file') prefs.brandMode = design.brand
      if (Object.keys(prefs).length) await admin.from('clients').update({ design_prefs: prefs }).eq('id', clientId)
    } catch { /* prefs are a nicety */ }
  }

  const summary = summaryLine(v.type.id, v.clean)
  try {
    await notifyStaffForClient(clientId, ['strategist', 'designer'], {
      kind: 'client_request',
      title: paysFirst
        ? `Order placed, not paid yet ($${Math.round((orderCents ?? 0) / 100)}): ${summary}`
        : isOrder
        ? `New ORDER ($${Math.round((orderCents ?? 0) / 100)}): ${summary}`
        : `New request: ${summary}`,
      body: v.clean.notes?.slice(0, 200) || summary,
      link: '/admin/requests',
    }, { alsoAdmins: isOrder })
  } catch (e) {
    console.error('[requests] staff notify failed (request still saved)', e)
  }

  const assigned = design && typeof design.makerName === 'string' && design.makerName.trim() ? String(design.makerName).trim().slice(0, 60) : 'Your Apnosh creative team'
  return {
    ok: true,
    row: { id: String(row.id), type: String(row.type), status: String(row.status), created_at: String(row.created_at) },
    orderCents, needsPayment: paysFirst, workOrderId, monthly: cadence === 'monthly', assigned, summary,
  }
}
