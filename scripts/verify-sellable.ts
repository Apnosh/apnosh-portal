#!/usr/bin/env tsx
/**
 * Drift guard for THE ONE LAW: sellable().
 *
 * The reviewer's find: the law gated the store shelf and nothing else. isBuyable and
 * unbuyableCatalogIds still read `availabilityFor === 'live'`, so a card the law held back kept
 * its price on the search row, its Add button in the builder, its slot in the recommender, and a
 * real charge behind /api/checkout/prepare. Four surfaces, four different answers to "may we sell
 * this", which is exactly the shape of bug that takes money for work nobody can do.
 *
 * So this script asserts the three answers are ONE answer, for every id in the store, and that the
 * detour rails can never point at something unsellable.
 *
 * Run:  npx tsx scripts/verify-sellable.ts
 * Exits non-zero on any failure. Imports nothing server-only.
 */
import {
  sellable, isBuyable, availabilityFor, unbuyableCatalogIds, notSellableReason,
  FULLY_BUILT_LIVE, RETIRED_IDS,
} from '../src/lib/campaigns/data/catalog-availability'
import { CREATE_CATALOG, CREATE_CATALOG_IDS } from '../src/lib/campaigns/data/create-catalog'
import { REQUEST_TYPES } from '../src/lib/requests/catalog'
import { liveAlternativesFor, liveAlternativesForStage, unbundleFor } from '../src/lib/campaigns/data/live-alternatives'

let fail = 0
const ok = (cond: boolean, msg: string) => { console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fail++ }

/** Every id the store can print: the built-in catalog plus the desk's creative cards. */
const ALL_IDS = [...CREATE_CATALOG_IDS, ...REQUEST_TYPES.map((t) => `creative-${t.id}`)]

// 1) One law, one answer. isBuyable IS sellable, and the buy guard agrees with both.
console.log('\n== isBuyable, unbuyableCatalogIds and sellable give the same answer ==')
const split: string[] = []
for (const id of ALL_IDS) {
  const s = sellable(id).ok
  if (isBuyable(id) !== s) split.push(`${id}: isBuyable=${isBuyable(id)} sellable=${s}`)
  if ((unbuyableCatalogIds([id]).length === 0) !== s) split.push(`${id}: buy guard disagrees`)
}
ok(split.length === 0, `all ${ALL_IDS.length} ids agree${split.length ? `\n        ${split.join('\n        ')}` : ''}`)

// 2) The allowlist keeps meaning "we finished this". A card marked live that the law refuses is
//    a card with a price, an Add button and no steps behind it.
console.log('\n== nothing marked live fails the law ==')
const liveButHeld = ALL_IDS.filter((id) => availabilityFor(id) === 'live' && !sellable(id).ok)
  .map((id) => `${id}: ${sellable(id).blockedBy?.join(', ') ?? sellable(id).reason}`)
ok(liveButHeld.length === 0, `no live card is held by the law${liveButHeld.length ? `\n        ${liveButHeld.join('\n        ')}` : ''}`)

console.log('\n== nothing the law clears is marked coming soon ==')
const heldButPasses = ALL_IDS.filter((id) => availabilityFor(id) !== 'live' && sellable(id).ok)
ok(heldButPasses.length === 0, `availability and the law never disagree${heldButPasses.length ? ` (${heldButPasses.join(', ')})` : ''}`)

// 3) Every id on the allowlist is sellable, unless it is deliberately hidden (the email cards,
//    which are off at the rail rather than unfinished).
console.log('\n== every allowlisted card can actually be sold ==')
const allowBad = [...FULLY_BUILT_LIVE].filter((id) => availabilityFor(id) !== 'hidden' && !sellable(id).ok)
ok(allowBad.length === 0, `all ${FULLY_BUILT_LIVE.length} allowlisted ids clear the law${allowBad.length ? ` (${allowBad.join(', ')})` : ''}`)

// 4) Every card that cannot be sold says why, in plain words, with no em dash.
console.log('\n== every held card says why ==')
const silent: string[] = []
for (const id of ALL_IDS) {
  if (sellable(id).ok) continue
  const r = notSellableReason(id)
  if (!r || !r.trim()) silent.push(id)
  else if (r.includes('—')) silent.push(`${id} (em dash)`)
}
ok(silent.length === 0, `every held card has a reason${silent.length ? ` (${silent.join(', ')})` : ''}`)

// 5) A retired card can never be bought, whatever else changes.
console.log('\n== a retired card is refused ==')
ok(RETIRED_IDS.every((id) => !isBuyable(id)), `retired ids stay unbuyable (${RETIRED_IDS.join(', ') || 'none'})`)

// 6) THE DETOUR RAIL. Every alternative we offer must itself be sellable, or a dead end sends the
//    owner to another dead end. This is what pointed at barnights as the live answer to a held card.
console.log('\n== live-alternatives never names an unsellable card ==')
const badAlt: string[] = []
for (const id of ALL_IDS) {
  for (const a of liveAlternativesFor(id)) if (!sellable(a).ok) badAlt.push(`${id} -> ${a}`)
  for (const u of unbundleFor(id)?.ids ?? []) if (!sellable(u).ok) badAlt.push(`${id} unbundle -> ${u}`)
}
const STAGES = [...new Set(CREATE_CATALOG.flatMap((c) => (c.stages ?? []) as string[]))]
for (const st of STAGES) {
  for (const a of liveAlternativesForStage(st)) if (!sellable(a).ok) badAlt.push(`stage ${st} -> ${a}`)
}
ok(badAlt.length === 0, `every detour is sellable (${ALL_IDS.length} cards, ${STAGES.length} stages)${badAlt.length ? `\n        ${badAlt.join('\n        ')}` : ''}`)

// 7) A dark stage shelf must still have somewhere to send people.
console.log('\n== every funnel stage has a live play to route to ==')
const darkStages = STAGES.filter((st) => liveAlternativesForStage(st).length === 0)
ok(darkStages.length === 0, `all ${STAGES.length} stages route somewhere${darkStages.length ? ` (${darkStages.join(', ')})` : ''}`)

console.log('\n====================================================')
console.log(fail === 0 ? 'RESULT: one law, one answer.' : `RESULT: ${fail} check${fail === 1 ? '' : 's'} failed.`)
process.exit(fail === 0 ? 0 : 1)
