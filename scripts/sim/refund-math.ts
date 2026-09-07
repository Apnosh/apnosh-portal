/**
 * The money that can go backwards, proved before it moves.
 *
 * Two pure functions decide real dollars, so they are pinned here rather than trusted:
 *   refundOwedCents  — what a stopped prepaid campaign gets back (refund-math.ts)
 *   feeCentsOn       — the ONE service fee, shared by the cart and the Request Desk (checkout-bill.ts)
 *
 * No server, no Stripe, no DB — the whole point is that the number can be checked with nothing
 * running. Run:  npx tsx --tsconfig scripts/sim/tsconfig.json scripts/sim/refund-math.ts
 */
import { refundOwedCents, refundableCents, refundStatus, statusAfterDisputeWon, COLLECTED_STATUSES, SETTLED_STATUSES } from '@/lib/campaigns/refund-math'
import { feeCentsOn, checkoutBill, monthlyPhrase } from '@/lib/campaigns/checkout-bill'
import { priceCreativeRequest, fmtTotal } from '@/lib/requests/pricing'
import type { LineItem } from '@/lib/campaigns/types'
import { Suite } from './lib'

/** A $1,000 basket: $1,000 items + $100 fee + $80 tax = $1,180 charged. */
const BASKET = { totalCents: 118_000, subtotalCents: 100_000, refundedCents: 0 }

function item(id: string, price: number, kind: 'one-time' | 'monthly' = 'one-time'): LineItem {
  return {
    id, position: 0, serviceId: id, name: id, stage: 'foundation', price,
    cadence: kind === 'monthly' ? { kind: 'recurring', every: 'monthly' } : { kind: 'one-time' },
    included: true, paused: false, lock: 'editable',
  } as unknown as LineItem
}

function main() {
  const s = new Suite()

  s.group('proration: what a stopped prepaid campaign gets back')
  s.eq('nothing delivered → the whole charge, fee and tax included', refundOwedCents(BASKET, 0), 118_000)
  s.eq('everything delivered → nothing back', refundOwedCents(BASKET, 100_000), 0)
  // $600 of $1,000 landed. Its share of the paid total is 600/1000 × $1,180 = $708, so $472 goes back.
  s.eq('$600 of $1,000 delivered → $472 back', refundOwedCents(BASKET, 60_000), 47_200)
  s.eq('half delivered → half of everything back', refundOwedCents(BASKET, 50_000), 59_000)
  s.check('the fee and tax on delivered work are KEPT, not refunded',
    refundOwedCents(BASKET, 60_000) < 118_000 - 60_000,
    `owed ${refundOwedCents(BASKET, 60_000)} must be under ${118_000 - 60_000}`)

  s.group('proration fails CLOSED at every edge')
  s.eq('nothing was charged → 0', refundOwedCents({ totalCents: 0, subtotalCents: 0, refundedCents: 0 }, 0), 0)
  s.eq('a monthly-only order (no one-time subtotal) → 0', refundOwedCents({ totalCents: 9_900, subtotalCents: 0, refundedCents: 0 }, 0), 0)
  s.eq('more delivered than was bought → 0, never negative', refundOwedCents(BASKET, 500_000), 0)
  s.eq('already fully refunded → 0', refundOwedCents({ ...BASKET, refundedCents: 118_000 }, 0), 0)
  s.eq('partly refunded → only the rest', refundOwedCents({ ...BASKET, refundedCents: 18_000 }, 0), 100_000)
  s.eq('garbage in → 0, never a number', refundOwedCents({ totalCents: NaN, subtotalCents: NaN, refundedCents: NaN }, NaN), 0)

  s.group('a refund is never bigger than the charge')
  s.eq('fresh charge → all of it is refundable', refundableCents(BASKET), 118_000)
  s.eq('after $180 back → $1,000 left', refundableCents({ ...BASKET, refundedCents: 18_000 }), 100_000)
  s.eq('after everything back → nothing left', refundableCents({ ...BASKET, refundedCents: 118_000 }), 0)
  s.eq('an over-refunded row still reads 0, not negative', refundableCents({ ...BASKET, refundedCents: 999_999 }), 0)

  s.group('the payment row says what happened')
  s.eq('no refund → still paid', refundStatus(118_000, 0), 'paid')
  s.eq('some back → partially refunded', refundStatus(118_000, 47_200), 'partially_refunded')
  s.eq('all back → refunded', refundStatus(118_000, 118_000), 'refunded')

  s.group('a partly refunded order is STILL a paid order')
  // A $1 credit used to flip the row to 'partially_refunded', which the money reads treated as
  // unpaid: the receipt vanished and every piece delivered afterwards accrued as invoiceable — a
  // second bill for work already paid for. These sets are what stop that coming back.
  const collected = COLLECTED_STATUSES as readonly string[]
  const settled = SETTLED_STATUSES as readonly string[]
  s.check('collected: a plain paid order', collected.includes('paid'))
  s.check('collected: a partly refunded order (the rest of the work is still covered)', collected.includes('partially_refunded'))
  s.check('collected: a disputed order (the bank has not decided; do not re-bill the owner)', collected.includes('disputed'))
  s.check('NOT collected: a fully refunded order (the campaign is stopped)', !collected.includes('refunded'))
  s.check('NOT collected: a pending checkout', !collected.includes('pending'))
  s.check('NOT collected: a failed charge', !collected.includes('failed'))
  s.check('settled = collected minus disputed, so we never refund on top of the bank', !settled.includes('disputed'))
  s.check('settled still covers a partial refund (there is more to give back)', settled.includes('partially_refunded'))
  // The gap between the two sets is a real order the stop route has to talk about. Collected but not
  // settled = the bank is holding the money. The settlement must say the dispute, never fall through
  // to "Nothing is owed." because the settled read found no row.
  s.check('a disputed order is collected but NOT settled — the stop must name the dispute',
    collected.includes('disputed') && !settled.includes('disputed'))

  s.group('a chargeback we WIN goes back to the truth, not to "paid"')
  s.eq('nothing was ever refunded → paid', statusAfterDisputeWon(118_000, 0), 'paid')
  s.eq('a credit had gone out before the dispute → partially refunded', statusAfterDisputeWon(118_000, 47_200), 'partially_refunded')
  s.eq('it had already been fully refunded → refunded', statusAfterDisputeWon(118_000, 118_000), 'refunded')

  s.group('the monthly line says the tax it really charges')
  // The subscription runs Stripe Tax, so "$99/mo" alone is short by the tax every month.
  s.eq('a known estimate is printed', monthlyPhrase(9_900, 812), '$99.00/mo plus $8.12 tax')
  s.eq('no answer from Stripe → say "plus tax", never a number we did not get', monthlyPhrase(9_900, null), '$99.00/mo plus tax')
  s.eq('no answer at all (undefined) reads the same', monthlyPhrase(9_900, undefined), '$99.00/mo plus tax')
  s.eq('Stripe really said no tax → nothing extra', monthlyPhrase(9_900, 0), '$99.00/mo')
  s.check('a $0 tax is never printed as a tax line', !monthlyPhrase(9_900, 0).includes('$0.00'))
  s.check('a known tax is never silently dropped', monthlyPhrase(9_900, 1).includes('$0.01 tax'))

  s.group('ONE fee: 10% on one-time work, never on monthly')
  s.eq('10% of $1,000', feeCentsOn(100_000), 10_000)
  s.eq('10% of $0 is $0', feeCentsOn(0), 0)
  s.eq('rounds to the cent', feeCentsOn(3_333), 333)
  s.eq('a negative subtotal can never make a fee', feeCentsOn(-5_000), 0)

  s.group('the cart and the desk agree, because they share the function')
  const cart = checkoutBill({ items: [item('a', 500), item('b', 500), item('m', 165, 'monthly')] })
  s.eq('cart: one-time subtotal is $1,000', cart.subtotalCents, 100_000)
  s.eq('cart: the fee is the shared function', cart.serviceFeeCents, feeCentsOn(cart.subtotalCents))
  s.eq('cart: the monthly is carried, not charged', cart.perMonthCents, 16_500)
  s.check('cart: no fee rides on the monthly', cart.serviceFeeCents === feeCentsOn(100_000))

  const desk = priceCreativeRequest('print', {})
  s.check('desk: a one-time order carries a fee line', !!desk?.lines.some((l) => l.label === 'Service fee'))
  s.eq('desk: the printed total is the sum of the printed lines',
    desk?.totalCents, desk?.lines.reduce((n, l) => n + l.amountCents, 0))
  s.eq('desk: the fee is the same 10% the cart takes', desk?.lines.find((l) => l.label === 'Service fee')?.amountCents, feeCentsOn(15_000))

  const monthly = priceCreativeRequest('social', { count: '8 a month' })
  s.check('desk: a monthly order carries NO fee line', !monthly?.lines.some((l) => l.label === 'Service fee'))
  s.eq('desk: the monthly total is exactly the monthly price', monthly?.totalCents, 56_000)
  s.check('desk: a monthly total is flagged so the screen can say what it is', monthly?.monthly === true)
  // The desk stores one quote and mints one work order; nothing bills a second month. So the words
  // are "the first month", not "a month" — a promise of a subscription that does not exist.
  s.eq('desk: a monthly order is billed for the first month, not every month', fmtTotal(monthly!), '$560 for the first month')
  s.check('desk: a one-time order says no such thing', !fmtTotal(desk!).includes('month'))

  const ok = s.report('Money that can go backwards — refund math + one fee')
  process.exit(ok ? 0 : 1)
}

main()
