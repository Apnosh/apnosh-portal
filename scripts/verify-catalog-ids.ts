/* Drift guard for the create-page campaign catalog. The recommend feed + the builder's deep-link
 * validator now both derive from src/lib/campaigns/data/create-catalog (one source). The JSX render
 * catalog (apnosh-campaign.jsx `CATALOG`) keeps its own list because it owns card render data; this
 * asserts those ids stay equal to the source, AND that every recommendable id still composes a real
 * (non-fallback) plan. Run in CI: a one-sided catalog edit fails here instead of silently breaking a
 * recommendation. Exits non-zero on any drift. */
import { readFileSync } from 'node:fs'
import { CREATE_CATALOG_IDS } from '../src/lib/campaigns/data/create-catalog'
import { composePlanForGoal } from '../src/lib/campaigns/builder/compose-plan'

let fail = 0
const ok = (cond: boolean, msg: string) => { console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fail++ }

// 1) The JSX render catalog ids == the single-source ids.
const jsx = readFileSync('src/components/mvp/campaign-builder/apnosh-campaign.jsx', 'utf8')
const start = jsx.indexOf('const CATALOG = [')
const end = jsx.indexOf('const catGet', start)
const block = start >= 0 && end > start ? jsx.slice(start, end) : ''
const jsxIds = [...block.matchAll(/id:\s*"([^"]+)"/g)].map((m) => m[1])
const srcSet = new Set(CREATE_CATALOG_IDS), jsxSet = new Set(jsxIds)
const missingInJsx = CREATE_CATALOG_IDS.filter((id) => !jsxSet.has(id))
const extraInJsx = jsxIds.filter((id) => !srcSet.has(id))
console.log(`\n== render catalog matches the single source (${CREATE_CATALOG_IDS.length} ids) ==`)
ok(block.length > 0, 'found the JSX CATALOG block to compare against')
ok(missingInJsx.length === 0, `every recommendable id renders a card${missingInJsx.length ? ` (missing in JSX: ${missingInJsx.join(', ')})` : ''}`)
ok(extraInJsx.length === 0, `no render-only card is unreachable from the source${extraInJsx.length ? ` (extra in JSX: ${extraInJsx.join(', ')})` : ''}`)

// 2) Every recommendable id composes a real, non-fallback plan.
console.log('\n== every recommendable id composes a real plan ==')
let allReal = true
const bad: string[] = []
for (const id of CREATE_CATALOG_IDS) {
  const p = composePlanForGoal(id, {}) as { tpl?: { name?: string; contentPlan?: unknown[] }; moves?: unknown[] }
  const beats = p.tpl?.contentPlan?.length ?? 0
  const moves = p.moves?.length ?? 0
  const named = !!p.tpl?.name && p.tpl.name !== 'New campaign'
  if (!((beats > 0 || moves > 0) && named)) { allReal = false; bad.push(`${id}(name=${p.tpl?.name},beats=${beats},moves=${moves})`) }
}
ok(allReal, `all ${CREATE_CATALOG_IDS.length} compose a named, non-empty plan${bad.length ? ` (broken: ${bad.join('; ')})` : ''}`)

console.log('\n' + '='.repeat(52))
if (fail) { console.log(`RESULT: ${fail} checks failed — the create catalog has drifted.`); process.exit(1) }
console.log('RESULT: create catalog is single-sourced and drift-free; every recommendable id renders + plans.')
