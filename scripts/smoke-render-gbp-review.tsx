/* Apnosh AI Google-profile review render smoke (renderToString, same idiom as
 * smoke-render-plan-cart):
 *   a) mixed statuses: the intro renders with the correct part count
 *   b) a good hours part: the 7-day table (incl a Closed day), the special-hours
 *      line, "This is correct, next" AND the "Something is off" affordance
 *   c) categories: primary + additional render as chips
 *   d) description: the FULL text renders + the draft affordance on needs-work
 *   e) photos: the summary line + a grid of img tags with the fixture URLs
 *   f) menu: item names + prices, the "and N more" cap line, the menu link
 *   g) links: website (tappable) + phone render
 *   h) fallbacks: a detail-less part falls back to the summary string; a
 *      missing description with no detail says Nothing yet + Draft it for me
 *   i) an unknown part keeps the honest could-not-read screen
 *   j) the summary screen lists every part's outcome
 *   k) no em dashes anywhere in the rendered HTML
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

// The fixture mirrors the GET /api/dashboard/gbp-diagnosis wire shape,
// including the per-section `detail` payload the engine now emits.
const HOURS_DETAIL = {
  kind: 'hours',
  days: [
    { day: 'Monday', hours: '8:00 AM to 9:00 PM' },
    { day: 'Tuesday', hours: '8:00 AM to 9:00 PM' },
    { day: 'Wednesday', hours: '8:00 AM to 9:00 PM' },
    { day: 'Thursday', hours: '8:00 AM to 9:00 PM' },
    { day: 'Friday', hours: '8:00 AM to 10:00 PM' },
    { day: 'Saturday', hours: '9:00 AM to 2:00 PM, 5:00 PM to 10:00 PM' },
    { day: 'Sunday', hours: 'Closed' },
  ],
  specialCount: 2,
}

const DESCRIPTION_TEXT = 'Fresh tacos made every morning with local corn and slow cooked meats. Family owned since 1998 and proud of it.'

const FIXTURE = {
  connected: true,
  readFailed: false,
  score: 68,
  sections: [
    {
      key: 'hours', label: 'Your hours', status: 'good',
      current: 'Hours set for 6 of 7 days. You also set special hours for 2 dates.',
      why: 'People check your hours before they come.', aiFixable: false,
      detail: HOURS_DETAIL,
    },
    {
      key: 'categories', label: 'Your categories', status: 'good',
      current: 'Main category is Grocery store, plus 2 more.',
      why: 'The right categories help Google show you in more searches.', aiFixable: true,
      detail: { kind: 'categories', primary: 'Grocery store', additional: ['Cafe', 'Deli'] },
    },
    {
      key: 'description', label: 'Your description', status: 'needs-work',
      current: 'Your description is 111 characters. Google gives you room for 750.',
      why: 'A short description tells people what makes you special.', aiFixable: true,
      detail: { kind: 'description', text: DESCRIPTION_TEXT },
    },
    {
      key: 'photos', label: 'Your photos', status: 'needs-work',
      current: '9 photos. Newest is about 8 months old.',
      why: 'Photos help people pick you.', aiFixable: false,
      detail: {
        kind: 'photos', count: 9, newestLabel: 'about 8 months old',
        items: [
          { url: 'https://photos.example.com/one.jpg' },
          { url: 'https://photos.example.com/two.jpg' },
          { url: 'https://photos.example.com/three.jpg' },
        ],
      },
    },
    {
      key: 'menu', label: 'Your menu', status: 'good',
      current: 'Menu on Google with 15 items, and your menu link is set.',
      why: 'People want to see the menu before they decide.', aiFixable: true,
      detail: {
        kind: 'menu', itemCount: 15,
        items: [
          { name: 'Carnitas taco', price: '$4.50' },
          { name: 'Al pastor taco', price: '$4.75' },
          { name: 'Chips and salsa', price: '$3.00' },
          { name: 'Horchata' },
          { name: 'Elote', price: '$5.25' },
        ],
        menuLink: 'https://tacoexample.com/menu',
      },
    },
    {
      key: 'links', label: 'Website and phone', status: 'good',
      current: 'Website and phone number are both set.',
      why: 'Links let people order and book from your listing.', aiFixable: false,
      detail: { kind: 'links', website: 'https://tacoexample.com', phone: '(555) 123-4567' },
    },
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
  // SSR sprinkles "<!-- -->" comments between text children; strip them so
  // string assertions read like the owner does.
  const render = (props: Record<string, unknown>) => {
    const html = renderToString(React.createElement(AiReview, { ...base, ...props })).replace(/<!-- -->/g, '')
    rendered.push(html)
    return html
  }

  console.log('\n== a) the intro ==')
  const intro = render({})
  ok(intro.includes('part by part'), 'the intro moment renders')
  ok(/6\s*parts/.test(intro), 'the part count (6) renders')
  ok(intro.includes('Start the review'), 'the Start button renders')
  ok(/2\s*parts could use/.test(intro), 'the needs-work count (2) renders honestly')
  ok(intro.includes('We pulled what Google shows today'), 'the honest we-pulled-it line renders')

  console.log('\n== b) a good hours part: the real 7-day table + confirm ==')
  const hoursPart = render({ initialPhase: 'part', initialIndex: 0 })
  ok(/Part\s*1\s*of\s*6/.test(hoursPart), 'the progress line (Part 1 of 6) renders')
  ok(hoursPart.includes('Your hours') && hoursPart.includes('Looks good'), 'the part name and status chip render')
  for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']) {
    ok(hoursPart.includes(day), `the ${day} row renders`)
  }
  ok(hoursPart.includes('8:00 AM to 9:00 PM'), 'real open/close times render')
  ok(hoursPart.includes('9:00 AM to 2:00 PM, 5:00 PM to 10:00 PM'), 'a split-shift day renders both ranges')
  ok(hoursPart.includes('Closed'), 'the closed day says Closed')
  ok(/special hours for\s*2\s*dates/.test(hoursPart), 'the special-hours count line renders')
  ok(hoursPart.includes('This is correct, next'), 'a good part asks the owner to confirm (This is correct, next)')
  ok(hoursPart.includes('Something is off'), 'the Something is off affordance renders on a good part')
  ok(hoursPart.includes('On Google now') && hoursPart.includes('Why it matters'), 'the block labels render')

  console.log('\n== c) categories: real chips ==')
  const cats = render({ initialPhase: 'part', initialIndex: 1 })
  ok(/Main:\s*Grocery store/.test(cats), 'the primary category renders as the Main chip')
  ok(cats.includes('Cafe') && cats.includes('Deli'), 'the additional categories render as chips')
  ok(cats.includes('This is correct, next') && cats.includes('Something is off'), 'the confirm + something-is-off pair renders')

  console.log('\n== d) description: the full text + draft ==')
  const desc = render({ initialPhase: 'part', initialIndex: 2 })
  ok(desc.includes('Your description') && desc.includes('Needs work'), 'the part renders with its Needs work chip')
  ok(desc.includes(DESCRIPTION_TEXT), 'the FULL description text renders')
  ok(desc.includes('Draft it for me'), 'the AI draft affordance renders')
  ok(desc.includes('I updated it') && desc.includes('Skip for now'), 'the honest done/skip actions render')
  const descWithDraft = render({ initialPhase: 'part', initialIndex: 2, draft: 'We serve wood-fired pizza made fresh every day.' })
  ok(descWithDraft.includes('Copy') && descWithDraft.includes('business.google.com'), 'a written draft renders with Copy + the open-Google link')
  ok(descWithDraft.includes('One-tap apply to Google is coming'), 'the honest no-apply line renders')

  console.log('\n== e) photos: the grid ==')
  const photos = render({ initialPhase: 'part', initialIndex: 3 })
  ok(photos.includes('9 photos. Newest is about 8 months old.'), 'the count + freshness line renders above the grid')
  ok(photos.includes('<img'), 'the grid renders img tags')
  for (const url of ['https://photos.example.com/one.jpg', 'https://photos.example.com/two.jpg', 'https://photos.example.com/three.jpg']) {
    ok(photos.includes(url), `the photo ${url.split('/').pop()} renders`)
  }
  ok(photos.includes('loading="lazy"'), 'the thumbnails lazy-load')

  console.log('\n== f) menu: real items + the cap line + the link ==')
  const menu = render({ initialPhase: 'part', initialIndex: 4 })
  for (const name of ['Carnitas taco', 'Al pastor taco', 'Chips and salsa', 'Horchata', 'Elote']) {
    ok(menu.includes(name), `the ${name} item renders`)
  }
  ok(menu.includes('$4.50') && menu.includes('$5.25'), 'item prices render when Google has them')
  ok(/and\s*10\s*more/.test(menu), 'the "and 10 more" cap line renders (15 items, 5 shown)')
  ok(menu.includes('https://tacoexample.com/menu'), 'the menu link renders')

  console.log('\n== g) links: website + phone ==')
  const links = render({ initialPhase: 'part', initialIndex: 5 })
  ok(links.includes('Website') && links.includes('https://tacoexample.com'), 'the website row renders with the real URL')
  ok(links.includes('href="https://tacoexample.com"') && links.includes('target="_blank"'), 'the website is tappable and opens a new tab')
  ok(links.includes('Phone') && links.includes('(555) 123-4567'), 'the phone row renders with the real number')

  console.log('\n== h) fallbacks: never a blank box ==')
  // A detail-less section (older cache, failed read) falls back to the summary string.
  const noDetailDiag = {
    ...FIXTURE,
    sections: FIXTURE.sections.map((s) => (s.key === 'hours' ? { key: s.key, label: s.label, status: s.status, current: s.current, why: s.why, aiFixable: s.aiFixable } : s)),
  }
  const fallback = render({ diag: noDetailDiag, initialPhase: 'part', initialIndex: 0 })
  ok(!fallback.includes('Monday'), 'no invented table when detail is missing')
  ok(fallback.includes('Hours set for 6 of 7 days.'), 'a detail-less part falls back to the summary string')
  ok(fallback.includes('This is correct, next') && fallback.includes('Something is off'), 'the confirm actions still render on the fallback')
  // A missing description (no detail, empty current) still reads Nothing yet + draft.
  const missingDescDiag = {
    ...FIXTURE,
    sections: FIXTURE.sections.map((s) => (s.key === 'description' ? { ...s, status: 'missing', current: '', detail: undefined } : s)),
  }
  const missingDesc = render({ diag: missingDescDiag, initialPhase: 'part', initialIndex: 2 })
  ok(missingDesc.includes('Missing'), 'the Missing chip renders')
  ok(missingDesc.includes('Nothing yet'), 'an empty current value renders as Nothing yet')
  ok(missingDesc.includes('Draft it for me'), 'the AI draft affordance renders on a missing description')

  console.log('\n== i) an unknown part ==')
  const unknownDiag = {
    ...FIXTURE,
    sections: FIXTURE.sections.map((s) => (s.key === 'photos' ? { ...s, status: 'unknown', current: 'We could not read your photos right now.', detail: undefined } : s)),
  }
  const unk = render({ diag: unknownDiag, initialPhase: 'part', initialIndex: 3 })
  ok(unk.includes('We could not read this part.'), 'the honest could-not-read line renders')
  ok(unk.includes('Could not check'), 'the chip says Could not check')
  ok(unk.includes('Skip for now'), 'Skip for now renders')
  ok(!unk.includes('I updated it') && !unk.includes('Draft it for me') && !unk.includes('Fix it on Google'), 'no fix/draft/updated actions on an unknown part')

  console.log('\n== j) the summary ==')
  const summary = render({
    initialPhase: 'summary',
    initialOutcomes: { hours: 'good', categories: 'good', description: 'skipped', photos: 'updated', menu: 'good', links: 'good' },
  })
  ok(summary.includes('You went through every part'), 'the summary title renders (not all good)')
  for (const label of ['Your hours', 'Your categories', 'Your description', 'Your photos', 'Your menu', 'Website and phone']) {
    ok(summary.includes(label), `the ${label} part is listed`)
  }
  ok(summary.includes('Looks good'), 'a good part reads Looks good')
  ok(summary.includes('You updated it'), 'an updated part reads You updated it')
  ok(summary.includes('Skipped'), 'a skipped part reads Skipped')
  ok(summary.includes('Check my profile again'), 'the re-check button renders')
  ok(summary.includes('can take a few minutes to show up'), 'the honest delay note renders')

  // The all-good read shows the celebration on the summary.
  const allGoodDiag = { ...FIXTURE, sections: FIXTURE.sections.map((s) => ({ ...s, status: 'good', current: s.current || 'Set' })) }
  const celebrate = render({ diag: allGoodDiag, initialPhase: 'summary', taskDone: true })
  ok(celebrate.includes('Every section looks good'), 'the all-good celebration renders')
  ok(celebrate.includes('This campaign task is complete'), 'the task-done line renders when the PATCH landed')
  ok(!celebrate.includes('Check my profile again'), 'no re-check button when everything reads good')

  console.log('\n== k) no em dashes ==')
  ok(rendered.every((h) => !h.includes('\u2014')), 'no em dash in any rendered screen')
  ok(rendered.every((h) => !h.includes('\u2013')), 'no en dash in any rendered screen either')

  console.log(fail ? `\n${fail} FAILURES` : '\nALL PASS')
  process.exit(fail ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(1) })
