/**
 * The Request Desk going through the till, proved before any money moves.
 *
 * The desk used to store a price and mint the work with no Stripe call at all. Now it charges the
 * same way the cart charges, which means one number has to be split back into the two the payment
 * row keeps — and a split that is off by a cent is a receipt that does not add up.
 *
 * Everything here is pure: the bill math, the fee, the monthly words, the kill switch. No server,
 * no Stripe, no database — the whole point is that the numbers can be checked with nothing running.
 *
 * Run:  npx tsx --tsconfig scripts/sim/tsconfig.json scripts/sim/desk-till.ts
 */
import { deskBill } from '@/lib/requests/desk-bill'
import { feeCentsOn, SERVICE_FEE_RATE, monthlyPhrase, fmtMoney } from '@/lib/campaigns/checkout-bill'
import { priceCreativeRequest, fmtTotal, type CreativePrice } from '@/lib/requests/pricing'
import { campaignCheckoutEnabled, CHECKOUT_CLOSED_MESSAGE } from '@/lib/checkout-gate'
import { refundOwedCents } from '@/lib/campaigns/refund-math'
import { deskPaymentMatchesOrder } from '@/lib/requests/desk-guards'
import { Suite } from './lib'

/** Every desk type the price sheet can price, with a plausible answer set. */
const CASES: { type: string; answers: Record<string, string> }[] = [
  { type: 'photos', answers: {} },
  { type: 'video', answers: {} },
  { type: 'menu', answers: {} },
  { type: 'print', answers: {} },
  { type: 'email', answers: {} },
  { type: 'ads', answers: {} },
  { type: 'copy', answers: {} },
  { type: 'social', answers: { count: '8 a month' } },
  { type: 'website', answers: {} },
  { type: 'logo', answers: {} },
  { type: 'other', answers: {} },
]

function main() {
  const s = new Suite()

  s.group('The split: one stored total back into the two numbers the payment row keeps')
  // The quote was built as subtotal + round(subtotal * 10%). The split has to find that subtotal
  // exactly, or the receipt shows a fee that is not the fee that was charged.
  let exact = 0, tried = 0
  for (let subtotal = 1_000; subtotal <= 500_000; subtotal += 137) {
    const total = subtotal + feeCentsOn(subtotal)
    const b = deskBill(total, 'once')
    tried++
    if (b.subtotalCents === subtotal && b.serviceFeeCents === feeCentsOn(subtotal)) exact++
  }
  s.eq(`every quote from $10 to $5,000 splits back exactly (${tried} of them)`, exact, tried)

  let adds = 0
  for (let total = 1; total <= 300_000; total += 91) {
    const b = deskBill(total, 'once')
    if (b.subtotalCents + b.serviceFeeCents === total) adds++
  }
  s.eq('the two halves ALWAYS add up to what the card is charged, whatever rounding did', adds, Math.ceil(300_000 / 91))

  s.group('The one fee rule: 10% on the one-time work, never on a monthly price')
  s.eq('the rate is the cart’s rate, not a second one', SERVICE_FEE_RATE, 0.1)
  const oneTime = deskBill(16_500, 'once')
  s.eq('a $165 order is $150 of work plus a $15 fee', [oneTime.subtotalCents, oneTime.serviceFeeCents], [15_000, 1_500])
  s.eq('and nothing monthly rides along with it', oneTime.perMonthCents, 0)
  const monthly = deskBill(56_000, 'monthly')
  s.eq('a $560/mo order carries NO fee', monthly.serviceFeeCents, 0)
  s.eq('a $560/mo order charges NOTHING today', monthly.preTaxCents, 0)
  s.eq('the whole of it is the monthly price', monthly.perMonthCents, 56_000)

  s.group('The sheet and the till agree, type by type')
  for (const c of CASES) {
    const p = priceCreativeRequest(c.type, c.answers) as CreativePrice | null
    if (!p) { s.check(`${c.type}: has a price`, false, 'priceCreativeRequest returned null'); continue }
    const b = deskBill(p.totalCents, p.monthly ? 'monthly' : 'once')
    if (p.monthly) {
      s.eq(`${c.type}: the whole monthly total is monthly, nothing charged today`, [b.perMonthCents, b.preTaxCents], [p.totalCents, 0])
      continue
    }
    const sheetFee = p.lines.find((l) => l.label === 'Service fee')?.amountCents ?? 0
    const sheetSubtotal = p.totalCents - sheetFee
    s.eq(`${c.type}: the till's split is the sheet's own lines`, [b.subtotalCents, b.serviceFeeCents], [sheetSubtotal, sheetFee])
    s.eq(`${c.type}: the charge is the price the owner was shown`, b.preTaxCents, p.totalCents)
  }

  s.group('Fails to zero, never to a guess')
  for (const bad of [0, -1, -99_999, null, undefined, NaN]) {
    const b = deskBill(bad as number | null, 'once')
    s.eq(`a ${String(bad)} quote bills nothing`, [b.subtotalCents, b.serviceFeeCents, b.preTaxCents, b.perMonthCents], [0, 0, 0, 0])
  }

  s.group('The words: no "a month" without a subscription behind it')
  const social = priceCreativeRequest('social', { count: '8 a month' })!
  // The desk now saves the card and starts a real Stripe subscription with automatic_tax on it, so
  // "a month" is true again — and the tax has to ride with it, because every invoice adds tax.
  s.eq('a monthly desk order says a month, and says tax is added', fmtTotal(social), '$560 a month, plus tax')
  const print = priceCreativeRequest('print', {})!
  s.check('a one-time order says nothing about months', !fmtTotal(print).includes('month'))
  s.eq('the consent says the real number when Stripe answered', monthlyPhrase(56_000, 4_600), '$560.00/mo plus $46.00 tax')
  s.eq('and says "plus tax" — never a number we did not get — when it did not', monthlyPhrase(56_000, null), '$560.00/mo plus tax')
  s.eq('and says nothing extra when Stripe really said there is no tax', monthlyPhrase(56_000, 0), '$560.00/mo')

  s.group('The kill switch: shut unless it is opened on purpose')
  const before = process.env.CAMPAIGN_CHECKOUT_ENABLED
  for (const v of [undefined, '', 'false', 'TRUE', 'True', '1', 'yes', ' true']) {
    if (v === undefined) delete process.env.CAMPAIGN_CHECKOUT_ENABLED
    else process.env.CAMPAIGN_CHECKOUT_ENABLED = v
    s.check(`"${String(v)}" keeps the till shut`, campaignCheckoutEnabled() === false)
  }
  process.env.CAMPAIGN_CHECKOUT_ENABLED = 'true'
  s.check('only exactly "true" opens it', campaignCheckoutEnabled() === true)
  if (before === undefined) delete process.env.CAMPAIGN_CHECKOUT_ENABLED
  else process.env.CAMPAIGN_CHECKOUT_ENABLED = before
  s.check('the shut message says the plan is saved and a person will bill it',
    CHECKOUT_CLOSED_MESSAGE.includes('not open yet') && CHECKOUT_CLOSED_MESSAGE.includes('invoice'))

  s.group('Sending a desk order back')
  // A desk order is ONE thing: delivered means the whole subtotal was earned, not delivered means
  // none of it was. The same proration function the cart uses does the arithmetic.
  const paid = { totalCents: 17_820, subtotalCents: 15_000, refundedCents: 0 }   // $150 + $15 fee + $17.20 tax
  s.eq('nothing delivered → the whole charge, fee and tax included', refundOwedCents(paid, 0), 17_820)
  s.eq('delivered → nothing goes back', refundOwedCents(paid, 15_000), 0)
  s.eq('already fully refunded → nothing goes back twice', refundOwedCents({ ...paid, refundedCents: 17_820 }, 0), 0)
  // A monthly-only desk order was never charged upfront (its row is keyed to a SetupIntent and its
  // subtotal is 0), so there is nothing to prorate and the math must not invent a refund.
  s.eq('a monthly-only order has nothing upfront to send back', refundOwedCents({ totalCents: 0, subtotalCents: 0, refundedCents: 0 }, 0), 0)
  s.check('the receipt prints in whole money', fmtMoney(17_820) === '$178.20')

  s.group('Whose payment is this? (the order id comes from the browser, so nothing may be taken on trust)')
  const REQ = 'req-1111', OTHER = 'req-2222'
  const good = { rowRequestId: REQ, rowCampaignId: null, intentKind: 'desk_checkout', intentRequestId: REQ }
  s.check('the order\'s own payment pays for it', deskPaymentMatchesOrder(good, REQ))
  s.check('a monthly order\'s card-setup counts too', deskPaymentMatchesOrder({ ...good, intentKind: 'desk_checkout_setup' }, REQ))
  s.check('another order\'s settled payment CANNOT pay for this one', !deskPaymentMatchesOrder({ ...good, rowRequestId: OTHER, intentRequestId: OTHER }, REQ))
  s.check('a payment stamped for this order but made for another is refused', !deskPaymentMatchesOrder({ ...good, intentRequestId: OTHER }, REQ))
  s.check('a row for another order is refused even when Stripe names this one', !deskPaymentMatchesOrder({ ...good, rowRequestId: OTHER }, REQ))
  s.check('a campaign checkout is never a desk order\'s payment', !deskPaymentMatchesOrder({ ...good, rowCampaignId: 'camp-1', intentKind: 'campaign_checkout' }, REQ))
  s.check('a campaign-bound row is refused even wearing desk metadata', !deskPaymentMatchesOrder({ ...good, rowCampaignId: 'camp-1' }, REQ))
  s.check('a pre-258 row with no request_id pays for nothing', !deskPaymentMatchesOrder({ ...good, rowRequestId: null }, REQ))
  s.check('an intent with no metadata pays for nothing', !deskPaymentMatchesOrder({ rowRequestId: REQ, rowCampaignId: null }, REQ))
  s.check('and no order id at all is never a match', !deskPaymentMatchesOrder(good, ''))

  const ok = s.report('The desk through the till — one fee, one card form, one shut switch')
  process.exit(ok ? 0 : 1)
}

main()
