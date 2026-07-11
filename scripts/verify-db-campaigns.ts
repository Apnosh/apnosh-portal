/* Phase C2 harness: admin-created DB campaigns. Injects ONE fake catalog_campaigns row
 * (in-memory — no DB read or write) through the real merge (rowToDbCampaign) + runtime
 * registration (registerDbCampaigns), then asserts:
 *   1. composing its services-only plan yields NAMED, PRICED line items identical in
 *      shape to composing the built-in services-only card 'listings';
 *   2. the derived what-you-get / requirements / price label are non-empty and REAL
 *      (traceable to the priced catalog / turnaround map, never authored);
 *   3. unknown-id lookups (whyFor, campaignContent, pdpCopy, requirementsFor,
 *      whatYouGet, priceLabel, composePlanForGoal) never throw;
 *   4. guardrails hold: built-in ids can't be shadowed, junk service ids are dropped,
 *      a campaign with no real service never registers.
 * Exits non-zero on any failure. Run: node_modules/.bin/tsx scripts/verify-db-campaigns.ts */

import { rowToDbCampaign, type CatalogCampaignRow } from '../src/lib/campaigns/catalog-campaigns-server'
import { registerDbCampaigns, priceForServices, priceLabelForServices, isBuiltinCampaignId } from '../src/lib/campaigns/data/db-campaigns'
import { composePlanForGoal, shapeFor } from '../src/lib/campaigns/builder/compose-plan'
import { draftFromBuilder } from '../src/lib/campaigns/builder/adapter'
import { whatYouGet, whatYouGetForServices } from '../src/lib/campaigns/builder/what-you-get'
import { requirementsFor, requirementsForServices } from '../src/lib/campaigns/data/campaign-requirements'
import { campaignContent, pdpCopy } from '../src/lib/campaigns/data/campaign-content'
import { whyFor } from '../src/lib/campaigns/data/why-for'
import { ITEM_PRICES, priceLabel } from '../src/lib/campaigns/builder/item-prices'
import { serviceById, plainNameOf } from '../src/lib/campaigns/catalog'
import { PRICED_CATALOG } from '../src/lib/campaigns/data/priced-catalog'
import type { LineItem } from '../src/lib/campaigns/types'

let fail = 0
const ok = (cond: boolean, msg: string) => { console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fail++ }

/* The fake row — exactly what PostgREST would hand the merge for a live admin campaign:
 * two real services (one with a setup gate + monthly price, one recurring) + one junk id
 * that MUST be dropped, plus one real recurring add-on. */
const FAKE_ROW: CatalogCampaignRow = {
  id: 'get-on-the-blogs',
  title: 'Get on the food blogs',
  tagline: 'Local writers and neighbors hear about you',
  description: 'A push to get your restaurant written about and talked about nearby.',
  promise: 'Get written about where neighbors read.',
  why: 'A local write-up reaches people no ad can.',
  expectation: 'Coverage lands slowly, one story at a time.',
  hero_image: null,
  best_for: 'Spots with a story to tell',
  faq: [{ q: 'Do you write the pitch?', a: 'Yes. You approve it first.' }],
  type: 'plan',
  cad: 'recurring',
  stages: ['aware', 'interest'],
  shelf: 'aware',
  service_ids: ['pr-media', 'nextdoor-local', 'site-menu', 'not-a-real-service'],
  addon_service_ids: ['gbp-posts'],
  status: 'live',
}

console.log('\n== 0) merge: raw row -> DbCampaign (validation + coercion) ==')
const c = rowToDbCampaign(FAKE_ROW)
ok(!!c, 'the fake row coerces to a DbCampaign')
if (!c) { console.log('cannot continue'); process.exit(1) }
ok(c.serviceIds.length === 3 && c.serviceIds.every((id) => !!serviceById(id)), `junk service id dropped, real ones kept (${c.serviceIds.join(', ')})`)
ok(c.addonServiceIds.join(',') === 'gbp-posts', 'the recurring add-on survives')
ok(rowToDbCampaign({ ...FAKE_ROW, id: 'listings' }) === null, 'a built-in-colliding id is rejected by the merge')
ok(rowToDbCampaign({ ...FAKE_ROW, id: 'Bad Slug!' }) === null, 'a malformed slug is rejected by the merge')
ok(rowToDbCampaign({ ...FAKE_ROW, service_ids: ['not-a-real-service'] }) === null, 'a campaign with no real service is dropped entirely')

console.log('\n== 1) registration wires the runtime registries ==')
const registered = registerDbCampaigns([c])
ok(registered.length === 1 && registered[0].id === c.id, 'registerDbCampaigns registers the fake campaign')
const shape = shapeFor(c.id)
ok(!!shape && shape.kind === 'setup' && shape.seed.length === 0 && (shape.services ?? []).join(',') === c.serviceIds.join(','), 'the registered shape is services-only (empty seed, never funnel-grown)')
const content = campaignContent(c.id)
ok(!!content && content.title === c.title && content.promise === c.promise, 'campaignContent resolves the DB record')
ok(!!pdpCopy(c.id) && pdpCopy(c.id)!.why === c.why, 'pdpCopy resolves for the DB id')
ok(!!ITEM_PRICES[c.id], 'ITEM_PRICES carries the DB campaign after registration')
// Built-ins can't be shadowed even if someone forces a colliding entry past the merge.
const before = shapeFor('listings')
registerDbCampaigns([{ ...c, id: 'listings' }])
ok(shapeFor('listings') === before, 'a colliding registration can never shadow a built-in shape')

console.log('\n== 2) compose parity: DB campaign vs the built-in services-only card (listings) ==')
const dbPlan = composePlanForGoal(c.id, {})
ok(dbPlan.tpl.name === c.title, `composed plan is NAMED by the admin title ("${dbPlan.tpl.name}")`)
ok((dbPlan.tpl.contentPlan?.length ?? 0) === 0, 'no content beats are invented (services-only)')
ok((dbPlan.serviceIds ?? []).join(',') === c.serviceIds.join(','), 'composePlanForGoal returns exactly the picked serviceIds')

const dbDraft = draftFromBuilder({ itemId: c.id, status: 'approve', vals: {} })
const refDraft = draftFromBuilder({ itemId: 'listings', status: 'approve', vals: {} })
const lineShape = (li: LineItem) => Object.keys(li).sort().join(',')
ok(dbDraft.items.length > 0, `the DB draft carries real line items (${dbDraft.items.length})`)
ok(dbDraft.items.every((li) => !!li.name && !!li.plain && typeof li.price === 'number' && !!li.cadence && !!li.serviceId), 'every line is named + priced + cadenced + service-tagged')
ok(refDraft.items.length > 0 && lineShape(dbDraft.items[0]) === lineShape(refDraft.items[0]), 'line-item shape is IDENTICAL to a listings line (same svcLines rail)')
ok(dbDraft.items.every((li) => !!serviceById(li.serviceId!)), 'every line resolves to a real priced-catalog service')
// Money honesty: every line price equals a real price point of its service.
const priceReal = dbDraft.items.every((li) => serviceById(li.serviceId!)!.prices.some((p) => p.amount === li.price))
ok(priceReal, 'every line price is a real catalog price point (nothing invented)')
ok(dbDraft.path === refDraft.path && dbDraft.phase === refDraft.phase && dbDraft.id === refDraft.id, `save/ship inputs match listings (path=${dbDraft.path}, phase=${dbDraft.phase}, id=${dbDraft.id})`)
// The add-on option rail: toggling the PDP add-on adds its real priced lines.
const withOpt = draftFromBuilder({ itemId: c.id, status: 'approve', vals: { options: 'gbp-posts' } })
ok(withOpt.items.some((li) => li.serviceId === 'gbp-posts'), 'a toggled add-on rides in as a real priced line (spec.options rail)')

console.log('\n== 3) derived page facts are non-empty and real ==')
const rows = whatYouGet(c.id, {}).flatMap((s) => s.rows)
ok(rows.length > 0, `what-you-get derives ${rows.length} rows`)
const realNames = c.serviceIds.map((id) => plainNameOf(serviceById(id)!))
ok(rows.every((r) => realNames.includes(r)), 'every what-you-get row is a real service plain name (nothing authored)')
ok(JSON.stringify(whatYouGetForServices(c.serviceIds)) === JSON.stringify(rows), 'the admin PREVIEW derivation matches the live page derivation byte-for-byte')
const reqs = requirementsFor(c.id)
ok(reqs.length > 0, `requirements derive from the services' turnaround gates (${JSON.stringify(reqs)})`)
ok(JSON.stringify(requirementsForServices(c.serviceIds)) === JSON.stringify(reqs), 'the admin PREVIEW requirements match the live derivation')
const p = ITEM_PRICES[c.id]
const pv = priceForServices(c.serviceIds)
ok(p.oneTime === pv.oneTime && p.perMonth === pv.perMonth, `store price == preview price (one-time $${p.oneTime}, $${p.perMonth}/mo)`)
const label = priceLabel(c.id)
ok(!!label && label === priceLabelForServices(c.serviceIds), `price label is non-empty and identical in both rails ("${label}")`)
// Real: the composed bill equals the same services' summed price points.
const billTotal = dbDraft.items.reduce((s, li) => s + li.price, 0)
const svcTotal = c.serviceIds.flatMap((id) => serviceById(id)!.prices).reduce((s, pp) => s + pp.amount, 0)
ok(billTotal === svcTotal, `the composed bill equals the services' real price points ($${billTotal})`)

console.log('\n== 4) unknown-id lookups never throw ==')
const UNKNOWN = 'totally-unknown-id'
let threw = false
let whyOut: unknown, contentOut: unknown, reqOut: unknown, wygCount = -1, labelOut: unknown
try {
  whyOut = whyFor(UNKNOWN, { views30d: 1200, rating: 4.4, ratingCount: 180 })
  contentOut = campaignContent(UNKNOWN)
  reqOut = requirementsFor(UNKNOWN)
  wygCount = whatYouGet(UNKNOWN, {}).flatMap((s) => s.rows).length
  labelOut = priceLabel(UNKNOWN)
  composePlanForGoal(UNKNOWN, {})
  pdpCopy(UNKNOWN)
} catch { threw = true }
ok(!threw, 'whyFor / campaignContent / pdpCopy / requirementsFor / whatYouGet / priceLabel / composePlanForGoal all run on an unknown id')
ok(whyOut === null, 'whyFor(unknown) -> null (falls back to the authored why)')
ok(contentOut === null, 'campaignContent(unknown) -> null')
ok(Array.isArray(reqOut) && (reqOut as string[]).length === 0, 'requirementsFor(unknown) -> []')
ok(labelOut === null, 'priceLabel(unknown) -> null')
ok(wygCount === 0 || wygCount > 0, 'whatYouGet(unknown) returns a well-formed (possibly empty) section list')
ok(!isBuiltinCampaignId(UNKNOWN) && isBuiltinCampaignId('listings') && isBuiltinCampaignId('deal') && isBuiltinCampaignId('featured'), 'the built-in collision set covers catalog + composer + pseudo ids')
ok(PRICED_CATALOG.length > 0, 'the priced catalog is loaded (sanity)')

console.log('\n' + '='.repeat(52))
if (fail) { console.log(`RESULT: ${fail} checks failed — DB campaigns are not wired safely.`); process.exit(1) }
console.log('RESULT: DB campaigns merge, register, compose, price, and derive exactly like a built-in services-only card.')
