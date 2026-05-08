/**
 * Connector interface — Q1 architecture decision #3.
 *
 * Every external integration (Meta, GMB, TikTok, LinkedIn, Klaviyo, Toast,
 * BrightLocal, etc.) implements this shape. A registry maps provider keys
 * to connector instances; crons and admin tooling walk the registry rather
 * than hard-coding per-provider routes.
 *
 * The interface is intentionally thin. Each integration still owns its own
 * domain logic (posting, metrics, etc.) — the Connector is just the
 * common surface for lifecycle (auth, refresh, sync, disconnect, test).
 *
 * State for every connector lives in `channel_connections` keyed by
 * (client_id, channel, platform_account_id).
 */

export type ConnectorChannel =
  | 'instagram'
  | 'facebook'
  | 'instagram_direct'
  | 'tiktok'
  | 'linkedin'
  | 'google_business_profile'
  | 'google_analytics'
  | 'google_search_console'
  | 'klaviyo'      // Q2
  | 'meta_ads'     // Q2
  | 'toast'        // Q3

export type ConnectorStatus = 'pending' | 'active' | 'error' | 'disconnected'

export interface ConnectionRow {
  id: string
  client_id: string
  channel: ConnectorChannel | string
  platform_account_id: string | null
  platform_account_name: string | null
  access_token: string | null
  refresh_token: string | null
  token_expires_at: string | null
  scopes: string[] | null
  status: ConnectorStatus
  last_sync_at: string | null
  sync_error: string | null
  metadata: Record<string, unknown> | null
}

export interface RefreshResult {
  ok: boolean
  /** Updated access token, if rotated */
  accessToken?: string
  /** New expiry */
  expiresAt?: Date
  /** Updated refresh token, if rotated */
  refreshToken?: string
  /** Human-readable error to surface in sync_error */
  error?: string
  /** True if the user must re-OAuth -- token is dead, not just stale */
  requiresReauth?: boolean
}

export interface SyncResult {
  ok: boolean
  /** Items synced (posts pulled, reviews fetched, etc.) for logs */
  count?: number
  error?: string
}

export interface TestResult {
  ok: boolean
  error?: string
}

/**
 * Implement one of these per integration. Methods may be omitted when
 * not applicable (e.g. an api_key connector has no refresh path).
 */
export interface Connector {
  /** Stable identifier; matches channel_connections.channel */
  channel: ConnectorChannel | string

  /** Human-readable label for admin UI */
  label: string

  /** Build an OAuth URL for the connect flow. Optional for non-OAuth. */
  getAuthorizeUrl?(args: { state: string; clientId: string }): string

  /** Exchange OAuth callback code for tokens. Optional for non-OAuth. */
  handleCallback?(args: {
    code: string
    state: string
    clientId: string
  }): Promise<{ ok: boolean; connectionId?: string; error?: string }>

  /**
   * Refresh an access token. Called by cron a few hours before expiry.
   * Returning requiresReauth=true triggers a "needs attention" surface.
   */
  refresh?(connection: ConnectionRow): Promise<RefreshResult>

  /**
   * Pull data from the provider into our tables (posts, metrics,
   * reviews, etc.). Called by per-integration sync crons.
   */
  sync?(connection: ConnectionRow): Promise<SyncResult>

  /**
   * Lightweight health check. Called by /dashboard/connected-accounts.
   * Should be cheap (one tiny API call).
   */
  testConnection?(connection: ConnectionRow): Promise<TestResult>

  /**
   * Revoke tokens with the provider (best-effort) and remove our row.
   * The default disconnect just deletes the row; override only if the
   * provider has a real revocation endpoint.
   */
  disconnect?(connection: ConnectionRow): Promise<{ ok: boolean; error?: string }>
}
