/**
 * Facebook Page insights helpers.
 *
 * Uses the same Meta Graph API + Page tokens from the Instagram OAuth flow.
 * Pulls Page-level metrics: reach, impressions, engagement, followers, posts.
 */

const GRAPH_BASE = 'https://graph.facebook.com/v21.0'

export interface FacebookPageInsights {
  followers_count: number
  page_fans: number
  // 30-day aggregates
  reach: number
  impressions: number
  engagement: number
  // Post-level
  posts_published: number
  reactions: number
  comments: number
  shares: number
  // Top post
  top_post?: {
    id: string
    message: string
    full_picture: string
    created_time: string
    permalink_url: string
    likes: number
    comments: number
    shares: number
  }
}

/**
 * Fetch Facebook Page insights using a Page access token.
 */
export async function fetchFacebookPageInsights(
  pageId: string,
  pageToken: string,
): Promise<FacebookPageInsights> {
  // 1. Page info (followers)
  const pageRes = await fetch(
    `${GRAPH_BASE}/${pageId}?fields=followers_count,fan_count`,
    { headers: { Authorization: `Bearer ${pageToken}` } }
  )
  const page = await pageRes.json()

  // 2. Page insights (30 days)
  let reach = 0
  let impressions = 0
  let engagement = 0

  const since = Math.floor(Date.now() / 1000) - 30 * 86400
  const until = Math.floor(Date.now() / 1000)

  try {
    const insightsRes = await fetch(
      `${GRAPH_BASE}/${pageId}/insights?metric=page_impressions_unique,page_impressions,page_engaged_users&period=day&since=${since}&until=${until}`,
      { headers: { Authorization: `Bearer ${pageToken}` } }
    )
    if (insightsRes.ok) {
      const insightsData = await insightsRes.json()
      for (const metric of insightsData.data ?? []) {
        const total = metric.values?.reduce((s: number, v: { value: number }) => s + (v.value || 0), 0) ?? 0
        if (metric.name === 'page_impressions_unique') reach = total
        if (metric.name === 'page_impressions') impressions = total
        if (metric.name === 'page_engaged_users') engagement = total
      }
    }
  } catch (err) {
    console.error('[facebook] insights fetch failed for page', pageId, err)
  }

  // 3. Recent posts
  let postsPublished = 0
  let totalReactions = 0
  let totalComments = 0
  let totalShares = 0
  let topPost: FacebookPageInsights['top_post'] = undefined

  try {
    const postsRes = await fetch(
      `${GRAPH_BASE}/${pageId}/posts?fields=id,message,full_picture,created_time,permalink_url,likes.summary(true),comments.summary(true),shares&limit=25&since=${since}`,
      { headers: { Authorization: `Bearer ${pageToken}` } }
    )
    if (postsRes.ok) {
      const postsData = await postsRes.json()
      const posts = postsData.data ?? []
      postsPublished = posts.length

      let topEng = 0
      for (const post of posts) {
        const likes = post.likes?.summary?.total_count ?? 0
        const cmts = post.comments?.summary?.total_count ?? 0
        const shrs = post.shares?.count ?? 0

        totalReactions += likes
        totalComments += cmts
        totalShares += shrs

        const eng = likes + cmts + shrs
        if (eng > topEng) {
          topEng = eng
          topPost = {
            id: post.id,
            message: post.message || '',
            full_picture: post.full_picture || '',
            created_time: post.created_time,
            permalink_url: post.permalink_url || '',
            likes,
            comments: cmts,
            shares: shrs,
          }
        }
      }
    }
  } catch (err) {
    console.error('[facebook] posts fetch failed for page', pageId, err)
  }

  return {
    followers_count: page.followers_count ?? page.fan_count ?? 0,
    page_fans: page.fan_count ?? 0,
    reach,
    impressions,
    engagement,
    posts_published: postsPublished,
    reactions: totalReactions,
    comments: totalComments,
    shares: totalShares,
    top_post: topPost,
  }
}
