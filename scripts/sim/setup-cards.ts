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

/* ── 4. the design stays adjustable in one place ─────────────────────────────────────────────────
 *
 * The behaviour checks above are only half of "consistent". The other half is that changing how a
 * setup card LOOKS should be one edit, and that is a property of the source, not of the types — so
 * it gets checked here rather than trusted.
 *
 * The kit already exists and already says why: without it the third card would "have made three
 * versions of 'the look' that drift apart the first time anyone adjusts a radius." Four of the five
 * walkthroughs use it. The flagship does not — gbp-fixer is 3,599 lines with its own everything —
 * and it is the card the next nine will be told to copy. That is the trap.
 *
 * A RATCHET, not a wall. gbp-fixer cannot be rewritten in this pass, so its current weight is
 * recorded and frozen: it may shrink, never grow. Every other walkthrough is held near zero. A new
 * card built by copy-pasting the flagship fails immediately, with a message saying what to do.
 */
s.group('The look is adjustable in one place')
{
  const fs = require('node:fs') as typeof import('node:fs')
  const read = (f: string) => fs.readFileSync(`src/components/mvp/${f}.tsx`, 'utf8')
  const hexes = (src: string) => (src.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).length

  /* Only tokens.ts may name a colour. The kit reads it; the shell re-exports it. */
  const tokens = fs.readFileSync('src/components/mvp/tokens.ts', 'utf8')
  s.check(`tokens.ts is the palette (${hexes(tokens)} colours)`, hexes(tokens) > 8)
  for (const f of ['walkthrough-kit', 'mvp-detail']) {
    s.check(`${f} declares no palette of its own`, !/export const C = \{/.test(read(f)),
      'two files exporting a map called C is how the greens drifted apart in the first place')
  }

  /* The kit users, held near zero. A handful of one-off colours is tolerable; a private palette
   * is not, and 3 is comfortably below the level where one starts. */
  const KIT_USERS = ['order-buttons', 'review-replies', 'listings-fix', 'measure-setup'] as const
  for (const f of KIT_USERS) {
    const src = read(f)
    s.check(`${f} draws from the kit`, src.includes("from './walkthrough-kit'"))
    const n = hexes(src)
    s.check(`${f}: ${n} hardcoded colour(s)`, n <= 3, 'past three it is a private palette, and it will drift')
  }

  /* The flagship, brought down and held there. It went 76 -> 52 by deleting a third copy of the
   * palette and naming six loose values for the jobs they do. What is left is plain white plus two
   * inside a CSS template string, where a JS expression cannot go — so this is the floor, not a
   * staging post, and the ceiling is set one above it to catch a genuine regression. */
  const GBP_FIXER_HEX_CEILING = 53
  const src = read('gbp-fixer')
  const n = hexes(src)
  s.check(
    `gbp-fixer: ${n} hardcoded colours, ceiling ${GBP_FIXER_HEX_CEILING}`,
    n <= GBP_FIXER_HEX_CEILING,
    'the reference card may shrink toward the kit, never grow away from it',
  )
  s.check(
    'gbp-fixer reads the shared palette rather than declaring one',
    /import \{ C, DISPLAY \} from '\.\/tokens'/.test(src) && !/const C = \{/.test(src),
    'a private palette here is the one any card copied from this file would inherit',
  )
  const nonWhite = (src.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).filter((h) => h.toLowerCase() !== '#fff').length
  s.check(
    `and only ${nonWhite} non-white values remain, both inside CSS strings`,
    nonWhite <= 2,
    'anything above two means a colour was written inline instead of named in tokens.ts',
  )
}

s.report('Setup cards')
