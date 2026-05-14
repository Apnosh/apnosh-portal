'use server'

/**
 * Backfill historical GBP metrics from the Performance API.
 *
 * Google retains up to 18 months of daily Performance data. Our
 * regular sync only pulls the last 7 days because it's a daily
 * cron; this is the one-time/on-demand path to populate
 * gbp_metrics back as far as Google will let us.
 *
 * The API has a 3-day reporting lag, so the latest day in a
 * backfill is "today − 3". Earliest is "today − 540" (18 months).
 *
 * Two backfill strategies:
 *
 *   - byMonth: one API call per location per month, asking for a
 *     full 28-31 day range. Massively faster than per-day calls
 *     for long ranges.
 *
 *   - Returns a result so the caller can decide whether to retry
 *     or surface the partial state.
 *
 * Per-day rows still land in gbp_metrics — we expand the monthly
 * response into per-day rows on insert so the rest of the app
 * doesn't need a special shape.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { refreshGoogleToken } from '@/lib/google'

const PERFORMANCE_BASE = 'https://businessprofileperformance.googleapis.com/v1'

const METRICS = [
  'BUSINESS_IMPRESSIONS_MOBILE_MAPS',
  'BUSINESS_IMPRESSIONS_MOBILE_SEARCH',
  'BUSINESS_IMPRESSIONS_DESKTOP_MAPS',
  'BUSINESS_IMPRESSIONS_DESKTOP_SEARCH',
  'BUSINESS_DIRECTION_REQUESTS',
  'CALL_CLICKS',
  'WEBSITE_CLICKS',
] as const

export interface BackfillResult {
  ok: boolean
  message?: string
  locationsAttempted: number
  monthsAttempted: number
  daysInserted: number
  errors: Array<{ location: string; month: string; error: string }>
}

interface ConnRow {
  id: string
  access_token: string | null
  refresh_token: string | null
  token_expires_at: string | null
}

async function refreshIfNeeded(conn: ConnRow): Promise<string | null> {
  if (!conn.access_token) return null
  const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0
  if (expiresAt - Date.now() > 60_000) return conn.access_token
  if (!conn.refresh_token) return null
  try {
    const refreshed = await refreshGoogleToken(conn.refresh_token)
    const admin = createAdminClient()
    const newExpires = new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
    await admin
      .from('channel_connections')
      .update({ access_token: refreshed.access_token, token_expires_at: newExpires })
      .eq('id', conn.id)
    return refreshed.access_token
  } catch {
    return null
  }
}

interface DailyValues {
  impressionsMobileMaps: number
  impressionsMobileSearch: number
  impressionsDesktopMaps: number
  impressionsDesktopSearch: number
  directions: number
  calls: number
  websiteClicks: number
}

function emptyDaily(): DailyValues {
  return {
    impressionsMobileMaps: 0,
    impressionsMobileSearch: 0,
    impressionsDesktopMaps: 0,
    impressionsDesktopSearch: 0,
    directions: 0,
    calls: 0,
    websiteClicks: 0,
  }
}

interface ApiSeriesEntry {
  dailyMetric?: string
  timeSeries?: {
    datedValues?: Array<{
      date: { year: number; month: number; day: number }
      value?: string
    }>
  }
}

async function fetchMonthlyMetrics(
  accessToken: string,
  storeCode: string,
  startYmd: string,
  endYmd: string,
): Promise<Map<string, DailyValues>> {
  const [sy, sm, sd] = startYmd.split('-').map(Number)
  const [ey, em, ed] = endYmd.split('-').map(Number)
  const params = new URLSearchParams()
  METRICS.forEach(m => params.append('dailyMetrics', m))
  params.set('dailyRange.startDate.year', String(sy))
  params.set('dailyRange.startDate.month', String(sm))
  params.set('dailyRange.startDate.day', String(sd))
  params.set('dailyRange.endDate.year', String(ey))
  params.set('dailyRange.endDate.month', String(em))
  params.set('dailyRange.endDate.day', String(ed))

  const url = `${PERFORMANCE_BASE}/locations/${storeCode}:fetchMultiDailyMetricsTimeSeries?${params.toString()}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = (body as { error?: { message?: string } }).error?.message || `HTTP ${res.status}`
    throw new Error(msg)
  }

  /* Response shape is multiDailyMetricTimeSeries[]; each entry has
     dailyMetricTimeSeries which can be either a single object or
     an array depending on the response — handle both. */
  const series = ((body as { multiDailyMetricTimeSeries?: unknown[] }).multiDailyMetricTimeSeries ?? [])
  const flat: ApiSeriesEntry[] = []
  for (const s of series) {
    const inner = (s as { dailyMetricTimeSeries?: ApiSeriesEntry[] | ApiSeriesEntry }).dailyMetricTimeSeries
    if (!inner) continue
    if (Array.isArray(inner)) flat.push(...inner)
    else flat.push(inner)
  }

  const byDate = new Map<string, DailyValues>()
  for (const entry of flat) {
    const metric = entry.dailyMetric
    if (!metric) continue
    for (const dv of (entry.timeSeries?.datedValues ?? [])) {
      const y = String(dv.date.year).padStart(4, '0')
      const m = String(dv.date.month).padStart(2, '0')
      const d = String(dv.date.day).padStart(2, '0')
      const key = `${y}-${m}-${d}`
      const v = Number(dv.value ?? 0)
      const existing = byDate.get(key) ?? emptyDaily()
      if (metric === 'BUSINESS_IMPRESSIONS_MOBILE_MAPS') existing.impressionsMobileMaps = v
      else if (metric === 'BUSINESS_IMPRESSIONS_MOBILE_SEARCH') existing.impressionsMobileSearch = v
      else if (metric === 'BUSINESS_IMPRESSIONS_DESKTOP_MAPS') existing.impressionsDesktopMaps = v
      else if (metric === 'BUSINESS_IMPRESSIONS_DESKTOP_SEARCH') existing.impressionsDesktopSearch = v
      else if (metric === 'BUSINESS_DIRECTION_REQUESTS') existing.directions = v
      else if (metric === 'CALL_CLICKS') existing.calls = v
      else if (metric === 'WEBSITE_CLICKS') existing.websiteClicks = v
      byDate.set(key, existing)
    }
  }
  return byDate
}

function monthsRange(monthsBack: number): Array<{ start: string; end: string; label: string }> {
  /* Build a list of month windows ending at today-3 (the API's lag
     boundary) and going back monthsBack months. Each window is the
     calendar month it covers; the most recent one may be partial. */
  const out: Array<{ start: string; end: string; label: string }> = []
  const today = new Date()
  const apiEnd = new Date(today)
  apiEnd.setUTCDate(apiEnd.getUTCDate() - 3)

  let cursor = new Date(Date.UTC(apiEnd.getUTCFullYear(), apiEnd.getUTCMonth(), 1))
  for (let i = 0; i < monthsBack; i++) {
    const monthStart = new Date(cursor)
    const monthEnd = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0))
    /* Clamp to apiEnd if this is the current month. */
    const effectiveEnd = monthEnd > apiEnd ? apiEnd : monthEnd
    out.push({
      start: monthStart.toISOString().slice(0, 10),
      end: effectiveEnd.toISOString().slice(0, 10),
      label: `${monthStart.getUTCFullYear()}-${String(monthStart.getUTCMonth() + 1).padStart(2, '0')}`,
    })
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() - 1, 1))
  }
  return out
}

export async function backfillClientGbpMetrics(
  clientId: string,
  monthsBack = 18,
): Promise<BackfillResult> {
  const admin = createAdminClient()
  const errors: BackfillResult['errors'] = []

  /* Multi-location: pick most recent active; tokens are shared. */
  const { data: connRow } = await admin
    .from('channel_connections')
    .select('id, access_token, refresh_token, token_expires_at')
    .eq('client_id', clientId)
    .eq('channel', 'google_business_profile')
    .eq('status', 'active')
    .neq('platform_account_id', 'pending')
    .order('connected_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!connRow) {
    return { ok: false, message: 'No active connection', locationsAttempted: 0, monthsAttempted: 0, daysInserted: 0, errors: [] }
  }

  const accessToken = await refreshIfNeeded(connRow as ConnRow)
  if (!accessToken) {
    return { ok: false, message: 'Token refresh failed', locationsAttempted: 0, monthsAttempted: 0, daysInserted: 0, errors: [] }
  }

  const { data: locs } = await admin
    .from('gbp_locations')
    .select('store_code, location_name')
    .eq('client_id', clientId)

  const months = monthsRange(monthsBack)
  let daysInserted = 0
  let monthsAttempted = 0

  for (const loc of (locs ?? []) as Array<{ store_code: string; location_name: string }>) {
    for (const m of months) {
      monthsAttempted++
      try {
        const byDate = await fetchMonthlyMetrics(accessToken, loc.store_code, m.start, m.end)
        const rows = Array.from(byDate.entries()).map(([date, v]) => {
          const total = v.impressionsMobileMaps + v.impressionsMobileSearch
                       + v.impressionsDesktopMaps + v.impressionsDesktopSearch
          return {
            client_id: clientId,
            location_id: `gbp_loc_${loc.store_code}`,
            location_name: loc.location_name,
            date,
            directions: v.directions,
            calls: v.calls,
            website_clicks: v.websiteClicks,
            search_views: total,
            impressions_search_mobile: v.impressionsMobileSearch,
            impressions_search_desktop: v.impressionsDesktopSearch,
            impressions_maps_mobile: v.impressionsMobileMaps,
            impressions_maps_desktop: v.impressionsDesktopMaps,
            impressions_total: total,
            source: 'gbp_api_backfill',
          }
        })
        if (rows.length > 0) {
          const { error } = await admin
            .from('gbp_metrics')
            .upsert(rows, { onConflict: 'client_id,location_id,date' })
          if (error) {
            errors.push({ location: loc.location_name, month: m.label, error: error.message })
          } else {
            daysInserted += rows.length
          }
        }
      } catch (err) {
        errors.push({ location: loc.location_name, month: m.label, error: (err as Error).message })
      }
    }
  }

  return {
    ok: true,
    locationsAttempted: (locs ?? []).length,
    monthsAttempted,
    daysInserted,
    errors,
  }
}
