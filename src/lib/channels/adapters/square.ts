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

/** The code-for-tokens exchange. Only this file knows Square's token endpoint. */
export async function squareExchangeCode(code: string): Promise<{
  accessToken: string
  refreshToken: string | null
  merchantId: string
  expiresAt: string | null
}> {
  const res = await fetch('https://connect.squareup.com/oauth2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.SQUARE_APP_ID,
      client_secret: process.env.SQUARE_APP_SECRET,
      code,
      grant_type: 'authorization_code',
    }),
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok || typeof data.access_token !== 'string') {
    throw new ChannelError('auth', `Square token exchange failed (${res.status})`)
  }
  return {
    accessToken: data.access_token,
    refreshToken: typeof data.refresh_token === 'string' ? data.refresh_token : null,
    merchantId: typeof data.merchant_id === 'string' ? data.merchant_id : 'unknown',
    expiresAt: typeof data.expires_at === 'string' ? data.expires_at : null,
  }
}

export const squareAdapter: ChannelAdapter = {
  id: 'square',
  kind: 'oauth',

  isConfigured() {
    return Boolean(process.env.SQUARE_APP_ID && process.env.SQUARE_APP_SECRET)
  },

  async connectStart(state: string): Promise<ConnectStart> {
    const appId = process.env.SQUARE_APP_ID
    if (!appId || !process.env.SQUARE_APP_SECRET) {
      throw new ChannelError('not_configured', 'SQUARE_APP_ID / SQUARE_APP_SECRET are not set')
    }
    /* state is the SIGNED token from oauth-state.ts; the callback verifies it before
     * persisting anything. */
    const params = new URLSearchParams({
      client_id: appId,
      scope: SCOPES.join(' '),
      session: 'false',
      state,
    })
    return { url: `${AUTHORIZE}?${params.toString()}` }
  },

  async sync(_connection: ChannelConnection): Promise<SyncResult> {
    if (!this.isConfigured()) throw new ChannelError('not_configured', 'Square env keys are not set')
    throw new ChannelError('not_implemented', 'Square daily-sales sync lands in P4')
  },
}
