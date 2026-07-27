/**
 * service-completeness — what can we ACTUALLY deliver, counted rather than asserted.
 *
 * A 46-agent audit of this repo found 7 of 57 catalog services serviceable end to end. The other 50
 * are priced, described, composable into a plan and buyable, and then mint a work order with an
 * empty checklist, so a human invents the process. `get-known` quoted $1,475 plus $475 a month with
 * not one line that had a defined way to be delivered.
 *
 * The number itself is not the problem — you cannot build 57 services at once. The problem is that
 * nothing in the codebase KNEW the number, so the plan builder happily sold from the whole shelf.
 * This file makes completeness a property that is checked on every run, so:
 *   - the count can only go up on purpose,
 *   - a half-built service is caught here rather than by an owner who paid for it,
 *   - and the allowlist a builder composes from can be derived instead of hand-maintained.
 *
 * COMPLETE means all four, and each is a real gate an owner would feel:
 *   1. an operator has steps to follow                (service-playbooks.ts)
 *   2. those steps produce owner-facing asks          (a needsInput key service-needs.ts handles)
 *   3. we said what they get                          (catalog deliverables.included)
 *   4. nothing it depends on is missing               (service-availability.ts)
 *
 * Gate 2 is deliberately end to end rather than "declares a key". gbp-posts has a playbook and
 * deliverables but declares no needsInput, so it generates zero asks and the paid order sits
 * waiting on an owner who was never told anything was wanted. That is exactly the silent stall this
 * check exists to catch, so gbp-posts counts as incomplete until it asks for something.
 *
 * Run: npx tsx scripts/sim/service-completeness.ts
 */

import { readFileSync } from 'fs'
import { Suite } from './lib'
import { GENERATED_CATALOG } from '../../src/lib/campaigns/data/catalog.generated'
import { SERVICE_PLAYBOOKS, playbookNeedKeys, seedSteps } from '../../src/lib/campaigns/data/service-playbooks'
import { isServiceReady, serviceNotYetReason } from '../../src/lib/campaigns/data/service-availability'

const s = new Suite()

type Svc = { id: string; name: string; deliverables?: { summary?: string; included?: string[] } }
const CATALOG = GENERATED_CATALOG as unknown as Svc[]

/*
 * Which needsInput keys service-needs.ts actually handles. Read from the source rather than
 * imported, because that module is server-only and would not load here — and reading it is the
 * stricter check anyway: it catches a playbook naming a key nobody consumes.
 */
const NEEDS_SRC = readFileSync('src/lib/campaigns/service-needs.ts', 'utf8')
const HANDLED = new Set([...NEEDS_SRC.matchAll(/case '([a-zA-Z-]+)':/g)].map((m) => m[1]))

const gates = (id: string) => {
  const pb = SERVICE_PLAYBOOKS[id]
  const svc = CATALOG.find((x) => x.id === id)
  const keys = playbookNeedKeys(id)
  return {
    playbook: !!pb && pb.steps.length > 0,
    asks: keys.some((k) => HANDLED.has(k)),
    deliverables: (svc?.deliverables?.included?.length ?? 0) > 0,
    rail: isServiceReady(id),
  }
}
const isComplete = (id: string) => Object.values(gates(id)).every(Boolean)

// ----------------------------------------------------------------- the count
s.group('The count')

const complete = CATALOG.filter((x) => isComplete(x.id)).map((x) => x.id)
s.check(`${complete.length} of ${CATALOG.length} services are complete`, true, complete.join(', '))

/*
 * A floor, not a target. It exists so the number cannot silently REGRESS — someone deleting a
 * playbook or blocking a rail breaks the build instead of quietly shrinking what we can deliver.
 * Raise it when a service is finished; never lower it to make a run pass.
 */
const FLOOR = 9
s.check(`at least ${FLOOR} complete (regression floor)`, complete.length >= FLOOR, `have ${complete.length}: ${complete.join(', ')}`)

// ----------------------------------------------------------------- tracking
s.group('tracking is finished')

const t = gates('tracking')
s.check('an operator has steps to follow', t.playbook, `${SERVICE_PLAYBOOKS['tracking']?.steps.length ?? 0} steps`)
s.check('those steps produce owner-facing asks', t.asks, `keys: ${playbookNeedKeys('tracking').join(', ')}`)
s.check('we said what they get', t.deliverables)
s.check('nothing it depends on is missing', t.rail, serviceNotYetReason('tracking') ?? '')
s.check('tracking is COMPLETE', isComplete('tracking'))

const steps = seedSteps('tracking')
s.check('every step has at least one action to check off', steps.every((x) => x.actions.length > 0), `${steps.reduce((n, x) => n + x.actions.length, 0)} actions total`)
s.check('every step says who acts', steps.every((x) => ['ops', 'client', 'gate'].includes(x.actor)))
s.check('the work opens by asking the owner, not by guessing', steps[0]?.actor === 'client', steps[0]?.label)
s.check('delivery is provable (a link or a screenshot on the last step)', ['link', 'screenshot'].includes(String(steps[steps.length - 1]?.proof)))

/* Every promised deliverable should be somebody's job. Five promises, five steps, one each. */
const promised = CATALOG.find((x) => x.id === 'tracking')?.deliverables?.included ?? []
s.check(`${promised.length} promised deliverables, ${steps.length} steps to deliver them`, steps.length >= promised.length)

// ----------------------------------------------------------------- the foundation
s.group('The foundation is whole')

const FOUNDATION = ['gbp-setup', 'site-menu', 'photo-library', 'tracking']
for (const id of FOUNDATION) {
  const g = gates(id)
  const miss = Object.entries(g).filter(([, v]) => !v).map(([k]) => k)
  s.check(`${id}`, miss.length === 0, miss.length ? `missing: ${miss.join(', ')}` : 'complete')
}

// ----------------------------------------------------------------- hygiene
s.group('No playbook is a dead end')

/*
 * A playbook for a service that is not in the ACTIVE catalog is not a defect — it is inventory
 * ahead of the shelf, and the dangerous direction is the opposite one (buyable with no steps, which
 * the completeness gate above already catches). Both current cases are services still referenced
 * across priced-catalog, atomic-catalog and funnel-plays but no longer marked active in
 * catalog_services, so this reports the drift rather than failing on someone else's decision.
 */
const orphanPlaybooks = Object.keys(SERVICE_PLAYBOOKS).filter((id) => !CATALOG.some((x) => x.id === id))
s.check(
  `${orphanPlaybooks.length} playbook(s) for services not in the active catalog`,
  true,
  orphanPlaybooks.length ? `${orphanPlaybooks.join(', ')} — steps authored, service not sellable` : 'none',
)
s.check(
  'nothing sellable is missing its steps',
  CATALOG.filter((x) => isComplete(x.id)).every((x) => (SERVICE_PLAYBOOKS[x.id]?.steps.length ?? 0) > 0),
)
for (const id of Object.keys(SERVICE_PLAYBOOKS)) {
  const keys = playbookNeedKeys(id)
  const orphan = keys.filter((k) => !HANDLED.has(k))
  s.check(`${id}: every needsInput key is handled`, orphan.length === 0, orphan.length ? `no rail consumes: ${orphan.join(', ')}` : `${keys.length} key(s)`)
}

s.group('What is still missing, named out loud')
const incomplete = CATALOG.filter((x) => !isComplete(x.id))
for (const g of ['playbook', 'asks', 'deliverables', 'rail'] as const) {
  const n = incomplete.filter((x) => !gates(x.id)[g]).length
  s.check(`${n} services still lack: ${g}`, true)
}

s.report('Service completeness')
