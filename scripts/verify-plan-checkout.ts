/* Section 2 harness: the plan (cart) store + checkout-as-one-campaign.
 *   1. cart ops: v1→v2 silent migration, add-or-replace, remove, clear, stale-drop
 *   2. price honesty: per-item money == the PDP buy-footer math; totals == the sum
 *   3. the MERGED one-campaign draft: unique prefixed line ids; every line byte-equal
 *      (sans id) to its single-item compose (producer/price/ownerMode survive, incl.
 *      the free gbp diy lane); merged totals == cart totals; the POST payload carries
 *      the same field shape a single-item Buy-now ship sends
 *   4. the Pro gate: a gbp AI lane blocks checkout for a non-Pro client
 * Pure/offline — no DB, no network. Run: node_modules/.bin/tsx scripts/verify-plan-checkout.ts */

// localStorage stub BEFORE the store loads (plan-draft reads it lazily, but be strict).
const mem = new Map<string, string>()
;(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => { mem.set(k, String(v)) },
  removeItem: (k: string) => { mem.delete(k) },
  clear: () => { mem.clear() },
} as Storage

let fail = 0
const ok = (cond: boolean, msg: string) => { console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fail++ }
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

// The three gbp doer strings the store round-trips (must match the jsx/adapter tokens).
const GBP_TEAM = 'done for you by Apnosh, $365'
const GBP_AI = 'done with Apnosh AI, step by step, free'
const GBP_DIY = 'done by you yourself, step by step, free'

async function main() {
  const { readPlanDraft, addToPlan, removeFromPlan, clearPlan, planItemMoney, planTotals } = await import('../src/lib/campaigns/builder/plan-draft')
  const { composePlanCampaign, planProBlocked, valsForPlanItem, planCheckoutName } = await import('../src/lib/campaigns/builder/plan-checkout')
  const { draftFromBuilder } = await import('../src/lib/campaigns/builder/adapter')
  const { ITEM_PRICES } = await import('../src/lib/campaigns/builder/item-prices')
  const { summarize } = await import('../src/lib/campaigns/types')

  console.log('\n== 1) cart ops ==')
  // v1 (Section 1 append-only) migrates silently: dedupe last-wins, keyed v2, v1 removed.
  mem.set('apnosh-plan-draft-v1', JSON.stringify([
    { itemId: 'gbp', version: GBP_TEAM, options: [], at: 1 },
    { itemId: 'reel', version: null, options: [], at: 2 },
    { itemId: 'gbp', version: GBP_DIY, options: ['gbp-posts'], at: 3 },
  ]))
  let items = readPlanDraft()
  ok(items.length === 2, `v1 migrates deduped last-wins (${items.length} items)`)
  ok(items[0]?.itemId === 'gbp' && items[0]?.doer === GBP_DIY && eq(items[0]?.options, ['gbp-posts']), 'the later gbp entry (diy + option) won')
  ok(mem.get('apnosh-plan-draft-v1') === undefined, 'v1 key removed after migration')
  ok(typeof mem.get('apnosh-plan-draft-v2') === 'string', 'v2 key written')

  clearPlan()
  ok(readPlanDraft().length === 0, 'clear() empties the plan')

  addToPlan({ itemId: 'gbp', doer: GBP_TEAM, options: [] })
  addToPlan({ itemId: 'reel' })
  ok(readPlanDraft().length === 2, 'add() collects two items')
  addToPlan({ itemId: 'gbp', doer: GBP_DIY, options: ['gbp-posts'] })
  items = readPlanDraft()
  ok(items.length === 2 && items[0].doer === GBP_DIY && eq(items[0].options, ['gbp-posts']), 're-adding an item REPLACES its config (still 2 items, gbp now diy + option)')
  removeFromPlan('reel')
  ok(readPlanDraft().length === 1 && readPlanDraft()[0].itemId === 'gbp', 'remove() drops one item')

  // Stale drop: an unknown itemId and a dead option id are filtered on read, but the raw
  // record is untouched (a DB campaign that registers late must reappear, not be deleted).
  clearPlan()
  mem.set('apnosh-plan-draft-v2', JSON.stringify([
    { itemId: 'not-a-card-anymore', doer: null, options: [], addedAt: 1 },
    { itemId: 'reel', doer: null, options: ['not-a-service'], addedAt: 2 },
  ]))
  items = readPlanDraft()
  ok(items.length === 1 && items[0].itemId === 'reel', 'unknown itemId dropped on read')
  ok(eq(items[0].options, []), 'dead option serviceId dropped on read')
  ok((mem.get('apnosh-plan-draft-v2') ?? '').includes('not-a-card-anymore'), 'the drop is non-destructive (raw record keeps the id for late registration)')

  console.log('\n== 2) price honesty (the PDP buy-footer math, exactly) ==')
  ok(eq(ITEM_PRICES.gbp, { oneTime: 365, perMonth: 0 }), `gbp base is the real $365 (${JSON.stringify(ITEM_PRICES.gbp)})`)
  const mTeam = planItemMoney({ itemId: 'gbp', doer: GBP_TEAM, options: [] })
  ok(eq(mTeam, { oneTime: 365, perMonth: 0 }), `gbp team = $365 (${JSON.stringify(mTeam)})`)
  const mDiy = planItemMoney({ itemId: 'gbp', doer: GBP_DIY, options: ['gbp-posts'] })
  ok(mDiy.oneTime === 0 && mDiy.perMonth > 0, `gbp diy + recurring option = $0 + $${mDiy.perMonth}/mo (lane free, option still billed)`)
  const mReel = planItemMoney({ itemId: 'reel', doer: null, options: [] })
  ok(eq(mReel, ITEM_PRICES.reel) && mReel.oneTime > 0, `reel (creative "Starting" item) = $${mReel.oneTime}, matches ITEM_PRICES`)
  const mRev = planItemMoney({ itemId: 'reviewsplan', doer: null, options: [] })
  ok(eq(mRev, ITEM_PRICES.reviewsplan), `reviewsplan = ${JSON.stringify(mRev)}, matches ITEM_PRICES`)

  const cart = [
    { itemId: 'gbp', doer: GBP_DIY, options: ['gbp-posts'], addedAt: 1 },
    { itemId: 'reel', doer: null, options: [] as string[], addedAt: 2 },
    { itemId: 'reviewsplan', doer: null, options: [] as string[], addedAt: 3 },
  ]
  const totals = planTotals(cart)
  const want = { oneTime: mDiy.oneTime + mReel.oneTime + mRev.oneTime, perMonth: mDiy.perMonth + mReel.perMonth + mRev.perMonth }
  ok(eq(totals, want), `cart totals == sum of per-item PDP math (${JSON.stringify(totals)})`)

  console.log('\n== 3) the merged one-campaign draft ==')
  const { draft, dropped, perItem } = composePlanCampaign(cart, new Date('2026-07-11T12:00:00'))
  ok(!!draft && dropped.length === 0 && perItem.length === 3, 'all 3 items compose, none dropped')
  if (!draft) { process.exit(1) }

  ok(draft.name === 'Marketing plan · Jul 11' && planCheckoutName(new Date('2026-07-11T12:00:00')) === draft.name, `campaign name "${draft.name}"`)

  const ids = draft.items.map((li) => li.id)
  ok(new Set(ids).size === ids.length, `line ids unique across the merge (${ids.length} lines)`)
  ok(ids.every((id) => /^(gbp|reel|reviewsplan)__/.test(id)), 'every line id carries its item prefix')

  // Every merged line is byte-equal (sans id) to its single-item compose, in order.
  let byteEqual = true
  let cursor = 0
  for (const { itemId, draft: single } of perItem) {
    const solo = draftFromBuilder({ itemId, status: 'approve', vals: valsForPlanItem(cart.find((c) => c.itemId === itemId)!) })
    if (!eq(single.items, solo.items)) byteEqual = false
    for (const li of single.items) {
      const merged = draft.items[cursor++]
      const a = { ...li, id: undefined }
      const b = { ...merged, id: undefined }
      if (!eq(a, b) || merged.id !== `${itemId}__${li.id}`) byteEqual = false
    }
  }
  ok(byteEqual && cursor === draft.items.length, 'every merged line byte-equal (sans id) to its single-item compose, in cart order')

  const gbpSetup = draft.items.find((li) => li.serviceId === 'gbp-setup')
  ok(!!gbpSetup && gbpSetup.producer === 'diy' && gbpSetup.price === 0 && gbpSetup.ownerMode === 'diy', 'the gbp diy lane survives the merge (producer diy, $0, ownerMode diy)')
  const gbpPosts = draft.items.find((li) => li.serviceId === 'gbp-posts')
  ok(!!gbpPosts && gbpPosts.price === mDiy.perMonth && gbpPosts.cadence.kind === 'recurring', `the picked option rides as a real billed line ($${gbpPosts?.price}/mo)`)

  const mergedBill = summarize(draft.items)
  ok(mergedBill.oneTimeOnDelivery === totals.oneTime && mergedBill.perMonth === totals.perMonth, `merged bill == cart totals ($${mergedBill.oneTimeOnDelivery} + $${mergedBill.perMonth}/mo)`)
  ok(draft.budgetMonthly === totals.perMonth, 'budgetMonthly = the merged monthly total')

  // POST payload shape: the fields a single-item Buy-now ship sends are present, and
  // nothing a per-item compose produced was dropped (all lines + all content beats ride).
  const solo = draftFromBuilder({ itemId: 'reel', status: 'approve', vals: {} })
  const REQUIRED = ['id', 'name', 'intent', 'path', 'phase', 'budgetMonthly', 'items', 'planned'] as const
  ok(REQUIRED.every((k) => k in draft && draft[k] !== undefined), 'merged draft carries every field the single-item POST payload carries')
  ok(REQUIRED.every((k) => k in solo), '(control: the single-item draft carries them too)')
  ok(draft.path === solo.path && draft.phase === solo.phase && draft.planned === true, `same conventions: path '${draft.path}', phase '${draft.phase}', planned`)
  const lineSum = perItem.reduce((s, p) => s + p.draft.items.length, 0)
  ok(draft.items.length === lineSum, `no lines dropped in the merge (${draft.items.length}/${lineSum})`)
  const beatSum = perItem.reduce((s, p) => s + (p.draft.brief?.contentBeats.length ?? 0), 0)
  ok((draft.brief?.contentBeats.length ?? 0) === beatSum, `no content beats dropped in the merge (${draft.brief?.contentBeats.length ?? 0}/${beatSum})`)
  ok(draft.goalKey === undefined, 'a multi-goal container claims no single goalKey')

  // A stale item is dropped OUT LOUD (returned in `dropped`), never silently billed.
  const withStale = composePlanCampaign([...cart, { itemId: 'ghost-item', doer: null, options: [], addedAt: 4 }])
  ok(eq(withStale.dropped, ['ghost-item']) && withStale.draft!.items.length === draft.items.length, 'an uncomposable item lands in dropped[], the rest still compose')

  console.log('\n== 4) the Pro gate ==')
  const aiCart = [{ itemId: 'gbp', doer: GBP_AI, options: [] }]
  ok(planProBlocked(aiCart, 'Starter'), 'gbp AI lane + non-Pro tier → checkout blocked')
  ok(planProBlocked(aiCart, null), 'gbp AI lane + no tier → blocked')
  ok(!planProBlocked(aiCart, 'Pro'), 'gbp AI lane + Pro → allowed')
  ok(!planProBlocked(aiCart, 'Internal'), 'gbp AI lane + Internal → allowed')
  ok(!planProBlocked([{ itemId: 'gbp', doer: GBP_TEAM, options: [] }], 'Starter'), 'gbp team lane + non-Pro → allowed')

  console.log(fail ? `\n${fail} FAILURES` : '\nALL PASS')
  process.exit(fail ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(1) })
