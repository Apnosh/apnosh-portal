/* Slow-nights render smoke (renderToString, same idiom as smoke-render-plan-cart):
 *   1. the questionnaire comes first, and nothing is priced until it is answered
 *   2. the budget builds ONE plan, and the bill matches the total worked out BY HAND below
 *   3. a held service renders, carries its reason, and is NOT in the billed total
 *   4. the orphan rule holds crm-list when every send that would use it is held
 *   5. the builder really edits: taking a service out moves the money by exactly its price, and
 *      can break the chain
 *   6. nothing on any screen predicts people
 * Run: node_modules/.bin/tsx scripts/smoke-render-slow-nights.tsx */

import React from 'react'
import { renderToString } from 'react-dom/server'
import SlowNightsFlow from '../src/components/campaigns/slow-nights/slow-nights-flow'
import {
  STEPS,
  buildSlowNightsLines,
  billOf,
  addablesFor,
  type PlanLine,
} from '../src/components/campaigns/slow-nights/slow-nights-data'

let fail = 0
const ok = (cond: boolean, msg: string) => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${msg}`)
  if (!cond) fail++
}

const ANS = { night: 'Tuesday', draw: 'an event', start: '2026-08-18', budget: 1200 }
const specFor = (budget: string) => ({
  days: 'Tuesday',
  offer: 'an event',
  list: 'reaching your email + text list',
  budget,
})

/* GROUND TRUTH, restated by hand from the catalog rather than read off the render.
 * the full plan  RUN: tracking 365 + menu-eng 625 + event-pkg 385 + lto-launch 385 = 1760 once
 *                     bar-events 525 + gbp-posts 85 + reporting 150                =  760 monthly
 *                HELD: sms-found, sms-program, reminder-send (no send rail) + crm-list (orphaned)
 * a lean start   RUN: tracking 365 + event-pkg 385 = 750 once,  gbp-posts 85 monthly
 *                and step 4 "Make them come back" is EMPTY
 * Budget picks the plan by BILLED monthly, so $1,200 reaches the full plan and $250 does not. */
const TRUTH = {
  'the full plan': { once: 1760, monthly: 760, held: ['sms-found', 'crm-list', 'sms-program', 'reminder-send'] },
  'a lean start': { once: 750, monthly: 85, held: ['sms-found', 'crm-list', 'sms-program'] },
}

const STEP_NAMES = STEPS.map((s) => s.name)

function main() {
  /* ── the plan itself ──────────────────────────────────────────────────────────────── */
  for (const [budget, t] of Object.entries(TRUTH)) {
    console.log(`\n[${budget}]`)
    const lines = buildSlowNightsLines(specFor(budget))
    const bill = billOf(lines)

    ok(bill.once === t.once, `bills $${bill.once} once (hand total $${t.once})`)
    ok(bill.monthly === t.monthly, `bills $${bill.monthly} a month (hand total $${t.monthly})`)

    const held = lines.filter((l) => l.held).map((l) => l.id).sort()
    ok(held.join(',') === [...t.held].sort().join(','), `holds ${held.join(', ')}`)
    const heldTotal = lines.filter((l) => l.held).reduce((s: number, l: PlanLine) => s + l.amount, 0)
    const allTotal = lines.reduce((s: number, l: PlanLine) => s + l.amount, 0)
    ok(bill.once + bill.monthly === allTotal - heldTotal, `held $${heldTotal} is excluded from the bill`)

    const crm = lines.find((l) => l.id === 'crm-list')
    ok(!!crm?.held && /earn its keep/.test(crm.held), 'crm-list is held as an orphaned setup, with its reason')
  }

  /* ── 1. ask ───────────────────────────────────────────────────────────────────────── */
  console.log('\n[ask]')
  const ask = renderToString(<SlowNightsFlow />)
  ok(
    ['Which night is slow?', 'What brings people in?', 'When do you want it running?', 'What can you spend a month?']
      .every((q) => ask.includes(q)),
    'asks all four questions first',
  )
  ok(ask.includes('Answer all four'), 'the button stays off until every answer is in')
  ok(ask.includes('Build my plan') === false, 'and does not offer to build yet')
  ok(!/\$\d/.test(ask.replace(/\$300|\$700|\$1,500/g, '')), 'no price is shown before the questions are answered')
  ok(renderToString(<SlowNightsFlow initialAnswers={ANS} />).includes('Build my plan'), 'answered, it offers to build')

  /* ── 2. one plan, sized to the budget ─────────────────────────────────────────────── */
  console.log('\n[build]')
  const build = renderToString(<SlowNightsFlow initialPhase="build" initialAnswers={ANS} />)
  ok(build.includes('$1,760') && build.includes('to start'), '$1,200/mo builds the full plan ($1,760 to start)')
  ok(build.includes('$760') && build.includes('a month after that'), 'and $760 a month')
  ok(!/Budget friendly|Best plan|FITS YOUR BUDGET/.test(build), 'no three-plan chooser: one plan, built for the budget')
  ok(build.includes('Tap any step to take things out or add more.'), 'the plan says it can be edited')

  const lean = renderToString(<SlowNightsFlow initialPhase="build" initialAnswers={{ ...ANS, budget: 250 }} />)
  ok(lean.includes('$750'), 'under $300/mo builds the lean plan instead ($750 to start)')

  let at = -1
  ok(
    STEP_NAMES.every((n) => {
      const i = build.indexOf(n)
      if (i <= at) return false
      at = i
      return true
    }),
    'all four steps render in order, so an empty one cannot hide',
  )
  ok(lean.includes('Where this plan stops working'), 'the lean plan names where the chain breaks')
  ok(lean.includes('every week starts from zero'), 'and says what the break actually costs')
  ok(lean.includes('dashed'), 'the broken rung is drawn dashed, not solid')
  ok(!build.includes('Where this plan stops working'), 'the full plan has no break')
  ok(build.includes('Gives the next step something worth saying'), 'a live rung says what it hands down')
  ok(build.includes('Pause any time'), 'pause is stated before buying')
  ok(!/\$[\d,]+ a week/.test(build), 'never quotes a weekly price (the night is weekly, the bill is not)')

  /* ── 3. the builder actually edits ────────────────────────────────────────────────── */
  console.log('\n[edit]')
  const base = buildSlowNightsLines(specFor('the full plan'))
  const baseBill = billOf(base)

  // take one out: the money moves by exactly its price, and its step empties
  const cut = buildSlowNightsLines(specFor('the full plan'), { off: new Set(['reporting']) })
  const cutBill = billOf(cut)
  ok(cutBill.monthly === baseBill.monthly - 150, `removing the $150/mo report drops the month to $${cutBill.monthly}`)
  ok(cutBill.once === baseBill.once, 'and leaves the up-front total alone')
  const cutHtml = renderToString(
    <SlowNightsFlow initialPhase="build" initialAnswers={ANS} initialEdits={{ off: ['reporting'] }} />,
  )
  ok(cutHtml.includes('Where this plan stops working'), 'and an edit that empties a step breaks the chain')
  ok(cutHtml.includes('Changed by you.'), 'the plan says it is no longer the one we built')

  // put one in: something the catalog tags for this goal but the budget did not reach
  const more = addablesFor('draw', base).filter((l) => !l.held)
  ok(more.length > 0, `there is something to add to a step (${more.map((m) => m.id).join(', ') || 'none'})`)
  if (more.length) {
    const add = more[0]
    const grown = billOf(buildSlowNightsLines(specFor('the full plan'), { added: new Set([add.id]) }))
    const moved = add.kind === 'monthly' ? grown.monthly - baseBill.monthly : grown.once - baseBill.once
    ok(moved === add.amount, `adding ${add.id} moves the bill by exactly its $${add.amount}`)
  }

  // a held service is never addable, because adding it would be selling something we cannot run
  const heldAddables = STEPS.flatMap((s) => addablesFor(s.stage, base)).filter((l) => l.held)
  const stepHtml = renderToString(
    <SlowNightsFlow initialPhase="build" initialAnswers={ANS} initialStep="activate" />,
  )
  ok(heldAddables.length === 0 || !/data-toggle="(sms-program|paid-ads|loyalty)"/.test(stepHtml),
     'a held service is shown but has no add button')
  ok(stepHtml.includes('In your plan'), 'the step screen groups what you have')
  ok(stepHtml.includes('Not yet, and not billed'), 'and what we cannot run yet, unbilled')

  /* ── 4. nothing predicts people ───────────────────────────────────────────────────── */
  console.log('\n[honesty]')
  for (const [label, html] of [['ask', ask], ['build', build], ['step', stepHtml], ['lean', lean]] as const) {
    ok(
      !/(expect|projected|estimated|likely|up to)\s+[~+]?\d+\s*(more )?(covers|guests|people|visits)/i.test(html),
      `${label}: no predicted covers or guests`,
    )
    ok(!/NaN|undefined|\[object/.test(html), `${label}: no NaN/undefined/[object] rendered`)
  }

  console.log(fail ? `\nFAIL (${fail})` : '\nall green')
  process.exit(fail ? 1 : 0)
}

main()
