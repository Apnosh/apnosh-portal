/* Drift guard for the create-page campaign catalog. The recommend feed + the builder's deep-link
 * validator now both derive from src/lib/campaigns/data/create-catalog (one source). The JSX render
 * catalog (apnosh-campaign.jsx `CATALOG`) keeps its own list because it owns card render data; this
 * asserts those ids stay equal to the source, AND that every recommendable id still composes a real
 * (non-fallback) plan. Run in CI: a one-sided catalog edit fails here instead of silently breaking a
 * recommendation. Exits non-zero on any drift. */
import { readFileSync } from 'node:fs'
import { CREATE_CATALOG_IDS } from '../src/lib/campaigns/data/create-catalog'
import { composePlanForGoal } from '../src/lib/campaigns/builder/compose-plan'
import { CAMPAIGN_CONTENT, campaignContent, type CampaignContent } from '../src/lib/campaigns/data/campaign-content'
import { requirementsFor } from '../src/lib/campaigns/data/campaign-requirements'
import { whyFor } from '../src/lib/campaigns/data/why-for'
import { whatYouGet, whatYouGetRowCount } from '../src/lib/campaigns/builder/what-you-get'
import { serviceById, plainNameOf } from '../src/lib/campaigns/catalog'

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
  const p = composePlanForGoal(id, {}) as { tpl?: { name?: string; contentPlan?: unknown[] }; moves?: unknown[]; serviceIds?: string[] }
  const beats = p.tpl?.contentPlan?.length ?? 0
  const moves = p.moves?.length ?? 0
  // Real included services (ItemShape.services, the hollow-card recompose) are a
  // valid plan body: the adapter prices each as a real line item.
  const services = p.serviceIds?.length ?? 0
  const named = !!p.tpl?.name && p.tpl.name !== 'New campaign'
  if (!((beats > 0 || moves > 0 || services > 0) && named)) { allReal = false; bad.push(`${id}(name=${p.tpl?.name},beats=${beats},moves=${moves},services=${services})`) }
}
ok(allReal, `all ${CREATE_CATALOG_IDS.length} compose a named, non-empty plan${bad.length ? ` (broken: ${bad.join('; ')})` : ''}`)

// 3) Every recommendable id has full product-page content. Coverage of the authored copy +
// why templates is already compile-time (Record<CreateCatalogId, …>); this re-asserts it at
// runtime, checks the copy rules (no em dashes, non-empty lines), and that the derived
// what-you-get rows are non-empty so no card ships an empty sell page.
console.log('\n== every recommendable id has product-page content ==')
const noCopy: string[] = []
const emDash: string[] = []
const noRows: string[] = []
const whyBroken: string[] = []
for (const id of CREATE_CATALOG_IDS) {
  const c = campaignContent(id)
  if (!c || !c.promise?.trim() || !c.why?.trim() || !c.expectation?.trim()) noCopy.push(id)
  else if (/—/.test(c.promise + c.why + c.expectation)) emDash.push(id)
  // whatYouGet now returns grouped sections; count real ROWS across every group so an empty
  // base still fails here (a lone titleless group with no rows is not "something you get").
  if (whatYouGetRowCount(id) === 0) noRows.push(id)
  try { whyFor(id, { views30d: 1200, actions30d: { directions: 40, calls: 12, websiteClicks: 30 }, rating: 4.4, ratingCount: 180, unrepliedReviews: 6, listingGaps: ['hours'] }) } catch { whyBroken.push(id) }
}
ok(noCopy.length === 0, `all ids carry promise + fallback why + expectation copy${noCopy.length ? ` (missing: ${noCopy.join(', ')})` : ''}`)
ok(emDash.length === 0, `authored copy has no em dashes${emDash.length ? ` (offenders: ${emDash.join(', ')})` : ''}`)
ok(noRows.length === 0, `all ids derive at least one real what-you-get row${noRows.length ? ` (empty: ${noRows.join(', ')})` : ''}`)
ok(whyBroken.length === 0, `whyFor runs on a full signal bundle for every id${whyBroken.length ? ` (threw: ${whyBroken.join(', ')})` : ''}`)

// 4) Dynamic what-you-get: a selected option adds a TITLED group whose rows are that service's
// REAL catalog deliverables, and the gbp version reframes the base honestly. Both trace to the
// catalog, so this guards the new live-recompose path against silent drift.
console.log('\n== what-you-get recomposes live from version + options ==')
const gbpTeam = whatYouGet('gbp', { version: 'team' })
const gbpDiy = whatYouGet('gbp', { version: 'diy' })
ok(gbpTeam[0].rows.length > 0 && gbpDiy[0].rows.length > 0, 'gbp base rows exist for every version lane')
ok(JSON.stringify(gbpTeam[0].rows) !== JSON.stringify(gbpDiy[0].rows), 'gbp base reframes by version (team ≠ diy)')
const withOpt = whatYouGet('gbp', { version: 'team', optionServiceIds: ['gbp-posts'] })
const optGroup = withOpt.find((s) => !!s.title)
ok(!!optGroup && optGroup.rows.length > 0, 'a selected option adds a titled group with real bullets')
ok(!!optGroup && optGroup.title === plainNameOf(serviceById('gbp-posts')!), 'the added group is titled by the real service name')
ok(!!optGroup && optGroup.rows.every((r) => (serviceById('gbp-posts')!.deliverables?.included ?? []).includes(r)), 'every added row is a real catalog deliverable')

// 5) Canonical content record (Phase A of the catalog systemization): CAMPAIGN_CONTENT is the ONE
// place a campaign's words live. Until the JSX CATALOG reads from it directly (Phase B), assert the
// record and the render layer carry byte-identical title/tagline, that the gbp PDP description
// renders FROM the record (no re-hardcoded literal), that requirementsFor derives cleanly for every
// id, and that no record string smuggles in an em dash.
console.log('\n== canonical content record (CAMPAIGN_CONTENT) ==')
const jsxCards: Record<string, { title: string; sub: string }> = {}
for (const m of block.matchAll(/id:\s*"([^"]+)"[^}]*?title:\s*"([^"]*)"[^}]*?sub:\s*"([^"]*)"/g)) jsxCards[m[1]] = { title: m[2], sub: m[3] }
const missingContent: string[] = []
const titleDrift: string[] = []
const emDashRec: string[] = []
const reqBroken: string[] = []
for (const id of CREATE_CATALOG_IDS) {
  const c = (CAMPAIGN_CONTENT as Record<string, CampaignContent | undefined>)[id]
  if (!c || !c.title?.trim() || !c.tagline?.trim() || !c.description?.trim() || !c.why?.trim()) { missingContent.push(id); continue }
  const card = jsxCards[id]
  if (!card || card.title !== c.title || card.sub !== c.tagline) titleDrift.push(id)
  const strings = [c.title, c.tagline, c.description, c.promise, c.why, c.expectation, c.bestFor ?? '', ...(c.faq ?? []).flatMap((f) => [f.q, f.a])]
  if (strings.some((s) => /—/.test(s))) emDashRec.push(id)
  try { const r = requirementsFor(id); if (!Array.isArray(r) || r.some((x) => typeof x !== 'string' || !x.trim())) reqBroken.push(id) } catch { reqBroken.push(id) }
}
ok(missingContent.length === 0, `every id carries a full canonical record (title/tagline/description/why)${missingContent.length ? ` (missing: ${missingContent.join(', ')})` : ''}`)
ok(titleDrift.length === 0, `record title + tagline are byte-identical to the JSX CATALOG card${titleDrift.length ? ` (drifted: ${titleDrift.join(', ')})` : ''}`)
// The gbp PDP description must RENDER from the record — the old hardcoded literal must be gone
// from the JSX, replaced by a campaignContent("gbp") read (so editing the record edits the page).
ok(jsx.includes('campaignContent("gbp").description'), 'the gbp PDP description renders from campaignContent("gbp")')
ok(!jsx.includes('Your Google profile is the first thing most people check'), 'no re-hardcoded gbp description literal survives in the JSX')
ok(emDashRec.length === 0, `no canonical record string has an em dash${emDashRec.length ? ` (offenders: ${emDashRec.join(', ')})` : ''}`)
ok(reqBroken.length === 0, `requirementsFor derives a clean string list for all ${CREATE_CATALOG_IDS.length} ids${reqBroken.length ? ` (broken: ${reqBroken.join(', ')})` : ''}`)

console.log('\n' + '='.repeat(52))
if (fail) { console.log(`RESULT: ${fail} checks failed — the create catalog has drifted.`); process.exit(1) }
console.log('RESULT: create catalog is single-sourced and drift-free; every recommendable id renders + plans.')
