/**
 * CLOVER ADAPTER — the only file that knows Clover's wire format (CHANNELS-PLAN law 1).
 *
 * P1: env kill-switch + the real OAuth authorize URL. Token exchange + sales sync land
 * in P4 alongside Square (same shape, same pos_daily_sales target).
 */

import { ChannelError, type ChannelAdapter, type ChannelConnection, type ConnectStart, type SyncResult } from '../types'

const AUTHORIZE = 'https://www.clover.com/oauth/authorize'

export const cloverAdapter: ChannelAdapter = {
  id: 'clover',
  kind: 'oauth',

  isConfigured() {
    return Boolean(process.env.CLOVER_APP_ID && process.env.CLOVER_APP_SECRET)
  },

  async connectStart(clientId: string): Promise<ConnectStart> {
    const appId = process.env.CLOVER_APP_ID
    if (!appId || !process.env.CLOVER_APP_SECRET) {
      throw new ChannelError('not_configured', 'CLOVER_APP_ID / CLOVER_APP_SECRET are not set')
    }
    const params = new URLSearchParams({ client_id: appId, state: clientId })
    return { url: `${AUTHORIZE}?${params.toString()}` }
  },

  async sync(_connection: ChannelConnection): Promise<SyncResult> {
    if (!this.isConfigured()) throw new ChannelError('not_configured', 'Clover env keys are not set')
    throw new ChannelError('not_implemented', 'Clover daily-sales sync lands in P4')
  },
}
