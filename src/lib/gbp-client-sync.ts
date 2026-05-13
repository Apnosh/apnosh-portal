/**
 * Per-client Google Business Profile sync.
 *
 * Mirrors `syncAgencyMetricsForDate` but for a single client using
 * their own OAuth token from `channel_connections`. The agency flow
 * remains the right path when Apnosh wants one token across many
 * client locations; this is the path when a restaurant owner connects
 * their own listing directly.
 *
 * Does three things in order:
 *   1. Refresh access token if it's about to expire.
 *   2. Enumerate every GBP location the token can reach, upsert each
 *      into `gbp_locations` tied to this client. If the connection is
 *      still in 'pending' (no location picked yet) and the user has
 *      exactly one accessible location, finalize the connection
 *      automatically.
 *   3. Pull yesterday's metrics for every location and upsert them
 *      into `gbp_metrics`. Also call the existing review connector so
 *      reviews flow in at the same time.
 *
 * Updates `channel_connections.last_sync_at` and `.sync_error` so the
 * Connected Accounts card surfaces the latest state.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import {
  refreshGoogleToken,
  listGBPAccounts,
  listGBPLocations,
  runGBPDailyMetrics,
} from '@/lib/google'
import type { ConnectionRow } from '@/lib/integrations/types'

export interface ClientSyncResult {
  ok: boolean
  message?: string
  locationsDiscovered: number
  metricsImported: number
  reviewsImported: number
  errors: string[]
}

interface DiscoveredLocation {
  /** Full path: "locations/{id}" */
  name: string
  title: string
  storeCode?: string
  /** Full path: "accounts/{id}" */
  accountName: string
}

export async function syncClientGbp(clientId: string): Promise<ClientSyncResult> {
  const admin = createAdminClient()
  const errors: string[] = []
  const emptyResult: ClientSyncResult = {
    ok: false, locationsDiscovered: 0, metricsImported: 0, reviewsImported: 0, errors,
  }

  /* 1. Find the connection. We tolerate both 'active' and 'pending'
        — the legacy per-client flow inserts 'pending' and waits for
        a location-picker; this sync auto-finalizes when there's one
        unambiguous location. */
  const { data: connRow } = await admin
    .from('channel_connections')
    .select('*')
    .eq('client_id', clientId)
    .eq('channel', 'google_business_profile')
    .in('status', ['active', 'pending'])
    .order('connected_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const conn = connRow as ConnectionRow | null
  if (!conn) {
    return { ...emptyResult, message: 'No Google Business Profile connection for this client' }
  }
  if (!conn.access_token) {
    return { ...emptyResult, message: 'Connection has no access token' }
  }

  /* 2. Refresh token if it's within 60s of expiry. */
  let accessToken = conn.access_token
  const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0
  if (expiresAt - Date.now() < 60_000 && conn.refresh_token) {
    try {
      const refreshed = await refreshGoogleToken(conn.refresh_token)
      accessToken = refreshed.access_token
      const newExpires = new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
      await admin
        .from('channel_connections')
        .update({ access_token: accessToken, token_expires_at: newExpires })
        .eq('id', conn.id)
    } catch (err) {
      return { ...emptyResult, message: `Token refresh failed: ${(err as Error).message}` }
    }
  }

  /* 3. Enumerate every location the token can see. */
  const allLocations: DiscoveredLocation[] = []
  try {
    const accounts = await listGBPAccounts(accessToken)
    for (const a of accounts) {
      try {
        const locs = await listGBPLocations(accessToken, a.name)
        for (const l of locs) {
          allLocations.push({
            name: l.name,
            title: l.title,
            storeCode: l.storeCode,
            accountName: a.name,
          })
        }
      } catch (err) {
        errors.push(`list locations (${a.accountName}): ${(err as Error).message}`)
      }
    }
  } catch (err) {
    return { ...emptyResult, message: `Failed to list GBP accounts: ${(err as Error).message}` }
  }

  /* 4. Upsert gbp_locations rows so reviews + future metrics can find them. */
  for (const loc of allLocations) {
    /* store_code uniqueness is across-the-board; if another client
       has already claimed this store_code we leave their ownership
       alone and only refresh display fields. */
    const { data: existing } = await admin
      .from('gbp_locations')
      .select('id, client_id')
      .eq('store_code', loc.name.replace('locations/', ''))
      .maybeSingle()

    const storeCode = loc.name.replace('locations/', '')
    if (existing) {
      await admin
        .from('gbp_locations')
        .update({
          location_name: loc.title,
          last_seen_at: new Date().toISOString(),
          /* Only claim it for this client if it was unclaimed before. */
          ...(existing.client_id ? {} : { client_id: clientId }),
        })
        .eq('id', existing.id)
    } else {
      await admin
        .from('gbp_locations')
        .insert({
          store_code: storeCode,
          location_name: loc.title,
          client_id: clientId,
          last_seen_at: new Date().toISOString(),
        })
    }
  }

  /* 5. If the connection is still pending and we have exactly one
        location, finalize it. */
  if (conn.status === 'pending' && allLocations.length === 1) {
    const loc = allLocations[0]
    await admin
      .from('channel_connections')
      .update({
        status: 'active',
        platform_account_id: loc.name.replace('locations/', ''),
        platform_account_name: loc.title,
        metadata: {
          ...(conn.metadata ?? {}),
          account_id: loc.accountName.replace('accounts/', ''),
        },
      })
      .eq('id', conn.id)
  }

  /* 6. Pull the last 7 days of metrics for every location we just
        claimed. The Business Profile Performance API typically has a
        ~3-day aggregation lag, so syncing only yesterday means the
        Local SEO 30-day window stays empty. A 7-day backfill catches
        whatever's actually available and is cheap enough to run
        on-demand from the Sync now button. */
  const targetDates: string[] = []
  for (let daysAgo = 7; daysAgo >= 1; daysAgo--) {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() - daysAgo)
    targetDates.push(d.toISOString().slice(0, 10))
  }

  let metricsImported = 0
  /* Only sync metrics for locations actually tied to this client now
     (covers the "store_code claimed by another client" edge case). */
  const { data: clientLocations } = await admin
    .from('gbp_locations')
    .select('store_code, location_name')
    .eq('client_id', clientId)
  for (const row of clientLocations ?? []) {
    const storeCode = row.store_code as string
    const title = row.location_name as string
    for (const targetDate of targetDates) {
      try {
        const m = await runGBPDailyMetrics(`locations/${storeCode}`, accessToken, targetDate)
        const total =
          m.businessImpressionsMobileMaps +
          m.businessImpressionsMobileSearch +
          m.businessImpressionsDesktopMaps +
          m.businessImpressionsDesktopSearch
        const { error: upsertErr } = await admin.from('gbp_metrics').upsert({
          client_id: clientId,
          location_id: `gbp_loc_${storeCode}`,
          location_name: title,
          date: targetDate,
          directions: m.businessDirectionRequests,
          calls: m.callClicks,
          website_clicks: m.websiteClicks,
          search_views: total,
          impressions_search_mobile: m.businessImpressionsMobileSearch,
          impressions_search_desktop: m.businessImpressionsDesktopSearch,
          impressions_maps_mobile: m.businessImpressionsMobileMaps,
          impressions_maps_desktop: m.businessImpressionsDesktopMaps,
          impressions_total: total,
          source: 'gbp_api_client',
        }, { onConflict: 'client_id,location_id,date' })
        if (upsertErr) errors.push(`metrics ${title} ${targetDate}: ${upsertErr.message}`)
        else metricsImported++
      } catch (err) {
        /* Permission/not-found errors repeat for every date on the
           same location — log once per location, not per date. */
        const msg = (err as Error).message
        const tag = `metrics ${title}: ${msg}`
        if (!errors.includes(tag)) errors.push(tag)
        break
      }
    }
  }

  /* 7. Reviews — fetch directly per (account, location). The shared
        gbpConnector reads accountId from connection.metadata.account_id,
        which only holds one account; this client has locations across
        multiple accounts. We already enumerated (account, location)
        pairs in step 3, so use them directly. v4 endpoint, since
        Google never moved reviews to v1. */
  const STAR_MAP: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 }
  let reviewsImported = 0
  for (const loc of allLocations) {
    const accountId = loc.accountName.replace('accounts/', '')
    const locationId = loc.name.replace('locations/', '')
    try {
      const url = `https://mybusiness.googleapis.com/v4/accounts/${accountId}/locations/${locationId}/reviews?pageSize=50`
      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        const msg = body.error?.message || `HTTP ${res.status}`
        const tag = `reviews ${loc.title}: ${msg}`
        if (!errors.includes(tag)) errors.push(tag)
        continue
      }
      const json = await res.json() as { reviews?: Array<{
        reviewId: string
        reviewer?: { displayName?: string; profilePhotoUrl?: string; isAnonymous?: boolean }
        starRating?: string
        comment?: string
        createTime: string
        updateTime?: string
        reviewReply?: { comment: string; updateTime: string }
        name: string
      }> }
      const reviews = json.reviews ?? []
      for (const r of reviews) {
        const rating = r.starRating ? (STAR_MAP[r.starRating] ?? null) : null
        if (rating === null) continue
        const payload = {
          client_id: clientId,
          source: 'google' as const,
          external_id: r.reviewId,
          rating,
          author_name: r.reviewer?.displayName ?? 'Anonymous',
          author_avatar_url: r.reviewer?.profilePhotoUrl ?? null,
          review_text: r.comment ?? null,
          review_url: null,
          response_text: r.reviewReply?.comment ?? null,
          responded_at: r.reviewReply?.updateTime ?? null,
          posted_at: r.createTime,
          flagged: rating <= 3,
        }
        const { data: existing } = await admin
          .from('reviews')
          .select('id')
          .eq('client_id', clientId)
          .eq('source', 'google')
          .eq('external_id', r.reviewId)
          .maybeSingle()
        if (existing) {
          await admin.from('reviews').update(payload).eq('id', existing.id)
        } else {
          await admin.from('reviews').insert(payload)
          reviewsImported++
        }
      }
    } catch (err) {
      const tag = `reviews ${loc.title}: ${(err as Error).message}`
      if (!errors.includes(tag)) errors.push(tag)
    }
  }

  /* 8. Stamp last_sync_at + any soft error summary. */
  await admin
    .from('channel_connections')
    .update({
      last_sync_at: new Date().toISOString(),
      sync_error: errors.length > 0 ? errors.join('; ').slice(0, 500) : null,
    })
    .eq('id', conn.id)

  return {
    ok: true,
    locationsDiscovered: allLocations.length,
    metricsImported,
    reviewsImported,
    errors,
  }
}
