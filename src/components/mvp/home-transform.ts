/**
 * Shared transform: maps the real /api/dashboard/load payload into the
 * apnosh-mvp design's Home shape. Produces a view per metric (so the Home
 * can switch which graph it shows, like the old mobile hero), plus the
 * approvals / signal / review the design needs. Used by both the live owner
 * home (mobile-home) and the /dashboard/mvp-home review surface.
 */

import type { MvpHomeData, MetricView } from './mvp-home'
import { buildCandidates, markLead, type SuggestionFacts } from '@/lib/dashboard/suggestions'

export interface HomeInstance { vals: (number | null)[]; start: string; total: number; breakdown: { label: string; value: string; icon: string }[] }
export interface HomeMetric { key: string; label: string; sub: string; fmt: string; hasData: boolean; week: HomeInstance[]; month: HomeInstance[]; year: HomeInstance[] }
export interface AgendaItem { id: string; type: string; urgency: string; label: string; detail?: string }
export interface ComingUpItem { date: string; label: string; hook: string; weight: number; daysUntil: number; queuedCount: number }

function planLabel(days: number): string {
  if (days <= 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days < 7) return `in ${days} days`
  if (days < 14) return 'next week'
  return `in ${Math.round(days / 7)} weeks`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

// Per-metric copy for the switcher + hero. Falls back to the metric's own
// label / sub for anything not listed. These two are BLENDED numbers —
// interactions mixes GBP actions with social likes, reach counts GBP
// impressions (views, not unique people) — so the copy must say what they
// actually are, not "customers" or "people".
const META: Record<string, { tab: string; heroLabel: string; heroSub: string; unit: string }> = {
  interactions: { tab: 'Actions', heroLabel: 'Actions on your business', heroSub: 'calls, directions, clicks, and likes', unit: 'actions' },
  reach: { tab: 'Views', heroLabel: 'Views on Google and social', heroSub: 'times your posts, profile, and listings were seen', unit: 'views' },
  bookings: { tab: 'Bookings', heroLabel: 'Bookings', heroSub: 'reserved a table from your profile', unit: 'booked' },
  loyalty: { tab: 'Email', heroLabel: 'Email engagement', heroSub: 'opened or clicked your emails', unit: 'engaged' },
  reputation: { tab: 'Reviews', heroLabel: 'New reviews', heroSub: 'left a review this period', unit: 'reviews' },
}
const ORDER = ['interactions', 'reach', 'bookings', 'reputation', 'loyalty']

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function pct(curr: number, prev: number): number {
  if (prev === 0) return curr > 0 ? 100 : 0
  return Math.round(((curr - prev) / prev) * 100)
}
function monthName(iso: string): string {
  return MONTHS[Number(iso.slice(5, 7)) - 1] ?? ''
}
function firstNDays(inst: HomeInstance | undefined, n: number): number {
  return (inst?.vals ?? []).slice(0, n).reduce((s: number, v) => s + (Number(v) || 0), 0)
}

function buildMetricView(m: HomeMetric): MetricView {
  const meta = META[m.key] ?? { tab: m.label, heroLabel: m.label, heroSub: m.sub, unit: 'tracked' }

  const weeks = m.week ?? []
  const months = m.month ?? []

  // Settled daily series (ascending). get-home-metrics nulls every day past the
  // data frontier (the last day Google/social has reliably reported), so every
  // entry here is a real, settled day — the newest is the frontier.
  const daily: { date: string; value: number }[] = []
  for (const mo of months) {
    const d0 = new Date(mo.start + 'T00:00:00')
    ;(mo.vals ?? []).forEach((v, i) => {
      if (v != null) daily.push({ date: ymd(new Date(d0.getFullYear(), d0.getMonth(), 1 + i)), value: Number(v) })
    })
  }
  daily.sort((a, b) => a.date.localeCompare(b.date))
  const dmap = new Map(daily.map((d) => [d.date, d.value]))
  const lastDataDate = daily.length ? daily[daily.length - 1].date : ''

  // The 7-day view is the CURRENT calendar week, Sunday → Saturday (7 bars),
  // filling in day by day. It's anchored to the week that CONTAINS the data
  // frontier (the latest day with data), so it's always the freshest week, not
  // a week that ended days ago. Days past the frontier are shown as empty bars
  // ("this week so far"). Two honesty flags per day drive the math below:
  //   elapsed = the day has happened (<= frontier)     → counted in the total + average
  //   settled = the day is fully reported (< frontier) → counted in the up/down %
  // The still-filling frontier day is elapsed-but-not-settled: SHOWN and in the
  // total, but never in the % (a half-reported day must not fake a trend).
  const DAY = 86400000
  const week: { label: string; value: number; prev: number; settled: boolean; elapsed: boolean }[] = []
  if (lastDataDate) {
    const f = new Date(lastDataDate + 'T00:00:00')
    const sun = new Date(f.getTime() - f.getDay() * DAY)   // Sunday of the frontier's week
    for (let i = 0; i < 7; i++) {
      const d = new Date(sun.getTime() + i * DAY)
      const p = new Date(d.getTime() - 7 * DAY)
      const elapsed = d.getTime() <= f.getTime()
      week.push({
        label: DOW[d.getDay()],
        value: elapsed ? (dmap.get(ymd(d)) ?? 0) : 0,
        prev: dmap.get(ymd(p)) ?? 0,
        settled: d.getTime() < f.getTime(),
        elapsed,
      })
    }
  }
  // Fallback (no daily data): the old last-populated-week path keeps working.
  let ti = Math.max(0, weeks.length - 2)
  while (ti > 0 && (weeks[ti]?.total ?? 0) === 0) ti--
  const thisWeek = weeks[ti]
  const lastWeek = weeks[ti - 1]

  const chart = week.length
    ? week.map((w) => ({ label: w.label, value: w.value, prev: w.prev, settled: w.settled, elapsed: w.elapsed }))
    : DOW.map((label, i) => ({ label, value: Number((thisWeek?.vals ?? [])[i] ?? 0), prev: Number((lastWeek?.vals ?? [])[i] ?? 0), settled: true, elapsed: true }))
  const chartStartISO = week.length && lastDataDate
    ? ymd(new Date(new Date(lastDataDate + 'T00:00:00').getTime() - new Date(lastDataDate + 'T00:00:00').getDay() * DAY))
    : thisWeek?.start
  const elapsedDays = week.filter((w) => w.elapsed)
  const total = week.length ? elapsedDays.reduce((s, w) => s + w.value, 0) : (thisWeek?.total ?? 0)
  // % over SETTLED days only (this week so far, minus the still-filling day),
  // vs the same weekdays last week — so the newest partial day can't tilt it.
  const settledDays = week.filter((w) => w.settled)
  const weekPct = week.length
    ? (settledDays.length ? pct(settledDays.reduce((s, w) => s + w.value, 0), settledDays.reduce((s, w) => s + w.prev, 0)) : 0)
    : pct(total, lastWeek?.total ?? 0)

  // Month-over-month, anchored to the month that CONTAINS the data frontier —
  // the latest month with real data — NOT the calendar's current month. Early in
  // a month (before Google reports its first days) the current month is empty and
  // comparing it to a full prior month reads as a fake "down 100%". Anchoring to
  // the frontier month compares month-to-date (through the frontier) against the
  // same leading days of the prior month.
  const frontierYm = lastDataDate.slice(0, 7)
  let mi = frontierYm ? months.findIndex((mo) => String(mo.start).slice(0, 7) === frontierYm) : -1
  if (mi < 0) mi = months.length - 1
  const thisMonth = months[mi]
  const lastMonth = mi > 0 ? months[mi - 1] : undefined
  const domCount = (thisMonth?.vals ?? []).filter((v) => v != null).length || 1
  const thisMonthVal = firstNDays(thisMonth, domCount)
  const lastMonthVal = firstNDays(lastMonth, domCount)
  // Only surface it when BOTH sides have real data in the comparable window —
  // never a fake ±100% off an empty current or prior month.
  const hasMonthCompare = !!lastMonth && lastMonthVal > 0 && thisMonthVal > 0
  const monthPct = hasMonthCompare ? Math.round(((thisMonthVal - lastMonthVal) / lastMonthVal) * 100) : 0

  // Continuous monthly series across ALL available years, built from the `year`
  // instances' monthly bars (the `month` field only holds the trailing 12).
  // This lets the chart's "Last year" view compare each month against the SAME
  // month a year earlier. `null` months (before onboarding / after the data
  // frontier) are skipped so there are no blank leading/trailing bars.
  const monthly: { label: string; value: number; ym: string }[] = []
  for (const yr of (m.year ?? [])) {
    const y = Number(String(yr.start).slice(0, 4))
    ;(yr.vals ?? []).forEach((v, i) => {
      if (v == null) return
      monthly.push({ label: MONTHS[i], value: Number(v), ym: `${y}-${String(i + 1).padStart(2, '0')}` })
    })
  }

  // Source breakdown tiles stay week-based (they split a period into calls /
  // directions / views); the last populated week is a fine, cheap source.
  const tiles = (thisWeek?.breakdown ?? []).map((b) => ({
    key: b.icon, label: b.label, value: b.value,
    configured: !!b.value && b.value !== '0' && b.value !== '—',
  }))

  return {
    key: m.key, tabLabel: meta.tab, heroLabel: meta.heroLabel, heroSub: meta.heroSub, unit: meta.unit,
    total, weekPct, monthPct, prevMonthLabel: hasMonthCompare ? monthName(lastMonth!.start) : '',
    chart, chartStart: chartStartISO, daily, monthly, tiles, lastDataDate,
  }
}

export function transformHome(
  homeMetrics: { metrics: HomeMetric[] } | null,
  agenda: AgendaItem[] | null,
  avatarText: string,
  greeting = 'Good day',
  comingUp: ComingUpItem[] | null = null,
): MvpHomeData {
  const metrics = homeMetrics?.metrics ?? []
  const views = ORDER
    .map((k) => metrics.find((m) => m.key === k))
    .filter((m): m is HomeMetric => !!m && m.hasData)
    .map(buildMetricView)

  const primary = views[0]
  const approvals = (agenda ?? [])
    .filter((a) => a.type === 'approval')
    .slice(0, 4)
    .map((a) => ({
      id: a.id,
      tag: 'NEEDS REVIEW',
      timing: a.urgency === 'high' ? 'Soon' : 'No rush',
      title: a.label.replace(/^Approve:\s*/i, ''),
      subtitle: a.detail ?? 'Drafted by your team',
      emoji: '📄',
    }))

  // Only call it a "down week" when the primary metric has FRESH data — otherwise
  // a stalled data feed would leave this banner (and the hero arrow) stuck on an
  // old comparison for weeks. Stale → treat as on-track, no false alarm.
  const primaryStaleDays = primary?.lastDataDate
    ? Math.floor((Date.now() - Date.parse(primary.lastDataDate + 'T00:00:00')) / 86400000)
    : 9999
  const primaryFresh = primaryStaleDays <= 9
  const down = primaryFresh && (primary?.weekPct ?? 0) < 0
  const signal: MvpHomeData['signal'] = down
    ? { state: 'recommendation', metric: primary?.tabLabel.toLowerCase() ?? 'numbers', message: 'Fewer actions on your business this week than last. A fresh post can bring it back up.' }
    : { state: 'ontrack' }

  const planner = (comingUp ?? []).slice(0, 4).map((e, i) => {
    const d = new Date(e.date)
    return {
      id: `${e.label}-${i}`,
      day: String(d.getDate()),
      mon: d.toLocaleDateString('en-US', { month: 'short' }),
      daysLabel: planLabel(e.daysUntil),
      label: e.label,
      hook: e.hook,
      planned: e.queuedCount > 0,
    }
  })

  // Instant suggestion stack from the data already in hand (approvals + primary
  // metric only). The richer cards — reviews, connections, tasks, and the next
  // planning moment — come from /api/dashboard/suggestions, which the home page
  // merges in a moment later. Keeping plan out of the instant set avoids an
  // id/moment mismatch (and a visible card swap) when that set arrives.
  const facts: SuggestionFacts = {
    approvalsCount: approvals.length,
    metric: primary ? { label: primary.tabLabel, weekPct: primary.weekPct, monthPct: primary.monthPct } : null,
  }
  const suggestions = markLead(buildCandidates(facts).slice(0, 5))

  return {
    greeting,
    avatarText,
    avatarEmoji: '🍽️',
    metrics: views,
    approvals,
    signal,
    suggestions,
    review: null,
    planner,
  }
}
