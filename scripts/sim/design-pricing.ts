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
import { matchDesignJob, sanitizeDesignRead } from '../../src/lib/design/design-read'

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
  {
    const { photos: _drop, ...rest } = BASE
    const unanswered = priceDesignOrder(rest, RATE_CARD)
    s.check('an unanswered photos step is a QUESTION, never a charge', unanswered.needs.includes('photos') && !unanswered.lines.some((l) => l.id === 'photos'))
  }
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

/* ── per-destination adders ───────────────────────────────────────────────────────────────── */

s.group('Per-destination adders: own price, order-blind, most expensive included')
{
  const ab = priceDesignOrder({ ...BASE, destinations: asked(['instagram-post', 'banner']) }, RATE_CARD)
  const ba = priceDesignOrder({ ...BASE, destinations: asked(['banner', 'instagram-post']) }, RATE_CARD)
  s.check('tap order never changes the total', ab.total === ba.total, `${ab.total} vs ${ba.total}`)
  s.check('the most expensive destination is the included one', ab.lines.some((l) => l.id === 'dest-banner' && l.amount === 0 && /included/i.test(l.why)))
  s.check('the cheaper one bills at its own adder', ab.lines.some((l) => l.id === 'dest-instagram-post' && l.amount === RATE_CARD.destinationAdder['instagram-post']))
  s.check('every picked destination has a line, single included', ab.lines.filter((l) => l.id.startsWith('dest-')).length === 2 && ab.lines.filter((l) => l.id.startsWith('dest-') && l.amount === 0).length === 1)
  const gift = priceDesignOrder({ ...BASE, destinations: asked(['gift-card', 'printed-flyer']) }, RATE_CARD)
  s.check('a flyer next to gift cards bills the flyer adder, not a flat rate',
    gift.lines.some((l) => l.id === 'dest-printed-flyer' && l.amount === RATE_CARD.destinationAdder['printed-flyer']))
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
    Object.values(RATE_CARD.tierBase).every((n) => n > 0) && RATE_CARD.photoSourcing > 0 && RATE_CARD.printManagement > 0 && RATE_CARD.rushMultiplier > 1)
  s.check('every destination has its own positive adder, none forgotten',
    DESTINATIONS.every((d) => (RATE_CARD.destinationAdder[d.id] ?? 0) > 0))
  s.check('the rush window is inside the spec range (48 to 72 hours)', RATE_CARD.rushWindowHours >= 48 && RATE_CARD.rushWindowHours <= 72)
}

/* ── Phase B: the design read obeys the same laws as the campaign read ────────────────────── */

s.group('Local job matcher: available when the model is not, honest when unsure')
{
  s.check('weekly special', matchDesignJob('need a flyer for our weekly special') === 'weekly-special')
  s.check('hiring', matchDesignJob('we are hiring two line cooks') === 'hiring')
  s.check('holiday hours', matchDesignJob('closed for thanksgiving, need to post our holiday hours') === 'holiday-hours')
  s.check('a miss returns null, never a guess', matchDesignJob('make it pop') === null)
  s.check('grand opening is an announcement', matchDesignJob('We are having a grand opening on September 12 and need flyers') === 'announcement')
  s.check('a delivery-app arrival is an announcement', matchDesignJob('We just got on DoorDash and want to announce it') === 'announcement')
  s.check('a named holiday closure is holiday hours', matchDesignJob('We are closed Labor Day weekend, need something for the door') === 'holiday-hours')
}

s.group('sanitizeDesignRead: the shared evidence gate, the design vocabulary')
{
  const TEXT = 'Need an instagram post and a printed flyer for our live music night on August 15. 20% off pitchers. We have our own photos. Need it by Friday.'
  const q = (value: unknown, quote: string) => ({ value, quote })
  const read = sanitizeDesignRead({
    jobType: q('event-promo', 'live music night'),
    message: q('Live music night', 'live music night'),
    offer: q('20% off pitchers', '20% off pitchers'),
    eventDate: q('2026-08-15', 'August 15'),
    destinations: q(['instagram-post', 'printed-flyer'], 'instagram post and a printed flyer'),
    ownPhotos: q(true, 'our own photos'),
  }, TEXT, TODAY)
  s.check('a fully-backed read survives with citations', read.jobType === 'event-promo' && read.offer === '20% off pitchers' && read.eventDateISO === '2026-08-15' && read.destinations?.length === 2 && read.ownPhotos === true)
  s.check('cited words ride along for the price lines', read.cited.destinations === 'instagram post and a printed flyer' && read.cited.offer === '20% off pitchers')
  s.check('rush language detected locally', read.rushLanguage === true)

  s.check('an invented quote kills the field', sanitizeDesignRead({ offer: q('50% off', 'we agreed to half price') }, TEXT, TODAY).offer === undefined)
  s.check('a vague offer read is dropped (no number, no shape)', sanitizeDesignRead({ offer: q('a great deal', '20% off pitchers') }, 'we want to run a great deal on drinks', TODAY).offer === undefined)
  s.check('an off-vocabulary destination vanishes', sanitizeDesignRead({ destinations: q(['skywriting'], 'instagram post') }, TEXT, TODAY).destinations === undefined)
  s.check('"in September" is a month hint, never a date', (() => { const r = sanitizeDesignRead({ eventDate: q('2026-09-01', 'in September') }, 'flyer for our event in September', TODAY); return r.eventDateISO === undefined && r.monthHint === '2026-09' })())
  s.check('a dead model still lands the local job', sanitizeDesignRead('not-an-object', 'poster for our weekly special', TODAY).jobType === 'weekly-special')
  /* The future rule: a past-year guess for "August 15" rolls to the upcoming August 15. */
  s.check('a past-year date read rolls forward, never backwards', sanitizeDesignRead({ eventDate: q('2025-08-15', 'August 15') }, 'event on August 15', TODAY).eventDateISO === '2026-08-15')
  s.check('a date past even after the roll is no date', sanitizeDesignRead({ eventDate: q('2024-03-01', 'March 1') }, 'back on March 1', '2026-07-31').eventDateISO === undefined)
  s.check('no read whys carry dashes', Object.values(read.cited).every((c) => !/[—–]/.test(c ?? '')))

  /* The audit's serious findings, pinned. */
  s.check('rush language works on the DEAD-MODEL floor too', sanitizeDesignRead(null, 'poster for the window, need it asap', TODAY).rushLanguage === true)
  s.check('unplaced asks are captured locally, never dropped silently', (() => { const r = sanitizeDesignRead(null, 'business cards and flyers to hand out', TODAY); return r.unplaced?.includes('business card') === true })())
  s.check('model-named unsupported asks merge in, quote-backed only', (() => {
    const t = 'table tents and car decals for mothers day'
    const r = sanitizeDesignRead({ unsupported: [q('car decals', 'car decals'), q('skywriting', 'we never said this')] }, t, TODAY)
    return r.unplaced?.includes('decal') === true && !r.unplaced?.includes('skywriting')
  })())
  s.check('overlapping names collapse to one ask', (() => {
    const t = 'loyalty punch cards and flyers to hand out'
    const r = sanitizeDesignRead({ unsupported: [q('loyalty punch cards', 'loyalty punch cards')] }, t, TODAY)
    return (r.unplaced?.length ?? 0) <= 2 && r.unplaced?.some((u) => u.includes('punch card')) === true
  })())
  s.check('banner, email, gift card are REAL destinations now, not unplaced', (() => {
    const r = sanitizeDesignRead(null, 'a banner, an email blast, and gift cards for the holidays', TODAY)
    return r.unplaced === undefined && r.destinations?.length === 3 && !!r.cited.destinations
  })())
  s.check('the destination floor ticks plainly-named products, model dead', (() => {
    const r = sanitizeDesignRead(null, 'Gift cards to sell for the holidays', TODAY)
    return r.destinations?.includes('gift-card') === true
  })())
  s.check('a model miss on email still lands the destination, never unplaced', (() => {
    const t = 'table tents and an email blast for mothers day'
    const r = sanitizeDesignRead({ destinations: q(['table-tent'], 'table tents'), unsupported: [q('email blast', 'an email blast')] }, t, TODAY)
    return r.destinations?.includes('email-header') === true && r.unplaced === undefined
  })())
  s.check('cues never duplicate a destination the model already read', (() => {
    const t = 'a banner for the window'
    const r = sanitizeDesignRead({ destinations: q(['banner'], 'a banner') }, t, TODAY)
    return r.destinations?.filter((d) => d === 'banner').length === 1
  })())
  s.check('a supported order has no unplaced note', sanitizeDesignRead(null, TEXT, TODAY).unplaced === undefined)
}

s.group('Photos: the third honest answer')
{
  const none = priceDesignOrder({ ...BASE, photos: asked('none' as const) }, RATE_CARD)
  s.check('no-photos is a VISIBLE zero with its own why', none.lines.some((l) => l.id === 'photos' && l.amount === 0 && /no photos/i.test(l.why)))
  s.check('no-photos total equals own-photos total', none.total === priceDesignOrder(BASE, RATE_CARD).total)
}

const ok = s.report('Design pricing + read (Phases A-B)')
process.exit(ok ? 0 : 1)
