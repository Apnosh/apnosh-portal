import 'server-only'
/**
 * The Home banner that says last month's report is ready.
 *
 * The report itself is built on read (buildMonthlyReport runs when the page opens; nothing is
 * stored), so "does a report exist for last month?" is really "did anything happen last month
 * we can report on?". That is two cheap head counts — a Google day, or a review — over the
 * previous month. No report, no banner: the owner never gets sent to an empty page.
 *
 * The dollar figure is what they actually paid us last month (paid orders only), so the banner
 * never claims a spend that did not happen; when there is none the copy drops the number.
 */
import { createAdminClient } from '@/lib/supabase/admin'

export interface ReviewNudge {
  /** last month, e.g. 'August' */
  prevMonthLabel: string
  /** the month they are in now, e.g. 'September' */
  cycleLabel: string
  /** whole dollars paid last month; 0 when they paid nothing */
  budget: number
  href: string
}

/** Only while the month is young — after the middle of the month "new this month" is a lie. */
const NUDGE_THROUGH_DAY = 14

export async function getReviewNudge(clientId: string): Promise<ReviewNudge | null> {
  if (!clientId) return null
  const now = new Date()
  if (now.getUTCDate() > NUDGE_THROUGH_DAY) return null

  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const startIso = start.toISOString()
  const endIso = end.toISOString()

  try {
    const admin = createAdminClient()
    const [gbp, reviews, payments] = await Promise.all([
      admin.from('gbp_metrics').select('date', { count: 'exact', head: true })
        .eq('client_id', clientId).gte('date', startIso.slice(0, 10)).lt('date', endIso.slice(0, 10)),
      admin.from('reviews').select('id', { count: 'exact', head: true })
        .eq('client_id', clientId).gte('posted_at', startIso).lt('posted_at', endIso),
      admin.from('campaign_payments').select('total_cents')
        .eq('client_id', clientId).eq('status', 'paid').gte('paid_at', startIso).lt('paid_at', endIso),
    ])
    const hasData = (gbp.count ?? 0) > 0 || (reviews.count ?? 0) > 0
    if (!hasData) return null

    const cents = (payments.data ?? []).reduce((n, p) => n + (Number((p as { total_cents: number }).total_cents) || 0), 0)
    return {
      prevMonthLabel: start.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' }),
      cycleLabel: now.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' }),
      budget: Math.round(cents / 100),
      // The banner names LAST month, so the link has to open last month. Without ?m= the report
      // page defaults to the month they are in now, and "your August report" opened September.
      href: `/dashboard/insights/impact?m=${startIso.slice(0, 7)}`,
    }
  } catch (e) {
    // A missing table or a read hiccup just means no banner — never a broken Home.
    console.warn('[review-nudge] read failed', (e as Error)?.message)
    return null
  }
}
