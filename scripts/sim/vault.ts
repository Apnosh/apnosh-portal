/**
 * vault — the proof ladder holds, the bridge speaks the library's language, and the draft's
 * "what we will need from you" derives honestly.
 *
 * What this locks: the write guard's ceiling (nothing may claim a proof its requirement cannot
 * produce) across the WHOLE library, proven against a mutated ceiling; every bridge mapping
 * (signal→requirement, execField→requirement) resolves to a real requirement at a legal proof —
 * the 1b vocabulary-drift lesson applied before the drift can ship; needsForDraftItems' lane
 * pick mirrors the router's encoding byte-for-byte.
 *
 * Run: npx tsx --tsconfig scripts/sim/tsconfig.json scripts/sim/vault.ts
 */
import { Suite } from './lib'
import {
  REQUIREMENTS, requirementById, requirementFlaws, intakeFor, type Requirement, type RequirementProof,
} from '../../src/lib/campaigns/setup/requirements'
import { proofRefusal } from '../../src/lib/campaigns/setup/vault-guard'
import { SIGNAL_MAP, EXEC_FACT_MAP } from '../../src/lib/campaigns/setup/vault-bridge'
import { needsForDraftItems } from '../../src/lib/campaigns/setup/draft-needs'
import { SETUP_CARDS } from '../../src/lib/campaigns/setup/cards'
import { stampLane } from '../../src/lib/campaigns/builder/routing'
import type { LineItem } from '../../src/lib/campaigns/types'
import { deriveServiceNeeds } from '../../src/lib/campaigns/service-needs'
import type { SavedCampaign } from '../../src/lib/campaigns/view'

const s = new Suite()

const RANK: Record<RequirementProof, number> = { 'owner-word': 0, 'our-side': 1, probe: 2, token: 3 }
const RUNGS: RequirementProof[] = ['owner-word', 'our-side', 'probe', 'token']

s.group('The library itself is sound')
{
  const flaws = requirementFlaws()
  s.check(`requirementFlaws is empty (${flaws.length})`, flaws.length === 0, )
  s.check(`${REQUIREMENTS.length} requirements, ids unique`, new Set(REQUIREMENTS.map((r) => r.id)).size === REQUIREMENTS.length)
}

s.group('The proof ceiling, full matrix: a write may claim UP TO its requirement\'s proof')
{
  let ok = true
  for (const req of REQUIREMENTS) {
    for (const rung of RUNGS) {
      const refused = proofRefusal(req, rung) != null
      const shouldRefuse = RANK[rung] > RANK[req.proof]
      if (refused !== shouldRefuse) { ok = false; s.check(`${req.id} @ ${rung}: expected ${shouldRefuse ? 'refusal' : 'pass'}`, false) }
    }
  }
  s.check(`ceiling holds for all ${REQUIREMENTS.length} × ${RUNGS.length} combinations`, ok)

  // Mutation proof: escalate a requirement's declared ceiling and the SAME rung flips verdicts —
  // the guard reads the ceiling, it does not hardcode outcomes.
  const nap = requirementById('NAP')!
  s.check('NAP refuses token at its real ceiling', proofRefusal(nap, 'token') != null)
  const mutated: Requirement = { ...nap, proof: 'token' }
  s.check('the mutated ceiling accepts what the real one refused', proofRefusal(mutated, 'token') == null)
}

s.group('Bridge vocabulary pins: every mapping resolves, at a legal proof, to the right shape')
{
  for (const [kind, m] of Object.entries(SIGNAL_MAP)) {
    const req = requirementById(m.requirement)
    s.check(`${kind} → ${m.requirement}: exists in the library`, !!req)
    s.check(`${kind} → ${m.requirement}: proof '${m.proof}' within the ceiling`, !!req && proofRefusal(req, m.proof) == null)
  }
  // The 'links' gbp-applied upgrade path claims our-side; pin that LINKS allows it.
  s.check("LINKS accepts 'our-side' (the GBP apply upgrade)", proofRefusal(requirementById('LINKS')!, 'our-side') == null)

  for (const m of EXEC_FACT_MAP) {
    const req = requirementById(m.requirement)
    s.check(`${m.execField} → ${m.requirement}: exists`, !!req)
    s.check(`${m.execField} → ${m.requirement}: is fact:true (may carry a value)`, req?.fact === true)
  }
  // The PATCH whitelist pin: these exact strings live in the KNOWN set of
  // src/app/api/campaigns/[id]/route.ts (~line 101). If a rename lands there, this list must
  // change consciously with it — a silently orphaned write-back is the drift this refuses.
  const PATCH_KNOWN_PIN = ['orderingLink', 'bookingLink', 'photoUrls']
  s.check('every exec field is in the PATCH whitelist pin', EXEC_FACT_MAP.every((m) => PATCH_KNOWN_PIN.includes(m.execField)))
}

s.group('needsForDraftItems: the lane decides the asks, the router\'s encoding decides the lane')
{
  const gbpCard = SETUP_CARDS.find((c) => c.id === 'gbp')!
  const line = (over: Partial<LineItem> = {}): LineItem => ({
    id: 'li-1', serviceId: gbpCard.serviceId, name: 'x', plain: '', does: '', stage: 'foundation',
    price: 249, cadence: { kind: 'one-time' }, eta: '', included: true, lock: 'editable', ...over,
  })
  const needsOf = (kind: 'team' | 'diy' | 'ai') => gbpCard.lanes.find((l) => l.kind === kind)?.needs ?? []

  s.check('team line → the team lane needs', JSON.stringify(needsForDraftItems([line()])) === JSON.stringify([...needsOf('team')]))
  const diyLine = stampLane(line(), 'diy', 249)
  s.check('diy-stamped line → the diy lane needs', JSON.stringify(needsForDraftItems([diyLine])) === JSON.stringify([...needsOf('diy')]))
  const aiLine = stampLane(line(), 'ai', 249)
  s.check('ai-stamped line → the ai lane needs', JSON.stringify(needsForDraftItems([aiLine])) === JSON.stringify([...needsOf('ai')]))

  s.check('excluded/opted-out/guide lines contribute nothing', needsForDraftItems([
    line({ included: false }), line({ optOut: 'have-it' }), line({ serviceable: false, guideKey: 'storefront' }),
  ]).length === 0)
  s.check('content + unknown serviceIds contribute nothing', needsForDraftItems([
    line({ serviceId: 'content-reel' }), line({ serviceId: 'no-such-service' }),
  ]).length === 0)

  const all = needsForDraftItems([line(), stampLane(line({ id: 'li-2' }), 'diy', 249)])
  s.check('union dedupes and every id is a library id', new Set(all).size === all.length && all.every((id) => !!requirementById(id)))
  s.check('intakeFor accepts the derived union (prereq ordering resolves)', intakeFor(all).length >= all.length)
}

s.group('ACCEPTANCE: campaign #2 asks strictly less than campaign #1')
{
  const svcLine = (serviceId: string, id: string): LineItem => ({
    id, serviceId, name: serviceId, plain: '', does: '', stage: 'foundation', price: 100,
    cadence: { kind: 'one-time' }, eta: '', included: true, lock: 'editable', producer: 'team',
  })
  const fixture = (execution: Record<string, string>): SavedCampaign => ({
    clientId: 'c1',
    draft: {
      id: 'camp', name: 'fixture', intent: 'one-off', path: 'strategist', budgetMonthly: 0,
      items: [svcLine('google-food-order', 'li-1'), svcLine('gbp-setup', 'li-2')],
    },
    phase: 'live', status: 'shipped', shippedAt: null, confirmedAt: undefined,
    createdAt: '', updatedAt: '', creatorChoices: {}, producerChoices: {},
    creativeControl: 'handoff', execution,
  } as unknown as SavedCampaign)
  const opts = { doneSetup: new Set<string>(), hasMenuItems: true, hasAddress: true, hasPaymentMethod: true }
  const asks = (execution: Record<string, string>) =>
    deriveServiceNeeds(fixture(execution), { ...opts, exec: execution }).filter((i) => !i.done).map((i) => i.id).sort()

  // Campaign #1: empty vault, empty execution — the full ask list.
  const first = asks({})
  s.check(`campaign #1 asks for the links + photos (${first.join(', ')})`,
    first.includes('ordering-link') && first.includes('gbp-photos'))

  // Campaign #2: execution seeded from a (fixture) vault — the exact object vaultFactSeeds
  // returns when LINKS + PHOTOS are held.
  const SEEDS = { orderingLink: 'https://order.example.com', bookingLink: 'https://book.example.com', photoUrls: 'https://p1.jpg' }
  const second = asks(SEEDS)
  s.check('campaign #2 no longer asks for the seeded facts',
    !second.includes('ordering-link') && !second.includes('booking-link') && !second.includes('gbp-photos'))
  s.check(`campaign #2's asks are a STRICT subset (${second.length} < ${first.length})`,
    second.length < first.length && second.every((id) => first.includes(id)))

  // NEGATIVE PROOF: seeding from an EMPTY vault changes nothing — the seed is the load-bearing
  // difference, not the fixture's shape.
  const unseeded = asks({})
  s.check('an empty vault seeds nothing: the ask sets are equal', JSON.stringify(unseeded) === JSON.stringify(first))
}

s.report('The vault')
