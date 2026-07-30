/**
 * campaign-ledger — the intake contract, pinned (Phase 1 of docs/CAMPAIGN-LEDGER-PLAN.md).
 *
 * What this locks:
 *   - every question the walk can ask maps to a ledger field (no question without a home)
 *   - every field the composer/brief consumes today appears in the ledger (no silent inputs)
 *   - the ONLY fields that may classify 'defaulted' are reach and start (owner rule 2026-07-29)
 *   - offer economics can never default, and enter the ledger only for offer-shaped campaigns
 *   - the capacity check appears only when the shape creates a demand spike; an awareness-only
 *     ongoing campaign must never see it
 *   - provenance works: a key in readKeys classifies 'read'; the same answer without it, 'asked'
 *   - account facts classify 'known' when loaders hold them and 'missing' (loudly) when not
 *
 * Run: npx tsx scripts/sim/campaign-ledger.ts
 */
import { Suite } from './lib'
import {
  ledgerFor, ledgerHoles, offerApplies, demandSpikeApplies, LEDGER_DEFAULTS,
  type LedgerAnswers, type LedgerField, type LedgerKey,
} from '../../src/lib/campaigns/data/campaign-ledger'
import { known, missing, type PlanInputs } from '../../src/lib/campaigns/data/plan-inputs'
import type { MonthlySignals } from '../../src/lib/campaigns/data/monthly-signals'
import { SITUATIONS } from '../../src/lib/campaigns/data/plan-goals'

const s = new Suite()

/* ── fixtures ─────────────────────────────────────────────────────────────────────────────── */

const RICH_INPUTS: PlanInputs = {
  goal: known('firstvisit' as PlanInputs['goal']['value'] & string, 'onboarding'),
  goalWords: known('more new faces', 'onboarding'),
  budget: known(1500, 'onboarding'),
  knownFor: known(['Spicy Chicken Sandwich'], 'menu'),
  standsOut: known('Everything made fresh daily', 'onboarding'),
  audience: known(['families', 'late-night'], 'onboarding'),
  slowDays: known(['Tuesday'], 'onboarding'),
  channels: [{ key: 'gbp', name: 'Google Business Profile', connected: true, canPost: true, costOfMissing: '', href: '/x' }],
  menu: [{ id: 'm1', name: 'Spicy Chicken Sandwich', featured: true }],
}

const EMPTY_INPUTS: PlanInputs = {
  goal: missing(), goalWords: missing(), budget: missing(), knownFor: missing(),
  standsOut: missing(), audience: missing(), slowDays: missing(), channels: [], menu: [],
}

const SIGNALS: MonthlySignals = {
  droppedServiceIds: ['sms-program'], workingServiceIds: ['review-engine'],
  rating: 4.2, listingCompleteness: 62, hasList: false,
  complaintThemes: ['photos look old'], assembledAt: '2026-07-29T00:00:00Z',
}

/** A fully-answered ongoing campaign with no offer language anywhere. */
const AWARENESS: LedgerAnswers = {
  situations: ['known'], shape: 'ongoing', start: 'asap',
  assets: [], promote: ['Spicy Chicken Sandwich'], reach: 'local',
  shift: ['none'], avoid: [], budget: 1500, notes: '',
  described: 'I want more people around here to know we exist.',
}

/** A dated opening with an offer read out of the paragraph. */
const OFFER_DATED: LedgerAnswers = {
  situations: ['opening'], shape: 'date', when: '2026-09-12',
  assets: ['photos'], promote: ['grand opening'], reach: 'local',
  budget: 4000, described: 'Grand opening Sept 12, we want to do 20% off all sandwiches that week.',
  readKeys: ['situation', 'when', 'assets'],
  offerTerms: '20% off all sandwiches',
}

const byKey = (rows: LedgerField[]) => new Map(rows.map((r) => [r.key, r]))

/* ── 1. every question maps to a ledger field ─────────────────────────────────────────────── */

s.group('Every question the walk can ask has a ledger field')
{
  // The walk's steps: 'start' and 'money' plus every PlanQuestion any situation declares.
  const QUESTION_TO_KEY: Record<string, LedgerKey> = {
    start: 'start', money: 'budget',
    assets: 'assets', promote: 'promote', reach: 'reach', shift: 'shift', avoid: 'avoid',
  }
  const declared = new Set<string>(['start', 'money'])
  for (const sit of Object.values(SITUATIONS)) for (const n of sit.needs) declared.add(n)

  const rows = byKey(ledgerFor(RICH_INPUTS, SIGNALS, AWARENESS))
  for (const q of declared) {
    const key = QUESTION_TO_KEY[q]
    s.check(`question '${q}' maps to ledger key '${key ?? '??'}'`, key != null && rows.has(key), key == null ? `no mapping for walk question '${q}' — extend the ledger` : undefined)
  }
}

/* ── 2. every consumed field appears ──────────────────────────────────────────────────────── */

s.group('Every field the composer/briefs consume today appears in the ledger')
{
  const CONSUMED_TODAY: LedgerKey[] = [
    // tilt M2-M6 inputs
    'rating', 'listingHealth', 'hasList', 'history', 'complaints',
    // brief + walk inputs
    'menu', 'knownFor', 'standsOut', 'audience', 'slowDays', 'channels',
    'situation', 'when', 'start', 'assets', 'promote', 'reach', 'shift', 'avoid', 'budget', 'notes',
  ]
  const rows = byKey(ledgerFor(RICH_INPUTS, SIGNALS, AWARENESS))
  for (const k of CONSUMED_TODAY) s.check(`'${k}' present`, rows.has(k))
  s.check("'until' appears exactly when the shape is a run", !rows.has('until') && byKey(ledgerFor(RICH_INPUTS, SIGNALS, { ...AWARENESS, shape: 'run', when: '2026-08-01', until: '2026-08-21' })).has('until'))
  // Phase-4 widening rows are named holes, not absent
  for (const k of ['identity', 'serviceModel', 'visitors', 'specials'] as LedgerKey[]) {
    s.check(`future field '${k}' is listed (tier missing, planned consumer)`, rows.get(k)?.tier === 'missing' && (rows.get(k)?.consumedBy ?? []).every((c) => c.startsWith('planned:')))
  }
}

/* ── 3. the defaults law ──────────────────────────────────────────────────────────────────── */

s.group("Only reach and start may ever classify 'defaulted' (owner rule)")
{
  const CASES: LedgerAnswers[] = [
    {}, // nothing answered at all
    { situations: ['known'], shape: 'ongoing' },
    AWARENESS,
    OFFER_DATED,
    { ...OFFER_DATED, offerTerms: undefined }, // offer detected but unanswered
    { situations: ['slow'], shape: 'run', when: '2026-08-01', until: '2026-08-30', described: 'happy hour deal all month' },
  ]
  for (const [i, a] of CASES.entries()) {
    const defaulted = ledgerFor(RICH_INPUTS, SIGNALS, a).filter((r) => r.tier === 'defaulted').map((r) => r.key)
    s.check(`case ${i}: defaulted ⊆ {reach, start}`, defaulted.every((k) => k === 'reach' || k === 'start'), `defaulted: ${defaulted.join(', ')}`)
  }
  const empty = byKey(ledgerFor(EMPTY_INPUTS, undefined, {}))
  s.check('unanswered reach defaults to local, out loud', empty.get('reach')?.tier === 'defaulted' && empty.get('reach')?.value === LEDGER_DEFAULTS.reach)
  s.check('unanswered start defaults to asap, out loud', empty.get('start')?.tier === 'defaulted' && empty.get('start')?.value === LEDGER_DEFAULTS.start)
  s.check('a dated campaign has no start row (the date IS the start)', !byKey(ledgerFor(RICH_INPUTS, SIGNALS, OFFER_DATED)).has('start'))
  s.check('an explicit non-default reach classifies asked', byKey(ledgerFor(RICH_INPUTS, SIGNALS, { ...AWARENESS, reach: 'city' })).get('reach')?.tier === 'asked')
}

/* ── 4. offer economics: conditional, never default ───────────────────────────────────────── */

s.group('Offer economics enter only for offer-shaped campaigns and can never default')
{
  s.check('awareness campaign: no offer language → no offer rows', !offerApplies(AWARENESS) && !byKey(ledgerFor(RICH_INPUTS, SIGNALS, AWARENESS)).has('offerTerms'))
  s.check('20% off in the paragraph → offerApplies', offerApplies(OFFER_DATED))
  s.check('an explicit offerTerms answer alone → offerApplies', offerApplies({ offerTerms: 'free drink with entree' }))
  for (const text of ['BOGO wings on Tuesdays', 'happy hour from 4', 'half off desserts', '2-for-1 tacos', 'free appetizer for first visits']) {
    s.check(`detects: "${text}"`, offerApplies({ described: text }))
  }
  for (const text of ['grand opening party with a DJ', 'we hired a new chef', 'more catering business']) {
    s.check(`ignores: "${text}"`, !offerApplies({ described: text }))
  }
  const offerRows = ledgerFor(RICH_INPUTS, SIGNALS, OFFER_DATED)
  const offer = byKey(offerRows)
  for (const k of ['offerTerms', 'offerLimit', 'offerExpiry'] as LedgerKey[]) {
    s.check(`'${k}' present, neverDefault, appliesWhen offer`, offer.get(k)?.neverDefault === true && offer.get(k)?.appliesWhen === 'offer')
    s.check(`'${k}' never classifies defaulted (answered or not)`, offer.get(k)?.tier !== 'defaulted' && byKey(ledgerFor(RICH_INPUTS, SIGNALS, { ...OFFER_DATED, offerTerms: undefined })).get(k)?.tier !== 'defaulted')
  }
  s.check('the stated offer classifies read/asked, the unstated limit is loudly missing', offer.get('offerTerms')?.tier === 'asked' && offer.get('offerLimit')?.tier === 'missing')
}

/* ── 5. the capacity check: demand-spike shapes only ──────────────────────────────────────── */

s.group('Capacity check appears only when the shape creates a demand spike')
{
  s.check('awareness-only ongoing → never asked', !demandSpikeApplies(AWARENESS) && !byKey(ledgerFor(RICH_INPUTS, SIGNALS, AWARENESS)).has('capacity'))
  s.check('offer-driven → asked', demandSpikeApplies({ described: '20% off all week' }))
  s.check('event-anchored (dated) → asked', demandSpikeApplies({ shape: 'date' }))
  s.check('time-boxed (run) → asked', demandSpikeApplies({ shape: 'run' }))
  const cap = byKey(ledgerFor(RICH_INPUTS, SIGNALS, OFFER_DATED)).get('capacity')
  s.check("row carries appliesWhen 'demand-spike'", cap?.appliesWhen === 'demand-spike')
  s.check('unanswered capacity is missing, never defaulted', cap?.tier === 'missing')
  s.check('an answer classifies asked', byKey(ledgerFor(RICH_INPUTS, SIGNALS, { ...OFFER_DATED, capacity: 'Only 40 seats; chef briefs staff Friday' })).get('capacity')?.tier === 'asked')
}

/* ── 6. provenance: readKeys → tier 'read' ────────────────────────────────────────────────── */

s.group("Provenance: a key in readKeys classifies 'read'; without it, 'asked'")
{
  const read = byKey(ledgerFor(RICH_INPUTS, SIGNALS, OFFER_DATED))
  s.check('situation read from the paragraph', read.get('situation')?.tier === 'read')
  s.check('date read from the paragraph', read.get('when')?.tier === 'read')
  s.check('assets read from the paragraph', read.get('assets')?.tier === 'read')
  const asked = byKey(ledgerFor(RICH_INPUTS, SIGNALS, { ...OFFER_DATED, readKeys: [] }))
  s.check('same answers with no provenance → asked', asked.get('situation')?.tier === 'asked' && asked.get('when')?.tier === 'asked' && asked.get('assets')?.tier === 'asked')
  s.check('promote was answered in the walk, not read', read.get('promote')?.tier === 'asked')
}

/* ── 7. known classification + holes ──────────────────────────────────────────────────────── */

s.group('Account facts classify known when held, missing (loudly) when not')
{
  const rich = byKey(ledgerFor(RICH_INPUTS, SIGNALS, AWARENESS))
  for (const k of ['rating', 'listingHealth', 'hasList', 'history', 'complaints', 'menu', 'knownFor', 'standsOut', 'slowDays', 'channels'] as LedgerKey[]) {
    s.check(`'${k}' known on the rich fixture`, rich.get(k)?.tier === 'known')
  }
  s.check('onboarding audience is known when the walk did not override it', rich.get('audience')?.tier === 'known')
  s.check('a walk audience answer outranks the onboarding value', byKey(ledgerFor(RICH_INPUTS, SIGNALS, { ...AWARENESS, audience: ['students'] })).get('audience')?.tier === 'asked')
  const bare = byKey(ledgerFor(EMPTY_INPUTS, undefined, {}))
  for (const k of ['rating', 'listingHealth', 'hasList', 'menu', 'knownFor', 'audience'] as LedgerKey[]) {
    s.check(`'${k}' missing on the empty fixture`, bare.get(k)?.tier === 'missing')
  }
}

s.group('ledgerHoles: only consumed-today missing fields count')
{
  const fullHoles = ledgerHoles(ledgerFor(RICH_INPUTS, SIGNALS, AWARENESS)).map((f) => f.key)
  s.check('a fully-answered campaign on a rich account has no consumed-today holes', fullHoles.length === 0, `holes: ${fullHoles.join(', ')}`)
  const bareHoles = new Set(ledgerHoles(ledgerFor(EMPTY_INPUTS, undefined, {})).map((f) => f.key))
  s.check('an empty intake has situation as a hole', bareHoles.has('situation'))
  s.check("planned-only fields (identity, visitors, specials, offer economics) are never holes", !bareHoles.has('identity') && !bareHoles.has('visitors') && !bareHoles.has('specials') && !bareHoles.has('successTarget'))
  const offerHoles = new Set(ledgerHoles(ledgerFor(RICH_INPUTS, SIGNALS, { ...OFFER_DATED, offerTerms: undefined })).map((f) => f.key))
  s.check('an unstated offer is NOT yet a hole (composer does not consume it until Phase 4)', !offerHoles.has('offerTerms'))
  s.check('a dated campaign with no date IS a hole', new Set(ledgerHoles(ledgerFor(RICH_INPUTS, SIGNALS, { ...OFFER_DATED, when: undefined, readKeys: ['situation'] })).map((f) => f.key)).has('when'))
}

const ok = s.report('Campaign ledger (Phase 1)')
process.exit(ok ? 0 : 1)
