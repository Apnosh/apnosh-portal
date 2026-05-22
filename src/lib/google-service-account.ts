/**
 * Google service-account auth for read-only data pulls (Search Console, GA4).
 *
 * Why: OAuth user connections keep breaking (refresh tokens expire after
 * 7 days while the consent screen is in "Testing", access lapses, etc.),
 * forcing endless "Reconnect" prompts. A service account has no consent
 * screen, no refresh token, and no expiry. The only setup is adding the
 * service account's email as a Full user on each Search Console / GA4
 * property once. After that the backend reads forever, no reconnect.
 *
 * Configure via env GOOGLE_SERVICE_ACCOUNT_JSON: the downloaded JSON key,
 * either raw or base64-encoded (base64 is safest in Vercel). When unset,
 * serviceAccountEnabled() is false and callers fall back to OAuth.
 *
 * No external dependency: the JWT is signed with Node's crypto (RS256).
 */

import crypto from 'crypto'

export const GSC_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly'
export const GA_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly'

interface SAKey { client_email: string; private_key: string }

let cachedKey: SAKey | null | undefined
function loadKey(): SAKey | null {
  if (cachedKey !== undefined) return cachedKey
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim()
  if (!raw) { cachedKey = null; return null }
  try {
    const json = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8')
    const parsed = JSON.parse(json) as Partial<SAKey>
    if (parsed.client_email && parsed.private_key) {
      cachedKey = { client_email: parsed.client_email, private_key: parsed.private_key }
      return cachedKey
    }
    console.error('[service-account] GOOGLE_SERVICE_ACCOUNT_JSON missing client_email/private_key')
  } catch (e) {
    console.error('[service-account] could not parse GOOGLE_SERVICE_ACCOUNT_JSON:', (e as Error).message)
  }
  cachedKey = null
  return null
}

export function serviceAccountEnabled(): boolean {
  return loadKey() !== null
}

export function getServiceAccountEmail(): string | null {
  return loadKey()?.client_email ?? null
}

/* Access tokens are valid ~1h; cache per scope and refresh a minute early. */
const tokenCache = new Map<string, { token: string; expMs: number }>()

export async function getServiceAccountToken(scope: string): Promise<string | null> {
  const key = loadKey()
  if (!key) return null

  const cached = tokenCache.get(scope)
  if (cached && cached.expMs - Date.now() > 60_000) return cached.token

  const now = Math.floor(Date.now() / 1000)
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const header = enc({ alg: 'RS256', typ: 'JWT' })
  const claims = enc({
    iss: key.client_email,
    scope,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })
  let signature: string
  try {
    const signer = crypto.createSign('RSA-SHA256')
    signer.update(`${header}.${claims}`)
    signer.end()
    signature = signer.sign(key.private_key).toString('base64url')
  } catch (e) {
    console.error('[service-account] JWT signing failed:', (e as Error).message)
    return null
  }
  const assertion = `${header}.${claims}.${signature}`

  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    })
    const data = await res.json()
    if (!res.ok || !data.access_token) {
      console.error('[service-account] token exchange failed:', data.error_description || data.error || res.status)
      return null
    }
    tokenCache.set(scope, { token: data.access_token as string, expMs: Date.now() + (data.expires_in ?? 3600) * 1000 })
    return data.access_token as string
  } catch (e) {
    console.error('[service-account] token request error:', (e as Error).message)
    return null
  }
}
