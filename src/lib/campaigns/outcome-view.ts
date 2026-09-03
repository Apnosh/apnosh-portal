/**
 * Campaign outcome — the client-safe half: the shape and the plain-words line.
 * No server imports here, so list cards and the detail page can use it directly.
 * The read itself lives in lib/campaigns/outcome.ts (server only).
 */
export type OutcomeState = 'up' | 'flat' | 'down' | 'too_soon' | 'no_data'
export interface CampaignOutcome {
  state: OutcomeState
  /** the stage whose metric is read: shown | engaged | moved */
  stage: string
  noun: string
  before: number
  after: number
  /** signed percent change, null when not measurable */
  pct: number | null
  /** the after-window's daily values, for a small spark */
  spark: number[]
  /** how many days of the after-window have reported (0–14) */
  daysIn: number
}


/** The one-line read of an outcome, in plain words. */
export function outcomeLine(o: CampaignOutcome): { text: string; trend: 'up' | 'down' | 'flat' } | null {
  if (o.state === 'too_soon') return { text: `Too soon to tell · ${o.daysIn} of 14 days in`, trend: 'flat' }
  if (o.state === 'no_data' || o.pct == null) return null
  const diff = o.after - o.before
  const sign = diff > 0 ? '+' : diff < 0 ? '−' : ''
  if (o.state === 'flat') return { text: 'About the same since launch', trend: 'flat' }
  return { text: `${sign}${Math.abs(diff).toLocaleString('en-US')} ${o.noun} since launch`, trend: o.state === 'up' ? 'up' : 'down' }
}
