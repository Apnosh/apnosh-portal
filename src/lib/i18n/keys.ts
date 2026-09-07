/**
 * keys — every English string the TRANSLATED screens draw, listed per screen.
 *
 * This is the manifest scripts/verify-i18n.ts checks against src/lib/i18n/es.ts, and it is the
 * only way to answer two questions that a dictionary alone cannot:
 *
 *   · Is anything on a screen we CLAIM is translated still going to render in English?
 *     (a key here with no entry in ES)
 *   · Is the dictionary carrying translations for words no screen draws any more?
 *     (an entry in ES that no screen lists)
 *
 * A screen is listed here only once its literals actually route through t(). Adding a screen to
 * this list without wiring it is how a product ends up claiming a Spanish it does not have, so
 * the rule is: wire the screen, then list its strings.
 *
 * The ORDER screens (checkout, campaigns, the creative flow, the request desk) are deliberately
 * absent. A sibling move owns those files this week; their strings are listed as follow-ups in
 * the move's report, not here, because listing them would make the check pass on a promise.
 */

export const SCREEN_KEYS: Record<string, readonly string[]> = {
  /* /dashboard — the funnel hero, the people row, Counted as promised */
  home: [
    'Awareness', 'Interest', 'Actions', 'Orders', 'Retention',
    'times you showed up on Google', 'times you showed up on Google and social',
    'website visits & clicks', 'directions & calls', 'walk-in orders from Google', 'came back for more',
    'Your numbers show here', 'Connect accounts',
    'Last 7 days', 'Last 30 days', 'Last 90 days', 'Last year', 'Custom',
    'Counted, as promised',
    'Before and after on your whole listing. It shows what happened, not proof of cause.',
    'The people on your work', 'Get help', 'A real person replies within one business day.',
    '{n} pieces of work',
  ],

  /* the promise and its clock — the thread header and Get help both draw these */
  reply: ['within one business day', 'Sent', 'we answer', 'due', 'Answered in'],

  /* /dashboard/get-help */
  getHelp: [
    'Get help', 'A real person answers', 'Talk to us', 'Message us',
    'We reply within one business day', 'Share feedback', 'Tell us what to make better',
    'Find it yourself', 'Questions and answers', 'The papers', 'Your agreements',
  ],

  /* /dashboard/settings — the language row */
  settings: [
    'Language', 'Pick the language you want to read.', 'Saved.',
    'Could not save. Try again.', 'Some screens are still in English. We are working on the rest.',
  ],

  /* /dashboard/campaigns/new — the shelf's own chrome (the cards themselves are catalog copy) */
  create: [
    'For you', 'For a truck', 'For delivery only', 'For this shop', 'For catering', 'For the season',
    'From your own numbers', 'No numbers yet', '{n} you can order today',
    'Set a budget', 'Up to {amount} to start', 'Above {amount} to start', '{n} more, once you raise it',
    'Raise budget', 'Coming later for this goal', 'Tell me when',
    'Nothing here yet for this one.',
    'Everything we could do for it is below, with the reason it is not ready.',
    'What feels right to start?', 'You can change it any time. Nothing is charged now.',
    'No cap set. Everything shows.',
    // the shape chip on the goal rail draws SHAPE_LABEL's title (also listed under onboarding)
    'A place people come to', 'A truck or a pop-up', 'Delivery only',
    'Two or more places', 'Mostly catering', 'Open for a season',
  ],

  /* the fourteen goal chips and the six budget answers — asked in setup, shown on Create.
     The stored value stays the English string; only the drawing is translated. */
  chips: [
    'More customers on slow days', 'More foot traffic overall', 'Build local awareness',
    'Promote a specific offering', 'Grow social following', 'Improve online reputation',
    'Launch something new', 'Stay top of mind', 'Compete with nearby businesses',
    'More bookings or orders', 'Turn first-timers into regulars', 'Grow catering orders',
    'Better photos of my food', 'Reach a younger crowd',
    'Under $200/mo', '$200 to $500/mo', '$500 to $1,000/mo',
    '$1,000 to $2,500/mo', 'Over $2,500/mo', 'Not sure yet',
  ],

  /* /onboarding/full — the frame every screen sits in, the shape question, the goal tiles
     and the budget question. The chip VALUES are listed under `chips` (they are stored). */
  onboarding: [
    'Continue', 'Saving...', 'Back', 'Finish later', 'Exit',
    'What matters most right now?', 'Pick up to three.',
    'Fill the quiet nights', 'More people through the door', 'Be known nearby',
    'A dish, a service, a night', 'More people following along',
    'A higher rating, answered reviews', 'A menu, a look, an opening',
    'Be remembered between visits', 'Win the block', 'Online, direct where you can',
    'One visit into ten', 'Group and office orders', 'Plates that sell themselves',
    'Where they actually look',
    'What feels right to start?', 'You can change it any time. Nothing is charged now.',
    'How does it run?', 'This decides what we show you and what we never will.',
    'Pick the closest one',
    'A place people come to', 'One dining room, counter or shop',
    'A truck or a pop-up', 'The spot changes',
    'Delivery only', 'No dining room. The food goes out.',
    'Two or more places', 'Each one has its own numbers',
    'Mostly catering', 'Offices, parties, big orders',
    'Open for a season', 'Busy part of the year, quiet the rest',
  ],
}

/** Every key across every translated screen, once each. */
export function allScreenKeys(): string[] {
  return [...new Set(Object.values(SCREEN_KEYS).flat())]
}
