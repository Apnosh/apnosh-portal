'use server'

/**
 * Server-side helper: build the three pulse cards for the dashboard.
 *
 *   - Customers   — sum of GBP "actions" (directions + calls + website
 *                   clicks + bookings) over the last 7 vs prior 7 days
 *   - Reputation  — average star + count of new reviews in the last 30 days
 *   - Reach       — total social reach across platforms in the last 7 days
 *
 * Each card returns either a `live` or `no-data` state. The dashboard
 * never alarms an owner with "0, -100%" when the truth is "GBP not
 * connected yet."
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type { PulseCard } from '@/components/dashboard/pulse-cards'

function fmtCompact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'k'
  return n.toLocaleString()
}

function fmtDelta(thisN: number, prevN: number): { delta: string | null; up: boolean | null } {
  if (prevN === 0) return { delta: null, up: null }
  const pct = Math.round(((thisN - prevN) / prevN) * 100)
  return { delta: `${pct >= 0 ? '+' : ''}${pct}%`, up: pct >= 0 }
}

export interface PulseData {
  customers: PulseCard
  reputation: PulseCard
  reach: PulseCard
}

export async function getPulseData(clientId: string): Promise<PulseData> {
  const admin = createAdminClient()
  const now = new Date()
  const d7 = new Date(now.getTime() - 7 * 86400000)
  const d14 = new Date(now.getTime() - 14 * 86400000)
  const d30 = new Date(now.getTime() - 30 * 86400000)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)

  // For sparklines we also pull the full 14-day daily series per metric.
  const d14Date = fmt(d14)
  const [gbpThis, gbpPrev, gbpDaily, reviewsRecent, socialThis, socialPrev, socialDaily] = await Promise.all([
    admin
      .from('gbp_metrics')
      .select('directions, calls, website_clicks, bookings, conversations')
      .eq('client_id', clientId)
      .gte('date', fmt(d7)),
    admin
      .from('gbp_metrics')
      .select('directions, calls, website_clicks, bookings, conversations')
      .eq('client_id', clientId)
      .gte('date', fmt(d14))
      .lt('date', fmt(d7)),
    admin
      .from('gbp_metrics')
      .select('date, directions, calls, website_clicks, bookings, conversations')
      .eq('client_id', clientId)
      .gte('date', d14Date)
      .order('date', { ascending: true }),
    admin
      .from('reviews')
      .select('rating, posted_at')
      .eq('client_id', clientId)
      .gte('posted_at', d30.toISOString()),
    admin
      .from('social_metrics')
      .select('reach')
      .eq('client_id', clientId)
      .gte('date', fmt(d7)),
    admin
      .from('social_metrics')
      .select('reach')
      .eq('client_id', clientId)
      .gte('date', fmt(d14))
      .lt('date', fmt(d7)),
    admin
      .from('social_metrics')
      .select('date, reach')
      .eq('client_id', clientId)
      .gte('date', d14Date)
      .order('date', { ascending: true }),
  ])

  // Build a 14-element daily series for sparklines. Some days may have no
  // row, so we zero-fill missing dates so the sparkline x-axis is even.
  const buildDailySeries = <T extends { date: string }>(
    rows: T[] | null,
    valueOf: (r: T) => number,
  ): number[] => {
    const byDate = new Map<string, number>()
    for (const r of rows ?? []) {
      const d = (r.date as string).slice(0, 10)
      byDate.set(d, (byDate.get(d) ?? 0) + valueOf(r))
    }
    const out: number[] = []
    for (let i = 13; i >= 0; i--) {
      const day = fmt(new Date(now.getTime() - i * 86400000))
      out.push(byDate.get(day) ?? 0)
    }
    return out
  }

  const customersSeries = buildDailySeries(gbpDaily.data, (r) =>
    Number(r.directions ?? 0) +
    Number(r.calls ?? 0) +
    Number(r.website_clicks ?? 0) +
    Number(r.bookings ?? 0) +
    Number(r.conversations ?? 0)
  )
  const reachSeries = buildDailySeries(socialDaily.data, (r) => Number(r.reach ?? 0))

  // ---------- Customers ----------
  const sumActions = (rows: { directions?: number | null; calls?: number | null; website_clicks?: number | null; bookings?: number | null; conversations?: number | null }[] | null): number =>
    (rows ?? []).reduce(
      (acc, r) =>
        acc +
        Number(r.directions ?? 0) +
        Number(r.calls ?? 0) +
        Number(r.website_clicks ?? 0) +
        Number(r.bookings ?? 0) +
        Number(r.conversations ?? 0),
      0,
    )

  const customersThis = sumActions(gbpThis.data)
  const customersPrev = sumActions(gbpPrev.data)
  const hasGbp = (gbpThis.data?.length ?? 0) + (gbpPrev.data?.length ?? 0) > 0

  const customers: PulseCard = !hasGbp
    ? {
        label: 'Your customers',
        state: 'no-data',
        subtitle: 'Calls, directions, bookings',
        href: '/dashboard/connected-accounts',
        connectLabel: 'Connect Google Business',
      }
    : {
        label: 'Your customers',
        state: 'live',
        value: fmtCompact(customersThis),
        ...(customersPrev >= 20 ? fmtDelta(customersThis, customersPrev) : { delta: null, up: null }),
        subtitle: 'Calls, directions, bookings',
        href: '/dashboard/local-seo',
        alert: customersPrev >= 20 && (customersThis / customersPrev) < 0.7,
        series: customersSeries,
      }

  // ---------- Reputation ----------
  const reviews = reviewsRecent.data ?? []
  const reviewCount = reviews.length
  const avgStar = reviewCount > 0
    ? reviews.reduce((s, r) => s + Number(r.rating ?? 0), 0) / reviewCount
    : null

  const reputation: PulseCard = reviewCount === 0
    ? {
        label: 'Your reputation',
        state: 'no-data',
        subtitle: 'Avg star + new reviews',
        href: '/dashboard/connected-accounts',
        connectLabel: 'Connect review sources',
      }
    : {
        label: 'Your reputation',
        state: 'live',
        value: avgStar !== null ? `${avgStar.toFixed(1)}★` : '—',
        delta: `${reviewCount} new`,
        up: avgStar !== null ? avgStar >= 4.3 : null,
        subtitle: 'Last 30 days',
        href: '/dashboard/local-seo/reviews',
        alert: avgStar !== null && avgStar < 3.8,
      }

  // ---------- Reach ----------
  const reachThis = (socialThis.data ?? []).reduce((acc, r) => acc + Number(r.reach ?? 0), 0)
  const reachPrev = (socialPrev.data ?? []).reduce((acc, r) => acc + Number(r.reach ?? 0), 0)
  const hasSocial = (socialThis.data?.length ?? 0) + (socialPrev.data?.length ?? 0) > 0

  const reach: PulseCard = !hasSocial
    ? {
        label: 'Your reach',
        state: 'no-data',
        subtitle: 'Social impressions',
        href: '/dashboard/connected-accounts',
        connectLabel: 'Connect socials',
      }
    : {
        label: 'Your reach',
        state: 'live',
        value: fmtCompact(reachThis),
        // Only show a delta when prior week had meaningful volume — going
        // from 5 to 0 doesn't deserve a "-100%" headline.
        ...(reachPrev >= 50 ? fmtDelta(reachThis, reachPrev) : { delta: null, up: null }),
        subtitle: 'People who saw your content',
        href: '/dashboard/social',
        // Only alarm if absolute volume is meaningful (≥100/week) AND it dropped >30%
        alert: reachPrev >= 100 && (reachThis / reachPrev) < 0.7,
        series: reachSeries,
      }

  return { customers, reputation, reach }
}
