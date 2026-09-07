/**
 * reply-line — the reply promise, as a line the owner can hold us to.
 *
 * REPLY_PROMISE says "within one business day". Until now that was a claim with no clock beside
 * it, so a Friday afternoon question that landed Monday morning looked identical to one that was
 * ignored. This turns the claim into two facts the owner can read: when they asked, and when the
 * answer is due. Once it is answered, how long it actually took.
 *
 *   Sent Tue 3:10 pm · we answer within one business day · due Wed 3:10 pm
 *   Answered in 2h 14m
 *
 * PURE on purpose (no server-only, no database): the thread header already has the messages
 * loaded, so it can render this without asking the server anything, and a script can check the
 * weekend rule without a connection.
 */

const MS_MIN = 60_000
const MS_HOUR = 60 * MS_MIN
const MS_DAY = 24 * MS_HOUR

/**
 * One business day after `from`. Saturday and Sunday are not business days, so a Friday
 * afternoon question is due Monday afternoon, and a weekend question is due Monday too (the
 * next business day is Monday, and it is the one we owe). Same clock time throughout — the
 * promise is a day, not a shift, and we do not pretend to know the team's hours.
 */
export function oneBusinessDayAfter(from: Date): Date {
  const d = new Date(from.getTime())
  const day = d.getDay() // 0 Sun … 6 Sat
  // Asked on a weekend: the answer is owed on Monday, at the time they asked.
  if (day === 6) return new Date(d.getTime() + 2 * MS_DAY)
  if (day === 0) return new Date(d.getTime() + 1 * MS_DAY)
  // Asked Friday: tomorrow is Saturday, so the day we owe is Monday.
  if (day === 5) return new Date(d.getTime() + 3 * MS_DAY)
  return new Date(d.getTime() + MS_DAY)
}

/** "Tue 3:10 pm" — the weekday and the clock, nothing else. Locale-aware for es-US. */
export function dayClock(iso: string | Date, locale = 'en-US'): string {
  const d = iso instanceof Date ? iso : new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const day = d.toLocaleDateString(locale, { weekday: 'short' })
  const time = d.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })
  // Node/Chrome put a NARROW NO-BREAK SPACE before am/pm; it renders as a gap the owner
  // cannot type or search for, so it becomes an ordinary space.
  // en-US gives "3:10 PM"; the owner's copy everywhere else in the app is lowercase.
  return `${day} ${time}`.replace(/[\u202f\u00a0]/g, ' ').replace(/\b(AM|PM)\b/, (m) => m.toLowerCase())
}

/** "14m", "2h 14m", "1d 3h". Rounded down, because an owner counts the hours they waited. */
export function waitLabel(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return ''
  if (ms < MS_HOUR) return `${Math.max(1, Math.floor(ms / MS_MIN))}m`
  if (ms < MS_DAY) {
    const h = Math.floor(ms / MS_HOUR)
    const m = Math.floor((ms % MS_HOUR) / MS_MIN)
    return m ? `${h}h ${m}m` : `${h}h`
  }
  const dys = Math.floor(ms / MS_DAY)
  const h = Math.floor((ms % MS_DAY) / MS_HOUR)
  return h ? `${dys}d ${h}h` : `${dys}d`
}

export interface ReplyLineInput {
  /** when the owner asked (their first message on the thread) */
  askedAt: string | null
  /** when a person answered, when one has */
  answeredAt: string | null
}

/**
 * The line, in the owner's words. Null when nobody has asked anything yet — there is no clock
 * to show, and a promise with no question attached is the marketing sentence we already have.
 *
 * `promise` is passed in rather than imported so the one place the words live stays
 * src/lib/reply-promise.ts and the Spanish screen can hand its own.
 */
export function replyLine(
  input: ReplyLineInput,
  opts?: {
    promise?: string
    locale?: string
    /** The four joining words, so the Spanish screen hands its own instead of this file
     *  growing a second copy of the sentence. */
    words?: { sent?: string; weAnswer?: string; due?: string; answeredIn?: string }
  },
): string | null {
  const locale = opts?.locale ?? 'en-US'
  const promise = opts?.promise ?? 'within one business day'
  const w = { sent: 'Sent', weAnswer: 'we answer', due: 'due', answeredIn: 'Answered in', ...(opts?.words ?? {}) }
  if (!input.askedAt) return null
  const asked = new Date(input.askedAt)
  if (Number.isNaN(asked.getTime())) return null

  if (input.answeredAt) {
    const answered = new Date(input.answeredAt)
    if (!Number.isNaN(answered.getTime()) && answered.getTime() >= asked.getTime()) {
      return `${w.answeredIn} ${waitLabel(answered.getTime() - asked.getTime())}`
    }
  }
  const due = oneBusinessDayAfter(asked)
  return `${w.sent} ${dayClock(asked, locale)} · ${w.weAnswer} ${promise} · ${w.due} ${dayClock(due, locale)}`
}
