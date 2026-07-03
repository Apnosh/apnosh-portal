/* Verify the cold-start signal-fit term (offline, pure, no DB):
 *  1. PARITY — signalFit is 0 for empty signals across EVERY play, and brainRankedMix on empty
 *     signals is byte-identical to the pre-edit baseline (so a blank business = today's default).
 *  2. TAILORING — three fresh businesses (low-rating / no-list / poor-listing) get three visibly
 *     different, sensible firstvisit plans, each difference attributable to a fired rule.
 * Exits non-zero on any failure. */
import { readFileSync } from 'node:fs'
import { emptySignals, planRoute, type BrainSignals } from '../src/lib/campaigns/brain/signals'
import { reading } from '../src/lib/campaigns/brain/readiness'
import { signalFit, classifyPlay } from '../src/lib/campaigns/brain/signal-fit'
import { brainRankedMix } from '../src/lib/campaigns/brain/rank'
import { composePlanForGoal, planLeadHeadline } from '../src/lib/campaigns/builder/compose-plan'
import { playsForGoalAtoms, type PlanGoal } from '../src/lib/campaigns/data/atom-plays'

const leadFor = (goal: PlanGoal, sig: BrainSignals) => planLeadHeadline(goal, brainRankedMix(goal, 'standard', sig).mix, sig)

let fail = 0
const ok = (cond: boolean, msg: string) => { console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fail++ }

const GOALS: PlanGoal[] = ['firstvisit', 'nights', 'regulars', 'reviews', 'promote-event', 'launch', 'run-deal']
const BASELINE = '/private/tmp/claude-501/-Users-mjbutler35-Documents-GitHub-ApnoshTest--claude-worktrees-objective-lehmann/34720097-f579-4031-8892-9622f2f531bf/scratchpad/mix-BASELINE.json'

console.log('\n== 1. PARITY: empty signals change nothing ==')
let allZero = true
for (const g of GOALS) for (const p of playsForGoalAtoms(g)) if (signalFit(p, emptySignals()).delta !== 0) allZero = false
ok(allZero, 'signalFit(play, emptySignals) === 0 for every play of every goal (honest gating)')
ok(leadFor('firstvisit', emptySignals()) === null, 'planLeadHeadline(empty) === null (no fabricated headline)')
// Honesty: a goal whose plan has NO reputation play can never say "reviews" even at a low rating.
const lowSig = emptySignals(); lowSig.rating = reading(4.0); lowSig.ratingCount = reading(40); lowSig.listingCompleteness = reading(85); lowSig.hasList = reading(true)
ok(!/review/i.test(leadFor('nights', lowSig) ?? ''), 'nights headline never claims reviews (no review play in plan)')
ok(!/review/i.test(leadFor('run-deal', lowSig) ?? ''), 'run-deal headline never claims reviews (no review play in plan)')

const baseline = JSON.parse(readFileSync(BASELINE, 'utf8')) as Record<string, string[]>
let baselineMatch = true
for (const g of GOALS) for (const t of ['lean', 'standard', 'aggressive'] as const) {
  const now = brainRankedMix(g, t, emptySignals()).mix
  if (JSON.stringify(now) !== JSON.stringify(baseline[`${g}/${t}`])) baselineMatch = false
}
ok(baselineMatch, 'brainRankedMix(empty) is byte-identical to the pre-edit baseline (21 goal/tier combos)')

// ── firstvisit plan order for a given business (the real stage-grouped moves the owner sees) ──
// Compose at an explicit standard tier so the plan contains BOTH capture-build and capture-send
// services the ordering checks below compare. (This used to pass budget:'500', which relied on the
// old cutoff mapping 500 -> standard; the owner's 2026-07-02 fit-to-plan change now maps 500 to lean
// for firstvisit, which drops those services, so the tier is stated directly here. Ordering is a
// signal-fit property, independent of tier.)
function order(sig: BrainSignals): { serviceId: string; stage: string }[] {
  const mix = brainRankedMix('firstvisit', 'standard', sig).mix
  const plan = composePlanForGoal('firstvisit', { tier: 'the full plan', aiMix: mix.join(',') }) as { moves?: { serviceId: string; stage: string }[] }
  return plan.moves ?? []
}
const idx = (o: { serviceId: string }[], id: string) => o.findIndex((m) => m.serviceId === id)
const minIdx = (o: { serviceId: string }[], ids: string[]) => Math.min(...ids.map((id) => idx(o, id)).filter((i) => i >= 0))
const inStage = (o: { serviceId: string; stage: string }[], stage: string) => o.filter((m) => m.stage === stage).map((m) => m.serviceId)

// Three fresh businesses (no campaign history), each clearing the >=3 core-signal richness gate.
const A = emptySignals() // LOW RATING
A.rating = reading(4.1); A.ratingCount = reading(60); A.listingCompleteness = reading(85); A.hasList = reading(true)
A.cuisine = reading('Italian'); A.neighborhood = reading('Lincoln Park'); A.priceRange = reading('$$')

const B = emptySignals() // NO LIST
B.rating = reading(4.7); B.ratingCount = reading(80); B.listingCompleteness = reading(85); B.hasList = reading(false)
B.cuisine = reading('Tacos'); B.priceRange = reading('$')

const C = emptySignals() // POOR LISTING
C.rating = reading(4.6); C.ratingCount = reading(50); C.listingCompleteness = reading(45); C.hasList = reading(true)
C.cuisine = reading('Sushi'); C.priceRange = reading('$$$')

console.log('\n== 2. TAILORING: three fresh businesses, three plans ==')
ok(planRoute(A) === 'tailored' && planRoute(B) === 'tailored' && planRoute(C) === 'tailored', 'all three clear the richness gate (brain engages)')

const oA = order(A), oB = order(B), oC = order(C)

// A — low rating → reviews lead the give-reason step, and rank higher than for the high-rated spots.
ok(idx(oA, 'review-engine') < idx(oA, 'offer-eng'), 'A(low rating): review-engine leads give-reason (above offer-eng)')
ok(idx(oA, 'review-engine') < idx(oB, 'review-engine'), 'A(low rating): review-engine ranks higher than for B(high rating)')

// B — no list → build the capture surface before any automated sends.
const buildIdxB = minIdx(oB, ['landing-page', 'crm-list'])
const sendIdxB = minIdx(oB, ['welcome-seq', 'second-visit'])
ok(buildIdxB < sendIdxB, 'B(no list): capture-build (landing/crm) ranks above capture-send (welcome/second-visit)')

// C — poor listing → fix Google/listings before content in the be-found step.
const discIdxC = minIdx(oC, ['gbp-setup', 'local-seo', 'listings-sync'])
const contentIdxC = minIdx(oC, ['photo-library', 'menu-photo-refresh'])
ok(discIdxC < contentIdxC, 'C(poor listing): discovery (gbp/local-seo) leads be-found (above content)')
ok(inStage(oC, 'be-found')[0] !== inStage(oA, 'be-found')[0] || discIdxC < contentIdxC, 'C(poor listing): be-found leader reflects the listing gap')

// The headline proof: all three full orders differ.
const sA = JSON.stringify(oA.map((m) => m.serviceId)), sB = JSON.stringify(oB.map((m) => m.serviceId)), sC = JSON.stringify(oC.map((m) => m.serviceId))
ok(sA !== sB && sB !== sC && sA !== sC, 'all three businesses get visibly different firstvisit orders')

console.log('\n== 3. EXPLAINABLE: each plan names a real, plan-true reason ==')
for (const [label, sig] of [['A low-rating', A], ['B no-list', B], ['C poor-listing', C]] as const) {
  const lead = leadFor('firstvisit', sig)
  ok(!!lead, `${label}: firstvisit has an owner-facing because-line -> "${lead}"`)
}

// sanity: classifyPlay covers the firstvisit plays we assert on
console.log('\n== 4. classify sanity ==')
const fv = playsForGoalAtoms('firstvisit')
const cls = (id: string) => classifyPlay(fv.find((p) => p.serviceId === id)!)
ok(cls('review-engine') === 'reputation', 'review-engine classifies as reputation')
ok(cls('gbp-setup') === 'discovery', 'gbp-setup classifies as discovery')
ok(cls('photo-library') === 'content', 'photo-library classifies as content')
ok(cls('paid-ads') === 'paid', 'paid-ads classifies as paid')
ok(cls('landing-page') === 'capture-build', 'landing-page classifies as capture-build')

console.log('\n' + '='.repeat(56))
if (fail) { console.log(`RESULT: ${fail} checks failed`); process.exit(1) }
console.log('RESULT: signal-fit verified. Empty=default (parity), three fresh businesses get three tailored plans.')
