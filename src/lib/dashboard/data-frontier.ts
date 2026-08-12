import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * THE shared data frontier: the last day every ACTIVE daily source has real
 * numbers. Both the funnel headline (stage-values windows) and the chart bars
 * (get-home-metrics daily series) anchor their windows on THIS one date, so a
 * "last 30 days" is the same 30 complete days everywhere and the two can never
 * drift apart again (owner escalation, 2026-08-12).
 *
 * Rules:
 *  - a family (Google Business, social, website) counts only if it has a
 *    non-zero day within the last 14 days — a dead feed can't freeze the charts
 *  - the frontier is the OLDEST active family's newest non-zero day
 *  - floored at today-2 (settling: the newest 1-2 days under-report everywhere)
 */

const DAY = 86_400_000

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

type Row = Record<string, unknown>
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' ? Number(v) || 0 : 0)

/** Newest date among `rows` where any of `keys` is > 0 (rows come newest-first). */
function lastNonZero(rows: Row[], keys: string[]): string | null {
  for (const r of rows) {
    if (keys.some((k) => num(r[k]) > 0)) return String(r.date).slice(0, 10)
  }
  return null
}

export async function getDataFrontier(admin: SupabaseClient, clientId: string): Promise<string> {
  const today = new Date()
  const floor = ymd(new Date(today.getTime() - 2 * DAY))
  const dormantBefore = ymd(new Date(today.getTime() - 14 * DAY))

  const grab = (table: string, cols: string) =>
    admin.from(table).select(`date, ${cols}`).eq('client_id', clientId)
      .order('date', { ascending: false }).limit(14)
      .then(({ data }) => (data ?? []) as unknown as Row[], () => [] as Row[])

  const [gbp, social, web] = await Promise.all([
    grab('gbp_metrics', 'impressions_total, search_views, impressions_search_mobile, impressions_search_desktop, impressions_maps_mobile, impressions_maps_desktop'),
    grab('social_metrics', 'reach, impressions'),
    grab('website_metrics', 'sessions'),
  ])

  const lasts = [
    lastNonZero(gbp, ['impressions_total', 'search_views', 'impressions_search_mobile', 'impressions_search_desktop', 'impressions_maps_mobile', 'impressions_maps_desktop']),
    lastNonZero(social, ['reach', 'impressions']),
    lastNonZero(web, ['sessions']),
  ].filter((d): d is string => !!d && d >= dormantBefore)

  if (!lasts.length) return floor
  const oldest = lasts.reduce((a, b) => (a < b ? a : b))
  return oldest < floor ? oldest : floor
}
