/**
 * preview-fixture — one made-up business, so the campaign screens can be looked at without a login.
 *
 * WHY THIS EXISTS. The campaign builder lives behind /dashboard, which means seeing it requires
 * signing in, which on a phone means typing a password, which in practice meant nobody looked at it
 * and screens were reviewed as screenshots instead. Screenshots cannot be tapped, so the parts that
 * only reveal themselves under interaction — what the reach number does when you move the cap, what
 * the plan says when a rule has no early warning — went unreviewed. This fixture is the fix: it
 * feeds the REAL components the same shape getPlanInputs returns, so /preview/campaign renders
 * production code with nothing to log into.
 *
 * IT IS NOT A SECOND IMPLEMENTATION. Nothing here re-states a price, a service or a rule; all of
 * that still comes from the catalog and mechanisms modules at render time. The only invented things
 * are the answers a business would have given during onboarding.
 *
 * NOT A REAL CLIENT. Yellowbee Market & Cafe is a stand-in. Every field below is written by hand.
 * Nothing in this file reads or writes the database, which is also what keeps the preview route
 * safe to leave unauthenticated.
 */

import { known, missing, type PlanInputs, type ChannelState } from '@/lib/campaigns/data/plan-inputs'

/** Roughly what a busy small grocery-and-cafe sees walk past in a day. Drives the free-reach maths. */
export const PREVIEW_DAILY_FOOTFALL = 300

/** The date the whole worked example points at. Fixed on purpose, so the preview never drifts. */
export const PREVIEW_OPENING = '2026-09-12'

const CHANNELS: ChannelState[] = [
  {
    key: 'google_business_profile',
    name: 'Google Business Profile',
    connected: true,
    canPost: true,
    costOfMissing:
      'This is where most people find a restaurant. Without it we cannot fix your listing or post to it, which is most of step 1.',
    href: '/dashboard/connected-accounts',
  },
  {
    key: 'instagram',
    name: 'Instagram',
    connected: true,
    canPost: true,
    costOfMissing:
      'We can make the posts, but you would have to put them up yourself. Connected, we schedule and publish them for you.',
    href: '/dashboard/connected-accounts',
  },
  {
    /* Left disconnected deliberately. A preview where everything is already wired up hides the
     * "here is what this costs you" copy, which is the part most worth arguing about. */
    key: 'facebook',
    name: 'Facebook',
    connected: false,
    canPost: true,
    costOfMissing:
      'Same posts, one more place, no extra work. Without it they only run on the channels you have connected.',
    href: '/dashboard/connected-accounts',
  },
]

/**
 * A second location opening, which is the brief the whole offer-first design was built against.
 *
 * `budget` is deliberately missing: the point of the builder is that it prices the plan the owner
 * needs rather than filling a number they guessed, and a fixture that supplies one would quietly
 * skip the screens where that gets decided.
 */
export const PREVIEW_INPUTS: PlanInputs = {
  goal: known('new-customers', 'onboarding', 'A line out the door on opening day'),
  goalWords: known(
    'We are opening our second location in Seattle on 12 September. I want a line outside the store on the day, before we even open.',
    'onboarding',
  ),
  budget: missing('/dashboard/settings'),
  knownFor: known(['Cardamom bun', 'Breakfast sandwich', 'House cold brew'], 'menu'),
  standsOut: known(
    'A corner grocery you can also sit down and eat in. Everything on the counter is made in the back.',
    'onboarding',
  ),
  audience: known(['Neighbourhood regulars', 'Morning commuters', 'Weekend families'], 'onboarding'),
  slowDays: known(['Tuesday', 'Wednesday'], 'onboarding'),
  channels: CHANNELS,
  menu: [
    { id: 'p-bun', name: 'Cardamom bun', featured: true },
    { id: 'p-sando', name: 'Breakfast sandwich', featured: true },
    { id: 'p-brew', name: 'House cold brew', featured: true },
    { id: 'p-soup', name: 'Soup of the day', featured: false },
    { id: 'p-grain', name: 'Grain bowl', featured: false },
    { id: 'p-cookie', name: 'Salted chocolate cookie', featured: false },
  ],
}

/** The paragraph an owner would type into screen 1, kept here so every surface quotes the same one. */
export const PREVIEW_PARAGRAPH =
  'We are opening our second location in Seattle on 12 September. I want a line outside the store on the day, before we even open. Whatever it takes. We can get DJs, do giveaways, a stunt, anything for a big show up on opening day.'
