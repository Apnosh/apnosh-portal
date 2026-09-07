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
