/* Apnosh AI Google-profile review render smoke (renderToString, same idiom as
 * smoke-render-plan-cart):
 *   a) mixed statuses: the intro renders with the correct part count
 *   b) a good hours part: the 7-day table (incl a Closed day), the special-hours
 *      line, the small Edit affordance, and the Next button (no confirm pair)
 *   c) categories (good): chips + the small "Edit on Google" link (no in-app editor)
 *   d) description (needs-work): the FULL text + the prominent Edit button
 *   e) the description EDITOR (test seam): prefilled textarea, char count vs the
 *      250-750 rule, "Draft it for me", "Save to Google", Cancel
 *   f) the hours EDITOR (test seam): 7 day rows, time inputs prefilled, the
 *      closed day checked, the honest multi-range replace note
 *   g) the links EDITOR (test seam): Website + Phone inputs prefilled + Save
 *   h) photos (needs-work): the grid + the "Edit this on Google" block + re-check line
 *   i) menu (good): items + the small Edit-on-Google link
 *   j) links part (good): website + phone rows + the small Edit affordance
 *   k) honest save strings: applyResultNote maps live:true / live:false / 429 /
 *      raw-5xx correctly, and injected notes render on the part screen
 *   l) fallbacks + unknown part unchanged
 *   m) the summary lists outcomes + the What's-next reviews card
 *   n) the helper hub renders all three cards (and the Continue variant)
 *   p) Questions and answers: the list (Answered + Needs-an-answer chips, the
 *      merchant answer under answered ones, the Asked line), the empty state,
 *      the failed-read state (+ the api_disabled plain line), and the answer
 *      screen (prefilled textarea, Draft it for me, Save answer, the Pro
 *      hint, honest answerResultNote strings)
 *   q) Post an update: the composer (textarea + live count vs the 1500 rule,
 *      the button picker None/Learn more/Call, the https link field, Draft it
 *      for me, Publish to Google, the non-Pro hint), honest postResultNote
 *      strings, and the posted screen (proof line, See-it link only when
 *      Google sent one back, Post again)
 *   o) the last part says Finish; no em dashes anywhere
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
// including the per-section `detail` payload the engine emits.
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
  const GbpHelperHub = mod.GbpHelperHub as unknown as React.ComponentType<Record<string, unknown>>
  const applyResultNote = mod.applyResultNote as (status: number, body: Record<string, unknown> | null) => { tone: string; text: string }
  const noop = () => undefined

  const base = {
    diag: FIXTURE,
    clientId: 'smoke-client',
    drafting: false,
    draft: null,
    draftError: null,
    onDraft: noop,
    onRecheck: noop,
  }
  const rendered: string[] = []
  // SSR sprinkles "<!-- -->" comments between text children; strip them so
  // string assertions read like the owner does.
  const strip = (html: string) => html.replace(/<!-- -->/g, '')
  const render = (props: Record<string, unknown>) => {
    const html = strip(renderToString(React.createElement(AiReview, { ...base, ...props })))
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

  console.log('\n== b) a good hours part: the real 7-day table + Edit + Next ==')
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
  ok(hoursPart.includes('Edit'), 'the small Edit affordance renders on the hours part')
  ok(hoursPart.includes('>Next<'), 'the primary button is Next')
  ok(!hoursPart.includes('This is correct, next') && !hoursPart.includes('Something is off'), 'the old confirm/complain pair is gone')
  ok(hoursPart.includes('On Google now') && hoursPart.includes('Why it matters'), 'the block labels render')

  console.log('\n== c) categories: chips + Edit on Google (no in-app editor) ==')
  const cats = render({ initialPhase: 'part', initialIndex: 1 })
  ok(/Main:\s*Grocery store/.test(cats), 'the primary category renders as the Main chip')
  ok(cats.includes('Cafe') && cats.includes('Deli'), 'the additional categories render as chips')
  ok(cats.includes('Edit on Google'), 'the Edit affordance is the Google link')
  ok(cats.includes('https://business.google.com/info'), 'the categories link points at the Google info editor')
  ok(!cats.includes('<textarea') && !cats.includes('type="time"'), 'no in-app editor exists for categories')
  ok(cats.includes('>Next<'), 'Next renders on the categories part')

  console.log('\n== d) description (needs-work): full text + prominent Edit ==')
  const desc = render({ initialPhase: 'part', initialIndex: 2 })
  ok(desc.includes('Your description') && desc.includes('Needs work'), 'the part renders with its Needs work chip')
  ok(desc.includes(DESCRIPTION_TEXT), 'the FULL description text renders')
  ok(desc.includes('Edit your description'), 'the prominent Edit affordance renders on a needs-work description')
  ok(desc.includes('>Next<'), 'Next renders as the move-on action')
  ok(!desc.includes('I updated it'), 'the old I-updated-it button is gone')

  console.log('\n== e) the description editor (seam) ==')
  const descEdit = render({ initialPhase: 'part', initialIndex: 2, initialEditing: true })
  ok(descEdit.includes('<textarea'), 'the textarea renders')
  ok(descEdit.includes(DESCRIPTION_TEXT), 'the textarea is prefilled with the current text')
  ok(new RegExp(`${DESCRIPTION_TEXT.length}\\s*of\\s*750 characters`).test(descEdit), 'the live character count renders')
  ok(descEdit.includes('Aim for 250 to 750'), 'the 250-750 rule renders')
  ok(descEdit.includes('Draft it for me'), 'Draft it for me lives inside the editor (fills the textarea)')
  ok(descEdit.includes('Save to Google'), 'the Save to Google button renders')
  ok(descEdit.includes('Cancel'), 'Cancel renders')

  console.log('\n== f) the hours editor (seam): 7 rows ==')
  const hoursEdit = render({ initialPhase: 'part', initialIndex: 0, initialEditing: true })
  for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']) {
    ok(hoursEdit.includes(day), `the ${day} editor row renders`)
  }
  const timeInputs = (hoursEdit.match(/type="time"/g) ?? []).length
  ok(timeInputs === 12, `open/close time inputs render for the 6 open days (got ${timeInputs})`)
  ok(hoursEdit.includes('value="08:00"') && hoursEdit.includes('value="21:00"'), 'times prefill from what Google shows')
  ok(/checked/.test(hoursEdit), 'the closed day (Sunday) prefills as Closed')
  ok(hoursEdit.includes('This day has more than one time range on Google. Saving replaces it with one range.'), 'the honest multi-range replace note renders')
  ok(hoursEdit.includes('Save to Google'), 'the Save to Google button renders')

  console.log('\n== g) the links editor (seam): 2 labeled inputs ==')
  const linksEdit = render({ initialPhase: 'part', initialIndex: 5, initialEditing: true })
  ok(linksEdit.includes('Website') && linksEdit.includes('Phone'), 'the Website and Phone labels render')
  ok(linksEdit.includes('value="https://tacoexample.com"'), 'the website input prefills')
  ok(linksEdit.includes('value="(555) 123-4567"'), 'the phone input prefills')
  ok(linksEdit.includes('Save to Google'), 'the Save to Google button renders')

  console.log('\n== h) photos (needs-work): grid + Edit this on Google ==')
  const photos = render({ initialPhase: 'part', initialIndex: 3 })
  ok(photos.includes('9 photos. Newest is about 8 months old.'), 'the count + freshness line renders above the grid')
  ok(photos.includes('<img'), 'the grid renders img tags')
  for (const url of ['https://photos.example.com/one.jpg', 'https://photos.example.com/two.jpg', 'https://photos.example.com/three.jpg']) {
    ok(photos.includes(url), `the photo ${url.split('/').pop()} renders`)
  }
  ok(photos.includes('loading="lazy"'), 'the thumbnails lazy-load')
  ok(photos.includes('Edit this on Google'), 'the Google edit link renders (no fake in-app editor)')
  ok(photos.includes('https://business.google.com/photos'), 'the photos link points at the Google photos editor')
  ok(photos.includes('then come back. We will re-check.'), 'the honest come-back line renders')
  ok(!photos.includes('<textarea') && !photos.includes('type="time"'), 'no in-app editor exists for photos')

  console.log('\n== i) menu (good): items + the small Edit-on-Google link ==')
  const menu = render({ initialPhase: 'part', initialIndex: 4 })
  for (const name of ['Carnitas taco', 'Al pastor taco', 'Chips and salsa', 'Horchata', 'Elote']) {
    ok(menu.includes(name), `the ${name} item renders`)
  }
  ok(menu.includes('$4.50') && menu.includes('$5.25'), 'item prices render when Google has them')
  ok(/and\s*10\s*more/.test(menu), 'the "and 10 more" cap line renders (15 items, 5 shown)')
  ok(menu.includes('https://tacoexample.com/menu'), 'the menu link renders')
  ok(menu.includes('Edit on Google') && menu.includes('https://business.google.com/menu'), 'the menu Edit affordance is the Google link')

  console.log('\n== j) links part (good): rows + small Edit ==')
  const links = render({ initialPhase: 'part', initialIndex: 5 })
  ok(links.includes('Website') && links.includes('https://tacoexample.com'), 'the website row renders with the real URL')
  ok(links.includes('href="https://tacoexample.com"') && links.includes('target="_blank"'), 'the website is tappable and opens a new tab')
  ok(links.includes('Phone') && links.includes('(555) 123-4567'), 'the phone row renders with the real number')
  ok(links.includes('Edit'), 'the small Edit affordance renders on the links part')
  ok(links.includes('>Finish<'), 'the last part says Finish')

  console.log('\n== k) honest save strings ==')
  const liveNote = applyResultNote(200, { ok: true, live: true })
  ok(liveNote.tone === 'ok' && liveNote.text === 'Saved to Google.', 'live:true reads Saved to Google.')
  const pendingNote = applyResultNote(200, { ok: true, live: false })
  ok(pendingNote.tone === 'pending' && pendingNote.text === 'Sent to Google. It can take a few minutes to show.', 'ok without proof reads sent-not-showing-yet')
  const rateNote = applyResultNote(429, { ok: false, error: 'server words' })
  ok(rateNote.tone === 'error' && rateNote.text === 'Google only allows a few edits per minute. Try again in a minute.', 'a 429 reads as the per-minute line')
  const rawNote = applyResultNote(502, { ok: false, error: 'Not connected to Google yet: invalid_grant token refresh' })
  ok(rawNote.tone === 'error' && !rawNote.text.includes('invalid_grant'), 'a 5xx never leaks the raw server string')
  const badNote = applyResultNote(400, { ok: false, error: 'The description is empty.' })
  ok(badNote.text === 'The description is empty.', 'a 400 shows the server plain-words reason')
  // Injected on screen (test seam): both honest lines render in the part UI.
  const savedShown = render({ initialPhase: 'part', initialIndex: 2, initialSaveNote: liveNote })
  ok(savedShown.includes('Saved to Google.'), 'the proven Saved line renders on the part screen')
  const pendingShown = render({ initialPhase: 'part', initialIndex: 2, initialSaveNote: pendingNote })
  ok(pendingShown.includes('Sent to Google. It can take a few minutes to show.'), 'the honest pending line renders on the part screen')

  console.log('\n== l) fallbacks + the unknown part ==')
  // A detail-less section (older cache, failed read) falls back to the summary string.
  const noDetailDiag = {
    ...FIXTURE,
    sections: FIXTURE.sections.map((s) => (s.key === 'hours' ? { key: s.key, label: s.label, status: s.status, current: s.current, why: s.why, aiFixable: s.aiFixable } : s)),
  }
  const fallback = render({ diag: noDetailDiag, initialPhase: 'part', initialIndex: 0 })
  ok(!fallback.includes('Monday'), 'no invented table when detail is missing')
  ok(fallback.includes('Hours set for 6 of 7 days.'), 'a detail-less part falls back to the summary string')
  ok(fallback.includes('>Next<'), 'Next still renders on the fallback')
  // A missing description (no detail, empty current) still reads Nothing yet + the add path.
  const missingDescDiag = {
    ...FIXTURE,
    sections: FIXTURE.sections.map((s) => (s.key === 'description' ? { ...s, status: 'missing', current: '', detail: undefined } : s)),
  }
  const missingDesc = render({ diag: missingDescDiag, initialPhase: 'part', initialIndex: 2 })
  ok(missingDesc.includes('Missing'), 'the Missing chip renders')
  ok(missingDesc.includes('Nothing yet'), 'an empty current value renders as Nothing yet')
  ok(missingDesc.includes('Add a description'), 'a missing description offers Add a description')
  const missingDescEdit = render({ diag: missingDescDiag, initialPhase: 'part', initialIndex: 2, initialEditing: true })
  ok(missingDescEdit.includes('<textarea') && missingDescEdit.includes('Draft it for me'), 'the editor opens empty with the draft path')
  // Unknown part unchanged.
  const unknownDiag = {
    ...FIXTURE,
    sections: FIXTURE.sections.map((s) => (s.key === 'photos' ? { ...s, status: 'unknown', current: 'We could not read your photos right now.', detail: undefined } : s)),
  }
  const unk = render({ diag: unknownDiag, initialPhase: 'part', initialIndex: 3 })
  ok(unk.includes('We could not read this part.'), 'the honest could-not-read line renders')
  ok(unk.includes('Could not check'), 'the chip says Could not check')
  ok(unk.includes('Skip for now'), 'Skip for now renders')
  ok(!unk.includes('Edit this on Google') && !unk.includes('Save to Google'), 'no edit/save actions on an unknown part')

  console.log('\n== m) the summary + What\'s next ==')
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
  ok(summary.includes('s next'), 'the What\'s-next block renders')
  ok(summary.includes('Your reviews'), 'the reviews card renders on the summary')
  ok(summary.includes('Read new reviews and reply with AI help.'), 'the reviews card sub renders')
  ok(summary.includes('/dashboard/inbox?tab=reviews'), 'the reviews card links to the real reviews surface')

  // The all-good read shows the celebration on the summary.
  const allGoodDiag = { ...FIXTURE, sections: FIXTURE.sections.map((s) => ({ ...s, status: 'good', current: s.current || 'Set' })) }
  const celebrate = render({ diag: allGoodDiag, initialPhase: 'summary', taskDone: true })
  ok(celebrate.includes('Every section looks good'), 'the all-good celebration renders')
  ok(celebrate.includes('This campaign task is complete'), 'the task-done line renders when the PATCH landed')
  ok(!celebrate.includes('Check my profile again'), 'no re-check button when everything reads good')

  console.log('\n== n) the helper hub ==')
  const hub = strip(renderToString(React.createElement(GbpHelperHub, { continueReview: false, onReview: noop })))
  rendered.push(hub)
  ok(hub.includes('Your Google helper'), 'the hub title renders')
  ok(hub.includes('Review your profile'), 'the review card renders')
  ok(hub.includes('6 parts. See what Google shows and fix it.'), 'the review card sub renders')
  ok(hub.includes('Your reviews'), 'the reviews card renders')
  ok(hub.includes('Read new reviews and reply with AI help.'), 'the reviews card sub renders')
  ok(hub.includes('/dashboard/inbox?tab=reviews'), 'the reviews card links to the real reviews surface')
  ok(hub.includes('Questions and answers'), 'the questions card renders')
  ok(hub.includes('See what people ask and answer them.'), 'the questions card sub renders')
  ok(hub.includes('Post an update'), 'the post card renders (fourth card)')
  ok(hub.includes('Share news on your Google listing.'), 'the post card sub renders')
  const hubResume = strip(renderToString(React.createElement(GbpHelperHub, { continueReview: true, onReview: noop })))
  rendered.push(hubResume)
  ok(hubResume.includes('Continue your review'), 'a mid-review save flips the card to Continue your review')

  console.log('\n== p) Questions and answers ==')
  const GbpQandaView = mod.GbpQandaView as unknown as React.ComponentType<Record<string, unknown>>
  const answerResultNote = mod.answerResultNote as (status: number, body: Record<string, unknown> | null) => { tone: string; text: string }
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()
  const Q_FIXTURE = [
    {
      id: 'q-answered', text: 'Do you have gluten free options?', author: 'Dana P',
      createTime: daysAgo(21), upvotes: 3, merchantAnswer: 'Yes, we mark them right on the menu.',
    },
    {
      id: 'q-open', text: 'Is there parking nearby?', author: 'A customer',
      createTime: daysAgo(3), upvotes: 0, merchantAnswer: null,
    },
  ]
  const renderQanda = (props: Record<string, unknown>) => {
    const html = strip(renderToString(React.createElement(GbpQandaView, { clientId: 'smoke-client', isPro: true, onBack: noop, ...props })))
    rendered.push(html)
    return html
  }

  // The list: both chips, the Asked line, the merchant answer under answered ones.
  const qList = renderQanda({ initialQuestions: Q_FIXTURE })
  ok(qList.includes('Questions and answers'), 'the Q&A title renders')
  ok(qList.includes('Do you have gluten free options?'), 'the answered question text renders')
  ok(qList.includes('Is there parking nearby?'), 'the open question text renders')
  ok(qList.includes('>Answered<'), 'the Answered chip renders')
  ok(qList.includes('>Needs an answer<'), 'the Needs-an-answer chip renders')
  ok(/Asked\s*21\s*days ago/.test(qList) && /Asked\s*3\s*days ago/.test(qList), 'the Asked lines render in plain words')
  ok(qList.includes('Your answer') && qList.includes('Yes, we mark them right on the menu.'), 'the merchant answer shows under the answered question')
  ok(qList.includes('Read from your live Google listing.'), 'the honest source line renders')

  // The empty state.
  const qEmpty = renderQanda({ initialQuestions: [] })
  ok(qEmpty.includes('No questions yet.'), 'the empty state title renders')
  ok(qEmpty.includes('When someone asks on Google, it shows here.'), 'the empty state sub renders')

  // The failed-read states.
  const qFail = renderQanda({ initialErrorCode: 'google_error' })
  ok(qFail.includes('We could not read your questions yet.'), 'the failed-read line renders')
  ok(qFail.includes('Try again'), 'Try again renders on the failed state')
  ok(!qFail.includes('This part of Google is not connected yet.'), 'the not-connected line stays off a plain failure')
  const qDisabled = renderQanda({ initialErrorCode: 'api_disabled' })
  ok(qDisabled.includes('We could not read your questions yet.'), 'the disabled state keeps the failed-read line')
  ok(qDisabled.includes('This part of Google is not connected yet.'), 'the api_disabled state adds the plain not-connected line')
  ok(qDisabled.includes('Try again'), 'Try again renders on the disabled state too')

  // The answer screen: prefilled textarea, Draft, Save, the replace note.
  const qAnswer = renderQanda({ initialQuestions: Q_FIXTURE, initialSelectedId: 'q-answered' })
  ok(qAnswer.includes('Answer this question'), 'the answer screen title renders')
  ok(qAnswer.includes('Do you have gluten free options?'), 'the question renders on the answer screen')
  ok(/by\s*Dana P/.test(qAnswer), 'who asked renders')
  ok(qAnswer.includes('<textarea'), 'the textarea renders')
  ok(qAnswer.includes('Yes, we mark them right on the menu.'), 'the textarea prefills with the current answer (editing re-saves)')
  ok(qAnswer.includes('You answered this one before. Saving replaces your old answer.'), 'the honest replace note renders on an answered question')
  ok(qAnswer.includes('Draft it for me'), 'Draft it for me renders')
  ok(qAnswer.includes('Save answer'), 'Save answer renders')
  ok(/of\s*1000 characters/.test(qAnswer), 'the character count renders against the 1000 rule')
  const qAnswerOpen = renderQanda({ initialQuestions: Q_FIXTURE, initialSelectedId: 'q-open' })
  ok(qAnswerOpen.includes('>Needs an answer<'), 'the open question keeps its chip on the answer screen')
  ok(!qAnswerOpen.includes('Saving replaces your old answer'), 'no replace note on a question with no answer yet')
  // Non-Pro: the plain hint, no AI draft button (server enforces regardless).
  const qAnswerFree = renderQanda({ initialQuestions: Q_FIXTURE, initialSelectedId: 'q-open', isPro: false })
  ok(qAnswerFree.includes('Answering from here is on the Pro plan.'), 'the Pro hint renders for non-Pro')
  ok(!qAnswerFree.includes('Draft it for me'), 'no AI draft button for non-Pro')

  // Honest save strings, same contract as the profile save rail.
  const aLive = answerResultNote(200, { ok: true, live: true })
  ok(aLive.tone === 'ok' && aLive.text === 'Answer saved.', 'live:true reads Answer saved.')
  const aPending = answerResultNote(200, { ok: true, live: false })
  ok(aPending.tone === 'pending' && aPending.text === 'Sent to Google. It can take a few minutes to show.', 'ok without proof reads sent-not-showing-yet')
  const aRate = answerResultNote(429, { ok: false, error: 'server words' })
  ok(aRate.tone === 'error' && aRate.text === 'Google only allows a few edits per minute. Try again in a minute.', 'a 429 reads as the per-minute line')
  const aRaw = answerResultNote(502, { ok: false, error: 'Not connected to Google yet: invalid_grant token refresh' })
  ok(aRaw.tone === 'error' && !aRaw.text.includes('invalid_grant'), 'a 5xx never leaks the raw server string')
  const aBad = answerResultNote(400, { ok: false, error: 'The answer is empty.' })
  ok(aBad.text === 'The answer is empty.', 'a 400 shows the server plain-words reason')
  const aPro = answerResultNote(403, { ok: false, error: 'Answering from here is on the Pro plan.' })
  ok(aPro.text === 'Answering from here is on the Pro plan.', 'a 403 shows the plain Pro line')
  // Injected on screen (test seam): the proven line renders on the answer screen.
  const qSaved = renderQanda({ initialQuestions: Q_FIXTURE, initialSelectedId: 'q-open', initialSaveNote: aLive })
  ok(qSaved.includes('Answer saved.'), 'the proven Answer saved line renders on the answer screen')
  const qPendingShown = renderQanda({ initialQuestions: Q_FIXTURE, initialSelectedId: 'q-open', initialSaveNote: aPending })
  ok(qPendingShown.includes('Sent to Google. It can take a few minutes to show.'), 'the honest pending line renders on the answer screen')

  console.log('\n== q) Post an update ==')
  const GbpPostView = mod.GbpPostView as unknown as React.ComponentType<Record<string, unknown>>
  const postResultNote = mod.postResultNote as (status: number, body: Record<string, unknown> | null) => { tone: string; text: string }
  const renderPost = (props: Record<string, unknown>) => {
    const html = strip(renderToString(React.createElement(GbpPostView, { clientId: 'smoke-client', isPro: true, onBack: noop, ...props })))
    rendered.push(html)
    return html
  }

  // The composer: textarea, live count, button picker, Draft, Publish.
  const postEmpty = renderPost({})
  ok(postEmpty.includes('Post an update'), 'the composer title renders')
  ok(postEmpty.includes('Share news on your Google listing.'), 'the composer sub renders')
  ok(postEmpty.includes('<textarea'), 'the textarea renders')
  ok(/0\s*of\s*1500 characters/.test(postEmpty), 'the live count renders against the 1500 rule')
  ok(postEmpty.includes('Add a button'), 'the button picker label renders')
  ok(postEmpty.includes('>None<') && postEmpty.includes('>Learn more<') && postEmpty.includes('>Call<'), 'the None / Learn more / Call choices render')
  ok(postEmpty.includes('Draft it for me'), 'Draft it for me renders for Pro')
  ok(postEmpty.includes('Publish to Google'), 'the Publish to Google button renders')
  ok(!postEmpty.includes('Button link'), 'no link field until Learn more is picked')
  ok(postEmpty.includes('Your update shows on Google as the business.'), 'the honest as-the-business line renders')

  // A prefilled composer counts its text.
  const POST_TEXT = 'Our new patio is open. Come try the smoked brisket plate this weekend and bring the whole family.'
  const postFilled = renderPost({ initialText: POST_TEXT })
  ok(postFilled.includes(POST_TEXT), 'the textarea prefills (test seam)')
  ok(new RegExp(`${POST_TEXT.length}\\s*of\\s*1500 characters`).test(postFilled), 'the count tracks the text length')

  // Learn more picked: the https link field + the keep-links-out note.
  const postLearn = renderPost({ initialCta: { choice: 'LEARN_MORE', url: 'https://tacoexample.com/specials' } })
  ok(postLearn.includes('Button link'), 'the Learn-more link field renders')
  ok(postLearn.includes('value="https://tacoexample.com/specials"'), 'the link field prefills (test seam)')
  ok(postLearn.includes('The button carries the link, so keep links out of the post text.'), 'the keep-links-out note renders')
  const postCall = renderPost({ initialCta: { choice: 'CALL' } })
  ok(postCall.includes('The Call button uses the phone number on your listing.'), 'the Call explainer renders')
  ok(!postCall.includes('Button link'), 'no link field on a Call button')

  // Non-Pro: the plain hint, no AI draft button (server enforces regardless).
  const postFree = renderPost({ isPro: false })
  ok(postFree.includes('Posting from here is on the Pro plan.'), 'the Pro hint renders for non-Pro')
  ok(!postFree.includes('Draft it for me'), 'no AI draft button for non-Pro')
  ok(postFree.includes('Publish to Google'), 'the Publish button still renders (disabled) for non-Pro')

  // Honest publish strings, same contract as the other rails.
  const pLive = postResultNote(200, { ok: true, live: true })
  ok(pLive.tone === 'ok' && pLive.text === 'Posted to Google.', 'live:true reads Posted to Google.')
  const pPending = postResultNote(200, { ok: true, live: false })
  ok(pPending.tone === 'pending' && pPending.text === 'Sent to Google. It can take a few minutes to show.', 'ok without proof reads sent-not-showing-yet')
  const pRate = postResultNote(429, { ok: false, error: 'server words' })
  ok(pRate.tone === 'error' && pRate.text === 'Google only allows a few edits per minute. Try again in a minute.', 'a 429 reads as the per-minute line')
  const pRaw = postResultNote(502, { ok: false, error: 'Not connected to Google yet: invalid_grant token refresh' })
  ok(pRaw.tone === 'error' && !pRaw.text.includes('invalid_grant'), 'a 5xx never leaks the raw server string')
  const pBad = postResultNote(400, { ok: false, error: 'The post is empty.' })
  ok(pBad.text === 'The post is empty.', 'a 400 shows the server plain-words reason')
  const pPro = postResultNote(403, { ok: false, error: 'Posting from here is on the Pro plan.' })
  ok(pPro.text === 'Posting from here is on the Pro plan.', 'a 403 shows the plain Pro line')

  // An error note renders inside the composer (test seam).
  const postErrShown = renderPost({ initialSaveNote: pRate })
  ok(postErrShown.includes('Google only allows a few edits per minute.'), 'the per-minute line renders in the composer')

  // The posted screen: proof line + See it (only with a URL) + Post again.
  const postedProof = renderPost({ initialPosted: { note: pLive, postUrl: 'https://local.google.com/place?id=1&use=posts&lpsid=789' } })
  ok(postedProof.includes('Posted to Google.'), 'the proven Posted line renders after a publish')
  ok(postedProof.includes('See it on Google'), 'the See-it link renders when Google sent the URL back')
  ok(postedProof.includes('https://local.google.com/place?id=1&amp;use=posts&amp;lpsid=789'), 'the See-it link points at the real post URL')
  ok(postedProof.includes('Post again'), 'the quiet Post again reset renders')
  ok(!postedProof.includes('<textarea'), 'the composer is cleared off the posted screen')
  const postedPending = renderPost({ initialPosted: { note: pPending, postUrl: null } })
  ok(postedPending.includes('Sent to Google. It can take a few minutes to show.'), 'the honest pending line renders when no proof came back')
  ok(!postedPending.includes('See it on Google'), 'no See-it link is invented without a URL from Google')
  ok(postedPending.includes('Post again'), 'Post again renders on the pending outcome too')

  console.log('\n== o) no em dashes ==')
  ok(rendered.every((h) => !h.includes('\u2014')), 'no em dash in any rendered screen')
  ok(rendered.every((h) => !h.includes('\u2013')), 'no en dash in any rendered screen either')

  console.log(fail ? `\n${fail} FAILURES` : '\nALL PASS')
  process.exit(fail ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(1) })
