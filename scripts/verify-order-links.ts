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
  providerFor, findOrderingLinks, proposeFor,
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
check('the 2 marketplace links are flagged as the leak', yb.ourLinksGoingToApps.every((l) => l.goesTo === 'DoorDash'))
// order.online is DoorDash STOREFRONT, a white-label page that belongs to whoever pays
// for it. We cannot tell from the url whether this client subscribes or whether Google
// injected it, so it is reported as needing a human answer, never guessed either way.
check('the 2 order.online links are flagged for an owner check', yb.needsOwnerCheck.length === 2, `got ${yb.needsOwnerCheck.length}`)
check('the other 2 locked links are plain DoorDash marketplace', yb.locked.filter((l) => l.goesTo === 'DoorDash').length === 2)
check('and are NOT silently called a marketplace leak', yb.ourLinksGoingToApps.length === 2)
check('headline names DoorDash and admits the doubt', yb.headline === 'Every ordering button on your Google listing is run by DoorDash, and some of them may not be yours.', yb.headline)
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
check('the marketplace and the white-label product are told apart', aggregatorFor('https://order.online/x') === null && aggregatorFor('https://doordash.com/x') === 'DoorDash')
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

console.log('\n== marketplace vs your own storefront ==')
// The bug this section exists to prevent: v1 lumped Toast and OpenTable in with DoorDash
// and refused them, which rejects the most common CORRECT answer for these buttons.
check('DoorDash is a marketplace', providerFor('https://doordash.com/store/x')?.kind === 'marketplace')
check('Uber Eats is a marketplace', providerFor('https://ubereats.com/x')?.kind === 'marketplace')
check('Toast is the restaurant\'s own storefront', providerFor('https://mysite.toasttab.com/order')?.kind === 'storefront')
check('Chowbus is a storefront (Shinya really uses it)', providerFor('https://pos.chowbus.com/online-ordering/store/Shinya-Shokudo-Tukwila/15207')?.kind === 'storefront')
check('Square is a storefront', providerFor('https://mysite.square.site/order')?.kind === 'storefront')
check('OpenTable is booking', providerFor('https://opentable.com/r/x')?.kind === 'booking')
check('Resy is booking', providerFor('https://resy.com/cities/sea/x')?.kind === 'booking')
check('Yelp RESERVATIONS is booking', providerFor('https://www.yelp.com/reservations/shinya-shokudo-tukwila')?.kind === 'booking')
check('a plain Yelp listing page is not ordering', providerFor('https://www.yelp.com/biz/shinya-shokudo') === null)
check('order.online is DoorDash STOREFRONT, not the marketplace', providerFor('https://order.online/store/-30932248/')?.kind === 'storefront')
check('aggregatorFor only flags real marketplaces', aggregatorFor('https://mysite.toasttab.com/order') === null && aggregatorFor('https://doordash.com/x') === 'DoorDash')

console.log('\n== the validator accepts the right answers now ==')
check('accepts a Toast ordering link', validateOwnUrl('https://mysite.toasttab.com/order').ok === true)
check('accepts Shinya\'s real Chowbus link', validateOwnUrl('https://pos.chowbus.com/online-ordering/store/Shinya-Shokudo-Tukwila/15207').ok === true)
check('accepts an OpenTable booking link', validateOwnUrl('https://opentable.com/r/my-place').ok === true)
check('accepts Yelp Reservations', validateOwnUrl('https://www.yelp.com/reservations/shinya-shokudo-tukwila').ok === true)
check('still refuses the DoorDash marketplace', validateOwnUrl('https://doordash.com/store/x').ok === false)
check('and says why, in money terms', (validateOwnUrl('https://ubereats.com/x') as { error: string }).error.includes('take a cut'))

console.log('\n== finding the link on their own site ==')
// Trimmed from the real shinyashokudotukwila.com markup.
const SHINYA_HTML = `
  <a href="https://www.yelp.com/reservations/shinya-shokudo-tukwila?source=yelp_biz&date=2025-12-09">Reservations</a>
  <a href="https://pos.chowbus.com/online-ordering/store/Shinya-Shokudo-Tukwila/15207">Order Online</a>
  <a href="/menu">Menu</a>
  <a href="https://www.instagram.com/shinya">Instagram</a>
`
const shinya = findOrderingLinks(SHINYA_HTML, 'https://www.shinyashokudotukwila.com/')
check('finds the Chowbus ordering link', shinya.some((f) => f.provider === 'Chowbus'))
check('finds the Yelp Reservations link', shinya.some((f) => f.provider === 'Yelp Reservations'))
check('ignores Instagram', !shinya.some((f) => f.url.includes('instagram')))
check('proposes Chowbus for Order online', proposeFor('FOOD_ORDERING', shinya)?.provider === 'Chowbus')
check('proposes Yelp Reservations for Reserve', proposeFor('DINING_RESERVATION', shinya)?.provider === 'Yelp Reservations')
check('every proposal explains itself', shinya.every((f) => f.because.length > 0))
check('storefront ranks above a bare menu path', shinya[0].kind === 'storefront')

// Yellow Bee: menu pages, no ordering anywhere.
const YB_HTML = `<a href="/menu/">Menu</a><a href="/menu/#drinks-menu">Drinks</a><a href="https://www.instagram.com/shopyellowbee/">IG</a>`
const ybFound = findOrderingLinks(YB_HTML, 'https://www.shopyellowbee.com/')
check('Yellow Bee: nothing proposed for ordering', proposeFor('FOOD_ORDERING', ybFound) === null)
check('Yellow Bee: nothing proposed for booking', proposeFor('DINING_RESERVATION', ybFound) === null)

// A site that only sends people to DoorDash must never be proposed as "your own".
const LEAK_HTML = `<a href="https://www.doordash.com/store/x/">Order Now</a>`
const leak = findOrderingLinks(LEAK_HTML, 'https://example.com/')
check('a marketplace link is still surfaced', leak.some((f) => f.kind === 'marketplace'))
check('but never proposed as your own ordering', proposeFor('FOOD_ORDERING', leak) === null)
check('and it is named as taking a cut', leak[0].because.includes('take a cut'))

console.log('\n== crawl edge cases ==')
check('junk html returns nothing, never throws', findOrderingLinks('<<<>>>', 'https://example.com').length === 0)
check('a bad site url returns nothing', findOrderingLinks('<a href="/order">x</a>', 'not a url').length === 0)
check('mailto and tel are skipped', findOrderingLinks('<a href="mailto:a@b.com">e</a><a href="tel:123">t</a>', 'https://example.com').length === 0)
check('another domain we do not know is not evidence', findOrderingLinks('<a href="https://random.com/order">x</a>', 'https://example.com').length === 0)
check('utm noise collapses duplicates', findOrderingLinks('<a href="/order?utm_source=a">1</a><a href="/order?utm_source=b">2</a>', 'https://example.com').length === 1)

console.log('\n' + '='.repeat(52))
console.log(fail === 0
  ? `RESULT: order-link diagnosis is honest and counted (${pass} checks).`
  : `RESULT: ${fail} checks failed.`)
process.exit(fail === 0 ? 0 : 1)
