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
import { refundOwedCents, refundStatus, COLLECTED_STATUSES } from '@/lib/campaigns/refund-math'
import { deskPaymentMatchesOrder, deskPaymentDue, deskCancelable, AWAITING_PAYMENT } from '@/lib/requests/desk-guards'
import { ADMIN_SETTABLE_STATUSES, REQUEST_STATUSES, STATUS_LABEL, STATUS_OWNER_LINE, type RequestStatus } from '@/lib/requests/catalog'
import { workStarted } from '@/lib/campaigns/work-orders-core'
import { DESIGN_LINES } from '@/lib/design/design-copy'
import { lineFor, type PromiseState } from '@/lib/promises/lines'
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

  s.group('Free work: an order the owner placed can never be started by saying yes to it')
  s.check('an order waiting for the card owes money', deskPaymentDue({ status: AWAITING_PAYMENT }))
  s.check('and stops owing it the moment the card clears', !deskPaymentDue({ status: AWAITING_PAYMENT, paidAt: '2026-09-07T10:00:00Z' }))
  s.check('a person\'s quote owes nothing — the yes is what starts it', !deskPaymentDue({ status: 'quoted' }))
  s.check('but a quoted row with a charge nobody collected is the same unpaid order', deskPaymentDue({ status: 'quoted', unpaidTillRow: true }))
  s.check('a paid one is never asked twice, whatever its status says', !deskPaymentDue({ status: 'quoted', unpaidTillRow: true, paidAt: '2026-09-07T10:00:00Z' }))
  s.check('a plain request owes nothing', !deskPaymentDue({ status: 'requested' }))
  s.check('and neither does work already under way', !deskPaymentDue({ status: 'in_progress' }))
  s.eq('the till writes one status and the screen keys on it', AWAITING_PAYMENT, 'awaiting_payment')
  s.check('a person may set every status EXCEPT the till\'s own', !ADMIN_SETTABLE_STATUSES.includes(AWAITING_PAYMENT as RequestStatus))
  s.eq('every other status stays settable by hand', ADMIN_SETTABLE_STATUSES.length, REQUEST_STATUSES.length - 1)
  for (const st of REQUEST_STATUSES) {
    s.check(`"${st}" has words for the owner to read`, Boolean(STATUS_LABEL[st] && STATUS_OWNER_LINE[st]))
  }

  s.group('The desk card can say who is on the work (the read that always errored)')
  // creator_work_orders has no started_at and never has: the promise read asked for it anyway, so
  // every desk landing came back 42703 and byRequest was empty for every client, forever.
  s.check('an offered order has NOT started — a name on it is not a start', !workStarted('offered'))
  s.check('nor has an accepted one', !workStarted('accepted'))
  s.check('in progress has', workStarted('in_progress'))
  s.check('so has one back in hand for changes', workStarted('revision'))
  s.check('and a delivered one', workStarted('delivered'))
  s.check('and an approved one', workStarted('approved'))
  s.check('a declined order never started', !workStarted('declined'))
  s.check('and neither did nothing at all', !workStarted(null) && !workStarted(undefined) && !workStarted(''))

  s.group('The graphic order says what its money really does')
  // The graphic lane still mints on placement and takes no card: the charge row is written when the
  // OWNER APPROVES the finished piece, and an invoice is made from that row. "Goes on your Apnosh
  // bill. Nothing else to do." was a bill that did not exist yet.
  const confirmSub = DESIGN_LINES['cart.confirm.sub']
  const doneSub = DESIGN_LINES['done.sub.order']
  s.check('the confirm line no longer promises a bill nothing writes', !confirmSub.includes('Goes on your Apnosh bill'))
  s.check('it says nothing is charged today', confirmSub.toLowerCase().includes('no charge today'))
  s.check('and names the moment the money is real: approval', confirmSub.toLowerCase().includes('approve'))
  s.check('the done line says the same thing, in the same words', doneSub.toLowerCase().includes('approve'))
  s.check('and still says the work starts now, which it does', doneSub.includes('work starts now'))
  for (const [k, line] of [['cart.confirm.sub', confirmSub], ['done.sub.order', doneSub]] as const) {
    s.check(`${k}: no em dashes, no marketing`, !line.includes('—'))
  }

  s.group('Money that landed with nobody watching')
  // The webhook backstop only knew the cart's kind, so a desk order whose tab closed after the card
  // cleared stayed pending forever. And prepare read only the ORDER row's paid stamp, which is
  // written a step after the money — so a returning owner was offered a second charge.
  const DESK_KINDS = ['desk_checkout', 'desk_checkout_setup']
  s.check('the desk\'s two kinds are the ones prepare puts on its intents', DESK_KINDS.every((k) => deskPaymentMatchesOrder({ rowRequestId: REQ, rowCampaignId: null, intentKind: k, intentRequestId: REQ }, REQ)))
  s.check('"paid" counts as collected', (COLLECTED_STATUSES as readonly string[]).includes('paid'))
  s.check('so does a partly refunded charge — money was still taken', (COLLECTED_STATUSES as readonly string[]).includes('partially_refunded'))
  s.check('and a disputed one, which is money the bank is holding', (COLLECTED_STATUSES as readonly string[]).includes('disputed'))
  s.check('a pending row is NOT collected, so a first charge may still start', !(COLLECTED_STATUSES as readonly string[]).includes('pending'))
  s.check('and neither is a failed one', !(COLLECTED_STATUSES as readonly string[]).includes('failed'))

  s.group('Cancelling an order: only before the work lands, and the screen agrees with the server')
  s.check('an order waiting for the card can be cancelled', deskCancelable(AWAITING_PAYMENT))
  s.check('so can one already in the works', deskCancelable('in_progress'))
  s.check('and a quote nobody has said yes to', deskCancelable('quoted'))
  s.check('a delivered order cannot — that is a conversation, not a button', !deskCancelable('delivered'))
  s.check('nor a closed one', !deskCancelable('closed'))
  s.check('nor one we declined', !deskCancelable('declined'))
  s.check('in progress on the row but DELIVERED on the work order is delivered', !deskCancelable('in_progress', 'delivered'))
  s.check('and approved work is delivered too', !deskCancelable('in_progress', 'approved'))
  s.check('work merely being made is still cancellable', deskCancelable('in_progress', 'in_progress'))
  s.check('a status we do not know is never cancellable', !deskCancelable('something_else') && !deskCancelable(null))
  // A full refund is what triggers the desk settlement (subscription cancel + work stop), so the
  // status math that decides "full" has to agree with the refund we actually send.
  s.eq('everything back reads as refunded', refundStatus(17_820, 17_820), 'refunded')
  s.eq('part of it back is partly refunded, which does NOT stop the work', refundStatus(17_820, 5_000), 'partially_refunded')
  s.eq('nothing back leaves the row paid', refundStatus(17_820, 0), 'paid')

  s.group('No line ever prints "Invalid Date" or stops mid-sentence')
  const promiseRow = (over: Partial<{ state: PromiseState; sub: string; value: string; small: string; showsOn: string }>) =>
    ({ state: 'counting' as PromiseState, sub: 'Ordered Sep 1 · taps on your Google card', value: '—', small: 'counting from Sep 12', showsOn: '2026-10-08', ...over })
  for (const bad of ['', 'not-a-date', '0000-00-00']) {
    const line = lineFor(promiseRow({ showsOn: bad }))
    s.check(`a "${bad || 'missing'}" showing day never prints Invalid Date`, !line.includes('Invalid Date'))
    s.check(`and never leaves a dangling "on Home"`, !line.trimEnd().endsWith('on Home'))
  }
  s.eq('a good day still names itself', lineFor(promiseRow({})), 'Counted after: taps on your Google card · on Home Oct 8')
  const noFrom = lineFor(promiseRow({ state: 'delivered', value: 'Delivered', small: '' }))
  s.check('a delivered row with no count day never ends on "starts "', !/starts\s*$/.test(noFrom))
  s.check('it says the plain thing instead', noFrom === 'Delivered · your count starts soon')
  s.eq('and with a day, it names the day', lineFor(promiseRow({ state: 'delivered', value: 'Delivered' })), 'Delivered · your count starts Sep 12')
  for (const st of ['ordered', 'production', 'held', 'delivered', 'counting', 'counted', 'stopped', 'not_counted'] as PromiseState[]) {
    const line = lineFor(promiseRow({ state: st, showsOn: '' }))
    s.check(`${st}: no "undefined", no "null", no "NaN", even with no dates`, !/undefined|null|NaN|Invalid Date/.test(line))
  }

  const ok = s.report('The desk through the till — one fee, one card form, one shut switch')
  process.exit(ok ? 0 : 1)
}

main()
