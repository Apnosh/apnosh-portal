/**
 * A made-up Google profile, so the walkthrough can be looked at without a login.
 *
 * WHY. The Google-profile walkthrough is the reference every other setup card gets built from, and
 * until now the only way to see it was to sign in, connect a real Google account and have a real
 * profile behind it. That meant it got reviewed as screenshots, which is exactly how the campaign
 * screens went unreviewed for weeks — a screenshot cannot be tapped, so everything that only shows
 * itself under interaction stays unseen.
 *
 * SHAPED TO BE WORTH LOOKING AT. A profile where everything is already good would render a screen
 * with nothing to do on it. This one is deliberately middling and covers every state the UI can be
 * in at once: two sections good, four needing work, two missing outright, one we could not read.
 * That is the only way one page exercises every status chip, every empty state and the finish bar.
 *
 * The score is 62, which sits below GBP_FINISH_MIN_SCORE on purpose so the "not ready to finish
 * yet" path is the one you land in rather than a happy path nobody has to fix.
 *
 * NOT A REAL PROFILE. Every value is written by hand. Nothing here reads or writes Google, and no
 * part of this file touches the database, which is what keeps the preview route safe to leave
 * unauthenticated.
 */

import type { GbpDiagnosis } from '@/lib/gbp-diagnose'

/** Fixed so the preview never drifts, and late enough to read as "checked just now". */
const CHECKED_AT = '2026-07-27T09:14:00.000Z'

export const PREVIEW_DIAGNOSIS: GbpDiagnosis = {
  connected: true,
  score: 62,
  checkedAt: CHECKED_AT,
  mapsUri: 'https://maps.google.com/?cid=0000000000000000000',
  /* Notes are internal and never rendered; kept empty so the preview cannot accidentally show
   * something the real screen would hide. */
  notes: [],
  sections: [
    {
      key: 'hours',
      label: 'Your hours',
      status: 'needs-work',
      current: 'Open every day 8am to 4pm, with no holiday hours set',
      why: 'People search "open now". Hours that are wrong on a holiday send them somewhere else, and Google keeps showing them until you fix it.',
      aiFixable: true,
      advice: 'Your hours look the same every day, which is rare for a cafe. Check Sunday especially, and add the holidays coming up.',
      detail: {
        kind: 'hours',
        days: [
          { day: 'Monday', hours: '8:00 am to 4:00 pm' },
          { day: 'Tuesday', hours: '8:00 am to 4:00 pm' },
          { day: 'Wednesday', hours: '8:00 am to 4:00 pm' },
          { day: 'Thursday', hours: '8:00 am to 4:00 pm' },
          { day: 'Friday', hours: '8:00 am to 4:00 pm' },
          { day: 'Saturday', hours: '8:00 am to 4:00 pm' },
          { day: 'Sunday', hours: '8:00 am to 4:00 pm' },
        ],
        specialCount: 0,
      },
    },
    {
      key: 'categories',
      label: 'Your categories',
      status: 'needs-work',
      current: 'Restaurant, with nothing else set',
      why: 'Your main category decides which searches you can appear in at all. "Restaurant" is the broadest one there is, so you compete with everybody and match nobody.',
      aiFixable: true,
      advice: 'Cafe fits you better than Restaurant as the main one, and Coffee shop and Grocery store are worth adding underneath.',
      detail: {
        kind: 'categories',
        primary: 'gcid:restaurant',
        additional: [],
        primaryName: 'Restaurant',
        additionalNames: [],
      },
    },
    {
      key: 'description',
      label: 'Your description',
      status: 'missing',
      current: 'Nothing written yet',
      why: 'This is the only place on your listing where you get to say what you are in your own words. Empty, Google guesses from reviews.',
      aiFixable: true,
      advice: 'Say what you sell, where you are, and the one thing people come back for. Two or three sentences is plenty.',
      detail: { kind: 'description', text: null },
    },
    {
      key: 'photos',
      label: 'Your photos',
      status: 'needs-work',
      current: '7 photos, the newest from about 14 months ago',
      why: 'Profiles with twenty or more photos get noticeably more people asking for directions. Old photos also make people wonder if you are still open.',
      aiFixable: false,
      advice: 'Seven is thin and they are over a year old. The food shots matter most, then the room, then the front of the shop.',
      detail: {
        kind: 'photos',
        count: 7,
        newestLabel: 'about 14 months ago',
        items: [],
      },
    },
    {
      key: 'menu',
      label: 'Your menu',
      status: 'good',
      current: '18 items with prices',
      why: 'A menu on your listing is one of the few things that gets people from looking to walking in.',
      aiFixable: false,
      detail: {
        kind: 'menu',
        itemCount: 18,
        items: [
          { name: 'Cardamom bun', price: '$4.50' },
          { name: 'Breakfast sandwich', price: '$9.00' },
          { name: 'House cold brew', price: '$5.00' },
        ],
        menuLink: 'https://example.com/menu',
      },
    },
    {
      key: 'links',
      label: 'Website and phone',
      status: 'missing',
      current: 'No website link, phone number set',
      why: 'The website button is one of the three things people tap. Without it the tap has nowhere to go.',
      aiFixable: true,
      advice: 'Add your site, and point it at the page with your hours and menu rather than the home page.',
      detail: { kind: 'links', website: null, phone: '(206) 555 0143' },
    },
    {
      key: 'getting',
      label: 'Getting here',
      status: 'needs-work',
      current: 'Nothing set about parking or access',
      why: 'These show as small labels on your listing, and they answer the questions that stop somebody deciding.',
      aiFixable: true,
      advice: 'Street parking and wheelchair access are the two people look for most on a corner shop.',
      detail: {
        kind: 'attrs',
        items: [
          { id: 'has_parking', label: 'Parking', value: null },
          { id: 'wheelchair_accessible_entrance', label: 'Step-free entrance', value: null },
          { id: 'has_bike_parking', label: 'Bike parking', value: null },
        ],
      },
    },
    {
      key: 'seating',
      label: 'Seating and space',
      status: 'good',
      current: 'Indoor seating and outdoor seating both set',
      why: 'People filter on these, especially in good weather.',
      aiFixable: true,
      detail: {
        kind: 'attrs',
        items: [
          { id: 'has_indoor_seating', label: 'Indoor seating', value: true },
          { id: 'has_outdoor_seating', label: 'Outdoor seating', value: true },
        ],
      },
    },
    {
      /* The rung that is easy to forget exists. Unknown is not the same as bad, and the UI has a
       * separate grey chip for it — this section is here so that chip is on screen. */
      key: 'service',
      label: 'Service and payments',
      status: 'unknown',
      current: 'We could not read this from Google',
      why: 'Google did not return these for your listing. It usually means they have never been set.',
      aiFixable: false,
      detail: { kind: 'attrs', items: [] },
    },
  ],
}
