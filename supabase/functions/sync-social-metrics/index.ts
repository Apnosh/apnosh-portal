/**
 * Supabase Edge Function: sync-social-metrics
 *
 * Pulls daily metrics from Instagram Graph API and Facebook Page Insights,
 * writes to social_metrics table. Refreshes tokens nearing expiry.
 *
 * Triggered daily via pg_cron or manually from admin panel.
 *
 * Environment variables required:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   (Meta app credentials stored in social_connections rows)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SocialConnection {
  id: string
  client_id: string
  platform: string
  platform_account_id: string
  platform_account_name: string | null
  access_token: string
  refresh_token: string | null
  token_expires_at: string | null
  sync_status: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Optional: sync a single client (from admin trigger)
  let targetClientId: string | null = null
  try {
    const body = await req.json()
    targetClientId = body.client_id ?? null
  } catch {
    // No body = sync all clients
  }

  // Fetch active connections
  let query = supabase
    .from('social_connections')
    .select('*')
    .neq('sync_status', 'disconnected')

  if (targetClientId) {
    query = query.eq('client_id', targetClientId)
  }

  const { data: connections, error: connError } = await query

  if (connError) {
    console.error('Failed to fetch connections:', connError.message)
    return new Response(JSON.stringify({ error: connError.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const results: Array<{ client_id: string; platform: string; status: string; error?: string }> = []

  for (const conn of (connections as SocialConnection[]) ?? []) {
    try {
      if (conn.platform === 'instagram') {
        await syncInstagram(supabase, conn)
      } else if (conn.platform === 'facebook') {
        await syncFacebook(supabase, conn)
      }

      // Check token expiry and refresh if needed
      await maybeRefreshToken(supabase, conn)

      // Update sync status
      await supabase
        .from('social_connections')
        .update({ last_sync_at: new Date().toISOString(), sync_status: 'active', sync_error: null })
        .eq('id', conn.id)

      results.push({ client_id: conn.client_id, platform: conn.platform, status: 'success' })
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error'
      console.error(`Sync failed for ${conn.platform} (client ${conn.client_id}):`, errorMsg)

      await supabase
        .from('social_connections')
        .update({ sync_status: 'error', sync_error: errorMsg })
        .eq('id', conn.id)

      results.push({ client_id: conn.client_id, platform: conn.platform, status: 'error', error: errorMsg })
    }
  }

  return new Response(JSON.stringify({ synced: results.length, results }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})

// ---------------------------------------------------------------------------
// Instagram Sync
// ---------------------------------------------------------------------------

async function syncInstagram(
  supabase: ReturnType<typeof createClient>,
  conn: SocialConnection
) {
  const yesterday = getYesterday()
  const yesterdayUnix = Math.floor(yesterday.getTime() / 1000)
  const todayUnix = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000)
  const token = conn.access_token
  const igUserId = conn.platform_account_id

  // 1. Account insights (reach, impressions)
  const insightsUrl = `https://graph.instagram.com/v21.0/${igUserId}/insights?metric=impressions,reach&period=day&since=${yesterdayUnix}&until=${todayUnix}&access_token=${token}`
  const insightsRes = await fetch(insightsUrl)
  const insightsData = await insightsRes.json()

  let reach = 0
  let impressions = 0

  if (insightsData.data) {
    for (const metric of insightsData.data) {
      const value = metric.values?.[0]?.value ?? 0
      if (metric.name === 'reach') reach = value
      if (metric.name === 'impressions') impressions = value
    }
  }

  // 2. Follower count
  const userUrl = `https://graph.instagram.com/v21.0/${igUserId}?fields=followers_count&access_token=${token}`
  const userRes = await fetch(userUrl)
  const userData = await userRes.json()
  const followersTotal = userData.followers_count ?? 0

  // Get previous day's follower count to compute gained
  const prevDate = formatDate(addDays(yesterday, -1))
  const { data: prevRow } = await supabase
    .from('social_metrics')
    .select('followers_total')
    .eq('client_id', conn.client_id)
    .eq('platform', 'instagram')
    .eq('date', prevDate)
    .maybeSingle()

  const followersGained = prevRow ? followersTotal - (prevRow.followers_total ?? 0) : 0

  // 3. Recent media (engagement + top post)
  const mediaUrl = `https://graph.instagram.com/v21.0/${igUserId}/media?fields=id,timestamp,like_count,comments_count,media_type&limit=10&access_token=${token}`
  const mediaRes = await fetch(mediaUrl)
  const mediaData = await mediaRes.json()

  let engagement = 0
  let topPostId: string | null = null
  let topPostReach = 0

  const yesterdayStr = formatDate(yesterday)
  for (const post of mediaData.data ?? []) {
    const postDate = post.timestamp?.split('T')[0]
    if (postDate !== yesterdayStr) continue

    const postEngagement = (post.like_count ?? 0) + (post.comments_count ?? 0)
    engagement += postEngagement

    // Get per-post reach
    try {
      const postInsightsUrl = `https://graph.instagram.com/v21.0/${post.id}/insights?metric=impressions,reach&access_token=${token}`
      const postInsightsRes = await fetch(postInsightsUrl)
      const postInsights = await postInsightsRes.json()

      let postReach = 0
      for (const m of postInsights.data ?? []) {
        if (m.name === 'reach') postReach = m.values?.[0]?.value ?? 0
      }

      if (postReach > topPostReach) {
        topPostReach = postReach
        topPostId = post.id
      }
    } catch {
      // Skip individual post insights if they fail
    }
  }

  // 4. Upsert into social_metrics
  await supabase
    .from('social_metrics')
    .upsert({
      client_id: conn.client_id,
      platform: 'instagram',
      date: yesterdayStr,
      reach,
      impressions,
      profile_visits: 0, // Not available via basic API
      followers_total: followersTotal,
      followers_gained: Math.max(0, followersGained),
      engagement,
      posts_published: (mediaData.data ?? []).filter(
        (p: { timestamp?: string }) => p.timestamp?.split('T')[0] === yesterdayStr
      ).length,
      top_post_id: topPostId,
      top_post_reach: topPostReach,
      raw_data: { insights: insightsData, user: userData },
    }, {
      onConflict: 'client_id,platform,date',
    })
}

// ---------------------------------------------------------------------------
// Facebook Sync
// ---------------------------------------------------------------------------

async function syncFacebook(
  supabase: ReturnType<typeof createClient>,
  conn: SocialConnection
) {
  const yesterday = getYesterday()
  const yesterdayStr = formatDate(yesterday)
  const token = conn.access_token
  const pageId = conn.platform_account_id

  // Page insights
  const sinceUnix = Math.floor(yesterday.getTime() / 1000)
  const untilUnix = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000)

  const insightsUrl = `https://graph.facebook.com/v21.0/${pageId}/insights?metric=page_impressions,page_post_engagements,page_fan_adds&period=day&since=${sinceUnix}&until=${untilUnix}&access_token=${token}`
  const insightsRes = await fetch(insightsUrl)
  const insightsData = await insightsRes.json()

  let impressions = 0
  let engagement = 0
  let followersGained = 0

  if (insightsData.data) {
    for (const metric of insightsData.data) {
      const value = metric.values?.[0]?.value ?? 0
      if (metric.name === 'page_impressions') impressions = value
      if (metric.name === 'page_post_engagements') engagement = value
      if (metric.name === 'page_fan_adds') followersGained = value
    }
  }

  // Get page fan count (total followers)
  const pageUrl = `https://graph.facebook.com/v21.0/${pageId}?fields=fan_count&access_token=${token}`
  const pageRes = await fetch(pageUrl)
  const pageData = await pageRes.json()
  const followersTotal = pageData.fan_count ?? 0

  await supabase
    .from('social_metrics')
    .upsert({
      client_id: conn.client_id,
      platform: 'facebook',
      date: yesterdayStr,
      reach: 0, // page_reach requires different API call
      impressions,
      profile_visits: 0,
      followers_total: followersTotal,
      followers_gained: Math.max(0, followersGained),
      engagement,
      posts_published: 0,
      raw_data: { insights: insightsData, page: pageData },
    }, {
      onConflict: 'client_id,platform,date',
    })
}

// ---------------------------------------------------------------------------
// Token Refresh
// ---------------------------------------------------------------------------

async function maybeRefreshToken(
  supabase: ReturnType<typeof createClient>,
  conn: SocialConnection
) {
  if (!conn.token_expires_at) return

  const expiresAt = new Date(conn.token_expires_at)
  const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  if (expiresAt > sevenDaysFromNow) return

  if (conn.platform === 'instagram') {
    // Instagram long-lived token refresh
    const refreshUrl = `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${conn.access_token}`
    const res = await fetch(refreshUrl)
    const data = await res.json()

    if (data.access_token) {
      const newExpiry = new Date(Date.now() + (data.expires_in ?? 5184000) * 1000)
      await supabase
        .from('social_connections')
        .update({
          access_token: data.access_token,
          token_expires_at: newExpiry.toISOString(),
        })
        .eq('id', conn.id)
    }
  } else if (conn.platform === 'facebook') {
    // Facebook long-lived token refresh
    const appId = Deno.env.get('FACEBOOK_APP_ID') || Deno.env.get('META_APP_ID')
    const appSecret = Deno.env.get('FACEBOOK_APP_SECRET') || Deno.env.get('META_APP_SECRET')
    if (!appId || !appSecret) return

    const refreshUrl = `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${conn.access_token}`
    const res = await fetch(refreshUrl)
    const data = await res.json()

    if (data.access_token) {
      const newExpiry = new Date(Date.now() + (data.expires_in ?? 5184000) * 1000)
      await supabase
        .from('social_connections')
        .update({
          access_token: data.access_token,
          token_expires_at: newExpiry.toISOString(),
        })
        .eq('id', conn.id)
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getYesterday(): Date {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  d.setHours(0, 0, 0, 0)
  return d
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0]
}

function addDays(d: Date, n: number): Date {
  const result = new Date(d)
  result.setDate(result.getDate() + n)
  return result
}
