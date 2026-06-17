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
export interface HomeMetric { key: string; label: string; sub: string; fmt: string; hasData: boolean; week: HomeInstance[]; month: HomeInstance[] }
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
// label / sub for anything not listed.
const META: Record<string, { tab: string; heroLabel: string; heroSub: string; unit: string }> = {
  interactions: { tab: 'Customers', heroLabel: 'Customers who took action', heroSub: 'called, got directions, or visited your site', unit: 'took action' },
  reach: { tab: 'Reach', heroLabel: 'People reached', heroSub: 'saw your posts, profile, or listings', unit: 'reached' },
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

  // Headline uses the last COMPLETE week. The final bucket is the current,
  // in-progress calendar week — partial while GBP data lags (a day or two of
  // sparse data), which would make "this week" read misleadingly low. Skip it,
  // then skip any empty trailing weeks.
  const weeks = m.week ?? []
  let ti = Math.max(0, weeks.length - 2)
  while (ti > 0 && (weeks[ti]?.total ?? 0) === 0) ti--
  const thisWeek = weeks[ti]
  const lastWeek = weeks[ti - 1]
  const total = thisWeek?.total ?? 0
  const weekPct = pct(total, lastWeek?.total ?? 0)

  const months = m.month ?? []
  const thisMonth = months[months.length - 1]
  const lastMonth = months[months.length - 2]
  const domCount = (thisMonth?.vals ?? []).filter((v) => v != null).length || 1
  const monthPct = pct(firstNDays(thisMonth, domCount), firstNDays(lastMonth, domCount))

  const tv = thisWeek?.vals ?? []
  const lv = lastWeek?.vals ?? []
  const chart = DOW.map((label, i) => ({ label, value: Number(tv[i] ?? 0), prev: Number(lv[i] ?? 0) }))

  const daily: { date: string; value: number }[] = []
  for (const mo of months) {
    const d0 = new Date(mo.start + 'T00:00:00')
    ;(mo.vals ?? []).forEach((v, i) => {
      if (v != null) daily.push({ date: ymd(new Date(d0.getFullYear(), d0.getMonth(), 1 + i)), value: Number(v) })
    })
  }
  daily.sort((a, b) => a.date.localeCompare(b.date))
  const monthly = months.map((mo) => ({ label: monthName(mo.start), value: mo.total }))

  const tiles = (thisWeek?.breakdown ?? []).map((b) => ({
    key: b.icon, label: b.label, value: b.value,
    configured: !!b.value && b.value !== '0' && b.value !== '—',
  }))

  return {
    key: m.key, tabLabel: meta.tab, heroLabel: meta.heroLabel, heroSub: meta.heroSub, unit: meta.unit,
    total, weekPct, monthPct, prevMonthLabel: lastMonth ? monthName(lastMonth.start) : '',
    chart, chartStart: thisWeek?.start, daily, monthly, tiles,
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

  const down = (primary?.weekPct ?? 0) < 0
  const signal: MvpHomeData['signal'] = down
    ? { state: 'recommendation', metric: primary?.tabLabel.toLowerCase() ?? 'numbers', message: 'Fewer customers took action this week than last. A fresh post can bring it back up.' }
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
