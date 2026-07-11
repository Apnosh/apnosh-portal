/**
 * gbp-apply/validate — the deterministic guard every GBP description passes through, on BOTH paths:
 * after the AI drafts it (draft.ts) and again on the live push (dispatch.ts pushWrite). Code-level,
 * not model-level, so a jailbroken draft or a hand-edited value can never bypass it. Google rejects
 * descriptions over 750 chars and prohibits URLs/phones in the field; we also refuse degenerate
 * too-short output rather than shipping filler to a paying client's public listing.
 */

export const DESCRIPTION_MAX = 750
export const DESCRIPTION_MIN = 250

const URL_RE = /(https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(com|net|org|io|co|menu|shop|app|biz|info)\b/i
const EMAIL_RE = /\b[\w.+-]+@[\w-]+\.[\w.]+\b/
// 7+ digit runs with common phone separators (555-123-4567, (555) 123 4567, 5551234567).
const PHONE_RE = /(\+?\d[\s().-]*){7,}/

export function validateDescription(text: string): { ok: true; value: string } | { ok: false; error: string } {
  const v = text.trim()
  if (!v) return { ok: false, error: 'The description is empty.' }
  if (v.length > DESCRIPTION_MAX) return { ok: false, error: `The description is over Google's ${DESCRIPTION_MAX}-character limit (${v.length}). Trim it and try again.` }
  if (v.length < DESCRIPTION_MIN) return { ok: false, error: 'The description came out too short to be worth publishing. Draft it again.' }
  if (URL_RE.test(v)) return { ok: false, error: 'Google does not allow links in the description. Remove the URL.' }
  if (EMAIL_RE.test(v)) return { ok: false, error: 'Remove the email address; Google does not allow contact details in the description.' }
  if (PHONE_RE.test(v)) return { ok: false, error: 'Remove the phone number; it belongs in the phone field, not the description.' }
  return { ok: true, value: v }
}

/** Cut to the limit at a sentence boundary (falling back to a word boundary), never mid-word. */
export function truncateAtBoundary(text: string, max = DESCRIPTION_MAX): string {
  const v = text.trim()
  if (v.length <= max) return v
  const slice = v.slice(0, max)
  const sentenceEnd = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('! '), slice.lastIndexOf('? '))
  if (sentenceEnd > max * 0.6) return slice.slice(0, sentenceEnd + 1).trim()
  const wordEnd = slice.lastIndexOf(' ')
  return (wordEnd > 0 ? slice.slice(0, wordEnd) : slice).trim()
}

/* ── Website (websiteUri) ── */

// GBP accepts long URLs; 2000 is a sane practical cap well under browser/API limits.
export const WEBSITE_MAX = 2000

export function validateWebsite(value: string): { ok: true; value: string } | { ok: false; error: string } {
  const v = value.trim()
  if (!v) return { ok: false, error: 'The website address is empty.' }
  if (v.length > WEBSITE_MAX) return { ok: false, error: `The website address is too long (over ${WEBSITE_MAX} characters).` }
  if (/\s/.test(v)) return { ok: false, error: 'The website address has a space in it. Remove the space and try again.' }
  if (!/^https:\/\//i.test(v)) return { ok: false, error: 'The website address must start with https:// so Google shows a secure link.' }
  let parsed: URL
  try {
    parsed = new URL(v)
  } catch {
    return { ok: false, error: 'That does not look like a working web address. Check it and try again.' }
  }
  if (parsed.protocol !== 'https:') return { ok: false, error: 'The website address must start with https:// so Google shows a secure link.' }
  if (!parsed.hostname.includes('.')) return { ok: false, error: 'The website address is missing its domain (like yourplace.com).' }
  return { ok: true, value: v }
}

/* ── Phone (phoneNumbers.primaryPhone) ── */

// Digits plus common phone punctuation only; 10–15 digits (US local through full E.164).
const PHONE_CHARS_RE = /^\+?[0-9()\-.\s]+$/

export function validatePhone(value: string): { ok: true; value: string } | { ok: false; error: string } {
  const v = value.trim()
  if (!v) return { ok: false, error: 'The phone number is empty.' }
  if (!PHONE_CHARS_RE.test(v)) return { ok: false, error: 'The phone number can only use digits, spaces, dashes, dots, parentheses, and a leading +.' }
  const digits = v.replace(/\D/g, '')
  if (digits.length < 10) return { ok: false, error: `A phone number needs at least 10 digits (got ${digits.length}).` }
  if (digits.length > 15) return { ok: false, error: `A phone number can have at most 15 digits (got ${digits.length}).` }
  return { ok: true, value: v }
}

/* ── Hours (regularHours) ── */

import type { WeeklyHours, DayKey } from '@/lib/gbp-listing'

export const GBP_DAY_ORDER = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] as const
export type GbpDayName = (typeof GBP_DAY_ORDER)[number]

const GBP_DAY_TO_KEY: Record<GbpDayName, DayKey> = {
  MONDAY: 'mon', TUESDAY: 'tue', WEDNESDAY: 'wed', THURSDAY: 'thu',
  FRIDAY: 'fri', SATURDAY: 'sat', SUNDAY: 'sun',
}

/** UI-friendly hours shape: exactly one entry per day, all 7 days, one open range per day.
 *  The write REPLACES the profile's regularHours entirely, so a partial week would silently
 *  erase the missing days — that is why all 7 are required. */
export interface HoursDayInput {
  day: GbpDayName
  closed: boolean
  open?: string   // 'HH:MM' 24h, required when closed is false
  close?: string  // 'HH:MM' 24h, or '24:00'/'00:00' for a midnight close
}

const OPEN_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))

/**
 * Deterministic hours guard. Enforces: exactly the 7 real days, once each; HH:MM times;
 * open strictly before close on the same day, with '24:00' (or '00:00') allowed as a
 * midnight close (the one overnight shape the existing round-trip machinery represents
 * losslessly — periodsToWeekly reads any cross-midnight close back as '24:00'). Hours
 * past midnight (e.g. close 02:00) are refused rather than silently mangled. One range
 * per day by construction. All-7-closed is refused: that write would erase the hours.
 */
export function validateHoursWeek(input: unknown): { ok: true; value: WeeklyHours } | { ok: false; error: string } {
  if (!Array.isArray(input)) return { ok: false, error: 'Hours must be a list of 7 days.' }
  if (input.length !== 7) return { ok: false, error: `Send all 7 days (got ${input.length}). The save replaces the whole weekly schedule, so a missing day would be erased.` }

  const weekly: WeeklyHours = { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] }
  const seen = new Set<GbpDayName>()
  let openDays = 0

  for (const raw of input) {
    if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'Each day must be an object like { day, closed, open, close }.' }
    const entry = raw as Record<string, unknown>
    const day = entry.day
    if (typeof day !== 'string' || !(GBP_DAY_ORDER as readonly string[]).includes(day)) {
      return { ok: false, error: `"${String(entry.day)}" is not a day Google knows. Use MONDAY through SUNDAY.` }
    }
    const dayName = day as GbpDayName
    if (seen.has(dayName)) return { ok: false, error: `${dayName} appears twice. Send each day exactly once.` }
    seen.add(dayName)
    if (typeof entry.closed !== 'boolean') return { ok: false, error: `${dayName} is missing closed: true or false.` }
    if (entry.closed) continue

    const open = entry.open
    const close = entry.close
    if (typeof open !== 'string' || typeof close !== 'string') {
      return { ok: false, error: `${dayName} is open but is missing its open or close time.` }
    }
    if (!OPEN_TIME_RE.test(open)) return { ok: false, error: `${dayName}'s open time "${open}" is not a valid HH:MM time (00:00 to 23:59).` }
    const isMidnightClose = close === '24:00' || close === '00:00'
    if (!isMidnightClose && !OPEN_TIME_RE.test(close)) {
      return { ok: false, error: `${dayName}'s close time "${close}" is not a valid HH:MM time (or 24:00 for midnight).` }
    }
    if (!isMidnightClose && toMinutes(close) <= toMinutes(open)) {
      return { ok: false, error: `${dayName} closes at or before it opens (${open} to ${close}). Hours that run past midnight are not supported here yet — set the close to 24:00 (midnight) or make that edit in the Google dashboard.` }
    }
    // Canonical midnight close is '24:00' so the read-back (which reports cross-midnight
    // closes as '24:00') compares cleanly.
    weekly[GBP_DAY_TO_KEY[dayName]] = [{ open, close: isMidnightClose ? '24:00' : close }]
    openDays++
  }

  if (openDays === 0) {
    return { ok: false, error: 'Every day is marked closed. Saving that would remove all hours from the profile. If the business is temporarily closed, set that in the Google dashboard instead.' }
  }
  return { ok: true, value: weekly }
}

/* ── GBP local posts (What's New) ── */

// Google's summary cap is 1500; we stop well short so posts read like posts, not essays.
export const POST_MAX = 1200
export const POST_MIN = 80

// Post copy is full of dotted times ("5.30-10.30"), dotted dates, and prices, which
// the description's dot-tolerant PHONE_RE reads as phone numbers. Posts drop '.' from
// the separator set: real phone shapes (555-123-4567, (555) 123 4567) still match.
const PHONE_RE_POST = /(\+?\d[\s()-]*){7,}/

export function validateGbpPost(text: string): { ok: true; value: string } | { ok: false; error: string } {
  const v = text.trim()
  if (!v) return { ok: false, error: 'The post is empty.' }
  if (v.length > POST_MAX) return { ok: false, error: `The post is over ${POST_MAX} characters (${v.length}). Trim it and try again.` }
  if (v.length < POST_MIN) return { ok: false, error: 'The post came out too short to be worth publishing. Draft it again.' }
  // Same contact-detail guards as the description: the post's button carries the
  // link, and a raw URL/phone in the summary reads as spam on the public profile.
  if (URL_RE.test(v)) return { ok: false, error: 'Remove the link from the post text — the post button carries the link.' }
  if (EMAIL_RE.test(v)) return { ok: false, error: 'Remove the email address from the post.' }
  if (PHONE_RE_POST.test(v)) return { ok: false, error: 'Remove the phone number from the post; the profile already shows it.' }
  return { ok: true, value: v }
}
