/**
 * THE DESIGN DESCRIBE-READ — the campaign read's laws with a design vocabulary
 * (DESIGN-ORDERING spec, Phase B; reuse flag 2 resolved by extraction, not forking).
 *
 * Same rules as the campaign flow: every confident extraction cites the words it came from
 * (read-evidence.ts, the shared gate), values must survive OUR vocabulary, a date is only a
 * date when its day appears in the text, and the local matcher keeps the flow alive when the
 * model is down. Low confidence still asks.
 *
 * Pure and sim-locked in scripts/sim/design-pricing.ts.
 */

import { backedValue, backedQuote } from '../campaigns/data/read-evidence'
import { credibleDate, monthHintFrom, futureDate } from '../campaigns/data/plan-goals'
import { DESTINATIONS, type DestinationId } from './destinations'

/* ── the job vocabulary ───────────────────────────────────────────────────────────────────── */

export type DesignJobId = 'weekly-special' | 'event-promo' | 'new-menu' | 'holiday-hours' | 'hiring' | 'other'

export const DESIGN_JOBS: readonly { id: DesignJobId; label: string }[] = [
  { id: 'weekly-special', label: 'Weekly special' },
  { id: 'event-promo', label: 'Event promo' },
  { id: 'new-menu', label: 'New menu' },
  { id: 'holiday-hours', label: 'Holiday hours' },
  { id: 'hiring', label: 'Hiring post' },
  { id: 'other', label: 'Something else' },
]

/**
 * The local floor: weighted keyword matching, no model. Deliberately dumb — its whole job is
 * to be available when the smart thing is not. A tie or a miss returns null, and null is
 * honest: the chips then ask.
 */
const JOB_CUES: readonly { id: DesignJobId; phrases: readonly string[]; words: readonly string[] }[] = [
  { id: 'weekly-special', phrases: ['weekly special', 'this week', 'special of the week', 'lunch special', 'dinner special'], words: ['special'] },
  { id: 'event-promo', phrases: ['live music', 'trivia night', 'event this', 'one night'], words: ['event', 'party', 'concert', 'dj', 'night'] },
  { id: 'new-menu', phrases: ['new menu', 'menu redesign', 'updated menu', 'menu board'], words: ['menu'] },
  { id: 'holiday-hours', phrases: ['holiday hours', 'closed for', 'open late', 'special hours', 'closing early'], words: ['hours', 'holiday', 'thanksgiving', 'christmas'] },
  { id: 'hiring', phrases: ['now hiring', 'help wanted', 'join our team', 'we are hiring'], words: ['hiring', 'hire', 'staff'] },
]

export function matchDesignJob(text: string): DesignJobId | null {
  const t = text.toLowerCase()
  const scores = JOB_CUES.map((c) => ({
    id: c.id,
    s: c.phrases.filter((p) => t.includes(p)).length * 3 + c.words.filter((w) => new RegExp(`\\b${w}\\b`).test(t)).length,
  })).sort((a, b) => b.s - a.s)
  if (!scores[0] || scores[0].s === 0) return null
  if (scores[1] && scores[1].s === scores[0].s) return null // a tie is a miss; the chips ask
  return scores[0].id
}

/* ── the wide read ────────────────────────────────────────────────────────────────────────── */

export interface DesignRead {
  jobType?: DesignJobId
  /** the headline message, in their words */
  message?: string
  offer?: string
  /** only when the day itself appears in the text (the credibility law) */
  dateISO?: string
  /** 'YYYY-MM' when they named a month but no day: anchors the calendar, never a date */
  monthHint?: string
  destinations?: DestinationId[]
  /** they said they have photos / want us to use their photos */
  ownPhotos?: boolean
  /** rush language present ("need it by", "asap", "tomorrow") — opens the date step, never charges */
  rushLanguage?: boolean
  /** cited words per field, for the price lines and read-back chips */
  cited: Partial<Record<'jobType' | 'message' | 'offer' | 'dateISO' | 'destinations' | 'ownPhotos', string>>
}

const str = (v: unknown, max = 200) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined)

/**
 * Server-side sanitation of the model's read, through the shared evidence gate. The model may
 * not widen the vocabulary: unknown jobs and destinations silently disappear rather than
 * silently ordering.
 */
export function sanitizeDesignRead(raw: unknown, text: string, todayISO: string): DesignRead {
  const out: DesignRead = { cited: {} }
  if (!raw || typeof raw !== 'object') {
    const local = matchDesignJob(text)
    if (local) out.jobType = local
    out.monthHint = monthHintFrom(text, todayISO) ?? undefined
    return out
  }
  const r = raw as Record<string, unknown>
  const cite = (k: keyof DesignRead['cited'], field: unknown) => {
    const q = backedQuote(field, text)
    if (q) out.cited[k] = q
  }

  const job = backedValue(r.jobType, text)
  if (DESIGN_JOBS.some((j) => j.id === job)) { out.jobType = job as DesignJobId; cite('jobType', r.jobType) }
  else {
    const local = matchDesignJob(text)
    if (local) out.jobType = local
  }

  const message = str(backedValue(r.message, text))
  if (message) { out.message = message; cite('message', r.message) }

  const offer = str(backedValue(r.offer, text), 120)
  /* Same vagueness rule as campaigns: a deal with no number and no shape is a wish, not terms. */
  if (offer && (/\d/.test(offer) || /free|two for one|2 for 1|bogo/i.test(offer))) { out.offer = offer; cite('offer', r.offer) }

  const date = backedValue(r.dateISO, text)
  const future = typeof date === 'string' && credibleDate(date, text) ? futureDate(date, todayISO) : null
  if (future) { out.dateISO = future; cite('dateISO', r.dateISO) }
  else out.monthHint = monthHintFrom(text, todayISO) ?? undefined

  const dests = backedValue(r.destinations, text)
  if (Array.isArray(dests)) {
    const valid = dests.filter((d): d is DestinationId => DESTINATIONS.some((x) => x.id === d))
    if (valid.length) { out.destinations = valid; cite('destinations', r.destinations) }
  }

  const own = backedValue(r.ownPhotos, text)
  if (own === true) { out.ownPhotos = true; cite('ownPhotos', r.ownPhotos) }

  /* Rush language never charges anything; it only makes the date step ask sooner. Local check
   * so it works even when the model is down. */
  out.rushLanguage = /asap|as soon as|tomorrow|tonight|by (mon|tues|wednes|thurs|fri|satur|sun)day|rush|urgent|today/i.test(text) || undefined

  return out
}
