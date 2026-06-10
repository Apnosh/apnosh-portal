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
 * Metrics — the customer funnel, top to bottom:
 *   reach        — people who saw you (social reach + Google views)
 *   interactions — people who engaged (calls, directions, clicks, likes)
 *   bookings     — people who acted (tables booked + orders placed)
 *   loyalty      — people you brought back (email opens/clicks; SMS soon)
 *   reputation   — reviews received per day + average rating (rate metric)
 *
 * Each tier blends the channels that feed it. A source that isn't
 * connected contributes nothing and shows an honest "—" tile rather
 * than a fake zero, so the rollups never look inflated.
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
  key: 'reach' | 'interactions' | 'bookings' | 'loyalty' | 'reputation'
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
interface CompDef { label: string; icon: string; map: Maps; money?: boolean }
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

function buildMetric(cfg: BuildCfg, today: Date, earliest: Date | null, frontier: Date): HomeMetric {
  const base: HomeMetric = {
    key: cfg.key, label: cfg.label, sub: cfg.sub, fmt: cfg.fmt,
    hasData: !!earliest, week: [], month: [], year: [],
  }
  if (!earliest) return base
  const earliestDay = startOfDay(earliest)

  const dayVal = (d: Date): number => cfg.mainMap.get(ymd(d)) ?? 0
  /* Data frontier, not the calendar date, bounds the "available" window:
     days after the latest synced day are pending (null/blank), not zero —
     so a 1-2 day source lag (e.g. Google) never reads as a real drop. */
  const inWindow = (d: Date): boolean => d >= earliestDay && d <= frontier

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
      /* A comp whose map was never populated (the source isn't connected)
         shows "—", not a fake 0. A connected source that simply had no
         activity this period still shows a real 0. */
      breakdown = (cfg.comps ?? []).map(c => {
        if (c.map.size === 0) return { label: c.label, value: '—', icon: c.icon }
        const sum = sumOver(c.map, inDays)
        return { label: c.label, value: (c.money ? '$' : '') + fmtCompact(sum), icon: c.icon }
      })
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

function latestOf(maps: Maps): Date | null {
  let max: string | null = null
  for (const k of maps.keys()) { if (max === null || k > max) max = k }
  return max ? startOfDay(new Date(max + 'T00:00:00')) : null
}

/* The latest day that actually has a value > 0. Trailing zero/empty days
   are the source's reporting lag (rows arrive late or backfill to 0), so
   we never let them anchor the frontier and drag the average down. */
function latestNonZeroOf(maps: Maps): Date | null {
  let max: string | null = null
  for (const [k, v] of maps.entries()) { if (v > 0 && (max === null || k > max)) max = k }
  return max ? startOfDay(new Date(max + 'T00:00:00')) : null
}

/* Reliable data frontier = the most recent day we trust. Two effects:
   the source's reporting lag (rows simply not arrived yet, or arrive as
   zeros and backfill later) AND its settling window (recent rows exist
   but are still partial — Google Business Profile notably under-reports
   the last several days).

   We anchor on the last day with real data (latestNonZeroOf), never on
   trailing zero days, so the lag can vary day to day without ever
   dragging the average to 0. The settleDays floor then drops the most
   recent few days even if they carry partial data. */
function frontierFor(maps: Maps, today: Date, settleDays: number): Date {
  const cutoff = startOfDay(new Date(today.getTime() - settleDays * DAY))
  const lr = latestNonZeroOf(maps) ?? latestOf(maps)
  if (!lr) return cutoff
  return lr.getTime() < cutoff.getTime() ? lr : cutoff
}
/* The last-non-zero anchor (above) already drops trailing days that
   haven't reported yet, so this floor only needs to be small. Keeping it
   at GBP's typical 1-2 day reporting lag means we include every day that
   has real data and never invent zeros. */
const SETTLE = { gbp: 2, social: 1, web: 1, email: 1 }

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

  const [gbp, social, reviews, localReviews, email] = await Promise.all([
    admin.from('gbp_metrics')
      .select('date, directions, calls, website_clicks, bookings, search_views, impressions_total, conversations, food_orders, food_menu_clicks')
      .eq('client_id', clientId).gte('date', bound).order('date', { ascending: true }),
    admin.from('social_metrics')
      .select('date, reach, engagement, posts_published, followers_gained, profile_visits')
      .eq('client_id', clientId).gte('date', bound).order('date', { ascending: true }),
    admin.from('reviews')
      .select('rating, response_text, posted_at')
      .eq('client_id', clientId).gte('posted_at', bound + 'T00:00:00'),
    admin.from('local_reviews')
      .select('rating, reply_text, created_at_platform')
      .eq('client_id', clientId).gte('created_at_platform', bound + 'T00:00:00'),
    admin.from('email_metrics')
      .select('sent_date, sent_count, open_count, click_count, revenue_attributed')
      .eq('client_id', clientId).gte('sent_date', bound).order('sent_date', { ascending: true }),
  ])

  /* Per-day source maps. We only create+populate a map when the source
     can produce it; a map left empty (size 0) renders an honest "—". */
  // Google Business Profile
  const gImpr: Maps = new Map()   // people who saw the listing
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
  // Social
  const sReach: Maps = new Map(), sEng: Maps = new Map(), sFol: Maps = new Map(), sVis: Maps = new Map()
  for (const r of (social.data ?? []) as Record<string, unknown>[]) {
    const d = String(r.date).slice(0, 10)
    sReach.set(d, (sReach.get(d) ?? 0) + num(r.reach))
    sEng.set(d, (sEng.get(d) ?? 0) + num(r.engagement))
    sFol.set(d, (sFol.get(d) ?? 0) + num(r.followers_gained))
    sVis.set(d, (sVis.get(d) ?? 0) + num(r.profile_visits))
  }

  /* Reservations + delivery aren't wired to a daily source yet, so these
     stay empty and surface as honest "—" tiles in the Bookings tier. */
  const reservations: Maps = new Map()

  const addInto = (...maps: Maps[]): Maps => {
    const out: Maps = new Map()
    for (const m of maps) for (const [k, v] of m) out.set(k, (out.get(k) ?? 0) + v)
    return out
  }

  /* ── 1. Reach — people who saw you (social reach + Google views) ── */
  const reachMain = addInto(sReach, gImpr)
  const reach = buildMetric({
    key: 'reach', label: 'Reach', sub: 'People who saw you on Google and social', fmt: 'num',
    mainMap: reachMain,
    comps: [
      { label: 'Social reach', icon: 'eye', map: sReach },
      { label: 'Google views', icon: 'pin', map: gImpr },
      { label: 'Profile visits', icon: 'user', map: sVis },
      { label: 'New followers', icon: 'heart', map: sFol },
    ],
  }, today, earliestOf(reachMain), frontierFor(reachMain, today, SETTLE.gbp))

  /* ── 2. Interactions — people who engaged ── */
  const interMain = addInto(gDir, gCall, gClick, gConv, gMenu, sEng, sVis)
  const interactions = buildMetric({
    key: 'interactions', label: 'Interactions', sub: 'Calls, directions, clicks and likes', fmt: 'num',
    mainMap: interMain,
    comps: [
      { label: 'Calls', icon: 'phone', map: gCall },
      { label: 'Directions', icon: 'pin', map: gDir },
      { label: 'Site clicks', icon: 'cursor', map: gClick },
      { label: 'Engaged', icon: 'heart', map: sEng },
    ],
  }, today, earliestOf(interMain), frontierFor(interMain, today, SETTLE.gbp))

  /* ── 3. Bookings & orders — people who acted ── */
  const bookMain = addInto(gBook, gFood)
  const bookings = buildMetric({
    key: 'bookings', label: 'Bookings & orders', sub: 'Tables booked and orders placed', fmt: 'num',
    mainMap: bookMain,
    comps: [
      { label: 'Bookings', icon: 'calendar', map: gBook },
      { label: 'Food orders', icon: 'gift', map: gFood },
      { label: 'Menu clicks', icon: 'cursor', map: gMenu },
      { label: 'Reservations', icon: 'clock', map: reservations },
    ],
  }, today, earliestOf(bookMain), frontierFor(bookMain, today, SETTLE.gbp))

  /* ── 4. Loyalty — people you brought back (email today; SMS soon) ── */
  const eSent: Maps = new Map(), eOpen: Maps = new Map(), eClick: Maps = new Map(), eRev: Maps = new Map()
  for (const r of (email.data ?? []) as Record<string, unknown>[]) {
    if (!r.sent_date) continue
    const d = String(r.sent_date).slice(0, 10)
    eSent.set(d, (eSent.get(d) ?? 0) + num(r.sent_count))
    eOpen.set(d, (eOpen.get(d) ?? 0) + num(r.open_count))
    eClick.set(d, (eClick.get(d) ?? 0) + num(r.click_count))
    eRev.set(d, (eRev.get(d) ?? 0) + num(r.revenue_attributed))
  }
  /* SMS isn't wired to a daily source yet — stays empty → honest "—". */
  const smsSent: Maps = new Map()
  const loyalty = buildMetric({
    key: 'loyalty', label: 'Loyalty', sub: 'Regulars you bring back by email and SMS', fmt: 'num',
    mainMap: eClick,
    comps: [
      { label: 'Emails sent', icon: 'message', map: eSent },
      { label: 'Opens', icon: 'eye', map: eOpen },
      { label: 'Email revenue', icon: 'gift', map: eRev, money: true },
      { label: 'SMS sent', icon: 'phone', map: smsSent },
    ],
  }, today, earliestOf(eClick), frontierFor(eClick, today, SETTLE.email))

  /* ── 5. reputation ── */
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
  /* Merge GBP reviews (local_reviews) into the same daily maps. */
  for (const r of (localReviews.data ?? []) as Record<string, unknown>[]) {
    if (!r.created_at_platform) continue
    const d = String(r.created_at_platform).slice(0, 10)
    const rating = num(r.rating)
    repCount.set(d, (repCount.get(d) ?? 0) + 1)
    repRating.set(d, (repRating.get(d) ?? 0) + rating)
    if (r.reply_text) repReplied.set(d, (repReplied.get(d) ?? 0) + 1)
    if (rating >= 5) repFive.set(d, (repFive.get(d) ?? 0) + 1)
  }
  const reputation = buildMetric({
    key: 'reputation', label: 'Reputation', sub: 'Average rating · reviews received', fmt: 'rate',
    mainMap: repCount,
    rate: { count: repCount, ratingSum: repRating, replied: repReplied, five: repFive },
  }, today, earliestOf(repCount), today)

  return { metrics: [reach, interactions, bookings, loyalty, reputation] }
}
