'use server'

import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseYelpAlias, type YelpPreview } from '@/lib/yelp-helpers'

// ---------------------------------------------------------------------------
// Unified connection type for the Connected Accounts hub
// ---------------------------------------------------------------------------

export type ConnectionCategory = 'social' | 'google' | 'reviews'

export type ConnectionStatus = 'connected' | 'expired' | 'error' | 'pending' | 'setting_up'

export interface UnifiedConnection {
  id: string
  source: 'platform_connections' | 'channel_connections'
  platform: string                // machine id: 'instagram', 'facebook', 'google_analytics', etc.
  label: string                   // display name: "Instagram", "Google Analytics"
  category: ConnectionCategory
  accountName: string | null      // "@apnosh" or "Apnosh - Seattle"
  profileUrl: string | null
  status: ConnectionStatus
  friendlyStatus: string          // "Connected", "Needs attention", "Expired", "Setting up"
  lastSyncAt: string | null
  syncError: string | null
  connectedAt: string | null
  actions: { canReconnect: boolean; canDisconnect: boolean; reconnectUrl: string | null }
}

// ---------------------------------------------------------------------------
// Platform metadata
// ---------------------------------------------------------------------------

const PLATFORM_META: Record<string, {
  label: string
  category: ConnectionCategory
  reconnectPath: string | null
  profileUrlBuilder?: (accountName: string | null) => string | null
}> = {
  instagram: {
    label: 'Instagram',
    category: 'social',
    reconnectPath: '/api/auth/instagram',
    profileUrlBuilder: (n) => n ? `https://instagram.com/${n.replace(/^@/, '')}` : null,
  },
  facebook: {
    label: 'Facebook',
    category: 'social',
    reconnectPath: '/api/auth/instagram', // Meta OAuth handles both
  },
  tiktok: {
    label: 'TikTok',
    category: 'social',
    reconnectPath: '/api/auth/tiktok',
    profileUrlBuilder: (n) => n ? `https://tiktok.com/@${n.replace(/^@/, '')}` : null,
  },
  linkedin: {
    label: 'LinkedIn',
    category: 'social',
    reconnectPath: '/api/auth/linkedin',
  },
  google_analytics: {
    label: 'Google Analytics',
    category: 'google',
    reconnectPath: '/api/auth/google',
  },
  google_search_console: {
    label: 'Google Search Console',
    category: 'google',
    reconnectPath: '/api/auth/google-search-console',
  },
  google_business_profile: {
    label: 'Google Business Profile',
    category: 'google',
    reconnectPath: '/api/auth/google-business',
  },
  yelp: {
    label: 'Yelp',
    category: 'reviews',
    // Yelp uses a URL-based connect flow, not OAuth -- the "reconnect" button
    // sends them back to the same form to paste a fresh URL.
    reconnectPath: '/dashboard/connected-accounts/yelp',
    profileUrlBuilder: (n) => n ? `https://www.yelp.com/biz/${n}` : null,
  },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function resolveClientId(userId: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data: biz } = await admin
    .from('businesses').select('client_id').eq('owner_id', userId).maybeSingle()
  if (biz?.client_id) return biz.client_id
  const { data: cu } = await admin
    .from('client_users').select('client_id').eq('auth_user_id', userId).maybeSingle()
  return cu?.client_id ?? null
}

function humanizeSyncError(err: string | null): string | null {
  if (!err) return null
  const lower = err.toLowerCase()
  if (lower.includes('permission') || lower.includes('not.*enabled') || lower.includes('awaiting')) {
    return 'Waiting on Google to approve API access. No action needed — we\'re on it.'
  }
  if (lower.includes('token') && (lower.includes('expired') || lower.includes('invalid'))) {
    return 'Your login expired. Click Reconnect to refresh.'
  }
  if (lower.includes('403') || lower.includes('denied')) {
    return 'We don\'t have permission to read this account. Click Reconnect and accept all permissions.'
  }
  if (lower.includes('quota') || lower.includes('rate')) {
    return 'Hit a rate limit. This will sort itself out — try again in a few hours.'
  }
  // Default: first sentence of error
  const firstSentence = err.split('.')[0]
  return firstSentence.length > 120 ? 'Something went wrong with the last sync. Your account manager has been notified.' : firstSentence
}

// ---------------------------------------------------------------------------
// getConnectionsForClient -- unified list reading both tables
// ---------------------------------------------------------------------------

export async function getConnectionsForClient(): Promise<UnifiedConnection[]> {
  const userSupabase = await createServerClient()
  const { data: { user } } = await userSupabase.auth.getUser()
  if (!user) return []

  const admin = createAdminClient()
  const clientId = await resolveClientId(user.id)
  if (!clientId) return []

  const [pc, cc] = await Promise.all([
    admin
      .from('platform_connections')
      .select('id, platform, username, page_name, profile_url, connected_at, expires_at, access_token')
      .eq('client_id', clientId),
    admin
      .from('channel_connections')
      .select('id, channel, platform_account_name, platform_url, status, last_sync_at, sync_error, connected_at, access_token')
      .eq('client_id', clientId)
      .neq('platform_account_id', 'pending'),
  ])

  const results: UnifiedConnection[] = []

  // Social platform_connections
  for (const r of pc.data ?? []) {
    if (!r.access_token) continue
    const meta = PLATFORM_META[r.platform]
    if (!meta) continue

    const isExpired = r.expires_at ? new Date(r.expires_at) < new Date() : false
    const status: ConnectionStatus = isExpired ? 'expired' : 'connected'

    const accountName = r.username || r.page_name || null
    const profileUrl = r.profile_url || (meta.profileUrlBuilder ? meta.profileUrlBuilder(accountName) : null)

    results.push({
      id: r.id,
      source: 'platform_connections',
      platform: r.platform,
      label: meta.label,
      category: meta.category,
      accountName,
      profileUrl,
      status,
      friendlyStatus: status === 'expired' ? 'Needs reconnect' : 'Connected',
      lastSyncAt: null, // platform_connections doesn't track this directly; sync-social-metrics uses social_connections
      syncError: null,
      connectedAt: r.connected_at,
      actions: {
        canReconnect: !!meta.reconnectPath,
        canDisconnect: true,
        reconnectUrl: meta.reconnectPath,
      },
    })
  }

  // Google channel_connections
  for (const r of cc.data ?? []) {
    if (!r.access_token) continue
    const meta = PLATFORM_META[r.channel]
    if (!meta) continue

    // Normalize status
    let status: ConnectionStatus = 'connected'
    let friendlyStatus = 'Connected'
    if (r.status === 'error') {
      status = 'error'
      friendlyStatus = 'Needs attention'
    } else if (r.status === 'pending') {
      status = 'pending'
      friendlyStatus = 'Setting up'
    } else if (r.status === 'disconnected') {
      status = 'expired'
      friendlyStatus = 'Disconnected'
    } else if (r.sync_error) {
      // Active but with sync_error means still working (gracefully pending for things like GBP API approval)
      status = 'connected'
      friendlyStatus = 'Connected (pending data)'
    }

    results.push({
      id: r.id,
      source: 'channel_connections',
      platform: r.channel,
      label: meta.label,
      category: meta.category,
      accountName: r.platform_account_name,
      profileUrl: r.platform_url,
      status,
      friendlyStatus,
      lastSyncAt: r.last_sync_at,
      syncError: humanizeSyncError(r.sync_error),
      connectedAt: r.connected_at,
      actions: {
        canReconnect: !!meta.reconnectPath,
        canDisconnect: true,
        reconnectUrl: meta.reconnectPath,
      },
    })
  }

  return results
}

// ---------------------------------------------------------------------------
// Disconnect a platform
// ---------------------------------------------------------------------------

export async function disconnectPlatform(
  source: 'platform_connections' | 'channel_connections',
  connectionId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const userSupabase = await createServerClient()
  const { data: { user } } = await userSupabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = createAdminClient()
  const clientId = await resolveClientId(user.id)
  if (!clientId) return { success: false, error: 'No client context' }

  // Verify the connection belongs to this client before deleting
  const { data: existing } = await admin
    .from(source)
    .select('client_id')
    .eq('id', connectionId)
    .maybeSingle()

  if (!existing || existing.client_id !== clientId) {
    return { success: false, error: 'Connection not found' }
  }

  const { error } = await admin.from(source).delete().eq('id', connectionId)
  if (error) return { success: false, error: error.message }

  return { success: true }
}

// ---------------------------------------------------------------------------
// Get the list of possible platforms (for "Add more" section)
// ---------------------------------------------------------------------------

/* Trigger a manual sync for a single connection. Owned + scoped to
   the caller's client so a restaurant owner can refresh their own
   data without needing admin access to the agency cron. */
export async function syncConnection(
  source: 'platform_connections' | 'channel_connections',
  connectionId: string
): Promise<{ success: true; locationsDiscovered: number; metricsImported: number; reviewsImported: number; errors: string[] } | { success: false; error: string }> {
  const userSupabase = await createServerClient()
  const { data: { user } } = await userSupabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = createAdminClient()
  const clientId = await resolveClientId(user.id)
  if (!clientId) return { success: false, error: 'No client context' }

  const { data: existing } = await admin
    .from(source)
    .select('client_id, channel, platform')
    .eq('id', connectionId)
    .maybeSingle()

  if (!existing || existing.client_id !== clientId) {
    return { success: false, error: 'Connection not found' }
  }

  /* Right now only Google Business Profile has a per-client sync
     path. Other channels still rely on background crons. */
  const channelOrPlatform = (existing.channel ?? existing.platform) as string
  if (source === 'channel_connections' && channelOrPlatform === 'google_business_profile') {
    const { syncClientGbp } = await import('@/lib/gbp-client-sync')
    const r = await syncClientGbp(clientId)
    if (!r.ok) return { success: false, error: r.message ?? 'Sync failed' }
    return {
      success: true,
      locationsDiscovered: r.locationsDiscovered,
      metricsImported: r.metricsImported,
      reviewsImported: r.reviewsImported,
      errors: r.errors,
    }
  }

  return { success: false, error: 'Sync not supported for this connection yet' }
}

export async function getAvailablePlatforms() {
  return Object.entries(PLATFORM_META).map(([id, meta]) => ({
    id,
    label: meta.label,
    category: meta.category,
    connectPath: meta.reconnectPath,
  }))
}

// ---------------------------------------------------------------------------
// Yelp-specific connect flow (no OAuth; user pastes their Yelp URL)
// ---------------------------------------------------------------------------

/**
 * Fetches business details from Yelp to preview the business before saving.
 * Used to show the user "we found: [Starbucks in Seattle, 3.9★]" so they can
 * confirm before committing.
 */
export async function previewYelpBusiness(
  input: string,
): Promise<{ success: true; preview: YelpPreview } | { success: false; error: string }> {
  const alias = parseYelpAlias(input)
  if (!alias) {
    return {
      success: false,
      error: "That doesn't look like a Yelp business link. Paste the URL from the top of your Yelp page -- something like https://www.yelp.com/biz/your-business-name.",
    }
  }

  const apiKey = process.env.YELP_API_KEY
  if (!apiKey) {
    return { success: false, error: 'Yelp is not configured on the server. Contact support.' }
  }

  const res = await fetch(`https://api.yelp.com/v3/businesses/${encodeURIComponent(alias)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  const data = await res.json()
  if (!res.ok) {
    if (res.status === 404) {
      return { success: false, error: "We couldn't find that business on Yelp. Double-check the URL." }
    }
    return { success: false, error: data?.error?.description ?? `Yelp API returned ${res.status}` }
  }

  return {
    success: true,
    preview: {
      alias: data.alias,
      name: data.name,
      rating: Number(data.rating ?? 0),
      review_count: Number(data.review_count ?? 0),
      is_closed: Boolean(data.is_closed),
      is_claimed: Boolean(data.is_claimed),
      url: data.url,
      city: data.location?.city ?? null,
      state: data.location?.state ?? null,
      categories: (data.categories ?? []).map((c: { title: string }) => c.title),
    },
  }
}

/**
 * Saves a verified Yelp connection for the current client and kicks off
 * the first sync immediately so the user sees data right away.
 */
export async function connectYelp(
  input: string,
): Promise<{ success: true; preview: YelpPreview } | { success: false; error: string }> {
  const userSupabase = await createServerClient()
  const { data: { user } } = await userSupabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const clientId = await resolveClientId(user.id)
  if (!clientId) return { success: false, error: 'No client context' }

  const verify = await previewYelpBusiness(input)
  if (!verify.success) return verify

  const admin = createAdminClient()

  // Wipe any prior yelp connection for this client first (handles reconnect
  // the same way the Google callbacks do, and avoids ON CONFLICT surprises).
  await admin
    .from('channel_connections')
    .delete()
    .eq('client_id', clientId)
    .eq('channel', 'yelp')

  const { error: insertErr } = await admin
    .from('channel_connections')
    .insert({
      client_id: clientId,
      channel: 'yelp',
      connection_type: 'api_key',
      platform_account_id: verify.preview.alias,
      platform_account_name: verify.preview.name,
      platform_url: verify.preview.url,
      status: 'active',
      connected_by: user.id,
      connected_at: new Date().toISOString(),
      metadata: {
        rating: verify.preview.rating,
        review_count: verify.preview.review_count,
        is_closed: verify.preview.is_closed,
        is_claimed: verify.preview.is_claimed,
        city: verify.preview.city,
        state: verify.preview.state,
        categories: verify.preview.categories,
      },
    })

  if (insertErr) return { success: false, error: insertErr.message }

  // Fire-and-forget first sync so review_metrics gets populated right away.
  // We don't await this -- if it fails, the daily cron picks it up tomorrow.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (supabaseUrl && serviceKey) {
    fetch(`${supabaseUrl}/functions/v1/sync-yelp-metrics`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ client_id: clientId }),
    }).catch(() => { /* best effort */ })
  }

  return { success: true, preview: verify.preview }
}
