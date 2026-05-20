'use server'

/**
 * Historical metric ranges for the mobile home hero chart.
 *
 * Powers the Robinhood-style range selector (1W / 1M / 3M / 1Y / ALL).
 * For each metric we return only the ranges the data actually covers
 * (plus ALL), so we never relabel 14 days of data as "1Y". Each range
 * carries a formatted value, a prior-period delta, and a downsampled
 * series for the line chart.
 *
 *   customers — GBP actions (directions + calls + website clicks +
 *               bookings + conversations) per day
 *   reach     — social impressions per day
 *
 * Reputation has no time series (it's an average), so it isn't included.
 */

import { createAdminClient } from '@/lib/supabase/admin'

export type RangeKey = '1W' | '1M' | '3M' | '1Y' | 'ALL'

export interface RangePoint {
  value: string
  delta: string | null
  up: boolean | null
  series: number[]
}

export interface MetricRanges {
  available: RangeKey[]
  ranges: Partial<Record<RangeKey, RangePoint>>
}

export interface MetricHistory {
  customers: MetricRanges | null
  reach: MetricRanges | null
}

const DAY = 86400000
const WINDOW_DAYS: Record<Exclude<RangeKey, 'ALL'>, number> = {
  '1W': 7, '1M': 30, '3M': 90, '1Y': 365,
}
const MAX_POINTS = 30

const num = (v: unknown): number => Number(v ?? 0)
const sum = (a: number[]): number => a.reduce((x, y) => x + y, 0)

function fmtCompact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'k'
  return Math.round(n).toLocaleString()
}

function pctDelta(cur: number, prev: number): { delta: string | null; up: boolean | null } {
  if (prev <= 0) return { delta: null, up: null }
  const pct = Math.round(((cur - prev) / prev) * 100)
  return { delta: `${pct >= 0 ? '+' : ''}${pct}%`, up: pct >= 0 }
}

/* Collapse a daily series into <= MAX_POINTS buckets by summing each
   bucket, so longer ranges keep a readable trend shape. */
function downsample(vals: number[], maxPoints = MAX_POINTS): number[] {
  if (vals.length <= maxPoints) return vals
  const bucket = Math.ceil(vals.length / maxPoints)
  const out: number[] = []
  for (let i = 0; i < vals.length; i += bucket) {
    out.push(sum(vals.slice(i, i + bucket)))
  }
  return out
}

function buildMetric(rows: { date: string; v: number }[], now: Date): MetricRanges | null {
  if (!rows.length) return null
  const fmt = (d: Date) => d.toISOString().slice(0, 10)

  const byDate = new Map<string, number>()
  for (const r of rows) {
    const d = r.date.slice(0, 10)
    byDate.set(d, (byDate.get(d) ?? 0) + r.v)
  }

  const earliest = rows[0].date.slice(0, 10)
  const spanDays = Math.max(
    1,
    Math.floor((now.getTime() - new Date(earliest + 'T00:00:00').getTime()) / DAY) + 1,
  )

  /* Daily values for `n` days ending `offset` days before today. */
  const lastNDays = (n: number, offset = 0): number[] => {
    const out: number[] = []
    for (let i = n - 1; i >= 0; i--) {
      out.push(byDate.get(fmt(new Date(now.getTime() - (i + offset) * DAY))) ?? 0)
    }
    return out
  }

  const ranges: Partial<Record<RangeKey, RangePoint>> = {}
  const available: RangeKey[] = []

  ;(['1W', '1M', '3M', '1Y'] as const).forEach(rk => {
    const wd = WINDOW_DAYS[rk]
    if (spanDays < wd) return
    const cur = lastNDays(wd)
    const prev = lastNDays(wd, wd)
    const d = pctDelta(sum(cur), sum(prev))
    ranges[rk] = { value: fmtCompact(sum(cur)), delta: d.delta, up: d.up, series: downsample(cur) }
    available.push(rk)
  })

  const allVals = lastNDays(spanDays)
  ranges['ALL'] = { value: fmtCompact(sum(allVals)), delta: null, up: null, series: downsample(allVals) }
  available.push('ALL')

  return { available, ranges }
}

export async function getMetricHistory(clientId: string): Promise<MetricHistory> {
  const admin = createAdminClient()
  const now = new Date()
  /* Bound the pull at ~2 years so 1Y + its prior-year comparison are
     covered without scanning unbounded history. */
  const lowerBound = new Date(now.getTime() - 760 * DAY).toISOString().slice(0, 10)

  const [gbp, social] = await Promise.all([
    admin
      .from('gbp_metrics')
      .select('date, directions, calls, website_clicks, bookings, conversations')
      .eq('client_id', clientId)
      .gte('date', lowerBound)
      .order('date', { ascending: true }),
    admin
      .from('social_metrics')
      .select('date, reach')
      .eq('client_id', clientId)
      .gte('date', lowerBound)
      .order('date', { ascending: true }),
  ])

  type GbpRow = { date: string; directions?: number | null; calls?: number | null; website_clicks?: number | null; bookings?: number | null; conversations?: number | null }
  type SocialRow = { date: string; reach?: number | null }

  const customers = buildMetric(
    ((gbp.data ?? []) as GbpRow[]).map(r => ({
      date: r.date,
      v: num(r.directions) + num(r.calls) + num(r.website_clicks) + num(r.bookings) + num(r.conversations),
    })),
    now,
  )
  const reach = buildMetric(
    ((social.data ?? []) as SocialRow[]).map(r => ({ date: r.date, v: num(r.reach) })),
    now,
  )

  return { customers, reach }
}
