/**
 * Tell a friend, proved before a dollar of it can move.
 *
 * Everything that decides money or eligibility in Move 8 is a pure function, and this pins all of
 * it: the code charset, the state machine, the credit on the bill (with the fee and the tax in the
 * right order), the refund that voids a referral, the fraud floors, and — the one that matters
 * most today — that with the kill switch off the whole loop is invisible and the bill is byte for
 * byte the bill this product already charges.
 *
 * No server, no Stripe, no database, no network. Run:
 *   npx tsx --tsconfig scripts/sim/tsconfig.json scripts/sim/referral.ts
 */
import {
  CODE_CHARSET, CODE_BANNED, CODE_LENGTH, makeCode, normalizeCode, isCodeShape, referralLink,
  REFERRAL_CREDIT_CENTS, NEW_CLIENT_DAYS, creditWords, nextStatus, readyToCredit, referralBlock, normalizePhone,
  creditAvailableCents, liveHoldCents, CREDIT_HOLD_MS, STATUS_WORD, friendWord, REFUND_VOID_REASON,
  isRealIntentId, priorIntentVerdict,
  type ReferralStatus, type ReferralEvent, type CreditRowState,
} from '@/lib/referrals/model'
import { checkoutBill, applyFriendCredit, feeCentsOn, preTaxFromRow, SERVICE_FEE_RATE } from '@/lib/campaigns/checkout-bill'
import { refundOwedCents } from '@/lib/campaigns/refund-math'
import { deskBill } from '@/lib/requests/desk-bill'
import { referralsEnabled } from '@/lib/referral-gate'
import type { LineItem } from '@/lib/campaigns/types'
import { Suite } from './lib'

function item(id: string, price: number, kind: 'one-time' | 'monthly' = 'one-time'): LineItem {
  return {
    id, position: 0, serviceId: id, name: id, stage: 'foundation', price,
    cadence: kind === 'monthly' ? { kind: 'recurring', every: 'monthly' } : { kind: 'one-time' },
    included: true, paused: false, lock: 'editable',
  } as unknown as LineItem
}

/** A deterministic 0..1 source, so the same call makes the same code every time this runs. */
function seeded(seed: number): () => number {
  let s = seed >>> 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32 }
}

/** Stripe's tax, as a flat rate, so the ORDER of the credit and the tax can be checked. */
const taxOn = (preTax: number, rate = 0.08) => Math.round(preTax * rate)

function main() {
  const s = new Suite()

  /* ── 1. the code ─────────────────────────────────────────────────────── */
  s.group('the code can be read off a phone and typed by somebody else')
  s.check('no ambiguous character is in the charset',
    [...CODE_BANNED].every((ch) => !CODE_CHARSET.includes(ch)), CODE_CHARSET)
  s.eq('the charset has no duplicates', new Set(CODE_CHARSET).size, CODE_CHARSET.length)
  s.check('the charset is big enough to matter', CODE_CHARSET.length >= 24, `${CODE_CHARSET.length} characters`)
  s.eq('a code is seven characters', makeCode(seeded(1)).length, CODE_LENGTH)
  s.check('every character of a code is in the charset',
    [...makeCode(seeded(7))].every((ch) => CODE_CHARSET.includes(ch)), makeCode(seeded(7)))
  s.eq('the same randomness makes the same code', makeCode(seeded(42)), makeCode(seeded(42)))
  s.check('different randomness makes different codes', makeCode(seeded(1)) !== makeCode(seeded(2)))
  s.check('a thousand codes are all well-formed',
    Array.from({ length: 1000 }, (_, i) => makeCode(seeded(i))).every(isCodeShape))
  s.check('a thousand codes barely collide', new Set(Array.from({ length: 1000 }, (_, i) => makeCode(seeded(i)))).size >= 999)
  s.check('broken randomness still makes a code, never a crash',
    isCodeShape(makeCode(() => NaN)) && isCodeShape(makeCode(() => Infinity)))
  s.eq('lower case and spaces are the same code', normalizeCode(' k3m-9pq r '), 'K3M9PQR')
  s.eq('nothing typed is an empty code', normalizeCode(null), '')
  s.check('a code with a banned character is not one of ours', !isCodeShape('K3M9PQ0'))
  s.check('a short code is not one of ours', !isCodeShape('K3M9'))
  s.check('a real code is', isCodeShape(makeCode(seeded(9))))
  s.eq('the link is the code on our domain', referralLink('K3M9PQR', 'https://apnosh.com'), 'https://apnosh.com/r/K3M9PQR')
  s.eq('a trailing slash does not double up', referralLink('K3M9PQR', 'https://apnosh.com/'), 'https://apnosh.com/r/K3M9PQR')

  /* ── 2. the state machine ────────────────────────────────────────────── */
  s.group('a referral pays on the COUNT, and only once')
  s.eq('signing up is not payment', nextStatus('signed_up', 'counted'), null)
  s.eq('a paid first order moves it along', nextStatus('signed_up', 'order_paid'), 'first_order_paid')
  s.eq('the count is what pays', nextStatus('first_order_paid', 'counted'), 'credited')
  s.eq('a full refund before the count voids it', nextStatus('first_order_paid', 'refunded_full'), 'void')
  s.eq('a refund with no order behind it changes nothing', nextStatus('signed_up', 'refunded_full'), null)
  s.eq('a fraud floor voids it at any point before payment', nextStatus('first_order_paid', 'fraud'), 'void')
  s.eq('credited is terminal: a later refund never claws it back', nextStatus('credited', 'refunded_full'), null)
  s.eq('credited is terminal for fraud too — that is an admin decision', nextStatus('credited', 'fraud'), null)
  s.eq('void is terminal', nextStatus('void', 'counted'), null)
  s.check('nothing pays twice', (['signed_up', 'first_order_paid', 'credited', 'void'] as ReferralStatus[])
    .every((st) => (['order_paid', 'counted', 'refunded_full', 'fraud'] as ReferralEvent[])
      .every((ev) => nextStatus(st, ev) !== 'credited' || st === 'first_order_paid')))
  s.check('a stamped payout is never paid again', !readyToCredit({ status: 'first_order_paid', creditedAt: '2026-09-01' }, true))
  s.check('a voided referral is never paid', !readyToCredit({ status: 'first_order_paid', voidedAt: '2026-09-01' }, true))
  s.check('no count, no money', !readyToCredit({ status: 'first_order_paid' }, false))
  s.check('a count on a paid order pays', readyToCredit({ status: 'first_order_paid' }, true))
  s.check('a count on an unpaid signup does not', !readyToCredit({ status: 'signed_up' }, true))
  s.check('every state has a word an owner can read',
    (['signed_up', 'first_order_paid', 'credited', 'void'] as ReferralStatus[]).every((st) => !!STATUS_WORD[st]?.trim()))
  s.eq('a refund says so, not just "Closed"', friendWord('void', REFUND_VOID_REASON), 'Refunded, so no credit')
  s.eq('a void for anything else is still Closed', friendWord('void', 'same phone'), 'Closed')
  s.eq('a void with no reason on it is still Closed', friendWord('void', null), 'Closed')
  s.eq('the refund word never lands on a live referral', friendWord('first_order_paid', REFUND_VOID_REASON), 'First order in')
  s.check('the reason the payout writes is the reason the page reads',
    REFUND_VOID_REASON.startsWith('the order was refunded in full'), REFUND_VOID_REASON)

  /* ── 3. the credit on the bill ───────────────────────────────────────── */
  s.group('the credit comes off BEFORE the fee and the tax')
  const plan = { items: [item('a', 400), item('b', 100), item('m', 99, 'monthly')] }
  const bill = checkoutBill(plan)
  s.eq('the plain bill is $500 of work and $50 of fee', [bill.subtotalCents, bill.serviceFeeCents, bill.preTaxCents], [50_000, 5_000, 55_000])
  const credited = applyFriendCredit(bill, REFERRAL_CREDIT_CENTS)
  s.eq('the credit is named on the bill', credited.friendCreditCents, 5_000)
  s.eq('the fee is 10% of what is left, not of the full plan', credited.serviceFeeCents, feeCentsOn(45_000))
  s.eq('the charge before tax is $450 of work plus $45 of fee', credited.preTaxCents, 49_500)
  s.eq('the items subtotal is untouched, so a refund can still prorate', credited.subtotalCents, bill.subtotalCents)
  s.eq('the monthly line is untouched: a credit is money off today', credited.perMonthCents, bill.perMonthCents)
  s.eq('the tax is charged on what they actually pay', taxOn(credited.preTaxCents), taxOn(49_500))
  s.check('the tax is LOWER than it would have been at full price', taxOn(credited.preTaxCents) < taxOn(bill.preTaxCents))
  s.eq('the owner is $55 better off: the $50 plus the fee on it',
    (bill.preTaxCents + taxOn(bill.preTaxCents)) - (credited.preTaxCents + taxOn(credited.preTaxCents)),
    5_000 + Math.round(5_000 * SERVICE_FEE_RATE) + (taxOn(bill.preTaxCents) - taxOn(credited.preTaxCents)))
  s.check('nobody pays a fee on money we gave them', credited.serviceFeeCents === bill.serviceFeeCents - 500)

  s.group('the credit fails closed at every edge')
  s.eq('no credit changes nothing at all', applyFriendCredit(bill, 0), bill)
  s.eq('a negative credit changes nothing', applyFriendCredit(bill, -10_000), bill)
  s.eq('garbage changes nothing', applyFriendCredit(bill, NaN), bill)
  const small = checkoutBill({ items: [item('a', 30)] })
  const overCredit = applyFriendCredit(small, REFERRAL_CREDIT_CENTS)
  s.eq('a credit bigger than the order takes the bill to zero, never below', overCredit.preTaxCents, 0)
  s.eq('and it only ever spends what the order was worth', overCredit.friendCreditCents, 3_000)
  const monthlyOnly = checkoutBill({ items: [item('m', 99, 'monthly')] })
  s.eq('a monthly-only cart has nothing to take a credit off', applyFriendCredit(monthlyOnly, 5_000), monthlyOnly)
  s.eq('the amount is said the same way everywhere', creditWords(REFERRAL_CREDIT_CENTS), '$50')
  s.eq('an odd amount still reads as money', creditWords(4_250), '$42.50')

  /* ── 3b. the row, read back ──────────────────────────────────────────── */
  s.group('the tax step reads the credited bill back, and never charges the credit')
  // The row prepare saves: the FULL subtotal (refund-math needs it), the discounted fee, and the
  // credit in its own column. This is the shape the tax route reads back off the database.
  const savedRow = {
    subtotal_cents: credited.subtotalCents,
    service_fee_cents: credited.serviceFeeCents,
    friend_credit_cents: credited.friendCreditCents ?? 0,
  }
  s.eq('the row reads back as the amount prepare charged', preTaxFromRow(savedRow), credited.preTaxCents)
  s.eq('subtotal + fee alone would have billed the credit back', savedRow.subtotal_cents + savedRow.service_fee_cents, credited.preTaxCents + 5_000)
  const taxed = { ...savedRow, tax_cents: taxOn(credited.preTaxCents), total_cents: credited.preTaxCents + taxOn(credited.preTaxCents) }
  s.eq('a second recompute is the same number, not a bigger one', preTaxFromRow(taxed), credited.preTaxCents)
  s.check('the recompute can never raise what prepare put on the intent',
    preTaxFromRow({ ...taxed, service_fee_cents: 99_999 }) <= taxed.total_cents - taxed.tax_cents)
  const plainRow = { subtotal_cents: bill.subtotalCents, service_fee_cents: bill.serviceFeeCents }
  s.eq('a bill with no credit reads back exactly as it always did', preTaxFromRow(plainRow), bill.preTaxCents)
  s.eq('a database without migration 261 has no credit column, and that reads as no credit',
    preTaxFromRow({ subtotal_cents: 50_000, service_fee_cents: 5_000 }), 55_000)
  s.eq('a null credit is no credit', preTaxFromRow({ subtotal_cents: 50_000, service_fee_cents: 5_000, friend_credit_cents: null }), 55_000)
  s.eq('a credit bigger than the order never makes a negative bill',
    preTaxFromRow({ subtotal_cents: 3_000, service_fee_cents: 0, friend_credit_cents: 9_000 }), 0)
  s.eq('a row of nothing is a bill of nothing', preTaxFromRow({}), 0)
  s.eq('garbage in a column is zero, never a guess',
    preTaxFromRow({ subtotal_cents: NaN as unknown as number, service_fee_cents: 5_000 }), 5_000)
  s.eq('the setup-only row (nothing today) stays nothing',
    preTaxFromRow({ subtotal_cents: 0, service_fee_cents: 0, tax_cents: 0, total_cents: 0 }), 0)
  // ONE LAW FOR BOTH TILLS. A desk order is priced from a single quote rather than a plan, but the
  // credit runs through the same two functions, so a friend's $50 is worth the same at either one.
  const desk = deskBill(55_000, 'once')
  s.eq('a $550 desk quote is $500 of work and $50 of fee', [desk.subtotalCents, desk.serviceFeeCents], [50_000, 5_000])
  const deskCredited = applyFriendCredit(desk, REFERRAL_CREDIT_CENTS)
  s.eq('the desk credit lands on the same number the cart does', deskCredited.preTaxCents, credited.preTaxCents)
  s.eq('and reads back off its saved row the same way',
    preTaxFromRow({ subtotal_cents: deskCredited.subtotalCents, service_fee_cents: deskCredited.serviceFeeCents, friend_credit_cents: deskCredited.friendCreditCents ?? 0 }),
    credited.preTaxCents)
  s.eq('a monthly-only desk line has nothing to take a credit off',
    applyFriendCredit(deskBill(9_900, 'monthly'), REFERRAL_CREDIT_CENTS).preTaxCents, 0)


  /* ── 3c. one credit, spent once ──────────────────────────────────────── */
  s.group('a $50 credit is $50, however many checkouts it is carried through')
  const T0 = Date.UTC(2026, 8, 7, 9, 0, 0)
  const hour = 60 * 60 * 1000
  /** The credit row as the checkout reads it, with everything else defaulted to "nothing yet". */
  const credit = (o: Partial<CreditRowState> = {}): CreditRowState => ({
    cents: REFERRAL_CREDIT_CENTS, settledCents: 0, heldCents: 0, hold: 'dropped',
    heldAtMs: null, nowMs: T0, ...o,
  })
  s.eq('a fresh credit is all there', creditAvailableCents(credit()), 5_000)

  // THE SEQUENCE FROM THE REVIEW, step by step. pi1 holds it, pi2 tries, pi1 is then paid, pi3
  // tries. Only ONE of the three may ever take money off a bill.
  const heldByPi1 = credit({ heldCents: 5_000, hold: 'waiting', heldAtMs: T0 })
  s.eq('pi1 holds it, so pi2 in the next tab gets nothing',
    creditAvailableCents({ ...heldByPi1, nowMs: T0 + hour }), 0)
  s.eq('a day later the abandoned hold expires and pi2 may have it',
    creditAvailableCents({ ...heldByPi1, nowMs: T0 + CREDIT_HOLD_MS + 1 }), 5_000)
  // pi1 is paid after all. The ledger now carries the spend, and the hold moved to pi2.
  const afterPi1Paid = credit({ settledCents: 5_000, heldCents: 5_000, hold: 'waiting', heldAtMs: T0 + CREDIT_HOLD_MS + 1, nowMs: T0 + CREDIT_HOLD_MS + 2 * hour })
  s.eq('once pi1 is paid there is nothing left for pi3', creditAvailableCents(afterPi1Paid), 0)
  s.eq('and nothing left even after pi2 is dropped too',
    creditAvailableCents({ ...afterPi1Paid, hold: 'dropped', heldCents: 0 }), 0)
  s.eq('two collected orders somehow naming one credit still leaves nothing',
    creditAvailableCents(credit({ settledCents: 10_000 })), 0)
  s.eq('and a fourth checkout after all of it still gets nothing',
    creditAvailableCents(credit({ settledCents: 5_000, nowMs: T0 + 30 * 24 * hour })), 0)

  s.group('a hold is not a spend')
  s.eq('the checkout that collected is counted in the ledger, not twice as a hold',
    liveHoldCents(credit({ heldCents: 5_000, hold: 'collected', heldAtMs: T0 })), 0)
  s.eq('a cancelled checkout holds nothing',
    liveHoldCents(credit({ heldCents: 5_000, hold: 'dropped', heldAtMs: T0 })), 0)
  s.eq('an open checkout holds every cent it took',
    liveHoldCents(credit({ heldCents: 5_000, hold: 'waiting', heldAtMs: T0, nowMs: T0 + hour })), 5_000)
  s.eq('a hold with no time on it is treated as fresh, never as free money',
    liveHoldCents(credit({ heldCents: 5_000, hold: 'waiting', heldAtMs: null })), 5_000)
  s.eq('exactly a day old is expired', liveHoldCents(credit({ heldCents: 5_000, hold: 'waiting', heldAtMs: T0, nowMs: T0 + CREDIT_HOLD_MS })), 0)
  s.eq('a minute short of a day is not', liveHoldCents(credit({ heldCents: 5_000, hold: 'waiting', heldAtMs: T0, nowMs: T0 + CREDIT_HOLD_MS - 60_000 })), 5_000)
  s.eq('a day is the number', CREDIT_HOLD_MS, 24 * 60 * 60 * 1000)
  s.eq('a partly spent credit gives back what is left', creditAvailableCents(credit({ settledCents: 2_000 })), 3_000)
  s.check('a credit can never be worth more than it says', creditAvailableCents(credit({ settledCents: -9_999 })) <= 5_000)
  s.eq('a refunded order gives the credit back: it is not in the ledger and it holds nothing',
    creditAvailableCents(credit({ settledCents: 0, heldCents: 5_000, hold: 'dropped' })), 5_000)

  /* ── 3c-ii. the checkout that declined is still payable ──────────────── */
  s.group('a declined checkout is still payable at Stripe, so it is cancelled before the credit moves')
  // THE BUG THIS CLOSES, in the order it happened:
  //   1. prepare claims the $50 and makes PI_a for $495
  //   2. the card declines. Our row says 'failed', so every sum above hands the $50 back
  //   3. the owner tries again: prepare claims the $50 AGAIN and makes PI_b for $495
  //   4. they pay PI_b, then go back to the first tab and pay PI_a — which nobody cancelled
  // One $50 credit, two discounted orders, and the ledger said both were fine.
  const declined = credit({ settledCents: 0, heldCents: 5_000, hold: 'dropped', heldAtMs: T0, nowMs: T0 + hour })
  s.eq('step 2: our own ledger really does hand the money back after a decline',
    creditAvailableCents(declined), 5_000)
  s.eq('so the ONLY thing standing between step 2 and step 4 is the cancel',
    priorIntentVerdict('requires_payment_method'), 'cancel')
  s.check('a hold: key is not a Stripe intent, so nothing is cancelled for it',
    !isRealIntentId('hold:9d1c-4f') && isRealIntentId('pi_3Q'))
  s.check('a SetupIntent takes no money, so nothing is cancelled for it either', !isRealIntentId('seti_1A'))
  s.check('and neither is a blank', !isRealIntentId('') && !isRealIntentId(null) && !isRealIntentId(undefined))

  s.group('which old checkouts may be cancelled, and which are the credit saying no')
  s.eq('a declined card can be cancelled', priorIntentVerdict('requires_payment_method'), 'cancel')
  s.eq('a checkout nobody confirmed can be cancelled', priorIntentVerdict('requires_confirmation'), 'cancel')
  s.eq('a checkout waiting on the bank screen can be cancelled', priorIntentVerdict('requires_action'), 'cancel')
  s.eq('one Stripe already cancelled is simply gone', priorIntentVerdict('canceled'), 'gone')
  s.eq('MONEY IN FLIGHT IS NOT TOUCHED: processing', priorIntentVerdict('processing'), 'live')
  s.eq('MONEY ALREADY TAKEN IS NOT TOUCHED: succeeded', priorIntentVerdict('succeeded'), 'live')
  s.eq('an authorized card waiting to be captured is money too', priorIntentVerdict('requires_capture'), 'live')
  s.eq('a word we do not know blocks', priorIntentVerdict('something_new'), 'unknown')
  s.eq('a status Stripe would not give us blocks', priorIntentVerdict(null), 'unknown')
  s.eq('and an empty one blocks', priorIntentVerdict(''), 'unknown')
  s.check('every verdict that is not a plain cancel-or-gone refuses the credit',
    (['processing', 'succeeded', 'requires_capture', '', null, undefined, 'weird'] as const)
      .every((st) => { const v = priorIntentVerdict(st); return v !== 'cancel' && v !== 'gone' }))

  /* ── 3d. the receipt adds up ─────────────────────────────────────────── */
  s.group('the lines on the receipt add up to the number on the card')
  // What the screen prints, in the order it prints it: Subtotal, Friend credit, Service fee, Tax,
  // Due today. Before Move 8's fix there was no credit row, so these lines added to $55 more than
  // the card was charged and nothing on the page explained the gap.
  const shown = {
    subtotal: credited.subtotalCents,
    friendCredit: credited.friendCreditCents ?? 0,
    fee: credited.serviceFeeCents,
    tax: taxOn(credited.preTaxCents),
  }
  const due = credited.preTaxCents + shown.tax
  s.eq('subtotal − credit + fee + tax is exactly Due today',
    shown.subtotal - shown.friendCredit + shown.fee + shown.tax, due)
  s.eq('without the credit row the lines would be over by exactly the credit',
    (shown.subtotal + shown.fee + shown.tax) - due, REFERRAL_CREDIT_CENTS)
  s.eq('and Due today is $55 plus the tax on it below the uncredited bill',
    (bill.preTaxCents + taxOn(bill.preTaxCents)) - due,
    5_500 + (taxOn(bill.preTaxCents) - shown.tax))
  s.eq('the credit row is the one the server sent', shown.friendCredit, REFERRAL_CREDIT_CENTS)
  const plainShown = { subtotal: bill.subtotalCents, fee: bill.serviceFeeCents, tax: taxOn(bill.preTaxCents) }
  s.eq('a bill with no credit still adds up with no credit row',
    plainShown.subtotal + plainShown.fee + plainShown.tax, bill.preTaxCents + plainShown.tax)

  /* ── 4. money that goes backwards ────────────────────────────────────── */
  s.group('a refund never hands back a credit as cash')
  // The order above, paid: $450 + $45 fee + 8% tax = $534.60 on the card, on $500 of items.
  const paid = { totalCents: credited.preTaxCents + taxOn(credited.preTaxCents), subtotalCents: credited.subtotalCents, refundedCents: 0 }
  s.eq('the card was charged $534.60, not $594', paid.totalCents, 53_460)
  s.eq('nothing delivered → back comes what they PAID, not what the plan listed', refundOwedCents(paid, 0), 53_460)
  s.check('the refund is smaller than the same order with no credit',
    refundOwedCents(paid, 0) < refundOwedCents({ totalCents: bill.preTaxCents + taxOn(bill.preTaxCents), subtotalCents: bill.subtotalCents, refundedCents: 0 }, 0))
  s.eq('everything delivered → nothing back', refundOwedCents(paid, 50_000), 0)
  s.eq('half delivered → half of what they paid', refundOwedCents(paid, 25_000), 26_730)
  s.check('a refund can never exceed the money that was really taken', refundOwedCents(paid, 0) <= paid.totalCents)

  /* ── 5. the floors ──────────────────────────────────────────────────── */
  s.group('two businesses run by one person are not a referral')
  const A = 'client-a', B = 'client-b'
  s.eq('you cannot refer yourself', referralBlock({ referrerClientId: A, referredClientId: A }), 'same business')
  s.eq('no account, no referral', referralBlock({ referrerClientId: '', referredClientId: B }), 'missing account')
  s.eq('one credit per referred business, ever',
    referralBlock({ referrerClientId: A, referredClientId: B, alreadyReferred: true }), 'already referred')
  s.eq('the same email is the same person',
    referralBlock({ referrerClientId: A, referredClientId: B, referrerEmail: 'Ana@Taqueria.com', referredEmail: 'ana@taqueria.com' }), 'same email')
  s.eq('the same business domain is the same business',
    referralBlock({ referrerClientId: A, referredClientId: B, referrerEmail: 'ana@taqueria.com', referredEmail: 'luis@taqueria.com' }), 'same email domain')
  s.eq('two owners on gmail are two owners',
    referralBlock({ referrerClientId: A, referredClientId: B, referrerEmail: 'ana@gmail.com', referredEmail: 'luis@gmail.com' }), null)
  s.eq('the same phone, written two ways, is one phone',
    referralBlock({ referrerClientId: A, referredClientId: B, referrerPhone: '(503) 555-0134', referredPhone: '+1 503 555 0134' }), 'same phone')
  s.eq('the same card account is one payer',
    referralBlock({ referrerClientId: A, referredClientId: B, referrerStripeCustomerId: 'cus_123', referredStripeCustomerId: 'cus_123' }), 'same card account')
  s.eq('two real strangers pass', referralBlock({
    referrerClientId: A, referredClientId: B,
    referrerEmail: 'ana@taqueria.com', referredEmail: 'luis@panaderia.com',
    referrerPhone: '503-555-0134', referredPhone: '503-555-9911',
    referrerStripeCustomerId: 'cus_1', referredStripeCustomerId: 'cus_2',
  }), null)
  s.eq('a missing phone is not a matching phone',
    referralBlock({ referrerClientId: A, referredClientId: B, referrerPhone: '', referredPhone: '' }), null)
  s.eq('a short number is not a phone match',
    referralBlock({ referrerClientId: A, referredClientId: B, referrerPhone: '555', referredPhone: '555' }), null)
  s.eq('a phone is its last ten digits', normalizePhone('+1 (503) 555-0134'), '5035550134')

  s.group('a referral is an introduction, so the friend has to be NEW')
  s.eq('an owner who has already paid us is our customer, not an introduction',
    referralBlock({ referrerClientId: A, referredClientId: B, referredHasPaidBefore: true }), 'already a customer')
  s.eq('an account older than a month was not introduced by anybody',
    referralBlock({ referrerClientId: A, referredClientId: B, referredAccountAgeDays: 400 }), 'account is not new')
  s.eq('a day-old account is new', referralBlock({ referrerClientId: A, referredClientId: B, referredAccountAgeDays: 1 }), null)
  s.eq('the last day inside the window is still new',
    referralBlock({ referrerClientId: A, referredClientId: B, referredAccountAgeDays: NEW_CLIENT_DAYS }), null)
  s.eq('the day after it is not',
    referralBlock({ referrerClientId: A, referredClientId: B, referredAccountAgeDays: NEW_CLIENT_DAYS + 1 }), 'account is not new')
  s.eq('a month is the window', NEW_CLIENT_DAYS, 30)
  s.eq('an account we know nothing about is treated as new, and the other floors still run',
    referralBlock({ referrerClientId: A, referredClientId: B }), null)
  s.check('a self-referral is still refused even on a brand new account',
    referralBlock({ referrerClientId: A, referredClientId: A, referredAccountAgeDays: 0 }) === 'same business')

  /* ── 6. the switch ──────────────────────────────────────────────────── */
  s.group('with the switch off, nothing about this product changes')
  const before = process.env.REFERRALS_ENABLED
  delete process.env.REFERRALS_ENABLED
  s.check('unset is shut', !referralsEnabled())
  process.env.REFERRALS_ENABLED = ''
  s.check('empty is shut', !referralsEnabled())
  process.env.REFERRALS_ENABLED = 'TRUE'
  s.check('the wrong case is shut', !referralsEnabled())
  process.env.REFERRALS_ENABLED = '1'
  s.check('a one is shut', !referralsEnabled())
  process.env.REFERRALS_ENABLED = 'yes'
  s.check('a yes is shut', !referralsEnabled())
  process.env.REFERRALS_ENABLED = 'true'
  s.check('only the exact word opens it', referralsEnabled())
  if (before === undefined) delete process.env.REFERRALS_ENABLED
  else process.env.REFERRALS_ENABLED = before
  // The switch off means claimFriendCredit answers null, and null through applyFriendCredit is the
  // untouched bill — the same object the checkout has always built.
  s.eq('a bill with no credit is the bill this product already charged', applyFriendCredit(bill, 0), checkoutBill(plan))
  s.eq('and its total is unchanged to the cent', applyFriendCredit(bill, 0).preTaxCents, 55_000)

  const ok = s.report('Tell a friend — codes, states, credit maths, refunds, floors, the switch')
  process.exit(ok ? 0 : 1)
}

main()
