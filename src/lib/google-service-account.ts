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
 * Two ways to authenticate as that service account, tried in order:
 *
 *   1. KEYLESS Workload Identity Federation (PREFERRED, no secret exists).
 *      Vercel mints a short-lived OIDC token for the deployment; we exchange
 *      it at Google STS for a federated token, then impersonate the service
 *      account to get a read scope token. Nothing is downloaded or stored;
 *      the org policy that blocks service-account KEY creation is never
 *      touched (WIF needs an IAM pool + a binding, not a key). Configure
 *      with four NON-SECRET identifiers:
 *        GCP_PROJECT_NUMBER
 *        GCP_WORKLOAD_IDENTITY_POOL_ID
 *        GCP_WORKLOAD_IDENTITY_PROVIDER_ID
 *        GCP_SERVICE_ACCOUNT_EMAIL
 *
 *   2. LEGACY downloaded JSON key (fallback). Configure via env
 *      GOOGLE_SERVICE_ACCOUNT_JSON: the downloaded JSON key, either raw or
 *      base64-encoded (base64 is safest in Vercel). The JWT is self-signed
 *      with Node's crypto (RS256).
 *
 * When NEITHER is configured, serviceAccountEnabled() is false and callers
 * fall back to per-account OAuth.
 */

import crypto from 'crypto'
import { getVercelOidcToken } from '@vercel/functions/oidc'

export const GSC_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly'
export const GA_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly'

// ── Legacy JSON-key path ─────────────────────────────────────────────
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

// ── Keyless Workload Identity Federation path ────────────────────────
interface WIFConfig {
  projectNumber: string
  poolId: string
  providerId: string
  serviceAccountEmail: string
}

let cachedWIF: WIFConfig | null | undefined
function loadWIF(): WIFConfig | null {
  if (cachedWIF !== undefined) return cachedWIF
  const projectNumber = process.env.GCP_PROJECT_NUMBER?.trim()
  const poolId = process.env.GCP_WORKLOAD_IDENTITY_POOL_ID?.trim()
  const providerId = process.env.GCP_WORKLOAD_IDENTITY_PROVIDER_ID?.trim()
  const serviceAccountEmail = process.env.GCP_SERVICE_ACCOUNT_EMAIL?.trim()
  // All four identifiers are required. They are non-secret, so a partial
  // config is a misconfiguration, not a "half-enabled" state — treat it
  // as disabled so callers fall back to OAuth instead of erroring.
  if (projectNumber && poolId && providerId && serviceAccountEmail) {
    cachedWIF = { projectNumber, poolId, providerId, serviceAccountEmail }
    return cachedWIF
  }
  cachedWIF = null
  return null
}

/** True when the full keyless WIF config is present. */
export function wifEnabled(): boolean {
  return loadWIF() !== null
}

export function serviceAccountEnabled(): boolean {
  // Enabled if EITHER auth path is fully configured. WIF is preferred but
  // the legacy key still works as a fallback.
  return loadWIF() !== null || loadKey() !== null
}

export function getServiceAccountEmail(): string | null {
  // Prefer the WIF-configured identity; fall back to the key's client_email.
  return loadWIF()?.serviceAccountEmail ?? loadKey()?.client_email ?? null
}

/* Access tokens are valid ~1h; cache per scope and refresh a minute early. */
const tokenCache = new Map<string, { token: string; expMs: number }>()

export async function getServiceAccountToken(scope: string): Promise<string | null> {
  const cached = tokenCache.get(scope)
  if (cached && cached.expMs - Date.now() > 60_000) return cached.token

  // Prefer keyless WIF; fall back to the self-signed JSON key.
  const wif = loadWIF()
  if (wif) return getTokenViaWIF(wif, scope)
  return getTokenViaKey(scope)
}

/**
 * Keyless path: Vercel OIDC → Google STS federated token → SA impersonation.
 * Returns an access token for `scope`, cached until ~1 min before expiry.
 * Any failure returns null so callers degrade honestly (no throw).
 */
async function getTokenViaWIF(wif: WIFConfig, scope: string): Promise<string | null> {
  try {
    // 1. Vercel-minted OIDC token for this deployment. Request/runtime-scoped
    //    and short-lived — never stored.
    const oidcToken = await getVercelOidcToken()
    if (!oidcToken) {
      console.error('[service-account] WIF: no Vercel OIDC token (is OIDC enabled for the project?)')
      return null
    }

    // 2. STS token exchange: OIDC JWT → federated Google access token.
    const audience =
      `//iam.googleapis.com/projects/${wif.projectNumber}` +
      `/locations/global/workloadIdentityPools/${wif.poolId}` +
      `/providers/${wif.providerId}`
    const stsRes = await fetch('https://sts.googleapis.com/v1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
        requestedTokenType: 'urn:ietf:params:oauth:token-type:access_token',
        scope: 'https://www.googleapis.com/auth/cloud-platform',
        subjectTokenType: 'urn:ietf:params:oauth:token-type:jwt',
        subjectToken: oidcToken,
        audience,
      }),
    })
    const stsData = await stsRes.json()
    if (!stsRes.ok || !stsData.access_token) {
      console.error('[service-account] WIF STS exchange failed:', stsData.error_description || stsData.error || stsRes.status)
      return null
    }
    const federatedToken = stsData.access_token as string

    // 3. Impersonate the service account to get a token for the read scope.
    const impRes = await fetch(
      `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(wif.serviceAccountEmail)}:generateAccessToken`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${federatedToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ scope: [scope], lifetime: '3600s' }),
      },
    )
    const impData = await impRes.json()
    if (!impRes.ok || !impData.accessToken) {
      console.error('[service-account] WIF SA impersonation failed:', impData.error?.message || impRes.status)
      return null
    }
    const token = impData.accessToken as string
    // generateAccessToken returns an RFC3339 expireTime; fall back to ~1h.
    const expMs = impData.expireTime ? new Date(impData.expireTime as string).getTime() : Date.now() + 3600_000
    tokenCache.set(scope, { token, expMs })
    return token
  } catch (e) {
    console.error('[service-account] WIF token error:', (e as Error).message)
    return null
  }
}

/**
 * Legacy path: self-sign an RS256 JWT from the downloaded key and exchange
 * it at Google's OAuth token endpoint. Returns null on any failure.
 */
async function getTokenViaKey(scope: string): Promise<string | null> {
  const key = loadKey()
  if (!key) return null

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
