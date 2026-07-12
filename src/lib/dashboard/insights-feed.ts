/**
 * insights-feed — pure "what feeds this" builders for the Insights deep-dive.
 *
 * Each funnel stage on the Insights page shows one headline number. This module
 * turns the raw insights-detail payload into an honest breakdown where the
 * headline ALWAYS equals the sum of its clearly-labeled source pieces. No source
 * is ever silently dropped: a piece with no connection shows as "Not connected"
 * (value 0, still labeled), so the owner can see every input and how much came
 * from each.
 *
 * Kept free of React / client deps so it can be unit-tested directly
 * (scripts/smoke-insights-reconcile.tsx).
 */

import type { ComputedStage } from '@/lib/insights/compute-stages'

export type FeedPiece = { key: string; label: string; value: number; connected: boolean }

export interface StageFeed {
  /** the headline number; ALWAYS equals the sum of connected pieces' values */
  headline: number
  /** the source pieces that add up to the headline */
  pieces: FeedPiece[]
  /** shown-but-NOT-summed context (e.g. audience growth); never part of headline */
  note: FeedPiece[]
  /** one plain line naming what this number is made of */
  caption: string
}

/** The raw fields the builders read (a subset of the insights-detail payload). */
export interface FeedInput {
  views: { total: number; maps: number; search: number; google?: number; social?: number } | null
  socialReach: number
  socialConnected: boolean
  googleConnected: boolean
  actions: { directions: number; calls: number; websiteClicks: number } | null
  profileVisits: number
  followersGained: number
  socialEngagement: number
}

export const NOT_CONNECTED = 'Not connected'

/** Sum only the pieces whose source is connected, so a "not connected" piece
 *  (value 0, label kept) never inflates or is silently dropped from the total. */
function sumConnected(pieces: FeedPiece[]): number {
  return pieces.reduce((s, p) => s + (p.connected ? p.value : 0), 0)
}

/**
 * Awareness = who saw you. Headline = Google Maps + Google Search + Social reach.
 * All three are always shown as labeled pieces; when Google or social is not
 * connected the piece reads "Not connected" and its 0 drops out of the sum, so
 * the headline still equals what is shown (e.g. Google-only when no social).
 */
export function buildAwarenessFeed(d: FeedInput): StageFeed {
  const v = d.views
  const maps = v?.maps ?? 0
  const search = v?.search ?? 0
  const social = v?.social ?? d.socialReach ?? 0
  const pieces: FeedPiece[] = [
    { key: 'maps', label: 'Google Maps', value: maps, connected: d.googleConnected },
    { key: 'search', label: 'Google Search', value: search, connected: d.googleConnected },
    { key: 'social', label: 'Social reach', value: d.socialConnected ? social : 0, connected: d.socialConnected },
  ]
  return {
    headline: sumConnected(pieces),
    pieces,
    note: [],
    caption: 'Across Google Maps, Google Search, and your social posts.',
  }
}

/**
 * Interest = who looked closer. Headline = Profile visits + Post engagement (both
 * social). New followers is audience GROWTH, not a "looked closer" event, so it
 * rides along as a labeled note that is never added into the headline.
 */
export function buildInterestFeed(d: FeedInput): StageFeed {
  const pieces: FeedPiece[] = [
    { key: 'profile', label: 'Profile visits', value: d.profileVisits, connected: d.socialConnected },
    { key: 'engaged', label: 'Post engagement', value: d.socialEngagement, connected: d.socialConnected },
  ]
  return {
    headline: sumConnected(pieces),
    pieces,
    note: [
      { key: 'followers', label: 'New followers', value: d.followersGained, connected: d.socialConnected },
    ],
    caption: 'People who looked closer at your posts and profile.',
  }
}

/**
 * Customer actions = the moves people made on Google. Headline = directions +
 * calls + website taps, all one source (Google), still labeled per action.
 */
export function buildActionsFeed(d: FeedInput): StageFeed {
  const a = d.actions
  const pieces: FeedPiece[] = [
    { key: 'directions', label: 'Asked for directions', value: a?.directions ?? 0, connected: d.googleConnected },
    { key: 'calls', label: 'Called you', value: a?.calls ?? 0, connected: d.googleConnected },
    { key: 'clicks', label: 'Tapped your website', value: a?.websiteClicks ?? 0, connected: d.googleConnected },
  ]
  return {
    headline: sumConnected(pieces),
    pieces,
    note: [],
    caption: 'Calls, directions, and bookings on Google.',
  }
}

/** Plain per-stage caption for the reconciling headline. */
const STAGE_CAPTION: Record<number, string> = {
  1: 'Times you showed up on Google and social.',
  2: 'Site clicks, menu views, and profile looks.',
  3: 'Calls, directions, bookings, and orders.',
  4: 'Guests you served, once your register connects.',
  5: 'Guests who came back, or new reviews this month.',
}

/**
 * The Phase 2 bridge: turn a ComputedStage (the honest source-of-truth math,
 * headline == sum of CONNECTED sources) into the StageFeed the "What feeds this"
 * boxes already render. The 'sum' sources become the boxes (connected ones carry
 * their real value, others read "Not connected" but stay visible), and the
 * headline is the stage's own honest headline. Because computeStages already
 * guarantees headline === sum(counted), the boxes reconcile BY CONSTRUCTION.
 * Context sources (rating trend, follower growth) ride along as a note, never
 * summed. A drill-down is never shown here.
 */
export function stageFeedFrom(stage: ComputedStage): StageFeed {
  const pieces: FeedPiece[] = stage.sources
    .filter((s) => s.feedRole === 'sum')
    .map((s) => ({ key: s.id, label: s.displayName, value: s.value ?? 0, connected: s.counted }))
  const note: FeedPiece[] = stage.sources
    .filter((s) => s.feedRole === 'context')
    .map((s) => ({ key: s.id, label: s.displayName, value: s.value ?? 0, connected: s.status === 'CONNECTED' && s.value != null }))
  return {
    // headline mirrors the stage's honest number (0 when empty, so the boxes still add up)
    headline: stage.headline ?? sumConnected(pieces),
    pieces,
    note,
    caption: STAGE_CAPTION[stage.stage] ?? '',
  }
}
