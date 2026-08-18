/**
 * TIER SPECS — what each design tier DELIVERS, in hard numbers (GD-1).
 *
 * The scale rule this exists for: the exchange must be unambiguous. A tier is
 * not a vibe word ("Basic", "The Works") — it is a stated count of concepts,
 * revision rounds, and delivered files. The spec renders on the tier picker and
 * on the review screen, and a snapshot of it rides inside every order's brief,
 * so what the client bought is on the record forever, even if the spec changes
 * next month.
 *
 * NUMBERS ARE CONFIG (owner sign-off pending, first-pass defaults 2026-08-19):
 * each is one line to change on the owner's word, same rule as the rate card.
 *
 * CLIENT-SAFE: pure data, no server imports.
 */

export interface TierSpec {
  /** distinct design concepts the client sees before picking one */
  concepts: number
  /** revision rounds included; the round after these bills separately */
  revisionRounds: number
  /** the editable working file ships with the finals */
  sourceFiles: boolean
  /** plain-language list of what lands in their files */
  formats: string[]
}

export const TIER_SPECS: Record<1 | 2 | 3, TierSpec> = {
  1: {
    concepts: 1,
    revisionRounds: 1,
    sourceFiles: false,
    formats: ['Ready-to-post image (JPG + PNG)'],
  },
  2: {
    concepts: 2,
    revisionRounds: 2,
    sourceFiles: false,
    formats: ['Ready-to-post image (JPG + PNG)', 'Print-ready PDF where you picked print'],
  },
  3: {
    concepts: 3,
    revisionRounds: 3,
    sourceFiles: true,
    formats: ['Ready-to-post image (JPG + PNG)', 'Print-ready PDF where you picked print', 'Editable source file — yours to keep'],
  },
}

/** One-line spec for the tier picker: "2 concepts · 2 revision rounds". */
export function specLine(tier: 1 | 2 | 3): string {
  const s = TIER_SPECS[tier]
  const parts = [
    `${s.concepts} concept${s.concepts === 1 ? '' : 's'}`,
    `${s.revisionRounds} revision round${s.revisionRounds === 1 ? '' : 's'}`,
  ]
  if (s.sourceFiles) parts.push('source files')
  return parts.join(' · ')
}

/** Full bullet list for the review screen — the exact exchange, before money. */
export function specBullets(tier: 1 | 2 | 3): string[] {
  const s = TIER_SPECS[tier]
  return [
    `You see ${s.concepts} concept${s.concepts === 1 ? '' : 's'} and pick one`,
    `${s.revisionRounds} revision round${s.revisionRounds === 1 ? '' : 's'} included; round ${s.revisionRounds + 1} bills separately`,
    ...s.formats,
  ]
}
