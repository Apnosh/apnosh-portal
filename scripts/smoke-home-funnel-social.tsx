/* Home-funnel SOCIAL-fold smoke — a pure unit test of computeHome (the funnel canvas
 * draws imperatively, so renderToString can't observe its numbers; computeHome is the
 * honest unit to exercise). Verifies that social REACH folds into the TOP stage only:
 *
 *   a) google=68 + social=80 → Awareness count = 148, tag 'Real · Google + Social',
 *      sub relabelled, and the honest split 'Google 68 · Social 80' shows
 *   b) google=68 + social=0 → Awareness 68, tag 'Real · Google', sub byte-identical to
 *      the pre-change wording, no split. A legacy Views with NO google/social fields
 *      behaves identically (back-compat)
 *   c) social-only edge (google=0, social>0) → Awareness = social reach, tag/split sane
 *   d) no em dashes anywhere in the produced copy
 *   e) the deeper stages stay Google-only (Interest/Customer actions/Orders/Retention
 *      tags + counts are unaffected by social)
 *
 * Run: node_modules/.bin/tsx scripts/smoke-home-funnel-social.tsx */

import { computeHome, type Views, type Actions } from '../src/components/mvp/home-funnel'

let fail = 0
function ok(cond: boolean, msg: string) {
  console.log((cond ? '  ok   ' : '  FAIL ') + msg)
  if (!cond) fail++
}

const ACTIONS: Actions = { directions: 40, calls: 6, websiteClicks: 20 }
const RATE = 0.5
const TICKET = 24
const NO_YOY = null

// every string computeHome authored, so an em-dash sweep can't miss one
function allStrings(r: ReturnType<typeof computeHome>): string {
  const s: string[] = []
  for (const st of r.stages) s.push(st.label, st.sub ?? '', st.tag, st.split ?? '', st.conv ?? '')
  for (const t of r.stats) s.push(t.value, t.label)
  return s.join(' | ')
}
const aware = (r: ReturnType<typeof computeHome>) => r.stages.find((s) => s.key === 'shown')!

function main() {
  console.log('\n== a) Google + Social folded into Awareness ==')
  const vA: Views = { total: 148, google: 68, social: 80, maps: 50, search: 18 }
  const rA = computeHome(vA, ACTIONS, RATE, TICKET, '$', NO_YOY)
  const aA = aware(rA)
  ok(aA.count === 148, `Awareness count folds to 148 (got ${aA.count})`)
  ok(aA.tag === 'Real · Google + Social', `tag is 'Real · Google + Social' (got '${aA.tag}')`)
  ok(aA.sub === 'times you showed up on Google and social', `sub relabelled honestly (got '${aA.sub}')`)
  ok(aA.split === 'Google 68 · Social 80', `the honest split shows (got '${aA.split}')`)

  console.log('\n== b) Google-only stays byte-identical to today ==')
  const vB: Views = { total: 68, google: 68, social: 0, maps: 50, search: 18 }
  const rB = computeHome(vB, ACTIONS, RATE, TICKET, '$', NO_YOY)
  const aB = aware(rB)
  ok(aB.count === 68, `Awareness count = 68 (got ${aB.count})`)
  ok(aB.tag === 'Real · Google', `tag stays 'Real · Google' (got '${aB.tag}')`)
  ok(aB.sub === 'times you showed up on Google', `sub unchanged from pre-change wording (got '${aB.sub}')`)
  ok(aB.split === undefined, 'no split when social is 0')
  // a legacy caller (no google/social on Views) must be identical
  const vLegacy = { total: 68, maps: 50, search: 18 } as Views
  const aLegacy = aware(computeHome(vLegacy, ACTIONS, RATE, TICKET, '$', NO_YOY))
  ok(aLegacy.count === 68 && aLegacy.tag === 'Real · Google' && aLegacy.sub === 'times you showed up on Google' && aLegacy.split === undefined,
    'a legacy Views with no google/social behaves exactly as the Google-only case (back-compat)')

  console.log('\n== c) social-only edge (no Google impressions) ==')
  const vC: Views = { total: 80, google: 0, social: 80, maps: 0, search: 0 }
  const rC = computeHome(vC, ACTIONS, RATE, TICKET, '$', NO_YOY)
  const aC = aware(rC)
  ok(aC.count === 80, `Awareness count = social reach 80 (got ${aC.count})`)
  ok(aC.tag === 'Real · Google + Social', `tag reflects social (got '${aC.tag}')`)
  ok(aC.split === 'Google 0 · Social 80', `split reads Google 0 · Social 80 (got '${aC.split}')`)

  console.log('\n== d) no em dashes in any produced copy ==')
  for (const [name, r] of [['a', rA], ['b', rB], ['c', rC]] as const) {
    ok(!allStrings(r).includes('—'), `case ${name}: no em dash rendered`)
  }

  console.log('\n== e) deeper stages remain Google-measured (untouched by social) ==')
  // Interest = clicks+calls+directions; identical across the social/no-social cases since
  // only Awareness folds social. The tags below Awareness never mention social.
  const deeper = (r: ReturnType<typeof computeHome>) => r.stages.filter((s) => s.key !== 'shown')
  const iA = deeper(rA), iB = deeper(rB)
  ok(iA.every((s) => !/social/i.test(s.tag)), 'no deeper-stage tag mentions social')
  ok(iA[0].count === iB[0].count && iA[0].count === 66, `Interest is Google-only + unchanged (got ${iA[0].count})`)

  console.log(fail ? `\n${fail} FAILURES` : '\nALL PASS')
  process.exit(fail ? 1 : 0)
}

main()
