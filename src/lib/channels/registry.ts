/**
 * THE CHANNEL REGISTRY — the closed map of adapters (CHANNELS-PLAN law 1).
 *
 * Every ChannelId has exactly one adapter and vice versa; the golden in
 * scripts/sim/channels.ts fails the build if the two ever drift. The sync engine only
 * syncs channels found here — rows in channel_connections owned by other systems
 * (google surfaces, legacy platform_connections) are left to their existing crons.
 */

import type { ChannelAdapter, ChannelId } from './types'
import { yelpAdapter } from './adapters/yelp'
import { squareAdapter } from './adapters/square'
import { cloverAdapter } from './adapters/clover'
import { statementsAdapter } from './adapters/statements'
import { ayrshareAdapter } from './adapters/ayrshare'

export const CHANNEL_IDS = ['yelp', 'square', 'clover', 'statements', 'ayrshare'] as const

export const CHANNELS: Record<ChannelId, ChannelAdapter> = {
  yelp: yelpAdapter,
  square: squareAdapter,
  clover: cloverAdapter,
  statements: statementsAdapter,
  ayrshare: ayrshareAdapter,
}

export const adapterFor = (channel: string): ChannelAdapter | null =>
  (CHANNELS as Record<string, ChannelAdapter>)[channel] ?? null
