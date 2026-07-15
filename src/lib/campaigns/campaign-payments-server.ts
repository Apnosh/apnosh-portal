/**
 * Reads the upfront charge-at-checkout record (campaign_payments) for the money views. When a
 * campaign was paid at checkout, its receipt + Orders row show "Paid $X" instead of the old
 * delivery-gated "$X on delivery". Server-only (service-role). Degrades to null/{} on any failure
 * (missing table, no env) so a money view never blanks.
 */
import 'server-only'
import { createClient as createAdminClient } from '@supabase/supabase-js'

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

/** The upfront payment for one campaign (latest paid row), or null. */
export async function getCampaignPayment(campaignId: string): Promise<CampaignPaymentInfo | null> {
  try {
    const { data, error } = await admin()
      .from('campaign_payments')
      .select('total_cents, subtotal_cents, service_fee_cents, tax_cents, paid_at')
      .eq('campaign_id', campaignId)
      .eq('status', 'paid')
      .order('paid_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error || !data) return null
    return toInfo(data as Record<string, unknown>)
  } catch {
    return null
  }
}

/** Upfront payments for many campaigns → { campaignId: info } (paid rows only; latest wins). */
export async function getCampaignPaymentsBatch(campaignIds: string[]): Promise<Record<string, CampaignPaymentInfo>> {
  const ids = campaignIds.filter(Boolean)
  if (!ids.length) return {}
  try {
    const { data, error } = await admin()
      .from('campaign_payments')
      .select('campaign_id, total_cents, subtotal_cents, service_fee_cents, tax_cents, paid_at')
      .in('campaign_id', ids)
      .eq('status', 'paid')
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
