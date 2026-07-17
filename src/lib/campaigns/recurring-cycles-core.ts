/**
 * recurring-cycles-core — pure math for month-2+ work minting (owner-sim Phase 6).
 *
 * The sim's shell finding: month 2+ of a $165/mo service billed with NO work object
 * minted at all — Stripe kept charging while nothing entered the team's queue. The
 * sweep (recurring-cycles.ts) mints one service work order per billing month; this
 * module holds the testable arithmetic.
 */

const DAY = 86400000
/** Billing months are Stripe-monthly; 30 days is the honest floor for "a month has passed". */
const CYCLE_DAYS = 30

/** How many monthly cycles have STARTED since the subscription began (1-based: the day it
 *  starts, month 1 is underway). Invalid/future starts count as 1 (never negative). */
export function monthsElapsed(startedAtISO: string | null | undefined, nowISO: string): number {
  const start = startedAtISO ? Date.parse(startedAtISO) : NaN
  const now = Date.parse(nowISO)
  if (!Number.isFinite(start) || !Number.isFinite(now) || now < start) return 1
  return Math.floor((now - start) / (CYCLE_DAYS * DAY)) + 1
}

/** How many cycles are OWED but not yet minted. existingCycles counts the work orders that
 *  exist for the service (the ship mint is cycle 1). Never negative. */
export function cycleShortfall(elapsed: number, existingCycles: number): number {
  return Math.max(0, elapsed - Math.max(0, existingCycles))
}

/** Owner/team-facing title for a later cycle. */
export function cycleTitle(baseTitle: string, cycleNumber: number): string {
  return `Month ${cycleNumber}: ${baseTitle}`
}
