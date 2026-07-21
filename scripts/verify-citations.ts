/**
 * verify-citations — checks the "Get listed everywhere" card, with no network and no database.
 *
 * The thing under test is mostly HONESTY, not arithmetic. This card inspects nothing: no API
 * sits behind Yelp, Apple Maps or any of them for us. So every way it can go wrong is the same
 * shape, and it is the opposite of the usual one: not "did we compute this right" but "did we
 * imply we looked". Most of these checks exist to catch exactly that.
 *
 * Run: node_modules/.bin/tsx scripts/verify-citations.ts
 */

import {
  buildCitationPlan, headlineFor, correctValues, joinWords, DIRECTORIES,
  type SourceNap,
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

/* ── the honesty rules ───────────────────────────────────────────── */

section('the card never reports on a listing it cannot see')
{
  const plan = buildCitationPlan(SOURCE)
  const words = JSON.stringify(plan).toLowerCase()
  ok('nothing is described as checked', !/checked/.test(words))
  ok('nothing is described as matching or not matching', !/\bmatches\b|does not match|mismatch/.test(words))
  ok('nothing is described as missing or wrong', !/"missing"|is wrong|incorrect/.test(words))
  ok('the opening line makes no claim about their state', !/wrong|correct|match|check/i.test(plan.headline))
  ok('it offers the text and the places instead', /places worth having|exact text/i.test(plan.headline))
}

section('done means the owner said so, and reads that way')
{
  const plan = buildCitationPlan(SOURCE, ['yelp', 'bing'])
  ok('their claims are counted', plan.doneCount === 2)
  ok('the headline says THEY sorted them', /you have sorted 2 of 6/i.test(plan.headline))
  ok('it never says 2 are correct', !/2 (are|is) correct/i.test(plan.headline))
  ok('all six still appear', plan.directories.length === 6)
  ok('the ones done are flagged', plan.directories.filter((d) => d.done).map((d) => d.key).sort().join() === 'bing,yelp')
}

section('finishing is worded as a pass, not a guarantee')
{
  const all = DIRECTORIES.map((d) => d.key)
  const plan = buildCitationPlan(SOURCE, all)
  ok('everything done reads as been through them', /been through all of them/i.test(plan.headline))
  ok('it does not claim they are now right', !/correct|right|fixed|matching/i.test(plan.headline))
  ok('doneCount equals the list', plan.doneCount === plan.total)
}

section('an incomplete Google listing stops the whole card')
{
  const plan = buildCitationPlan({ ...SOURCE, address: '' })
  ok('it is flagged as not ready', plan.sourceReady === false)
  ok('it names what is missing', plan.sourceMissing.join() === 'address')
  ok('the headline explains why nothing can proceed', /nothing for the others to copy/i.test(plan.headline))
  ok('two missing fields both get named', buildCitationPlan({ name: '', address: '', phone: '1' }).sourceMissing.length === 2)
  ok('a complete source is ready', buildCitationPlan(SOURCE).sourceReady === true)
}

/* ── working order ───────────────────────────────────────────────── */

section('the list opens on what is left')
{
  const plan = buildCitationPlan(SOURCE, ['yelp'])
  ok('a finished one sinks below the unfinished', plan.directories[plan.directories.length - 1].key === 'yelp')
  ok('the first entry is still to do', plan.directories[0].done === false)
  ok('with nothing done, Yelp leads', buildCitationPlan(SOURCE).directories[0].key === 'yelp')
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
  ok('no items is empty, not a dangling word', joinWords([]) === '')
}

section('every directory can actually be acted on')
{
  ok('each has a real https link', DIRECTORIES.every((d) => /^https:\/\//.test(d.actionUrl)))
  ok('each says what the button does', DIRECTORIES.every((d) => d.actionLabel.trim().length > 4))
  ok('each says why it matters', DIRECTORIES.every((d) => d.why.trim().length > 10))
  ok('each carries the thing that trips people up', DIRECTORIES.every((d) => d.tip.trim().length > 20))
  ok('no invented statistics anywhere', !DIRECTORIES.some((d) => /\d+\s*%|\d+ percent/.test(d.why + d.tip)))
  ok('keys are unique', new Set(DIRECTORIES.map((d) => d.key)).size === DIRECTORIES.length)
  ok('no directory claims we check it', !DIRECTORIES.some((d) => /we (check|read|scan|monitor)/i.test(d.why + d.tip)))
}

/* ── the three lanes ─────────────────────────────────────────────── */

section('the three versions decode to three different lanes')
{
  ok('"yourself" is the free lane', gbpLaneFromDoer('done by you yourself, step by step, free') === 'diy')
  ok('"Apnosh AI" is the walk-through lane', gbpLaneFromDoer('done with Apnosh AI, step by step, free') === 'ai')
  ok('the two-part price is still the team lane', gbpLaneFromDoer('done for you by Apnosh, $195 then $115 a month') === 'team')
}

section('no owner-run lane promises something we cannot do')
{
  const rows = (v: 'diy' | 'ai' | 'team') => whatYouGet('listings', { version: v })[0].rows.join(' | ')
  const diy = rows('diy'), ai = rows('ai'), team = rows('team')
  const owner = diy + ai

  ok('the three lanes do not render identical copy', new Set([diy, ai, team]).size === 3)
  ok('the free lane says YOU claim and correct them', /you claim and correct/i.test(diy))
  ok('no owner-run lane claims we check a directory', !/we check|we read|we scan|we look at/i.test(owner))
  ok('no owner-run lane claims we fix a directory', !/we (fix|correct|claim|update|sync)/i.test(owner))
  ok('no owner-run lane names Yelp as something we inspect', !/check yelp|yelp against/i.test(owner))
  ok('no owner-run lane promises a read-back proof', !/prove|read it back/i.test(owner))
  ok('the walk-through lane earns its difference on guidance', /trips people up|one site at a time/i.test(ai))
  ok('the walk-through lane offers to remember progress', /remembers|come back/i.test(ai))
}

console.log(`\n${'='.repeat(52)}`)
console.log(fail === 0
  ? `RESULT: the listings card never implies it looked, and the three lanes are real (${pass} checks).`
  : `RESULT: ${fail} FAILED of ${pass + fail}.`)
process.exit(fail === 0 ? 0 : 1)
