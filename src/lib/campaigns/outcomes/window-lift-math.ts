/**
 * PURE window-lift math (no DB) — unit-testable. The honesty rules live here:
 *  - metrics report a few days late, so we only read days that have actually settled;
 *  - we never read a lift until the post-window has MATURED (avoids a fake "-100%"
 *    collapse right after launch, when the post-window is empty but the pre-window is full);
 *  - the post and pre windows are always the SAME number of settled days (a fair compare);
 *  - a lift needs a meaningful baseline, and its magnitude is clamped against extreme noise.
 */

export const WINDOW_DAYS = 14
// The settle lag is per source: social insights land in ~3 days, but GBP interaction
// metrics (calls / website_clicks) keep back-filling for about a week — a live probe on
// do-si showed zeros for calls/clicks until ~7 days back. Reading those structurally
// unsettled zero days as real data sign-flips a fresh window negative.
export const METRIC_LAG_DAYS = 3      // social metrics; ignore the unsettled tail
export const GBP_METRIC_LAG_DAYS = 7  // GBP metrics settle much later than social
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
 *  immediately before. lagDays is per source (see the constants above): the caller passes
 *  GBP_METRIC_LAG_DAYS for GBP reads; social keeps the default. */
export interface MaturedWindow { postStart: string; postEnd: string; preStart: string; preEnd: string; elapsed: number }

export function maturedWindow(anchorISO: string, todayISO: string, lagDays: number = METRIC_LAG_DAYS): MaturedWindow | null {
  if (!anchorISO || !todayISO) return null
  const settledEnd = shiftDay(todayISO, -lagDays)                // exclusive end of settled data
  const cap = shiftDay(anchorISO, WINDOW_DAYS)
  const postEnd = settledEnd < cap ? settledEnd : cap
  const elapsed = dayDiff(anchorISO, postEnd)                    // settled days available in the post-window
  if (elapsed < MIN_MATURED_DAYS) return null
  return { postStart: anchorISO, postEnd, preStart: shiftDay(anchorISO, -elapsed), preEnd: anchorISO, elapsed }
}

/** A signed lift % vs the baseline, gated on a meaningful baseline and clamped to a sane
 *  magnitude so ordinary variance on a tiny denominator can't read as a triumph (or a collapse). */
export function channelLift(post: number, pre: number, minBaseline: number): { hasData: boolean; delta: number; post: number; pre: number } {
  if (pre < minBaseline) return { hasData: false, delta: 0, post: 0, pre: 0 }
  const clamped = Math.max(-1, Math.min(1, (post - pre) / pre))
  return { hasData: true, delta: Math.round(clamped * 100) / 100, post, pre }
}
