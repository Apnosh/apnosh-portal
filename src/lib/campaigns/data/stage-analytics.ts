/**
 * Which Insights numbers a campaign is built to lift, by the funnel stage(s) it moves.
 * Ported byte-for-byte from apnosh-campaign.jsx (STAGE_ANALYTICS / ITEM_ANALYTICS /
 * analyticsToTrack) so the admin preview and the live store product page show the SAME
 * "Analytics to track" list. CLIENT-SAFE: pure data, no server imports.
 */
import type { FunnelStage } from './create-catalog'

export const STAGE_ANALYTICS: Record<FunnelStage, string[]> = {
  aware: ['Google search views', 'Google map views', 'Social reach'],
  interest: ['Website visits', 'Menu views', 'Profile visits'],
  actions: ['Direction requests', 'Calls', 'Website clicks'],
  orders: ['Online orders', 'Guests'],
  back: ['New reviews', 'Repeat guests'],
}

/** Per-item overrides for channel-specific work (e.g. a Google-profile campaign tracks
 *  the Google metrics), keyed by create-catalog id. */
export const ITEM_ANALYTICS: Record<string, string[]> = {
  gbp: ['Google search views', 'Google map views', 'Direction requests', 'Calls', 'Website clicks'],
}

/** The metrics this campaign is built to lift: the item override if any, else the union of
 *  its stages' metrics, capped at 6 (same rule as the live store). */
export function analyticsForStages(itemId: string | null | undefined, stages: FunnelStage[]): string[] {
  if (itemId && ITEM_ANALYTICS[itemId]) return ITEM_ANALYTICS[itemId]
  const out: string[] = []
  for (const s of stages) for (const m of STAGE_ANALYTICS[s] ?? []) if (!out.includes(m)) out.push(m)
  return out.slice(0, 6)
}
