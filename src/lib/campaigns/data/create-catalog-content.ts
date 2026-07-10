/**
 * Authored product-page copy for every create-catalog card: the one-line promise under the
 * title, the fallback "why this" line (shown when the business has no real signals), and the
 * honest expectation line at the bottom.
 *
 * Single-sourced next to create-catalog.ts and typed Record<CreateCatalogId, …> so adding a
 * card without authoring its lines is a COMPILE error. Copy rules: plain 5th-grade words,
 * sentence case, no em dashes, no marketing filler, no invented numbers — each line is
 * grounded in what the card actually composes (ITEM_SHAPE in compose-plan.ts).
 */

import type { CreateCatalogId } from './create-catalog'

export interface PdpCopy {
  /** One-line promise under the title: what this does for the owner, plainly. */
  promise: string
  /** Fallback "why this" when whyFor() has no real signal. Never states a number. */
  why: string
  /** Honest expectation: one small, true sentence about how results tend to land. */
  expect: string
}

export const PDP_CONTENT: Record<CreateCatalogId, PdpCopy> = {
  reach: {
    promise: 'Ads that put your food in front of people nearby.',
    why: 'Most people pick a spot they saw recently. Ads keep you in view without extra work.',
    expect: 'Ads take a few weeks of tuning before results settle in.',
  },
  nights: {
    promise: 'A weekly push that gives people a reason to come in on your quiet days.',
    why: 'Empty tables on slow nights are lost money. A steady reminder wins some of it back.',
    expect: 'Slow nights fill in bit by bit as guests learn the routine.',
  },
  firstvisit: {
    promise: 'A full system that turns nearby strangers into first-time guests.',
    why: 'New people have to find you, want you, and get a reason to come now. This covers all three.',
    expect: 'First visits build over a month or two as the pieces start working together.',
  },
  regulars: {
    promise: 'Rewards and check-ins that bring guests back for visit two and three.',
    why: 'Bringing a past guest back costs far less than finding a new one.',
    expect: 'Repeat visits grow over a few months as your guest list fills in.',
  },
  catering: {
    promise: 'A photo, a post, and an outreach email that put your catering in front of offices nearby.',
    why: 'One catering order can be worth a full night of tables.',
    expect: 'Catering leads come in slowly at first, then in batches around events.',
  },
  reviewsplan: {
    promise: 'A review system set up for you, plus the first asks.',
    why: 'People check your stars before they check your menu.',
    expect: 'Fresh reviews usually start showing up within a few weeks of asking.',
  },
  reel: {
    promise: 'A short video of your food, made for Instagram and TikTok.',
    why: 'Short video is the easiest way for new people to see your food.',
    expect: 'One reel is one at-bat. Posting steadily is what adds up.',
  },
  story: {
    promise: 'A quick story post to stay top of mind.',
    why: 'Stories keep you in front of the people who already follow you.',
    expect: 'A story lasts a day. It works best as a steady habit.',
  },
  graphic: {
    promise: 'A designed post with your message, sized for where it goes.',
    why: 'A clean graphic makes an announcement look official and easy to share.',
    expect: 'A graphic carries your message. Reach depends on where you share it.',
  },
  dish: {
    promise: 'Your best plate, shot and posted so people want it.',
    why: 'People order with their eyes. One great dish photo does real work.',
    expect: 'A strong dish post earns saves and shares more than instant orders.',
  },
  edit: {
    promise: 'Send your clips and photos. We cut and polish them into a reel and edited shots.',
    why: 'You already filmed it. Editing is the part that takes the time.',
    expect: 'The final cut is only as strong as the footage you send.',
  },
  gpost: {
    promise: 'An update on your Google listing, seen in Search and Maps.',
    why: 'Google posts show up right where people decide where to eat.',
    expect: 'A post keeps your listing fresh. It works best done often.',
  },
  listings: {
    promise: 'Your info synced and correct on Yelp, Apple Maps, Facebook, and more.',
    why: 'Wrong hours on one app can cost you a table tonight.',
    expect: 'Listings update within days. Steady syncing keeps them right.',
  },
  website: {
    promise: 'Your site and menu made fast, correct, and easy to order from.',
    why: 'Most guests check your site before they come. A slow or broken page turns them away.',
    expect: 'A fixed site removes friction. It does not create demand by itself.',
  },
  localseo: {
    promise: 'Show up when neighbors search for food near me.',
    why: 'The spots at the top of local search get the call.',
    expect: 'Local search gains usually take one to three months to show.',
  },
  delivery: {
    promise: 'Photos, menus, and promos fixed up on your delivery apps.',
    why: 'Better photos and a clean menu lift delivery orders from the same traffic.',
    expect: 'Delivery pages update fast. Ranking gains take longer.',
  },
  nextdoor: {
    promise: 'Your Nextdoor page set up and your neighborhood kept warm for you.',
    why: 'Nextdoor reaches the people who live closest to you.',
    expect: 'Neighborhood word of mouth builds slowly and sticks.',
  },
  promoevent: {
    promise: 'A build-up for your event: tease it, invite your list, push hard on the day.',
    why: 'Events fill when people hear about them more than once.',
    expect: 'Turnout follows how early the push starts.',
  },
  launch: {
    promise: 'A real launch for your new item: tease, drop day, follow-up.',
    why: 'A new item deserves more than one quiet post.',
    expect: 'Launch buzz peaks on drop day. The follow-up keeps it alive.',
  },
  creator: {
    promise: 'A local food creator visits and posts you to their audience.',
    why: 'A creator post reaches people who trust their taste.',
    expect: 'Results depend on the creator, their reach, and the timing.',
  },
  welcome: {
    promise: 'Every new subscriber gets a warm hello series, set up once.',
    why: 'The first message is what sets up the second visit.',
    expect: 'This runs on its own after setup, one signup at a time.',
  },
  news: {
    promise: 'One good email a month, written and sent for you.',
    why: 'A monthly email keeps you in mind without being noisy.',
    expect: 'Newsletters pay off over months, not days.',
  },
  slowoffer: {
    promise: 'An email and text offer, good on your quiet days.',
    why: 'A direct nudge to your own list is the fastest lever you have.',
    expect: 'Sends work when the list is real. Results land within days.',
  },
  birthday: {
    promise: 'Set up once. Every guest gets a treat on their birthday.',
    why: 'Birthdays bring groups. The treat pays for the table.',
    expect: 'This grows as your guest list grows.',
  },
  earlyaccess: {
    promise: 'Your list gets first dibs before everyone else.',
    why: 'First dibs makes joining your list feel worth it.',
    expect: 'Works best when the thing they get early is genuinely good.',
  },
  shoot: {
    promise: 'A pro comes to you. A photo library plus a reel, yours to keep.',
    why: 'Good photos get reused everywhere: menu, Google, delivery apps, social.',
    expect: 'You keep the files and can use them for months.',
  },
  gbp: {
    promise: 'Your Google profile fixed top to bottom: photos, hours, menu, info.',
    why: 'Your Google listing is the first thing most new guests see.',
    expect: 'A complete profile helps you show up in more nearby searches.',
  },
  reviewsreply: {
    promise: 'Every review gets a drafted reply. You approve each one.',
    why: 'Replies show new guests that someone is home.',
    expect: 'Steady replies build trust over time. There is no overnight jump.',
  },
  qr: {
    promise: 'A table QR that turns diners into your guest list, designed and wired up.',
    why: 'The people at your tables are the easiest list you will ever build.',
    expect: 'Signups track your foot traffic, a few each night.',
  },
  friction: {
    promise: 'The order and reserve buttons on your Google listing, working and tested.',
    why: 'Every extra tap loses a hungry person.',
    expect: 'Smoother ordering converts the traffic you already have.',
  },
  giftcard: {
    promise: 'Gift cards set up and pushed for gifts and slow seasons.',
    why: 'Gift cards are money in the bank before the meal is served.',
    expect: 'Gift card sales spike near holidays and slow down after.',
  },
  ticket: {
    promise: 'Ticket sales set up and promoted for your dinner or class.',
    why: 'Paid seats mean the night is full before it starts.',
    expect: 'Ticket sales come early and late, with a lull in the middle.',
  },
  winback: {
    promise: 'One email and one text to guests you have not seen lately.',
    why: 'Quiet guests have not left. Most just need a nudge.',
    expect: 'A win-back send gets its replies in the first few days.',
  },
  direct: {
    promise: 'Move your regulars from delivery apps to ordering direct.',
    why: 'Delivery apps take a cut of every order. Direct orders keep it with you.',
    expect: 'The switch happens one regular at a time.',
  },
}

/** Copy for a card by id (loose lookup for the untyped JSX; null when the id is unknown). */
export function pdpCopy(itemId: string): PdpCopy | null {
  return (PDP_CONTENT as Record<string, PdpCopy | undefined>)[itemId] ?? null
}
