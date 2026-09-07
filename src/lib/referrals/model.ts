/**
 * referrals/model — the code, the states, and the floors. Everything a referral decides that does
 * not need a database.
 *
 * Pure + client-safe (no server imports, no clock, no I/O, no Math.random in the rules) so the
 * screen, the route, the cron and scripts/sim/referral.ts all read ONE set of rules. The money
 * itself is decided in two other pure places, on purpose:
 *   · applyFriendCredit (src/lib/campaigns/checkout-bill.ts) — where the credit sits on a bill
 *   · the cron step (src/app/api/cron/count-is-in/route.ts)  — when the referrer is paid
 *
 * All amounts are integer CENTS.
 */

/**
 * WHAT EACH SIDE GETS. $50 each way, in a constant, because the owner has not decided the number
 * yet and it must never be typed twice. Changing it changes both halves at once and changes
 * nothing already issued — a credit row carries the cents it was written with.
 */
export const REFERRAL_CREDIT_CENTS = 5_000

/** "$50" — the amount as it is said in copy, so the sentence and the maths cannot disagree. */
export function creditWords(cents: number = REFERRAL_CREDIT_CENTS): string {
  const dollars = cents / 100
  return `$${Number.isInteger(dollars) ? dollars : dollars.toFixed(2)}`
}

/* ── The code ────────────────────────────────────────────────────────────────
   This code is read off one phone screen and typed into another, out loud across a counter, so
   the charset drops every character that can be confused for another one: no 0/O, no 1/I/L, no
   5/S, no 8/B. What is left is 27 characters, and seven of them is ten billion codes — enough
   that nobody guesses their way into somebody else's account. */
export const CODE_CHARSET = '234679ACDEFGHJKMNPQRTUVWXYZ'
export const CODE_LENGTH = 7

/** The ambiguous characters, kept beside the charset so the sim can prove none of them is in it. */
export const CODE_BANNED = '01OILS58B'

/**
 * A code from a source of randomness the CALLER owns — so a script can pass a counter and get the
 * same code every time, and the server can pass crypto. `rand()` must return 0 ≤ n < 1.
 */
export function makeCode(rand: () => number, length: number = CODE_LENGTH): string {
  let out = ''
  for (let i = 0; i < length; i += 1) {
    const n = Math.floor(Math.abs(rand()) * CODE_CHARSET.length) % CODE_CHARSET.length
    out += CODE_CHARSET[Number.isFinite(n) ? n : 0]
  }
  return out
}

/**
 * What somebody typed, turned into what we look up: upper case, spaces and dashes dropped.
 *
 * DELIBERATELY NO FOLDING. It is tempting to turn a typed 0 into an O, or a 5 into an S — but
 * every one of those letters is out of the charset, so the "fix" would have to land on some OTHER
 * real character, and a mistyped code would quietly resolve to a different owner's account. A code
 * that is not ours simply does not resolve, and the friend still gets in; they just start with no
 * credit, which is the honest failure.
 */
export function normalizeCode(raw: string | null | undefined): string {
  if (!raw) return ''
  return raw.trim().toUpperCase().replace(/[\s-]/g, '').slice(0, 8)
}

/** Could this string be one of our codes at all? Cheap shape check before any database read. */
export function isCodeShape(code: string): boolean {
  if (code.length < 6 || code.length > 8) return false
  return [...code].every((ch) => CODE_CHARSET.includes(ch))
}

/** The link an owner sends. One place, so the page, the share sheet and the copy button agree. */
export function referralLink(code: string, origin = 'https://apnosh.com'): string {
  return `${origin.replace(/\/$/, '')}/r/${code}`
}

/* ── The state machine ───────────────────────────────────────────────────────
   Four states and four events, and every payout in the product goes through it. */

export type ReferralStatus = 'signed_up' | 'first_order_paid' | 'credited' | 'void'

export type ReferralEvent =
  /** the friend's first order was collected */
  | 'order_paid'
  /** that order's promise reached a counted number */
  | 'counted'
  /** that order was refunded in full */
  | 'refunded_full'
  /** a fraud floor came back true */
  | 'fraud'

/**
 * The next state, or NULL for "nothing changes" — which is most of the table, and is the point.
 *
 * The two rules worth reading out loud:
 *
 *   · counted, not paid, is what pays the referrer. A referral in 'signed_up' that has never had
 *     a collected order cannot be counted into a payout, and 'first_order_paid' alone never pays.
 *     Money leaves on a number an owner can see, one window after the order.
 *
 *   · CREDITED IS TERMINAL. A refund after the payout does not claw it back. By then the credit
 *     may already be spent on another order, and reversing it would mean billing an owner for a
 *     discount we offered them. A referral we should not have paid is an admin's void on what is
 *     LEFT of the credit (/admin/referrals), never an automatic reach into a paid bill.
 */
export function nextStatus(current: ReferralStatus, event: ReferralEvent): ReferralStatus | null {
  if (current === 'void' || current === 'credited') return null
  if (event === 'fraud') return 'void'
  if (current === 'signed_up') {
    if (event === 'order_paid') return 'first_order_paid'
    return null                       // no order yet: nothing to count, nothing to refund
  }
  // first_order_paid
  if (event === 'counted') return 'credited'
  if (event === 'refunded_full') return 'void'
  return null
}

/** May this referral pay the referrer right now? The cron asks this before it writes money. */
export function readyToCredit(r: { status: ReferralStatus; creditedAt?: string | null; voidedAt?: string | null }, counted: boolean): boolean {
  if (r.creditedAt || r.voidedAt) return false      // idempotency, in the same words as the column
  if (!counted) return false
  return nextStatus(r.status, 'counted') === 'credited'
}

/* ── The fraud floors ────────────────────────────────────────────────────────
   Two businesses run by the same person are not a referral. These are the floors the plan named,
   and the honest limits of each one. */

/**
 * Mail everybody shares. A taqueria and a panaderia both on gmail.com are not the same person, so
 * "same domain" only means something on a domain the business itself owns.
 */
const PUBLIC_MAIL = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'ymail.com', 'hotmail.com', 'outlook.com', 'live.com',
  'msn.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'proton.me', 'protonmail.com', 'gmx.com',
])

/** Digits only, last ten, so (503) 555-0134 and +1 503 555 0134 are one phone. */
export function normalizePhone(raw: string | null | undefined): string {
  const digits = (raw ?? '').replace(/\D/g, '')
  return digits.length > 10 ? digits.slice(-10) : digits
}

const emailOf = (raw: string | null | undefined) => (raw ?? '').trim().toLowerCase()
const domainOf = (raw: string | null | undefined) => emailOf(raw).split('@')[1] ?? ''

export interface FraudInput {
  referrerClientId: string
  referredClientId: string
  referrerEmail?: string | null
  referredEmail?: string | null
  referrerPhone?: string | null
  referredPhone?: string | null
  referrerStripeCustomerId?: string | null
  referredStripeCustomerId?: string | null
  /** this referred client already has a referral row (from any code) */
  alreadyReferred?: boolean
}

/**
 * The reason this referral may not pay, or NULL when it may. A reason string, not a boolean, so
 * the admin list and the void row can say WHY in the same words the code decided in.
 *
 * Fails CLOSED on missing ids: no client, no referral.
 */
export function referralBlock(i: FraudInput): string | null {
  if (!i.referrerClientId || !i.referredClientId) return 'missing account'
  if (i.referrerClientId === i.referredClientId) return 'same business'
  if (i.alreadyReferred) return 'already referred'
  const e1 = emailOf(i.referrerEmail), e2 = emailOf(i.referredEmail)
  if (e1 && e2 && e1 === e2) return 'same email'
  const d1 = domainOf(i.referrerEmail), d2 = domainOf(i.referredEmail)
  if (d1 && d2 && d1 === d2 && !PUBLIC_MAIL.has(d1)) return 'same email domain'
  const p1 = normalizePhone(i.referrerPhone), p2 = normalizePhone(i.referredPhone)
  if (p1 && p2 && p1.length === 10 && p1 === p2) return 'same phone'
  const c1 = (i.referrerStripeCustomerId ?? '').trim(), c2 = (i.referredStripeCustomerId ?? '').trim()
  if (c1 && c2 && c1 === c2) return 'same card account'
  return null
}

/* ── What the owner reads ────────────────────────────────────────────────────
   One word per state, in the owner's vocabulary. The English is the i18n key (see lib/i18n/t.ts),
   so the Spanish comes from the dictionary and nothing here is written twice. */
export const STATUS_WORD: Record<ReferralStatus, string> = {
  signed_up: 'Signed up',
  first_order_paid: 'First order in',
  credited: 'You got your credit',
  void: 'Closed',
}
