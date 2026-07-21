/**
 * verify-order-links — proves the Order/Reserve diagnosis against the REAL payload.
 *
 * The fixture below is the verbatim response from mybusinessplaceactions for Yellow
 * Bee Market on 2026-07-20, captured through /api/dashboard/listing/place-actions.
 * It is not invented: it is what a real connected listing actually returns, which is
 * the only reason the counts here mean anything.
 */
import {
  diagnoseOrderLinks, whatWeNeed, validateOwnUrl, aggregatorFor,
  type RawActionLink,
} from '../src/lib/campaigns/order-links'

let pass = 0, fail = 0
function check(label: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  PASS  ${label}`) }
  else { fail++; console.log(`  FAIL  ${label}${detail ? ` (${detail})` : ''}`) }
}

/* ── the real Yellow Bee listing ─────────────────────────────────────── */
const YELLOW_BEE: RawActionLink[] = [
  { name: 'locations/6387724830703404865/placeActionLinks/c60c568e1cc9ad91', uri: 'https://www.doordash.com/en/store/yellow-bee-market-seattle-30932248/42733946/?srsltid=AfmBOoq', placeActionType: 'FOOD_TAKEOUT', providerType: 'MERCHANT', isEditable: true },
  { name: 'locations/6387724830703404865/placeActionLinks/7c4095b1d0d9b254', uri: 'https://www.doordash.com/en/store/yellow-bee-market-seattle-30932248/42733946/?srsltid=AfmBOoq', placeActionType: 'FOOD_DELIVERY', providerType: 'MERCHANT', isEditable: true },
  { name: 'locations/6387724830703404865/placeActionLinks/778dd2c7111d2122', uri: 'https://www.doordash.com/store/yellow-bee-market-seattle-30932248/?utm_campaign=gpa&pickup=true', placeActionType: 'SHOP_ONLINE', providerType: 'AGGREGATOR_3P' },
  { name: 'locations/6387724830703404865/placeActionLinks/60d057eee957cb41', uri: 'https://www.doordash.com/store/yellow-bee-market-seattle-30932248/?utm_campaign=gpa', placeActionType: 'SHOP_ONLINE', providerType: 'AGGREGATOR_3P' },
  { name: 'locations/6387724830703404865/placeActionLinks/0d5dc54d74626842', uri: 'https://order.online/store/-30932248/?delivery=true&hideModal=true&utm_source=gfo', placeActionType: 'SHOP_ONLINE', providerType: 'AGGREGATOR_3P' },
  { name: 'locations/6387724830703404865/placeActionLinks/28973c4786d93f6c', uri: 'https://order.online/store/-30932248/?pickup=true&hideModal=true&utm_source=gfo', placeActionType: 'SHOP_ONLINE', providerType: 'AGGREGATOR_3P' },
]

console.log('\n== the real Yellow Bee listing ==')
const yb = diagnoseOrderLinks(YELLOW_BEE)
check('reads all 6 links', yb.ours.length + yb.locked.length === 6, `got ${yb.ours.length + yb.locked.length}`)
check('2 are ours to change (isEditable)', yb.ours.length === 2, `got ${yb.ours.length}`)
check('4 are locked aggregator links', yb.locked.length === 4, `got ${yb.locked.length}`)
check('Order online + Reserve are the empty slots', yb.emptySlots.map((s) => s.type).sort().join(',') === 'DINING_RESERVATION,FOOD_ORDERING', yb.emptySlots.map((s) => s.type).join(','))
check('both of our links currently go to an app', yb.ourLinksGoingToApps.length === 2)
check('every link resolves to DoorDash', yb.allGoToApps === true)
check('order.online is named DoorDash, not order', yb.locked.every((l) => l.goesTo === 'DoorDash'))
check('headline states it plainly', yb.headline === 'Every ordering button on your Google listing goes to DoorDash.', yb.headline)
check('4 buttons are fixable (2 empty + 2 ours)', yb.fixableCount === 4, `got ${yb.fixableCount}`)
check('SHOP_ONLINE is reported, never offered as settable', yb.ours.every((l) => l.type !== 'SHOP_ONLINE'))
check('locked links keep their google id, so we never try to patch them blind', yb.locked.every((l) => l.name != null))

console.log('\n== what we need from the owner ==')
const blocked = whatWeNeed(yb, false)
check('no ordering page of their own => blocked, not attempted', blocked.blocked === true)
check('and it names the real next step', blocked.nextService === 'ordering-setup')
check('blocked state asks for nothing', blocked.asks.length === 0)

const ready = whatWeNeed(yb, true)
check('with their own ordering, 4 asks', ready.asks.length === 4, `got ${ready.asks.length}`)
check('empty slots explained as free wins', ready.asks.some((a) => a.why.includes('yours to claim')))
check('app-pointing ones name the app', ready.asks.some((a) => a.why.includes('DoorDash')))
check('not blocked', ready.blocked === false)

console.log('\n== the url the owner types ==')
check('rejects empty', validateOwnUrl('  ').ok === false)
check('rejects nonsense', validateOwnUrl('not a url').ok === false)
check('rejects a DoorDash link (the whole point)', validateOwnUrl('https://www.doordash.com/store/x').ok === false)
check('rejects Uber Eats', validateOwnUrl('https://ubereats.com/store/x').ok === false)
check('rejects http, demands https', validateOwnUrl('http://shopyellowbee.com/order').ok === false)
const good = validateOwnUrl('shopyellowbee.com/order')
check('accepts a bare domain and adds https', good.ok === true && good.url.startsWith('https://'))
check('DoorDash rejection names the app', (validateOwnUrl('https://doordash.com/x') as { error: string }).error.includes('DoorDash'))

console.log('\n== edge cases that must not throw ==')
check('empty listing', diagnoseOrderLinks([]).headline.includes('no ordering or booking buttons'))
check('null input', diagnoseOrderLinks(null).ours.length === 0)
check('a row with no uri is dropped, not rendered blank', diagnoseOrderLinks([{ placeActionType: 'FOOD_ORDERING' }]).ours.length === 0)
check('an unparseable uri is not called an aggregator', aggregatorFor('::::') === null)
check('a subdomain of an app still resolves', aggregatorFor('https://order.doordash.com/x') === 'DoorDash')
check('brand names are spelled the way owners know them', aggregatorFor('https://ubereats.com/x') === 'Uber Eats')
check('one company never gets two spellings', aggregatorFor('https://order.online/x') === aggregatorFor('https://doordash.com/x'))
check('an own-site url is not an aggregator', aggregatorFor('https://shopyellowbee.com/order') === null)

const clean = diagnoseOrderLinks([
  { uri: 'https://shopyellowbee.com/order', placeActionType: 'FOOD_ORDERING', providerType: 'MERCHANT', isEditable: true },
  { uri: 'https://shopyellowbee.com/book', placeActionType: 'DINING_RESERVATION', providerType: 'MERCHANT', isEditable: true },
])
check('a healthy listing is not told it has a problem', clean.ourLinksGoingToApps.length === 0)
check('healthy listing still reports its 2 empty slots', clean.emptySlots.length === 2)
check('whatWeNeed on a fully-set listing blocks with an honest reason', (() => {
  const done = diagnoseOrderLinks([
    { uri: 'https://shopyellowbee.com/order', placeActionType: 'FOOD_ORDERING', providerType: 'MERCHANT', isEditable: true },
    { uri: 'https://shopyellowbee.com/book', placeActionType: 'DINING_RESERVATION', providerType: 'MERCHANT', isEditable: true },
    { uri: 'https://shopyellowbee.com/order', placeActionType: 'FOOD_TAKEOUT', providerType: 'MERCHANT', isEditable: true },
    { uri: 'https://shopyellowbee.com/order', placeActionType: 'FOOD_DELIVERY', providerType: 'MERCHANT', isEditable: true },
  ])
  const w = whatWeNeed(done, true)
  return w.blocked === true && (w.reason ?? '').includes('already point')
})())

console.log('\n== copy rules ==')
const allCopy = [yb.headline, blocked.reason ?? '', ...ready.asks.map((a) => a.why)]
check('no em dashes in owner-facing copy', allCopy.every((s) => !s.includes('—')))
check('no jargon leaks (AGGREGATOR_3P, isEditable, placeActionType)', allCopy.every((s) => !/AGGREGATOR|isEditable|placeAction/i.test(s)))

console.log('\n' + '='.repeat(52))
console.log(fail === 0
  ? `RESULT: order-link diagnosis is honest and counted (${pass} checks).`
  : `RESULT: ${fail} checks failed.`)
process.exit(fail === 0 ? 0 : 1)
