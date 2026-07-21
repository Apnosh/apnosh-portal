/**
 * verify-citations — checks the "Get listed everywhere" card against realistic audit rows,
 * with no network and no database.
 *
 * The thing under test is mostly HONESTY, not arithmetic. This card can read one directory
 * and write none, so the ways it can go wrong are all the same shape: quietly implying we
 * know something we do not. Most of these checks exist to catch exactly that.
 *
 * Run: node_modules/.bin/tsx scripts/verify-citations.ts
 */

import {
  buildCitationPlan, headlineFor, correctValues, joinWords, DIRECTORIES,
  type AuditRow, type SourceNap,
} from '../src/lib/citations/directories'
import { gbpLaneFromDoer } from '../src/lib/campaigns/builder/adapter'
import { whatYouGet } from '../src/lib/campaigns/builder/what-you-get'

let pass = 0, fail = 0
function ok(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  PASS  ${label}`) }
  else { fail++; console.log(`  FAIL  ${label}`) }
}
function section(t: string) { console.log(`\n== ${t} ==`) }

const SOURCE: SourceNap = { name: 'Yellow Bee Market', address: '123 Main St, Seattle, WA 98101', phone: '(206) 555-0142' }

function audit(p: Partial<AuditRow> & { platform: string }): AuditRow {
  return {
    listingUrl: 'https://example.com/l', nameFound: SOURCE.name, addressFound: SOURCE.address,
    phoneFound: SOURCE.phone, consistent: true, inconsistencies: [],
    checkedAt: '2026-07-01T00:00:00Z', source: 'api', notes: null, ...p,
  }
}

/* ── the honesty rules ───────────────────────────────────────────── */

section('a directory nobody looked at is never reported as fine')
{
  const plan = buildCitationPlan(SOURCE, [])
  ok('every directory starts unchecked', plan.directories.every((d) => d.status === 'unchecked'))
  ok('unchecked is NOT counted as matching', plan.counts.match === 0)
  ok('unchecked is NOT counted as needing work either', plan.needsWork === 0)
  ok('the headline says out loud that nothing was checked', /not been checked|needs? a look/i.test(plan.headline))
  ok('the headline never claims everything is fine', !/every directory .* matches/i.test(plan.headline))
}

section('checked and clean is stated only for what was actually checked')
{
  const plan = buildCitationPlan(SOURCE, [audit({ platform: 'yelp' })])
  ok('the checked one reads as a match', plan.directories.find((d) => d.key === 'yelp')!.status === 'match')
  ok('the other five stay unchecked', plan.counts.unchecked === DIRECTORIES.length - 1)
  ok('the headline names both facts', /1|Nothing is wrong/.test(plan.headline) && /5 still/.test(plan.headline))
}

section('a mismatch names exactly which fields differ')
{
  const plan = buildCitationPlan(SOURCE, [
    audit({ platform: 'yelp', phoneFound: '(206) 555-9999', inconsistencies: ['phone'], consistent: false }),
  ])
  const yelp = plan.directories.find((d) => d.key === 'yelp')!
  ok('status is differs', yelp.status === 'differs')
  ok('it names the phone, and only the phone', yelp.differs.join() === 'phone')
  ok('what was found is kept so the owner can see it', yelp.found?.phone === '(206) 555-9999')
  ok('it counts as needing work', plan.needsWork === 1)
}

section('a listing we looked for and could not find is missing, not matching')
{
  const plan = buildCitationPlan(SOURCE, [
    audit({ platform: 'tripadvisor', nameFound: null, addressFound: null, phoneFound: null, listingUrl: null, notes: 'No matching listing found.' }),
  ])
  const t = plan.directories.find((d) => d.key === 'tripadvisor')!
  ok('status is missing', t.status === 'missing')
  ok('it does not pretend to have found values', t.found === null)
  ok('missing counts as work to do', plan.needsWork === 1)
  ok('the note survives to the screen', t.notes === 'No matching listing found.')
}

section('an incomplete Google listing stops the whole card')
{
  const plan = buildCitationPlan({ ...SOURCE, address: '' }, [])
  ok('it is flagged as not ready', plan.sourceReady === false)
  ok('it names what is missing', plan.sourceMissing.join() === 'address')
  ok('the headline explains why nothing can proceed', /nothing to match/i.test(plan.headline))
  ok('two missing fields both get named', buildCitationPlan({ name: '', address: '', phone: '1' }, []).sourceMissing.length === 2)
}

/* ── working order ───────────────────────────────────────────────── */

section('the owner works on real problems first')
{
  const plan = buildCitationPlan(SOURCE, [
    audit({ platform: 'yelp' }),
    audit({ platform: 'facebook', nameFound: null, addressFound: null, phoneFound: null }),
    audit({ platform: 'apple_maps', nameFound: 'Yellow Bee', inconsistencies: ['name'], consistent: false }),
  ])
  const order = plan.directories.map((d) => d.status)
  ok('a mismatch comes before a missing listing', order.indexOf('differs') < order.indexOf('missing'))
  ok('a missing listing comes before an unchecked one', order.indexOf('missing') < order.indexOf('unchecked'))
  ok('anything already matching sinks to the bottom', order[order.length - 1] === 'match')
}

/* ── the copyable answer ─────────────────────────────────────────── */

section('the three lines the owner pastes everywhere')
{
  const vals = correctValues(SOURCE)
  ok('all three come from the Google source', vals.length === 3 && vals[0].value === SOURCE.name)
  ok('an empty field is dropped, not shown blank', correctValues({ ...SOURCE, phone: '' }).length === 2)
  ok('two items read naturally', joinWords(['name', 'phone']) === 'name and phone')
  ok('three items read naturally', joinWords(['name', 'address', 'phone']) === 'name, address and phone')
  ok('one item has no stray joiner', joinWords(['phone']) === 'phone')
}

section('every directory can actually be acted on')
{
  ok('each has a real https link', DIRECTORIES.every((d) => /^https:\/\//.test(d.actionUrl)))
  ok('each says what the button does', DIRECTORIES.every((d) => d.actionLabel.trim().length > 4))
  ok('each says why it matters', DIRECTORIES.every((d) => d.why.trim().length > 10))
  ok('no invented statistics in the reasons', !DIRECTORIES.some((d) => /\d+\s*%|\d+ percent/.test(d.why)))
  ok('only Yelp claims an automatic check', DIRECTORIES.filter((d) => d.autoCheck).map((d) => d.key).join() === 'yelp')
  ok('keys are unique', new Set(DIRECTORIES.map((d) => d.key)).size === DIRECTORIES.length)
}

/* ── the lanes ───────────────────────────────────────────────────── */

section('the three versions decode to three different lanes')
{
  ok('"yourself" is the free lane', gbpLaneFromDoer('done by you yourself, step by step, free') === 'diy')
  ok('"Apnosh AI" is the AI lane', gbpLaneFromDoer('done with Apnosh AI, step by step, free') === 'ai')
  ok('the two-part price is still the team lane', gbpLaneFromDoer('done for you by Apnosh, $195 then $115 a month') === 'team')
}

section('no owner-run lane promises a fix we cannot make')
{
  const rows = (v: 'diy' | 'ai' | 'team') => whatYouGet('listings', { version: v })[0].rows.join(' | ')
  const diy = rows('diy'), ai = rows('ai'), team = rows('team')
  ok('the three lanes do not render identical copy', new Set([diy, ai, team]).size === 3)
  ok('the free lane says YOU claim and correct them', /you claim and correct/i.test(diy))
  ok('the AI lane only claims to CHECK Yelp', /check yelp/i.test(ai))
  ok('neither owner-run lane says we fix the directories', !/we (fix|correct|claim|update) (them|your listings|each)/i.test(diy + ai))
  ok('neither owner-run lane promises a read-back proof', !/prove|read it back/i.test(diy + ai))
}

console.log(`\n${'='.repeat(52)}`)
console.log(fail === 0
  ? `RESULT: the directory plan never claims what it did not check, and the lanes are real (${pass} checks).`
  : `RESULT: ${fail} FAILED of ${pass + fail}.`)
process.exit(fail === 0 ? 0 : 1)
