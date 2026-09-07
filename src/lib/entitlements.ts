/**
 * Plan-tier entitlements. Pure + client-safe (no server-only, no imports) so it
 * can gate UI (the campaign builder, the GBP fixer) and server routes (gbp-draft,
 * the google-profile page) from the SAME rule — the client UI is never the only gate.
 *
 * PRO ENTITLEMENT = tier is 'Pro' or 'Internal'. Everything AI-lane keys off this.
 * On the server it widens: a PAYING client is Pro too (isProClient / isPayingClient below).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ClientTier } from '@/types/database'

/** True when the client's plan includes Pro features (Apnosh AI). Internal = staff/test, treated as Pro. */
export function isProTier(tier: ClientTier | string | null | undefined): boolean {
  return tier === 'Pro' || tier === 'Internal'
}

/**
 * PAYING IS PRO.
 *
 * The plan tier is set by hand on the clients row, so a business that pays us every month
 * can still read as 'Standard' and get locked out of the thing it just paid for. This is the
 * money-side rule, and it needs the database: an active subscription, or a paid order in the
 * last 90 days. It takes the Supabase client as an argument (type-only import) so this module
 * stays pure and client-safe — the UI can still import isProTier without pulling in a
 * service-role client.
 *
 * Fails CLOSED: any read error returns false, so a hiccup never hands out a paid feature.
 */
export async function isPayingClient(clientId: string, db: SupabaseClient): Promise<boolean> {
  if (!clientId) return false
  try {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString()
    const [subs, paid] = await Promise.all([
      db.from('subscriptions').select('id').eq('client_id', clientId).in('status', ['active', 'past_due']).limit(1),
      db.from('campaign_payments').select('id').eq('client_id', clientId).eq('status', 'paid').gte('paid_at', ninetyDaysAgo).limit(1),
    ])
    return (subs.data?.length ?? 0) > 0 || (paid.data?.length ?? 0) > 0
  } catch {
    return false
  }
}

/** The one gate for anything Pro on the server: the plan tier says Pro, OR the client is paying. */
export async function isProClient(clientId: string, tier: ClientTier | string | null | undefined, db: SupabaseClient): Promise<boolean> {
  if (isProTier(tier)) return true
  return isPayingClient(clientId, db)
}
