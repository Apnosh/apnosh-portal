/* Section 2 render smoke (renderToString, same idiom as smoke-render-db-campaign):
 *   1. the persistent PLAN BAR renders with the item count + the PDP-exact total
 *   2. the PLAN VIEW renders one row per item (title, version, add-on, per-item price),
 *      the running total, and the Check out button
 *   3. the Pro gate note renders when the plan holds the gbp AI lane on a non-Pro tier
 *   4. the empty state renders (both directly and via the store's {name:"plan"} route)
 * Run: node_modules/.bin/tsx scripts/smoke-render-plan-cart.tsx */

// localStorage stub before anything loads (the store controller reads it in effects only,
// but the stub keeps any lazy read harmless under renderToString).
const mem = new Map<string, string>()
;(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => { mem.set(k, String(v)) },
  removeItem: (k: string) => { mem.delete(k) },
  clear: () => { mem.clear() },
} as Storage

import React from 'react'
import { renderToString } from 'react-dom/server'

let fail = 0
const ok = (cond: boolean, msg: string) => { console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fail++ }

const GBP_DIY = 'done by you yourself, step by step, free'
const GBP_AI = 'done with Apnosh AI, step by step, free'

async function main() {
  const mod = await import('../src/components/mvp/campaign-builder/apnosh-campaign')
  const { planTotals, planItemMoney } = await import('../src/lib/campaigns/builder/plan-draft')
  const PlanBar = mod.PlanBar as React.ComponentType<Record<string, unknown>>
  const PlanView = mod.PlanView as React.ComponentType<Record<string, unknown>>
  const Store = mod.default as unknown as React.ComponentType<Record<string, unknown>>
  const noop = () => undefined

  const cart = [
    { itemId: 'gbp', doer: GBP_DIY, options: ['gbp-posts'], addedAt: 1 },
    { itemId: 'reel', doer: null, options: [], addedAt: 2 },
    { itemId: 'reviewsplan', doer: null, options: [], addedAt: 3 },
  ]
  const t = planTotals(cart)

  console.log('\n== 1) the plan bar ==')
  const bar = renderToString(React.createElement(PlanBar, { items: cart, onOpen: noop }))
  ok(bar.includes('View your plan'), 'bar label renders')
  ok(bar.includes('>3<!-- -->') || / 3 /.test(bar.replace(/<!-- -->/g, ' ')), 'item count (3) renders')
  ok(bar.includes(`From $${t.oneTime} + $${t.perMonth}/mo`), `the PDP-exact total renders (From $${t.oneTime} + $${t.perMonth}/mo)`)
  const empty = renderToString(React.createElement(PlanBar, { items: [], onOpen: noop }))
  ok(empty === '', 'bar renders nothing when the plan is empty')

  console.log('\n== 2) the plan view ==')
  const view = renderToString(React.createElement(PlanView, { items: cart, tier: 'Starter', onBack: noop, onOpenItem: noop, onRemove: noop, onCheckout: undefined }))
  ok(view.includes('Your plan'), 'header renders')
  ok(view.includes('Polish your Google profile') && view.includes('A short video') && view.includes('Boost reviews and rating'), 'one row per item, real card titles')
  ok(view.includes('I&#x27;ll do it myself'), 'the version label renders on the versioned (gbp) row')
  ok(view.includes('Keep Google fresh'), 'the add-on renders by its plain name (gbp-posts)')
  const mReel = planItemMoney(cart[1])
  ok(view.includes(`From $${mReel.oneTime}`), `the creative row prices in the PDP idiom (From $${mReel.oneTime})`)
  ok(view.includes(`From $${t.oneTime} + $${t.perMonth}/mo`), 'the running total renders')
  ok(view.includes('Check out'), 'the Check out button renders')
  ok(view.includes('Keep shopping'), 'the quiet Keep shopping link renders')
  ok(view.includes('Nothing starts or bills yet'), 'the honest sub-line renders')

  console.log('\n== 3) the Pro gate ==')
  const aiCart = [{ itemId: 'gbp', doer: GBP_AI, options: [], addedAt: 1 }]
  const gated = renderToString(React.createElement(PlanView, { items: aiCart, tier: 'Starter', onBack: noop, onOpenItem: noop, onRemove: noop }))
  ok(gated.includes('Apnosh AI is on the Pro plan.'), 'the honest block line renders for a non-Pro client')
  ok(gated.includes('/dashboard/billing'), 'the Upgrade link renders')
  ok(gated.includes('disabled'), 'Check out is disabled while blocked')
  const proView = renderToString(React.createElement(PlanView, { items: aiCart, tier: 'Pro', onBack: noop, onOpenItem: noop, onRemove: noop }))
  ok(!proView.includes('Apnosh AI is on the Pro plan.') && !proView.includes('disabled'), 'a Pro client is not blocked')

  console.log('\n== 4) the empty state ==')
  const emptyView = renderToString(React.createElement(PlanView, { items: [], tier: null, onBack: noop, onOpenItem: noop, onRemove: noop }))
  ok(emptyView.includes('Your plan is empty.') && emptyView.includes('Anything you add shows up here.'), 'empty copy renders')
  ok(emptyView.includes('Back to the store'), 'the back-to-store button renders')
  // The store's own {name:"plan"} route (initialView deep-in): first render is hydration-safe
  // (no localStorage read), so it shows the empty state.
  const store = renderToString(React.createElement(Store, { restaurant: 'Smoke Test Cafe', initialView: 'plan' }))
  ok(store.includes('Your plan is empty.'), 'the store route {name:"plan"} renders the plan view')

  console.log(fail ? `\n${fail} FAILURES` : '\nALL PASS')
  process.exit(fail ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(1) })
