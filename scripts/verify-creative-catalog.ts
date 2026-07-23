/**
 * verify-creative-catalog — checks the standard creative product menu and the path a creator (or
 * the seeder) takes from a product to a publishable package. No I/O.
 *
 * Two things under test: the menu is well-formed (real crafts, unique ids, every product actually
 * describes something), and packageFromProduct produces a package that, once the creator sets
 * prices, validates and round-trips losslessly. This is the contract that keeps "pick a product,
 * set your price" honest: what Apnosh defines is fixed, what the creator owns is the price.
 *
 * Run: node_modules/.bin/tsx scripts/verify-creative-catalog.ts
 */

import {
  CREATIVE_PRODUCTS, CREATIVE_CRAFTS, productById, productsForCraft, packageFromProduct, isRecurring,
  bookingShapeForCategory,
} from '../src/lib/marketplace/creative-catalog'
import {
  PACKAGE_CATEGORIES, validatePackage, packageToRow, rowToPackage, startingPriceCents,
  type CreatorPackage,
} from '../src/lib/marketplace/package'

let pass = 0, fail = 0
function ok(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  PASS  ${label}`) }
  else { fail++; console.log(`  FAIL  ${label}`) }
}
function section(t: string) { console.log(`\n== ${t} ==`) }

/* ── the menu is well-formed ─────────────────────────────────────── */

section('every product is real and describes something')
{
  const ids = CREATIVE_PRODUCTS.map((p) => p.id)
  ok('product ids are unique', new Set(ids).size === ids.length)
  ok('every craft is a valid category', CREATIVE_PRODUCTS.every((p) => (PACKAGE_CATEGORIES as readonly string[]).includes(p.craft)))
  ok('every craft is one of the five creative crafts', CREATIVE_PRODUCTS.every((p) => CREATIVE_CRAFTS.includes(p.craft)))
  ok('every product has a name and a summary', CREATIVE_PRODUCTS.every((p) => p.name.trim().length > 0 && p.summary.trim().length > 0))
  ok('every craft has at least one product', CREATIVE_CRAFTS.every((c) => productsForCraft(c).length > 0))
}

section('a product is either tiered or single-price, and never empty either way')
{
  ok('tiered products give every level a name and scope', CREATIVE_PRODUCTS.every((p) =>
    p.tiers.every((t) => t.name.trim().length > 0 && t.scope.filter((s) => s.trim()).length > 0)))
  ok('single-price products list what the buyer gets', CREATIVE_PRODUCTS.every((p) =>
    p.tiers.length > 0 || p.deliverables.filter((d) => d.trim()).length > 0))
  ok('tiered products carry an empty single-price list', CREATIVE_PRODUCTS.every((p) => p.tiers.length === 0 || p.deliverables.length === 0))
  ok('recurring products are marked subscription', CREATIVE_PRODUCTS.every((p) => isRecurring(p) === (p.listingType === 'subscription')))
}

section('every product knows how it books, and what to ask')
{
  const SHAPES = ['scheduled', 'async', 'recurring']
  ok('every product has a valid booking shape', CREATIVE_PRODUCTS.every((p) => SHAPES.includes(p.bookingShape)))
  ok('subscriptions book as recurring', CREATIVE_PRODUCTS.every((p) => p.listingType !== 'subscription' || p.bookingShape === 'recurring'))
  ok('design work books as async (no visit)', CREATIVE_PRODUCTS.filter((p) => p.craft === 'graphic_designer').every((p) => p.bookingShape === 'async'))
  ok('shoots and visits book as scheduled', ['dish-photo-day', 'reel-pack', 'tasting-post'].every((id) => productById(id)?.bookingShape === 'scheduled'))
  ok('every product asks 2-4 intake questions', CREATIVE_PRODUCTS.every((p) => p.intake.length >= 2 && p.intake.length <= 4))
  ok('every question has an id and a label', CREATIVE_PRODUCTS.every((p) => p.intake.every((q) => q.id.trim() && q.label.trim())))
  ok('intake ids are unique within a product', CREATIVE_PRODUCTS.every((p) => new Set(p.intake.map((q) => q.id)).size === p.intake.length))
  ok('the craft fallback matches the products', productById('menu-redesign')?.bookingShape === bookingShapeForCategory('graphic_designer'))
}

section('lookups behave')
{
  ok('productById finds a known product', productById('dish-photo-day')?.name === 'Dish Photo Day')
  ok('productById is null for junk', productById('nope') === null && productById(null) === null)
  ok('productsForCraft only returns that craft', productsForCraft('photographer').every((p) => p.craft === 'photographer'))
}

/* ── the creator path: seed → price → publish ────────────────────── */

/** Seed from a product, then set a price for every level (or the base), the one thing a creator owns. */
function priced(productId: string, dollars: number): CreatorPackage {
  const product = productById(productId)!
  const p = packageFromProduct(product)
  p.active = true
  if (p.tiers.length) p.tiers = p.tiers.map((t, i) => ({ ...t, priceCents: (dollars + i * 100) * 100 }))
  else p.priceCents = dollars * 100
  return p
}

section('a seeded package carries what Apnosh defines and leaves price to the creator')
{
  const seed = packageFromProduct(productById('reel-pack')!)
  ok('the craft comes from the product', seed.category === 'videographer')
  ok('the product id is stamped', seed.productId === 'reel-pack')
  ok('levels are seeded with scope but no price', seed.tiers.length === 3 && seed.tiers.every((t) => t.priceCents === 0 && t.deliverables.length > 0))
  ok('a fresh seed is not publishable until priced', validatePackage(seed).some((e) => /price above zero/i.test(e)))
  ok('suggested add-ons are not pre-filled', seed.options.length === 0)
}

section('once priced, every standard product produces a publishable package')
{
  for (const product of CREATIVE_PRODUCTS) {
    const p = priced(product.id, 300)
    const errs = validatePackage(p)
    ok(`${product.id} validates once priced`, errs.length === 0)
  }
}

section('a single-price product seeds its deliverables and prices cleanly')
{
  const p = priced('brand-photo-day', 700) // a tier-less product
  ok('no levels', p.tiers.length === 0)
  ok('deliverables came from the product', p.deliverables.length > 0)
  ok('the base price is set', startingPriceCents(p) === 70000)
  ok('it validates', validatePackage(p).length === 0)
}

section('the seeded package round-trips losslessly')
{
  const p = priced('monthly-social', 400)
  const back = rowToPackage(packageToRow(p, 'v1'))
  ok('it is still a subscription', back.listingType === 'subscription')
  ok('the product id survives', back.productId === 'monthly-social')
  ok('every level survives with its price', back.tiers.length === p.tiers.length && back.tiers[0].priceCents === 40000)
  ok('the row starts at the cheapest level', packageToRow(p, 'v1').price_cents === 40000)
}

console.log(`\n${'='.repeat(52)}`)
console.log(fail === 0
  ? `RESULT: the creative menu is well-formed and every product produces a publishable package (${pass} checks).`
  : `RESULT: ${fail} FAILED of ${pass + fail}.`)
process.exit(fail === 0 ? 0 : 1)
