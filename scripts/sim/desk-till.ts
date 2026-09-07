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
import { deskBill, deskQuoteOrigin } from '@/lib/requests/desk-bill'
import { feeCentsOn, SERVICE_FEE_RATE, monthlyPhrase, fmtMoney } from '@/lib/campaigns/checkout-bill'
import { priceCreativeRequest, fmtTotal, type CreativePrice } from '@/lib/requests/pricing'
import { campaignCheckoutEnabled, CHECKOUT_CLOSED_MESSAGE } from '@/lib/checkout-gate'
import { refundOwedCents, refundStatus, COLLECTED_STATUSES } from '@/lib/campaigns/refund-math'
import { deskPaymentMatchesOrder, paymentMatchesLane, deskPaymentDue, deskCancelable, acceptGoesToTill, acceptPromiseLine, adminStatusBlockedByPayment, AWAITING_PAYMENT, DESK_INTENT_KINDS, CAMPAIGN_INTENT_KINDS } from '@/lib/requests/desk-guards'
import { ADMIN_SETTABLE_STATUSES, REQUEST_STATUSES, STATUS_LABEL, STATUS_OWNER_LINE, type RequestStatus } from '@/lib/requests/catalog'
import { workStarted, billNoticeDue, billNoticeLines } from '@/lib/campaigns/work-orders-core'
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

  s.group('A hand-typed staff quote has no fee inside it to take back out')
  // The split exists because the SHEET builds its total as s + 10%. A person typing $480 into the
  // admin board added nothing: booking a $43.64 fee out of it writes money into the ledger that
  // nobody ever charged, and prorates the refund against a subtotal that was never the price.
  const staff = deskBill(48_000, 'once', 'staff_quote')
  s.eq('the whole quote is the work', staff.subtotalCents, 48_000)
  s.eq('and the fee line is zero, because there was no fee', staff.serviceFeeCents, 0)
  s.eq('the card is charged the number the person quoted', staff.preTaxCents, 48_000)
  const sheet = deskBill(48_000, 'once', 'price_sheet')
  s.check('a price-sheet order still splits, because its fee is really in there', sheet.serviceFeeCents > 0)
  s.eq('both origins charge exactly the same money', staff.preTaxCents, sheet.preTaxCents)
  s.eq('a monthly staff quote is still monthly and still fee-free',
    deskBill(32_000, 'monthly', 'staff_quote').perMonthCents, 32_000)
  // Which one a row IS, read off its own brief. The order lane stamps _pricing; a quote never does.
  s.eq('an order the server priced is a price-sheet order', deskQuoteOrigin({ _pricing: { origin: 'price_sheet' } }), 'price_sheet')
  s.eq('a graphic order stamped with its sheet version counts too', deskQuoteOrigin({ _pricing: { priceSheetVersion: 3, tier: 2 } }), 'price_sheet')
  s.eq('a brief with no stamp is a person\'s quote', deskQuoteOrigin({ what: 'a menu' }), 'staff_quote')
  s.eq('and so is an older row with no brief at all', deskQuoteOrigin(null), 'staff_quote')
  s.eq('the default is what it has always been, so nothing changed under a caller that says nothing',
    deskBill(48_000, 'once').serviceFeeCents, sheet.serviceFeeCents)

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

  s.group('The mirror: a desk order\'s money can never ship a campaign')
  // The hole this closes. A DESK payment row keeps campaign_id null forever (the desk never binds
  // one), and the campaign lane only ever asked "is there a paid row on this account for this
  // intent" — so a $40 graphic order's receipt shipped a whole campaign for nothing.
  const CAMP = 'camp-1111', OTHERCAMP = 'camp-2222'
  const campRow = { requestId: null, campaignId: null }
  const campPi = { kind: 'campaign_checkout', requestId: null }
  s.check('a cart\'s own payment ships its campaign', paymentMatchesLane(campRow, campPi, 'campaign', CAMP))
  s.check('a monthly-only cart\'s card-setup ships it too', paymentMatchesLane(campRow, { ...campPi, kind: 'campaign_checkout_setup' }, 'campaign', CAMP))
  s.check('a PAID DESK ORDER CANNOT ship a campaign', !paymentMatchesLane({ requestId: REQ, campaignId: null }, { kind: 'desk_checkout', requestId: REQ }, 'campaign', CAMP))
  s.check('nor can a desk row wearing campaign metadata', !paymentMatchesLane({ requestId: REQ, campaignId: null }, campPi, 'campaign', CAMP))
  s.check('nor a cart row whose intent names an order', !paymentMatchesLane(campRow, { ...campPi, requestId: REQ }, 'campaign', CAMP))
  s.check('a payment already spent on another campaign is refused', !paymentMatchesLane({ requestId: null, campaignId: OTHERCAMP }, campPi, 'campaign', CAMP))
  s.check('but the SAME campaign again is fine — complete and ship both land here', paymentMatchesLane({ requestId: null, campaignId: CAMP }, campPi, 'campaign', CAMP))
  s.check('an intent with no kind ships nothing', !paymentMatchesLane(campRow, { requestId: null }, 'campaign', CAMP))
  s.check('and no campaign id at all is never a match', !paymentMatchesLane(campRow, campPi, 'campaign', ''))
  // And the mirror the other way, so neither lane can quietly accept the other's kind.
  s.check('a campaign intent is never a desk order\'s payment', !paymentMatchesLane({ requestId: REQ, campaignId: null }, { kind: 'campaign_checkout', requestId: REQ }, 'desk', REQ))
  s.check('the two lanes share no kind at all', !DESK_INTENT_KINDS.some((k) => CAMPAIGN_INTENT_KINDS.includes(k)))

  s.group('Free work: an order the owner placed can never be started by saying yes to it')
  s.check('an order waiting for the card owes money', deskPaymentDue({ status: AWAITING_PAYMENT }))
  s.check('and stops owing it the moment the card clears', !deskPaymentDue({ status: AWAITING_PAYMENT, paidAt: '2026-09-07T10:00:00Z' }))
  s.check('a person\'s quote owes nothing — the yes is what starts it', !deskPaymentDue({ status: 'quoted' }))
  s.check('but a quoted row with a charge nobody collected is the same unpaid order', deskPaymentDue({ status: 'quoted', unpaidTillRow: true }))
  s.check('a paid one is never asked twice, whatever its status says', !deskPaymentDue({ status: 'quoted', unpaidTillRow: true, paidAt: '2026-09-07T10:00:00Z' }))
  s.check('a plain request owes nothing', !deskPaymentDue({ status: 'requested' }))
  s.check('and neither does work already under way', !deskPaymentDue({ status: 'in_progress' }))

  // Move 5b: the staff quote was the LAST free work in the desk. A yes to a priced quote now goes
  // to the same till, and only a $0 quote still mints on the yes.
  s.check('saying yes to a priced quote goes to the till', acceptGoesToTill(48000, true))
  s.check('a one-cent quote is still money', acceptGoesToTill(1, true))
  s.check('a $0 quote mints on the yes (there is nothing to pay)', !acceptGoesToTill(0, true))
  s.check('a quote with no number yet mints nothing through the till', !acceptGoesToTill(null, true))
  s.check('an undefined quote is not a price', !acceptGoesToTill(undefined, true))
  s.check('a broken number is not a price', !acceptGoesToTill(Number.NaN, true))

  // ...but only while the till can take a card. With the switch off (today's prod), sending the
  // yes to awaiting_payment parked the owner where prepare answers checkoutClosed: no card, no
  // way back. Shut till, the yes mints the work and a person sends the bill.
  s.group('The yes, under the kill switch the desk actually runs on')
  s.check('with the till shut, a priced yes does NOT go to the till', !acceptGoesToTill(48000, false))
  s.check('a $0 quote is unchanged by the switch', !acceptGoesToTill(0, false) && !acceptGoesToTill(0, true))
  s.check('the shut-till yes still leaves nothing owed to the card', !deskPaymentDue({ status: 'in_progress' }))
  s.eq('open till: the line promises the card',
    acceptPromiseLine(acceptGoesToTill(48000, true), 48000),
    'Your card opens next. Your team starts the same day it clears.')
  s.eq('shut till: the line promises the bill after the work, not a card',
    acceptPromiseLine(acceptGoesToTill(48000, false), 48000),
    'Your team starts now. We send the bill after you approve the work.')
  s.eq('a $0 quote says there is nothing to pay under either switch',
    acceptPromiseLine(acceptGoesToTill(0, false), 0),
    'Nothing to pay on this one. Your team starts today.')
  s.check('no promise line ever offers a card the switch cannot open',
    [true, false].every((open) => {
      const line = acceptPromiseLine(acceptGoesToTill(48000, open), 48000)
      return open ? line.includes('card') : !line.includes('card')
    }))

  // Money makes a status one-way: a paid order pushed back to 'quoted' would offer a second yes on
  // money already taken, and accept's paid_at check reads that as "nothing due" and mints free.
  s.group('A paid order cannot be quoted again')
  s.eq('an unpaid order may be quoted', adminStatusBlockedByPayment('quoted', null), null)
  s.eq('a pre-258 row with no paid_at column reads as unpaid', adminStatusBlockedByPayment('quoted', undefined), null)
  s.check('a paid order refuses to go back to a quote',
    (adminStatusBlockedByPayment('quoted', '2026-09-07T00:00:00Z') ?? '').includes('already paid'))
  s.check('and the refusal tells the person what to do instead',
    (adminStatusBlockedByPayment('quoted', '2026-09-07T00:00:00Z') ?? '').includes('Refund'))
  s.eq('a paid order may still be delivered', adminStatusBlockedByPayment('delivered', '2026-09-07T00:00:00Z'), null)
  s.eq('and still closed', adminStatusBlockedByPayment('closed', '2026-09-07T00:00:00Z'), null)
  s.eq('and still moved on to in progress', adminStatusBlockedByPayment('in_progress', '2026-09-07T00:00:00Z'), null)
  s.check('and once it is at the till it owes money like every other order',
    deskPaymentDue({ status: AWAITING_PAYMENT }))
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
  // And the bill it DOES promise is one a person really sends: the accrual pages the team.
  s.check('the line says a person sends the bill', confirmSub.includes('we send you the bill'))
  s.check('so does the done line', doneSub.includes('we send you the bill'))
  const GRAPHIC = 'req-3333'
  s.check('a graphic nobody paid for at the till needs a bill sent', billNoticeDue({ requestId: GRAPHIC, covered: false, amountCents: 4_000 }))
  s.check('one already paid at the till does not', !billNoticeDue({ requestId: GRAPHIC, covered: true, amountCents: 4_000 }))
  s.check('a campaign piece does not — its cart or its invoice lane already told somebody', !billNoticeDue({ requestId: '', covered: false, amountCents: 4_000 }))
  s.check('an unpriced piece does not — that has its own "no price" page', !billNoticeDue({ requestId: GRAPHIC, covered: false, amountCents: 0 }))
  const words = billNoticeLines('Yellow Bee Market', 'Graphic design · request', 4_000)
  s.check('the notice names who, what and how much', words.title.includes('Yellow Bee Market') && words.title.includes('Graphic design') && words.body.includes('$40.00'))
  s.check('and tells the person what to do', words.title.startsWith('Send the bill') && words.body.includes('send the invoice'))
  s.check('no em dashes in the notice either', !words.title.includes('—') && !words.body.includes('—'))
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
