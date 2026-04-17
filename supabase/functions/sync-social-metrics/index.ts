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

  // Optional: sync a single client (from admin trigger), and optional
  // backfill override (pulls last 30 days regardless of existing data).
  let targetClientId: string | null = null
  let forceBackfill = false
  try {
    const body = await req.json()
    targetClientId = body.client_id ?? null
    forceBackfill = body.backfill === true
  } catch {
    // No body = sync all clients, incremental
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
        await syncInstagram(supabase, conn, forceBackfill)
      } else if (conn.platform === 'facebook') {
        await syncFacebook(supabase, conn, forceBackfill)
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
  conn: SocialConnection,
  forceBackfill: boolean = false,
) {
  const token = conn.access_token
  const igUserId = conn.platform_account_id

  // ----- Backfill detection ---------------------------------------------
  // If this client has no Instagram metrics rows yet (or caller forced it),
  // pull the last 30 days of daily insights -- Meta's maximum account-level
  // window. Otherwise we only need yesterday.
  const { count: existingCount } = await supabase
    .from('social_metrics')
    .select('date', { count: 'exact', head: true })
    .eq('client_id', conn.client_id)
    .eq('platform', 'instagram')

  const isBackfill = forceBackfill || !existingCount || existingCount === 0
  const windowDays = isBackfill ? 30 : 1

  // Meta's `reach` time series returns one value per day when requested with
  // period=day and a since/until window. `metric_type=total_value` metrics
  // return a single aggregate across the whole window, so for those we have
  // to loop day-by-day if we want per-day history.
  type MetricResult = { name: string; value: number; error?: string }
  const callInsightRange = async (
    metric: string,
    sinceUnix: number,
    untilUnix: number,
    useTotalValue = false,
  ): Promise<MetricResult & { perDay?: Record<string, number> }> => {
    const totalValueParam = useTotalValue ? '&metric_type=total_value' : ''
    const url = `https://graph.instagram.com/v21.0/${igUserId}/insights?metric=${metric}&period=day&since=${sinceUnix}&until=${untilUnix}${totalValueParam}&access_token=${token}`
    try {
      const res = await fetch(url)
      const data = await res.json()
      if (data.error) return { name: metric, value: 0, error: data.error.message }
      const row = data.data?.[0]
      if (row?.values && Array.isArray(row.values)) {
        // period=day time series -- map each day
        const perDay: Record<string, number> = {}
        for (const v of row.values) {
          const dateKey = v.end_time?.split('T')[0]
          if (dateKey) perDay[dateKey] = Number(v.value) || 0
        }
        const total = Object.values(perDay).reduce((a, b) => a + b, 0)
        return { name: metric, value: total, perDay }
      }
      const val = row?.total_value?.value ?? 0
      return { name: metric, value: Number(val) }
    } catch (err) {
      return { name: metric, value: 0, error: err instanceof Error ? err.message : 'fetch failed' }
    }
  }

  // Sync each day in the window individually so backfill and incremental work
  // the same way. The expensive per-post media fetch only needs to run once.
  const todayMidnight = new Date()
  todayMidnight.setHours(0, 0, 0, 0)

  // Pull a single wide range for reach (supports per-day) up front. For
  // aggregate metrics (views/profile_views/total_interactions), call per day.
  const windowStart = addDays(todayMidnight, -windowDays)
  const reachRange = await callInsightRange(
    'reach',
    Math.floor(windowStart.getTime() / 1000),
    Math.floor(todayMidnight.getTime() / 1000),
  )

  // Loop from oldest day to newest so followers_gained deltas work.
  for (let offset = windowDays; offset >= 1; offset--) {
    const dayDate = addDays(todayMidnight, -offset)
    const dayStr = formatDate(dayDate)
    const daySince = Math.floor(dayDate.getTime() / 1000)
    const dayUntil = Math.floor(addDays(dayDate, 1).getTime() / 1000)

    const [viewsRes, profileViewsRes, interactionsRes] = await Promise.all([
      callInsightRange('views', daySince, dayUntil, true),
      callInsightRange('profile_views', daySince, dayUntil, true),
      callInsightRange('total_interactions', daySince, dayUntil, true),
    ])

    const reach = reachRange.perDay?.[dayStr] ?? 0
    const impressions = viewsRes.value
    const profileVisits = profileViewsRes.value
    const totalInteractions = interactionsRes.value

    await upsertInstagramDay(supabase, conn, {
      dayStr,
      reach,
      impressions,
      profileVisits,
      totalInteractions,
      reachRes: { name: 'reach', value: reach },
      viewsRes,
      profileViewsRes,
      interactionsRes,
      token,
      igUserId,
      // Only fetch media + follower snapshot on the most recent day to avoid
      // hammering the API with 30 identical follower reads.
      skipMediaAndFollowers: offset !== 1,
    })
  }
}

interface InstagramDayArgs {
  dayStr: string
  reach: number
  impressions: number
  profileVisits: number
  totalInteractions: number
  reachRes: { name: string; value: number; error?: string }
  viewsRes: { name: string; value: number; error?: string }
  profileViewsRes: { name: string; value: number; error?: string }
  interactionsRes: { name: string; value: number; error?: string }
  token: string
  igUserId: string
  skipMediaAndFollowers: boolean
}

async function upsertInstagramDay(
  supabase: ReturnType<typeof createClient>,
  conn: SocialConnection,
  args: InstagramDayArgs,
) {
  const {
    dayStr, reach, impressions, profileVisits, totalInteractions,
    reachRes, viewsRes, profileViewsRes, interactionsRes,
    token, igUserId, skipMediaAndFollowers,
  } = args

  // --- Follower count (only on the most recent day; saves API calls).
  // For historical backfill days, we leave followers_total null -- we don't
  // actually know what the count was on that past date.
  let followersTotal: number | null = null
  let followersGained = 0
  let userData: unknown = null
  let mediaData: { data?: Array<{ timestamp?: string }> } = {}
  let topPostId: string | null = null
  let topPostReach = 0
  let mediaEngagement = 0

  if (!skipMediaAndFollowers) {
    const userUrl = `https://graph.instagram.com/v21.0/${igUserId}?fields=followers_count,username&access_token=${token}`
    const userRes = await fetch(userUrl)
    userData = await userRes.json()
    followersTotal = (userData as { followers_count?: number })?.followers_count ?? 0

    // Get previous day's follower count to compute gained
    const prevDate = formatDate(addDays(new Date(dayStr), -1))
    const { data: prevRow } = await supabase
      .from('social_metrics')
      .select('followers_total')
      .eq('client_id', conn.client_id)
      .eq('platform', 'instagram')
      .eq('date', prevDate)
      .maybeSingle()
    // Only compute a delta when BOTH sides are known. If yesterday's row
    // exists but its followers_total is null (backfill placeholder), we
    // genuinely don't know the delta -- recording 1990-0=1990 as "new
    // followers gained yesterday" would be a lie. Leave as null in that case.
    const prevTotal = prevRow?.followers_total
    followersGained = prevTotal != null && followersTotal !== null
      ? followersTotal - prevTotal
      : 0

    // Recent media -- fetch last 30 posts with rich fields for the
    // content-first performance page.
    const mediaFields = [
      'id', 'timestamp', 'caption', 'media_type', 'media_product_type',
      'media_url', 'thumbnail_url', 'permalink',
      'like_count', 'comments_count',
    ].join(',')
    const mediaUrl = `https://graph.instagram.com/v21.0/${igUserId}/media?fields=${mediaFields}&limit=30&access_token=${token}`
    const mediaRes = await fetch(mediaUrl)
    mediaData = await mediaRes.json()

    const postsToUpsert: Array<Record<string, unknown>> = []

    for (const post of (mediaData.data ?? []) as Array<Record<string, unknown>>) {
      const postDate = (post.timestamp as string | undefined)?.split('T')[0]

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
        // Ignore per-post insight failures
      }

      const postReach = postMetrics.reach ?? 0

      if (postDate === dayStr) {
        mediaEngagement += (Number(post.like_count) || 0) + (Number(post.comments_count) || 0)
        if (postReach > topPostReach) {
          topPostReach = postReach
          topPostId = post.id as string
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

    if (postsToUpsert.length > 0) {
      await supabase
        .from('social_posts')
        .upsert(postsToUpsert, { onConflict: 'client_id,platform,external_id' })
    }
  }

  // For backfill days we can still count posts published on that date from
  // whatever media rows we've already stored (the media fetch on the latest
  // day covers the last 30 posts).
  const { data: postsOnDay } = await supabase
    .from('social_posts')
    .select('id, likes, comments')
    .eq('client_id', conn.client_id)
    .eq('platform', 'instagram')
    .gte('posted_at', `${dayStr}T00:00:00Z`)
    .lt('posted_at', `${dayStr}T23:59:59Z`)

  const postsPublished = postsOnDay?.length ?? 0
  if (!skipMediaAndFollowers) {
    // mediaEngagement already accounts for today
  } else if (postsOnDay) {
    mediaEngagement = postsOnDay.reduce(
      (acc, p) => acc + (p.likes ?? 0) + (p.comments ?? 0), 0,
    )
  }

  const engagement = totalInteractions > 0 ? totalInteractions : mediaEngagement

  await supabase
    .from('social_metrics')
    .upsert({
      client_id: conn.client_id,
      platform: 'instagram',
      date: dayStr,
      reach,
      impressions,
      profile_visits: profileVisits,
      followers_total: followersTotal,
      followers_gained: Math.max(0, followersGained),
      engagement,
      posts_published: postsPublished,
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
        backfilled: skipMediaAndFollowers,
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
  conn: SocialConnection,
  forceBackfill: boolean = false,
) {
  const token = conn.access_token
  const pageId = conn.platform_account_id

  // Backfill detection (same pattern as Instagram)
  const { count: existingCount } = await supabase
    .from('social_metrics')
    .select('date', { count: 'exact', head: true })
    .eq('client_id', conn.client_id)
    .eq('platform', 'facebook')

  const isBackfill = forceBackfill || !existingCount || existingCount === 0
  const windowDays = isBackfill ? 30 : 1

  const todayMidnight = new Date()
  todayMidnight.setHours(0, 0, 0, 0)

  type MetricResult = { name: string; value: number; error?: string; perDay?: Record<string, number> }
  const callInsight = async (
    metric: string,
    sinceUnix: number,
    untilUnix: number,
    period: string = 'day',
  ): Promise<MetricResult> => {
    const url = `https://graph.facebook.com/v21.0/${pageId}/insights?metric=${metric}&period=${period}&since=${sinceUnix}&until=${untilUnix}&access_token=${token}`
    try {
      const res = await fetch(url)
      const data = await res.json()
      if (data.error) return { name: metric, value: 0, error: data.error.message }
      const row = data.data?.[0]
      if (row?.values && Array.isArray(row.values)) {
        const perDay: Record<string, number> = {}
        for (const v of row.values) {
          const dateKey = v.end_time?.split('T')[0]
          if (dateKey) perDay[dateKey] = typeof v.value === 'object' ? 0 : Number(v.value) || 0
        }
        const total = Object.values(perDay).reduce((a, b) => a + b, 0)
        return { name: metric, value: total, perDay }
      }
      const val = row?.values?.[0]?.value ?? 0
      return { name: metric, value: typeof val === 'object' ? 0 : Number(val) }
    } catch (err) {
      return { name: metric, value: 0, error: err instanceof Error ? err.message : 'fetch failed' }
    }
  }

  // Pull a single wide range for each metric (FB time-series metrics return
  // per-day values across the whole window).
  const windowStart = addDays(todayMidnight, -windowDays)
  const sinceUnix = Math.floor(windowStart.getTime() / 1000)
  const untilUnix = Math.floor(todayMidnight.getTime() / 1000)

  const [impressionsRes, reachRes, engagementRes] = await Promise.all([
    callInsight('page_views_total', sinceUnix, untilUnix),
    callInsight('page_impressions_unique', sinceUnix, untilUnix),
    callInsight('page_post_engagements', sinceUnix, untilUnix),
  ])

  // Current fan count (only known for today)
  const pageUrl = `https://graph.facebook.com/v21.0/${pageId}?fields=fan_count&access_token=${token}`
  const pageRes = await fetch(pageUrl)
  const pageData = await pageRes.json()
  const currentFollowersTotal = pageData.fan_count ?? 0

  for (let offset = windowDays; offset >= 1; offset--) {
    const dayDate = addDays(todayMidnight, -offset)
    const dayStr = formatDate(dayDate)
    const isLatestDay = offset === 1

    // followers_total is only truly known for the latest day (Meta doesn't
    // give us historical fan counts). Leave null for backfill days.
    const followersTotal: number | null = isLatestDay ? currentFollowersTotal : null

    let followersGained = 0
    if (isLatestDay) {
      const prevDate = formatDate(addDays(dayDate, -1))
      const { data: prevRow } = await supabase
        .from('social_metrics')
        .select('followers_total')
        .eq('client_id', conn.client_id)
        .eq('platform', 'facebook')
        .eq('date', prevDate)
        .maybeSingle()
      // Same guard as Instagram: only compute when both sides are known.
      const prevTotal = prevRow?.followers_total
      followersGained = prevTotal != null && followersTotal !== null
        ? followersTotal - prevTotal
        : 0
    }

    await supabase
      .from('social_metrics')
      .upsert({
        client_id: conn.client_id,
        platform: 'facebook',
        date: dayStr,
        reach: reachRes.perDay?.[dayStr] ?? 0,
        impressions: impressionsRes.perDay?.[dayStr] ?? 0,
        profile_visits: 0,
        followers_total: followersTotal,
        followers_gained: Math.max(0, followersGained),
        engagement: engagementRes.perDay?.[dayStr] ?? 0,
        posts_published: 0,
        raw_data: {
          metrics: {
            page_views_total: impressionsRes,
            page_impressions_unique: reachRes,
            page_post_engagements: engagementRes,
          },
          page: pageData,
          backfilled: !isLatestDay,
        },
      }, {
        onConflict: 'client_id,platform,date',
      })
  }
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
