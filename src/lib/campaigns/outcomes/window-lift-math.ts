/**
 * PURE window-lift math (no DB) — unit-testable. The honesty rules live here:
 *  - metrics report a few days late, so we only read days that have actually settled;
 *  - we never read a lift until the post-window has MATURED (avoids a fake "-100%"
 *    collapse right after launch, when the post-window is empty but the pre-window is full);
 *  - the post and pre windows are always the SAME number of settled days (a fair compare);
 *  - a lift needs a meaningful baseline, and its magnitude is clamped against extreme noise.
 */

export const WINDOW_DAYS = 14
export const METRIC_LAG_DAYS = 3      // GBP/social metrics land a few days late; ignore the unsettled tail
export const MIN_MATURED_DAYS = 7     // don't read a lift until the post-window has this many settled days

export function shiftDay(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
function dayDiff(aISO: string, bISO: string): number {
  return Math.round((Date.parse(`${bISO}T00:00:00Z`) - Date.parse(`${aISO}T00:00:00Z`)) / 86_400_000)
}

/** Half-open [start, end) windows for the lift compare, or null if the post-window has not
 *  matured enough to read honestly. post = [anchor, anchor+elapsed); pre = the same length
 *  immediately before. */
export interface MaturedWindow { postStart: string; postEnd: string; preStart: string; preEnd: string; elapsed: number }

export function maturedWindow(anchorISO: string, todayISO: string): MaturedWindow | null {
  if (!anchorISO || !todayISO) return null
  const settledEnd = shiftDay(todayISO, -METRIC_LAG_DAYS)        // exclusive end of settled data
  const cap = shiftDay(anchorISO, WINDOW_DAYS)
  const postEnd = settledEnd < cap ? settledEnd : cap
  const elapsed = dayDiff(anchorISO, postEnd)                    // settled days available in the post-window
  if (elapsed < MIN_MATURED_DAYS) return null
  return { postStart: anchorISO, postEnd, preStart: shiftDay(anchorISO, -elapsed), preEnd: anchorISO, elapsed }
}

/** A signed lift % vs the baseline, gated on a meaningful baseline and clamped to a sane
 *  magnitude so ordinary variance on a tiny denominator can't read as a triumph (or a collapse). */
export function channelLift(post: number, pre: number, minBaseline: number): { hasData: boolean; delta: number } {
  if (pre < minBaseline) return { hasData: false, delta: 0 }
  const clamped = Math.max(-1, Math.min(1, (post - pre) / pre))
  return { hasData: true, delta: Math.round(clamped * 100) / 100 }
}
