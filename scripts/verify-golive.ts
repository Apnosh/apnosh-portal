/**
 * verify-golive — locks the critical-PATH behavior of aggregateGoLive (run: npx tsx scripts/verify-golive.ts).
 * The whole point is that go-live is max(parallel tracks), never a sum, and a shoot is counted once.
 */
import type { LineItem } from '../src/lib/campaigns/types'
import type { DerivedSchedule, DatedBeat } from '../src/lib/campaigns/schedule'
import { aggregateGoLive } from '../src/lib/campaigns/aggregate-golive'

const FROM = '2026-07-01'
const svc = (serviceId: string): LineItem => ({ id: serviceId, serviceId, name: serviceId, plain: serviceId } as unknown as LineItem)
const mkSched = (types: string[]): DerivedSchedule => ({
  mode: types.length ? 'estimate' : 'none', anchorISO: null, anchorLabel: '',
  beats: types.map((type) => ({ type } as unknown as DatedBeat)),
  firstPostISO: null, firstDraftISO: null, firstPostLabel: '', firstDraftLabel: '', tooSoon: false,
})
const noBeats = mkSched([])

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail = '') { if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name} ${detail}`) } }

// A. Setup-only, two services → the SLOWER setup wins (parallel), never the sum.
{
  const g = aggregateGoLive([svc('gbp-setup'), svc('site-menu')], noBeats, FROM)
  // gbp-setup = 5-7 + gate 1-7 = 6-14 ; site-menu = 3-5. Critical = max = 14 (NOT 14+5=19, NOT 6+3).
  check('A setup parallel: max=14 not sum', g.daysToFirstPost.max === 14, `got ${g.daysToFirstPost.max}`)
  check('A setup min=6 (slower min)', g.daysToFirstPost.min === 6, `got ${g.daysToFirstPost.min}`)
  check('A no creative', !g.creative.present)
  check('A gbp gate surfaced', g.gates.some((x) => /Google verifies/.test(x)))
}

// B. Creative content (3 shoot pieces) → FIRST live is the FASTEST piece; shoot lead counted once.
{
  const g = aggregateGoLive([], mkSched(['reel', 'reel', 'photo']), FROM)
  // fastest = photo: shoot 5-10 + photo 5-7 + approval 3 = 13-20 (reels post later, don't gate go-live).
  check('B first-live max = 20 (fastest piece)', g.daysToFirstPost.max === 20, `got ${g.daysToFirstPost.max}`)
  check('B first-live min = 13', g.daysToFirstPost.min === 13, `got ${g.daysToFirstPost.min}`)
  check('B needsShoot', g.creative.needsShoot)
  check('B shoot gate surfaced', g.gates.some((x) => /on-site shoot/.test(x)))
}

// C. Mixed setup + creative → critical path = the longer track.
{
  const g = aggregateGoLive([svc('gbp-setup')], mkSched(['reel']), FROM)
  // setup 6-14 vs creative 5+7+3=15 .. 10+10+3=23 → creative dominates.
  check('C mixed max = 23 (creative wins)', g.daysToFirstPost.max === 23, `got ${g.daysToFirstPost.max}`)
  check('C mixed min = 15', g.daysToFirstPost.min === 15, `got ${g.daysToFirstPost.min}`)
  check('C both tracks present', g.setup.present && g.creative.present)
}

// F. Mixed content: a quick no-shoot post goes live FIRST, well before the shoot pieces.
{
  const g = aggregateGoLive([], mkSched(['post', 'reel']), FROM)
  // post: no shoot, 2-4 + approval 3 = 5-7 ; reel 15-23 → first live = the post.
  check('F fastest = post {5,7}', g.daysToFirstPost.min === 5 && g.daysToFirstPost.max === 7, `got ${g.daysToFirstPost.min}-${g.daysToFirstPost.max}`)
  check('F phrase = about a week', g.phrase === 'about a week', `got "${g.phrase}"`)
}

// G. No repeats: setup the restaurant already has is skipped (0 time), not re-quoted.
{
  const g = aggregateGoLive([svc('gbp-setup')], mkSched(['post']), FROM, { doneSetupIds: ['gbp-setup'] })
  // gbp-setup already done → setup track empty; only the quick post gates go-live (5-7), not 14.
  check('G done setup skipped: max=7', g.daysToFirstPost.max === 7, `got ${g.daysToFirstPost.max}`)
  check('G setup not present', !g.setup.present)
  check('G alreadyDone lists it', g.setup.alreadyDone.length === 1, `got ${g.setup.alreadyDone.length}`)
}

// D. Recurring-only → no go-live post; uses startsWithin.
{
  const g = aggregateGoLive([svc('social-mgmt'), svc('gbp-posts')], noBeats, FROM)
  // social 5-7, gbp-posts 3-5 → soonest start 3, latest 7.
  check('D recurring-only hasGoLive=false', !g.hasGoLive)
  check('D recurring window {3,7}', g.daysToFirstPost.min === 3 && g.daysToFirstPost.max === 7, `got ${g.daysToFirstPost.min}-${g.daysToFirstPost.max}`)
  check('D recurring present', g.recurring.present)
}

// E. Phrase + business-day date helpers sane.
{
  const g = aggregateGoLive([svc('gbp-setup')], mkSched(['reel']), FROM)
  check('E phrase mentions weeks', /week/.test(g.phrase), `got "${g.phrase}"`)
  check('E setup byISO is a date', !!g.setup.byISO && /^\d{4}-\d{2}-\d{2}$/.test(g.setup.byISO!))
}

console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'}: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
