import 'server-only'
/**
 * The money side of the Pro gate. Server only — it reads the database with the caller's
 * Supabase client, so it must never be pulled into a bundle by a client component. The pure
 * tier rule (isProTier) stays in ./entitlements, which the UI imports.
 *
 * WHAT COUNTS AS PAYING: an active subscription, or an order that is status 'paid', HAS a
 * paid_at, and is not disputed. status alone was the old rule and it is not enough — a
 * refunded order keeps its row (status goes to 'refunded' / 'partially_refunded'), and a
 * chargeback stamps disputed_at while the status stays 'paid'. Money in, not money touched.
 *
 * disputed_at arrives with migration 254; until an owner runs it the column is missing and
 * Postgres answers 42703. We retry once without that filter rather than fail — the rest of
 * the rule still holds, and the alternative is locking every paying client out.
 *
 * Fails CLOSED: any other read error returns false, so a hiccup never hands out a paid feature.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ClientTier } from '@/types/database'
import { isProTier } from '@/lib/entitlements'

type Answer = { data: unknown[] | null; error: { code?: string; message: string } | null }

/** Run a campaign_payments read, once with the disputed_at filter and once without if it is missing. */
async function withDisputeGuard(build: (excludeDisputed: boolean) => PromiseLike<Answer>): Promise<unknown[]> {
  const first = await build(true)
  if (!first.error) return first.data ?? []
  if (first.error.code !== '42703') throw new Error(first.error.message)
  const second = await build(false)
  if (second.error) throw new Error(second.error.message)
  return second.data ?? []
}

/** Orders that are real money we kept, in [fromIso, toIso). Empty on any read trouble is the caller's job. */
export function paidOrders(
  db: SupabaseClient,
  clientId: string,
  columns: string,
  fromIso: string,
  toIso?: string,
  limit?: number,
): Promise<unknown[]> {
  return withDisputeGuard((excludeDisputed) => {
    let q = db
      .from('campaign_payments')
      .select(columns)
      .eq('client_id', clientId)
      .eq('status', 'paid')
      .not('paid_at', 'is', null)
      .gte('paid_at', fromIso)
    if (toIso) q = q.lt('paid_at', toIso)
    if (excludeDisputed) q = q.is('disputed_at', null)
    if (limit) q = q.limit(limit)
    return q as unknown as PromiseLike<Answer>
  })
}

/**
 * PAYING IS PRO.
 *
 * The plan tier is set by hand on the clients row, so a business that pays us every month can
 * still read as 'Standard' and get locked out of the thing it just paid for. This is the
 * money-side rule: an active subscription, or a kept payment in the last 90 days.
 */
export async function isPayingClient(clientId: string, db: SupabaseClient): Promise<boolean> {
  if (!clientId) return false
  try {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString()
    const [subs, paid] = await Promise.all([
      db.from('subscriptions').select('id').eq('client_id', clientId).in('status', ['active', 'past_due']).limit(1),
      paidOrders(db, clientId, 'id', ninetyDaysAgo, undefined, 1),
    ])
    return (subs.data?.length ?? 0) > 0 || paid.length > 0
  } catch {
    return false
  }
}

/** The one gate for anything Pro on the server: the plan tier says Pro, OR the client is paying. */
export async function isProClient(clientId: string, tier: ClientTier | string | null | undefined, db: SupabaseClient): Promise<boolean> {
  if (isProTier(tier)) return true
  return isPayingClient(clientId, db)
}
