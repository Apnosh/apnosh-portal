/**
 * Meta (Instagram + Facebook) Connector — reference implementation.
 *
 * Wraps the existing logic in src/lib/instagram.ts and src/lib/facebook.ts
 * behind the unified Connector interface. The OAuth flow itself still
 * lives in /api/auth/instagram/* (we don't churn working callbacks);
 * this wrapper exists so the cron, admin tooling, and the wk 4 token
 * refresh job can treat Meta the same as every other provider.
 */
import { exchangeForLongLivedToken } from '@/lib/instagram'
import type { Connector, ConnectionRow, RefreshResult, TestResult } from './types'

const GRAPH_BASE = 'https://graph.facebook.com/v21.0'

/**
 * Long-lived Page tokens are valid ~60 days. We refresh anything inside
 * a 7-day window (or already expired) to avoid the cliff.
 */
const REFRESH_WINDOW_MS = 7 * 24 * 3600 * 1000

function isInRefreshWindow(connection: ConnectionRow): boolean {
  if (!connection.token_expires_at) return false
  const expires = new Date(connection.token_expires_at).getTime()
  return expires - Date.now() <= REFRESH_WINDOW_MS
}

export const metaInstagramConnector: Connector = {
  channel: 'instagram',
  label: 'Instagram',

  async refresh(connection: ConnectionRow): Promise<RefreshResult> {
    if (!connection.access_token) {
      return { ok: false, error: 'No access token on record', requiresReauth: true }
    }
    if (!isInRefreshWindow(connection)) {
      // Not time yet -- the cron will revisit.
      return { ok: true }
    }
    try {
      const fresh = await exchangeForLongLivedToken(connection.access_token)
      const expiresAt = new Date(Date.now() + fresh.expires_in * 1000)
      return { ok: true, accessToken: fresh.access_token, expiresAt }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Refresh failed'
      // Meta returns specific OAuth error codes for dead tokens; if the
      // message smells like a permission revocation, force re-OAuth.
      const requiresReauth =
        /OAuthException|expired|invalid|revoked/i.test(message)
      return { ok: false, error: message, requiresReauth }
    }
  },

  async testConnection(connection: ConnectionRow): Promise<TestResult> {
    if (!connection.access_token) return { ok: false, error: 'No token' }
    try {
      // /me with a page or IG business token is the cheapest valid call.
      const res = await fetch(`${GRAPH_BASE}/me?access_token=${encodeURIComponent(connection.access_token)}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        return { ok: false, error: body.error?.message || `HTTP ${res.status}` }
      }
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Network error' }
    }
  },
}

/**
 * Facebook Page connector reuses the same shape -- Page tokens are
 * exchanged through the same Graph API endpoint.
 */
export const metaFacebookConnector: Connector = {
  ...metaInstagramConnector,
  channel: 'facebook',
  label: 'Facebook',
}
