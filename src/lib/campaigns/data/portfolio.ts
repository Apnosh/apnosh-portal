/**
 * The campaign portfolio + billing — one source of truth for "what's running,
 * what it costs, and what it earned." Home's counts, the Grow list, the spend
 * tile and the Money statement all derive from these arrays, so every screen
 * agrees. Shaped like real data; swap for a fetch to go live.
 */

export type CampaignState = 'live' | 'draft' | 'done'

export interface PortfolioCampaign {
  id: string
  name: string
  state: CampaignState
  /** Recurring monthly charge while live (0 for drafts/finished). */
  monthly: number
  /** One-line status in the owner's words. */
  status: string
  /** Where the card goes. */
  href: string
  /** Live campaigns: a metric worth glancing at. Done: the result. */
  result?: string
  /** A live campaign with something the owner should look at. */
  nudge?: boolean
}

export const PORTFOLIO: PortfolioCampaign[] = [
  { id: 'p-sms', name: 'Slow-night SMS program', state: 'live', monthly: 240, status: 'Working — guests back on quiet nights', href: '/v2/monitor', nudge: true },
  { id: 'p-reels', name: 'Weekend reels', state: 'live', monthly: 420, status: '4 reels out this month · reach climbing', href: '/v2/monitor' },
  { id: 'p-reviews', name: 'Review booster', state: 'live', monthly: 165, status: 'New reviews up — rating ticked to 4.6★', href: '/v2/monitor' },
  { id: 'p-fathers', name: 'Father’s Day brunch', state: 'draft', monthly: 0, status: 'Saved — just needs a date', href: '/v2' },
  { id: 'p-patio', name: 'Summer patio push', state: 'done', monthly: 0, status: 'Finished', result: 'Brought in 18% more guests over summer', href: '/v2/iterate' },
  { id: 'p-reopen', name: 'Grand reopening', state: 'done', monthly: 0, status: 'Finished', result: 'Packed the first two weekends', href: '/v2/iterate' },
]

/* ── This cycle's billing statement ───────────────────────────────────
 * Per-order, delivery-gated: recurring programs charge per cycle they run;
 * one-offs charge once, the day they ship. The total is what the owner sees
 * as "this month." */
export type ChargeKind = 'recurring' | 'delivered'
export interface StatementLine {
  id: string
  label: string
  campaign?: string
  kind: ChargeKind
  amount: number
  when: string
  /** Delivered one-offs can still be pending (produced, not yet charged). */
  status: 'charged' | 'pending'
}

export const STATEMENT: StatementLine[] = [
  { id: 's1', label: 'Slow-night SMS program', campaign: 'Slow-night SMS program', kind: 'recurring', amount: 240, when: 'Jun 1', status: 'charged' },
  { id: 's2', label: 'Weekend reels — June', campaign: 'Weekend reels', kind: 'recurring', amount: 420, when: 'Jun 1', status: 'charged' },
  { id: 's3', label: 'Review booster', campaign: 'Review booster', kind: 'recurring', amount: 165, when: 'Jun 1', status: 'charged' },
  { id: 's4', label: 'Behind the pass — reel', campaign: 'Weekend reels', kind: 'delivered', amount: 60, when: 'Jun 9', status: 'charged' },
  { id: 's5', label: 'Seasonal pastries — photo set', kind: 'delivered', amount: 55, when: 'Jun 7', status: 'charged' },
  { id: 's6', label: 'Latte art — reel (in production)', campaign: 'Weekend reels', kind: 'delivered', amount: 60, when: 'ships Jun 17', status: 'pending' },
]

export const BILLING = {
  /** The next recurring renewal date. */
  nextCharge: 'Jul 1',
  method: 'Visa ·· 4242',
  /** Prior cycles, for the history strip. */
  history: [
    { month: 'May', amount: 880 },
    { month: 'Apr', amount: 760 },
    { month: 'Mar', amount: 845 },
  ],
}
