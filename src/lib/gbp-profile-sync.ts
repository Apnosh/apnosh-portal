/**
 * Sync the basic profile fields from Google Business Profile into
 * gbp_locations. Pulls via the Business Information API v1 (the same
 * endpoint gbp-listing.ts already uses for reads/writes) and persists
 * phone / website / address / hours / categories / description into
 * our database so the audit, dashboard, and cross-feature lookups
 * have the real data — not stale empty rows.
 *
 * Designed to be safe to call frequently. The Business Information
 * API has generous quotas (compared to v4) so a daily refresh is fine.
 * Called from /api/cron/gbp-client-sync alongside existing metrics sync.
 */

'use server'

import { createClient as createAdminClient } from '@supabase/supabase-js'
import { getClientListing } from './gbp-listing'

interface SyncResult {
  ok: boolean
  locationId?: string
  fields?: {
    phone?: string | null
    website?: string | null
    primaryCategory?: string | null
    descriptionPresent?: boolean
    hoursPresent?: boolean
  }
  error?: string
}

function getAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/**
 * Pull the live GBP profile for a client and persist into gbp_locations.
 * Uses the existing gbp-listing.getClientListing() function (Business
 * Information API v1). Does NOT touch metrics — separate sync owns those.
 */
export async function syncGBPProfileForClient(clientId: string): Promise<SyncResult> {
  const admin = getAdmin()
  const listing = await getClientListing(clientId, null)
  if (!listing.ok) {
    return { ok: false, error: listing.error }
  }

  /* resourceName is "accounts/{accountId}/locations/{locationId}".
     Our gbp_locations table keys on the locationId portion (store_code). */
  const match = listing.resourceName.match(/locations\/(\d+)/)
  const storeCode = match?.[1]
  if (!storeCode) {
    return { ok: false, error: `Unexpected resourceName: ${listing.resourceName}` }
  }

  const fields = listing.fields
  /* The Business Information API doesn't return storefrontAddress on
     getClientListing's read. We rely on syncClientGbp() (which uses
     listGBPLocations) to populate address separately. Don't touch
     it here so we don't blow away good data. */

  /* Hours: WeeklyHours is Record<DayKey, periods[]> — non-null if ANY
     day has at least one open period. Store the whole object as jsonb. */
  const hasHours = fields.regularHours
    && Object.values(fields.regularHours).some(periods => periods.length > 0)
  const hoursJson = hasHours ? fields.regularHours : null

  /* Categories may be null (location with no category set, rare). */
  const primaryCategory = fields.categories?.primary?.displayName ?? null
  const additionalCategories = (fields.categories?.additional && fields.categories.additional.length > 0)
    ? fields.categories.additional
    : null

  const update: Record<string, unknown> = {
    phone: fields.primaryPhone,
    website: fields.websiteUri,
    primary_category: primaryCategory,
    additional_categories: additionalCategories,
    profile_description: fields.description,
    last_profile_sync_at: new Date().toISOString(),
  }
  if (hoursJson) {
    update.hours = hoursJson
  }
  if (listing.title) {
    update.location_name = listing.title
  }

  const { error } = await admin
    .from('gbp_locations')
    .update(update)
    .eq('client_id', clientId)
    .eq('store_code', storeCode)
  if (error) {
    return { ok: false, error: error.message }
  }

  return {
    ok: true,
    locationId: storeCode,
    fields: {
      phone: fields.primaryPhone,
      website: fields.websiteUri,
      primaryCategory,
      descriptionPresent: !!fields.description,
      hoursPresent: !!hoursJson,
    },
  }
}

/**
 * Bulk variant — runs sync for every active GBP-connected client.
 * Called from the daily cron. Caps at 50 clients/run for safety;
 * larger fleets should paginate or shard.
 */
export async function syncAllGBPProfiles(): Promise<{
  scanned: number
  ok: number
  failed: number
  errors: Array<{ clientId: string; error: string }>
}> {
  const admin = getAdmin()
  const { data } = await admin
    .from('channel_connections')
    .select('client_id')
    .eq('channel', 'google_business_profile')
    .eq('status', 'active')
    .not('access_token', 'is', null)
    .limit(50) as { data: Array<{ client_id: string }> | null }

  const clients = data ?? []
  const report = { scanned: clients.length, ok: 0, failed: 0, errors: [] as Array<{ clientId: string; error: string }> }

  for (const c of clients) {
    try {
      const r = await syncGBPProfileForClient(c.client_id)
      if (r.ok) report.ok += 1
      else { report.failed += 1; report.errors.push({ clientId: c.client_id, error: r.error ?? 'unknown' }) }
    } catch (err) {
      report.failed += 1
      report.errors.push({ clientId: c.client_id, error: (err as Error).message })
    }
  }
  return report
}
