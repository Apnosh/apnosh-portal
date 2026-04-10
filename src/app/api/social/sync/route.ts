import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fetchFacebookPageInsights } from '@/lib/facebook'
import { fetchTikTokProfile, fetchTikTokVideos } from '@/lib/tiktok'
import { fetchOrgFollowerCount, fetchOrgPosts } from '@/lib/linkedin'

/**
 * POST /api/social/sync
 *
 * Unified social media sync — pulls metrics for all connected platforms
 * (Instagram, Facebook, TikTok, LinkedIn) and upserts into social_metrics.
 *
 * Body: { clientId?: string, platform?: string }
 * - clientId: sync one client (omit for all)
 * - platform: sync one platform (omit for all connected)
 */
export async function POST(request: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Auth: admin or service role
  const authHeader = request.headers.get('authorization')
  const isServiceRole = authHeader === `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`

  if (!isServiceRole) {
    const { createClient: createServerClient } = await import('@/lib/supabase/server')
    const serverSb = await createServerClient()
    const { data: { user } } = await serverSb.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const { data: profile } = await serverSb.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Admin required' }, { status: 403 })
  }

  let body: { clientId?: string; platform?: string } = {}
  try { body = await request.json() } catch {}

  // Get connections to sync
  let query = supabase
    .from('platform_connections')
    .select('*')
    .not('access_token', 'is', null)

  if (body.clientId) query = query.eq('client_id', body.clientId)
  if (body.platform) query = query.eq('platform', body.platform)

  const { data: connections } = await query
  if (!connections || connections.length === 0) {
    return NextResponse.json({ synced: 0, message: 'No connections found' })
  }

  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()
  const results: { clientId: string; platform: string; success: boolean; error?: string }[] = []

  for (const conn of connections) {
    try {
      if (conn.platform === 'instagram') {
        // Instagram sync via Instagram API
        await syncInstagram(supabase, conn, month, year)
        results.push({ clientId: conn.client_id, platform: 'instagram', success: true })
      } else if (conn.platform === 'facebook') {
        // Facebook sync via Page token
        await syncFacebook(supabase, conn, month, year)
        results.push({ clientId: conn.client_id, platform: 'facebook', success: true })
      } else if (conn.platform === 'tiktok') {
        await syncTikTok(supabase, conn, month, year)
        results.push({ clientId: conn.client_id, platform: 'tiktok', success: true })
      } else if (conn.platform === 'linkedin') {
        await syncLinkedIn(supabase, conn, month, year)
        results.push({ clientId: conn.client_id, platform: 'linkedin', success: true })
      } else {
        results.push({ clientId: conn.client_id, platform: conn.platform, success: false, error: 'Platform not yet supported' })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.error(`[social sync] ${conn.platform} failed for ${conn.client_id}:`, message)
      results.push({ clientId: conn.client_id, platform: conn.platform, success: false, error: message })
    }
  }

  return NextResponse.json({
    synced: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    results,
  })
}

// ── Instagram sync ──────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function syncInstagram(
  supabase: any,
  conn: Record<string, unknown>,
  month: number,
  year: number,
) {
  const token = conn.access_token as string
  const clientId = conn.client_id as string
  const IG_API = 'https://graph.instagram.com/v21.0'
  const since = Math.floor(Date.now() / 1000) - 30 * 86400
  const until = Math.floor(Date.now() / 1000)

  // Profile
  const profile = await fetch(`${IG_API}/me?fields=id,username,followers_count,media_count`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then(r => r.json())

  // Reach
  let reach = 0
  try {
    const reachRes = await fetch(`${IG_API}/me/insights?metric=reach&period=day&since=${since}&until=${until}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json())
    reach = reachRes.data?.[0]?.values?.reduce((s: number, v: { value: number }) => s + (v.value || 0), 0) || 0
  } catch {}

  // Media
  const mediaRes = await fetch(`${IG_API}/me/media?fields=id,caption,media_url,like_count,comments_count,timestamp,permalink&limit=25`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then(r => r.json())
  const posts = mediaRes.data || []

  const totalLikes = posts.reduce((s: number, p: { like_count?: number }) => s + (p.like_count || 0), 0)
  const totalComments = posts.reduce((s: number, p: { comments_count?: number }) => s + (p.comments_count || 0), 0)

  let topPost = null as null | { permalink: string; caption: string; media_url: string; engagement: number }
  let topEng = 0
  for (const p of posts) {
    const eng = (p.like_count || 0) + (p.comments_count || 0)
    if (eng > topEng) {
      topEng = eng
      topPost = { permalink: p.permalink, caption: p.caption || '', media_url: p.media_url || '', engagement: eng }
    }
  }

  // Demographics
  let demographics = null as Record<string, unknown> | null
  try {
    const demo: Record<string, unknown[]> = { cities: [], countries: [], ages: [], gender: [] }
    for (const breakdown of ['city', 'country', 'age', 'gender'] as const) {
      const res = await fetch(`${IG_API}/me/insights?metric=follower_demographics&period=lifetime&metric_type=total_value&breakdown=${breakdown}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then(r => r.json())
      const results = (res.data?.[0]?.total_value?.breakdowns?.[0]?.results || []) as { dimension_values: string[]; value: number }[]
      const sorted = results.sort((a, b) => b.value - a.value)
      if (breakdown === 'city') demo.cities = sorted.map(r => ({ name: r.dimension_values[0], count: r.value }))
      if (breakdown === 'country') demo.countries = sorted.map(r => ({ name: r.dimension_values[0], count: r.value }))
      if (breakdown === 'age') demo.ages = sorted.map(r => ({ range: r.dimension_values[0], count: r.value }))
      if (breakdown === 'gender') demo.gender = sorted.map(r => ({ type: r.dimension_values[0], count: r.value }))
    }
    demographics = demo
  } catch {}

  await supabase.from('social_metrics').upsert({
    client_id: clientId,
    platform: 'instagram',
    month, year,
    posts_published: posts.length,
    total_reach: reach,
    total_impressions: 0,
    total_engagement: totalLikes + totalComments,
    likes: totalLikes,
    comments: totalComments,
    shares: 0,
    saves: 0,
    followers_count: profile.followers_count ?? 0,
    followers_change: 0,
    top_post_url: topPost?.permalink ?? null,
    top_post_caption: topPost?.caption?.slice(0, 200) ?? null,
    top_post_engagement: topEng || null,
    top_post_image_url: topPost?.media_url ?? null,
    demographics,
    recorded_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'client_id,platform,month,year' })
}

// ── Facebook sync ───────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function syncFacebook(
  supabase: any,
  conn: Record<string, unknown>,
  month: number,
  year: number,
) {
  const pageToken = conn.access_token as string
  const pageId = conn.page_id as string
  const clientId = conn.client_id as string

  if (!pageId) throw new Error('No page_id on connection')

  const insights = await fetchFacebookPageInsights(pageId, pageToken)

  await supabase.from('social_metrics').upsert({
    client_id: clientId,
    platform: 'facebook',
    month, year,
    posts_published: insights.posts_published,
    total_reach: insights.reach,
    total_impressions: insights.impressions,
    total_engagement: insights.reactions + insights.comments + insights.shares,
    likes: insights.reactions,
    comments: insights.comments,
    shares: insights.shares,
    saves: 0,
    followers_count: insights.followers_count,
    followers_change: 0,
    top_post_url: insights.top_post?.permalink_url ?? null,
    top_post_caption: insights.top_post?.message?.slice(0, 200) ?? null,
    top_post_engagement: insights.top_post ? (insights.top_post.likes + insights.top_post.comments + insights.top_post.shares) : null,
    top_post_image_url: insights.top_post?.full_picture ?? null,
    recorded_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'client_id,platform,month,year' })
}

// ── TikTok sync ─────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function syncTikTok(
  supabase: any,
  conn: Record<string, unknown>,
  month: number,
  year: number,
) {
  const token = conn.access_token as string
  const clientId = conn.client_id as string

  const profile = await fetchTikTokProfile(token)
  const videos = await fetchTikTokVideos(token, 25)

  const totalLikes = videos.reduce((s, v) => s + (v.like_count || 0), 0)
  const totalComments = videos.reduce((s, v) => s + (v.comment_count || 0), 0)
  const totalShares = videos.reduce((s, v) => s + (v.share_count || 0), 0)
  const totalViews = videos.reduce((s, v) => s + (v.view_count || 0), 0)

  // Find top video by total engagement
  let topVideo = null as typeof videos[0] | null
  let topEng = 0
  for (const v of videos) {
    const eng = (v.like_count || 0) + (v.comment_count || 0) + (v.share_count || 0)
    if (eng > topEng) { topEng = eng; topVideo = v }
  }

  await supabase.from('social_metrics').upsert({
    client_id: clientId,
    platform: 'tiktok',
    month, year,
    posts_published: videos.length,
    total_reach: totalViews, // TikTok "reach" is essentially views
    total_impressions: totalViews,
    total_engagement: totalLikes + totalComments + totalShares,
    likes: totalLikes,
    comments: totalComments,
    shares: totalShares,
    saves: 0,
    followers_count: profile.follower_count || 0,
    followers_change: 0,
    top_post_url: topVideo?.share_url ?? null,
    top_post_caption: topVideo?.title?.slice(0, 200) ?? null,
    top_post_engagement: topEng || null,
    top_post_image_url: topVideo?.cover_image_url ?? null,
    recorded_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'client_id,platform,month,year' })
}

// ── LinkedIn sync ───────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function syncLinkedIn(
  supabase: any,
  conn: Record<string, unknown>,
  month: number,
  year: number,
) {
  const token = conn.access_token as string
  const clientId = conn.client_id as string
  const orgId = conn.ig_account_id as string // reused field for org/member ID

  if (!orgId) throw new Error('No organization ID stored')

  const followers = await fetchOrgFollowerCount(token, orgId)
  const posts = await fetchOrgPosts(token, orgId)

  await supabase.from('social_metrics').upsert({
    client_id: clientId,
    platform: 'linkedin',
    month, year,
    posts_published: posts.posts_count,
    total_reach: posts.total_impressions,
    total_impressions: posts.total_impressions,
    total_engagement: posts.total_likes + posts.total_comments + posts.total_shares,
    likes: posts.total_likes,
    comments: posts.total_comments,
    shares: posts.total_shares,
    saves: 0,
    followers_count: followers,
    followers_change: 0,
    top_post_url: posts.top_post?.url ?? null,
    top_post_caption: posts.top_post?.text ?? null,
    top_post_engagement: posts.top_post ? (posts.top_post.likes + posts.top_post.comments) : null,
    top_post_image_url: null,
    recorded_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'client_id,platform,month,year' })
}
