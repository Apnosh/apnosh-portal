/**
 * AYRSHARE ADAPTER — the rented social pipe (CHANNELS-PLAN: buy, don't build Meta).
 *
 * P1: env kill-switch only. P3 lands the real thing after the owner's bake-off buys a
 * key: hosted-link profile connection, metrics sync into social_metrics, and the
 * publish bridge (approved drafts posted through the same adapter). Until then every
 * surface reports the honest env state, and sync() names its own gap.
 *
 * DECIDED (memory: project_integrations_strategy): Ayrshare is the solution, not a
 * stopgap; no own Meta app without the written trigger. Screens never read this vendor
 * directly — swap-out is this one file.
 */

import { ChannelError, type ChannelAdapter, type ChannelConnection, type ConnectStart, type SyncResult } from '../types'

export const ayrshareAdapter: ChannelAdapter = {
  id: 'ayrshare',
  kind: 'hosted_link',

  isConfigured() {
    return Boolean(process.env.AYRSHARE_API_KEY)
  },

  async connectStart(_clientId: string): Promise<ConnectStart> {
    if (!this.isConfigured()) throw new ChannelError('not_configured', 'AYRSHARE_API_KEY is not set')
    throw new ChannelError('not_implemented', 'Ayrshare hosted linking lands in P3')
  },

  async sync(_connection: ChannelConnection): Promise<SyncResult> {
    if (!this.isConfigured()) throw new ChannelError('not_configured', 'AYRSHARE_API_KEY is not set')
    throw new ChannelError('not_implemented', 'Ayrshare metrics sync lands in P3')
  },
}
