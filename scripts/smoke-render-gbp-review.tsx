/* Apnosh AI Google-profile review render smoke (renderToString, same idiom as
 * smoke-render-plan-cart):
 *   a) mixed statuses: the intro renders with the correct part count
 *   b) a good section's part screen shows "Looks good, next"
 *   c) a missing description's part screen shows the draft affordance
 *   d) an unknown section's part screen shows the honest could-not-read line
 *   e) the summary screen lists every part's outcome
 *   f) no em dashes anywhere in the rendered HTML
 * Run: node_modules/.bin/tsx scripts/smoke-render-gbp-review.tsx */

// localStorage stub before anything loads (the review reads it in effects only,
// but the stub keeps any lazy read harmless under renderToString).
const mem = new Map<string, string>()
;(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => { mem.set(k, String(v)) },
  removeItem: (k: string) => { mem.delete(k) },
  clear: () => { mem.clear() },
} as Storage

import React from 'react'
import { renderToString } from 'react-dom/server'

let fail = 0
const ok = (cond: boolean, msg: string) => { console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fail++ }

// The fixture mirrors the GET /api/dashboard/gbp-diagnosis wire shape.
const FIXTURE = {
  connected: true,
  readFailed: false,
  score: 52,
  sections: [
    { key: 'hours', label: 'Hours', status: 'good', current: 'Open 7 days, 11am to 9pm', why: 'People check your hours before they come.', aiFixable: false },
    { key: 'categories', label: 'Categories', status: 'needs-work', current: 'Restaurant', why: 'The right categories help Google show you in more searches.', aiFixable: false },
    { key: 'description', label: 'Description', status: 'missing', current: '', why: 'A short description tells people what makes you special.', aiFixable: true },
    { key: 'photos', label: 'Photos', status: 'unknown', current: 'Google did not give us your photos this time.', why: 'Photos help people pick you.', aiFixable: false },
    { key: 'menu', label: 'Menu', status: 'good', current: 'Menu link is set', why: 'People want to see the menu before they decide.', aiFixable: false },
    { key: 'links', label: 'Links', status: 'needs-work', current: 'No website link', why: 'Links let people order and book from your listing.', aiFixable: false },
  ],
  notes: [],
  checkedAt: '2026-07-11T00:00:00.000Z',
}

async function main() {
  const mod = await import('../src/components/mvp/gbp-fixer')
  const AiReview = mod.AiReview as unknown as React.ComponentType<Record<string, unknown>>
  const noop = () => undefined

  const base = {
    diag: FIXTURE,
    clientId: 'smoke-client',
    drafting: false,
    draft: null,
    draftError: null,
    copied: false,
    onDraft: noop,
    onCopy: noop,
    onRecheck: noop,
  }
  const rendered: string[] = []
  const render = (props: Record<string, unknown>) => {
    const html = renderToString(React.createElement(AiReview, { ...base, ...props }))
    rendered.push(html)
    return html
  }

  console.log('\n== a) the intro ==')
  const intro = render({})
  ok(intro.includes('part by part'), 'the intro moment renders')
  ok(/6(<!-- -->)?\s*parts/.test(intro), 'the part count (6) renders')
  ok(intro.includes('Start the review'), 'the Start button renders')
  ok(/3(<!-- -->)?\s*parts could use/.test(intro), 'the needs-work count (3) renders honestly')

  console.log('\n== b) a good part ==')
  const good = render({ initialPhase: 'part', initialIndex: 0 })
  ok(/Part\s*(<!-- -->)?1(<!-- -->)?\s*of\s*(<!-- -->)?6/.test(good.replace(/<!-- -->/g, '')), 'the progress line (Part 1 of 6) renders')
  ok(good.includes('Hours'), 'the part name renders')
  ok(good.includes('Looks good') && good.includes('Looks good, next'), 'the status chip and the approve button render')
  ok(good.includes('On Google now') && good.includes('Open 7 days, 11am to 9pm'), 'the current value renders under On Google now')
  ok(good.includes('Why it matters'), 'the why-it-matters block renders')

  console.log('\n== c) the missing description (AI draft) ==')
  const desc = render({ initialPhase: 'part', initialIndex: 2 })
  ok(desc.includes('Description') && desc.includes('Missing'), 'the part renders with its Missing chip')
  ok(desc.includes('Draft it for me'), 'the AI draft affordance renders')
  ok(desc.includes('Nothing yet'), 'an empty current value renders as Nothing yet')
  ok(desc.includes('I updated it') && desc.includes('Skip for now'), 'the honest done/skip actions render')
  const descWithDraft = render({ initialPhase: 'part', initialIndex: 2, draft: 'We serve wood-fired pizza made fresh every day.' })
  ok(descWithDraft.includes('Copy') && descWithDraft.includes('business.google.com'), 'a written draft renders with Copy + the open-Google link')
  ok(descWithDraft.includes('One-tap apply to Google is coming'), 'the honest no-apply line renders')

  console.log('\n== d) an unknown part ==')
  const unk = render({ initialPhase: 'part', initialIndex: 3 })
  ok(unk.includes('We could not read this part.'), 'the honest could-not-read line renders')
  ok(unk.includes('Could not check'), 'the chip says Could not check')
  ok(unk.includes('Skip for now'), 'Skip for now renders')
  ok(!unk.includes('I updated it') && !unk.includes('Draft it for me') && !unk.includes('Fix it on Google'), 'no fix/draft/updated actions on an unknown part')

  console.log('\n== e) the summary ==')
  const summary = render({
    initialPhase: 'summary',
    initialOutcomes: { hours: 'good', categories: 'updated', description: 'skipped', photos: 'unknown', menu: 'good', links: 'skipped' },
  })
  ok(summary.includes('You went through every part'), 'the summary title renders (not all good)')
  for (const label of ['Hours', 'Categories', 'Description', 'Photos', 'Menu', 'Links']) {
    ok(summary.includes(label), `the ${label} part is listed`)
  }
  ok(summary.includes('Looks good'), 'a good part reads Looks good')
  ok(summary.includes('You updated it'), 'an updated part reads You updated it')
  ok(summary.includes('Skipped'), 'a skipped part reads Skipped')
  ok(summary.includes('Could not check'), 'an unknown part reads Could not check')
  ok(summary.includes('Check my profile again'), 'the re-check button renders')
  ok(summary.includes('can take a few minutes to show up'), 'the honest delay note renders')

  // The all-good read shows the celebration on the summary.
  const allGoodDiag = { ...FIXTURE, sections: FIXTURE.sections.map((s) => ({ ...s, status: 'good', current: s.current || 'Set' })) }
  const celebrate = render({ diag: allGoodDiag, initialPhase: 'summary', taskDone: true })
  ok(celebrate.includes('Every section looks good'), 'the all-good celebration renders')
  ok(celebrate.includes('This campaign task is complete'), 'the task-done line renders when the PATCH landed')
  ok(!celebrate.includes('Check my profile again'), 'no re-check button when everything reads good')

  console.log('\n== f) no em dashes ==')
  ok(rendered.every((h) => !h.includes('\u2014')), 'no em dash in any rendered screen')
  ok(rendered.every((h) => !h.includes('\u2013')), 'no en dash in any rendered screen either')

  console.log(fail ? `\n${fail} FAILURES` : '\nALL PASS')
  process.exit(fail ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(1) })
