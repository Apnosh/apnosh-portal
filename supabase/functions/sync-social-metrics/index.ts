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

  // --- Insights: each metric is its own call so one deprecation doesn't
  // blow up the whole sync. Meta v21 split metrics into two buckets:
  //   period=day         -> reach (time-series)
  //   metric_type=total_value -> views, profile_views, total_interactions
  // "impressions" was deprecated; "views" replaces it.

  type MetricResult = { name: string; value: number; error?: string }
  const callInsight = async (metric: string, useTotalValue = false): Promise<MetricResult> => {
    const totalValueParam = useTotalValue ? '&metric_type=total_value' : ''
    const url = `https://graph.instagram.com/v21.0/${igUserId}/insights?metric=${metric}&period=day&since=${yesterdayUnix}&until=${todayUnix}${totalValueParam}&access_token=${token}`
    try {
      const res = await fetch(url)
      const data = await res.json()
      if (data.error) return { name: metric, value: 0, error: data.error.message }
      // total_value responses put the number in total_value.value; period=day responses put it in values[0].value
      const row = data.data?.[0]
      const val = row?.total_value?.value ?? row?.values?.[0]?.value ?? 0
      return { name: metric, value: Number(val) }
    } catch (err) {
      return { name: metric, value: 0, error: err instanceof Error ? err.message : 'fetch failed' }
    }
  }

  const [reachRes, viewsRes, profileViewsRes, interactionsRes] = await Promise.all([
    callInsight('reach'),
    callInsight('views', true),
    callInsight('profile_views', true),
    callInsight('total_interactions', true),
  ])

  const reach = reachRes.value
  const impressions = viewsRes.value // v21 rename: "views" is the new "impressions"
  const profileVisits = profileViewsRes.value
  const totalInteractions = interactionsRes.value

  // --- Follower count
  const userUrl = `https://graph.instagram.com/v21.0/${igUserId}?fields=followers_count,username&access_token=${token}`
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

  // 3. Recent media -- fetch last 30 posts with rich fields for the
  // content-first performance page. Upserts per-post rows into social_posts
  // so the UI can render top posts, content-type breakdowns, and posting
  // cadence.
  const mediaFields = [
    'id', 'timestamp', 'caption', 'media_type', 'media_product_type',
    'media_url', 'thumbnail_url', 'permalink',
    'like_count', 'comments_count',
  ].join(',')
  const mediaUrl = `https://graph.instagram.com/v21.0/${igUserId}/media?fields=${mediaFields}&limit=30&access_token=${token}`
  const mediaRes = await fetch(mediaUrl)
  const mediaData = await mediaRes.json()

  let mediaEngagement = 0
  let topPostId: string | null = null
  let topPostReach = 0

  const yesterdayStr = formatDate(yesterday)
  const postsToUpsert: Array<Record<string, unknown>> = []

  for (const post of mediaData.data ?? []) {
    const postDate = post.timestamp?.split('T')[0]

    // Per-post insights: best-effort fetch of the metrics that matter.
    // Different media types accept different metric sets in v21; we try a
    // broad set and let the per-metric catch handle individual rejections.
    const postMetrics: Record<string, number> = {}
    let postInsightsRaw: unknown = null
    try {
      const metricList = post.media_type === 'VIDEO' || post.media_product_type === 'REELS'
        ? 'reach,saved,shares,total_interactions,views'
        : 'reach,saved,shares,total_interactions'
      const postInsightsUrl = `https://graph.instagram.com/v21.0/${post.id}/insights?metric=${metricList}&access_token=${token}`
      const postInsightsRes = await fetch(postInsightsUrl)
      const insightsJson = await postInsightsRes.json()
      postInsightsRaw = insightsJson
      for (const m of insightsJson.data ?? []) {
        postMetrics[m.name] = m.values?.[0]?.value ?? m.total_value?.value ?? 0
      }
    } catch {
      // Ignore per-post insight failures -- we still store the post itself
    }

    const postReach = postMetrics.reach ?? 0

    // Track the best post from yesterday for the daily social_metrics row
    if (postDate === yesterdayStr) {
      mediaEngagement += (post.like_count ?? 0) + (post.comments_count ?? 0)
      if (postReach > topPostReach) {
        topPostReach = postReach
        topPostId = post.id
      }
    }

    postsToUpsert.push({
      client_id: conn.client_id,
      platform: 'instagram',
      external_id: post.id,
      permalink: post.permalink,
      media_type: post.media_type,
      media_product_type: post.media_product_type,
      caption: post.caption ?? null,
      media_url: post.media_url ?? null,
      thumbnail_url: post.thumbnail_url ?? post.media_url ?? null,
      posted_at: post.timestamp,
      reach: postReach,
      likes: post.like_count ?? null,
      comments: post.comments_count ?? null,
      saves: postMetrics.saved ?? null,
      shares: postMetrics.shares ?? null,
      video_views: postMetrics.views ?? null,
      total_interactions: postMetrics.total_interactions ?? null,
      raw_data: { post, insights: postInsightsRaw },
      synced_at: new Date().toISOString(),
    })
  }

  // Bulk upsert all posts we fetched
  if (postsToUpsert.length > 0) {
    await supabase
      .from('social_posts')
      .upsert(postsToUpsert, { onConflict: 'client_id,platform,external_id' })
  }

  // Prefer the account-level total_interactions metric; fall back to sum of
  // per-post likes+comments if that metric errored or returned 0.
  const engagement = totalInteractions > 0 ? totalInteractions : mediaEngagement

  // 4. Upsert into social_metrics with detailed raw_data for debugging
  await supabase
    .from('social_metrics')
    .upsert({
      client_id: conn.client_id,
      platform: 'instagram',
      date: yesterdayStr,
      reach,
      impressions,
      profile_visits: profileVisits,
      followers_total: followersTotal,
      followers_gained: Math.max(0, followersGained),
      engagement,
      posts_published: (mediaData.data ?? []).filter(
        (p: { timestamp?: string }) => p.timestamp?.split('T')[0] === yesterdayStr
      ).length,
      top_post_id: topPostId,
      top_post_reach: topPostReach,
      raw_data: {
        metrics: {
          reach: reachRes,
          views: viewsRes,
          profile_views: profileViewsRes,
          total_interactions: interactionsRes,
        },
        user: userData,
        media_engagement_fallback: mediaEngagement,
      },
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

  const sinceUnix = Math.floor(yesterday.getTime() / 1000)
  const untilUnix = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000)

  // Same per-metric try pattern as Instagram. FB Page Insights keeps
  // deprecating metrics in minor API versions; isolating each call keeps
  // partial data flowing when one breaks.
  type MetricResult = { name: string; value: number; error?: string }
  const callInsight = async (metric: string, period: string = 'day'): Promise<MetricResult> => {
    const url = `https://graph.facebook.com/v21.0/${pageId}/insights?metric=${metric}&period=${period}&since=${sinceUnix}&until=${untilUnix}&access_token=${token}`
    try {
      const res = await fetch(url)
      const data = await res.json()
      if (data.error) return { name: metric, value: 0, error: data.error.message }
      const row = data.data?.[0]
      const val = row?.values?.[0]?.value ?? 0
      return { name: metric, value: typeof val === 'object' ? 0 : Number(val) }
    } catch (err) {
      return { name: metric, value: 0, error: err instanceof Error ? err.message : 'fetch failed' }
    }
  }

  // Try the common FB Page Insights metrics. Each one is independent; if
  // Meta deprecates one we still get partial data from the others.
  //
  // Known v21 deprecations (Meta removed them without a clean replacement):
  //   page_impressions      -> try page_views_total instead
  //   page_fan_adds         -> compute from daily fan_count delta
  //   page_fans_by_X        -> most demographic metrics gone
  const [impressionsRes, reachRes, engagementRes] = await Promise.all([
    callInsight('page_views_total'),              // was page_impressions
    callInsight('page_impressions_unique'),       // FB's version of "reach"
    callInsight('page_post_engagements'),
  ])

  // Get page fan count (total followers)
  const pageUrl = `https://graph.facebook.com/v21.0/${pageId}?fields=fan_count&access_token=${token}`
  const pageRes = await fetch(pageUrl)
  const pageData = await pageRes.json()
  const followersTotal = pageData.fan_count ?? 0

  // Compute followers_gained from yesterday's fan_count, since page_fan_adds
  // was deprecated. If yesterday's row doesn't exist, report 0 (first sync).
  const prevDate = formatDate(addDays(yesterday, -1))
  const { data: prevRow } = await supabase
    .from('social_metrics')
    .select('followers_total')
    .eq('client_id', conn.client_id)
    .eq('platform', 'facebook')
    .eq('date', prevDate)
    .maybeSingle()
  const followersGained = prevRow ? followersTotal - (prevRow.followers_total ?? 0) : 0

  await supabase
    .from('social_metrics')
    .upsert({
      client_id: conn.client_id,
      platform: 'facebook',
      date: yesterdayStr,
      reach: reachRes.value,
      impressions: impressionsRes.value,
      profile_visits: 0,      // FB profile_views deprecated; no clean replacement
      followers_total: followersTotal,
      followers_gained: Math.max(0, followersGained),
      engagement: engagementRes.value,
      posts_published: 0,     // TODO: /feed endpoint count
      raw_data: {
        metrics: {
          page_views_total: impressionsRes,
          page_impressions_unique: reachRes,
          page_post_engagements: engagementRes,
        },
        page: pageData,
        followers_gained_computed: followersGained,
      },
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
