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
  ledgerFor, ledgerHoles, offerApplies, demandSpikeApplies, suggestedTarget, LEDGER_DEFAULTS,
  type LedgerAnswers, type LedgerField, type LedgerKey,
} from '../../src/lib/campaigns/data/campaign-ledger'
import { known, missing, type PlanInputs } from '../../src/lib/campaigns/data/plan-inputs'
import { sanitizeRead } from '../../src/lib/campaigns/data/plan-goals'
import { WALK_TITLES, WALK_SUBS, WALK_LINES, OPTIONAL_QUESTION_SUBS, fill } from '../../src/lib/campaigns/data/walk-copy'
import { goalWorkDays, feasibilityFor, classifyDay } from '../../src/lib/campaigns/data/date-feasibility'
import { dealSentence, parseDeal, targetPresets } from '../../src/lib/campaigns/data/deal-composer'
import { afterBusinessDays } from '../../src/lib/campaigns/builder/plan-gates'
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
  shift: ['none'], avoid: [], budget: 1500, notes: '', successTarget: 300,
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
    'situation', 'when', 'start', 'assets', 'promote', 'reach', 'shift', 'avoid', 'budget', 'notes', 'successTarget',
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
  /* Touch provenance (Phase 3): a tapped default is an ANSWER. Only a never-shown question defaults. */
  s.check("a tapped 'asap' start classifies asked, not defaulted", byKey(ledgerFor(RICH_INPUTS, SIGNALS, { ...AWARENESS, touched: ['start'] })).get('start')?.tier === 'asked')
  s.check("a tapped 'local' reach classifies asked, not defaulted", byKey(ledgerFor(RICH_INPUTS, SIGNALS, { ...AWARENESS, touched: ['reach'] })).get('reach')?.tier === 'asked')
  s.check("the same values untouched still classify defaulted", byKey(ledgerFor(RICH_INPUTS, SIGNALS, AWARENESS)).get('start')?.tier === 'defaulted' && byKey(ledgerFor(RICH_INPUTS, SIGNALS, AWARENESS)).get('reach')?.tier === 'defaulted')
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
  s.check('planned-only fields (identity, visitors, specials) are never holes', !bareHoles.has('identity') && !bareHoles.has('visitors') && !bareHoles.has('specials'))
  s.check('an unconfirmed success target IS a hole (the walk asks it, with a suggestion)', bareHoles.has('successTarget'))
  s.check('a blank budget and blank notes are never holes (optional by design)', !bareHoles.has('budget') && !bareHoles.has('notes'))
  /* Phase 3 flipped this: the offer now rides the campaign brief, so an unstated offer on an
   * offer-shaped campaign is a REAL hole — which is exactly why the walk asks for it. */
  const offerHoles = new Set(ledgerHoles(ledgerFor(RICH_INPUTS, SIGNALS, { ...OFFER_DATED, offerTerms: undefined })).map((f) => f.key))
  s.check('an unstated offer IS a hole (the brief consumes it; the walk must ask)', offerHoles.has('offerTerms'))
  s.check('but a blank limit or expiry is not (optional by design: blank means none)', !offerHoles.has('offerLimit') && !offerHoles.has('offerExpiry'))
  s.check('a dated campaign with no date IS a hole', new Set(ledgerHoles(ledgerFor(RICH_INPUTS, SIGNALS, { ...OFFER_DATED, when: undefined, readKeys: ['situation'] })).map((f) => f.key)).has('when'))
}

/* ── 8. Phase 2: the wide describe read + the evidence law ────────────────────────────────── */

s.group('sanitizeRead: the evidence law — no quote in the text, no field')
{
  const TEXT = 'Grand opening Sept 12. We have about $2,000 for it, 20% off all sandwiches for the first 100 customers, want the whole city to know. Tuesdays are dead.'
  const MENU = ['Spicy Chicken Sandwich', 'Garlic Fries']
  const q = (value: unknown, quote: string) => ({ value, quote })

  const good = sanitizeRead({
    budget: q(2000, 'about $2,000'),
    reach: q('city', 'the whole city'),
    shift: q(['Monday to Wednesday'], 'Tuesdays are dead'),
    offerTerms: q('20% off all sandwiches', '20% off all sandwiches'),
    offerLimit: q('first 100 customers', 'first 100 customers'),
    promote: q(['Spicy Chicken Sandwich'], 'sandwiches'),
  }, TEXT, MENU)
  s.eq('a fully-backed read survives intact', good, {
    budget: 2000, reach: 'city', shift: ['Monday to Wednesday'],
    promote: ['Spicy Chicken Sandwich'], offerTerms: '20% off all sandwiches', offerLimit: 'first 100 customers',
  })

  s.eq('an invented quote kills the field', sanitizeRead({ budget: q(2000, 'we discussed five grand') }, TEXT, MENU), {})
  s.eq('a paraphrased quote kills the field', sanitizeRead({ reach: q('city', 'citywide reach') }, TEXT, MENU), {})
  s.eq('a missing quote kills the field', sanitizeRead({ budget: { value: 2000 } }, TEXT, MENU), {})
  s.check('case and curly quotes do not break a real quote', sanitizeRead({ budget: q(2000, 'About $2,000') }, TEXT, MENU).budget === 2000)
}

s.group('sanitizeRead: the model may not widen the vocabulary')
{
  const TEXT = 'no discounts ever, families mostly, and push the karaoke machine'
  const q = (value: unknown, quote: string) => ({ value, quote })
  s.eq('an off-list avoid value vanishes', sanitizeRead({ avoid: q(['Coupons'], 'no discounts ever') }, TEXT, []), {})
  s.check('the on-list neighbour survives', sanitizeRead({ avoid: q(['Discounts and deals', 'Coupons'], 'no discounts ever') }, TEXT, []).avoid?.length === 1)
  s.eq('an off-list audience vanishes', sanitizeRead({ audience: q(['Millennials'], 'families mostly') }, TEXT, []), {})
  s.check('the mapped audience survives', sanitizeRead({ audience: q(['Families with kids'], 'families mostly') }, TEXT, []).audience?.[0] === 'Families with kids')
  s.eq('promote not on the menu or the promote list vanishes', sanitizeRead({ promote: q(['the karaoke machine'], 'push the karaoke machine') }, TEXT, ['Pad Thai']), {})
  s.check('a promote-list value needs no menu', sanitizeRead({ promote: q(['Happy hour'], 'push the karaoke machine') }, TEXT, []).promote?.[0] === 'Happy hour')
  s.eq('an off-list reach vanishes', sanitizeRead({ reach: q('nationwide', 'push the karaoke machine') }, TEXT, []), {})
}

s.group('sanitizeRead: bounds and shapes')
{
  const TEXT = 'we can spend $2 a month or maybe $90,000, starting 2026-09-01, asap really'
  const q = (value: unknown, quote: string) => ({ value, quote })
  s.eq('a $2 budget is out of bounds', sanitizeRead({ budget: q(2, '$2 a month') }, TEXT, []), {})
  s.eq('a $90,000 budget is out of bounds', sanitizeRead({ budget: q(90000, '$90,000') }, TEXT, []), {})
  s.check('a string budget parses', sanitizeRead({ budget: q('$2,000', 'we can spend') }, TEXT, []).budget === 2000)
  s.check("start accepts 'asap' and ISO, nothing else",
    sanitizeRead({ start: q('asap', 'asap really') }, TEXT, []).start === 'asap'
    && sanitizeRead({ start: q('2026-09-01', 'starting 2026-09-01') }, TEXT, []).start === '2026-09-01'
    && sanitizeRead({ start: q('next tuesday', 'starting') }, TEXT, []).start === undefined)
  s.eq('garbage in, empty out', sanitizeRead('not an object', TEXT, []), {})
}

s.group('Ledger: wide-read fields classify read, and flip to asked without provenance')
{
  const WIDE: LedgerAnswers = {
    ...AWARENESS,
    reach: 'city', budget: 2000, avoid: ['Discounts and deals'], promote: ['Spicy Chicken Sandwich'],
    readKeys: ['situation', 'reach', 'budget', 'avoid', 'promote', 'shift', 'start'],
  }
  const rows = byKey(ledgerFor(RICH_INPUTS, SIGNALS, WIDE))
  s.check('read reach classifies read, not defaulted', rows.get('reach')?.tier === 'read')
  s.check('read budget classifies read (confirm tap does not change the source)', rows.get('budget')?.tier === 'read')
  s.check('read avoid classifies read', rows.get('avoid')?.tier === 'read')
  s.check('read promote classifies read', rows.get('promote')?.tier === 'read')
  s.check('read shift classifies read', rows.get('shift')?.tier === 'read')
  s.check("a read 'asap' start classifies read, not defaulted", rows.get('start')?.tier === 'read')
  const noProv = byKey(ledgerFor(RICH_INPUTS, SIGNALS, { ...WIDE, readKeys: ['situation'] }))
  s.check('same answers without provenance classify asked/defaulted', noProv.get('reach')?.tier === 'asked' && noProv.get('budget')?.tier === 'asked' && noProv.get('start')?.tier === 'defaulted')
}

/* ── 9. Phase 3: the suggested target + the walk law ──────────────────────────────────────── */

s.group('suggestedTarget: a number on the recipe\'s own proxy metric, never revenue')
{
  s.check('no situation, no suggestion', suggestedTarget({}) === null)
  for (const [sit, frag] of [['opening', 'door'], ['reviews', 'Google reviews'], ['slow-shifts', 'slow shifts'], ['return', 'second visits']] as const) {
    const t = suggestedTarget({ situations: [sit] })
    s.check(`${sit}: metric mentions "${frag}", value > 0`, !!t && t.metric.includes(frag) && t.value > 0)
  }
  for (const sit of ['opening', 'event', 'new-thing', 'quiet', 'slow-shifts', 'reviews', 'checks', 'catering', 'takeout', 'known', 'return']) {
    const t = suggestedTarget({ situations: [sit] })
    s.check(`${sit}: never a revenue metric`, !!t && !/revenue|sales|\$/.test(t.metric))
  }
  const offer = suggestedTarget({ situations: ['opening'], described: '20% off all week' })
  s.check('offer-shaped campaigns count redemptions', offer?.metric === 'offer redemptions')
  const capped = suggestedTarget({ situations: ['opening'], described: '20% off', offerLimit: 'first 50 customers' })
  s.check('a stated redemption limit caps the suggestion', capped?.value === 50 && capped.basis.includes('capped'))
  s.check('an uncapped offer suggestion stays modest', (suggestedTarget({ situations: ['opening'], described: '20% off' })?.value ?? 999) <= 200)
  s.check('the basis is honest about its source', suggestedTarget({ situations: ['reviews'] })?.basis.includes('typical') === true)
}

s.group('The walk law, both directions (on fixtures)')
{
  /* Direction 1 — no silent holes: a campaign whose walk completed has nothing consumed-missing. */
  const doneOffer: LedgerAnswers = {
    ...OFFER_DATED, promote: ['Spicy Chicken Sandwich'],
    offerLimit: 'first 200', offerExpiry: 'opening week',
    capacity: 'Only 40 seats; manager briefs staff Friday', successTarget: 150, notes: '',
    shift: [], avoid: [],
  }
  const holes = ledgerHoles(ledgerFor(RICH_INPUTS, SIGNALS, doneOffer)).map((f) => f.key)
  s.check('a completed offer walk leaves zero holes', holes.length === 0, `holes: ${holes.join(', ')}`)
  const holesAw = ledgerHoles(ledgerFor(RICH_INPUTS, SIGNALS, AWARENESS)).map((f) => f.key)
  s.check('a completed awareness walk leaves zero holes', holesAw.length === 0, `holes: ${holesAw.join(', ')}`)

  /* Direction 2 — no theater, no dead ends: every hole the ledger can raise has a remedy. A
   * campaign-tier hole must be a question the walk can ask; an account-tier hole is fixed in
   * the account (connect, onboarding), never by re-asking mid-walk. A hole in neither set
   * would be a dead end. */
  const ASKABLE = new Set(['situation', 'when', 'until', 'start', 'assets', 'promote', 'reach', 'shift', 'avoid', 'budget', 'notes', 'offerTerms', 'offerLimit', 'offerExpiry', 'capacity', 'successTarget'])
  const ACCOUNT = new Set(['rating', 'listingHealth', 'hasList', 'history', 'complaints', 'menu', 'knownFor', 'standsOut', 'audience', 'slowDays', 'channels'])
  const CASES: LedgerAnswers[] = [{}, OFFER_DATED, { ...OFFER_DATED, offerTerms: undefined }, { situations: ['slow-shifts'], shape: 'ongoing' }]
  for (const [i, c] of CASES.entries()) {
    const hk = ledgerHoles(ledgerFor(RICH_INPUTS, SIGNALS, c)).map((f) => f.key)
    s.check(`case ${i}: on a full account, every hole is askable`, hk.every((k) => ASKABLE.has(k)), `unaskable: ${hk.filter((k) => !ASKABLE.has(k)).join(', ')}`)
    const bare = ledgerHoles(ledgerFor(EMPTY_INPUTS, undefined, c)).map((f) => f.key)
    s.check(`case ${i}: on an empty account, every hole is askable or account-fixable`, bare.every((k) => ASKABLE.has(k) || ACCOUNT.has(k)), `dead ends: ${bare.filter((k) => !ASKABLE.has(k) && !ACCOUNT.has(k)).join(', ')}`)
  }

  /* The conditional-question law, restated on the walk's own gates: an awareness-only ongoing
   * campaign creates no offer or capacity rows at all — there is nothing for a walk to ask. */
  const awKeys = new Set(ledgerFor(RICH_INPUTS, SIGNALS, AWARENESS).map((f) => f.key))
  s.check('awareness-only: no offer or capacity rows exist to ask about', !awKeys.has('offerTerms') && !awKeys.has('capacity'))
}

/* ── 10. The walk's owner copy obeys the wording rules (QUESTION-DESIGN-PLAN P1) ──────────── */

s.group('Walk copy: the wording rules are checkable')
{
  const all = { ...WALK_TITLES, ...WALK_SUBS, ...WALK_LINES }
  for (const [k, v] of Object.entries(all)) {
    s.check(`no em or en dash: ${k}`, !/[—–]/.test(v), v)
  }
  for (const [k, v] of Object.entries(WALK_TITLES)) {
    s.check(`title ≤ 8 words: ${k}`, v.trim().split(/\s+/).length <= 8, v)
  }
  for (const k of OPTIONAL_QUESTION_SUBS) {
    s.check(`optional question '${k}' says what skipping does`, /optional|skip/i.test(WALK_SUBS[k] ?? ''), WALK_SUBS[k])
  }
  s.check('fill substitutes tokens and leaves unknowns visible', fill('about {amount} for {x}', { amount: '$2,000' }) === 'about $2,000 for {x}')
}

/* ── 11. The calendar's tints can never disagree with the gate (design plan P3) ───────────── */

s.group('Date feasibility: tints derive from real turnarounds, same split as the gate')
{
  const TODAY = '2026-07-28' // a Tuesday; injected clock
  for (const g of ['opening', 'event', 'more-new', 'get-known', 'reviews', 'regulars']) {
    s.check(`${g}: a real lead (> 0 business days)`, goalWorkDays(g) > 0, String(goalWorkDays(g)))
  }
  const lead = goalWorkDays('opening')
  const refuseLine = Math.ceil(lead / 2)
  const justUnder = afterBusinessDays(TODAY, refuseLine - 1)
  const atRefuse = afterBusinessDays(TODAY, refuseLine)
  const atLead = afterBusinessDays(TODAY, lead)
  s.check('under half the lead: too-soon (the gate would refuse)', classifyDay(justUnder, 'opening', TODAY) === 'too-soon')
  s.check('at half the lead: tight (the gate would advise)', classifyDay(atRefuse, 'opening', TODAY) === 'tight')
  s.check('at the full lead: ok (the gate is silent)', classifyDay(atLead, 'opening', TODAY) === 'ok')
  const f = feasibilityFor('opening', TODAY)
  s.check('feasibilityFor names the same two boundary days', f.firstTight === atRefuse && f.firstComfortable === atLead && f.leadDays === lead)
  s.check('a goal with no turnaround data gets the honest 10-day floor, never zero', goalWorkDays('definitely-not-a-goal') === 10)
}

/* ── 12. The deal composer: no composed deal can be vague (design plan P4) ────────────────── */

s.group('Deal composer: compose/parse round-trip, nothing vague')
{
  const DEALS = [
    { kind: 'pct' as const, amount: 20, scope: 'all sandwiches' },
    { kind: 'usd' as const, amount: 10, scope: 'everything' },
    { kind: 'free' as const, scope: 'drink with any entree' },
    { kind: 'bogo' as const, scope: 'tacos' },
  ]
  for (const d of DEALS) {
    const line = dealSentence(d)
    s.check(`${d.kind}: composes a concrete sentence`, !!line && line.length > 5, line)
    const back = parseDeal(line ?? undefined)
    s.check(`${d.kind}: parses back to the same deal`, !!back && back.kind === d.kind && back.scope === d.scope && (back.amount ?? null) === (d.amount ?? null))
    s.check(`${d.kind}: no em dash in the coupon line`, !/[—–]/.test(line ?? ''))
  }
  s.check('an empty scope cannot compose', dealSentence({ kind: 'pct', amount: 20, scope: '  ' }) === null)
  s.check('a zero or absurd percent cannot compose', dealSentence({ kind: 'pct', amount: 0, scope: 'x' }) === null && dealSentence({ kind: 'pct', amount: 100, scope: 'x' }) === null)
  s.check('free text from the escape does not false-parse', parseDeal('buy my cousin a boat and eat free forever') === null)
  /* The redemption-cap round trip: a composed limit still caps suggestedTarget. */
  const capped = suggestedTarget({ situations: ['opening'], described: '20% off', offerLimit: 'First 150 customers' })
  s.check('a composed limit caps the suggested target', capped?.value === 150)
}

s.group('Target presets: careful under, ambitious over, never zero')
{
  const tp = targetPresets(200)
  s.eq('anchored at 200', tp, { careful: 140, suggested: 200, ambitious: 300 })
  const tiny = targetPresets(1)
  s.check('a tiny anchor never collapses to zero', tiny.careful >= 1 && tiny.ambitious >= 2)
}

const ok = s.report('Campaign ledger (Phases 1-3 + walk design)')
process.exit(ok ? 0 : 1)
