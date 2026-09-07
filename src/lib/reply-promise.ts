/**
 * The one reply promise.
 *
 * Three different promises were live in the product at once: "We reply within the hour" on the
 * Get help page and the strategist's chat header, "within 1 business day" on the request desk and
 * the AI escalation, and "within one business day" in the report. An owner who read the first one
 * and waited a day did not get a slow reply, they got a broken promise.
 *
 * One truth, in one place, so a change is one edit. Nothing here is aspirational: it is what the
 * team answers in, and src/lib/team/reply-timer.ts is what will prove it before it is ever shown
 * back to an owner as a number.
 *
 * Plain constants, no server-only: the copy is read from client components too.
 */

/** The promise as a phrase you drop into a sentence: `We reply ${REPLY_PROMISE}.` */
export const REPLY_PROMISE = 'within one business day'

/** The promise as a whole sentence. ONE VERB: we reply. "Replies within…", "we answer within…",
 *  "A real person answers" and this line were four wordings of the same promise on four screens,
 *  which reads as four different promises. Everything says "reply" now. */
export const REPLY_PROMISE_SENTENCE = 'We reply within one business day.'
