/**
 * CLOVER ADAPTER — the only file that knows Clover's wire format (CHANNELS-PLAN law 1).
 *
 * P1: env kill-switch + the real OAuth authorize URL. Token exchange + sales sync land
 * in P4 alongside Square (same shape, same pos_daily_sales target).
 */

import { ChannelError, type ChannelAdapter, type ChannelConnection, type ConnectStart, type SyncResult } from '../types'

/* CLOVER_ENV=sandbox points every URL at Clover's sandbox (the dev app we configured);
 * unset/production points at the real thing. One switch, all URLs follow (law 3). */
const sandbox = () => process.env.CLOVER_ENV === 'sandbox'
const authorizeBase = () => (sandbox() ? 'https://sandbox.dev.clover.com' : 'https://www.clover.com')
export const cloverApiBase = () => (sandbox() ? 'https://apisandbox.dev.clover.com' : 'https://api.clover.com')

/** The code-for-tokens exchange (OAuth v2). Only this file knows Clover's endpoints. */
export async function cloverExchangeCode(code: string): Promise<{
  accessToken: string
  refreshToken: string | null
}> {
  const res = await fetch(`${cloverApiBase()}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.CLOVER_APP_ID,
      client_secret: process.env.CLOVER_APP_SECRET,
      code,
    }),
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok || typeof data.access_token !== 'string') {
    throw new ChannelError('auth', `Clover token exchange failed (${res.status})`)
  }
  return {
    accessToken: data.access_token,
    refreshToken: typeof data.refresh_token === 'string' ? data.refresh_token : null,
  }
}

export const cloverAdapter: ChannelAdapter = {
  id: 'clover',
  kind: 'oauth',

  isConfigured() {
    return Boolean(process.env.CLOVER_APP_ID && process.env.CLOVER_APP_SECRET)
  },

  async connectStart(state: string): Promise<ConnectStart> {
    const appId = process.env.CLOVER_APP_ID
    if (!appId || !process.env.CLOVER_APP_SECRET) {
      throw new ChannelError('not_configured', 'CLOVER_APP_ID / CLOVER_APP_SECRET are not set')
    }
    const params = new URLSearchParams({ client_id: appId, state })
    return { url: `${authorizeBase()}/oauth/v2/authorize?${params.toString()}` }
  },

  async sync(_connection: ChannelConnection): Promise<SyncResult> {
    if (!this.isConfigured()) throw new ChannelError('not_configured', 'Clover env keys are not set')
    throw new ChannelError('not_implemented', 'Clover daily-sales sync lands in P4')
  },
}
