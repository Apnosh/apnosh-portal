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

  // Headline = the ROLLING last 7 settled days ending at the frontier (not the
  // last calendar week — that hid ~a week of ready data). The newest day is SHOWN
  // in the chart but EXCLUDED from the up/down %, because Google keeps filling in
  // the most recent day for a few days and a half-reported day must never fake a
  // trend. So: total counts all 7 days; the % compares only the settled days
  // before the newest one, against the aligned prior week.
  const DAY = 86400000
  const roll: { value: number; prev: number; dow: number }[] = []
  if (lastDataDate) {
    const f = new Date(lastDataDate + 'T00:00:00')
    for (let i = 6; i >= 0; i--) {
      const d = new Date(f.getTime() - i * DAY)
      const p = new Date(d.getTime() - 7 * DAY)
      roll.push({ value: dmap.get(ymd(d)) ?? 0, prev: dmap.get(ymd(p)) ?? 0, dow: d.getDay() })
    }
  }
  // Fallback (no daily data): the old last-complete-week path keeps working.
  let ti = Math.max(0, weeks.length - 2)
  while (ti > 0 && (weeks[ti]?.total ?? 0) === 0) ti--
  const thisWeek = weeks[ti]
  const lastWeek = weeks[ti - 1]

  const chart = roll.length
    ? roll.map((r) => ({ label: DOW[r.dow], value: r.value, prev: r.prev }))
    : DOW.map((label, i) => ({ label, value: Number((thisWeek?.vals ?? [])[i] ?? 0), prev: Number((lastWeek?.vals ?? [])[i] ?? 0) }))
  const chartStartISO = roll.length && lastDataDate
    ? ymd(new Date(new Date(lastDataDate + 'T00:00:00').getTime() - 6 * DAY))
    : thisWeek?.start
  const total = roll.length ? roll.reduce((s, r) => s + r.value, 0) : (thisWeek?.total ?? 0)
  // Trend drops the newest day (roll[6]) and its comparison, so a still-filling
  // latest day can't tilt up/down. Compares the 6 settled days before it to the
  // same 6 days a week earlier.
  const settledDays = roll.slice(0, -1)
  const weekPct = roll.length
    ? pct(settledDays.reduce((s, r) => s + r.value, 0), settledDays.reduce((s, r) => s + r.prev, 0))
    : pct(total, lastWeek?.total ?? 0)

  const thisMonth = months[months.length - 1]
  const lastMonth = months[months.length - 2]
  const domCount = (thisMonth?.vals ?? []).filter((v) => v != null).length || 1
  const thisMonthVal = firstNDays(thisMonth, domCount)
  const lastMonthVal = firstNDays(lastMonth, domCount)
  // Per-metric month-over-month delta. Only meaningful when last month actually
  // had data in the comparable (same number of leading days) window — otherwise
  // the percent is a fake +100%. When it is comparable we always surface it
  // (up / down / even), so every graph shows its own change, not just the ones
  // that happen to be non-flat.
  const hasMonthCompare = !!lastMonth && lastMonthVal > 0
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
