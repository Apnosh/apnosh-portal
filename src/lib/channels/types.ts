/**
 * THE CHANNELS LAYER — shared contract (docs/CHANNELS-PLAN.md, P1).
 *
 * One law above all: screens read canonical tables, never a vendor. Every vendor lives
 * behind exactly one adapter implementing this contract, registered in registry.ts. The
 * sync engine (sync.ts) only ever speaks this interface, so swapping a vendor is
 * rewriting one file.
 *
 * Status vocabulary is the EXISTING channel_connections enum (migration 043):
 * pending | active | error | disconnected. 'not_configured' is an ADAPTER-level state
 * (env key missing) and is never stored in the database — it is reported live so every
 * surface can say "not set up yet" honestly (law 3).
 */

export type ChannelId = 'yelp' | 'square' | 'clover' | 'statements' | 'ayrshare' | 'zernio'

export type ChannelKind = 'api_key' | 'oauth' | 'upload' | 'hosted_link'

/** Typed failure. The engine records ALL of these in the ledger; only real runtime
 *  failures (auth/rate_limit/upstream) count toward the alert-at-3 counter. Structural
 *  states (not_configured, not_implemented) are honest gaps, not health incidents. */
export type ChannelErrorCode =
  | 'not_configured'   // env key missing: the kill-switch state
  | 'not_implemented'  // adapter exists, this capability lands in a later phase
  | 'not_connected'    // connection row exists but has no usable credentials
  | 'auth'             // vendor rejected our credentials/token
  | 'rate_limit'       // vendor throttled us; retry later
  | 'upstream'         // vendor errored or returned garbage

export class ChannelError extends Error {
  code: ChannelErrorCode
  constructor(code: ChannelErrorCode, message: string) {
    super(message)
    this.name = 'ChannelError'
    this.code = code
  }
}

/** True when the failure should count toward consecutive_failures + the owner alert. */
export const countsAsFailure = (code: ChannelErrorCode): boolean =>
  code === 'auth' || code === 'rate_limit' || code === 'upstream'

/** The minimal connection row the engine and adapters need (a subset of
 *  channel_connections). Token columns stay server-side only. */
export interface ChannelConnection {
  id: string
  client_id: string
  channel: string
  connection_type: string
  platform_account_id: string | null
  access_token: string | null
  refresh_token: string | null
  status: 'pending' | 'active' | 'error' | 'disconnected'
  consecutive_failures?: number | null
  metadata: Record<string, unknown> | null
}

export interface SyncResult {
  itemsWritten: number
  /** short human note for the ledger row, e.g. "rating 4.6, 3 reviews" */
  note?: string
}

export interface ConnectStart {
  /** OAuth authorize URL or hosted-link URL the owner is sent to; null when the lane
   *  is not a redirect (upload/manual lanes explain themselves in `instructions`). */
  url: string | null
  instructions?: string
}

export interface ChannelAdapter {
  id: ChannelId
  kind: ChannelKind
  /** Env-level kill switch (law 3). False = every surface says "not set up". */
  isConfigured(): boolean
  /** Begin connecting a client. Throws ChannelError('not_configured') when unconfigured.
   *  hosted_link lanes may receive opts.platform (which network the owner tapped). */
  connectStart(clientId: string, opts?: { platform?: string }): Promise<ConnectStart>
  /** Pull fresh data for one ACTIVE connection into canonical tables. Throws
   *  ChannelError on failure; never returns partial silence. */
  sync(connection: ChannelConnection): Promise<SyncResult>
}
