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
    '7 days', '30 days', '90 days', '1 year',
    'Counted, as promised',
    'Before and after on your whole listing. It shows what happened, not proof of cause.',
    'The people on your work', 'Get help', 'A real person replies within one business day.',
    '{n} pieces of work',
    // the tags on each stage, the conversion line under it, and the four stat labels
    'Real · Google', 'Real · Google + Social', '~ about · your math', 'Repeat visits',
    '{n} in 100 engaged', '{n}% took a step', '~{n}% of directions ordered',
    'Engaged', 'Revenue',
    // the chrome around the funnel: the compare line, the date pickers, the two icon buttons
    'the year before', 'the {n} days before', 'change vs {when}',
    'platforms report a few days behind', 'to', 'Your business', 'Alerts', 'Alerts ({n})',
    'Getting your numbers', 'Google {g} · Social {s}', '– even',
    // the whole funnel, read out loud to a screen reader
    'Your marketing funnel from Google: Awareness (how many times you showed up), Interest (everyone who clicked, called, or asked directions), Actions (directions and calls), Orders (walk-ins who came in and bought), and Retention (customers who came back). The Awareness, Interest, and Customer-actions stages are measured from Google; the amber Orders stage is estimated from your walk-in rate; Retention is locked until a register connects.',
  ],

  /* the promise and its clock — the thread header and Get help both draw these */
  reply: ['within one business day', 'Sent', 'we answer', 'due', 'Answered in'],

  /* /dashboard/messages — the strip of people on live orders, the inbox, one conversation */
  messages: [
    'Messages', 'People', 'Message', 'Message {name}', 'Message {name}…',
    'Say what you need. A real person picks it up.',
    'Search people and messages…', 'No messages yet',
    'Tap someone above to say hello. A real person on your team answers.',
    'No matches', 'No people or messages match that search.',
    'No business linked yet', 'Finish setting up your restaurant to start messaging your team.',
    'Loading…', 'Back', 'Send', 'Sending…', 'Sent · {time}', 'Today', 'Yesterday', 'now',
    /* the line under a person's name in the conversation header */
    'Apnosh team', 'replies {promise}', 'Replies {promise}',
    'Your strategist', 'Videographer', 'Photographer', 'Designer', 'Account & billing', 'Support',
    'Plans, priorities, anything', 'Films your content', 'Photos of your food & space',
    'Graphics, menus, flyers', 'Plans, invoices, payments', 'Anything else',
  ],

  /* /dashboard/get-help */
  getHelp: [
    'Get help', 'A real person answers', 'Talk to us', 'Message us',
    'We reply {promise}', 'within one business day', 'Share feedback', 'Tell us what to make better',
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
    // the product page, the guide flow and the search box on the same screen
    'Coming soon', 'Not on sale yet', 'We will tell you the day it opens',
    'Describe what you want to do', 'Say it in a sentence. A date, a dish, a slow night…',
    'We read it and suggest a plan. You can change anything.', 'We could not read that one.',
    'Pick a goal above and we show the best ways, or send your words to your strategist and a person reads them.',
    'Not seeing it? Ask for anything', 'Search campaigns', 'Clear', 'See all', 'Back',
    ', or free, you do it', 'Not sure? Guide me', 'Three questions, then three picks',
    'Plain words work: try flyer, menu photos, TikTok, Yelp, coupons',
    'Nothing matches yet.', 'Loosen a filter, or just tell us what you need.', 'matches “{word}”',
    'Back a step', 'Your starter shelf', 'Start over', 'That one is not on the shelf.',
    'Back to Create', 'price', 'ready in', 'you do', 'channel', 'channels',
    'In plain words', 'What you get', 'What happens after you order',
    'Amber is you. Everything else is us.', 'Where it shows up',
    // the describe box, the guide's path, the product page's timeline and the why-now lines
    'Reading', 'Plan it', 'We do not do {list} yet. Everything else is below.', 'Build this',
    'Send it to your strategist', 'Tell us what you need', 'Halloween party Oct 31, want it packed',
    'New fall menu lands Sep 18', 'Tuesdays are dead, fill them', 'Get office lunch orders',
    'Set up once', 'The basics, ticked off as you go', 'Done', '{n} result', '{n} results', 'for “{q}”',
    '{n} reviews are waiting for a reply', 'You are at {r} stars',
    '{n} thing on your listing needs fixing', '{n} things on your listing need fixing',
    '{n} people saw your listing this month', '{n} people asked for directions this month', 'Found',
    'Tempted', 'Come in', 'Come back', '{n} saw your listing this month', 'How many people see you',
    '{r} stars · {n} reviews', 'What they think when they look', '{n} asked for directions',
    'Who actually comes', 'Who comes twice', 'How a guest reaches you', 'Why these three',
    'Where it sits:', 'Three picks that fit what you said. About {amount} to start.', 'a quote',
    'Start with the first one', 'Moves {stage}', 'Nothing', 'Approve', 'Show up', 'Day 0', 'Day 1',
    'Day 2', 'Day 3', 'Week 1', 'Every week', 'Monthly', 'You order. We read what you already have.',
    'We start the work and send you anything we need.', 'You check the result. One tap, or a note.',
    'Done, and on your Home.', 'You order. We read your menu, photos and calendar.',
    'The first pieces land for your OK.', 'New pieces go out on the plan.',
    'A read of what moved, on Insights.', 'We draft it.', 'You approve in Inbox. One tap, or a note.',
    'It goes out.', 'Goes well with', 'Ask for a quote', 'Order', 'Guide me',
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
    'Continue', 'Getting your setup ready', 'Saving...', 'Back', 'Finish later', 'Exit',
    'Setup progress: screen {n} of {total}',
    'Save your answers and finish setup later from the dashboard.',
    'Leave setup. Your progress is saved.',
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

  /* MOVE 8 — the Home card, /dashboard/tell-a-friend, and the one line onboarding says on the
     finish screen when a friend sent them. The public /owners/<slug> page draws these too; it is
     rendered on the server in the OWNER's language. */
  referral: [
    'Tell a friend', 'Know an owner who would like this?', 'Give {amount}, get {amount}.',
    'Your code', 'Send this link', 'Copied',
    'They get {amount} off their first order. You get {amount} when their first order gets its number.',
    'Your credit', '{amount} on your account', 'It comes off your next order.',
    'Your friends', 'A friend', 'Nobody yet. Send your link to one owner you like.',
    // the four states a friend can be in (STATUS_WORD in lib/referrals/model.ts)
    'Signed up', 'First order in', 'You got your credit', 'Closed',
    // the one void an owner can see the cause of from their own side
    'Refunded, so no credit',
    'Your page', 'Show my page', 'Other owners see your name and your counted numbers. Nothing else.',
    'See my page',
    'Not yet', 'This opens once one of your orders has its number.',
    // the finish screen after setup
    'Your friend {name} sent you.', 'A friend sent you.', '{amount} off your first order.',
    // the public page
    'An owner on Apnosh', 'What we counted for them',
    'Real numbers from their account, counted after the work went live.',
    'Start with {amount} off', 'Start with Apnosh',
    '{name} sent you. Your first order starts with {amount} off.', '{name} works with Apnosh.',
    // the notice the payout cron sends the referrer (src/lib/referrals/payout.ts)
    'Your {amount} friend credit is here',
    "Your friend's first order got its number, so your {amount} is on your account. It comes off your next order.",
    // shared with other screens, drawn here too
    'Loading…', 'Saved.', 'Could not save. Try again.', 'Saving...',
  ],
}

/** Every key across every translated screen, once each. */
export function allScreenKeys(): string[] {
  return [...new Set(Object.values(SCREEN_KEYS).flat())]
}
