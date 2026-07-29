/**
 * lane-routing — laws 1 and 2 over the router, with the mutations that prove the checker bites.
 *
 * Law 1 (platform law): a lane may not promise what the platform cannot do. The router reads
 * lane truth off law-clean setup cards / the rail law / the manifest, and routeViolations
 * re-derives every available offer — so a doctored route or a mutated card is caught by
 * arithmetic, not by trust.
 *
 * Law 2 (orphan rule): a composed move always has at least one lane that can carry it and an
 * available default; all four lanes always render (unavailable ghosts, never hides). A move
 * that could silently vanish is a build failure here, not a support ticket later.
 *
 * Run: npx tsx --tsconfig scripts/sim/tsconfig.json scripts/sim/lane-routing.ts
 */
import { Suite } from './lib'
import {
  routeForItem, routeViolations, stampLane, applyLaneDefaults, LANE_ORDER,
  type Lane, type MoveRoute, type RouteContext,
} from '../../src/lib/campaigns/builder/routing'
import { SETUP_CARDS } from '../../src/lib/campaigns/setup/cards'
import { laneViolations, type SetupCard } from '../../src/lib/campaigns/setup/types'
import { isServiceReady, serviceNotYetReason } from '../../src/lib/campaigns/data/service-availability'
import { draftFromBuilder, gbpLaneFromDoer } from '../../src/lib/campaigns/builder/adapter'
import { AI_DRAFT_CENTS } from '../../src/lib/campaigns/catalog'
import type { LineItem, PieceProducer } from '../../src/lib/campaigns/types'
import { mintableServiceLine } from '../../src/lib/campaigns/service-work-orders'
import { lineTotal } from '../../src/lib/campaigns/types'

const s = new Suite()

/** A minimal service line for probing legality directly. */
const line = (serviceId: string, over: Partial<LineItem> = {}): LineItem => ({
  id: `li-${serviceId}`, serviceId, name: serviceId, plain: '', does: '', stage: 'foundation',
  price: 100, cadence: { kind: 'one-time' }, eta: '', included: true, lock: 'editable', ...over,
})

s.group('Vocabulary pins: one lane language')
{
  const laneIsProducer: Record<Lane, PieceProducer> = { team: 'team', creator: 'creator', diy: 'diy', ai: 'ai' }
  s.check('Lane ≡ PieceProducer (4 values, exhaustive)', Object.keys(laneIsProducer).length === 4)
  s.check('LANE_ORDER covers all four exactly once', new Set(LANE_ORDER).size === 4 && LANE_ORDER.length === 4)
  for (const card of SETUP_CARDS) {
    s.check(`${card.id}: every setup lane kind is a Lane`, card.lanes.every((l) => (LANE_ORDER as readonly string[]).includes(l.kind)))
  }
}

s.group('Law 1: setup-card lanes offer ⇔ the card carries them')
{
  for (const card of SETUP_CARDS) {
    const route = routeForItem(line(card.serviceId))
    const offers = new Map(route.lanes.map((o) => [o.lane, o]))
    for (const kind of ['diy', 'ai'] as const) {
      const onCard = card.lanes.some((l) => l.kind === kind)
      s.check(`${card.id}/${kind}: offered ⇔ on the card`, offers.get(kind)?.available === onCard)
    }
    const teamExpected = isServiceReady(card.serviceId)
    s.check(`${card.id}/team: offered ⇔ rail-ready`, offers.get('team')?.available === teamExpected)
    s.check(`${card.id}: creator never offered on a service`, offers.get('creator')?.available === false)
    s.check(`${card.id}: zero violations`, routeViolations(line(card.serviceId), route).length === 0)
  }
}

s.group('Law 1: held rails refuse the team lane with the rail\'s own sentence')
{
  for (const id of ['sms-program', 'winback']) {
    const route = routeForItem(line(id))
    const team = route.lanes.find((o) => o.lane === 'team')!
    s.check(`${id}: team unavailable`, team.available === false)
    s.check(`${id}: whyNot is the rail sentence verbatim`, team.whyNot === serviceNotYetReason(id))
  }
}

s.group('Law 1 mutations: the checker bites')
{
  // A card whose platform can no longer write: the router must refuse the lanes it read before.
  const gbp = SETUP_CARDS.find((c) => c.id === 'gbp')!
  const broken: SetupCard = { ...gbp, platform: { ...gbp.platform, canWrite: false } }
  s.check('mutated gbp card fails laneViolations (the platform layer bites first)', laneViolations(broken).length > 0)
  const routeOnBroken = routeForItem(line(gbp.serviceId), { cards: [broken] })
  const offersOnBroken = new Map(routeOnBroken.lanes.map((o) => [o.lane, o]))
  s.check('router refuses the broken card\'s diy lane', offersOnBroken.get('diy')?.available === false)
  s.check('router refuses the broken card\'s ai lane', offersOnBroken.get('ai')?.available === false)

  // Doctored routes against the checker.
  const smsLine = line('sms-program')
  const honest = routeForItem(smsLine)
  const forceTeam: MoveRoute = { ...honest, lanes: honest.lanes.map((o) => (o.lane === 'team' ? { ...o, available: true } : o)) }
  s.check('team forced available on a held rail → violation', routeViolations(smsLine, forceTeam).length > 0)

  // photo-library has no setup card and no guide: a diy offer there is a law-3 lie.
  const photoLine = line('photo-library')
  const honest2 = routeForItem(photoLine)
  const forceDiy: MoveRoute = { ...honest2, lanes: honest2.lanes.map((o) => (o.lane === 'diy' ? { ...o, available: true } : o)) }
  s.check('diy forced available with no guide → violation', routeViolations(photoLine, forceDiy).length > 0)

  // The held exception cannot be hidden behind: a DELIVERABLE service with a doctored
  // all-unavailable route is still a violation (photo-library is rail-ready).
  const allDead: MoveRoute = { ...honest2, lanes: honest2.lanes.map((o) => ({ ...o, available: false, whyNot: 'no' })) }
  s.check('deliverable service with zero lanes → violation', routeViolations(photoLine, allDead).length > 0)

  const stripped: MoveRoute = { ...honest, lanes: honest.lanes.map((o) => (o.available ? o : { ...o, whyNot: undefined })) }
  s.check('whyNot stripped from an unavailable offer → violation', routeViolations(smsLine, stripped).length > 0)
}

s.group('Law 2: every composed move has somewhere to land')
{
  const fixtures = [
    { name: 'firstvisit', draft: draftFromBuilder({ itemId: 'firstvisit', status: 'approve', vals: {} }) },
    { name: 'promoevent', draft: draftFromBuilder({ itemId: 'promoevent', status: 'approve', vals: {} }) },
    { name: 'nights', draft: draftFromBuilder({ itemId: 'nights', status: 'approve', vals: {} }) },
  ]
  for (const f of fixtures) {
    let allLandOrHeld = true
    let allClean = true
    for (const it of f.draft.items) {
      const route = routeForItem(it)
      const lands = route.lanes.some((o) => o.available)
      // A rail-held line legally has zero lanes: the plan renders it held-and-unbilled, which
      // IS its law-2 surface. Anything else must land somewhere.
      if (!lands && isServiceReady(it.serviceId)) allLandOrHeld = false
      if (routeViolations(it, route).length > 0) allClean = false
    }
    s.check(`${f.name}: every deliverable line has ≥1 available lane`, allLandOrHeld)
    s.check(`${f.name}: zero violations across the plan`, allClean)
  }

  // Guide-only lines: default diy, $0, available.
  const fv = fixtures[0].draft
  const guides = fv.items.filter((it) => it.serviceable === false)
  s.check('guide-only lines exist in the fixture', guides.length > 0)
  s.check('guide-only: default diy, available, $0', guides.every((it) => {
    const r = routeForItem(it)
    const diy = r.lanes.find((o) => o.lane === 'diy')!
    return r.default === 'diy' && diy.available && diy.price === 0
  }))

  // The honest pressure list, PINNED: the send-rail five have no landing lane today — they are
  // held-and-unbilled in every plan, which is legal. This list may only SHRINK (the day the
  // send rail lands, delete entries here consciously); a new landing-less service that is NOT
  // rail-held is a build failure via the fixtures above.
  const LANDING_LESS = ['review-engine', 'sms-program', 'winback', 'reminder-send', 'vip-comms']
  for (const id of LANDING_LESS) {
    const route = routeForItem(line(id))
    s.check(`${id}: landing-less but rail-held (legal)`, !route.lanes.some((o) => o.available) && !isServiceReady(id))
    s.check(`${id}: checker accepts the held case`, routeViolations(line(id), route).length === 0)
  }
  const surprise = ['paid-ads', 'photo-library', 'gbp-posts', 'local-seo']
    .filter((id) => !routeForItem(line(id)).lanes.some((o) => o.available))
  s.check(`no deliverable service is landing-less (found: ${surprise.join(', ') || 'none'})`, surprise.length === 0)
}

s.group('Law 2 mutations: silent drops are caught')
{
  const it = line('gbp-setup')
  const honest = routeForItem(it)
  s.check('honest route passes', routeViolations(it, honest).length === 0)
  s.check('empty lane set → violation', routeViolations(it, { lanes: [], default: 'team' }).length > 0)
  s.check('missing lane → violation', routeViolations(it, { ...honest, lanes: honest.lanes.slice(0, 3) }).length > 0)
  const badDefault: MoveRoute = { ...honest, default: 'creator' }
  s.check('unavailable default → violation', routeViolations(it, badDefault).length > 0)
}

s.group('Stamping: the one encoder, byte-honest')
{
  // Service line round trip: team → diy → team restores the base price exactly.
  const svc = line('gbp-setup', { price: 249 })
  const diyStamped = stampLane(svc, 'diy', 249)
  s.check('service diy: {producer diy, ownerMode diy, $0}', diyStamped.producer === 'diy' && diyStamped.ownerMode === 'diy' && diyStamped.price === 0)
  const back = stampLane(diyStamped, 'team', 249)
  s.check('team restores base price + composer base producer', back.price === 249 && back.producer === 'team' && back.ownerMode === undefined)

  // Service ai = the gbp triple, byte-equal to what the adapter emits for the AI doer.
  const aiStamped = stampLane(svc, 'ai', 249)
  const adapterLane = gbpLaneFromDoer('Do it with Apnosh AI')
  s.check('adapter decodes the AI doer to ai', adapterLane === 'ai')
  s.check('service ai stamps the adapter triple {diy, ownerMode ai, $0}',
    aiStamped.producer === 'diy' && aiStamped.ownerMode === 'ai' && aiStamped.price === 0)

  // Content lines.
  const reel = line('content-reel', { price: 150 })
  const aiReel = stampLane(reel, 'ai', 150)
  s.check(`content ai: producer ai + $${AI_DRAFT_CENTS / 100} stamped`, aiReel.producer === 'ai' && aiReel.price === AI_DRAFT_CENTS / 100)
  const creatorReel = stampLane(reel, 'creator', 150)
  s.check('content creator: same price, producer creator', creatorReel.producer === 'creator' && creatorReel.price === 150)
  s.check('content team restores', stampLane(creatorReel, 'team', 150).producer === 'team' && stampLane(creatorReel, 'team', 150).price === 150)
}

s.group('Defaults: hands-on biases, never overrides, never double-asks')
{
  const fv = draftFromBuilder({ itemId: 'firstvisit', status: 'approve', vals: {} })

  // handsOn undefined ⇒ deep-equal input (the safe route).
  const untouched = applyLaneDefaults(fv.items, {})
  s.check('no hands-on answer ⇒ byte-identical items', JSON.stringify(untouched) === JSON.stringify(fv.items))

  // hands_on flips guide-backed services to diy and drops the bill; structure preserved.
  const handsOn = applyLaneDefaults(fv.items, { handsOn: 'hands_on' })
  s.check('length, ids and order preserved', handsOn.length === fv.items.length && handsOn.every((it, i) => it.id === fv.items[i].id))
  const flipped = handsOn.filter((it, i) => it.producer === 'diy' && fv.items[i].producer !== 'diy')
  s.check(`hands_on flips guide-backed services to diy (${flipped.length} flipped)`, flipped.length > 0)
  s.check('every flip is $0', flipped.every((it) => it.price === 0))
  s.check('flips only where a diy lane is legal', flipped.every((it) => routeForItem(it).lanes.find((o) => o.lane === 'diy')?.available))

  // The gbp no-double-ask golden: a doer-stamped draft passes through unchanged.
  const gbpDraft = draftFromBuilder({ itemId: 'gbp', status: 'approve', vals: { doer: "I'll do it myself" } })
  const stampedBefore = gbpDraft.items.filter((it) => it.producer !== undefined)
  s.check('the doer already stamped gbp lines', stampedBefore.length > 0)
  const after = applyLaneDefaults(gbpDraft.items, { handsOn: 'hands_off' })
  s.check('doer-stamped lines pass through byte-identical', stampedBefore.every((it) => {
    const a = after.find((x) => x.id === it.id)
    return JSON.stringify(a) === JSON.stringify(it)
  }))
}

s.group('A stamped lane has the mint consequences it promises')
{
  const svc = line('gbp-setup', { price: 249 })
  s.check('team-stamped service line mints', mintableServiceLine(stampLane(svc, 'team', 249)))
  s.check('diy-stamped service line never mints and bills $0', (() => {
    const d = stampLane(svc, 'diy', 249)
    return !mintableServiceLine(d) && lineTotal(d) === 0
  })())
  s.check('ai-stamped service line (owner walkthrough) never mints and bills $0', (() => {
    const a = stampLane(svc, 'ai', 249)
    return !mintableServiceLine(a) && lineTotal(a) === 0
  })())
  s.check('round trip back to team mints again at full price', (() => {
    const back = stampLane(stampLane(svc, 'diy', 249), 'team', 249)
    return mintableServiceLine(back) && lineTotal(back) === 249
  })())
}

s.group('Supply enriches copy, never availability')
{
  const reel = line('content-reel', { price: 150 })
  const bare = routeForItem(reel)
  const withSupply = routeForItem(reel, { supply: { countByCraft: { Video: 2 }, assembledAt: 'x' } })
  const creatorBare = bare.lanes.find((o) => o.lane === 'creator')!
  const creatorSup = withSupply.lanes.find((o) => o.lane === 'creator')!
  s.check('availability identical with and without supply',
    bare.lanes.every((o, i) => o.available === withSupply.lanes[i].available))
  s.check('with supply: the count shows', creatorSup.note === '2 local creators near you')
  s.check('without supply: the honest same-price line', creatorBare.note === 'Same price. A local creator makes it.')
  const zero = routeForItem(reel, { supply: { countByCraft: {}, assembledAt: 'x' } })
  s.check('zero-count supply: no claim, still available', zero.lanes.find((o) => o.lane === 'creator')!.available === true)
}

s.report('Lane routing')
