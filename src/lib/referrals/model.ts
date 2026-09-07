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

/**
 * How old an account may be, in days, and still be somebody's new friend.
 *
 * A referral is an introduction. An owner who signed up months ago and has been reading their own
 * dashboard ever since was not introduced by anybody, and a code typed onto that account is worth
 * $100 of real money for nothing. Thirty days is long enough that a friend who was told about us
 * in February and got around to signing up in March still counts.
 */
export const NEW_CLIENT_DAYS = 30

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
  /** the referred client has already paid us for something — a campaign order or a desk order */
  referredHasPaidBefore?: boolean
  /** how old the referred client's account was when the code was typed, in days */
  referredAccountAgeDays?: number
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
  // A REFERRAL IS FOR SOMEBODY NEW. Without these two the loop paid out on an owner who was
  // already ours: the payout only asked "has this client a collected order?", and every existing
  // customer has one, so a code typed into a months-old account minted $100 on an order that had
  // nothing to do with the friend who sent it.
  if (i.referredHasPaidBefore) return 'already a customer'
  if ((i.referredAccountAgeDays ?? 0) > NEW_CLIENT_DAYS) return 'account is not new'
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

/**
 * The reason a refund writes into referrals.void_reason. A constant because the payout writes it
 * and the owner's page reads it back to say the honest word — a string typed twice would drift and
 * an owner would be told "Closed" for an order they watched come back.
 */
export const REFUND_VOID_REASON = 'the order was refunded in full, so the credit went back'

/**
 * The word beside a friend's name. 'Closed' is true of every void but tells an owner nothing; when
 * we know the order came back, say that instead, because it is the one void an owner can see the
 * cause of from their own side.
 */
export function friendWord(status: ReferralStatus, voidReason?: string | null): string {
  if (status === 'void' && (voidReason ?? '').startsWith('the order was refunded in full')) {
    return 'Refunded, so no credit'
  }
  return STATUS_WORD[status]
}

/* ── What is LEFT of a credit ────────────────────────────────────────────────
   The one place that decides how much of a $50 credit a checkout may take, so the checkout, the
   owner's balance and the sim all read the same arithmetic. */

/**
 * How long a checkout may sit on a credit before the money goes back.
 *
 * A hold is not a spend. An owner who opens checkout and closes the tab has not bought anything,
 * and their $50 must come back to them — but not INSTANTLY, or two tabs open at the same counter
 * would each be handed the same $50 and only one of them would be paid for. A day is long enough
 * that no honest checkout is still open, and short enough that nobody notices their credit gone.
 */
export const CREDIT_HOLD_MS = 24 * 60 * 60 * 1000

/** What became of the checkout a credit is held against. */
export type HoldState =
  /** it took money. Those cents are SPENT, and the payments ledger is what says so. */
  | 'collected'
  /** it is still open (a pending intent, or one so new it has no ledger row yet). */
  | 'waiting'
  /** nothing holds it: no intent, or one that was cancelled, failed, or sent back in full. */
  | 'dropped'

export interface CreditRowState {
  /** the credit's face value, in cents (client_credits.cents) */
  cents: number
  /**
   * What this credit has REALLY paid for: the sum of friend_credit_cents across every collected
   * payment that names it. The ledger, never the credit row's own consumed_cents — that field is
   * a cache, and the whole bug was trusting it.
   */
  settledCents: number
  /** the cents the current hold is for (client_credits.held_cents) */
  heldCents: number
  /** what the checkout holding those cents turned into */
  hold: HoldState
  /** when the hold was taken (client_credits.consumed_at), in ms, or null for no hold */
  heldAtMs: number | null
  /** now, in ms. Passed in so this function has no clock of its own and the sim can move time. */
  nowMs: number
}

/**
 * The cents a live hold is sitting on. Zero once the hold is older than a day, or once the
 * checkout behind it ended one way or the other — collected cents are counted in settledCents
 * instead, and a dropped checkout never spent anything.
 *
 * A hold with no timestamp fails CLOSED (treated as fresh): losing an owner a credit for a day is
 * the small mistake; handing the same $50 to two checkouts is the big one.
 */
export function liveHoldCents(r: CreditRowState): number {
  if (r.hold !== 'waiting') return 0
  const held = Math.max(0, Math.round(r.heldCents || 0))
  if (held <= 0) return 0
  const age = r.heldAtMs == null ? 0 : r.nowMs - r.heldAtMs
  return age >= CREDIT_HOLD_MS ? 0 : held
}

/**
 * What a checkout may take off a bill right now: the face value, minus what has really been
 * spent, minus whatever a live hold is sitting on. Never below zero and never above the face
 * value, so a ledger that somehow double-counted cannot hand money back.
 */
export function creditAvailableCents(r: CreditRowState): number {
  const cents = Math.max(0, Math.round(r.cents || 0))
  const settled = Math.max(0, Math.round(r.settledCents || 0))
  return Math.min(cents, Math.max(0, cents - settled - liveHoldCents(r)))
}

/* ── The checkout that had the credit BEFORE us ──────────────────────────────
   Our own ledger is not the whole story. A card declines, our row says 'failed', and every sum
   above hands the $50 back — but the PaymentIntent behind that decline is still sitting at Stripe
   and can still be confirmed. The owner opens a second checkout, gets the same $50 off, pays it,
   then goes back to the first tab and pays that one too. Two orders, one credit, both discounted.

   So before a credit moves to a new checkout, the OLD checkout has to be put beyond use. These two
   are the decision half of that; the Stripe call itself is in referrals/server.ts. */

/**
 * Is this the id of a real Stripe PaymentIntent, or one of our own keys?
 *
 * prepare holds a credit under `hold:<uuid>` for the half-second before Stripe answers, and a
 * monthly-only checkout is keyed to a SetupIntent (`seti_`), which takes no money. Only a `pi_`
 * can be confirmed later behind our back, so only a `pi_` has to be cancelled.
 */
export function isRealIntentId(key: string | null | undefined): boolean {
  return typeof key === 'string' && key.startsWith('pi_')
}

/**
 * What to do about the checkout that is holding this credit.
 *
 *   'cancel'  — it can still be paid, so cancel it and then the credit may move
 *   'gone'    — Stripe already cancelled it; nothing to do and the credit may move
 *   'live'    — the money is moving or already taken. The credit is spoken for. Take nothing.
 *   'unknown' — a status we do not know, or a read we could not make. Take nothing.
 *
 * FAILS CLOSED, twice. An unreadable status is 'unknown', and 'requires_capture' — an authorized
 * card waiting to be captured — is 'live', because the money is already promised to that order.
 */
export type PriorIntentVerdict = 'cancel' | 'gone' | 'live' | 'unknown'

export function priorIntentVerdict(status: string | null | undefined): PriorIntentVerdict {
  switch (status) {
    case 'requires_payment_method':
    case 'requires_confirmation':
    case 'requires_action':
      return 'cancel'
    case 'canceled':
      return 'gone'
    case 'processing':
    case 'succeeded':
    case 'requires_capture':
      return 'live'
    default:
      return 'unknown'
  }
}

/* ── The last look, at the moment money is recorded ──────────────────────────
   The cancel above closes the door. This is the alarm on it: if a credit somehow came off two
   bills anyway, the second one must not be recorded as though the discount were real. */

/**
 * Is this payment about to claim more of a credit than the credit has left?
 *
 *   'ok'         — the sums add up; record the order with its credit
 *   'over'       — the credit is already spent. Record the money (it was taken), but with NO
 *                  credit on the row, and tell a person.
 *   'unreadable' — the ledger would not answer. Change nothing and say so: zeroing a credit we
 *                  cannot account for would hand an owner back money they really did spend.
 *
 * `rowCreditCents` is the credit on THIS payment row that is NOT yet inside `settledCents`. Pass 0
 * when the row is already in the sum — the webhook flips a row to paid and then asks, so its own
 * cents are already counted. Only ask this about an order that carries a credit; an order with
 * none has nothing to check.
 */
export type OverApplyVerdict = 'ok' | 'over' | 'unreadable'

export function overApplyVerdict(i: { faceCents: number; settledCents: number | null; rowCreditCents: number }): OverApplyVerdict {
  if (i.settledCents == null) return 'unreadable'
  const row = Math.max(0, Math.round(i.rowCreditCents || 0))
  const face = Math.max(0, Math.round(i.faceCents || 0))
  return Math.max(0, Math.round(i.settledCents)) + row > face ? 'over' : 'ok'
}

/**
 * How many cents of this order's discount were never really there — the amount the owner was
 * undercharged by. Zero whenever the sums add up.
 */
export function overAppliedCents(i: { faceCents: number; settledCents: number | null; rowCreditCents: number }): number {
  if (overApplyVerdict(i) !== 'over') return 0
  const row = Math.max(0, Math.round(i.rowCreditCents || 0))
  const face = Math.max(0, Math.round(i.faceCents || 0))
  const settled = Math.max(0, Math.round(i.settledCents ?? 0))
  return Math.min(row, settled + row - face)
}
