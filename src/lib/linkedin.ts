/**
 * LinkedIn API helpers.
 *
 * Uses LinkedIn's OAuth 2.0 with OpenID Connect for auth,
 * and the LinkedIn API for profile + organization data.
 */

// Use the first LinkedIn app for now (has Sign In + Share approved).
// Switch to LINKEDIN_CM_ credentials once Community Management API is approved.
const LINKEDIN_CLIENT_ID = process.env.LINKEDIN_CLIENT_ID!
const LINKEDIN_CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET!

// openid + profile cover Sign In; w_member_social lets us post to
// the connected user's own LinkedIn feed (generally available, no
// Partner approval needed).
//
// Once LinkedIn Community Management API is approved for this app:
//   add r_organization_social, rw_organization_admin, w_organization_social
// and switch to LINKEDIN_CM_CLIENT_ID. Existing tokens will need
// re-authorization to gain the broader scopes.
const SCOPES = [
  'openid',
  'profile',
  'email',
  'w_member_social',
].join(' ')

export function getLinkedInOAuthUrl(state: string): string {
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/linkedin/callback`
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: LINKEDIN_CLIENT_ID,
    redirect_uri: redirectUri,
    state,
    scope: SCOPES,
  })
  return `https://www.linkedin.com/oauth/v2/authorization?${params}`
}

export async function exchangeLinkedInCode(code: string): Promise<{
  access_token: string
  expires_in: number
}> {
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/linkedin/callback`
  const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: LINKEDIN_CLIENT_ID,
      client_secret: LINKEDIN_CLIENT_SECRET,
      redirect_uri: redirectUri,
    }),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error_description || data.error)
  return data
}

export interface LinkedInProfile {
  sub: string // LinkedIn member ID
  name: string
  picture: string
  email?: string
}

export async function fetchLinkedInProfile(accessToken: string): Promise<LinkedInProfile> {
  const res = await fetch('https://api.linkedin.com/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.message || 'Failed to fetch LinkedIn profile')
  }
  return res.json()
}

export interface LinkedInOrgStats {
  follower_count: number
  org_id: string
  org_name: string
}

/**
 * Fetch organizations (Company Pages) the user is admin of.
 */
export async function fetchLinkedInOrganizations(accessToken: string): Promise<{
  id: string
  name: string
  vanityName: string
  logoUrl: string | null
}[]> {
  // Get orgs where user is admin
  const res = await fetch(
    'https://api.linkedin.com/v2/organizationalEntityAcls?q=roleAssignee&role=ADMINISTRATOR&projection=(elements*(organizationalTarget~(id,localizedName,vanityName,logoV2(original~:playableStreams))))',
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )

  if (!res.ok) {
    // May not have org admin permissions — return empty
    return []
  }

  const data = await res.json()
  const orgs: { id: string; name: string; vanityName: string; logoUrl: string | null }[] = []

  for (const el of data.elements ?? []) {
    const org = el['organizationalTarget~']
    if (org) {
      orgs.push({
        id: String(org.id),
        name: org.localizedName || '',
        vanityName: org.vanityName || '',
        logoUrl: null,
      })
    }
  }
  return orgs
}

/**
 * Fetch follower count for an organization.
 */
export async function fetchOrgFollowerCount(
  accessToken: string,
  orgId: string,
): Promise<number> {
  try {
    const res = await fetch(
      `https://api.linkedin.com/v2/networkSizes/urn:li:organization:${orgId}?edgeType=CompanyFollowedByMember`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    if (!res.ok) return 0
    const data = await res.json()
    return data.firstDegreeSize ?? 0
  } catch {
    return 0
  }
}

/**
 * Fetch recent posts and their engagement for an organization.
 */
export async function fetchOrgPosts(
  accessToken: string,
  orgId: string,
): Promise<{
  posts_count: number
  total_likes: number
  total_comments: number
  total_shares: number
  total_impressions: number
  top_post?: { text: string; url: string; likes: number; comments: number }
}> {
  try {
    const res = await fetch(
      `https://api.linkedin.com/v2/ugcPosts?q=authors&authors=List(urn:li:organization:${orgId})&count=25`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    if (!res.ok) return { posts_count: 0, total_likes: 0, total_comments: 0, total_shares: 0, total_impressions: 0 }

    const data = await res.json()
    const posts = data.elements ?? []

    let totalLikes = 0
    let totalComments = 0
    let totalShares = 0
    let topPost: { text: string; url: string; likes: number; comments: number } | undefined
    let topEng = 0

    // For each post, try to get social metadata
    for (const post of posts) {
      try {
        const statsRes = await fetch(
          `https://api.linkedin.com/v2/socialActions/${post.id}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        )
        if (statsRes.ok) {
          const stats = await statsRes.json()
          const likes = stats.likesSummary?.totalLikes ?? 0
          const comments = stats.commentsSummary?.totalFirstLevelComments ?? 0

          totalLikes += likes
          totalComments += comments

          const eng = likes + comments
          if (eng > topEng) {
            topEng = eng
            const text = post.specificContent?.['com.linkedin.ugc.ShareContent']?.shareCommentary?.text || ''
            topPost = {
              text: text.slice(0, 200),
              url: `https://www.linkedin.com/feed/update/${post.id}`,
              likes,
              comments,
            }
          }
        }
      } catch { /* skip individual post errors */ }
    }

    return {
      posts_count: posts.length,
      total_likes: totalLikes,
      total_comments: totalComments,
      total_shares: totalShares,
      total_impressions: 0,
      top_post: topPost,
    }
  } catch {
    return { posts_count: 0, total_likes: 0, total_comments: 0, total_shares: 0, total_impressions: 0 }
  }
}
