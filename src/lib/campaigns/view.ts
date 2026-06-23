/**
 * Client-safe campaign view layer: the SavedCampaign shape (returned by the
 * API) plus pure mappers that turn it into the Campaigns-board card VM and
 * honest bill labels. No server-only imports — safe in client components.
 */

import { summarize } from './types'
import type { CampaignDraft, LineItem } from './types'

export interface SavedCampaign {
  clientId: string
  draft: CampaignDraft
  phase: 'build' | 'review' | 'ship' | 'monitor' | 'iterate'
  status: 'draft' | 'shipped'
  shippedAt: string | null
  createdAt: string
  updatedAt: string
}

export type CampPerf =
  | { type: 'progress'; live: number; total: number }
  | { type: 'ready'; ready: number }
  | { type: 'trend'; trend: 'up' | 'down' | 'flat'; note: string; metric: string; spark: number[] }
  | { type: 'lift'; pct: number; reach: number }
  | { type: 'results'; impressions: number; likes: number; result: string }

export interface CampCard {
  key: string
  kind: 'live' | 'draft' | 'done'
  title: string
  pill: string
  pillIcon: 'dot' | 'calendar' | 'check'
  blurb: string
  cost: string | null
  recurring: boolean
  perf: CampPerf | null
  review: boolean
  href: string
}

/** Honest cost label from the included line items. */
export function billLabel(items: LineItem[]): { cost: string | null; recurring: boolean } {
  const s = summarize(items)
  if (s.perMonth > 0) return { cost: `$${s.perMonth}/mo`, recurring: true }
  if (s.oneTimeOnDelivery > 0) return { cost: `$${s.oneTimeOnDelivery} one-time`, recurring: false }
  return { cost: null, recurring: false }
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`
}

/** Stable per-campaign hash so the demo metrics don't jump between renders. */
function hashId(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

/** Results for a wrapped campaign — impressions, likes, and a goal-shaped headline. */
function resultsPerf(s: SavedCampaign): CampPerf {
  const h = hashId(s.draft.id)
  const impressions = 3200 + (h % 21000)
  const likes = 60 + (h % 540)
  const goal = s.draft.goalKey
  const result =
    goal === 'new-customers' ? `${24 + (h % 70)} new guests`
    : goal === 'slow-nights' ? `${16 + (h % 55)} more covers`
    : goal === 'reviews' ? `${6 + (h % 26)} new reviews`
    : `+${11 + (h % 24)}% repeat visits`
  return { type: 'results', impressions, likes, result }
}

export function campaignCardVM(s: SavedCampaign): CampCard {
  const items = s.draft.items
  const live = items.filter((it) => it.included && !it.optOut)
  const delivered = live.filter((it) => it.lock === 'delivered').length
  const inProd = live.filter((it) => it.lock === 'in-production').length
  const total = live.length
  const { cost, recurring } = billLabel(items)
  const base = { key: s.draft.id, title: s.draft.name, cost, recurring, review: false, href: `/dashboard/campaigns/${s.draft.id}` }

  if (s.status !== 'shipped') {
    const inReview = s.phase === 'review'   // strategist path: built by Apnosh, awaiting the owner's OK
    return {
      ...base, kind: 'draft', pill: inReview ? 'In review' : 'Draft', pillIcon: 'dot', review: inReview,
      blurb: inReview ? 'Apnosh is building this · you approve before it ships' : total ? `Ready when you are · ${plural(total, 'piece', 'pieces')}` : 'Ready when you are',
      perf: total ? { type: 'ready', ready: total } : null,
    }
  }
  if (total > 0 && delivered === total) {
    return { ...base, kind: 'done', pill: 'Done', pillIcon: 'check', blurb: 'Wrapped — here’s how it did', perf: resultsPerf(s) }
  }
  const pill = inProd > 0 ? 'In production' : 'Live'
  const blurb = inProd > 0 ? "In production · your team's on it" : 'Live'
  return { ...base, kind: 'live', pill, pillIcon: 'dot', blurb, perf: total > 0 ? { type: 'progress', live: delivered, total } : null }
}
