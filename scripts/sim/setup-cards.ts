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
import {
  REQUIREMENTS,
  requirementById,
  requirementFlaws,
  isHollow,
  intakeFor,
  missingFrom,
} from '../../src/lib/campaigns/setup/requirements'
// proofRefusal is the vault's write-time guard, and it is a pure function precisely so it can be
// hammered here without a database.
import { proofRefusal } from '../../src/lib/campaigns/setup/vault-guard'
import { SETUP_CARDS, setupCardById } from '../../src/lib/campaigns/setup/cards'
import { laneViolations, canBeDoneForYou, whatYouGetFor, laneOf } from '../../src/lib/campaigns/setup/types'
import { SPACE, RADIUS, TEXT } from '../../src/components/mvp/tokens'
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

/* ── 5. a walkthrough is always mounted in the portal shell ──────────────────────────────────────
 *
 * The walkthrough components carry no width of their own, deliberately: the phone-shaped MvpShell
 * is what holds them to a column and gives them the header and the bottom nav. Mount one without
 * it and on a desktop window it fills the screen edge to edge.
 *
 * That is not hypothetical. The first version of /preview/setup/gbp did exactly this, and the
 * reason it went unnoticed is the part worth encoding: at 375px the shell makes no visible
 * difference, so a mobile-width check — the only kind anyone runs on a mobile-first portal — cannot
 * see the mistake. A rule catches it; looking does not.
 *
 * The check follows the sibling-wrapper pattern on purpose. The bare route imported the walkthrough
 * into a `preview-view.tsx` next to the page, so a naive "does this file mount the shell" test
 * would have passed the very page that was broken.
 */
s.group('Every walkthrough is mounted in the portal shell')
{
  const fs = require('node:fs') as typeof import('node:fs')
  const path = require('node:path') as typeof import('node:path')

  const WALKTHROUGHS = ['gbp-fixer', 'order-buttons', 'review-replies', 'listings-fix', 'measure-setup']

  /** Every page.tsx under src/app, however deep. */
  const pages: string[] = []
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name === 'page.tsx') pages.push(p)
    }
  }
  walk('src/app')

  /** A route "renders a walkthrough" if the page or anything beside it imports one. */
  const rendersWalkthrough = (pagePath: string): string | null => {
    const dir = path.dirname(pagePath)
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.tsx')) continue
      const src = fs.readFileSync(path.join(dir, f), 'utf8')
      const hit = WALKTHROUGHS.find((w) => src.includes(`components/mvp/${w}'`))
      if (hit) return hit
    }
    return null
  }

  const hosts = pages.map((p) => ({ p, w: rendersWalkthrough(p) })).filter((x) => x.w)
  s.check(`${hosts.length} route(s) render a setup walkthrough`, hosts.length >= 6, hosts.map((h) => h.p).join(', '))

  for (const { p, w } of hosts) {
    const src = fs.readFileSync(p, 'utf8')
    s.check(
      `${p.replace('src/app', '')} (${w}) mounts MvpShell`,
      src.includes('MvpShell'),
      'without the shell this fills a desktop window, and a 375px check cannot tell',
    )
  }
}

/* ── 6. spacing and type stop drifting ───────────────────────────────────────────────────────────
 *
 * The colour drift was two files disagreeing on one hex. This is a different shape: across the kit
 * and the five walkthroughs there are 12 distinct border radii, 12 gaps, 16 top margins and 20 font
 * sizes — a continuum rather than a scale, with 11 and 12 and 13 pixels of radius doing one job and
 * 12, 12.5, 13, 13.5 point type doing another. The kit itself, which exists to prevent this, has
 * three radii inside 9KB.
 *
 * NOTHING IS RENUMBERED, and the checks below are shaped around that. Snapping 13 to 12 changes
 * roughly six hundred renders across screens that mostly sit behind a login, so it is a visible
 * change to the whole portal and wants an owner's eye rather than a refactor's confidence.
 *
 * What is enforced instead: the scales exist and are coherent, and the count of distinct values in
 * each file may not grow. New work agrees with old work by default because the scales were derived
 * from the values already dominant; a new card that invents a fourteenth radius fails.
 */
s.group('The scales exist and are coherent')
{
  const ordered = (o: Record<string, number>) => {
    const v = Object.values(o)
    return v.every((n, i) => i === 0 || n > v[i - 1])
  }
  s.check(`SPACE has ${Object.keys(SPACE).length} steps, ascending`, ordered(SPACE), JSON.stringify(SPACE))
  s.check(`RADIUS has ${Object.keys(RADIUS).length} steps, ascending`, ordered(RADIUS), JSON.stringify(RADIUS))
  s.check(`TEXT has ${Object.keys(TEXT).length} steps, ascending`, ordered(TEXT), JSON.stringify(TEXT))
  for (const [name, scale] of [['SPACE', SPACE], ['RADIUS', RADIUS], ['TEXT', TEXT]] as const) {
    const v = Object.values(scale)
    s.check(`${name} has no duplicate steps`, new Set(v).size === v.length, 'two names for one value is how a scale rots')
  }
  /* Derived from the code, not invented: the workhorse values must already be the common ones. */
  s.check('RADIUS.md is the value 11/12/13 collapse to', RADIUS.md === 12)
  s.check('TEXT.md is the most used size in the walkthroughs', TEXT.md === 13)
}

s.group('No file grows a new spacing or type value')
{
  const fs = require('node:fs') as typeof import('node:fs')
  /* Today's counts, frozen. These may fall; they may not rise. gbp-fixer is the worst by a distance
   * and is the one carrying the most unreviewed design debt. */
  const CEILINGS: Record<string, { borderRadius: number; gap: number; fontSize: number }> = {
    'walkthrough-kit': { borderRadius: 6, gap: 4, fontSize: 10 },
    'gbp-fixer': { borderRadius: 8, gap: 9, fontSize: 16 },
    'order-buttons': { borderRadius: 2, gap: 3, fontSize: 3 },
    'review-replies': { borderRadius: 5, gap: 4, fontSize: 4 },
    'listings-fix': { borderRadius: 3, gap: 3, fontSize: 4 },
    'measure-setup': { borderRadius: 4, gap: 5, fontSize: 3 },
  }
  const distinct = (src: string, prop: string) => {
    const out = new Set<string>()
    for (const m of src.matchAll(new RegExp(`${prop}:\\s*([0-9]+(?:\\.[0-9]+)?)`, 'g'))) out.add(m[1])
    return out.size
  }
  for (const [file, caps] of Object.entries(CEILINGS)) {
    const src = fs.readFileSync(`src/components/mvp/${file}.tsx`, 'utf8')
    for (const prop of ['borderRadius', 'gap', 'fontSize'] as const) {
      const n = distinct(src, prop)
      s.check(
        `${file}: ${n} distinct ${prop} (ceiling ${caps[prop]})`,
        n <= caps[prop],
        `a new value here is a new thing to keep in sync. Use SPACE / RADIUS / TEXT from tokens.ts`,
      )
    }
  }
}

/* ── the requirements library ───────────────────────────────────────────────────────────────────
 * Phase 2's substrate. Three things have to hold or "collect once, forever" is a slogan:
 * every requirement can actually prove what it claims, the intake genuinely dedupes across cards,
 * and every id a lane names exists. The third is the one that rots silently: a typo in `needs`
 * would just quietly drop a row from the intake and nobody would see the gap until a service
 * failed for want of a credential nobody asked for. */
s.group('Collect once, forever')
{
  const flaws = requirementFlaws()
  s.check(
    `requirements library is sound (${REQUIREMENTS.length} requirements, ${flaws.length} flaws)`,
    flaws.length === 0,
    flaws.join('; '),
  )

  /* Every id every lane names must exist. */
  for (const card of SETUP_CARDS) {
    for (const lane of card.lanes) {
      for (const id of lane.needs ?? []) {
        s.check(
          `${card.id}/${lane.kind}: needs "${id}", which the library defines`,
          !!requirementById(id),
          'an unknown id is a row that silently never gets collected',
        )
      }
    }
  }

  /* THE POINT OF THE WHOLE PHASE. Four cards, three of them wanting the Google connection.
   * The owner connects Google once. */
  const everything = SETUP_CARDS.flatMap((c) => c.lanes.flatMap((l) => [...(l.needs ?? [])]))
  const googleAsks = everything.filter((id) => id === 'GOOGLE').length
  const intake = intakeFor(everything)
  const googleRows = intake.filter((r) => r.id === 'GOOGLE').length
  s.check(
    `intake dedupes: GOOGLE asked for ${googleAsks} times, collected once`,
    googleAsks > 1 && googleRows === 1,
    'if this is ever more than one row the owner reconnects Google per card',
  )
  s.check(
    'intake has no duplicates at all',
    new Set(intake.map((r) => r.id)).size === intake.length,
  )

  /* A prerequisite comes in whether or not anything asked for it, and comes in FIRST. */
  const mgr = intakeFor(['GBP-MGR'])
  s.check(
    'intake pulls prerequisites: asking only for manager access brings the connection with it',
    mgr.some((r) => r.id === 'GOOGLE') && mgr.length === 2,
    mgr.map((r) => r.id).join(','),
  )
  s.check(
    'and puts the prerequisite first',
    mgr[0]?.id === 'GOOGLE',
    mgr.map((r) => r.id).join(','),
  )

  /* The vault's whole job: what is already held is never asked for again. */
  const still = missingFrom(everything, ['GOOGLE', 'NAP'])
  s.check(
    'what the vault already holds drops out of the intake',
    !still.some((r) => r.id === 'GOOGLE' || r.id === 'NAP') && still.length === intake.length - 2,
  )

  /* The proof ladder reaches the UI. A fact the owner simply typed renders hollow; a credential
   * we hold a token for does not. Same separation the execution columns already keep. */
  s.check(
    'a typed fact is hollow, a real connection is not',
    isHollow(requirementById('NAP')!) && !isHollow(requirementById('GOOGLE')!),
  )
}

s.group('The vault cannot launder a claim into a fact')
{
  /* THE ATTACK THIS STOPS. A route that stamps `proof: 'token'` for a requirement whose only
   * collection method is "the owner typed it" would make an owner's say-so indistinguishable from
   * a credential we hold, one write later. The separate claimed-vs-verified execution columns
   * exist to prevent exactly that; a vault without this check would reopen it. */
  const nap = requirementById('NAP')!      // owner types it. Best proof: owner-word.
  const google = requirementById('GOOGLE')! // OAuth. Best proof: token.

  s.check(
    'a typed fact may not be recorded as a live API token',
    proofRefusal(nap, 'token') !== null,
  )
  s.check(
    'nor as a probe, nor as something we tried ourselves',
    proofRefusal(nap, 'probe') !== null && proofRefusal(nap, 'our-side') !== null,
  )
  s.check(
    "a typed fact recorded as the owner's word is fine",
    proofRefusal(nap, 'owner-word') === null,
  )
  s.check(
    'a real connection may be recorded at its own strength',
    proofRefusal(google, 'token') === null,
  )
  s.check(
    'and may be recorded WEAKER than it is, because under-claiming is never the lie',
    proofRefusal(google, 'owner-word') === null,
  )

  /* Every requirement in the library must accept its own declared proof. If this fails the library
   * and the guard disagree, and one of them is wrong. */
  const selfRejecting = REQUIREMENTS.filter((r) => proofRefusal(r, r.proof) !== null)
  s.check(
    'every requirement accepts the proof it declares',
    selfRejecting.length === 0,
    selfRejecting.map((r) => r.id).join(','),
  )
}

s.report('Setup cards')
