#!/usr/bin/env tsx
/**
 * Drift guard for the chip-to-shelf map (src/lib/campaigns/data/chip-shelf.ts).
 *
 * The map is the only thing joining what the owner said in setup to what the store shows them,
 * and it is hand-written, so it is exactly the kind of file that rots quietly: a renamed catalog
 * id, a chip that loses its last live card, a shape override pointing at nothing. Each of those
 * shows up to an owner as an empty shelf, which is the one outcome the whole move exists to stop.
 *
 * Run:  npx tsx scripts/verify-chip-shelf.ts
 * Exits non-zero on any failure. Imports nothing server-only.
 */
import { CHIP_ORDER, CHIP_SHELF, SHAPE_OVERRIDES, KNOWN_SHELF_IDS, shelfForChip, liveForChip, laterForChip } from '../src/lib/campaigns/data/chip-shelf'
import { GOAL_CHIPS } from '../src/app/(auth)/onboarding/full/data'
import { sellable, notSellableReason } from '../src/lib/campaigns/data/catalog-availability'
import { CLIENT_SHAPES, type ClientShape } from '../src/lib/clients/shape'
import { goalSlugForChip } from '../src/lib/goals/defaults'

let fail = 0
const ok = (cond: boolean, msg: string) => { console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fail++ }

// 1) The chips are the onboarding chips, in the same words. These are stored values.
console.log('\n== the map covers the onboarding chips, verbatim ==')
const chips = [...GOAL_CHIPS] as string[]
ok(CHIP_ORDER.length === chips.length && CHIP_ORDER.every((c, i) => c === chips[i]),
  `CHIP_ORDER matches GOAL_CHIPS (${chips.length} chips)`)
const missing = chips.filter((c) => !CHIP_SHELF[c])
ok(missing.length === 0, `every chip has a shelf${missing.length ? ` (missing: ${missing.join(', ')})` : ''}`)
const extra = Object.keys(CHIP_SHELF).filter((c) => !chips.includes(c))
ok(extra.length === 0, `no shelf is keyed to a chip nobody can pick${extra.length ? ` (extra: ${extra.join(', ')})` : ''}`)

// 2) Every id names a real card. A typo here is an id that silently renders nothing.
console.log('\n== every id on every shelf is a real card ==')
const unknown = new Set<string>()
for (const [chip, ids] of Object.entries(CHIP_SHELF)) {
  for (const id of ids) if (!KNOWN_SHELF_IDS.has(id)) unknown.add(`${chip}:${id}`)
}
for (const [shape, ov] of Object.entries(SHAPE_OVERRIDES)) {
  for (const ids of Object.values(ov?.lead ?? {})) for (const id of ids) if (!KNOWN_SHELF_IDS.has(id)) unknown.add(`${shape} lead:${id}`)
  for (const id of ov?.drop ?? []) if (!KNOWN_SHELF_IDS.has(id)) unknown.add(`${shape} drop:${id}`)
}
ok(unknown.size === 0, `no unknown id${unknown.size ? ` (${[...unknown].join(', ')})` : ''}`)

// 3) A shape override must name a chip that exists, or it does nothing forever.
console.log('\n== shape overrides point at real chips ==')
const badLead: string[] = []
for (const [shape, ov] of Object.entries(SHAPE_OVERRIDES)) {
  for (const chip of Object.keys(ov?.lead ?? {})) if (!CHIP_SHELF[chip]) badLead.push(`${shape}:${chip}`)
}
ok(badLead.length === 0, `every lead is keyed to a real chip${badLead.length ? ` (${badLead.join(', ')})` : ''}`)

// 4) No duplicates within a shelf (a card printed twice reads as a bug to an owner).
console.log('\n== no card appears twice on one shelf ==')
const dupes: string[] = []
for (const [chip, ids] of Object.entries(CHIP_SHELF)) {
  const seen = new Set<string>()
  for (const id of ids) { if (seen.has(id)) dupes.push(`${chip}:${id}`); seen.add(id) }
}
ok(dupes.length === 0, `no duplicates${dupes.length ? ` (${dupes.join(', ')})` : ''}`)

// 5) Live cards lead. The store shows "For you" first, so a shelf that opens with four
//    coming-soon cards reads as a store with nothing in it.
console.log('\n== live cards lead every shelf ==')
const badOrder: string[] = []
for (const chip of chips) {
  const ids = CHIP_SHELF[chip] ?? []
  let seenDead = false
  for (const id of ids) {
    const live = sellable(id).ok
    if (!live) seenDead = true
    else if (seenDead) { badOrder.push(`${chip}: ${id} is live but sits after a held card`); break }
  }
}
ok(badOrder.length === 0, `live first on all ${chips.length} shelves${badOrder.length ? `\n        ${badOrder.join('\n        ')}` : ''}`)

// 6) Every chip has at least one live card, or an HONEST EMPTY: a chip with nothing to sell
//    must still say why, for every card it lists. Silence is the failure, not emptiness.
console.log('\n== every chip has a live card, or an honest empty ==')
const dishonest: string[] = []
for (const chip of chips) {
  const live = liveForChip(chip)
  if (live.length > 0) continue
  const later = laterForChip(chip)
  if (later.length === 0) { dishonest.push(`${chip}: nothing live and nothing to show`); continue }
  const noReason = later.filter((id) => !notSellableReason(id))
  if (noReason.length) dishonest.push(`${chip}: no reason for ${noReason.join(', ')}`)
}
ok(dishonest.length === 0, `no silent shelf${dishonest.length ? `\n        ${dishonest.join('\n        ')}` : ''}`)

// 7) Every held card names its reason. This is what the coming-later row prints.
console.log('\n== every held card says why, in plain words ==')
const silent: string[] = []
for (const chip of chips) for (const id of laterForChip(chip)) {
  const r = notSellableReason(id)
  if (!r || !r.trim()) silent.push(`${chip}:${id}`)
  else if (r.includes('—')) silent.push(`${chip}:${id} (em dash)`)
}
ok(silent.length === 0, `every held card has a reason${silent.length ? ` (${silent.join(', ')})` : ''}`)

// 8) Every shape resolves a non-empty shelf for every chip, including after drops.
console.log('\n== no shape empties a shelf ==')
const emptied: string[] = []
for (const shape of CLIENT_SHAPES as readonly ClientShape[]) {
  for (const chip of chips) if (shelfForChip(chip, shape).length === 0) emptied.push(`${shape}:${chip}`)
}
ok(emptied.length === 0, `all ${CLIENT_SHAPES.length} shapes keep every shelf populated${emptied.length ? ` (${emptied.join(', ')})` : ''}`)

// 9) The truck leads with the truck card, which is the whole point of having shapes.
console.log('\n== the shape overrides actually change the shelf ==')
ok(shelfForChip('Stay top of mind', 'truck')[0] === 'trucklocation', "a truck's Stay top of mind leads with the truck card")
ok(!shelfForChip('More bookings or orders', 'delivery_only').includes('listings'), 'delivery only drops the directions-shaped listings card')
ok(shelfForChip('Grow catering orders', 'catering')[0] === 'cateringengine', "a caterer's catering shelf leads with the catering engine")

// 10) Every chip still resolves to its own goal slug, one to one. If two chips ever share a
//     slug again, the saved goal cannot be read back to the right shelf.
console.log('\n== chip to goal slug is still one to one ==')
const slugs = chips.map((c) => goalSlugForChip(c))
const nulls = chips.filter((c, i) => !slugs[i])
ok(nulls.length === 0, `every chip maps to a slug${nulls.length ? ` (unmapped: ${nulls.join(', ')})` : ''}`)
ok(new Set(slugs).size === chips.length, `all ${chips.length} slugs are distinct (${new Set(slugs).size} distinct)`)

console.log('\n====================================================')
console.log(fail === 0 ? 'RESULT: chip-shelf is clean.' : `RESULT: ${fail} check${fail === 1 ? '' : 's'} failed.`)
process.exit(fail === 0 ? 0 : 1)
