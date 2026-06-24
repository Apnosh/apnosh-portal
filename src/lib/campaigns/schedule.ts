/**
 * deriveSchedule — the single source of campaign dates.
 *
 * The plan's content beats only carry an abstract `week` integer. This turns
 * them into concrete calendar dates the owner can verify BEFORE they ship, and
 * the SAME function dates them at ship time, so "what you see == what gets
 * made == what posts". Replaces the old draftTargetDate(shipISO, week) which
 * only existed at ship and ignored the campaign's own anchor date.
 *
 * Three modes:
 *  - event:    a named occasion + targetDate -> schedule BACKWARD so the last
 *              beat lands on the date and teasers fall the right weeks before.
 *  - start:    a chosen start date (targetDate, no occasion) -> forward.
 *  - estimate: no date yet -> honest forward estimate from now + a production
 *              runway, clearly labelled so the owner knows to pick a start.
 */
import type { ContentBeat } from './types'

export type ScheduleMode = 'event' | 'start' | 'estimate' | 'none'

export interface DatedBeat extends ContentBeat {
  postISO: string        // YYYY-MM-DD the piece goes out
  draftReadyISO: string  // YYYY-MM-DD the owner should expect the draft for approval
  postLabel: string      // "Tue, Jul 1"
  relLabel: string       // "3 days before July 4" | "Week 1"
}

export interface DerivedSchedule {
  mode: ScheduleMode
  anchorISO: string | null
  anchorLabel: string
  beats: DatedBeat[]
  firstPostISO: string | null
  firstDraftISO: string | null
  firstPostLabel: string
  firstDraftLabel: string
  /** True when the first draft would already be due (anchor too soon to produce). */
  tooSoon: boolean
}

const DAY = 86400000
const REVIEW_LEAD_DAYS = 3    // owner sees a draft this many days before it posts
const ESTIMATE_LEAD_DAYS = 5  // production runway before the first post when no date is set

function parseDay(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00Z` : iso)
  return isNaN(d.getTime()) ? null : d
}
const toISODay = (d: Date): string => d.toISOString().slice(0, 10)
const addDays = (d: Date, n: number): Date => new Date(d.getTime() + n * DAY)
const fmtDay = (iso: string): string => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
const fmtShort = (iso: string): string => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

export function deriveSchedule(
  input: { targetDate?: string | null; occasion?: string | null; contentBeats?: ContentBeat[] | null },
  fromISO: string,
): DerivedSchedule {
  const beats = (input.contentBeats ?? []).slice().sort((a, b) => (a.week || 1) - (b.week || 1))
  if (!beats.length) return { mode: 'none', anchorISO: null, anchorLabel: '', beats: [], firstPostISO: null, firstDraftISO: null, firstPostLabel: '', firstDraftLabel: '', tooSoon: false }

  const target = parseDay(input.targetDate)
  // Normalize to a calendar day (the client passes its LOCAL today; the server
  // passes a full ship timestamp) so estimate dates don't drift by a day across
  // timezones — the rest of the math is all UTC-midnight.
  const today = parseDay((fromISO || '').slice(0, 10)) ?? new Date(0)
  const occasion = (input.occasion || '').trim()
  const maxWeek = Math.max(...beats.map((b) => b.week || 1))

  let mode: ScheduleMode
  let anchor: Date
  let postFor: (b: ContentBeat) => Date

  if (target && occasion) {
    mode = 'event'; anchor = target
    postFor = (b) => addDays(anchor, -((maxWeek - (b.week || 1)) * 7))
  } else if (target) {
    mode = 'start'; anchor = target
    postFor = (b) => addDays(anchor, ((b.week || 1) - 1) * 7)
  } else {
    mode = 'estimate'; anchor = addDays(today, ESTIMATE_LEAD_DAYS)
    postFor = (b) => addDays(anchor, ((b.week || 1) - 1) * 7)
  }

  const dated: DatedBeat[] = beats.map((b) => {
    const post = postFor(b)
    const postISO = toISODay(post)
    const draftReadyISO = toISODay(addDays(post, -REVIEW_LEAD_DAYS))
    let relLabel: string
    if (mode === 'event') {
      const daysBefore = Math.round((anchor.getTime() - post.getTime()) / DAY)
      relLabel = daysBefore <= 0 ? (occasion ? `Day of ${occasion}` : 'Day of') : `${daysBefore} day${daysBefore === 1 ? '' : 's'} before${occasion ? ` ${occasion}` : ''}`
    } else {
      relLabel = `Week ${b.week || 1}`
    }
    return { ...b, postISO, draftReadyISO, postLabel: fmtDay(postISO), relLabel }
  })

  const firstPostISO = dated.reduce<string>((m, b) => (m && m < b.postISO ? m : b.postISO), dated[0].postISO)
  const firstDraftISO = dated.reduce<string>((m, b) => (m && m < b.draftReadyISO ? m : b.draftReadyISO), dated[0].draftReadyISO)
  const anchorLabel = mode === 'event' ? (occasion || fmtShort(toISODay(anchor))) : fmtShort(toISODay(anchor))
  const tooSoon = firstDraftISO < toISODay(today)

  return { mode, anchorISO: toISODay(anchor), anchorLabel, beats: dated, firstPostISO, firstDraftISO, firstPostLabel: fmtShort(firstPostISO), firstDraftLabel: fmtShort(firstDraftISO), tooSoon }
}
