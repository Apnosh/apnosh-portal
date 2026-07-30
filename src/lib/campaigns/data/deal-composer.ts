/**
 * THE DEAL COMPOSER (design plan P4) — structure that prevents the vague offer.
 *
 * Free text invites "a discount", which cannot be run, tracked, or capped. The composer
 * assembles the offer sentence from three picks (the shape, the amount, what it covers), so
 * every composed deal is concrete by construction. parseDeal is the inverse: it recognizes
 * composed sentences so the screen round-trips through the one stored string, and returns
 * null for anything else (a paragraph-read deal or the "my deal is different" escape), which
 * the screen shows as free text instead of mangling.
 *
 * Pure and sim-locked: compose/parse round-trip, and no composed sentence can be vague.
 */

export type DealKind = 'pct' | 'usd' | 'free' | 'bogo'

export const DEAL_KINDS: readonly { v: DealKind; label: string; amounts?: readonly number[] }[] = [
  { v: 'pct', label: '% off', amounts: [10, 15, 20, 25, 30] },
  { v: 'usd', label: '$ off', amounts: [5, 10, 15, 20] },
  { v: 'free', label: 'Free item' },
  { v: 'bogo', label: '2 for 1' },
]

export interface Deal {
  kind: DealKind
  /** required for pct/usd; ignored for free/bogo */
  amount?: number
  /** what it covers: "everything", a menu item, or the owner's phrase */
  scope: string
}

/** The sentence, as guests will read it on the coupon. */
export function dealSentence(d: Deal): string | null {
  const scope = d.scope.trim()
  if (!scope) return null
  switch (d.kind) {
    case 'pct':
      return d.amount && d.amount > 0 && d.amount < 100 ? `${d.amount}% off ${scope}` : null
    case 'usd':
      return d.amount && d.amount > 0 ? `$${d.amount} off ${scope}` : null
    case 'free':
      return `Free ${scope}`
    case 'bogo':
      return `Two for one on ${scope}`
  }
}

/** Recognize a composed sentence. Anything else (read or escape text) returns null. */
export function parseDeal(s: string | undefined): Deal | null {
  if (!s) return null
  let m = s.match(/^(\d+)% off (.+)$/)
  if (m) return { kind: 'pct', amount: Number(m[1]), scope: m[2] }
  m = s.match(/^\$(\d+) off (.+)$/)
  if (m) return { kind: 'usd', amount: Number(m[1]), scope: m[2] }
  m = s.match(/^Free (.+)$/)
  if (m) return { kind: 'free', scope: m[1] }
  m = s.match(/^Two for one on (.+)$/)
  if (m) return { kind: 'bogo', scope: m[1] }
  return null
}

/** The target presets (design plan P4): careful / suggested / ambitious around the anchor. */
export function targetPresets(suggested: number): { careful: number; suggested: number; ambitious: number } {
  return {
    careful: Math.max(1, Math.round(suggested * 0.7)),
    suggested,
    ambitious: Math.max(2, Math.round(suggested * 1.5)),
  }
}
