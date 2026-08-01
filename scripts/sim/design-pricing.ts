/**
 * design-pricing — the configurator's money laws, pinned (DESIGN-ORDERING spec, Phase A).
 *
 * Goldens (spec's own list, scoped to the pure surface that exists):
 *   3. No unexplained money: every price line has a cited cause; total = sum of lines.
 *   4. Flip test: change any answer with a priceEffect and the quote visibly changes.
 *   5. Rush honesty: a date outside the window can never produce a rush line, and inside the
 *      window nothing fires without the client's explicit confirmation.
 * Plus: the destination table is complete (spec derives silently, so a hole would be a crash
 * in production, not a question), the placeholder rate card cannot reach clients, and tier
 * ambiguity prices LOW and flags — never a silent upcharge.
 *
 * Run: npx tsx scripts/sim/design-pricing.ts
 */
import { Suite } from './lib'
import { DESTINATIONS, destinationById } from '../../src/lib/design/destinations'
import { RATE_CARD } from '../../src/lib/design/rate-card'
import { priceDesignOrder, rushApplies, productionBufferDays, type DesignOrderAnswers } from '../../src/lib/design/design-pricing'

const s = new Suite()
const TODAY = '2026-07-31' // injected clock, never the real one

const asked = <T,>(value: T) => ({ value, source: 'asked' as const })
const read = <T,>(value: T, citedWords: string) => ({ value, source: 'read' as const, citedWords })

/** A plain digital order: weekly special, IG post + story, own photos, no date pressure. */
const BASE: DesignOrderAnswers = {
  jobType: asked('weekly-special'),
  destinations: read(['instagram-post', 'instagram-story'], 'for instagram and stories'),
  photos: asked('own'),
  tier: 2,
  todayISO: TODAY,
}

/* ── the destination table is complete ────────────────────────────────────────────────────── */

s.group('Destination table: the spec can always derive, silently')
{
  for (const d of DESTINATIONS) {
    const ok = d.label && d.dimensions.w > 0 && d.dimensions.h > 0 && d.resolution > 0 && d.bufferDays >= 0
      && (d.kind === 'digital' ? d.colorMode === 'RGB' : d.colorMode === 'CMYK' && (d.bleed ?? 0) > 0)
    s.check(`${d.id}: complete and coherent`, !!ok)
  }
  s.check('print buffers gate delivery (flyer adds days, IG does not)',
    productionBufferDays(['printed-flyer']) >= 3 && productionBufferDays(['instagram-post']) === 0)
  s.check('unknown ids resolve to nothing, never crash', destinationById('carrier-pigeon') === undefined && productionBufferDays(['carrier-pigeon']) === 0)
}

/* ── golden 3: no unexplained money ───────────────────────────────────────────────────────── */

s.group('No unexplained money: every line cites its cause, total is the sum')
{
  const q = priceDesignOrder(BASE, RATE_CARD)
  s.check('every line has a why', q.lines.every((l) => l.why.trim().length > 5), q.lines.map((l) => l.id).join(','))
  s.check('total = sum of lines', q.total === q.lines.reduce((n, l) => n + l.amount, 0))
  s.check('no em or en dash in any why', q.lines.every((l) => !/[—–]/.test(l.why)))
  s.check('own photos are a VISIBLE zero, not an omission', q.lines.some((l) => l.id === 'photos' && l.amount === 0 && /your own/i.test(l.why)))
  s.check('the second destination cites its checkbox', q.lines.some((l) => l.id === 'dest-instagram-story' && /You checked Instagram Story/.test(l.why)))
  s.check('a read answer carries its cited words onto the line', q.lines.find((l) => l.id === 'dest-instagram-story')?.citedWords === 'for instagram and stories')
  s.check('revision rounds ride the quote', q.includedRevisions === RATE_CARD.includedRevisions)
}

/* ── golden 4: the flip test ──────────────────────────────────────────────────────────────── */

s.group('Flip test: every price-affecting answer visibly moves the quote')
{
  const base = priceDesignOrder(BASE, RATE_CARD)
  const flips: [string, DesignOrderAnswers][] = [
    ['add a destination', { ...BASE, destinations: asked(['instagram-post', 'instagram-story', 'facebook-post']) }],
    ['remove a destination', { ...BASE, destinations: asked(['instagram-post']) }],
    ['photos flip to sourced', { ...BASE, photos: asked('source') }],
    ['tier drops to adaptation', { ...BASE, tier: 1 }],
    ['tier rises to foundational', { ...BASE, tier: 3 }],
    ['rush confirmed inside the window', { ...BASE, dueDateISO: asked('2026-08-01'), rushConfirmed: true }],
  ]
  for (const [name, ans] of flips) {
    const q = priceDesignOrder(ans, RATE_CARD)
    s.check(`${name}: total changes`, q.total !== base.total, `${base.total} -> ${q.total}`)
  }
  /* Unchecking removes the LINE, not just the number. */
  const three = priceDesignOrder({ ...BASE, destinations: asked(['instagram-post', 'instagram-story', 'facebook-post']) }, RATE_CARD)
  const two = priceDesignOrder(BASE, RATE_CARD)
  s.check('unchecking a destination removes its line', three.lines.some((l) => l.id === 'dest-facebook-post') && !two.lines.some((l) => l.id === 'dest-facebook-post'))
}

/* ── golden 5 + law 4: rush honesty, print honesty ────────────────────────────────────────── */

s.group('Rush honesty: the window and the confirmation are both required')
{
  s.check('outside the window: never a rush, even confirmed',
    priceDesignOrder({ ...BASE, dueDateISO: asked('2026-08-20'), rushConfirmed: true }, RATE_CARD).rush === false)
  s.check('inside the window but unconfirmed: no rush line',
    priceDesignOrder({ ...BASE, dueDateISO: asked('2026-08-01') }, RATE_CARD).rush === false)
  const rushed = priceDesignOrder({ ...BASE, dueDateISO: asked('2026-08-01'), rushConfirmed: true }, RATE_CARD)
  s.check('inside and confirmed: the rush line cites the window and the confirmation',
    rushed.rush && rushed.lines.some((l) => l.id === 'rush' && /rush window/.test(l.why) && /confirmed/.test(l.why)))
  s.check('a due date in the past does not rush', rushApplies('2026-07-01', TODAY, 72) === false)
  s.check('no due date, no rush', rushApplies(undefined, TODAY, 72) === false)
}

s.group('Print: quantity and printer are questions, never guesses (law 4)')
{
  const noAnswers = priceDesignOrder({ ...BASE, destinations: asked(['printed-flyer']) }, RATE_CARD)
  s.check('a print destination with no answers yields needs, not charges',
    noAnswers.needs.includes('printQty') && noAnswers.needs.includes('printer') && !noAnswers.lines.some((l) => l.id === 'print-mgmt'))
  const clientPrints = priceDesignOrder({ ...BASE, destinations: asked(['printed-flyer']), printQty: asked(200), printer: asked('client') }, RATE_CARD)
  s.check('client-runs-the-print-job adds no management line', !clientPrints.lines.some((l) => l.id === 'print-mgmt') && clientPrints.passThroughNote === null)
  const wePrint = priceDesignOrder({ ...BASE, destinations: asked(['printed-flyer']), printQty: asked(200), printer: asked('us') }, RATE_CARD)
  s.check('we-print adds the management line citing the job and quantity',
    wePrint.lines.some((l) => l.id === 'print-mgmt' && /printed flyer, 200 copies/.test(l.why)))
  s.check('and the pass-through cost is a note, never a hidden line', !!wePrint.passThroughNote && /at cost/.test(wePrint.passThroughNote))
}

/* ── tier + the placeholder gate ──────────────────────────────────────────────────────────── */

s.group('Tier: ambiguity prices low and flags, never a silent upcharge')
{
  const plain = priceDesignOrder({ ...BASE, tier: 3 }, RATE_CARD)
  const ambiguous = priceDesignOrder({ ...BASE, tier: 3, tierAmbiguous: true }, RATE_CARD)
  s.check('ambiguous tier 3 prices as tier 2', ambiguous.lines[0].amount === RATE_CARD.tierBase[2] && plain.lines[0].amount === RATE_CARD.tierBase[3])
  s.check('and is flagged for internal review', ambiguous.flaggedForReview === true && plain.flaggedForReview === false)
  s.check('ambiguous tier 1 stays tier 1', priceDesignOrder({ ...BASE, tier: 1, tierAmbiguous: true }, RATE_CARD).lines[0].amount === RATE_CARD.tierBase[1])
}

s.group('The rate card is a placeholder until reviewed, and says so')
{
  s.check('approved starts false: Phase B must refuse to show clients these numbers', RATE_CARD.approved === false)
  s.check('every amount is positive and the multiplier is above 1',
    Object.values(RATE_CARD.tierBase).every((n) => n > 0) && RATE_CARD.perDestination > 0 && RATE_CARD.photoSourcing > 0 && RATE_CARD.printManagement > 0 && RATE_CARD.rushMultiplier > 1)
  s.check('the rush window is inside the spec range (48 to 72 hours)', RATE_CARD.rushWindowHours >= 48 && RATE_CARD.rushWindowHours <= 72)
}

const ok = s.report('Design pricing (Phase A)')
process.exit(ok ? 0 : 1)
