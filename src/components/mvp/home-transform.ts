/**
 * Shared transform: maps the real /api/dashboard/load payload
 * (homeMetrics interactions + agenda approvals) into the apnosh-mvp
 * design's Home shape. Used by both the live owner home (mobile-home)
 * and the /dashboard/mvp-home proof route so they never drift.
 */

import type { MvpHomeData } from './mvp-home'

export interface HomeInstance { vals: (number | null)[]; start: string; total: number; breakdown: { label: string; value: string; icon: string }[] }
export interface HomeMetric { key: string; label: string; hasData: boolean; week: HomeInstance[]; month: HomeInstance[] }
export interface AgendaItem { id: string; type: string; urgency: string; label: string; detail?: string }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

function pct(curr: number, prev: number): number {
  if (prev === 0) return curr > 0 ? 100 : 0
  return Math.round(((curr - prev) / prev) * 100)
}

function monthName(iso: string): string {
  return MONTHS[Number(iso.slice(5, 7)) - 1] ?? ''
}

function breakdownVal(inst: HomeInstance | undefined, match: string): string {
  const item = inst?.breakdown.find((b) => b.label.toLowerCase().includes(match))
  return item?.value ?? '—'
}

/* Sum the first `n` days of an instance — used for a fair month-to-date
   comparison (this month's first N days vs last month's first N days),
   instead of partial-month-vs-full-month which reads as a false drop. */
function firstNDays(inst: HomeInstance | undefined, n: number): number {
  return (inst?.vals ?? []).slice(0, n).reduce((s: number, v) => s + (Number(v) || 0), 0)
}

export function transformHome(
  homeMetrics: { metrics: HomeMetric[] } | null,
  agenda: AgendaItem[] | null,
  avatarText: string,
  greeting = 'Good day',
): MvpHomeData {
  const metrics = homeMetrics?.metrics ?? []
  const inter = metrics.find((m) => m.key === 'interactions')
  const bookings = metrics.find((m) => m.key === 'bookings')

  const weeks = inter?.week ?? []
  const thisWeek = weeks[weeks.length - 1]
  const lastWeek = weeks[weeks.length - 2]
  const heroTotal = thisWeek?.total ?? 0
  const weekPct = pct(thisWeek?.total ?? 0, lastWeek?.total ?? 0)

  // Month-to-date: compare equal slices so a partial current month isn't
  // judged against a full prior month.
  const months = inter?.month ?? []
  const thisMonth = months[months.length - 1]
  const lastMonth = months[months.length - 2]
  const domCount = (thisMonth?.vals ?? []).filter((v) => v != null).length || 1
  const monthPct = pct(firstNDays(thisMonth, domCount), firstNDays(lastMonth, domCount))

  const tv = thisWeek?.vals ?? []
  const lv = lastWeek?.vals ?? []
  const chart = DOW.map((label, i) => ({ label, value: Number(tv[i] ?? 0), prev: Number(lv[i] ?? 0) }))

  const bWeek = bookings?.week ?? []
  const bThis = bWeek[bWeek.length - 1]

  const sources: MvpHomeData['sources'] = [
    { key: 'directions', label: 'Directions', value: breakdownVal(thisWeek, 'direction'), configured: true },
    { key: 'calls', label: 'Calls', value: breakdownVal(thisWeek, 'call'), configured: true },
    { key: 'clicks', label: 'Site clicks', value: breakdownVal(thisWeek, 'click'), configured: true },
    { key: 'bookings', label: 'Bookings', value: bThis ? String(bThis.total) : '—', configured: !!bookings?.hasData },
  ]

  const approvals = (agenda ?? [])
    .filter((a) => a.type === 'approval')
    .slice(0, 4)
    .map((a) => ({
      id: a.id,
      tag: 'NEEDS REVIEW',
      timing: a.urgency === 'high' ? 'Soon' : 'No rush',
      title: a.label.replace(/^Approve:\s*/i, ''),
      subtitle: a.detail ?? 'Drafted by your team',
    }))

  const down = weekPct < 0
  const signal: MvpHomeData['signal'] = down
    ? { state: 'recommendation', metric: 'interactions', message: 'Fewer customers took action this week than last. A fresh post can bring it back up.' }
    : { state: 'ontrack' }

  return {
    greeting,
    avatarText,
    hero: { total: heroTotal, weekPct, down, monthPct, prevMonthLabel: lastMonth ? monthName(lastMonth.start) : '' },
    chart,
    sources,
    signal,
    approvals,
    review: null,
  }
}
