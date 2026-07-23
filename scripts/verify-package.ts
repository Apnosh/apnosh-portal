/**
 * verify-package — checks the creator-package model against realistic inputs, no I/O.
 *
 * This is the contract the seller editor and the public storefront both depend on, so the two
 * things under test are: validation refuses a package that would mislead a buyer (no price,
 * empty deliverables, a broken add-on), and the row round-trip is lossless so nothing a creator
 * types is silently dropped between the form and the storefront.
 *
 * Run: node_modules/.bin/tsx scripts/verify-package.ts
 */

import {
  validatePackage, packageToRow, rowToPackage, slugify,
  startingPriceCents, maxPriceCents, formatCents, emptyPackage,
  type CreatorPackage,
} from '../src/lib/marketplace/package'

let pass = 0, fail = 0
function ok(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  PASS  ${label}`) }
  else { fail++; console.log(`  FAIL  ${label}`) }
}
function section(t: string) { console.log(`\n== ${t} ==`) }

function pkg(over: Partial<CreatorPackage> = {}): CreatorPackage {
  return {
    slug: '', title: 'Signature Reel Pack', category: 'videographer', listingType: 'one_off',
    description: 'Three short reels shot and edited at your restaurant.',
    priceCents: 45000, billingPeriod: 'one_time',
    deliverables: ['3 vertical reels', '1 hero cut for ads'],
    options: [{ id: 'o1', label: 'Extra reel', priceDeltaCents: 12000 }],
    turnaroundDays: 10, revisions: 2, active: true, ...over,
  }
}

/* ── validation refuses what would mislead a buyer ───────────────── */

section('a complete package is valid')
{
  ok('the happy path passes', validatePackage(pkg()).length === 0)
}

section('the price rules hold')
{
  ok('a priced package with no price is refused', validatePackage(pkg({ priceCents: null })).some((e) => /price above zero/i.test(e)))
  ok('a zero price is refused', validatePackage(pkg({ priceCents: 0 })).some((e) => /price above zero/i.test(e)))
  ok('a quote package must leave price blank', validatePackage(pkg({ listingType: 'quote', priceCents: 45000 })).some((e) => /no set price/i.test(e)))
  ok('a quote package with a blank price is fine', validatePackage(pkg({ listingType: 'quote', priceCents: null })).length === 0)
  ok('a subscription needs a billing period', validatePackage(pkg({ listingType: 'subscription', billingPeriod: 'one_time' })).some((e) => /monthly or annual/i.test(e)))
  ok('a monthly subscription is fine', validatePackage(pkg({ listingType: 'subscription', billingPeriod: 'monthly' })).length === 0)
}

section('a package must actually describe something')
{
  ok('no name is refused', validatePackage(pkg({ title: '  ' })).some((e) => /name/i.test(e)))
  ok('no description is refused', validatePackage(pkg({ description: '' })).some((e) => /what this package is/i.test(e)))
  ok('no deliverables is refused', validatePackage(pkg({ deliverables: [] })).some((e) => /at least one thing/i.test(e)))
}

section('add-ons are checked, since a buyer can pay for them')
{
  ok('an unnamed add-on is refused', validatePackage(pkg({ options: [{ id: 'o', label: ' ', priceDeltaCents: 100 }] })).some((e) => /add-on 1 needs a name/i.test(e)))
  ok('a negative add-on price is refused', validatePackage(pkg({ options: [{ id: 'o', label: 'Rush', priceDeltaCents: -5 }] })).some((e) => /zero or more/i.test(e)))
  ok('a free add-on is allowed', validatePackage(pkg({ options: [{ id: 'o', label: 'Captions', priceDeltaCents: 0 }] })).length === 0)
}

/* ── the row round-trip is lossless ──────────────────────────────── */

section('packageToRow then rowToPackage loses nothing')
{
  const p = pkg({ id: 'p1' })
  const back = rowToPackage(packageToRow(p, 'v1'))
  ok('title survives', back.title === p.title)
  ok('price survives', back.priceCents === p.priceCents)
  ok('category survives', back.category === p.category)
  ok('deliverables survive', back.deliverables.join('|') === p.deliverables.join('|'))
  ok('options survive with their prices', back.options[0].label === 'Extra reel' && back.options[0].priceDeltaCents === 12000)
  ok('turnaround and revisions survive', back.turnaroundDays === 10 && back.revisions === 2)
}

section('the row is written the way the buyer side expects')
{
  const row = packageToRow(pkg(), 'v1')
  ok('a one-off is billed one_time', row.billing_period === 'one_time')
  ok('a subscription keeps its period', packageToRow(pkg({ listingType: 'subscription', billingPeriod: 'monthly' }), 'v1').billing_period === 'monthly')
  ok('a quote writes a null price', packageToRow(pkg({ listingType: 'quote', priceCents: null }), 'v1').price_cents === null)
  ok('the vendor id is stamped', row.vendor_id === 'v1')
  ok('a slug is derived when blank', row.slug === 'signature-reel-pack')
}

section('reading a hand-written or legacy row never throws')
{
  const messy = rowToPackage({ slug: 's', title: 'Old', category: 'nonsense', listing_type: 'weird', description: null, price_cents: 'oops' as never, billing_period: 'x', details: { options: [{ label: 'ok', priceDeltaCents: 500 }, null, 'junk'] } })
  ok('an unknown category falls back to other', messy.category === 'other')
  ok('an unknown type falls back to one_off', messy.listingType === 'one_off')
  ok('a bad price becomes null, not NaN', messy.priceCents === null)
  ok('a null description becomes empty', messy.description === '')
  ok('only well-formed options survive', messy.options.length === 1 && messy.options[0].label === 'ok')
}

/* ── the numbers a buyer sees ─────────────────────────────────────── */

section('pricing is honest: base is the floor, options only add')
{
  const p = pkg({ priceCents: 45000, options: [{ id: 'o', label: 'Extra', priceDeltaCents: 12000 }] })
  ok('starting price is the base', startingPriceCents(p) === 45000)
  ok('max price is base plus every option', maxPriceCents(p) === 57000)
  ok('a quote has no starting price', startingPriceCents({ priceCents: null }) === null)
}

section('money formats cleanly')
{
  ok('whole dollars have no cents', formatCents(45000) === '$450')
  ok('thousands get a comma', formatCents(129900) === '$1,299')
  ok('odd cents show two places', formatCents(45050) === '$450.50')
  ok('null is a quote', formatCents(null) === 'Quote')
}

section('helpers behave')
{
  ok('slugify is url-safe', slugify('My Best  Reels!! 2026') === 'my-best-reels-2026')
  ok('slugify never returns empty', slugify('!!!') === 'package')
  ok('an empty package is not published by default', emptyPackage().active === false)
}

console.log(`\n${'='.repeat(52)}`)
console.log(fail === 0
  ? `RESULT: the creator-package model is lossless and refuses what would mislead a buyer (${pass} checks).`
  : `RESULT: ${fail} FAILED of ${pass + fail}.`)
process.exit(fail === 0 ? 0 : 1)
