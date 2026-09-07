/**
 * promises/lines — THE SEVEN STATES, and the one line, pill and action each of them gets.
 *
 * Every order lives the same seven states, and an owner has to read the same words for a state
 * wherever they meet it: on the Campaigns card, on Home, in the "your count is in" email. Before
 * this the words were written in three places and had already drifted — a card said "Done" for an
 * order the strip called "Counting".
 *
 * Pure + client-safe (no server imports, no clock, no I/O) so the card, the cron and a script all
 * read the same table. read.ts computes WHICH state a row is in; this file says what it is called.
 */

export type PromiseState =
  /** paid, and no work order has a name on it yet */
  | 'ordered'
  /** somebody is on it and has started */
  | 'production'
  /** the owner picked a start date that has not arrived */
  | 'held'
  /** the work landed; the count has not started */
  | 'delivered'
  /** count_from has passed, no number yet */
  | 'counting'
  /** shows_on has passed and there is a number */
  | 'counted'
  /** the campaign was stopped (with the refund line, when money went back) */
  | 'stopped'
  /** not a stage of an order at all: the honest answer for a number the product cannot read */
  | 'not_counted'

/**
 * WHICH WAY THE NUMBER MOVED. read.ts works this out once, per row, against the matched baseline
 * (or, for a rating, against the rating the order started at) and writes it on the row. Anything
 * that needs to know good news from bad news reads THIS, and never re-derives it from the printed
 * line — two derivations drift, and the drift is what let a rating that FELL become a public win.
 *
 * up/down/flat are counts that came in; wait/done/off are rows with no comparison to make.
 */
export type PromiseTone = 'up' | 'down' | 'flat' | 'wait' | 'done' | 'off'

/** The pill word. null = keep whatever the card already worked out for itself. */
export const PILL_FOR: Record<PromiseState, string | null> = {
  ordered: 'Ordered',
  production: 'In production',
  held: 'Held',
  delivered: 'Delivered',
  counting: 'Counting',
  counted: 'Counted',
  stopped: 'Stopped',
  not_counted: null,
}

/** ONE action per state. null = there is nothing for the owner to do, so the card shows no button. */
export const ACTION_FOR: Record<PromiseState, string | null> = {
  ordered: 'See your order',
  production: null,
  held: null,
  delivered: 'Open what landed',
  counting: 'See results',
  counted: 'See results',
  stopped: 'See details',
  not_counted: null,
}

/** Counted and Stopped are history; everything else is an order still running. */
export const DONE_STATES = new Set<PromiseState>(['counted', 'stopped'])

/** Newest first, but a row with a number outranks a row that is only waiting, and a stopped
 *  order sinks below everything still running. */
export const STATE_RANK: Record<PromiseState, number> = {
  counted: 0, delivered: 1, counting: 2, production: 3, ordered: 4, held: 5, not_counted: 6, stopped: 7,
}

/** The fields lineFor reads off a row. (PromiseRow in read.ts satisfies this.) */
export interface LineInput {
  state: PromiseState
  sub: string
  value: string
  small: string
  showsOn: string
}

/**
 * "Sep 12" from a YYYY-MM-DD, or NULL when there is no readable date.
 *
 * Null, not "Invalid Date". A promise row with a missing or malformed shows_on used to print
 * "on Home Invalid Date" straight onto Home and into the email that says the count is in.
 */
const md = (ymd: string | null | undefined): string | null => {
  if (!ymd) return null
  const d = new Date(`${ymd}T12:00:00Z`)
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/**
 * The one line a card prints under its pill — the same line Home prints and the same line the
 * "your count is in" notice sends. Every copy string for the seven states is here, so a card can
 * never say one thing in the pill and another underneath.
 */
export function lineFor(r: LineInput): string {
  if (r.state === 'stopped') return `Stopped · ${r.sub.replace(/^Stopped · /, '')}`
  if (r.state === 'not_counted') return `Not counted: ${r.sub.replace(/^Ordered [^·]+· /, '')}`
  if (r.state === 'held') return `Held · work starts ${r.value} · then counted`
  // 'Ordered' covers two honest situations: nobody has picked it up yet, and it is picked up but
  // PAUSED waiting on the owner. The small line says which, so the line reads it rather than
  // printing "your team starts it next" over the top of "waiting on you".
  if (r.state === 'ordered') return r.small && r.small !== 'nobody on it yet' ? `Ordered · ${r.small}` : 'Ordered · your team starts it next'
  if (r.state === 'production') return 'Being made · your team is on it'
  // A deliverable is finished on delivery and has no number coming; anything else names the day
  // its count begins, which is the day the work landed plus its source lag.
  if (r.state === 'delivered') {
    if (r.value === 'Done') return `Done · ${r.small}`
    // The day the count begins rides in on `small` as "counting from Sep 12". When it is not there
    // — a row whose dates could not be worked out — the line said "your count starts " and stopped,
    // a sentence with a hole in it. Say the plain thing instead.
    const from = r.small.startsWith('counting from ') ? r.small.slice('counting from '.length).trim() : ''
    return from ? `Delivered · your count starts ${from}` : 'Delivered · your count starts soon'
  }
  if (r.state === 'counting') {
    const day = md(r.showsOn)
    const onHome = day ? ` · on Home ${day}` : ''
    return r.value === '—' ? `Counted after: ${r.sub.replace(/^Ordered [^·]+· /, '')}${onHome}` : `Counting · ${r.value}${onHome}`
  }
  return `${r.value} · ${r.small}`
}

/* ── Move 7b: the card a counted promise makes ────────────────────────────────────────────
 *
 * When an order's count comes in, the cron composes ONE proof card from it (card_type
 * 'promise_counted'), and that card is the only thing the product calls a WIN. Its three lines
 * are written here, beside the seven states, because a win is a promise kept: the card and the
 * ledger row it came from must never say different things about the same order.
 *
 * They come back as KEYS plus their numbers, not as finished sentences. The card is written once
 * and read later — on the owner's shelf, on a public page somebody was sent — so its words have
 * to be re-drawable in the owner's own language (src/lib/i18n/t.ts fills the holes). A date is
 * handed over as a plain YYYY-MM-DD and written out at render, for the same reason.
 */

export const COUNTED_LABEL_KEY = 'Counted: {label}'
export const COUNTED_BIG_KEY = '{n} {unit}'
export const COUNTED_CONTEXT_KEY = 'Counted {from}–{to}'

/** One line of a card: the key, and the holes filled at render. */
export interface KeyVars { key: string; vars: Record<string, string | number> }

/** What the ledger row and its computed line give the card. (PromiseRow plus the stored row.) */
export interface CountedInput {
  state: PromiseState
  /** which way the number moved, as read.ts already decided it (PromiseRow.tone) */
  tone: PromiseTone
  /** order_promises.label — the owner's name for what they ordered */
  label: string
  /** order_promises.metric_key */
  metricKey: string
  /** order_promises.metric_label — "taps on your Google card" */
  metricLabel: string
  /** the ledger's own number line: "41", "12k", "4.5 → 4.7" */
  value: string
  /** order_promises.count_from / shows_on, YYYY-MM-DD */
  countFrom: string
  showsOn: string
}

export interface CountedCard { n: number; label: KeyVars; big: KeyVars; context: KeyVars }

/** Every number in a line, in order. A leading minus belongs to the number after it. */
function numbersIn(s: string): number[] {
  const out: number[] = []
  for (const m of String(s ?? '').matchAll(/[-−]?\d[\d,]*(\.\d+)?/g)) {
    const n = Number(m[0].replace(/,/g, '').replace('−', '-'))
    if (Number.isFinite(n)) out.push(n)
  }
  return out
}

/**
 * The card for a promise whose count is in, or NULL when there is nothing to show.
 *
 * Null in four cases, and each one is a card that would have been a lie: the order is not
 * counted (it is still running, or the product said up front it cannot read this number), the
 * line carries no number at all, the number is zero or below, or THE NUMBER WENT THE WRONG WAY.
 * "0 taps" is a true sentence and a terrible thing to hand a friend.
 *
 * THE WRONG WAY IS THE ONE THIS FILE COULD NOT SEE. A rating reads as a pair, "4.7 → 4.5", and
 * both halves of a fall are positive numbers — so a rating that DROPPED made a card, the card
 * became a win, and the win got a public page with "Counted by Apnosh" at the foot. Nothing in
 * the printed line says which way it moved. read.ts already knows: it compares the count to its
 * matched baseline and writes `tone` on the row. So the tone is the gate, reused rather than
 * worked out a second time here, and only 'up' (it grew) and 'flat' (it held, or it is a first
 * count with nothing before it) make a card.
 *
 * A rating still takes the LAST number on the line and everything else the first. `n` is the
 * number the line LEADS with, not the count itself — the ledger shortens a big one to "12k" — and
 * it is here to answer one question: is there a real, positive number on this card at all.
 */
export function countedCardWords(p: CountedInput): CountedCard | null {
  if (p.state !== 'counted') return null
  if (p.tone !== 'up' && p.tone !== 'flat') return null
  const nums = numbersIn(p.value)
  if (!nums.length) return null
  const n = p.metricKey === 'rating' ? nums[nums.length - 1] : nums[0]
  if (!Number.isFinite(n) || n <= 0) return null
  return {
    n,
    label: { key: COUNTED_LABEL_KEY, vars: { label: p.label } },
    big: { key: COUNTED_BIG_KEY, vars: { n: p.value.trim(), unit: p.metricLabel } },
    context: { key: COUNTED_CONTEXT_KEY, vars: { from: p.countFrom, to: p.showsOn } },
  }
}
