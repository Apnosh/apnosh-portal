/**
 * Unified production stage — ONE honest vocabulary across both lanes (team content_drafts + creator
 * work orders). Pure, client-safe: no I/O. Every stage is backed by a real status. Mirrors the
 * computeProgress buckets (server.ts) + outcomes lifecycleOf byte-for-byte so the tracker never
 * disagrees with the hero counts.
 */

export type Stage = 'making' | 'ready_for_you' | 'approved' | 'scheduled' | 'posted' | 'gathering' | 'dropped'

export const STAGE_LABEL: Record<Stage, string> = {
  making: 'Being made',
  ready_for_you: 'Ready for you',
  approved: 'Approved',
  scheduled: 'Set to post',
  posted: 'Posted',
  gathering: 'Posted, waiting on numbers',
  dropped: 'Stopped',
}

// The real steps a piece walks. "Ready for you" is the owner's turn on BOTH lanes: a creator
// delivery awaiting their OK, or an approved team draft the publish gate is holding for their
// sign-off (client_signed_off_at null). Owner copy for that node: "Your OK on the finished piece".
export const STEP_ORDER: Stage[] = ['making', 'ready_for_you', 'approved', 'scheduled', 'posted']

export function stageRank(s: Stage): number {
  if (s === 'gathering') return STEP_ORDER.indexOf('posted')
  if (s === 'dropped') return 99
  return STEP_ORDER.indexOf(s)
}

const DEAD = new Set(['rejected', 'failed', 'archived'])

/** Creator-lane order status → stage. All 7 statuses map to exactly one stage. */
export function stageForOrder(status: string): Stage {
  if (status === 'delivered') return 'ready_for_you'
  if (status === 'approved') return 'approved'
  if (status === 'declined') return 'dropped'
  return 'making'   // offered / accepted / in_progress / revision
}

/** Team-lane content_drafts.status → stage. Mirrors computeProgress buckets exactly.
 *  awaitingSignoff: the draft is 'approved' but the client's sign-off gate still holds it
 *  (sign-off required + client_signed_off_at null) — the owner's turn, so it surfaces as
 *  ready_for_you instead of sitting silently in approved. Defaults false so callers that
 *  don't know the gate keep the old status-only mapping. */
export function stageForDraft(status: string, awaitingSignoff = false): Stage {
  if (DEAD.has(status)) return 'dropped'
  if (status === 'published') return 'posted'
  // A scheduled-unsigned draft is HELD by the publish cron until the owner signs,
  // so it is the owner's turn too — "Set to post" would be a lie until then.
  if (status === 'scheduled') return awaitingSignoff ? 'ready_for_you' : 'scheduled'
  if (status === 'approved') return awaitingSignoff ? 'ready_for_you' : 'approved'
  return 'making'   // idea / draft / revising / produced
}
