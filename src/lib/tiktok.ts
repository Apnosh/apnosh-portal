/**
 * TikTok API helpers.
 *
 * Uses TikTok's Login Kit for OAuth and the Business/Research API
 * for reading profile info and video metrics.
 */

import crypto from 'crypto'

const TIKTOK_CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY!
const TIKTOK_CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET!

// Scopes for reading profile + video data
const SCOPES = [
  'user.info.basic',
  'user.info.profile',
  'user.info.stats',
  'video.list',
].join(',')

// PKCE helpers — TikTok v2 requires code_challenge
function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url')
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url')
}

// Store verifiers in memory (keyed by state). In production, use a session/cookie.
const verifierStore = new Map<string, string>()

export function getTikTokOAuthUrl(state: string): string {
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/tiktok/callback`
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = generateCodeChallenge(codeVerifier)

  // Store the verifier so the callback can use it
  verifierStore.set(state, codeVerifier)

  const params = new URLSearchParams({
    client_key: TIKTOK_CLIENT_KEY,
    scope: SCOPES,
    response_type: 'code',
    redirect_uri: redirectUri,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  })
  return `https://www.tiktok.com/v2/auth/authorize/?${params}`
}

export function getCodeVerifier(state: string): string | undefined {
  const v = verifierStore.get(state)
  if (v) verifierStore.delete(state) // one-time use
  return v
}

export async function exchangeTikTokCode(code: string, codeVerifier: string): Promise<{
  access_token: string
  refresh_token: string
  open_id: string
  expires_in: number
  refresh_expires_in: number
}> {
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/tiktok/callback`
  const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: TIKTOK_CLIENT_KEY,
      client_secret: TIKTOK_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  })
  const data = await res.json()
  if (data.error) {
    throw new Error(data.error_description || data.error)
  }
  return data
}

export async function refreshTikTokToken(refreshToken: string): Promise<{
  access_token: string
  refresh_token: string
  expires_in: number
}> {
  const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: TIKTOK_CLIENT_KEY,
      client_secret: TIKTOK_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error_description || data.error)
  return data
}

export interface TikTokProfile {
  open_id: string
  display_name: string
  avatar_url: string
  username: string
  follower_count: number
  following_count: number
  likes_count: number
  video_count: number
}

export async function fetchTikTokProfile(accessToken: string): Promise<TikTokProfile> {
  const res = await fetch(
    'https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url,username,follower_count,following_count,likes_count,video_count',
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  const data = await res.json()
  if (data.error?.code) throw new Error(data.error.message || 'Failed to fetch profile')
  return data.data?.user as TikTokProfile
}

export interface TikTokVideo {
  id: string
  title: string
  cover_image_url: string
  share_url: string
  create_time: number
  like_count: number
  comment_count: number
  share_count: number
  view_count: number
}

export async function fetchTikTokVideos(accessToken: string, maxCount = 20): Promise<TikTokVideo[]> {
  const res = await fetch(
    'https://open.tiktokapis.com/v2/video/list/?fields=id,title,cover_image_url,share_url,create_time,like_count,comment_count,share_count,view_count',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ max_count: maxCount }),
    }
  )
  const data = await res.json()
  if (data.error?.code) throw new Error(data.error.message || 'Failed to fetch videos')
  return (data.data?.videos ?? []) as TikTokVideo[]
}
