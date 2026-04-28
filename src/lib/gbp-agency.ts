/**
 * Agency-wide Google Business Profile helpers.
 *
 * The single OAuth grant in `integrations.provider = 'google_business'`
 * gives Apnosh API access to every location the granting Google account
 * holds Manager on. This module:
 *   - keeps the access token fresh (refresh on expiry)
 *   - enumerates every location across every account
 *   - pulls daily metrics and routes them to the right client_id by
 *     fuzzy-matching location title against clients.name
 *
 * Used by /api/cron/gbp-api-sync (daily) and the manual Sync Now
 * button on the Local SEO admin tab.
 */

import { createClient as createAdminClient, SupabaseClient } from '@supabase/supabase-js'
import {
  refreshGoogleToken,
  listGBPAccounts,
  listGBPLocations,
  runGBPDailyMetrics,
  type GBPLocation,
} from '@/lib/google'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminDb = SupabaseClient<any, 'public', any>

function adminDb(): AdminDb {
  return createAdminClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  }) as AdminDb
}

interface IntegrationRow {
  id: string
  access_token: string
  refresh_token: string | null
  token_expires_at: string | null
  metadata: { email?: string; scopes?: string[] } | null
}

/**
 * Read the current agency token, refreshing if it's within the next
 * minute of expiry. Persists any rotation.
 */
export async function getAgencyAccessToken(): Promise<{
  accessToken: string
  email: string | null
} | null> {
  const db = adminDb()
  const { data } = await db
    .from('integrations')
    .select('id, access_token, refresh_token, token_expires_at, metadata')
    .eq('provider', 'google_business')
    .maybeSingle()
  const row = data as IntegrationRow | null
  if (!row) return null

  const expiresAt = row.token_expires_at ? new Date(row.token_expires_at).getTime() : 0
  const bufferMs = 60 * 1000
  const email = row.metadata?.email ?? null

  if (expiresAt - Date.now() > bufferMs) {
    return { accessToken: row.access_token, email }
  }

  if (!row.refresh_token) {
    return null
  }

  try {
    const refreshed = await refreshGoogleToken(row.refresh_token)
    const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
    await db.from('integrations').update({
      access_token: refreshed.access_token,
      token_expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
    }).eq('id', row.id)
    return { accessToken: refreshed.access_token, email }
  } catch (err) {
    console.error('[gbp-agency] refresh failed:', (err as Error).message)
    return null
  }
}

/**
 * Enumerate every GBP location the agency token has Manager access to.
 * Walks accounts -> locations.
 */
export async function listAllAgencyLocations(accessToken: string): Promise<Array<GBPLocation & {
  accountName: string
  accountDisplayName: string
}>> {
  const accounts = await listGBPAccounts(accessToken)
  const all: Array<GBPLocation & { accountName: string; accountDisplayName: string }> = []
  for (const acct of accounts) {
    try {
      const locs = await listGBPLocations(accessToken, acct.name)
      for (const loc of locs) {
        all.push({ ...loc, accountName: acct.name, accountDisplayName: acct.accountName })
      }
    } catch (err) {
      console.error(`[gbp-agency] listLocations failed for ${acct.name}:`, (err as Error).message)
    }
  }
  return all
}

// ---------------------------------------------------------------------------
// Fuzzy match GBP location -> client (same algorithm as CSV backfill)
// ---------------------------------------------------------------------------

function normalize(s: string): string {
  return s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

function score(a: string, b: string): number {
  const na = normalize(a), nb = normalize(b)
  if (na === nb) return 1
  if (na.includes(nb) || nb.includes(na)) return 0.85
  const aT = new Set(na.split(' ').filter(t => t.length > 2))
  const bT = new Set(nb.split(' ').filter(t => t.length > 2))
  if (aT.size === 0 || bT.size === 0) return 0
  let overlap = 0
  for (const t of aT) if (bT.has(t)) overlap++
  return overlap / Math.max(aT.size, bT.size)
}

interface ClientRow { id: string; name: string; slug: string }

export function matchLocationToClient(
  locationTitle: string,
  clients: ClientRow[],
): ClientRow | null {
  let best: { client: ClientRow; score: number } | null = null
  for (const c of clients) {
    const s = score(locationTitle, c.name)
    if (!best || s > best.score) best = { client: c, score: s }
  }
  return best && best.score >= 0.5 ? best.client : null
}

// ---------------------------------------------------------------------------
// Main daily sync. Pulls yesterday's metrics for every location.
// ---------------------------------------------------------------------------

export interface SyncResult {
  locationsTotal: number
  locationsMatched: number
  locationsUnmatched: string[]
  metricsImported: number
  errors: Array<{ location: string; error: string }>
}

/**
 * Sync the metrics for a single date (YYYY-MM-DD) across every
 * location the agency token can reach. Defaults to yesterday.
 */
export async function syncAgencyMetricsForDate(date?: string): Promise<{
  ok: boolean
  message?: string
  data?: SyncResult
}> {
  const tok = await getAgencyAccessToken()
  if (!tok) {
    return { ok: false, message: 'Agency Google Business Profile not connected. Connect it from /admin/settings.' }
  }

  const targetDate = date ?? (() => {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    return d.toISOString().slice(0, 10)
  })()

  const db = adminDb()
  const { data: clientsRaw } = await db.from('clients').select('id, name, slug')
  const clients = (clientsRaw ?? []) as ClientRow[]

  const locations = await listAllAgencyLocations(tok.accessToken)

  const result: SyncResult = {
    locationsTotal: locations.length,
    locationsMatched: 0,
    locationsUnmatched: [],
    metricsImported: 0,
    errors: [],
  }

  for (const loc of locations) {
    const client = matchLocationToClient(loc.title, clients)
    if (!client) {
      result.locationsUnmatched.push(loc.title)
      continue
    }
    result.locationsMatched++

    try {
      const m = await runGBPDailyMetrics(loc.name, tok.accessToken, targetDate)
      const total =
        m.businessImpressionsMobileMaps +
        m.businessImpressionsMobileSearch +
        m.businessImpressionsDesktopMaps +
        m.businessImpressionsDesktopSearch

      const locationId = loc.name.replace('locations/', 'gbp_loc_')

      // Make sure the gbp_connections row exists so the client tab shows "last synced X"
      await db.from('gbp_connections').upsert({
        client_id: client.id,
        location_id: locationId,
        location_name: loc.title,
        connection_type: 'oauth',
        last_sync_at: new Date().toISOString(),
        sync_status: 'active',
      }, { onConflict: 'client_id,location_id' })

      const { error: upsertErr } = await db.from('gbp_metrics').upsert({
        client_id: client.id,
        location_id: locationId,
        location_name: loc.title,
        date: targetDate,
        directions: m.businessDirectionRequests,
        calls: m.callClicks,
        website_clicks: m.websiteClicks,
        search_views: total, // legacy column
        impressions_search_mobile: m.businessImpressionsMobileSearch,
        impressions_search_desktop: m.businessImpressionsDesktopSearch,
        impressions_maps_mobile: m.businessImpressionsMobileMaps,
        impressions_maps_desktop: m.businessImpressionsDesktopMaps,
        impressions_total: total,
        source: 'gbp_api',
      }, { onConflict: 'client_id,location_id,date' })

      if (upsertErr) {
        result.errors.push({ location: loc.title, error: upsertErr.message })
      } else {
        result.metricsImported++
      }
    } catch (err) {
      result.errors.push({ location: loc.title, error: (err as Error).message })
    }
  }

  return { ok: true, data: result }
}
