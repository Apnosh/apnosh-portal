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

export type DesignJobId = 'weekly-special' | 'event-promo' | 'announcement' | 'new-menu' | 'holiday-hours' | 'hiring' | 'other'

export const DESIGN_JOBS: readonly { id: DesignJobId; label: string }[] = [
  { id: 'weekly-special', label: 'Weekly special' },
  { id: 'event-promo', label: 'Event promo' },
  { id: 'announcement', label: 'Announcement' },
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
  { id: 'announcement', phrases: ['grand opening', 'now open', 'just got on', 'big news', 'reopening', 'new location'], words: ['announcement', 'announce', 'opening', 'doordash', 'ubereats', 'grubhub'] },
  { id: 'new-menu', phrases: ['new menu', 'menu redesign', 'updated menu', 'menu board'], words: ['menu'] },
  { id: 'holiday-hours', phrases: ['holiday hours', 'closed for', 'open late', 'special hours', 'closing early', 'labor day', 'memorial day', 'new years'], words: ['hours', 'holiday', 'thanksgiving', 'christmas', 'closed'] },
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
  /** THE EVENT'S date, never the delivery date. Only when the day itself appears in the text
   *  (the credibility law). The flow asks the need-by date separately: a flyer due the night
   *  of the event promotes nothing. */
  eventDateISO?: string
  /** 'YYYY-MM' when they named a month but no day: anchors the calendar, never a date */
  monthHint?: string
  destinations?: DestinationId[]
  /** they said they have photos / want us to use their photos */
  ownPhotos?: boolean
  /** rush language present ("need it by", "asap", "tomorrow") — opens the date step, never charges */
  rushLanguage?: boolean
  /** cited words per field, for the price lines and read-back chips */
  /** things they asked us to make that no destination covers (banner, email, gift cards):
   *  said out loud, never silently dropped */
  unplaced?: string[]
  cited: Partial<Record<'jobType' | 'message' | 'offer' | 'eventDate' | 'destinations' | 'ownPhotos', string>>
}

const str = (v: unknown, max = 200) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined)

/** Products owners really ask for that we do not make here (yet). Found in the text, they are
 *  SAID OUT LOUD in the flow — an order must never silently shrink. */
const UNPLACED_PRODUCTS = [
  'business card', 'sticker', 'decal', 'billboard',
  't-shirt', 'loyalty card', 'punch card', 'yard sign', 'window cling',
] as const

export function unplacedAsks(text: string): string[] {
  const t = text.toLowerCase()
  return UNPLACED_PRODUCTS.filter((w) => t.includes(w))
}

/** The local destination floor for plainly-named products: if the owner wrote the word, the
 *  checkbox ticks itself, model or no model. Cited by the matched word (the evidence law
 *  holds by construction). */
const DEST_CUES: readonly { id: DestinationId; re: RegExp }[] = [
  { id: 'banner', re: /\bbanners?\b/i },
  { id: 'email-header', re: /\bemail\b/i },
  { id: 'gift-card', re: /\bgift\s?cards?\b/i },
]

const cuedDestinations = (text: string, have: DestinationId[]): { id: DestinationId; word: string }[] =>
  DEST_CUES.filter((c) => !have.includes(c.id) && c.re.test(text)).map((c) => ({ id: c.id, word: text.match(c.re)![0] }))

/** Local, so it works even when the model is down. Never charges; only makes the date step
 *  speak up sooner. */
const hasRushLanguage = (text: string) =>
  /asap|as soon as|tomorrow|tonight|by (mon|tues|wednes|thurs|fri|satur|sun)day|rush|urgent|today/i.test(text)

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
    const cued = cuedDestinations(text, [])
    if (cued.length) { out.destinations = cued.map((c) => c.id); out.cited.destinations = cued.map((c) => c.word).join(', ') }
    const up = unplacedAsks(text)
    if (up.length) out.unplaced = up
    out.rushLanguage = hasRushLanguage(text) || undefined
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

  const date = backedValue(r.eventDate, text)
  const future = typeof date === 'string' && credibleDate(date, text) ? futureDate(date, todayISO) : null
  if (future) { out.eventDateISO = future; cite('eventDate', r.eventDate) }
  else out.monthHint = monthHintFrom(text, todayISO) ?? undefined

  const dests = backedValue(r.destinations, text)
  if (Array.isArray(dests)) {
    const valid = dests.filter((d): d is DestinationId => DESTINATIONS.some((x) => x.id === d))
    if (valid.length) { out.destinations = valid; cite('destinations', r.destinations) }
  }

  const cued = cuedDestinations(text, out.destinations ?? [])
  if (cued.length) {
    out.destinations = [...(out.destinations ?? []), ...cued.map((c) => c.id)]
    if (!out.cited.destinations) out.cited.destinations = cued.map((c) => c.word).join(', ')
  }

  const own = backedValue(r.ownPhotos, text)
  if (own === true) { out.ownPhotos = true; cite('ownPhotos', r.ownPhotos) }

  /* The model may name unsupported asks too (quote-backed); the local scan is the floor.
   * Union of both, deduped: the owner hears every dropped ask exactly once. */
  const modelUp = Array.isArray(r.unsupported)
    ? r.unsupported.map((u) => str(backedValue(u, text), 40)).filter((v): v is string => !!v)
    : []
  const merged = [...new Set([...unplacedAsks(text), ...modelUp.map((v) => v.toLowerCase())])]
  /* "big banner" collapses into "banner": keep the shortest name for each ask. */
  const covered = merged.filter((v) => !DEST_CUES.some((c) => c.re.test(v)))
  const up = covered.filter((v) => !covered.some((o) => o !== v && v.includes(o)))
  if (up.length) out.unplaced = up

  out.rushLanguage = hasRushLanguage(text) || undefined

  return out
}
