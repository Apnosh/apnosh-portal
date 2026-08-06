/**
 * SQUARE ADAPTER — the only file that knows Square's wire format (CHANNELS-PLAN law 1).
 *
 * P1: env kill-switch + the real OAuth authorize URL (connectStart). The callback token
 * exchange and daily-sales sync land in P4; until then sync() reports its own gap as a
 * typed 'not_implemented' — an honest structural state that never counts as a health
 * failure and never spams the owner.
 */

import { ChannelError, type ChannelAdapter, type ChannelConnection, type ConnectStart, type SyncResult } from '../types'

const AUTHORIZE = 'https://connect.squareup.com/oauth2/authorize'
/** Read-only scopes: sales into pos_daily_sales. Never payments-write. */
const SCOPES = ['MERCHANT_PROFILE_READ', 'ORDERS_READ', 'PAYMENTS_READ'] as const

export const squareAdapter: ChannelAdapter = {
  id: 'square',
  kind: 'oauth',

  isConfigured() {
    return Boolean(process.env.SQUARE_APP_ID && process.env.SQUARE_APP_SECRET)
  },

  async connectStart(clientId: string): Promise<ConnectStart> {
    const appId = process.env.SQUARE_APP_ID
    if (!appId || !process.env.SQUARE_APP_SECRET) {
      throw new ChannelError('not_configured', 'SQUARE_APP_ID / SQUARE_APP_SECRET are not set')
    }
    /* state carries the client id; the P4 callback verifies it against the signed-in
     * user before persisting anything (documented in CHANNELS-PLAN P4). */
    const params = new URLSearchParams({
      client_id: appId,
      scope: SCOPES.join(' '),
      session: 'false',
      state: clientId,
    })
    return { url: `${AUTHORIZE}?${params.toString()}` }
  },

  async sync(_connection: ChannelConnection): Promise<SyncResult> {
    if (!this.isConfigured()) throw new ChannelError('not_configured', 'Square env keys are not set')
    throw new ChannelError('not_implemented', 'Square daily-sales sync lands in P4')
  },
}
