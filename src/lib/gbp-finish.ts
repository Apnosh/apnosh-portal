/**
 * WHEN A GOOGLE-PROFILE CAMPAIGN MAY FINISH — one rule, shared by the server that
 * stamps it and the UI that offers the button, so the two can never disagree.
 *
 * The old rule was "every one of the 9 parts is good", which turned out to be too
 * strict to ever clear in practice: it counted photo FRESHNESS and Google's
 * OPTIONAL yes/no attributes as blockers. A real listing (Yellowbee: 85/100, nothing
 * absent) could sit unfinished forever over "0 of 7 service attributes answered".
 *
 * The rule now separates absent from improvable:
 *   missing  → a part is not there at all      → blocks (there is real work to do)
 *   unknown  → we could not read it            → blocks (we will not claim what we did not verify)
 *   needs-work → present, could be better      → does NOT block (ongoing polish)
 * plus an honest floor on the overall listing-health score.
 *
 * `Finish anyway` is the deliberate escape hatch for everything this still refuses.
 * It does not pretend the profile is perfect — the caller records the parts that were
 * still open, so the completion record says what was actually true at the time.
 */

/** The listing-health floor a profile must clear to finish on the clean path. */
export const GBP_FINISH_MIN_SCORE = 80

export interface FinishSection {
  key: string
  label: string
  status: string
}

export interface FinishReadiness {
  /** May the task finish without the owner overriding? */
  ready: boolean
  /** Parts that are absent or unverified — the real blockers. */
  blockers: FinishSection[]
  /** Parts that are present but could be better — shown, never blocking. */
  polish: FinishSection[]
  /** True when the only thing standing in the way is the score floor. */
  scoreShort: boolean
  score: number | null
}

/** The one readiness read. Pure — no I/O, safe on the client and the server. */
export function gbpFinishReadiness(sections: FinishSection[] | null | undefined, score: number | null): FinishReadiness {
  const all = sections ?? []
  const blockers = all.filter((s) => s.status === 'missing' || s.status === 'unknown')
  const polish = all.filter((s) => s.status === 'needs-work')
  // A null score means we could not score it honestly, so it cannot clear the floor.
  const scoreOk = score != null && score >= GBP_FINISH_MIN_SCORE
  const ready = all.length > 0 && blockers.length === 0 && scoreOk
  return { ready, blockers, polish, scoreShort: blockers.length === 0 && !scoreOk, score }
}
