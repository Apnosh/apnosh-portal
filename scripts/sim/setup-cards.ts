/**
 * setup-cards — the golden test that lets the setup engine replace hand-written branches safely,
 * and the honesty law that stops the next nine cards repeating the first one's mistakes.
 *
 * TWO JOBS.
 *
 * 1. EQUIVALENCE. Every "what you get" row the config produces must be byte-identical to what the
 *    live code produces today, for all four cards and all three lanes. Twelve comparisons. If they
 *    all hold, the config is a faithful description of shipped behaviour and the branches it
 *    replaces can go. If one fails, the config is wrong and it is cheap to find out — which is the
 *    entire reason to write this before touching anything.
 *
 * 2. THE LAW. No lane may promise what its platform cannot do. The get-listed card discovered this
 *    by hand ("we cannot read OR write any of these directories, so no owner-run lane may claim to
 *    inspect one or fix one") and nothing enforced it. Now something does.
 *
 * Run: npx tsx scripts/sim/setup-cards.ts
 */

import { Suite } from './lib'
import { SETUP_CARDS, setupCardById } from '../../src/lib/campaigns/setup/cards'
import { laneViolations, canBeDoneForYou, whatYouGetFor, laneOf } from '../../src/lib/campaigns/setup/types'
import type { SetupLaneKind } from '../../src/lib/campaigns/setup/types'
import { whatYouGet } from '../../src/lib/campaigns/builder/what-you-get'
import { gbpLaneFromDoer } from '../../src/lib/campaigns/builder/adapter'

const s = new Suite()
const LANES: SetupLaneKind[] = ['diy', 'ai', 'team']

/* ── 1. equivalence with the code being replaced ─────────────────────────────────────────────── */

s.group('Every lane says exactly what it says today')
for (const card of SETUP_CARDS) {
  for (const kind of LANES) {
    const fromConfig = whatYouGetFor(card, kind)
    const fromLive = whatYouGet(card.id, { version: kind })[0]?.rows ?? []
    const same = fromConfig.length === fromLive.length && fromConfig.every((r, i) => r === fromLive[i])
    s.check(
      `${card.id}/${kind}: ${fromConfig.length} row(s) match the live page`,
      same,
      same ? '' : `config: ${JSON.stringify(fromConfig)}\n        live:   ${JSON.stringify(fromLive)}`,
    )
  }
}

s.group('Every card still points at the service it composes')
for (const card of SETUP_CARDS) {
  s.check(`${card.id} -> ${card.serviceId}`, card.serviceId.length > 0)
}

/* The lane a buyer picks is currently decoded out of a marketing sentence by a regex. Until that is
 * retired, the config's labels have to survive the trip — a label that decodes to the wrong lane
 * would silently sell the wrong thing. This is the check that makes the migration reversible. */
s.group('The old string decoder still lands every label on its own lane')
for (const card of SETUP_CARDS) {
  for (const lane of card.lanes) {
    const decoded = gbpLaneFromDoer(lane.label)
    s.check(`${card.id}/${lane.kind}: "${lane.label}" -> ${decoded}`, decoded === lane.kind,
      `decoded as ${decoded}, which would sell the wrong lane`)
  }
}

/* ── 2. the law ──────────────────────────────────────────────────────────────────────────────── */

s.group('No lane promises what the platform cannot do')
for (const card of SETUP_CARDS) {
  const v = laneViolations(card)
  s.check(`${card.id}: ${card.lanes.length} lanes, all backed`, v.length === 0, v.join(' · '))
}

s.group('A card with no write access cannot be sold as done-for-you by API')
for (const card of SETUP_CARDS) {
  const team = laneOf(card, 'team')
  if (!team) { s.check(`${card.id}: no team lane`, true); continue }
  const ok = team.delivery !== 'we-write' || canBeDoneForYou(card.platform)
  s.check(
    `${card.id}: team lane delivers by "${team.delivery}"`,
    ok,
    'a we-write lane on a platform we cannot write to is a promise we cannot keep',
  )
}

s.group('Verified and claimed never share a field')
for (const card of SETUP_CARDS) {
  for (const lane of card.lanes) {
    const t = lane.ownerTask
    if (!t) { s.check(`${card.id}/${lane.kind}: no owner task`, true); continue }
    const both = !!t.verifiedField && !!t.claimedField
    s.check(`${card.id}/${lane.kind}: one kind of stamp`, !both,
      'a lane that can both prove and be told is how a self-claim gets laundered into a verified one')
    s.check(
      `${card.id}/${lane.kind}: stamp matches proof (${lane.proof})`,
      lane.proof === 'owner-word' ? !!t.claimedField && !t.verifiedField : !!t.verifiedField,
    )
  }
}

s.group('The honest limit is named wherever there is one')
for (const card of SETUP_CARDS) {
  const limited = !card.platform.canRead || !card.platform.canWrite
  if (!limited) { s.check(`${card.id}: full access, nothing to explain`, true); continue }
  const why = card.platform.limitation ?? ''
  s.check(`${card.id}: says why in plain words`, why.length > 30, why)
  s.check(`${card.id}: no em dash in owner copy`, !why.includes('—'), why)
}

/* ── 3. the shape holds for what comes next ──────────────────────────────────────────────────── */

s.group('The listings card is the worked example of a no-API service')
{
  const l = setupCardById('listings')!
  s.check('we can neither read nor write it', !l.platform.canRead && !l.platform.canWrite)
  s.check('so no lane claims a machine proof', l.lanes.every((x) => x.proof === 'owner-word'))
  s.check('and the AI lane is a guide, not a writer', laneOf(l, 'ai')!.delivery === 'owner-applies',
    'this is the shape the delivery-menu and POS cards have to take')
  s.check('while the team lane is real hands', laneOf(l, 'team')!.delivery === 'we-operate')
}

s.group('The Google cards earn their machine proofs')
for (const id of ['gbp', 'friction', 'reviewsreply']) {
  const c = setupCardById(id)!
  s.check(`${id}: we hold both halves of the API`, c.platform.canRead && c.platform.canWrite)
  const machine = c.lanes.filter((x) => x.proof !== 'owner-word').length
  s.check(`${id}: ${machine} of ${c.lanes.length} lanes prove themselves`, machine >= 1)
}

s.group('Every lane is priced, described and reachable')
for (const card of SETUP_CARDS) {
  s.check(`${card.id}: has all three lanes`, card.lanes.length === 3, card.lanes.map((l) => l.kind).join(','))
  for (const lane of card.lanes) {
    s.check(`${card.id}/${lane.kind}: label reads as a sentence`, lane.label.length > 12, lane.label)
    s.check(`${card.id}/${lane.kind}: promises something`, lane.whatYouGet.length > 0)
    for (const row of lane.whatYouGet) {
      s.check(`${card.id}/${lane.kind}: "${row.slice(0, 42)}..." avoids em dashes`, !row.includes('—'), row)
    }
  }
}

s.report('Setup cards')
