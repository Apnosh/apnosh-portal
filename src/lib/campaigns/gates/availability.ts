/**
 * Checkout Gates — the pure slot engine. Given a published availability rule, the bookings that
 * already exist against it, and "now", compute the OPEN slots a client may pick. Pure + client-safe
 * (no DB, no Stripe): the admin live-preview, the client picker, and the Phase-2 hold check all call
 * this ONE function, so what the admin sees is exactly what the client can book.
 *
 * Honesty by construction: a slot is open ONLY if a window actually allows it, the lead time +
 * horizon pass, and live bookings are below capacity. A held booking counts against capacity ONLY
 * while its hold hasn't expired (no release cron — expiry is evaluated here, at read time).
 */
import type { AvailabilityRule, BookingRef, OpenSlot, Window } from './types'

const DAY_MS = 86_400_000

/** 'YYYY-MM-DD' of a Date's UTC calendar day (we treat all dates as tz-agnostic calendar days;
 *  the wall-clock TIME carries the rule's timezone, so the day math never needs an offset). */
function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Add n BUSINESS days (skip Sat/Sun) to an ISO day. Mirrors aggregate-golive.addBusinessDays so the
 *  lead-time runway matches the go-live estimate the owner already sees. */
export function addBusinessDays(fromISO: string, n: number): string {
  const d = new Date(`${fromISO.slice(0, 10)}T00:00:00Z`)
  let added = 0
  while (added < n) {
    d.setTime(d.getTime() + DAY_MS)
    const dow = d.getUTCDay()
    if (dow !== 0 && dow !== 6) added++
  }
  return d.toISOString().slice(0, 10)
}

/** Minutes since midnight for an 'HH:MM'. Returns NaN on a malformed value (skipped by the caller). */
function toMinutes(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm?.trim() ?? '')
  if (!m) return NaN
  const h = Number(m[1]), min = Number(m[2])
  if (h < 0 || h > 23 || min < 0 || min > 59) return NaN
  return h * 60 + min
}

/** 'HH:MM' from minutes since midnight. */
function fromMinutes(mins: number): string {
  const h = Math.floor(mins / 60), m = mins % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Split one window into back-to-back slots of slotMinutes; a trailing remainder shorter than a full
 *  slot is dropped (we never offer a partial slot). */
function slotsInWindow(w: Window, slotMinutes: number): Array<{ start: string; end: string }> {
  const s = toMinutes(w.start), e = toMinutes(w.end)
  if (Number.isNaN(s) || Number.isNaN(e) || e <= s || slotMinutes <= 0) return []
  const out: Array<{ start: string; end: string }> = []
  for (let t = s; t + slotMinutes <= e; t += slotMinutes) out.push({ start: fromMinutes(t), end: fromMinutes(t + slotMinutes) })
  return out
}

/** The windows in effect on a given ISO day: an exceptions entry (even []) overrides the weekly
 *  default entirely; otherwise the weekday's weekly windows (or none). */
function windowsForDay(rule: AvailabilityRule, dayISO: string): Window[] {
  if (Object.prototype.hasOwnProperty.call(rule.exceptions ?? {}, dayISO)) return rule.exceptions[dayISO] ?? []
  const dow = String(new Date(`${dayISO}T00:00:00Z`).getUTCDay())
  return (rule.weekly ?? {})[dow] ?? []
}

/** How many live bookings occupy a given (date, start): confirmed always, held only while unexpired. */
function occupied(bookings: BookingRef[], ruleId: string, date: string, start: string, nowMs: number): number {
  let n = 0
  for (const b of bookings) {
    if (b.ruleId !== ruleId || b.slotDate !== date || b.slotStart !== start) continue
    if (b.status === 'confirmed') { n++; continue }
    if (b.status === 'held') {
      const exp = b.holdExpiresAt ? Date.parse(b.holdExpiresAt) : 0
      if (exp > nowMs) n++          // an unexpired hold still occupies; an expired one is ignored
    }
    // needs_reschedule / cancelled / completed never occupy a future slot
  }
  return n
}

/**
 * Compute the open slots for a rule. Returns [] for an inactive rule (never leak draft supply).
 * `maxSlots` caps the result (a long horizon can produce many); callers page/limit as needed.
 */
export function computeOpenSlots(
  rule: AvailabilityRule,
  bookings: BookingRef[],
  nowISO: string,
  maxSlots = 60,
): OpenSlot[] {
  if (!rule.active) return []
  const now = new Date(nowISO)
  const nowMs = now.getTime()
  const today = isoDay(now)
  const earliest = addBusinessDays(today, Math.max(0, rule.leadTimeDays))          // business-day runway
  const horizonEnd = isoDay(new Date(nowMs + Math.max(1, rule.horizonDays) * DAY_MS))

  const out: OpenSlot[] = []
  let cursor = new Date(`${earliest}T00:00:00Z`)
  const end = new Date(`${horizonEnd}T00:00:00Z`)
  while (cursor.getTime() <= end.getTime() && out.length < maxSlots) {
    const dayISO = isoDay(cursor)
    for (const w of windowsForDay(rule, dayISO)) {
      for (const slot of slotsInWindow(w, rule.slotMinutes)) {
        const remaining = Math.max(0, rule.capacity - occupied(bookings, rule.id, dayISO, slot.start, nowMs))
        if (remaining > 0) {
          out.push({ ruleId: rule.id, date: dayISO, start: slot.start, end: slot.end, timezone: rule.timezone, remaining })
          if (out.length >= maxSlots) break
        }
      }
      if (out.length >= maxSlots) break
    }
    cursor = new Date(cursor.getTime() + DAY_MS)
  }
  return out
}
