/**
 * report/report-sent — the three lines the monthly email carries, and the once-a-month claim.
 *
 * The report page has existed for months and the only way to reach it was a banner on Home, which
 * only shows if the owner already opened the app in the first two weeks of the month. So the owner
 * who stopped opening the app — the one the report is FOR — never saw it. This is the push leg.
 *
 * Two rules the whole file exists to hold:
 *
 *   · ONE EMAIL PER CLIENT PER MONTH, forever. owner_reports (migration 260) is the dedupe, and
 *     the row is CLAIMED before anything is sent: the insert either wins the month or it conflicts
 *     on unique (client_id, month). Two overlapping runs cannot both mail the same owner, and an
 *     email nobody could send is not retried every morning for the rest of the year.
 *   · NEVER A NUMBER THE LEDGER DOES NOT HOLD. A chapter with nothing in it gets the honest
 *     waiting line — the same shape the promises ledger's not_counted state gets
 *     (src/lib/promises/lines.ts) — and never a zero dressed up as a result.
 *
 * The line builders are pure so scripts/verify-wins.ts can prove them without a database.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { MonthlyReport } from './build-month'

/** The month a report covers, the way the link and the dedupe row both spell it. */
export function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

/** The month before this one, which is the month a report gets sent about. */
export function previousMonth(now: Date): { year: number; month: number } {
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth() // 0-11, so this IS last month in 1-12 terms
  return m === 0 ? { year: y - 1, month: 12 } : { year: y, month: m }
}

/**
 * Is today the first business day of its month?
 *
 * Business day, not the 1st: a report that lands on a Saturday is read on Monday with two days of
 * other mail on top of it, and a restaurant owner's Monday is already full. Monday–Friday, in UTC
 * — the same clock every other cron in this app runs on. No holiday calendar: a holiday is one
 * day's difference and a wrong calendar is a silent skip.
 */
export function isFirstBusinessDay(d: Date): boolean {
  const day = d.getUTCDay()          // 0 Sun … 6 Sat
  if (day === 0 || day === 6) return false
  const date = d.getUTCDate()
  if (date === 1) return true
  // The 2nd is the first business day when the 1st was a Sunday; the 3rd when the 1st was Saturday.
  if (date === 2 && day === 1) return true
  if (date === 3 && day === 1) return true
  return false
}

/** The i18n keys the email draws. Listed here so keys.ts and the sender cannot drift apart. */
export const MOVED_KEY = 'What it moved: {calls} calls, {directions} directions, {clicks} site visits.'
export const SAID_ONE_KEY = 'What they said: {n} new review, {avg} average.'
export const SAID_MANY_KEY = 'What they said: {n} new reviews, {avg} average.'
export const WORKED_KEY = 'What worked: {n} people saw your best post.'
export const WORKED_POSTS_KEY = 'What worked: {n} posts went out.'
/** The honest waiting line. A chapter with nothing in it says this and never a zero. */
export const WAITING_KEY = 'Not counted yet. When the numbers come in, they show up here.'

export interface ReportLine { key: string; vars: Record<string, string | number> }

/**
 * The three lines of the report, in the order the email says them: what it moved, what they said,
 * what worked. Each one is a key plus its numbers, so the sender fills them in the owner's own
 * language and grouping. A missing chapter is the waiting line, never a made-up zero.
 */
export function reportLines(r: MonthlyReport): ReportLine[] {
  const lines: ReportLine[] = []

  lines.push(r.moved
    ? { key: MOVED_KEY, vars: { calls: r.moved.calls, directions: r.moved.directions, clicks: r.moved.siteClicks } }
    : { key: WAITING_KEY, vars: {} })

  lines.push(r.said
    ? { key: r.said.count === 1 ? SAID_ONE_KEY : SAID_MANY_KEY, vars: { n: r.said.count, avg: r.said.avg.toFixed(1) } }
    : { key: WAITING_KEY, vars: {} })

  // topReach 0 means posts went out and nothing measured their reach yet — the count of posts is
  // true, "0 people saw it" is not.
  lines.push(r.worked
    ? r.worked.topReach > 0
      ? { key: WORKED_KEY, vars: { n: r.worked.topReach } }
      : { key: WORKED_POSTS_KEY, vars: { n: r.worked.posts } }
    : { key: WAITING_KEY, vars: {} })

  return lines
}

/** Did anything at all happen last month? No chapters, no email — nobody is sent an empty page. */
export function hasSomethingToSay(r: MonthlyReport): boolean {
  return !!(r.found || r.said || r.worked || r.moved)
}

/* ── the once-a-month claim ─────────────────────────────────────────────────── */

export type ClaimResult = 'claimed' | 'already' | 'no-table' | 'failed'

/**
 * Claim this client's month, or say who already has it.
 *
 * The row goes down BEFORE the email goes out, on purpose: an email sent and then not stamped is
 * an email sent twice tomorrow, and there is no undo on somebody's inbox. 'no-table' means
 * migration 260 has not been applied — the caller must stop entirely rather than send with no
 * dedupe behind it.
 */
export async function claimReportMonth(
  admin: SupabaseClient,
  clientId: string,
  month: string,
): Promise<ClaimResult> {
  const { error } = await admin.from('owner_reports').insert({ client_id: clientId, month })
  if (!error) return 'claimed'
  if (error.code === '23505') return 'already'          // somebody already has this month
  if (error.code === '42P01' || error.code === 'PGRST205') return 'no-table'
  console.warn('[report-sent] could not claim the month:', error.message)
  return 'failed'
}

/**
 * They opened the report the email pointed at. Best-effort in every direction: before migration
 * 260 the table is not there, and a stamp is never worth a broken page. Only stamps a month that
 * was actually SENT (the update matches nothing otherwise), so an owner browsing back through old
 * months does not invent a push that never happened.
 */
export async function stampReportOpened(
  admin: SupabaseClient,
  clientId: string,
  month: string,
): Promise<void> {
  try {
    const { error } = await admin
      .from('owner_reports')
      .update({ opened_at: new Date().toISOString() })
      .eq('client_id', clientId)
      .eq('month', month)
      .is('opened_at', null)
    if (error && error.code !== '42P01' && error.code !== '42703' && error.code !== 'PGRST205') {
      console.warn('[report-sent] could not stamp the open:', error.message)
    }
  } catch (e) {
    console.warn('[report-sent] open stamp threw:', (e as Error)?.message)
  }
}
