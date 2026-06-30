import { atomicCoverage, ATOMIC_ACTIONS, RECIPES } from '../src/lib/campaigns/data/atomic-catalog'

const c = atomicCoverage()
console.log('atoms:                  ', c.atoms)
console.log('action types:           ', c.actionTypes)
console.log('distinct source strings:', c.distinctSourceStrings, '(expect 178)')
console.log('total source entries:   ', c.sourceStrings)
console.log('duplicates:             ', c.duplicates.length ? c.duplicates : '(none)')
console.log('recipes:                ', c.recipes, '(expect 37)')
console.log('unresolved recipe lines:', c.unresolvedRecipeLines.length ? c.unresolvedRecipeLines : '(none)')
console.log('fit tally:              ', c.fitTally)

const EXPECTED = JSON.parse(process.argv[2] || '[]') as string[]
const have = new Set<string>()
for (const a of ATOMIC_ACTIONS) for (const t of a.types) for (const s of t.from) have.add(s)
const missing = EXPECTED.filter((s) => !have.has(s))
const extra = [...have].filter((s) => !EXPECTED.includes(s))
console.log('missing from catalog:   ', missing.length ? missing : '(none)')
console.log('not in original 178:    ', extra.length ? extra : '(none)')
console.log('recipe ids unique:      ', new Set(RECIPES.map((r) => r.id)).size === RECIPES.length)
