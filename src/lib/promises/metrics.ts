import 'server-only'
/**
 * promises/metrics — take one count over one date window from the data the product already has.
 *
 * Every reader here is a plain sum over rows the syncs write (gbp_metrics, reviews, social_posts,
 * website_metrics). "Reported days" follows get-gbp-analytics: a Google day counts only when the
 * row carries any non-zero number, because the sync writes zero rows for days Google has not
 * delivered yet. A window with no reported days returns null, never 0, so the strip says
 * "counting since" instead of showing a false zero.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import type { MetricKey } from './registry'

export interface Measured {
  value: number | null
  /** how many days in the window actually carried data (Google, site) or 1 for count metrics */
  reportedDays: number
}

type Gbp = { date: string; directions: number | null; calls: number | null; website_clicks: number | null; impressions_total: number | null; search_views: number | null; food_orders: number | null }

const reported = (r: Gbp) => (r.impressions_total ?? 0) + (r.search_views ?? 0) + (r.directions ?? 0) + (r.calls ?? 0) + (r.website_clicks ?? 0) > 0

async function gbpRows(clientId: string, from: string, to: string): Promise<Gbp[]> {
  const { data } = await createAdminClient()
    .from('gbp_metrics')
    .select('date, directions, calls, website_clicks, impressions_total, search_views, food_orders')
    .eq('client_id', clientId).gte('date', from).lte('date', to).order('date')
  return ((data ?? []) as Gbp[]).filter(reported)
}

/** Sum a Google column over the reported days in [from, to]. */
async function gbpSum(clientId: string, from: string, to: string, pick: (r: Gbp) => number): Promise<Measured> {
  const rows = await gbpRows(clientId, from, to)
  if (!rows.length) return { value: null, reportedDays: 0 }
  return { value: rows.reduce((n, r) => n + pick(r), 0), reportedDays: rows.length }
}

/** Reach of the posts this campaign published, where they went (content_drafts → social_posts). */
async function postReach(clientId: string, campaignId: string | null, from: string, to: string): Promise<Measured> {
  const a = createAdminClient()
  if (!campaignId) return { value: null, reportedDays: 0 }
  const { data: drafts } = await a.from('content_drafts').select('published_post_id').eq('campaign_id', campaignId).not('published_post_id', 'is', null)
  const ids = (drafts ?? []).map((d) => (d as { published_post_id: string }).published_post_id)
  if (!ids.length) return { value: null, reportedDays: 0 }
  const { data: posts } = await a.from('social_posts').select('reach, video_views, posted_at').eq('client_id', clientId).in('id', ids).gte('posted_at', from).lte('posted_at', `${to}T23:59:59Z`)
  const rows = (posts ?? []) as { reach: number | null; video_views: number | null }[]
  if (!rows.length) return { value: null, reportedDays: 0 }
  return { value: rows.reduce((n, p) => n + Math.max(p.reach ?? 0, p.video_views ?? 0), 0), reportedDays: rows.length }
}

/** The client's usual post: mean reach of the last 10 posts before `before`. */
async function usualPost(clientId: string, before: string): Promise<Measured> {
  const { data } = await createAdminClient().from('social_posts').select('reach, video_views').eq('client_id', clientId).lt('posted_at', before).order('posted_at', { ascending: false }).limit(10)
  const rows = (data ?? []) as { reach: number | null; video_views: number | null }[]
  if (rows.length < 3) return { value: null, reportedDays: rows.length }
  const mean = rows.reduce((n, p) => n + Math.max(p.reach ?? 0, p.video_views ?? 0), 0) / rows.length
  return { value: Math.round(mean), reportedDays: rows.length }
}

async function reviewCount(clientId: string, col: 'posted_at' | 'responded_at', from: string, to: string): Promise<Measured> {
  const { count } = await createAdminClient().from('reviews').select('id', { count: 'exact', head: true }).eq('client_id', clientId).gte(col, from).lte(col, `${to}T23:59:59Z`)
  return { value: count ?? 0, reportedDays: 1 }
}

/** Cumulative Google rating of every review posted up to `to`. */
async function ratingUpTo(clientId: string, to: string): Promise<Measured> {
  const { data } = await createAdminClient().from('reviews').select('rating').eq('client_id', clientId).lte('posted_at', `${to}T23:59:59Z`)
  const rows = (data ?? []).map((r) => Number((r as { rating: number | null }).rating)).filter((n) => Number.isFinite(n) && n > 0)
  if (!rows.length) return { value: null, reportedDays: 0 }
  return { value: Math.round((rows.reduce((a, b) => a + b, 0) / rows.length) * 10) / 10, reportedDays: rows.length }
}

async function siteSessions(clientId: string, from: string, to: string): Promise<Measured> {
  try {
    const { data, error } = await createAdminClient().from('website_metrics').select('date, sessions, visitors').eq('client_id', clientId).gte('date', from).lte('date', to)
    if (error) return { value: null, reportedDays: 0 }
    const rows = ((data ?? []) as { sessions: number | null; visitors: number | null }[]).filter((r) => (r.sessions ?? r.visitors ?? 0) > 0)
    if (!rows.length) return { value: null, reportedDays: 0 }
    return { value: rows.reduce((n, r) => n + (r.sessions ?? r.visitors ?? 0), 0), reportedDays: rows.length }
  } catch { return { value: null, reportedDays: 0 } }
}

/** Has this client ever had a reported Google day? A Google promise for a client with no Google is
 *  "connect Google", never "0 so far". */
export async function hasGoogle(clientId: string): Promise<boolean> {
  const rows = await gbpRows(clientId, shiftDays(today(), -365), today())
  return rows.length > 0
}
/** Has Google ever reported a food order for this client? The column exists but most syncs never
 *  fill it; a promise on it must say "not reported" rather than print a zero. */
export async function hasFoodOrders(clientId: string): Promise<boolean> {
  const { data } = await createAdminClient().from('gbp_metrics').select('food_orders').eq('client_id', clientId).gt('food_orders', 0).limit(1)
  return !!(data && data.length)
}
/** More than one location on the client: every Google count here is both shops added together. */
export async function locationCount(clientId: string): Promise<number> {
  const { count } = await createAdminClient().from('client_locations').select('id', { count: 'exact', head: true }).eq('client_id', clientId)
  return count ?? 0
}

/** Measure one metric over [from, to] (YYYY-MM-DD, inclusive). `campaignId` scopes post_reach. */
export async function measure(clientId: string, metric: MetricKey, from: string, to: string, campaignId: string | null = null): Promise<Measured> {
  switch (metric) {
    case 'gbp_card_taps': return gbpSum(clientId, from, to, (r) => (r.directions ?? 0) + (r.calls ?? 0) + (r.website_clicks ?? 0))
    case 'gbp_impressions': return gbpSum(clientId, from, to, (r) => r.impressions_total || r.search_views || 0)
    case 'gbp_food_orders': return gbpSum(clientId, from, to, (r) => r.food_orders ?? 0)
    case 'reviews_replied': return reviewCount(clientId, 'responded_at', from, to)
    case 'reviews_new': return reviewCount(clientId, 'posted_at', from, to)
    case 'rating': return ratingUpTo(clientId, to)
    case 'post_reach': return postReach(clientId, campaignId, from, to)
    case 'ga_sessions': return siteSessions(clientId, from, to)
    case 'delivered_files': return { value: null, reportedDays: 0 }
  }
}

/** The "was N" for a metric: the same kind of count over the window before `countFrom`. For
 *  rating it is the rating the day before; for posts it is the client's usual post. */
export async function baseline(clientId: string, metric: MetricKey, countFrom: string, days: number): Promise<Measured> {
  const end = shiftDays(countFrom, -1)
  const start = shiftDays(countFrom, -days)
  if (metric === 'rating') return ratingUpTo(clientId, end)
  if (metric === 'post_reach') return usualPost(clientId, countFrom)
  if (metric === 'delivered_files') return { value: null, reportedDays: 0 }
  return measure(clientId, metric, start, end)
}

/** Baseline matched to the current window's reported days: the N reported days before countFrom. */
export async function matchedBaseline(clientId: string, metric: MetricKey, countFrom: string, reportedDays: number): Promise<Measured> {
  if (metric === 'gbp_card_taps' || metric === 'gbp_impressions' || metric === 'gbp_food_orders') {
    const rows = await gbpRows(clientId, shiftDays(countFrom, -90), shiftDays(countFrom, -1))
    const last = rows.slice(-reportedDays)
    if (!last.length) return { value: null, reportedDays: 0 }
    const pick = metric === 'gbp_card_taps' ? (r: Gbp) => (r.directions ?? 0) + (r.calls ?? 0) + (r.website_clicks ?? 0)
      : metric === 'gbp_impressions' ? (r: Gbp) => r.impressions_total || r.search_views || 0
      : (r: Gbp) => r.food_orders ?? 0
    return { value: last.reduce((n, r) => n + pick(r), 0), reportedDays: last.length }
  }
  return baseline(clientId, metric, countFrom, Math.max(reportedDays, 1))
}

export function shiftDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10)
}
export function today(): string { return new Date().toISOString().slice(0, 10) }
