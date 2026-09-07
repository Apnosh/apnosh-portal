/**
 * Reads the upfront charge-at-checkout record (campaign_payments) for the money views. When a
 * campaign was paid at checkout, its receipt + Orders row show "Paid $X" instead of the old
 * delivery-gated "$X on delivery". Server-only (service-role). Degrades to null/{} on any failure
 * (missing table, no env) so a money view never blanks.
 */
import 'server-only'
import { createClient as createAdminClient } from '@supabase/supabase-js'

/**
 * The statuses that mean MONEY WAS COLLECTED and the campaign is still running.
 *
 * 'paid'               — nothing has gone back.
 * 'partially_refunded' — some went back (one piece credited); the rest of the order stands and the
 *                        work continues, so the checkout still covers it. Reading only 'paid' here
 *                        meant a $1 credit hid the whole receipt and made every piece delivered
 *                        afterwards accrue as invoiceable — a second bill for work already paid for.
 * 'disputed'           — the bank is holding the money while it decides. The charge is real until
 *                        the dispute closes; a chargeback must not silently re-bill the owner.
 *
 * 'refunded' (in full) is deliberately NOT here: a full refund only ever happens with the campaign
 * stopped, so there is nothing left to cover.
 */
export const COLLECTED_STATUSES = ['paid', 'partially_refunded', 'disputed'] as const

/**
 * Collected money that is also UNCONTESTED: the charge is ours to give back. Used where the
 * question is "can we still refund against this?" — a disputed charge is excluded because the bank
 * has already pulled the money and refunding it again would send it twice.
 */
export const SETTLED_STATUSES = ['paid', 'partially_refunded'] as const

export interface CampaignPaymentInfo {
  totalCents: number
  subtotalCents: number
  serviceFeeCents: number
  taxCents: number
  paidAt: string | null
}

function admin() {
  return createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

function toInfo(row: Record<string, unknown>): CampaignPaymentInfo {
  return {
    totalCents: Number(row.total_cents) || 0,
    subtotalCents: Number(row.subtotal_cents) || 0,
    serviceFeeCents: Number(row.service_fee_cents) || 0,
    taxCents: Number(row.tax_cents) || 0,
    paidAt: (row.paid_at as string | null) ?? null,
  }
}

/** The upfront payment for one campaign (latest COLLECTED row), or null. This is the RECEIPT: a
 *  partly refunded or disputed order still has one, and hiding it is how an owner loses the record
 *  of a charge that is still on their card. */
export async function getCampaignPayment(campaignId: string): Promise<CampaignPaymentInfo | null> {
  try {
    const { data, error } = await admin()
      .from('campaign_payments')
      .select('total_cents, subtotal_cents, service_fee_cents, tax_cents, paid_at')
      .eq('campaign_id', campaignId)
      .in('status', COLLECTED_STATUSES)
      .order('paid_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error || !data) return null
    return toInfo(data as Record<string, unknown>)
  } catch {
    return null
  }
}

/**
 * True when this campaign's checkout money was COLLECTED (see COLLECTED_STATUSES).
 * The G1 gate: when true, the per-piece accrual records its charge as 'covered_by_checkout'
 * instead of 'accrued', so the invoicing path can never bill the same work a second time.
 * Degrades to FALSE on any failure (missing table pre-215, no env) — a read hiccup must never
 * flip a checkout-paid campaign back into the invoiceable-accrual path.
 */
export async function isCampaignCheckoutPaid(campaignId: string): Promise<boolean> {
  if (!campaignId) return false
  try {
    const { data, error } = await admin()
      .from('campaign_payments')
      .select('id')
      .eq('campaign_id', campaignId)
      .in('status', COLLECTED_STATUSES)
      .limit(1)
    if (error || !data) return false
    return data.length > 0
  } catch {
    return false
  }
}

/** Upfront payments for many campaigns → { campaignId: info } (collected rows only; latest wins). */
export async function getCampaignPaymentsBatch(campaignIds: string[]): Promise<Record<string, CampaignPaymentInfo>> {
  const ids = campaignIds.filter(Boolean)
  if (!ids.length) return {}
  try {
    const { data, error } = await admin()
      .from('campaign_payments')
      .select('campaign_id, total_cents, subtotal_cents, service_fee_cents, tax_cents, paid_at')
      .in('campaign_id', ids)
      .in('status', COLLECTED_STATUSES)
      .order('paid_at', { ascending: false })
    if (error || !data) return {}
    const map: Record<string, CampaignPaymentInfo> = {}
    for (const row of data as Record<string, unknown>[]) {
      const cid = row.campaign_id as string
      if (cid && !map[cid]) map[cid] = toInfo(row) // ordered desc → first seen is latest
    }
    return map
  } catch {
    return {}
  }
}
