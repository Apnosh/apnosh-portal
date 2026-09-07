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

  /* ── Move 7b ────────────────────────────────────────────────────────────────────────
     The weekly sentence, the monthly report, and the win card. */

  /* the one line under the Home funnel (src/components/mvp/weekly-sentence.tsx). The reader
     returns the KEY, so the two sentences it can pick live here and in love/sentence.ts. */
  weekly: [
    'This week your Google listing got {n} taps: calls, directions, and website visits. Last week it was {prev}.',
    'This week your posts reached {n} people. Last week it was {prev}.',
  ],

  /* /dashboard/insights/impact — the monthly report. The review THEMES and the move written for
     each one are free text from the sentiment engine, not keys, so they stay English inside a
     Spanish page until that engine writes keys. */
  report: [
    'Back',
    'Your month · made from your numbers', 'This month, so far', 'in {month}',
    'people found you in search', 'people acted on your listing',
    'A quiet month on the wires. Connect Google and publish work, and this page fills with your real numbers.',
    'The words that brought them', 'Up from {n} the month before.', 'Down from {n} the month before.',
    'What they said', '{n} new review · {avg} average', '{n} new reviews · {avg} average',
    '{n} the month before', 'Loved lately', 'Heard more than once', '{n} mention', '{n} mentions',
    'The move:',
    'What worked', '{n} people', '{n} post', '{n} posts',
    'saw your best post', 'saw your best post: {title}', 'published this month',
    'What it moved', 'Calls', 'Directions', 'Site visits',
    'Send this to someone', 'Print or save as PDF', 'Copy link', 'Link copied',
    'The link only opens for people who can already see your business.',
    'What happens next', 'Next month builds on this one. Plan the next push in a minute.',
    'Open the builder',
  ],

  /* /dashboard/wins, /dashboard/wins/[id] and the public /w/[token] card. The card's own label,
     number line and comparison are written by the proof composer as free text, not keys, so they
     stay English; everything the pages themselves say is here. */
  wins: [
    'Back', 'Loading…', 'Your business',
    'Wins', 'Proof you can show someone', 'No wins yet',
    'When an order you paid for gets its count, the card lands here. Then you can show it to someone.',
    'The wins shelf is almost on. A small database update turns it on.',
    'Show someone', 'Counted by Apnosh', 'Print or save as PDF', 'Link copied',
    'Anyone with the link sees this card and nothing else about your business.',
    'The share link is not on yet. A small database update turns it on.',
    'Nothing to show here',
    'Only an order we counted is something to show. See the rest on your wins shelf.',
    'Made with Apnosh', 'This link does not work',
    'It may have been cut short, or the card was taken down. Ask for it again.',
  ],

  /* the WIN CARD's own three lines, not a screen — they are stored on the card (proof_cards
     .metadata, migration 262) as a key plus its numbers and drawn in the reader's language by
     src/lib/love/win.ts renderCardWords. The keys live in src/lib/promises/lines.ts, beside the
     seven states, and the units are the promise metrics from src/lib/promises/registry.ts.
     What stays English: the owner's OWN name for the order ("Taco Tuesday push"), because they
     wrote it. */
  promiseCard: [
    'Counted: {label}', '{n} {unit}', 'Counted {from}–{to}',
    'taps on your Google card', 'views of your Google card', 'orders placed on Google',
    'replies posted', 'new Google reviews', 'your rating since you started',
    'views per post, where they go', 'website visits, daily',
  ],

  /* the monthly report EMAIL, not a screen — the same way `reply` and `chips` are data. Its
     lines are built in src/lib/report/report-sent.ts and sent in the owner's own language. */
  reportEmail: [
    'Your {month} is ready',
    'What it moved: {calls} calls, {directions} directions, {clicks} site visits.',
    'What they said: {n} new review, {avg} average.',
    'What they said: {n} new reviews, {avg} average.',
    'What worked: {n} people saw your best post.',
    'What worked: {n} posts went out.',
    'Not counted yet. When the numbers come in, they show up here.',
  ],
}

/** Every key across every translated screen, once each. */
export function allScreenKeys(): string[] {
  return [...new Set(Object.values(SCREEN_KEYS).flat())]
}
