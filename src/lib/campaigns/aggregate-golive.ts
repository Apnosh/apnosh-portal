/**
 * aggregateGoLive — rolls every service's turnaround (service-turnaround.ts) + the content schedule
 * into ONE honest "live in about X" estimate for the whole campaign, shown BEFORE the owner ships.
 *
 * Two load-bearing ideas:
 *  1. GOING LIVE = the FIRST thing going live, which is the FASTEST piece to make (a quick post/email
 *     in a few days), NOT the slowest shoot-based reel — the reels post later on the content calendar,
 *     so they don't gate "we're live". Setup and that first content run in PARALLEL, so the estimate is
 *     a critical PATH (the longer of the two tracks), never a sum.
 *  2. NO REPEATS — setup a restaurant already has (Google profile connected, analytics live, socials
 *     linked) is passed in via `doneSetupIds` and counts as ZERO time; we never re-quote what's done.
 *   firstLive = max( slowest REMAINING setup (+its gate),  fastest content (+shoot lead only if it needs one) )
 * Recurring services don't gate the first post; they fold in as "then starts running". Everything is
 * a min-max RANGE. Pure + deterministic.
 */

import type { LineItem } from './types'
import type { DerivedSchedule } from './schedule'
import { turnaroundFor, contentTurnaround } from './data/service-turnaround'

const REVIEW_LEAD = 3 // business days the owner gets a draft before it can post (mirrors schedule.ts)
const DAY = 86400000

export interface GoLiveEstimate {
  /** business days from now to the first thing going live (the critical path). */
  daysToFirstPost: { min: number; max: number }
  /** plain phrase for the headline, e.g. "about 2-3 weeks" / "about a week". '' if nothing to time. */
  phrase: string
  /** `services` = setup still to do; `alreadyDone` = setup skipped because it's already in place. */
  setup: { present: boolean; min: number; max: number; byISO: string | null; services: string[]; alreadyDone: string[] }
  creative: { present: boolean; min: number; max: number; needsShoot: boolean }
  recurring: { present: boolean; startsWithinMax: number }
  /** unique external/owner dependencies that move the date, owner-facing. */
  gates: string[]
  /** convenience: at least one thing actually posts/goes live (vs recurring-only). */
  hasGoLive: boolean
}

/** Add n business days (skip Sat/Sun) to an ISO day. */
export function addBusinessDays(fromISO: string, n: number): string {
  const d = new Date(`${fromISO.slice(0, 10)}T00:00:00Z`)
  let added = 0
  while (added < n) {
    d.setTime(d.getTime() + DAY)
    const dow = d.getUTCDay()
    if (dow !== 0 && dow !== 6) added++
  }
  return d.toISOString().slice(0, 10)
}

/** Business-day range → a friendly "about N weeks" / "about a week" phrase (5 business days ≈ 1 week). */
export function weeksPhrase(minB: number, maxB: number): string {
  if (maxB <= 0) return ''
  if (maxB <= 6) return 'about a week'
  const wMin = Math.max(1, Math.round(minB / 5))
  const wMax = Math.max(1, Math.round(maxB / 5))
  if (wMax <= 1) return 'about a week'
  return wMin === wMax ? `about ${wMax} weeks` : `about ${wMin}-${wMax} weeks`
}

export function aggregateGoLive(
  services: LineItem[],
  sched: DerivedSchedule,
  fromISO: string,
  opts?: { doneSetupIds?: readonly string[] },
): GoLiveEstimate {
  const today = fromISO.slice(0, 10)
  const gates = new Set<string>()
  const done = new Set(opts?.doneSetupIds ?? [])

  // ── 1. setup track: slowest REMAINING setup wins (they run concurrently), incl. its external gate.
  //      Anything already in place (passed in `done`) is skipped — 0 time, listed under alreadyDone. ──
  let setupMin = 0, setupMax = 0
  const setupServices: string[] = []
  const alreadyDone: string[] = []
  for (const it of services) {
    const t = it.serviceId ? turnaroundFor(it.serviceId) : undefined
    if (!t || t.class !== 'setup') continue
    const label = it.plain || it.name || it.serviceId || ''
    if (it.serviceId && done.has(it.serviceId)) { alreadyDone.push(label); continue }
    setupServices.push(label)
    const lo = t.business.min + (t.gate ? t.gate.addDays.min : 0)
    const hi = t.business.max + (t.gate ? t.gate.addDays.max : 0)
    if (hi > setupMax) { setupMax = hi }
    if (lo > setupMin) { setupMin = lo }
    if (t.gate) gates.add(t.gate.note)
  }

  // ── 2. creative track: the FIRST thing to go live is the FASTEST piece to make. A no-shoot piece
  //      (post/email/story) carries no shoot lead, so it can be live in days; a shoot piece adds the
  //      one-time shoot lead. We keep the SMALLEST lead — the slower pieces post later on the calendar. ──
  let firstLiveMin = Infinity, firstLiveMax = Infinity, anyShoot = false, anyCreative = false
  const considerCreative = (min: number, max: number, needsShoot: boolean, sl?: { min: number; max: number }) => {
    anyCreative = true
    const slMin = needsShoot ? (sl?.min ?? 5) : 0
    const slMax = needsShoot ? (sl?.max ?? 10) : 0
    if (needsShoot) anyShoot = true
    const leadMin = slMin + min + REVIEW_LEAD
    const leadMax = slMax + max + REVIEW_LEAD
    if (leadMax < firstLiveMax) { firstLiveMax = leadMax; firstLiveMin = leadMin } // fastest piece goes live first
  }
  for (const it of services) {
    const t = it.serviceId ? turnaroundFor(it.serviceId) : undefined
    if (!t || t.class !== 'creative') continue
    considerCreative(t.business.min, t.business.max, !!t.needsShoot, t.shootLeadDays)
  }
  for (const b of sched.beats) {
    const ct = contentTurnaround(b.type)
    considerCreative(ct.min, ct.max, ct.needsShoot)
  }
  const creativeMin = anyCreative ? firstLiveMin : 0
  const creativeMax = anyCreative ? firstLiveMax : 0
  if (anyShoot) gates.add('We coordinate an on-site shoot, usually within 1-2 weeks.')
  if (anyCreative) gates.add('Every piece waits on your approval before it posts.')

  // ── 3. recurring track: doesn't gate the first post, just "starts within" ──
  let recurringPresent = false, recurringStartMin = 99, recurringStartMax = 0
  for (const it of services) {
    const t = it.serviceId ? turnaroundFor(it.serviceId) : undefined
    if (!t || t.class !== 'recurring') continue
    recurringPresent = true
    if (t.startsWithin.min < recurringStartMin) recurringStartMin = t.startsWithin.min
    if (t.startsWithin.max > recurringStartMax) recurringStartMax = t.startsWithin.max
  }

  // ── 4. critical path: the longer of the two parallel tracks ──
  const hasGoLive = setupServices.length > 0 || anyCreative
  let firstMin = Math.max(setupMin, creativeMin)
  let firstMax = Math.max(setupMax, creativeMax)
  if (!hasGoLive && recurringPresent) { firstMin = recurringStartMin; firstMax = recurringStartMax }

  const setupByISO = setupServices.length ? addBusinessDays(today, setupMax) : null

  return {
    daysToFirstPost: { min: firstMin, max: firstMax },
    phrase: weeksPhrase(firstMin, firstMax),
    setup: { present: setupServices.length > 0, min: setupMin, max: setupMax, byISO: setupByISO, services: setupServices, alreadyDone },
    creative: { present: anyCreative, min: creativeMin, max: creativeMax, needsShoot: anyShoot },
    recurring: { present: recurringPresent, startsWithinMax: recurringPresent ? recurringStartMax : 0 },
    gates: [...gates],
    hasGoLive,
  }
}
