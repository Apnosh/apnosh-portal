'use server'

/**
 * Advanced analytics data — the per-source, platform-first read that backs
 * the <AdvancedAnalytics> view (src/components/dashboard/advanced-analytics).
 *
 * Where get-home-metrics blends every channel into one number per tier,
 * this keeps each PLATFORM as its own series so the owner sees exactly
 * where a number came from (Google vs Instagram vs OpenTable, etc.).
 *
 * Honest-blank principle (same as the home hero):
 *   - A platform we actually ingest (Google Business Profile today) shows
 *     real per-day numbers.
 *   - A platform that isn't wired yet is returned with connected:false so
 *     the view renders "—" + "Not connected" rather than a fake zero.
 *
 * Reality as of this writing: only Google Business Profile (gbp_metrics)
 * and Google reviews (reviews + local_reviews) flow daily. Instagram,
 * Facebook, TikTok, OpenTable, Resy, DoorDash, Uber Eats, email, SMS,
 * Yelp and TripAdvisor are listed but marked not-connected until their
 * ingest lands — at which point we just fill their series here.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type { AdvMetric, AdvPeriod, AdvSource } from '@/components/dashboard/advanced-analytics'

export interface AdvancedMetrics { metrics: AdvMetric[] }

const DAY = 86400000
const BOUND_DAYS = 800
const SETTLE_GBP = 2 // Google's typical reporting lag, in days
const num = (v: unknown): number => Number(v ?? 0)

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const ymd = (d: Date): string => {
  const y = d.getFullYear(), m = `${d.getMonth() + 1}`.padStart(2, '0'), day = `${d.getDate()}`.padStart(2, '0')
  return `${y}-${m}-${day}`
}
const sod = (d: Date): Date => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
const dim = (y: number, m: number): number => new Date(y, m + 1, 0).getDate()
const fmtDay = (d: Date): string => `${MON[d.getMonth()]} ${d.getDate()}`

type Maps = Map<string, number>

const addInto = (...maps: Maps[]): Maps => {
  const out: Maps = new Map()
  for (const m of maps) for (const [k, v] of m) out.set(k, (out.get(k) ?? 0) + v)
  return out
}

function earliestOf(map: Maps): Date | null {
  let min: string | null = null
  for (const k of map.keys()) if (min === null || k < min) min = k
  return min ? sod(new Date(min + 'T00:00:00')) : null
}

/* Reliable frontier: anchor on the last day with real data (never trailing
   zeros), capped at today - settle so a partial recent day never reads as a
   drop. Mirrors get-home-metrics' frontierFor. */
function frontierOf(map: Maps, today: Date, settle: number): Date {
  const cutoff = sod(new Date(today.getTime() - settle * DAY))
  let last: string | null = null
  for (const [k, v] of map.entries()) if (v > 0 && (last === null || k > last)) last = k
  if (!last) {
    for (const k of map.keys()) if (last === null || k > last) last = k
  }
  if (!last) return cutoff
  const lastD = sod(new Date(last + 'T00:00:00'))
  return lastD.getTime() < cutoff.getTime() ? lastD : cutoff
}

const inWin = (d: Date, earliest: Date | null, front: Date): boolean =>
  !!earliest && d >= earliest && d <= front

const nulls = (n: number): (number | null)[] => Array.from({ length: n }, () => null)

function dailySeries(map: Maps, start: Date, n: number, earliest: Date | null, front: Date): (number | null)[] {
  return Array.from({ length: n }, (_, i) => {
    const d = sod(new Date(start.getTime() + i * DAY))
    return inWin(d, earliest, front) ? (map.get(ymd(d)) ?? 0) : null
  })
}

function monthlySeries(map: Maps, y: number, earliest: Date | null, front: Date, today: Date): (number | null)[] {
  return Array.from({ length: 12 }, (_, mo) => {
    const first = sod(new Date(y, mo, 1))
    if (first > today) return null
    let s = 0, has = false
    const days = dim(y, mo)
    for (let d = 0; d < days; d++) {
      const day = sod(new Date(y, mo, d + 1))
      if (inWin(day, earliest, front)) { s += map.get(ymd(day)) ?? 0; has = true }
    }
    return has ? s : null
  })
}

const ticksFor = (range: 'week' | 'month' | 'year', n: number): string[] => {
  if (range === 'week') return DOW
  if (range === 'year') return MON
  return Array.from({ length: n }, (_, i) => (i % 6 === 0 ? `${i + 1}` : ''))
}

/* How many past periods the mini trend line trails back through, per range. */
const WK_BACK = 8, MO_BACK = 6, YR_BACK = 3
const yr2 = (y: number): string => `'${`${y}`.slice(2)}`

type Trail = { vals: (number | null)[]; ticks: string[] }

/* Trailing per-period totals (oldest → newest, last entry = current period),
   each summed over the reliable window. Powers the home-style trend line. */
function trailWeekly(map: Maps, today: Date, earliest: Date | null, front: Date): Trail {
  const dow = today.getDay()
  const thisSun = sod(new Date(today.getTime() - dow * DAY))
  const vals: (number | null)[] = [], ticks: string[] = []
  for (let w = WK_BACK - 1; w >= 0; w--) {
    const sun = sod(new Date(thisSun.getTime() - w * 7 * DAY))
    let s = 0, has = false
    for (let d = 0; d < 7; d++) {
      const day = sod(new Date(sun.getTime() + d * DAY))
      if (inWin(day, earliest, front)) { s += map.get(ymd(day)) ?? 0; has = true }
    }
    vals.push(has ? s : null); ticks.push(fmtDay(sun))
  }
  return { vals, ticks }
}

function trailMonthly(map: Maps, today: Date, earliest: Date | null, front: Date): Trail {
  const vals: (number | null)[] = [], ticks: string[] = []
  for (let b = MO_BACK - 1; b >= 0; b--) {
    const first = sod(new Date(today.getFullYear(), today.getMonth() - b, 1))
    const y = first.getFullYear(), m = first.getMonth(), days = dim(y, m)
    let s = 0, has = false
    for (let d = 0; d < days; d++) {
      const day = sod(new Date(y, m, d + 1))
      if (inWin(day, earliest, front)) { s += map.get(ymd(day)) ?? 0; has = true }
    }
    vals.push(has ? s : null); ticks.push(MON[m] + (m === 0 ? ` ${yr2(y)}` : ''))
  }
  return { vals, ticks }
}

function trailYearly(map: Maps, today: Date, earliest: Date | null, front: Date): Trail {
  const vals: (number | null)[] = [], ticks: string[] = []
  for (let b = YR_BACK - 1; b >= 0; b--) {
    const y = today.getFullYear() - b
    let s = 0, has = false
    for (let mo = 0; mo < 12; mo++) {
      const days = dim(y, mo)
      for (let d = 0; d < days; d++) {
        const day = sod(new Date(y, mo, d + 1))
        if (inWin(day, earliest, front)) { s += map.get(ymd(day)) ?? 0; has = true }
      }
    }
    vals.push(has ? s : null); ticks.push(`${y}`)
  }
  return { vals, ticks }
}

/* A platform column in the order it should appear. `google: true` marks the
   one we fill with real numbers; everything else returns not-connected. */
interface Plat { key: string; label: string; icon: string; google?: boolean }

/* ── Count metric (Reach / Engagement / Interactions / Bookings / Loyalty) ── */
function countMetric(
  key: string, label: string, sub: string, plats: Plat[], map: Maps, today: Date,
): AdvMetric {
  const earliest = earliestOf(map)
  const front = frontierOf(map, today, SETTLE_GBP)
  const connected = map.size > 0

  const buildSources = (
    n: number, gVals: (number | null)[], gPrev: (number | null)[], gTrend: (number | null)[],
  ): AdvSource[] =>
    plats.map(p => {
      if (p.google && connected) {
        return { key: p.key, label: p.label, icon: p.icon, vals: gVals, prev: gPrev, trendVals: gTrend }
      }
      return { key: p.key, label: p.label, icon: p.icon, vals: nulls(n), prev: nulls(n), trendVals: nulls(gTrend.length), connected: false }
    })

  const wkTrail = trailWeekly(map, today, earliest, front)
  const moTrail = trailMonthly(map, today, earliest, front)
  const yrTrail = trailYearly(map, today, earliest, front)

  // Week — this week's days (Sun–Sat) vs last week
  const dow = today.getDay()
  const thisSun = sod(new Date(today.getTime() - dow * DAY))
  const lastSun = sod(new Date(thisSun.getTime() - 7 * DAY))
  const week: AdvPeriod = {
    cap: `This week · ${fmtDay(thisSun)} – ${fmtDay(sod(new Date(thisSun.getTime() + 6 * DAY)))}`,
    ticks: ticksFor('week', 7),
    trendTicks: wkTrail.ticks,
    sources: buildSources(7,
      dailySeries(map, thisSun, 7, earliest, front),
      dailySeries(map, lastSun, 7, earliest, front),
      wkTrail.vals),
  }

  // Month — this month's days vs last month
  const my = today.getFullYear(), mm = today.getMonth()
  const mFirst = sod(new Date(my, mm, 1)), mN = dim(my, mm)
  const pFirst = sod(new Date(my, mm - 1, 1)), pN = dim(pFirst.getFullYear(), pFirst.getMonth())
  const month: AdvPeriod = {
    cap: `This month · ${MON[mm]} 1 – ${mN}`,
    ticks: ticksFor('month', mN),
    trendTicks: moTrail.ticks,
    sources: buildSources(mN,
      dailySeries(map, mFirst, mN, earliest, front),
      dailySeries(map, pFirst, pN, earliest, front),
      moTrail.vals),
  }

  // Year — this year's months vs last year
  const yy = today.getFullYear()
  const year: AdvPeriod = {
    cap: `This year · Jan – ${MON[today.getMonth()]}`,
    ticks: ticksFor('year', 12),
    trendTicks: yrTrail.ticks,
    sources: buildSources(12,
      monthlySeries(map, yy, earliest, front, today),
      monthlySeries(map, yy - 1, earliest, front, today),
      yrTrail.vals),
  }

  return { key, label, sub, week, month, year }
}

/* ── Rating metric (Reputation) — average score headline + review counts ── */
function ratingMetric(
  plats: Plat[], count: Maps, ratingSum: Maps, today: Date,
): AdvMetric {
  const earliest = earliestOf(count)
  const front = today // reviews settle immediately
  const connected = count.size > 0

  const avgOver = (start: Date, n: number): number => {
    let c = 0, s = 0
    for (let i = 0; i < n; i++) {
      const d = sod(new Date(start.getTime() + i * DAY))
      if (inWin(d, earliest, front)) { c += count.get(ymd(d)) ?? 0; s += ratingSum.get(ymd(d)) ?? 0 }
    }
    return c > 0 ? Math.round((s / c) * 10) / 10 : 0
  }
  const avgYear = (y: number): number => {
    let c = 0, s = 0
    for (let mo = 0; mo < 12; mo++) {
      const days = dim(y, mo)
      for (let d = 0; d < days; d++) {
        const day = sod(new Date(y, mo, d + 1))
        if (inWin(day, earliest, front)) { c += count.get(ymd(day)) ?? 0; s += ratingSum.get(ymd(day)) ?? 0 }
      }
    }
    return c > 0 ? Math.round((s / c) * 10) / 10 : 0
  }

  const buildSources = (n: number, gVals: (number | null)[], gPrev: (number | null)[]): AdvSource[] =>
    plats.map(p => {
      if (p.google && connected) return { key: p.key, label: p.label, icon: p.icon, vals: gVals, prev: gPrev }
      return { key: p.key, label: p.label, icon: p.icon, vals: nulls(n), prev: nulls(n), connected: false }
    })

  const dow = today.getDay()
  const thisSun = sod(new Date(today.getTime() - dow * DAY))
  const lastSun = sod(new Date(thisSun.getTime() - 7 * DAY))
  const week: AdvPeriod = {
    cap: `This week · ${fmtDay(thisSun)} – ${fmtDay(sod(new Date(thisSun.getTime() + 6 * DAY)))}`,
    ticks: ticksFor('week', 7), rating: avgOver(thisSun, 7), ratingPrev: avgOver(lastSun, 7),
    sources: buildSources(7,
      dailySeries(count, thisSun, 7, earliest, front),
      dailySeries(count, lastSun, 7, earliest, front)),
  }

  const my = today.getFullYear(), mm = today.getMonth()
  const mFirst = sod(new Date(my, mm, 1)), mN = dim(my, mm)
  const pFirst = sod(new Date(my, mm - 1, 1)), pN = dim(pFirst.getFullYear(), pFirst.getMonth())
  const month: AdvPeriod = {
    cap: `This month · ${MON[mm]} 1 – ${mN}`,
    ticks: ticksFor('month', mN), rating: avgOver(mFirst, mN), ratingPrev: avgOver(pFirst, pN),
    sources: buildSources(mN,
      dailySeries(count, mFirst, mN, earliest, front),
      dailySeries(count, pFirst, pN, earliest, front)),
  }

  const yy = today.getFullYear()
  const year: AdvPeriod = {
    cap: `This year · Jan – ${MON[today.getMonth()]}`,
    ticks: ticksFor('year', 12), rating: avgYear(yy), ratingPrev: avgYear(yy - 1),
    sources: buildSources(12,
      monthlySeries(count, yy, earliest, front, today),
      monthlySeries(count, yy - 1, earliest, front, today)),
  }

  return { key: 'reputation', label: 'Reputation', sub: 'Average rating and where reviews come from', kind: 'rating', week, month, year }
}

const EMPTY: AdvancedMetrics = { metrics: [] }

export async function getAdvancedMetrics(clientId: string): Promise<AdvancedMetrics> {
  try {
    return await load(clientId)
  } catch (err) {
    console.error('[getAdvancedMetrics] failed', err)
    return EMPTY
  }
}

async function load(clientId: string): Promise<AdvancedMetrics> {
  const admin = createAdminClient()
  const today = sod(new Date())
  const bound = ymd(new Date(today.getTime() - BOUND_DAYS * DAY))

  const [gbp, reviews, localReviews] = await Promise.all([
    admin.from('gbp_metrics')
      .select('date, directions, calls, website_clicks, bookings, search_views, impressions_total, conversations, food_orders, food_menu_clicks')
      .eq('client_id', clientId).gte('date', bound).order('date', { ascending: true }),
    admin.from('reviews')
      .select('rating, posted_at')
      .eq('client_id', clientId).gte('posted_at', bound + 'T00:00:00'),
    admin.from('local_reviews')
      .select('rating, created_at_platform')
      .eq('client_id', clientId).gte('created_at_platform', bound + 'T00:00:00'),
  ])

  // Google Business Profile — one map per underlying signal.
  const gImpr: Maps = new Map()
  const gDir: Maps = new Map(), gCall: Maps = new Map(), gClick: Maps = new Map()
  const gConv: Maps = new Map(), gMenu: Maps = new Map()
  const gBook: Maps = new Map(), gFood: Maps = new Map()
  for (const r of (gbp.data ?? []) as Record<string, unknown>[]) {
    const d = String(r.date).slice(0, 10)
    const views = num(r.impressions_total) || num(r.search_views)
    gImpr.set(d, (gImpr.get(d) ?? 0) + views)
    gDir.set(d, (gDir.get(d) ?? 0) + num(r.directions))
    gCall.set(d, (gCall.get(d) ?? 0) + num(r.calls))
    gClick.set(d, (gClick.get(d) ?? 0) + num(r.website_clicks))
    gConv.set(d, (gConv.get(d) ?? 0) + num(r.conversations))
    gMenu.set(d, (gMenu.get(d) ?? 0) + num(r.food_menu_clicks))
    gBook.set(d, (gBook.get(d) ?? 0) + num(r.bookings))
    gFood.set(d, (gFood.get(d) ?? 0) + num(r.food_orders))
  }

  // Google reviews — count + rating sum per day (reviews + local_reviews).
  const repCount: Maps = new Map(), repSum: Maps = new Map()
  for (const r of (reviews.data ?? []) as Record<string, unknown>[]) {
    if (!r.posted_at) continue
    const d = String(r.posted_at).slice(0, 10)
    repCount.set(d, (repCount.get(d) ?? 0) + 1)
    repSum.set(d, (repSum.get(d) ?? 0) + num(r.rating))
  }
  for (const r of (localReviews.data ?? []) as Record<string, unknown>[]) {
    if (!r.created_at_platform) continue
    const d = String(r.created_at_platform).slice(0, 10)
    repCount.set(d, (repCount.get(d) ?? 0) + 1)
    repSum.set(d, (repSum.get(d) ?? 0) + num(r.rating))
  }

  // Google contribution per metric.
  const reachMap = gImpr
  const interMap = addInto(gDir, gCall, gClick, gConv, gMenu)
  const bookMap = addInto(gBook, gFood)

  const G = (extra?: Partial<Plat>): Plat => ({ key: 'google', label: 'Google', icon: 'pin', google: true, ...extra })

  const metrics: AdvMetric[] = [
    countMetric('reach', 'Reach', 'Who saw you, across platforms',
      [{ key: 'instagram', label: 'Instagram', icon: 'instagram' }, { key: 'facebook', label: 'Facebook', icon: 'facebook' },
       G(), { key: 'tiktok', label: 'TikTok', icon: 'tiktok' }], reachMap, today),

    countMetric('engagement', 'Engagement', 'Who reacted to your posts. Likes, comments, shares, saves',
      [{ key: 'instagram', label: 'Instagram', icon: 'instagram' }, { key: 'facebook', label: 'Facebook', icon: 'facebook' },
       { key: 'tiktok', label: 'TikTok', icon: 'tiktok' }], new Map(), today),

    countMetric('interactions', 'Interactions', 'Who took a step toward you. Calls, directions, clicks, taps',
      [G(), { key: 'instagram', label: 'Instagram', icon: 'instagram' }, { key: 'facebook', label: 'Facebook', icon: 'facebook' },
       { key: 'website', label: 'Website', icon: 'globe' }, { key: 'tiktok', label: 'TikTok', icon: 'tiktok' }], interMap, today),

    countMetric('bookings', 'Bookings & orders', 'Tables booked and orders placed, by platform',
      [G(), { key: 'opentable', label: 'OpenTable', icon: 'calendar' }, { key: 'resy', label: 'Resy', icon: 'clock' },
       { key: 'doordash', label: 'DoorDash', icon: 'bag' }, { key: 'ubereats', label: 'Uber Eats', icon: 'bag' },
       { key: 'direct', label: 'Direct (site)', icon: 'globe' }], bookMap, today),

    countMetric('loyalty', 'Loyalty', 'Regulars you bring back, by channel',
      [{ key: 'email', label: 'Email', icon: 'message' }, { key: 'sms', label: 'SMS', icon: 'phone' }], new Map(), today),

    ratingMetric(
      [G(), { key: 'yelp', label: 'Yelp', icon: 'star' }, { key: 'facebook', label: 'Facebook', icon: 'facebook' },
       { key: 'tripadvisor', label: 'TripAdvisor', icon: 'eye' }], repCount, repSum, today),
  ]

  return { metrics }
}
