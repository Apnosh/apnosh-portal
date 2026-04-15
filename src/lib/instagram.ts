/**
 * Instagram Graph API helpers.
 *
 * Uses the Meta Graph API (v21.0) to:
 * 1. OAuth: exchange code → short-lived → long-lived token
 * 2. Discovery: list Pages + linked Instagram Business accounts
 * 3. Metrics: pull follower count, reach, impressions, engagement
 *
 * Tokens are stored in Supabase `platform_connections`.
 */

const GRAPH_BASE = 'https://graph.facebook.com/v21.0'
const META_APP_ID = process.env.META_APP_ID!
const META_APP_SECRET = process.env.META_APP_SECRET!
// Instagram Direct Login uses a separate Instagram App ID (different from the Facebook App ID)
const IG_APP_ID = process.env.INSTAGRAM_APP_ID || META_APP_ID
const IG_APP_SECRET = process.env.INSTAGRAM_APP_SECRET || META_APP_SECRET

// Scopes we need:
// - pages_show_list: list Pages the user manages
// - pages_read_engagement: read Page insights
// - instagram_basic: read IG profile info
// - instagram_manage_insights: read IG account insights
// - business_management: access business-level assets
// Facebook-level scopes for OAuth (used for Facebook Page connections).
export const OAUTH_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'business_management',
].join(',')

// Instagram Direct Login scopes — uses instagram.com OAuth instead of facebook.com
// This is the "Instagram API with Instagram Login" flow.
export const IG_DIRECT_SCOPES = [
  'instagram_business_basic',
  'instagram_business_manage_messages',
  'instagram_business_manage_comments',
  'instagram_business_content_publish',
].join(',')

export function getInstagramDirectOAuthUrl(state: string): string {
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/instagram-direct/callback`
  const params = new URLSearchParams({
    client_id: IG_APP_ID,
    redirect_uri: redirectUri,
    scope: IG_DIRECT_SCOPES,
    response_type: 'code',
    state,
    enable_fb_login: '0',
    force_authentication: '1',
  })
  return `https://www.instagram.com/oauth/authorize?${params}`
}

export async function exchangeInstagramDirectCode(code: string): Promise<{
  access_token: string
  user_id: string
  permissions: string[]
}> {
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/instagram-direct/callback`
  const res = await fetch('https://api.instagram.com/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: IG_APP_ID,
      client_secret: IG_APP_SECRET,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code,
    }),
  })
  const data = await res.json()
  if (data.error_type || data.error_message) {
    throw new Error(data.error_message || 'Instagram token exchange failed')
  }
  return data
}

export async function exchangeForLongLivedIgToken(shortToken: string): Promise<{
  access_token: string
  token_type: string
  expires_in: number
}> {
  const params = new URLSearchParams({
    grant_type: 'ig_exchange_token',
    client_secret: IG_APP_SECRET,
    access_token: shortToken,
  })
  const res = await fetch(`https://graph.instagram.com/access_token?${params}`)
  const data = await res.json()
  if (data.error) throw new Error(data.error.message || 'Long-lived IG token exchange failed')
  return data
}

export function getOAuthUrl(state: string): string {
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/instagram/callback`
  const params = new URLSearchParams({
    client_id: META_APP_ID,
    redirect_uri: redirectUri,
    scope: OAUTH_SCOPES,
    response_type: 'code',
    state,
  })
  return `https://www.facebook.com/v21.0/dialog/oauth?${params}`
}

// ── Token exchange ───────────────────────────────────────────

export async function exchangeCodeForToken(code: string): Promise<{
  access_token: string
  token_type: string
  expires_in: number
}> {
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/instagram/callback`
  const params = new URLSearchParams({
    client_id: META_APP_ID,
    client_secret: META_APP_SECRET,
    redirect_uri: redirectUri,
    code,
  })
  const res = await fetch(`${GRAPH_BASE}/oauth/access_token?${params}`)
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error?.message || 'Token exchange failed')
  }
  return res.json()
}

export async function exchangeForLongLivedToken(shortToken: string): Promise<{
  access_token: string
  token_type: string
  expires_in: number
}> {
  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: META_APP_ID,
    client_secret: META_APP_SECRET,
    fb_exchange_token: shortToken,
  })
  const res = await fetch(`${GRAPH_BASE}/oauth/access_token?${params}`)
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error?.message || 'Long-lived token exchange failed')
  }
  return res.json()
}

// ── Discovery ────────────────────────────────────────────────

export interface FacebookPage {
  id: string
  name: string
  access_token: string // Page-level token
  instagram_business_account?: {
    id: string
    username?: string
    profile_picture_url?: string
    followers_count?: number
  }
}

/**
 * List all Pages the user manages, then query each Page individually
 * with its Page token to find linked Instagram Business accounts.
 *
 * The instagram_business_account field requires permissions granted via
 * the Use Case config, which are available on Page tokens but NOT on
 * user tokens in development mode.
 */
export async function listPagesWithInstagram(userToken: string): Promise<FacebookPage[]> {
  // Step 1: Get all Pages with their Page-level tokens
  const res = await fetch(
    `${GRAPH_BASE}/me/accounts?fields=id,name,access_token&limit=100`,
    { headers: { Authorization: `Bearer ${userToken}` } }
  )
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error?.message || 'Failed to list pages')
  }
  const data = await res.json()
  const pages = data.data as { id: string; name: string; access_token: string }[]

  // Step 2: For each Page, query with the PAGE token for instagram_business_account
  const results: FacebookPage[] = []
  for (const page of pages) {
    const pageRes = await fetch(
      `${GRAPH_BASE}/${page.id}?fields=instagram_business_account{id,username,profile_picture_url,followers_count}`,
      { headers: { Authorization: `Bearer ${page.access_token}` } }
    )
    let igAccount: FacebookPage['instagram_business_account'] = undefined
    const pageBody = await pageRes.json()
    console.log(`[ig] Page ${page.name} (${page.id}) raw response:`, JSON.stringify(pageBody))
    if (pageRes.ok && pageBody.instagram_business_account) {
      igAccount = pageBody.instagram_business_account
    }
    results.push({
      id: page.id,
      name: page.name,
      access_token: page.access_token,
      instagram_business_account: igAccount,
    })
  }

  return results
}

// ── Metrics ──────────────────────────────────────────────────

export interface InstagramInsights {
  followers_count: number
  media_count: number
  // Period metrics (last 30 days)
  reach: number
  impressions: number
  accounts_engaged: number
  // Top post
  top_post?: {
    id: string
    caption: string
    media_url: string
    like_count: number
    comments_count: number
    timestamp: string
    permalink: string
  }
}

/**
 * Fetch Instagram Business account insights for the current period.
 * Uses the Page-level access token (which has permissions for the linked IG account).
 */
export async function fetchInstagramInsights(
  igAccountId: string,
  pageToken: string,
): Promise<InstagramInsights> {
  // 1. Basic profile info (followers, media count)
  const profileRes = await fetch(
    `${GRAPH_BASE}/${igAccountId}?fields=followers_count,media_count`,
    { headers: { Authorization: `Bearer ${pageToken}` } }
  )
  const profile = await profileRes.json()

  // 2. Account-level insights (reach, impressions, accounts_engaged) — last 30 days
  let reach = 0
  let impressions = 0
  let accountsEngaged = 0

  try {
    const insightsRes = await fetch(
      `${GRAPH_BASE}/${igAccountId}/insights?metric=reach,impressions,accounts_engaged&period=day&since=${Math.floor(Date.now() / 1000) - 30 * 86400}&until=${Math.floor(Date.now() / 1000)}`,
      { headers: { Authorization: `Bearer ${pageToken}` } }
    )
    if (insightsRes.ok) {
      const insightsData = await insightsRes.json()
      for (const metric of insightsData.data ?? []) {
        const total = metric.values?.reduce((s: number, v: { value: number }) => s + (v.value || 0), 0) ?? 0
        if (metric.name === 'reach') reach = total
        if (metric.name === 'impressions') impressions = total
        if (metric.name === 'accounts_engaged') accountsEngaged = total
      }
    }
  } catch {
    // Insights may not be available for all accounts (need 100+ followers)
    console.error('[instagram] insights fetch failed for', igAccountId)
  }

  // 3. Recent media (top post by engagement)
  let topPost: InstagramInsights['top_post'] = undefined
  try {
    const mediaRes = await fetch(
      `${GRAPH_BASE}/${igAccountId}/media?fields=id,caption,media_url,like_count,comments_count,timestamp,permalink&limit=25`,
      { headers: { Authorization: `Bearer ${pageToken}` } }
    )
    if (mediaRes.ok) {
      const mediaData = await mediaRes.json()
      const posts = mediaData.data ?? []
      if (posts.length > 0) {
        const sorted = posts.sort(
          (a: { like_count: number; comments_count: number }, b: { like_count: number; comments_count: number }) =>
            (b.like_count + b.comments_count) - (a.like_count + a.comments_count)
        )
        const best = sorted[0]
        topPost = {
          id: best.id,
          caption: best.caption || '',
          media_url: best.media_url || '',
          like_count: best.like_count || 0,
          comments_count: best.comments_count || 0,
          timestamp: best.timestamp,
          permalink: best.permalink || '',
        }
      }
    }
  } catch {
    console.error('[instagram] media fetch failed for', igAccountId)
  }

  return {
    followers_count: profile.followers_count ?? 0,
    media_count: profile.media_count ?? 0,
    reach,
    impressions,
    accounts_engaged: accountsEngaged,
    top_post: topPost,
  }
}
