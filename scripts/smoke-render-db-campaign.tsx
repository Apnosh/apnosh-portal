/* Phase C2 render smoke (renderToString, like C1's): proves a fake DB campaign
 * (in-memory — no DB) renders in the real owner store JSX:
 *   1. BROWSE: its card appears on its chosen shelf (and only there), searchable state
 *      aside, with its real derived price tag;
 *   2. PDP: the uniform product page renders every section for it — description,
 *      promise headline, the quiet "The Apnosh team does this for you." line (no
 *      version tabs), When you'll have it, What we'll need from you, What you get
 *      (real service names), Add ons (the real add-on), the hero photo, and the
 *      real derived total in the buy footer.
 * Run: node_modules/.bin/tsx scripts/smoke-render-db-campaign.tsx */

import React from 'react'
import { renderToString } from 'react-dom/server'
import ApnoshCampaign from '../src/components/mvp/campaign-builder/apnosh-campaign'
import { registerDbCampaigns, priceForServices, type DbCampaign } from '../src/lib/campaigns/data/db-campaigns'

let fail = 0
const ok = (cond: boolean, msg: string) => { console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fail++ }

const FAKE: DbCampaign = {
  id: 'get-on-the-blogs',
  title: 'Get on the food blogs',
  tagline: 'Local writers and neighbors hear about you',
  description: 'A push to get your restaurant written about and talked about nearby.',
  promise: 'Get written about where neighbors read.',
  why: 'A local write-up reaches people no ad can.',
  expectation: 'Coverage lands slowly, one story at a time.',
  heroImage: 'https://example.com/fake-hero.jpg',
  type: 'plan',
  cad: 'recurring',
  shelf: 'orders', // deliberately NOT the default, to prove shelf placement is honored
  stages: ['aware', 'interest'],
  serviceIds: ['pr-media', 'nextdoor-local', 'site-menu'],
  addonServiceIds: ['gbp-posts'],
  status: 'live',
}

// The wrapper's registration step (builder-entry does this on fetch).
const registered = registerDbCampaigns([FAKE])
ok(registered.length === 1, 'the fake DB campaign registers')
const price = priceForServices(FAKE.serviceIds)

const Any = ApnoshCampaign as unknown as React.ComponentType<Record<string, unknown>>

console.log('\n== 1) BROWSE: the card appears on its chosen shelf ==')
const browse = renderToString(React.createElement(Any, { restaurant: 'Smoke Test Cafe', dbCampaigns: [FAKE] }))
ok(browse.includes('Get on the food blogs'), 'card title renders in the store browse')
ok(browse.includes('Local writers and neighbors hear about you'), 'card tagline renders')
// Shelf proof: the card markup sits after the "Fill your seats" (orders) row header and
// before the next row header ("Bring guests back"), i.e. inside its chosen shelf row.
const ordersIdx = browse.indexOf('Fill your seats')
const nextRowIdx = browse.indexOf('Bring guests back')
const cardIdx = browse.indexOf('Get on the food blogs')
ok(ordersIdx >= 0 && nextRowIdx > ordersIdx, 'the orders + retention shelf headers render')
ok(cardIdx > ordersIdx && cardIdx < nextRowIdx, 'the DB card sits INSIDE its chosen shelf row (orders), not elsewhere')
ok(browse.indexOf('Get on the food blogs', cardIdx + 1) === -1, 'the card appears exactly once (one shelf)')
ok(browse.includes(`$${price.oneTime.toLocaleString()}`) && browse.includes(`$${price.perMonth.toLocaleString()}/mo`), `the card price tags carry the real derived price (Setup $${price.oneTime} + $${price.perMonth}/mo)`)
ok(browse.includes('Awareness') && browse.includes('Interest'), 'its funnel-stage tags render in Home words')

console.log('\n== 2) PDP: the uniform product page renders every section ==')
const pdp = renderToString(React.createElement(Any, { restaurant: 'Smoke Test Cafe', dbCampaigns: [FAKE], initialItem: 'get-on-the-blogs' }))
ok(pdp.includes('Get written about where neighbors read.'), 'promise renders as the hero headline')
ok(pdp.includes('A push to get your restaurant written about'), 'authored description renders as the sell paragraph')
ok(pdp.includes('A local write-up reaches people no ad can.'), 'authored why renders (whyFor has no signal -> fallback why)')
ok(pdp.includes('https://example.com/fake-hero.jpg'), 'the uploaded hero image renders as the product shot')
ok(pdp.includes('The Apnosh team does this for you.'), 'no version tabs: the quiet team line renders')
ok(!pdp.includes('Choose how it&#x27;s done') && !pdp.includes("Choose how it's done"), 'the versioned picker never renders for a DB campaign')
ok(pdp.includes('When you&#x27;ll have it') || pdp.includes("When you'll have it"), 'the timeline section renders')
ok(pdp.includes('What we&#x27;ll need from you') || pdp.includes("What we'll need from you"), 'the requirements section renders')
ok(pdp.includes('Send us your current menu'), 'a REAL derived requirement renders (site-menu ask)')
ok(pdp.includes('What you get'), 'the what-you-get section renders')
ok(pdp.includes('Get in the news') && pdp.includes('Show up for neighbors') && pdp.includes('Fix your site &amp; menu'), 'what-you-get rows are the real service plain names')
ok(pdp.includes('Add ons'), 'the add-ons section renders (a real add-on exists)')
ok(pdp.includes('Keep Google fresh'), 'the add-on renders by its real plain name (gbp-posts)')
const total = `$${price.oneTime.toLocaleString()} + $${price.perMonth.toLocaleString()}/mo`
ok(pdp.includes(total), `the buy footer total is the real derived price (${total})`)
ok(pdp.includes('Buy now instead'), 'the buy path CTA renders')
ok(pdp.includes('starts within') || pdp.includes('The work is done'), 'the timeline derives from SERVICE_TURNAROUND (setup/recurring lines)')

console.log('\n' + '='.repeat(52))
if (fail) { console.log(`RESULT: ${fail} checks failed — the DB campaign does not render correctly.`); process.exit(1) }
console.log('RESULT: the DB campaign renders on its shelf and its PDP shows every uniform section from derived data.')
