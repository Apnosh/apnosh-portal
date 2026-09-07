/**
 * Refunds — the one place money goes BACKWARDS.
 *
 * Before this module the app could only take money. There was no `refunds.create` anywhere in
 * src, so a refund had to be done by hand in the Stripe dashboard, and nothing wrote back: the
 * campaign_payments row stayed 'paid' forever, isCampaignCheckoutPaid kept saying "covered", every
 * piece delivered afterwards was stamped 'covered_by_checkout' and could never be invoiced, creator
 * payouts kept accruing, and the committed Stripe Tax transaction was never reversed.
 *
 * refundCampaignPayment does the whole reversal in one call: the Stripe refund, the payment row,
 * the ledger rows for work that never landed, the monthly subscription, the tax transaction, and
 * the two people who need to know.
 *
 * LAWS (money code, so these are enforced, not documented):
 *  - FAIL CLOSED. No Stripe call without a paid row and a positive amount. Anything missing or
 *    unreadable refunds NOTHING and says why.
 *  - NEVER MORE THAN WAS PAID. The amount is clamped to what is still refundable on the charge,
 *    measured against Stripe's own record of prior refunds, not just our column.
 *  - IDEMPOTENT. A second call for the same PaymentIntent sees Stripe's existing refunds and
 *    refunds 0; identical retries also carry a Stripe idempotency key.
 *  - THE ORDER MATTERS. Stripe first. Only a real, confirmed refund is ever written down.
 *
 * Server-only (service role). TEST MODE is enforced by the key the shared `stripe` client is built
 * with — this module never picks keys.
 */
import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { stripe } from '@/lib/stripe'
import { notifyClientOwners, notifyStaffForClient, createNotification } from '@/lib/notifications'
import { getAdminUserIds } from '@/lib/notify'
import { refundOwedCents, refundableCents, refundStatus, COLLECTED_STATUSES, SETTLED_STATUSES, type PaidBill } from './refund-math'

/** The paid charge we are reversing, read off campaign_payments. */
export interface PaidCharge extends PaidBill {
  paymentIntentId: string
  clientId: string
  campaignId: string
  currency: string
  taxTransactionId: string | null
  taxReversalId: string | null
}

export interface RefundResult {
  ok: boolean
  /** What we sent back on THIS call, in cents. 0 when there was nothing to send. */
  refundedCents: number
  /** Everything refunded on this charge, including earlier refunds. */
  totalRefundedCents: number
  /** Plain words for the owner / the log when nothing moved. */
  reason?: string
  refundId?: string
}

const NOTHING = (reason: string): RefundResult => ({ ok: false, refundedCents: 0, totalRefundedCents: 0, reason })

/**
 * The paid-charge read, as a Result — the same shape and the same reason as DeliveredResult.
 *
 * ok:true + paid:null is a REAL answer: there is no settled charge on this campaign, so there is
 * nothing to send back. ok:false means we could not read, which is a different fact entirely and
 * must never be spoken as "nothing is owed".
 */
export type PaidChargeResult =
  | { ok: true; paid: PaidCharge | null }
  | { ok: false; reason: string }

/**
 * The paid charge for a campaign. Reads with select('*') so the refund columns being absent
 * (pre-migration 254) can never error the read — a refund must still be possible.
 *
 * FAILS CLOSED, like the ledger read. A dead database and a campaign that was never paid for both
 * used to come back as `null`, and the stop screen said "Nothing is owed" over the top of money we
 * were still holding. Now an error says so and the settlement hands it to a person.
 */
export async function getPaidCharge(campaignId: string): Promise<PaidChargeResult> {
  if (!campaignId) return { ok: true, paid: null }
  const admin = createAdminClient()
  try {
    const { data, error } = await admin
      .from('campaign_payments')
      .select('*')
      .eq('campaign_id', campaignId)
      // SETTLED, not merely collected: a disputed charge is money the bank already pulled, and
      // refunding it on top of the chargeback would send the same money back twice.
      .in('status', SETTLED_STATUSES)
      .order('paid_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) return { ok: false, reason: `payment row unreadable: ${error.message}` }
    // No row is a real, readable answer: nothing settled was ever charged for this campaign.
    if (!data) return { ok: true, paid: null }
    return { ok: true, paid: toPaidCharge(data as Record<string, unknown>) }
  } catch (e) {
    return { ok: false, reason: `payment row unreadable: ${(e as Error)?.message ?? 'unknown error'}` }
  }
}

/** What we say when the bank is still holding the money. Never "nothing is owed". */
export const DISPUTE_OPEN =
  'A bank dispute is open on this order, so we cannot send anything back until it closes. Our team is on it.'

/**
 * Is there an OPEN chargeback on this campaign?
 *
 * getPaidCharge answers "can we refund?" and a disputed row makes it say no — correctly, because
 * refunding on top of a chargeback sends the same money twice. But "no" there looks exactly like
 * "there was never a charge", and the stop settlement then told an owner whose bank had just pulled
 * their money that nothing was owed. This is the read that tells those two apart.
 *
 * Same Result shape, same reason: an unreadable answer is not "no dispute".
 */
export async function hasOpenDispute(campaignId: string): Promise<{ ok: true; disputed: boolean } | { ok: false; reason: string }> {
  if (!campaignId) return { ok: true, disputed: false }
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('campaign_payments')
      .select('status')
      .eq('campaign_id', campaignId)
      .in('status', COLLECTED_STATUSES)
      .order('paid_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) return { ok: false, reason: `payment row unreadable: ${error.message}` }
    return { ok: true, disputed: String((data as Record<string, unknown> | null)?.status ?? '') === 'disputed' }
  } catch (e) {
    return { ok: false, reason: `payment row unreadable: ${(e as Error)?.message ?? 'unknown error'}` }
  }
}

/** campaign_payments row → PaidCharge. Null when the row has no PaymentIntent to act on. */
function toPaidCharge(row: Record<string, unknown>): PaidCharge | null {
  const piId = String(row.stripe_payment_intent_id ?? '')
  if (!piId) return null
  return {
    paymentIntentId: piId,
    clientId: String(row.client_id ?? ''),
    campaignId: String(row.campaign_id ?? ''),
    totalCents: Number(row.total_cents) || 0,
    subtotalCents: Number(row.subtotal_cents) || 0,
    refundedCents: Number(row.refunded_cents) || 0,
    currency: String(row.currency ?? 'usd'),
    taxTransactionId: (row.stripe_tax_transaction_id as string | null) ?? null,
    taxReversalId: (row.stripe_tax_reversal_id as string | null) ?? null,
  }
}

/**
 * The charge row for one PaymentIntent, WHATEVER its status.
 *
 * getPaidCharge deliberately refuses a refunded or disputed row, because it answers "can we send
 * money back?". This one answers a different question — "what do we have to settle now that money
 * HAS gone back?" — for a refund we did not make: one taken in the Stripe dashboard, or the bank's
 * own pull on a lost dispute. By then the row already says 'refunded'.
 */
export async function getChargeByPaymentIntent(paymentIntentId: string): Promise<PaidCharge | null> {
  if (!paymentIntentId) return null
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('campaign_payments')
      .select('*')
      .eq('stripe_payment_intent_id', paymentIntentId)
      .maybeSingle()
    if (error || !data) return null
    return toPaidCharge(data as Record<string, unknown>)
  } catch {
    return null
  }
}

/** One charge row with the piece it was written for, so we can ask "did this actually land?". */
interface LedgerRow {
  id: string
  status: string
  amountCents: number
  workOrderId: string | null
  contentDraftId: string | null
  lineItemId: string | null
}

/**
 * The delivered read, as a Result. There is no zero-shaped failure here on purpose: "0 delivered"
 * and "we could not read what was delivered" mean opposite things to a refund, and collapsing them
 * into the same shape is how a database hiccup turns into the largest refund we can send.
 */
export type DeliveredResult =
  | { ok: true; deliveredCents: number; staleIds: string[] }
  | { ok: false; reason: string }

/** What we say to the owner when the ledger cannot be read. Never a number we cannot stand behind. */
export const REFUND_UNCONFIRMED =
  'We could not confirm what was delivered, so nothing was refunded yet. Our team will settle this by hand within one business day.'

/**
 * What a campaign has actually DELIVERED, in cents, plus the ledger rows whose work did NOT land.
 *
 * A charge row is only ever written when a piece lands, so by construction every live row is
 * delivered work. But work can be un-landed afterwards (a service cancelled, a creator order
 * declined, a draft rejected on a stop), and a row left behind would make us keep money for work
 * that never arrived. So each row is checked against the thing it was written for:
 *   creator piece → the order is 'approved'
 *   team draft    → the draft published
 *   service       → the service order is 'delivered'
 * Anything else is stale, is excluded from the delivered total, and the refund voids it.
 *
 * FAILS CLOSED. Every read here — the ledger and all three lanes — must succeed. An unreadable
 * read returns ok:false and the refund is abandoned, because an unreadable read looks exactly like
 * "nothing was delivered", which is the biggest refund this module can send. Money never moves on
 * a number we could not read.
 */
export async function getDeliveredCharges(campaignId: string): Promise<DeliveredResult> {
  if (!campaignId) return { ok: false, reason: 'no campaign' }
  const admin = createAdminClient()
  let rows: LedgerRow[] = []
  try {
    const { data, error } = await admin
      .from('campaign_charges')
      .select('*')
      .eq('campaign_id', campaignId)
      .in('status', ['accrued', 'invoiced', 'paid', 'covered_by_checkout'])
    if (error) return { ok: false, reason: `charge ledger unreadable: ${error.message}` }
    rows = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      status: String(r.status ?? ''),
      amountCents: Number(r.amount_cents) || 0,
      workOrderId: (r.work_order_id as string | null) ?? null,
      contentDraftId: (r.content_draft_id as string | null) ?? null,
      lineItemId: (r.line_item_id as string | null) ?? null,
    }))
  } catch (e) {
    return { ok: false, reason: `charge ledger unreadable: ${(e as Error)?.message ?? 'unknown error'}` }
  }
  // No ledger rows is a real, readable answer: nothing has landed yet.
  if (!rows.length) return { ok: true, deliveredCents: 0, staleIds: [] }

  // Three lookups, one per lane, all scoped to this campaign. A lane that cannot be READ is not an
  // empty lane — it is an unknown lane, and an unknown lane marks every one of its rows stale,
  // which both under-counts delivered work and voids rows for work that may have really landed.
  // So a lane error aborts the whole read.
  const [orders, drafts, services] = await Promise.all([
    admin.from('creator_work_orders').select('id, status').eq('campaign_id', campaignId),
    admin.from('content_drafts').select('id, status, published_at').eq('campaign_id', campaignId),
    admin.from('service_work_orders').select('line_item_id, status').eq('campaign_id', campaignId),
  ])
  const laneError = orders.error?.message ?? drafts.error?.message ?? services.error?.message
  if (laneError) return { ok: false, reason: `delivery lanes unreadable: ${laneError}` }

  const orderOk = new Set(((orders.data ?? []) as { id: string; status: string }[])
    .filter((o) => o.status === 'approved').map((o) => o.id))
  const draftOk = new Set(((drafts.data ?? []) as { id: string; status: string; published_at: string | null }[])
    .filter((d) => d.status === 'published' || !!d.published_at).map((d) => d.id))
  const serviceOk = new Set(((services.data ?? []) as { line_item_id: string | null; status: string }[])
    .filter((s) => s.status === 'delivered' && s.line_item_id).map((s) => s.line_item_id as string))

  let deliveredCents = 0
  const staleIds: string[] = []
  for (const r of rows) {
    const landed = r.workOrderId ? orderOk.has(r.workOrderId)
      : r.contentDraftId ? draftOk.has(r.contentDraftId)
      : r.lineItemId ? serviceOk.has(r.lineItemId)
      : true   // an unanchored legacy row: trust the ledger, it was written on a delivery
    if (landed) deliveredCents += r.amountCents
    // A row already INVOICED or PAID is money that has left the ledger and gone onto a bill. Voiding
    // it would not un-send that bill, it would only make our own books disagree with it, so those
    // rows are never voided even when the work behind them was later un-landed.
    else if (r.status !== 'invoiced' && r.status !== 'paid') staleIds.push(r.id)
  }
  return { ok: true, deliveredCents, staleIds }
}

/**
 * What we owe the owner back on this campaign right now — the number the stop screen prints.
 * Pure math (refundOwedCents) over the paid charge and the delivered ledger. 0 when nothing was
 * prepaid, or when everything ordered was delivered.
 */
export async function owedRefundCents(campaignId: string): Promise<{
  /** False when the ledger could not be read. There is NO number in that case — the caller must
   *  say so and hand the settlement to a person, never fall back to "nothing was delivered". */
  ok: boolean
  owedCents: number
  deliveredCents: number
  paid: PaidCharge | null
  reason?: string
}> {
  const charge = await getPaidCharge(campaignId)
  // The charge read failed. There is no number here either — the same law as the ledger read.
  if (!charge.ok) return { ok: false, owedCents: 0, deliveredCents: 0, paid: null, reason: charge.reason }
  const paid = charge.paid
  if (!paid) return { ok: true, owedCents: 0, deliveredCents: 0, paid: null }
  const d = await getDeliveredCharges(campaignId)
  if (!d.ok) return { ok: false, owedCents: 0, deliveredCents: 0, paid, reason: d.reason }
  return { ok: true, owedCents: refundOwedCents(paid, d.deliveredCents), deliveredCents: d.deliveredCents, paid }
}

/**
 * Send money back for one campaign.
 *
 * @param campaignId  the campaign whose upfront charge is reversed
 * @param amountCents how much to send back; omitted = everything still refundable
 * @param reason      plain words, stored on the Stripe refund and said to the owner
 * @param notifyOwner default true. The stop route sets it false because its own settlement
 *                    message already carries the number — one event, one message.
 */
export async function refundCampaignPayment(opts: {
  campaignId: string
  amountCents?: number
  reason: string
  notifyOwner?: boolean
}): Promise<RefundResult> {
  const { campaignId, reason } = opts
  if (!campaignId) return NOTHING('no campaign')

  // 1. THE PAID ROW. No paid charge → no Stripe call, ever. An UNREADABLE paid row is not the same
  // thing: we do not know whether there is money to send back, so we say so and page a person
  // rather than telling the owner there is no charge.
  const charge = await getPaidCharge(campaignId)
  if (!charge.ok) {
    await pageAdmins('', 'A refund was held back', `We could not read the payment row for campaign ${campaignId} (${charge.reason}), so nothing was sent back. Settle it by hand.`, `/admin/campaign-orders?focus=${campaignId}`)
    return NOTHING(REFUND_UNCONFIRMED)
  }
  const paid = charge.paid
  if (!paid) return NOTHING('There is no card charge on this campaign to send back.')
  // A monthly-only order keyed to a SetupIntent never took money; there is nothing to refund.
  if (paid.paymentIntentId.startsWith('seti_')) return NOTHING('Nothing was charged upfront on this order.')
  if (paid.totalCents <= 0) return NOTHING('Nothing was charged upfront on this order.')

  // 2. THE LEDGER, READ ONCE, BEFORE ANY MONEY MOVES. The same read decides two things — what was
  // delivered and which rows the refund voids — so it happens here, once, and a failure stops the
  // refund instead of guessing. Guessing here means guessing "nothing was delivered", which is the
  // largest refund we can send.
  const delivered = await getDeliveredCharges(campaignId)
  if (!delivered.ok) {
    await pageAdmins(paid.clientId, 'A refund was held back', `We could not read what campaign ${campaignId} has delivered (${delivered.reason}), so nothing was sent back. Settle it by hand.`, `/admin/campaign-orders?focus=${campaignId}`)
    return NOTHING(REFUND_UNCONFIRMED)
  }

  // 3. IDEMPOTENCY, against Stripe rather than our own column: ask Stripe what it has already sent
  // back on this PaymentIntent. This is what stops a second call refunding the same money twice,
  // and it also picks up a refund an admin did by hand in the dashboard.
  let alreadyCents = paid.refundedCents
  try {
    const list = await stripe.refunds.list({ payment_intent: paid.paymentIntentId, limit: 100 })
    const stripeRefunded = list.data
      .filter((r) => r.status !== 'failed' && r.status !== 'canceled')
      .reduce((sum, r) => sum + (r.amount || 0), 0)
    alreadyCents = Math.max(alreadyCents, stripeRefunded)
  } catch (e) {
    // Stripe unreachable → we cannot prove we would not double-refund. Refuse. Fail closed.
    return NOTHING(`Could not check this charge with Stripe (${e instanceof Error ? e.message : 'unknown error'}). Nothing was sent back.`)
  }

  const bill: PaidBill = { totalCents: paid.totalCents, subtotalCents: paid.subtotalCents, refundedCents: alreadyCents }
  const stillRefundable = refundableCents(bill)
  const want = Math.min(
    stillRefundable,
    Math.max(0, Math.round(opts.amountCents ?? stillRefundable)),
  )
  if (want <= 0) {
    // Nothing left. Sync our row to Stripe's truth so the ledger stops lying about being 'paid'.
    // (stampRefund leaves refunded_at alone when nothing has actually been sent back.)
    await stampRefund(paid, alreadyCents, null)
    return {
      ok: true,
      refundedCents: 0,
      totalRefundedCents: alreadyCents,
      reason: alreadyCents > 0 ? 'This charge is already fully sent back.' : 'There is nothing to send back.',
    }
  }

  // 4. THE REFUND. Stripe first — only a confirmed refund is ever written down. The idempotency
  // key makes an identical retry (a double-tap, a re-run) return the SAME refund, not a second one.
  let refundId = ''
  let refundedNow = 0
  try {
    const refund = await stripe.refunds.create(
      {
        payment_intent: paid.paymentIntentId,
        amount: want,
        reason: 'requested_by_customer',
        metadata: { campaign_id: campaignId, client_id: paid.clientId, why: reason.slice(0, 400) },
      },
      { idempotencyKey: `refund_${campaignId}_${want}_${alreadyCents}` },
    )
    refundId = refund.id
    refundedNow = refund.amount || 0
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'refund failed'
    await notifyStaffForClient(paid.clientId, ['strategist'], {
      kind: 'payment',
      title: 'A refund did not go through',
      body: `We tried to send back $${(want / 100).toFixed(2)} on a campaign and Stripe refused (${msg}). Do it in Stripe by hand.`,
      link: `/admin/campaign-orders?focus=${campaignId}`,
    }).catch(() => ({ notified: 0 }))
    return NOTHING(`We could not send the money back (${msg}). Our team was told.`)
  }

  const totalRefunded = alreadyCents + refundedNow
  const isFull = totalRefunded >= paid.totalCents

  // 5. THE PAYMENT ROW. Best-effort: pre-254 the refund columns are absent, so the status flip
  // alone still stops isCampaignCheckoutPaid from claiming a fully refunded order is covered.
  await stampRefund(paid, totalRefunded, refundId)

  // 6-9. THE SETTLEMENT: the ledger, the production stop, the tax, the people. Shared with refunds
  // we did NOT make (see settleRefund below), because a dashboard refund has to leave the campaign
  // in the same state as one we sent ourselves.
  await settleRefund({
    paid,
    refundedNowCents: refundedNow,
    isFull,
    refundId,
    reason,
    staleIds: delivered.staleIds,
    notifyOwner: opts.notifyOwner !== false,
  })

  return { ok: true, refundedCents: refundedNow, totalRefundedCents: totalRefunded, refundId }
}

/**
 * Everything that has to happen once money HAS gone back, whoever sent it.
 *
 * refundCampaignPayment calls this after its own Stripe refund. The webhook calls it for a refund
 * we did not make — one taken by hand in the Stripe dashboard, or the bank's own pull on a lost
 * dispute — so those land the campaign in exactly the same state instead of only flipping a status
 * column and leaving the work running.
 *
 * Every step is best-effort and logged: the money is already back, and none of this may undo it.
 */
export async function settleRefund(opts: {
  paid: PaidCharge
  refundedNowCents: number
  /** The whole charge went back → the campaign is over: stop production, cancel the subscription. */
  isFull: boolean
  /** Our Stripe refund id, or null for a refund we did not make (the tax reference falls back). */
  refundId: string | null
  reason: string
  /** Charge rows for work that never landed. Omit when the ledger could not be read — we then
   *  void nothing rather than voiding on a guess. */
  staleIds?: string[]
  notifyOwner: boolean
}): Promise<void> {
  const { paid, refundedNowCents, isFull, refundId, reason } = opts
  const campaignId = paid.campaignId

  // THE LEDGER. Void the charge rows for work that never landed, so nothing we did not do can be
  // invoiced later or counted as delivered. Rows for delivered work — and rows already invoiced or
  // paid — are left exactly alone.
  await voidStaleCharges(opts.staleIds ?? [])

  // Everything that would keep charging or keep accruing. Only on a FULL refund: a partial refund
  // is a credit for one piece, not the end of the campaign, and must not quietly stop the work the
  // owner is still paying for.
  if (isFull && campaignId) {
    try {
      const { stopCampaign } = await import('./work-orders')
      await stopCampaign(campaignId)       // voids never-started creator work → no further payout accrual
    } catch (e) { console.warn('[refund] production stop failed', (e as Error)?.message) }
    try {
      const { cancelCampaignSubscriptions } = await import('./campaign-subscription-server')
      await cancelCampaignSubscriptions(campaignId)
    } catch (e) { console.warn('[refund] subscription cancel failed', (e as Error)?.message) }
  }

  // THE TAX. A committed Stripe Tax transaction is a reported sale; money going back has to go back
  // in the tax report too. Best-effort + logged: the refund itself already succeeded and must never
  // be undone by a reporting hiccup.
  await reverseTax(paid, refundedNowCents, isFull, refundId)

  // THE PEOPLE. Plain words, real numbers.
  const dollars = `$${(refundedNowCents / 100).toFixed(2)}`
  if (opts.notifyOwner) {
    await notifyClientOwners(paid.clientId, {
      kind: 'payment',
      title: `We sent back ${dollars}`,
      body: `${reason} It lands on your card in 5 to 10 days.`,
      link: campaignId ? `/dashboard/campaigns/${campaignId}` : '/dashboard/campaigns',
    }).catch(() => ({ notified: 0 }))
  }
  await pageAdmins(paid.clientId, `Refund sent: ${dollars}`, `${reason} Campaign ${campaignId || '(unlinked)'}. Refund ${refundId ?? '(taken outside the app)'}.${isFull ? ' The campaign was stopped and its monthly billing canceled.' : ''}`)
}

/**
 * The stale charge rows for a campaign, or [] when the ledger cannot be read.
 *
 * Used by the webhook, where a refund has ALREADY happened: there is no "abort" left to take, so an
 * unreadable ledger means we void nothing (and say so) instead of voiding on a guess.
 */
export async function staleChargeIds(campaignId: string): Promise<string[]> {
  if (!campaignId) return []
  const d = await getDeliveredCharges(campaignId)
  if (!d.ok) { console.warn('[refund] ledger unreadable, voided nothing:', d.reason); return [] }
  return d.staleIds
}

/**
 * True when the owner was already told about a refund on this campaign in the last `minutes`.
 *
 * The guard for the one case we cannot tell apart: before migration 254 there is no
 * stripe_refund_id column, so a refund WE sent and a refund taken in the dashboard look identical
 * to the webhook. Rather than stay silent (and never tell them about a dashboard refund) or speak
 * twice, it checks whether the message is already there.
 */
export async function refundAlreadyAnnounced(campaignId: string, minutes = 10): Promise<boolean> {
  if (!campaignId) return false
  try {
    const admin = createAdminClient()
    const since = new Date(Date.now() - minutes * 60_000).toISOString()
    const { data, error } = await admin
      .from('notifications')
      .select('id')
      .eq('type', 'payment')
      .eq('link', `/dashboard/campaigns/${campaignId}`)
      .like('title', 'We sent back %')
      .gte('created_at', since)
      .limit(1)
    if (error) return false
    return (data?.length ?? 0) > 0
  } catch {
    return false
  }
}

// ── the small, boring halves ────────────────────────────────────────────────

/**
 * Write the refund onto the payment row. Two-step by design: the status flip is the part that
 * MATTERS (it stops a refunded order counting as covered), so it is retried on its own when the
 * migration-254 columns are not there yet. Never throws.
 */
async function stampRefund(paid: PaidCharge, totalRefundedCents: number, refundId: string | null): Promise<void> {
  const admin = createAdminClient()
  const status = refundStatus(paid.totalCents, totalRefundedCents)
  const full: Record<string, unknown> = {
    status,
    refunded_cents: totalRefundedCents,
    // refunded_at is "the day money went back". Stamping it for a 0-cent sync (the already-refunded
    // / nothing-to-refund path) would date a refund that never happened, and the refunded_at index
    // is what the money reports read.
    ...(totalRefundedCents > 0 ? { refunded_at: new Date().toISOString() } : {}),
    ...(refundId ? { stripe_refund_id: refundId } : {}),
  }
  const { error } = await admin.from('campaign_payments').update(full).eq('stripe_payment_intent_id', paid.paymentIntentId)
  if (!error) return
  console.warn('[refund] refund columns missing, writing status only (apply migration 254):', error.message)
  const { error: e2 } = await admin.from('campaign_payments').update({ status }).eq('stripe_payment_intent_id', paid.paymentIntentId)
  if (e2) console.warn('[refund] payment row not updated:', e2.message)
}

/**
 * Void the ledger rows whose work never landed. Delivered rows are untouched, and so are rows
 * already invoiced or paid (the caller's read excludes them).
 *
 * Takes the ids rather than re-reading: a second read could see a different world than the one the
 * refund amount was computed from, and then we would void rows the owner was never refunded for.
 */
async function voidStaleCharges(staleIds: string[]): Promise<number> {
  try {
    if (!staleIds.length) return 0
    const admin = createAdminClient()
    // 'void' already means "never bill this" everywhere in the ledger — no second spelling.
    const { data, error } = await admin.from('campaign_charges').update({ status: 'void' }).in('id', staleIds).select('id')
    if (error) { console.warn('[refund] could not void stale charges:', error.message); return 0 }
    return data?.length ?? 0
  } catch (e) {
    console.warn('[refund] stale-charge sweep failed', (e as Error)?.message)
    return 0
  }
}

/**
 * Reverse the committed Stripe Tax transaction for the part of the sale that went back. 'full'
 * when the whole charge was refunded, 'partial' (with the flat amount, negative, as Stripe wants)
 * otherwise. Skipped only when there was no tax transaction to reverse.
 *
 * ONE REVERSAL PER REFUND. It used to skip whenever stripe_tax_reversal_id was already set, so a
 * second partial refund reversed no tax at all and the tax report kept a sale we had given back.
 * The guard against reversing the SAME refund twice is the reference, which is keyed to the refund
 * id: a retry collides with a duplicate-reference error instead of double-reversing.
 *
 * LIMITATION: the row stores one reversal id, so after several partials it holds the LATEST, not
 * all of them. Every reversal is still on the Stripe transaction itself, which is the tax record
 * that matters; our column is a pointer, not the ledger.
 */
async function reverseTax(paid: PaidCharge, refundedNow: number, isFull: boolean, refundId: string | null): Promise<void> {
  if (!paid.taxTransactionId) return
  try {
    const reversal = await stripe.tax.transactions.createReversal({
      mode: isFull ? 'full' : 'partial',
      original_transaction: paid.taxTransactionId,
      // Must be unique across all transactions; keyed to the refund so a retry collides
      // (a duplicate-reference error) instead of reversing the same tax twice.
      reference: `${paid.paymentIntentId}-rev-${refundId ?? `ext-${refundedNow}`}`,
      ...(isFull ? {} : { flat_amount: -Math.abs(refundedNow) }),
    })
    const admin = createAdminClient()
    const { error } = await admin
      .from('campaign_payments')
      .update({ stripe_tax_reversal_id: reversal.id })
      .eq('stripe_payment_intent_id', paid.paymentIntentId)
    if (error) console.warn('[refund] tax reversal id not stored (apply migration 254):', error.message)
  } catch (e) {
    // Non-critical: the money is back on the card either way. Logged so the tax report can be
    // fixed by hand.
    console.warn('[refund] Stripe Tax reversal failed for', paid.paymentIntentId, (e as Error)?.message)
  }
}

/** Page every admin. Used for refunds and for chargebacks — both are money a person must see. */
export async function pageAdmins(clientId: string, title: string, body: string, link = '/admin/campaign-orders'): Promise<void> {
  try {
    const admin = createAdminClient()
    const ids = await getAdminUserIds(admin)
    for (const userId of ids) {
      await createNotification({ userId, kind: 'payment', title, body, link })
    }
  } catch (e) {
    console.warn('[refund] admin page failed', (e as Error)?.message)
    // A last resort so the money event is never silent.
    await notifyStaffForClient(clientId, ['strategist'], { kind: 'payment', title, body, link }).catch(() => ({ notified: 0 }))
  }
}
