'use server'

/**
 * Calendar metric history for the mobile home hero.
 *
 * Unlike get-metric-history.ts (Robinhood-style rolling ranges), this
 * powers the redesigned hero: a Week / Month / Year selector backed by
 * real calendar periods, each rendered as a bar chart with a trend
 * mini-graph and per-period breakdown cards.
 *
 * For each metric we return, per range, an array of "instances"
 * (a specific week / month / year). Each instance carries:
 *   - vals:      the metric per sub-period (day or month), null when the
 *                sub-period is outside the data window (before onboarding
 *                or in the future) so the chart shows honest blanks.
 *   - total:     sum of the period (count of reviews for reputation).
 *   - rating:    reputation only — average rating over the period.
 *   - breakdown: the 4 stat cards for that exact period.
 *
 * Metrics:
 *   customers  — GBP actions (directions + calls + website clicks + bookings)
 *   reputation — reviews received per day + average rating (rate metric)
 *   reach      — social reach per day
 */

import { createAdminClient } from '@/lib/supabase/admin'

export type HomeSub = 'day' | 'month'
export type HomeFmt = 'num' | 'rate'

export interface HomeBreakdownItem { label: string; value: string; icon: string }

export interface HomeInstance {
  vals: (number | null)[]
  start: string // ISO date (yyyy-mm-dd) of the first sub-period
  sub: HomeSub
  total: number
  rating: number | null
  breakdown: HomeBreakdownItem[]
}

export interface HomeMetric {
  key: 'customers' | 'reputation' | 'reach'
  label: string
  sub: string
  fmt: HomeFmt
  hasData: boolean
  week: HomeInstance[]
  month: HomeInstance[]
  year: HomeInstance[]
}

export interface HomeMetrics { metrics: HomeMetric[] }

const DAY = 86400000
const BOUND_DAYS = 1100 // ~3 years; bounds the year view + its history
const num = (v: unknown): number => Number(v ?? 0)
const ymd = (d: Date): string => {
  const y = d.getFullYear(), m = `${d.getMonth() + 1}`.padStart(2, '0'), day = `${d.getDate()}`.padStart(2, '0')
  return `${y}-${m}-${day}`
}
const startOfDay = (d: Date): Date => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
const daysInMonth = (y: number, m: number): number => new Date(y, m + 1, 0).getDate()

function fmtCompact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'k'
  return Math.round(n).toLocaleString()
}

type Maps = Map<string, number>
interface CompDef { label: string; icon: string; map: Maps }
interface RateMaps { count: Maps; ratingSum: Maps; replied: Maps; five: Maps }

const sumOver = (map: Maps, days: Date[]): number =>
  days.reduce((s, d) => s + (map.get(ymd(d)) ?? 0), 0)

interface BuildCfg {
  key: HomeMetric['key']
  label: string
  sub: string
  fmt: HomeFmt
  comps?: CompDef[]      // num metrics
  rate?: RateMaps        // rate metric (reputation)
  mainMap: Maps          // value per day (counts per day for reputation)
}

function buildMetric(cfg: BuildCfg, today: Date, earliest: Date | null): HomeMetric {
  const base: HomeMetric = {
    key: cfg.key, label: cfg.label, sub: cfg.sub, fmt: cfg.fmt,
    hasData: !!earliest, week: [], month: [], year: [],
  }
  if (!earliest) return base
  const earliestDay = startOfDay(earliest)

  const dayVal = (d: Date): number => cfg.mainMap.get(ymd(d)) ?? 0
  const inWindow = (d: Date): boolean => d <= today && d >= earliestDay

  const makeInst = (vals: (number | null)[], start: string, sub: HomeSub, inDays: Date[]): HomeInstance => {
    const total = vals.reduce<number>((s, v) => s + (v ?? 0), 0)
    let rating: number | null = null
    let breakdown: HomeBreakdownItem[]
    if (cfg.rate) {
      const count = total
      rating = count > 0 ? Math.round((sumOver(cfg.rate.ratingSum, inDays) / count) * 10) / 10 : null
      const replied = sumOver(cfg.rate.replied, inDays)
      const five = sumOver(cfg.rate.five, inDays)
      breakdown = [
        { label: 'New reviews', value: fmtCompact(count), icon: 'message' },
        { label: 'Rating', value: rating != null ? rating.toFixed(1) + '★' : '—', icon: 'star' },
        { label: 'Replied', value: count > 0 ? Math.round((replied / count) * 100) + '%' : '—', icon: 'reply' },
        { label: '5-star', value: fmtCompact(five), icon: 'star' },
      ]
    } else {
      breakdown = (cfg.comps ?? []).map(c => ({ label: c.label, value: fmtCompact(sumOver(c.map, inDays)), icon: c.icon }))
    }
    return { vals, start, sub, total, rating, breakdown }
  }

  /* ── Week: up to 8 weeks of daily bars (Sun–Sat) ── */
  const dow = today.getDay()
  const thisSun = startOfDay(new Date(today.getTime() - dow * DAY))
  const earliestSun = startOfDay(new Date(earliestDay.getTime() - earliestDay.getDay() * DAY))
  const weeksAvail = Math.min(8, Math.max(1, Math.round((thisSun.getTime() - earliestSun.getTime()) / (7 * DAY)) + 1))
  for (let w = weeksAvail - 1; w >= 0; w--) {
    const sun = new Date(thisSun.getTime() - w * 7 * DAY)
    const vals: (number | null)[] = [], inDays: Date[] = []
    for (let d = 0; d < 7; d++) {
      const day = startOfDay(new Date(sun.getTime() + d * DAY))
      if (inWindow(day)) { vals.push(dayVal(day)); inDays.push(day) } else vals.push(null)
    }
    base.week.push(makeInst(vals, ymd(sun), 'day', inDays))
  }

  /* ── Month: up to 12 months of daily bars ── */
  const monIdx = (d: Date) => d.getFullYear() * 12 + d.getMonth()
  const monthsAvail = Math.min(12, Math.max(1, monIdx(today) - monIdx(earliestDay) + 1))
  for (let k = monthsAvail - 1; k >= 0; k--) {
    const first = new Date(today.getFullYear(), today.getMonth() - k, 1)
    const dim = daysInMonth(first.getFullYear(), first.getMonth())
    const vals: (number | null)[] = [], inDays: Date[] = []
    for (let d = 0; d < dim; d++) {
      const day = startOfDay(new Date(first.getFullYear(), first.getMonth(), d + 1))
      if (inWindow(day)) { vals.push(dayVal(day)); inDays.push(day) } else vals.push(null)
    }
    base.month.push(makeInst(vals, ymd(first), 'day', inDays))
  }

  /* ── Year: up to 5 years of monthly bars ── */
  const yearsAvail = Math.min(5, Math.max(1, today.getFullYear() - earliestDay.getFullYear() + 1))
  for (let k = yearsAvail - 1; k >= 0; k--) {
    const y = today.getFullYear() - k
    const vals: (number | null)[] = [], inDays: Date[] = []
    for (let mo = 0; mo < 12; mo++) {
      const first = startOfDay(new Date(y, mo, 1))
      if (first > today) { vals.push(null); continue }
      const dim = daysInMonth(y, mo)
      let monthSum = 0; let has = false
      for (let d = 0; d < dim; d++) {
        const day = startOfDay(new Date(y, mo, d + 1))
        if (inWindow(day)) { monthSum += dayVal(day); inDays.push(day); has = true }
      }
      vals.push(has ? monthSum : null)
    }
    base.year.push(makeInst(vals, ymd(new Date(y, 0, 1)), 'month', inDays))
  }

  return base
}

function earliestOf(maps: Maps): Date | null {
  let min: string | null = null
  for (const k of maps.keys()) { if (min === null || k < min) min = k }
  return min ? startOfDay(new Date(min + 'T00:00:00')) : null
}

const EMPTY: HomeMetrics = { metrics: [] }

export async function getHomeMetrics(clientId: string): Promise<HomeMetrics> {
  try {
    return await loadHomeMetrics(clientId)
  } catch (err) {
    console.error('[getHomeMetrics] failed', err)
    return EMPTY
  }
}

async function loadHomeMetrics(clientId: string): Promise<HomeMetrics> {
  const admin = createAdminClient()
  const today = startOfDay(new Date())
  const bound = ymd(new Date(today.getTime() - BOUND_DAYS * DAY))

  const [gbp, social, reviews] = await Promise.all([
    admin.from('gbp_metrics')
      .select('date, directions, calls, website_clicks, bookings')
      .eq('client_id', clientId).gte('date', bound).order('date', { ascending: true }),
    admin.from('social_metrics')
      .select('date, reach, engagement, posts_published, followers_gained, profile_visits')
      .eq('client_id', clientId).gte('date', bound).order('date', { ascending: true }),
    admin.from('reviews')
      .select('rating, response_text, posted_at')
      .eq('client_id', clientId).gte('posted_at', bound + 'T00:00:00'),
  ])

  /* ── customers ── */
  const cMain: Maps = new Map(), cDir: Maps = new Map(), cCall: Maps = new Map(), cClick: Maps = new Map(), cBook: Maps = new Map()
  for (const r of (gbp.data ?? []) as Record<string, unknown>[]) {
    const d = String(r.date).slice(0, 10)
    const dir = num(r.directions), call = num(r.calls), click = num(r.website_clicks), book = num(r.bookings)
    cMain.set(d, (cMain.get(d) ?? 0) + dir + call + click + book)
    cDir.set(d, (cDir.get(d) ?? 0) + dir)
    cCall.set(d, (cCall.get(d) ?? 0) + call)
    cClick.set(d, (cClick.get(d) ?? 0) + click)
    cBook.set(d, (cBook.get(d) ?? 0) + book)
  }
  const customers = buildMetric({
    key: 'customers', label: 'Customer actions', sub: 'Calls, directions & website clicks', fmt: 'num',
    mainMap: cMain,
    comps: [
      { label: 'Directions', icon: 'pin', map: cDir },
      { label: 'Calls', icon: 'phone', map: cCall },
      { label: 'Site clicks', icon: 'cursor', map: cClick },
      { label: 'Bookings', icon: 'calendar', map: cBook },
    ],
  }, today, earliestOf(cMain))

  /* ── reach ── */
  const rMain: Maps = new Map(), rEng: Maps = new Map(), rPost: Maps = new Map(), rFol: Maps = new Map(), rVis: Maps = new Map()
  for (const r of (social.data ?? []) as Record<string, unknown>[]) {
    const d = String(r.date).slice(0, 10)
    rMain.set(d, (rMain.get(d) ?? 0) + num(r.reach))
    rEng.set(d, (rEng.get(d) ?? 0) + num(r.engagement))
    rPost.set(d, (rPost.get(d) ?? 0) + num(r.posts_published))
    rFol.set(d, (rFol.get(d) ?? 0) + num(r.followers_gained))
    rVis.set(d, (rVis.get(d) ?? 0) + num(r.profile_visits))
  }
  const reach = buildMetric({
    key: 'reach', label: 'Reach', sub: 'People who saw your content', fmt: 'num',
    mainMap: rMain,
    comps: [
      { label: 'Engaged', icon: 'heart', map: rEng },
      { label: 'Posts', icon: 'image', map: rPost },
      { label: 'Followers', icon: 'user', map: rFol },
      { label: 'Profile visits', icon: 'eye', map: rVis },
    ],
  }, today, earliestOf(rMain))

  /* ── reputation ── */
  const repCount: Maps = new Map(), repRating: Maps = new Map(), repReplied: Maps = new Map(), repFive: Maps = new Map()
  for (const r of (reviews.data ?? []) as Record<string, unknown>[]) {
    if (!r.posted_at) continue
    const d = String(r.posted_at).slice(0, 10)
    const rating = num(r.rating)
    repCount.set(d, (repCount.get(d) ?? 0) + 1)
    repRating.set(d, (repRating.get(d) ?? 0) + rating)
    if (r.response_text) repReplied.set(d, (repReplied.get(d) ?? 0) + 1)
    if (rating >= 5) repFive.set(d, (repFive.get(d) ?? 0) + 1)
  }
  const reputation = buildMetric({
    key: 'reputation', label: 'Reputation', sub: 'Average rating · reviews received', fmt: 'rate',
    mainMap: repCount,
    rate: { count: repCount, ratingSum: repRating, replied: repReplied, five: repFive },
  }, today, earliestOf(repCount))

  return { metrics: [customers, reputation, reach] }
}
