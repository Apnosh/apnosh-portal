/* Apnosh AI Google-profile BUILDER render smoke (renderToString, same idiom as
 * smoke-render-plan-cart). The review is chaptered by the customer journey:
 *   "Be found" (categories, description, links), "Look worth the trip"
 *   (photos, menu), "Easy to visit" (hours, getting, seating, service).
 * Covered:
 *   a) the intro: 3 chapter names, all 9 parts, the honest weak count,
 *      per-part status chips, Start
 *   b) the 9 parts walk in CHAPTER order (engine order goes in, chapter
 *      order comes out) + the chapter eyebrow renders on part screens
 *   c) advice: the "Apnosh AI says" block renders on good AND weak parts,
 *      and hides when the engine sent none
 *   d) weak editable parts say "Fix it now"; good editable parts offer
 *      "Edit anyway"; categories/menu/photos keep the honest Google links
 *   e) the three in-app editors are unchanged (description textarea + draft,
 *      hours 7-day, links 2 fields)
 *   f) attribute parts (getting/seating/service): label rows with Yes / No /
 *      the amber "Not set"; the editor seam renders Yes/No toggles + Save
 *   g) honest save strings: applyResultNote maps live:true / live:false /
 *      429 / raw-5xx correctly, and injected notes render on the part screen
 *   h) fallbacks + the unknown part unchanged
 *   i) the summary: chapter-grouped outcomes, the honest score line, the
 *      recheck + delay lines, and all three Keep-it-strong cards
 *   j) the hub is GONE from the flow (no "Your Google helper" cards screen)
 *   k) Questions and answers + Post an update still render (reached from the
 *      summary's Keep-it-strong cards)
 *   l) the STANDALONE viewer (ProfileViewer, the More door), non-Pro: all 9
 *      sections on one page in chapter order under the 3 group headers,
 *      honest status chips, the rich On-Google-now content, a per-section
 *      Edit-on-Google link, ONE quiet Pro line — and NONE of the builder:
 *      no Fix it now, no Apnosh AI says, no Save to Google, no
 *      Keep-it-strong cards, no in-app Edit
 *   l2) the tier-aware viewer, Pro: the 6 save-rail sections get a small
 *      in-app Edit affordance that opens the SAME editors the builder uses
 *      (description textarea WITHOUT "Draft it for me", hours 7-day rows,
 *      links 2 fields, attrs Yes/No toggles) with Save to Google + Cancel;
 *      categories/menu/photos keep their Edit-on-Google links; still no
 *      advice, no Why-it-matters, no Keep-it-strong; no Pro line
 *   m) the last part says Finish; no em dashes anywhere
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

// The fixture mirrors the GET /api/dashboard/gbp-diagnosis wire shape, in
// ENGINE order (hours first) to prove the builder reorders into chapters.
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

const ADVICE = {
  hours: 'Hours are set for 6 of 7 days. One idea: add special hours before the next holiday so nobody shows up to a closed door.',
  categories: 'You have 3 categories set. If you serve a cuisine that is not listed, add it. Categories decide which searches show you.',
  description: 'Your description is 111 characters, and Google gives you room for 750. Use more of it: what you serve, what makes it special, and the feel of the place.',
  photos: 'You have 9 photos, but the newest is about 8 months old. Fresh photos get more taps. Add one dish, one drink, one of the space.',
  menu: 'Your menu on Google shows 15 items and your menu link is set. One idea: when a price changes, update it here the same day.',
  links: 'Website and phone are both set. One idea: tap the website link once a month to make sure it still works.',
  getting: 'Parking lot is blank. Blank reads as a mystery. Yes or No both help.',
  seating: 'All 3 answers are set. One idea: add a photo of your seating so people can picture the space.',
  service: 'All 2 answers are set. One idea: post an update when you add a new way to order or pay.',
}

const FIXTURE = {
  connected: true,
  readFailed: false,
  score: 68,
  sections: [
    {
      key: 'hours', label: 'Your hours', status: 'good',
      current: 'Hours set for 6 of 7 days. You also set special hours for 2 dates.',
      why: 'People check your hours before they come.', aiFixable: false,
      advice: ADVICE.hours,
      detail: HOURS_DETAIL,
    },
    {
      key: 'categories', label: 'Your categories', status: 'good',
      current: 'Main category is Grocery store, plus 2 more.',
      why: 'The right categories help Google show you in more searches.', aiFixable: true,
      advice: ADVICE.categories,
      detail: {
        kind: 'categories', primary: 'Grocery store', additional: ['Cafe', 'Deli'],
        primaryName: 'categories/gcid:grocery_store',
        additionalNames: ['categories/gcid:cafe', 'categories/gcid:deli'],
      },
    },
    {
      key: 'description', label: 'Your description', status: 'needs-work',
      current: 'Your description is 111 characters. Google gives you room for 750.',
      why: 'A short description tells people what makes you special.', aiFixable: true,
      advice: ADVICE.description,
      detail: { kind: 'description', text: DESCRIPTION_TEXT },
    },
    {
      key: 'photos', label: 'Your photos', status: 'needs-work',
      current: '9 photos. Newest is about 8 months old.',
      why: 'Photos help people pick you.', aiFixable: false,
      advice: ADVICE.photos,
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
      advice: ADVICE.menu,
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
      advice: ADVICE.links,
      detail: { kind: 'links', website: 'https://tacoexample.com', phone: '(555) 123-4567' },
    },
    {
      key: 'getting', label: 'Getting here', status: 'needs-work',
      current: '2 of 3 set.',
      why: 'People check parking and access before they head over.', aiFixable: false,
      advice: ADVICE.getting,
      detail: {
        kind: 'attrs',
        items: [
          { id: 'has_wheelchair_accessible_entrance', label: 'Wheelchair accessible entrance', value: true },
          { id: 'has_parking_lot', label: 'Parking lot', value: null },
          { id: 'has_drive_through', label: 'Drive through', value: false },
        ],
      },
    },
    {
      key: 'seating', label: 'Seating and space', status: 'good',
      current: '3 of 3 set.',
      why: 'People want to know if they can sit outside, bring a laptop, or find a restroom.', aiFixable: false,
      advice: ADVICE.seating,
      detail: {
        kind: 'attrs',
        items: [
          { id: 'has_outdoor_seating', label: 'Outdoor seating', value: true },
          { id: 'has_wifi_free', label: 'Free Wi-Fi', value: true },
          { id: 'has_restroom', label: 'Restroom', value: true },
        ],
      },
    },
    {
      key: 'service', label: 'Service and payments', status: 'good',
      current: '2 of 2 set.',
      why: 'People check how they can order and pay before they come.', aiFixable: false,
      advice: ADVICE.service,
      detail: {
        kind: 'attrs',
        items: [
          { id: 'has_takeout', label: 'Takeout', value: true },
          { id: 'pay_credit_card', label: 'Credit cards', value: true },
        ],
      },
    },
  ],
  notes: [],
  checkedAt: '2026-07-11T00:00:00.000Z',
}

/** The chapter order the builder must walk (engine order above differs). */
const CHAPTER_WALK: Array<{ label: string; chapter: string }> = [
  { label: 'Your categories', chapter: 'Be found' },
  { label: 'Your description', chapter: 'Be found' },
  { label: 'Website and phone', chapter: 'Be found' },
  { label: 'Your photos', chapter: 'Look worth the trip' },
  { label: 'Your menu', chapter: 'Look worth the trip' },
  { label: 'Your hours', chapter: 'Easy to visit' },
  { label: 'Getting here', chapter: 'Easy to visit' },
  { label: 'Seating and space', chapter: 'Easy to visit' },
  { label: 'Service and payments', chapter: 'Easy to visit' },
]

async function main() {
  const mod = await import('../src/components/mvp/gbp-fixer')
  const AiReview = mod.AiReview as unknown as React.ComponentType<Record<string, unknown>>
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

  console.log('\n== a) the intro: chapters + parts + honest weak count ==')
  const intro = render({})
  ok(intro.includes('build your best profile'), 'the intro title renders')
  ok(intro.includes('checked 9 parts'), 'the 9-part count renders')
  ok(intro.includes('3 could be better.'), 'the honest weak count (3) renders')
  ok(intro.includes('You get a recommendation on every part'), 'the recommendation promise renders')
  for (const ch of ['Be found', 'Look worth the trip', 'Easy to visit']) {
    ok(intro.includes(ch), `the "${ch}" chapter renders on the intro`)
  }
  for (const p of CHAPTER_WALK) {
    ok(intro.includes(p.label), `the ${p.label} part is listed on the intro`)
  }
  ok(intro.includes('Looks good'), 'good parts chip Looks good on the intro')
  ok(intro.includes('Could be better'), 'weak parts chip Could be better on the intro')
  ok(intro.includes('>Start<'), 'the Start button renders')

  console.log('\n== b) parts walk in CHAPTER order + the chapter eyebrow ==')
  for (let i = 0; i < CHAPTER_WALK.length; i++) {
    const html = render({ initialPhase: 'part', initialIndex: i })
    const expected = CHAPTER_WALK[i]
    ok(html.includes(expected.label), `part ${i + 1} is ${expected.label}`)
    ok(html.includes(expected.chapter), `part ${i + 1} carries the "${expected.chapter}" eyebrow`)
    ok(new RegExp(`Part\\s*${i + 1}\\s*of\\s*9`).test(html), `part ${i + 1} shows Part ${i + 1} of 9`)
  }

  console.log('\n== c) advice: Apnosh AI says on good AND weak parts ==')
  const goodPart = render({ initialPhase: 'part', initialIndex: 5 }) // hours (good)
  ok(goodPart.includes('Apnosh AI says'), 'the advice label renders on a GOOD part')
  ok(goodPart.includes(ADVICE.hours), 'the good-part advice text renders')
  const weakPart = render({ initialPhase: 'part', initialIndex: 1 }) // description (needs-work)
  ok(weakPart.includes('Apnosh AI says'), 'the advice label renders on a WEAK part')
  ok(weakPart.includes(ADVICE.description), 'the weak-part advice text renders')
  // No advice from the engine (older cache): the block hides, nothing invented.
  const noAdviceDiag = {
    ...FIXTURE,
    sections: FIXTURE.sections.map((s) => (s.key === 'hours' ? { ...s, advice: undefined } : s)),
  }
  const noAdvice = render({ diag: noAdviceDiag, initialPhase: 'part', initialIndex: 5 })
  ok(!noAdvice.includes('Apnosh AI says'), 'no advice block when the engine sent none')

  console.log('\n== d) Fix it now on weak parts, Edit anyway on good parts ==')
  ok(weakPart.includes('Fix it now'), 'a weak editable part says Fix it now')
  ok(!weakPart.includes('Edit anyway'), 'a weak part does not also offer Edit anyway')
  ok(goodPart.includes('Edit anyway'), 'a good editable part offers Edit anyway')
  ok(!goodPart.includes('Fix it now'), 'a good part does not shout Fix it now')
  const goodAttrs = render({ initialPhase: 'part', initialIndex: 7 }) // seating (good, attrs)
  ok(goodAttrs.includes('Edit anyway'), 'a good attribute part offers Edit anyway')
  const weakAttrs = render({ initialPhase: 'part', initialIndex: 6 }) // getting (needs-work, attrs)
  ok(weakAttrs.includes('Fix it now'), 'a weak attribute part says Fix it now')
  // Categories now edit IN APP (good part → Edit anyway), no Google link.
  const cats = render({ initialPhase: 'part', initialIndex: 0 })
  ok(cats.includes('Edit anyway'), 'a good categories part offers Edit anyway in app')
  ok(!cats.includes('Edit on Google') && !cats.includes('https://business.google.com/info'), 'categories no longer link out to Google')
  // Photos now edit IN APP (weak part → Fix it now), no Google link.
  const photos = render({ initialPhase: 'part', initialIndex: 3 })
  ok(photos.includes('Fix it now'), 'a weak photos part says Fix it now in app')
  ok(!photos.includes('Edit this on Google') && !photos.includes('https://business.google.com/photos'), 'photos no longer link out to Google')
  ok(photos.includes('<img') && photos.includes('https://photos.example.com/one.jpg'), 'the photo grid still renders')
  // Menu stays Edit-on-Google for now (no in-app editor yet).
  const menu = render({ initialPhase: 'part', initialIndex: 4 })
  ok(menu.includes('Edit on Google') && menu.includes('https://business.google.com/menu'), 'menu keeps the Edit-on-Google link')
  ok(menu.includes('Carnitas taco') && menu.includes('$4.50'), 'menu items still render')

  console.log('\n== e) the three in-app editors are unchanged ==')
  const descEdit = render({ initialPhase: 'part', initialIndex: 1, initialEditing: true })
  ok(descEdit.includes('<textarea'), 'the description textarea renders')
  ok(descEdit.includes(DESCRIPTION_TEXT), 'the textarea is prefilled with the current text')
  ok(new RegExp(`${DESCRIPTION_TEXT.length}\\s*of\\s*750 characters`).test(descEdit), 'the live character count renders')
  ok(descEdit.includes('Aim for 250 to 750'), 'the 250-750 rule renders')
  ok(descEdit.includes('Draft it for me'), 'Draft it for me lives inside the editor')
  ok(descEdit.includes('Save to Google') && descEdit.includes('Cancel'), 'Save to Google + Cancel render')
  const hoursEdit = render({ initialPhase: 'part', initialIndex: 5, initialEditing: true })
  for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']) {
    ok(hoursEdit.includes(day), `the ${day} editor row renders`)
  }
  const timeInputs = (hoursEdit.match(/type="time"/g) ?? []).length
  ok(timeInputs === 12, `open/close time inputs render for the 6 open days (got ${timeInputs})`)
  ok(hoursEdit.includes('value="08:00"') && hoursEdit.includes('value="21:00"'), 'times prefill from what Google shows')
  ok(hoursEdit.includes('This day has more than one time range on Google. Saving replaces it with one range.'), 'the honest multi-range replace note renders')
  const linksEdit = render({ initialPhase: 'part', initialIndex: 2, initialEditing: true })
  ok(linksEdit.includes('Website') && linksEdit.includes('Phone'), 'the Website and Phone labels render')
  ok(linksEdit.includes('value="https://tacoexample.com"'), 'the website input prefills')
  ok(linksEdit.includes('value="(555) 123-4567"'), 'the phone input prefills')
  ok(linksEdit.includes('Save to Google'), 'the links Save to Google button renders')

  console.log('\n== f) attribute parts: rows + the Yes/No editor ==')
  ok(weakAttrs.includes('Wheelchair accessible entrance'), 'an attribute label row renders')
  ok(weakAttrs.includes('Parking lot') && weakAttrs.includes('Not set'), 'a never-answered option reads Not set')
  ok(weakAttrs.includes('Drive through'), 'a No option row renders')
  ok(weakAttrs.includes('>Yes<') && weakAttrs.includes('>No<'), 'answered rows read Yes and No')
  ok(goodAttrs.includes('Outdoor seating') && goodAttrs.includes('Free Wi-Fi') && goodAttrs.includes('Restroom'), 'all seating rows render')
  ok(!goodAttrs.includes('Not set'), 'a fully answered group shows no Not set')
  const attrsEdit = render({ initialPhase: 'part', initialIndex: 6, initialEditing: true })
  ok(attrsEdit.includes('Wheelchair accessible entrance') && attrsEdit.includes('Parking lot') && attrsEdit.includes('Drive through'), 'the editor keeps every row')
  const yesButtons = (attrsEdit.match(/>Yes<\/button>/g) ?? []).length
  const noButtons = (attrsEdit.match(/>No<\/button>/g) ?? []).length
  ok(yesButtons === 3 && noButtons === 3, `every row gets a Yes/No toggle pair (got ${yesButtons}/${noButtons})`)
  ok(attrsEdit.includes('aria-pressed="true"'), 'answered rows start with their current value selected')
  ok(attrsEdit.includes('Save to Google') && attrsEdit.includes('Cancel'), 'Save to Google + Cancel render in the attrs editor')
  ok(attrsEdit.includes('Only what you set is sent.'), 'the honest only-what-you-set line renders')

  console.log('\n== f2) the categories + photos in-app editors ==')
  const catsEdit = render({ initialPhase: 'part', initialIndex: 0, initialEditing: true })
  ok(catsEdit.includes('Main: Grocery store'), 'the categories editor shows the current main labeled Main')
  ok(catsEdit.includes('Cafe') && catsEdit.includes('Deli'), 'the current extra categories render as chips')
  ok(catsEdit.includes('Add a category'), 'the category search box label renders')
  ok(/id="gbp-cat-search"/.test(catsEdit), 'the category search input renders')
  ok(catsEdit.includes('Make main'), 'a Make main action renders on an extra chip')
  ok(catsEdit.includes('Save to Google') && catsEdit.includes('Cancel'), 'the categories Save to Google + Cancel render')
  const photosEdit = render({ initialPhase: 'part', initialIndex: 3, initialEditing: true })
  ok(photosEdit.includes('type="file"') && photosEdit.includes('accept="image/*"'), 'the photo file input renders and accepts images')
  ok(photosEdit.includes('Add to Google'), 'the Add to Google button renders')
  ok(photosEdit.includes('Cancel'), 'the photos Cancel renders')

  console.log('\n== g) honest save strings ==')
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
  // Photos: a returned media resource reads as Added to Google (a create is its
  // own proof); a non-image reject shows the server words; a 5xx stays generic.
  const photoResultNote = mod.photoResultNote as (status: number, body: Record<string, unknown> | null) => { tone: string; text: string }
  const photoLive = photoResultNote(200, { ok: true, live: true })
  ok(photoLive.tone === 'ok' && photoLive.text === 'Added to Google.', 'a created photo reads Added to Google.')
  const photoBad = photoResultNote(400, { ok: false, error: 'That is not a photo we can add. Upload a JPG or PNG and try again.' })
  ok(photoBad.text === 'That is not a photo we can add. Upload a JPG or PNG and try again.', 'a 400 shows the server photo reason')
  const photoFail = photoResultNote(502, { ok: false, error: 'invalid_grant token refresh boom' })
  ok(photoFail.tone === 'error' && !photoFail.text.includes('invalid_grant'), 'a 5xx never leaks the raw server string for photos')
  // Injected on screen (test seam): both honest lines render in the part UI,
  // including on an attribute part.
  const savedShown = render({ initialPhase: 'part', initialIndex: 6, initialSaveNote: liveNote })
  ok(savedShown.includes('Saved to Google.'), 'the proven Saved line renders on an attribute part')
  const pendingShown = render({ initialPhase: 'part', initialIndex: 1, initialSaveNote: pendingNote })
  ok(pendingShown.includes('Sent to Google. It can take a few minutes to show.'), 'the honest pending line renders on the part screen')

  console.log('\n== h) fallbacks + the unknown part ==')
  // A detail-less section (older cache, failed read) falls back to the summary string.
  const noDetailDiag = {
    ...FIXTURE,
    sections: FIXTURE.sections.map((s) => (s.key === 'hours' ? { key: s.key, label: s.label, status: s.status, current: s.current, why: s.why, aiFixable: s.aiFixable, advice: s.advice } : s)),
  }
  const fallback = render({ diag: noDetailDiag, initialPhase: 'part', initialIndex: 5 })
  ok(!fallback.includes('Monday'), 'no invented table when detail is missing')
  ok(fallback.includes('Hours set for 6 of 7 days.'), 'a detail-less part falls back to the summary string')
  // A detail-less ATTRIBUTE part gets no editor (nothing honest to prefill).
  const noAttrsDetailDiag = {
    ...FIXTURE,
    sections: FIXTURE.sections.map((s) => (s.key === 'getting' ? { ...s, detail: undefined } : s)),
  }
  const attrsFallback = render({ diag: noAttrsDetailDiag, initialPhase: 'part', initialIndex: 6 })
  ok(attrsFallback.includes('2 of 3 set.'), 'a detail-less attribute part falls back to the summary string')
  ok(!attrsFallback.includes('Fix it now') && !attrsFallback.includes('Save to Google'), 'no editor is offered without the real rows')
  // A missing description (no detail, empty current) still reads Nothing yet + the fix path.
  const missingDescDiag = {
    ...FIXTURE,
    sections: FIXTURE.sections.map((s) => (s.key === 'description' ? { ...s, status: 'missing', current: '', detail: undefined } : s)),
  }
  const missingDesc = render({ diag: missingDescDiag, initialPhase: 'part', initialIndex: 1 })
  ok(missingDesc.includes('Missing'), 'the Missing chip renders')
  ok(missingDesc.includes('Nothing yet'), 'an empty current value renders as Nothing yet')
  ok(missingDesc.includes('Fix it now'), 'a missing description offers Fix it now')
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

  console.log('\n== i) the summary: chapters + score + Keep it strong ==')
  const summary = render({
    initialPhase: 'summary',
    initialOutcomes: { hours: 'good', categories: 'good', description: 'skipped', photos: 'updated', menu: 'good', links: 'good', getting: 'updated', seating: 'good', service: 'good' },
  })
  ok(summary.includes('You went through every part'), 'the summary title renders (not all good)')
  for (const ch of ['Be found', 'Look worth the trip', 'Easy to visit']) {
    ok(summary.includes(ch), `outcomes group under the "${ch}" chapter`)
  }
  for (const p of CHAPTER_WALK) {
    ok(summary.includes(p.label), `the ${p.label} part is listed`)
  }
  ok(summary.includes('Profile score: 68 of 100'), 'the honest score line renders')
  ok(!summary.includes('was 68') && !summary.includes('before'), 'no before/after score is invented')
  ok(summary.includes('Looks good'), 'a good part reads Looks good')
  ok(summary.includes('You updated it'), 'an updated part reads You updated it')
  ok(summary.includes('Skipped'), 'a skipped part reads Skipped')
  ok(summary.includes('Check my profile again'), 'the re-check button renders')
  ok(summary.includes('can take a few minutes to show up'), 'the honest delay note renders')
  ok(summary.includes('Keep it strong'), 'the Keep-it-strong block renders')
  ok(summary.includes('Your reviews') && summary.includes('/dashboard/inbox?tab=reviews'), 'the reviews card links to the real reviews surface')
  ok(summary.includes('Post an update') && summary.includes('Share news on your Google listing.'), 'the Post-an-update card renders')
  ok(summary.includes('Questions and answers') && summary.includes('Answer what people ask, with AI help.'), 'the Q and A card renders')
  // A null score shows no score line (never a made-up 0).
  const noScore = render({ diag: { ...FIXTURE, score: null }, initialPhase: 'summary' })
  ok(!noScore.includes('Profile score:'), 'no score line when the diagnosis could not score honestly')
  // The all-good read shows the celebration on the summary.
  const allGoodDiag = { ...FIXTURE, sections: FIXTURE.sections.map((s) => ({ ...s, status: 'good', current: s.current || 'Set' })) }
  const celebrate = render({ diag: allGoodDiag, initialPhase: 'summary', taskDone: true })
  ok(celebrate.includes('Every section looks good'), 'the all-good celebration renders')
  ok(celebrate.includes('This campaign task is complete'), 'the task-done line renders when the PATCH landed')
  ok(!celebrate.includes('Check my profile again'), 'no re-check button when everything reads good')

  console.log('\n== j) the hub is gone ==')
  ok(!('GbpHelperHub' in mod), 'the GbpHelperHub component no longer exists')
  ok(rendered.every((h) => !h.includes('Your Google helper')), 'no rendered screen shows the old hub')
  ok(rendered.every((h) => !h.includes('Keep your Google listing sharp and answer your reviews.')), 'the old hub sub never renders')
  const lastPart = render({ initialPhase: 'part', initialIndex: 8 })
  ok(lastPart.includes('>Finish<'), 'the last part (9 of 9) says Finish')

  console.log('\n== k) Questions and answers + Post an update still render ==')
  const GbpQandaView = mod.GbpQandaView as unknown as React.ComponentType<Record<string, unknown>>
  const renderQanda = (props: Record<string, unknown>) => {
    const html = strip(renderToString(React.createElement(GbpQandaView, { clientId: 'smoke-client', isPro: true, onBack: noop, ...props })))
    rendered.push(html)
    return html
  }
  const qDoor = renderQanda({})
  ok(qDoor.includes('Questions and answers'), 'the Q&A title renders')
  ok(qDoor.includes('Google does not let apps read or answer listing questions anymore, so this happens on Google itself.'), 'the honest explainer renders in plain words')
  ok(qDoor.includes('Answer on Google') && qDoor.includes('href="https://business.google.com/"'), 'the Answer-on-Google hand-off renders')
  ok(qDoor.includes('<textarea') && qDoor.includes('Draft my answer'), 'the paste-a-question drafter renders')
  const DRAFT_TEXT = 'Yes, we mark every gluten free dish right on the menu. Ask for the list when you come in.'
  const qDrafted = renderQanda({ initialQuestionText: 'Do you have gluten free options?', initialDraft: DRAFT_TEXT })
  ok(qDrafted.includes(DRAFT_TEXT) && qDrafted.includes('Copy this and post it on Google.'), 'the copyable draft block renders')
  const qFree = renderQanda({ isPro: false })
  ok(qFree.includes('Apnosh AI drafting is on the Pro plan.'), 'the Pro hint renders for non-Pro')

  const GbpPostView = mod.GbpPostView as unknown as React.ComponentType<Record<string, unknown>>
  const postResultNote = mod.postResultNote as (status: number, body: Record<string, unknown> | null) => { tone: string; text: string }
  const renderPost = (props: Record<string, unknown>) => {
    const html = strip(renderToString(React.createElement(GbpPostView, { clientId: 'smoke-client', isPro: true, onBack: noop, ...props })))
    rendered.push(html)
    return html
  }
  const postEmpty = renderPost({})
  ok(postEmpty.includes('Post an update') && postEmpty.includes('<textarea'), 'the composer renders')
  ok(/0\s*of\s*1500 characters/.test(postEmpty), 'the live count renders against the 1500 rule')
  ok(postEmpty.includes('>None<') && postEmpty.includes('>Learn more<') && postEmpty.includes('>Call<'), 'the None / Learn more / Call choices render')
  ok(postEmpty.includes('Publish to Google'), 'the Publish to Google button renders')
  const pLive = postResultNote(200, { ok: true, live: true })
  ok(pLive.tone === 'ok' && pLive.text === 'Posted to Google.', 'live:true reads Posted to Google.')
  const pPending = postResultNote(200, { ok: true, live: false })
  ok(pPending.tone === 'pending' && pPending.text === 'Sent to Google. It can take a few minutes to show.', 'ok without proof reads sent-not-showing-yet')
  const postedProof = renderPost({ initialPosted: { note: pLive, postUrl: 'https://local.google.com/place?id=1&use=posts&lpsid=789' } })
  ok(postedProof.includes('Posted to Google.') && postedProof.includes('See it on Google'), 'the posted proof screen renders')
  const postedPending = renderPost({ initialPosted: { note: pPending, postUrl: null } })
  ok(!postedPending.includes('See it on Google'), 'no See-it link is invented without a URL from Google')

  console.log('\n== l) the standalone viewer, non-Pro: read-only, chaptered, links out ==')
  const ProfileViewer = mod.ProfileViewer as unknown as React.ComponentType<Record<string, unknown>>
  const renderViewer = (diag: Record<string, unknown>, extra?: Record<string, unknown>) => {
    const html = strip(renderToString(React.createElement(ProfileViewer, { diag, clientId: 'smoke-client', ...extra })))
    rendered.push(html)
    return html
  }
  const viewer = renderViewer(FIXTURE, { isPro: false })
  // One page: all 3 group headers and all 9 sections render together.
  for (const ch of ['Be found', 'Look worth the trip', 'Easy to visit']) {
    ok(viewer.includes(ch), `the "${ch}" group header renders on the viewer`)
  }
  for (const p of CHAPTER_WALK) {
    ok(viewer.includes(p.label), `the ${p.label} section renders on the viewer`)
  }
  // Sections come out in CHAPTER order (engine order goes in).
  const positions = CHAPTER_WALK.map((p) => viewer.indexOf(p.label))
  ok(positions.every((pos, i) => pos >= 0 && (i === 0 || pos > positions[i - 1])), 'the 9 sections render in chapter order')
  // Each group header sits before its first section.
  ok(viewer.indexOf('Be found') < viewer.indexOf('Your categories'), 'Be found heads its sections')
  ok(viewer.indexOf('Look worth the trip') < viewer.indexOf('Your photos'), 'Look worth the trip heads its sections')
  ok(viewer.indexOf('Easy to visit') < viewer.indexOf('Your hours'), 'Easy to visit heads its sections')
  // Honest status chips (the softer viewer words).
  ok(viewer.includes('Looks good'), 'good sections chip Looks good')
  ok(viewer.includes('Could be better'), 'weak sections chip Could be better')
  // The rich On-Google-now content renders per kind.
  ok(viewer.includes('On Google now'), 'the On-Google-now label renders')
  ok(viewer.includes('Monday') && viewer.includes('8:00 AM to 9:00 PM') && viewer.includes('Closed'), 'the hours table renders')
  ok(viewer.includes('special hours for 2 dates'), 'the special-hours line renders')
  ok(viewer.includes('Main: Grocery store') && viewer.includes('Cafe') && viewer.includes('Deli'), 'the category chips render')
  ok(viewer.includes(DESCRIPTION_TEXT), 'the description text renders')
  ok(viewer.includes('<img') && viewer.includes('https://photos.example.com/one.jpg'), 'the photo grid renders')
  ok(viewer.includes('Carnitas taco') && viewer.includes('$4.50') && viewer.includes('and 10 more'), 'the menu rows render')
  ok(viewer.includes('https://tacoexample.com/menu'), 'the menu link renders')
  ok(viewer.includes('Website') && viewer.includes('https://tacoexample.com') && viewer.includes('(555) 123-4567'), 'the links rows render')
  ok(viewer.includes('Parking lot') && viewer.includes('Not set'), 'a never-answered attribute reads Not set')
  ok(viewer.includes('Outdoor seating') && viewer.includes('>Yes<'), 'answered attribute rows read Yes')
  // Every section links out to Google: the per-kind pages where they exist,
  // the generic business.google.com home for the rest.
  const editLinks = (viewer.match(/Edit on Google/g) ?? []).length
  ok(editLinks === 9, `every section gets an Edit-on-Google link (got ${editLinks})`)
  ok(viewer.includes('https://business.google.com/info'), 'categories link to their own Google editor page')
  ok(viewer.includes('https://business.google.com/menu'), 'menu links to its own Google editor page')
  ok(viewer.includes('https://business.google.com/photos'), 'photos link to their own Google editor page')
  const genericLinks = (viewer.match(/href="https:\/\/business\.google\.com"/g) ?? []).length
  ok(genericLinks === 6, `the other 6 sections use the generic business.google.com link (got ${genericLinks})`)
  ok(viewer.includes('Read from your live Google listing.'), 'the honest read-from-Google footer renders')
  // NONE of the builder leaks into the viewer: no editors, no advice, no
  // saves, no Keep-it-strong cards, no stepper.
  ok(!viewer.includes('Fix it now'), 'no Fix it now in the viewer')
  ok(!viewer.includes('Apnosh AI says'), 'no Apnosh AI says advice in the viewer')
  ok(!viewer.includes(ADVICE.description) && !viewer.includes(ADVICE.hours), 'no advice text leaks into the viewer')
  ok(!viewer.includes('Save to Google'), 'no Save to Google in the viewer')
  ok(!viewer.includes('Keep it strong'), 'no Keep-it-strong cards in the viewer')
  ok(!viewer.includes('Edit anyway'), 'no Edit-anyway editor door in the viewer')
  ok(!viewer.includes('<textarea'), 'no in-app editor fields in the viewer')
  ok(!viewer.includes('Why it matters'), 'no builder Why-it-matters block in the viewer')
  ok(!viewer.includes('>Start<') && !viewer.includes('>Next<') && !viewer.includes('>Finish<'), 'no stepper buttons in the viewer')
  ok(!viewer.includes('Part 1 of 9'), 'no part-by-part progress in the viewer')
  // Non-Pro tier: ONE quiet Pro line, and never an in-app Edit affordance.
  ok(viewer.includes('Editing from the app is on the Pro plan.'), 'the quiet Pro line renders for non-Pro')
  ok(!/ Edit<\/button>/.test(viewer), 'no in-app Edit affordance for non-Pro')
  // Even the test seam cannot open an editor without Pro.
  const freeSeam = renderViewer(FIXTURE, { isPro: false, initialEditKey: 'description' })
  ok(!freeSeam.includes('<textarea') && !freeSeam.includes('Save to Google'), 'the non-Pro viewer can never open an editor')
  // An unknown section shows the engine's safe reason, chips Could not check,
  // and still links out.
  const unkViewer = renderViewer({
    ...FIXTURE,
    sections: FIXTURE.sections.map((s) => (s.key === 'photos' ? { ...s, status: 'unknown', current: 'We could not read your photos right now.', detail: undefined } : s)),
  })
  ok(unkViewer.includes('Could not check'), 'an unknown section chips Could not check')
  ok(unkViewer.includes('We could not read your photos right now.'), 'the safe could-not-read reason renders')
  // A detail-less section falls back to the honest summary string.
  const noDetailViewer = renderViewer({
    ...FIXTURE,
    sections: FIXTURE.sections.map((s) => (s.key === 'hours' ? { ...s, detail: undefined } : s)),
  })
  ok(!noDetailViewer.includes('Monday'), 'no invented hours table when detail is missing')
  ok(noDetailViewer.includes('Hours set for 6 of 7 days.'), 'a detail-less section falls back to the summary string')

  console.log('\n== l2) the tier-aware viewer: Pro edits in app ==')
  const proViewer = renderViewer(FIXTURE, { isPro: true })
  // The 8 save-rail sections (description, hours, links, 3 attr groups,
  // categories, photos) get the small in-app Edit affordance.
  const editBtns = (proViewer.match(/ Edit<\/button>/g) ?? []).length
  ok(editBtns === 8, `the 8 editable sections get an in-app Edit affordance (got ${editBtns})`)
  ok(!proViewer.includes('Editing from the app is on the Pro plan.'), 'no Pro line for Pro owners')
  // Only menu keeps the Edit-on-Google link now (no in-app menu editor yet).
  const proGoogleLinks = (proViewer.match(/Edit on Google/g) ?? []).length
  ok(proGoogleLinks === 1, `only menu keeps the Edit-on-Google link (got ${proGoogleLinks})`)
  ok(proViewer.includes('https://business.google.com/menu'), 'the menu Google editor page still links out')
  ok(!proViewer.includes('https://business.google.com/info') && !proViewer.includes('https://business.google.com/photos'), 'categories/photos no longer link out for Pro')
  // Closed cards hold no editor seams.
  ok(!proViewer.includes('<textarea') && !proViewer.includes('Save to Google'), 'no editor is open before Edit is tapped')

  // The description editor: same textarea + count + save, NO AI drafting.
  const proDesc = renderViewer(FIXTURE, { isPro: true, initialEditKey: 'description' })
  ok(proDesc.includes('<textarea'), 'the description textarea renders in the viewer')
  ok(proDesc.includes(DESCRIPTION_TEXT), 'the viewer textarea prefills with the current text')
  ok(new RegExp(`${DESCRIPTION_TEXT.length}\\s*of\\s*750 characters`).test(proDesc), 'the live character count renders in the viewer')
  ok(proDesc.includes('Aim for 250 to 750'), 'the 250-750 rule renders in the viewer')
  ok(!proDesc.includes('Draft it for me'), 'NO Draft-it-for-me in the viewer description editor')
  ok(proDesc.includes('Save to Google') && proDesc.includes('Cancel'), 'Save to Google + Cancel render in the viewer')

  // The hours editor: the same 7-day rows, prefilled from Google.
  const proHours = renderViewer(FIXTURE, { isPro: true, initialEditKey: 'hours' })
  const proTimeInputs = (proHours.match(/type="time"/g) ?? []).length
  ok(proTimeInputs === 12, `open/close time inputs render for the 6 open days in the viewer (got ${proTimeInputs})`)
  ok(proHours.includes('value="08:00"') && proHours.includes('value="21:00"'), 'viewer hours prefill from what Google shows')
  ok(proHours.includes('This day has more than one time range on Google. Saving replaces it with one range.'), 'the honest multi-range replace note renders in the viewer')
  ok(proHours.includes('Save to Google'), 'the hours Save to Google button renders in the viewer')

  // The links editor: the same two prefilled fields.
  const proLinks = renderViewer(FIXTURE, { isPro: true, initialEditKey: 'links' })
  ok(proLinks.includes('value="https://tacoexample.com"'), 'the viewer website input prefills')
  ok(proLinks.includes('value="(555) 123-4567"'), 'the viewer phone input prefills')
  ok(proLinks.includes('Save to Google'), 'the links Save to Google button renders in the viewer')

  // The attribute editor: the same Yes/No toggles, only-what-you-set line.
  const proAttrs = renderViewer(FIXTURE, { isPro: true, initialEditKey: 'getting' })
  const proYes = (proAttrs.match(/>Yes<\/button>/g) ?? []).length
  const proNo = (proAttrs.match(/>No<\/button>/g) ?? []).length
  ok(proYes === 3 && proNo === 3, `every getting-here row gets a Yes/No toggle pair in the viewer (got ${proYes}/${proNo})`)
  ok(proAttrs.includes('Only what you set is sent.'), 'the honest only-what-you-set line renders in the viewer')
  ok(proAttrs.includes('Save to Google') && proAttrs.includes('Cancel'), 'Save to Google + Cancel render in the viewer attrs editor')

  // The categories editor: current Main + extra chips + search + Save.
  const proCats = renderViewer(FIXTURE, { isPro: true, initialEditKey: 'categories' })
  ok(proCats.includes('Main: Grocery store'), 'the viewer categories editor shows the current main')
  ok(proCats.includes('Cafe') && proCats.includes('Deli'), 'the viewer categories editor shows the extra chips')
  ok(/id="gbp-cat-search"/.test(proCats), 'the viewer category search box renders')
  ok(proCats.includes('Make main'), 'the viewer categories editor offers Make main')
  ok(proCats.includes('Save to Google') && proCats.includes('Cancel'), 'Save to Google + Cancel render in the viewer categories editor')

  // The photos editor: file input + Add to Google.
  const proPhotos = renderViewer(FIXTURE, { isPro: true, initialEditKey: 'photos' })
  ok(proPhotos.includes('type="file"') && proPhotos.includes('accept="image/*"'), 'the viewer photo file input renders')
  ok(proPhotos.includes('Add to Google'), 'the viewer Add to Google button renders')
  ok(proPhotos.includes('Cancel'), 'the viewer photos Cancel renders')

  // Still NONE of the builder on any tier: no advice, no Why-it-matters,
  // no Keep-it-strong, no Fix it now, no stepper.
  for (const [name, html] of [['closed', proViewer], ['description', proDesc], ['hours', proHours], ['links', proLinks], ['attrs', proAttrs], ['categories', proCats], ['photos', proPhotos]] as const) {
    ok(!html.includes('Apnosh AI says') && !html.includes('Why it matters') && !html.includes('Keep it strong') && !html.includes('Fix it now') && !html.includes('>Start<'), `no builder blocks leak into the Pro viewer (${name})`)
  }
  ok(!proViewer.includes(ADVICE.description) && !proViewer.includes(ADVICE.hours), 'no advice text leaks into the Pro viewer')

  console.log('\n== m) no em dashes ==')
  ok(rendered.every((h) => !h.includes('\u2014')), 'no em dash in any rendered screen')
  ok(rendered.every((h) => !h.includes('\u2013')), 'no en dash in any rendered screen either')

  console.log(fail ? `\n${fail} FAILURES` : '\nALL PASS')
  process.exit(fail ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(1) })
