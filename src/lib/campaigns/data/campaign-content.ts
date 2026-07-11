/**
 * CAMPAIGN_CONTENT — the ONE canonical content record per store campaign (Phase A of the
 * campaign-catalog systemization). Every word a campaign's product page sells with lives here:
 * the card title + tagline (previously the JSX CATALOG's title/sub), the PDP description
 * (previously hardcoded in the JSX for gbp, the authored fallback "why" for the rest), the
 * hero promise line, the fallback why, and the honest expectation line (previously
 * create-catalog-content.ts). Later this becomes a DB row in an admin CMS; today it is the
 * single authored source the render layers read.
 *
 * Typed Record<CreateCatalogId, CampaignContent> so adding a catalog id without authoring its
 * content is a COMPILE error. scripts/verify-catalog-ids.ts asserts title/tagline stay
 * byte-identical to the JSX CATALOG cards until the JSX reads from here directly (Phase B).
 *
 * Copy rules: plain 5th-grade words, sentence case, no em dashes, no marketing filler, no
 * invented numbers — each line is grounded in what the card actually composes (ITEM_SHAPE in
 * compose-plan.ts). CLIENT-SAFE: pure data, no server-only.
 */

import type { CreateCatalogId } from './create-catalog'

export interface CampaignContent {
  id: CreateCatalogId
  /** Card + product-page title (was the JSX CATALOG card's `title`). */
  title: string
  /** One-line card subtitle (was the JSX CATALOG card's `sub`). */
  tagline: string
  /** The PDP sell paragraph. For most cards this is the authored fallback why line the PDP
   *  shows when the business has no real signals; gbp carries its bespoke PDP description. */
  description: string
  /** One-line promise under the title — the PDP hero line for non-signal cards. */
  promise: string
  /** Fallback "why this" when whyFor() has no real signal. Never states a number. */
  why: string
  /** Honest expectation: one small, true sentence about how results tend to land. */
  expectation: string
  /** Real product photo for the PDP hero. null = no photo yet (the drawn art stays the fallback). */
  heroImage: string | null
  /** Optional "who this fits" line (Phase B content pass). */
  bestFor?: string
  /** Optional owner FAQ (Phase B content pass). */
  faq?: { q: string; a: string }[]
}

export const CAMPAIGN_CONTENT: Record<CreateCatalogId, CampaignContent> = {
  reach: {
    id: 'reach',
    title: "Run local ads",
    tagline: "Ads run and tuned for you, plus a reel and post to start",
    description: "Most people pick a spot they saw recently. Ads keep you in view without extra work.",
    promise: "Ads that put your food in front of people nearby.",
    why: "Most people pick a spot they saw recently. Ads keep you in view without extra work.",
    expectation: "Ads take a few weeks of tuning before results settle in.",
    heroImage: null,
  },
  nights: {
    id: 'nights',
    title: "Fill your slow nights",
    tagline: "Drive guests on your quiet days",
    description: "Empty tables on slow nights are lost money. A steady reminder wins some of it back.",
    promise: "A weekly push that gives people a reason to come in on your quiet days.",
    why: "Empty tables on slow nights are lost money. A steady reminder wins some of it back.",
    expectation: "Slow nights fill in bit by bit as guests learn the routine.",
    heroImage: null,
  },
  firstvisit: {
    id: 'firstvisit',
    title: "Win first-time visits",
    tagline: "Give new people a reason to come in",
    description: "New people have to find you, want you, and get a reason to come now. This covers all three.",
    promise: "A full system that turns nearby strangers into first-time guests.",
    why: "New people have to find you, want you, and get a reason to come now. This covers all three.",
    expectation: "First visits build over a month or two as the pieces start working together.",
    heroImage: null,
  },
  regulars: {
    id: 'regulars',
    title: "Turn first-timers into regulars",
    tagline: "Win the all-important second visit",
    description: "Bringing a past guest back costs far less than finding a new one.",
    promise: "Rewards and check-ins that bring guests back for visit two and three.",
    why: "Bringing a past guest back costs far less than finding a new one.",
    expectation: "Repeat visits grow over a few months as your guest list fills in.",
    heroImage: null,
  },
  catering: {
    id: 'catering',
    title: "Promote your catering",
    tagline: "1 styled photo, 1 post, 1 outreach email to nearby offices",
    description: "One catering order can be worth a full night of tables.",
    promise: "A photo, a post, and an outreach email that put your catering in front of offices nearby.",
    why: "One catering order can be worth a full night of tables.",
    expectation: "Catering leads come in slowly at first, then in batches around events.",
    heroImage: null,
  },
  reviewsplan: {
    id: 'reviewsplan',
    title: "Boost reviews and rating",
    tagline: "Review-request system set up, plus the first asks",
    description: "People check your stars before they check your menu.",
    promise: "A review system set up for you, plus the first asks.",
    why: "People check your stars before they check your menu.",
    expectation: "Fresh reviews usually start showing up within a few weeks of asking.",
    heroImage: null,
  },
  reel: {
    id: 'reel',
    title: "A short video",
    tagline: "A reel for Instagram and TikTok",
    description: "Short video is the easiest way for new people to see your food.",
    promise: "A short video of your food, made for Instagram and TikTok.",
    why: "Short video is the easiest way for new people to see your food.",
    expectation: "One reel is one at-bat. Posting steadily is what adds up.",
    heroImage: null,
  },
  story: {
    id: 'story',
    title: "A story",
    tagline: "A quick post to stay top of mind",
    description: "Stories keep you in front of the people who already follow you.",
    promise: "A quick story post to stay top of mind.",
    why: "Stories keep you in front of the people who already follow you.",
    expectation: "A story lasts a day. It works best as a steady habit.",
    heroImage: null,
  },
  graphic: {
    id: 'graphic',
    title: "A social media post",
    tagline: "A designed post: graphic, carousel, or photo",
    description: "A clean graphic makes an announcement look official and easy to share.",
    promise: "A designed post with your message, sized for where it goes.",
    why: "A clean graphic makes an announcement look official and easy to share.",
    expectation: "A graphic carries your message. Reach depends on where you share it.",
    heroImage: null,
  },
  dish: {
    id: 'dish',
    title: "Feature a dish",
    tagline: "Show off one of your best plates",
    description: "People order with their eyes. One great dish photo does real work.",
    promise: "Your best plate, shot and posted so people want it.",
    why: "People order with their eyes. One great dish photo does real work.",
    expectation: "A strong dish post earns saves and shares more than instant orders.",
    heroImage: null,
  },
  edit: {
    id: 'edit',
    title: "Edit my footage",
    tagline: "Send us your clips and photos, we cut and polish them",
    description: "You already filmed it. Editing is the part that takes the time.",
    promise: "Send your clips and photos. We cut and polish them into a reel and edited shots.",
    why: "You already filmed it. Editing is the part that takes the time.",
    expectation: "The final cut is only as strong as the footage you send.",
    heroImage: null,
  },
  gpost: {
    id: 'gpost',
    title: "A Google Business post",
    tagline: "An update on your listing, seen in Search and Maps",
    description: "Google posts show up right where people decide where to eat.",
    promise: "An update on your Google listing, seen in Search and Maps.",
    why: "Google posts show up right where people decide where to eat.",
    expectation: "A post keeps your listing fresh. It works best done often.",
    heroImage: null,
  },
  listings: {
    id: 'listings',
    title: "Get listed everywhere",
    tagline: "Yelp, Apple Maps and more: synced and correct",
    description: "Wrong hours on one app can cost you a table tonight.",
    promise: "Your info synced and correct on Yelp, Apple Maps, Facebook, and more.",
    why: "Wrong hours on one app can cost you a table tonight.",
    expectation: "Listings update within days. Steady syncing keeps them right.",
    heroImage: null,
  },
  website: {
    id: 'website',
    title: "Fix your website and menu",
    tagline: "Fast, correct, and easy to order from",
    description: "Most guests check your site before they come. A slow or broken page turns them away.",
    promise: "Your site and menu made fast, correct, and easy to order from.",
    why: "Most guests check your site before they come. A slow or broken page turns them away.",
    expectation: "A fixed site removes friction. It does not create demand by itself.",
    heroImage: null,
  },
  localseo: {
    id: 'localseo',
    title: "Show up in local search",
    tagline: "Be the answer when neighbors search food near me",
    description: "The spots at the top of local search get the call.",
    promise: "Show up when neighbors search for food near me.",
    why: "The spots at the top of local search get the call.",
    expectation: "Local search gains usually take one to three months to show.",
    heroImage: null,
  },
  delivery: {
    id: 'delivery',
    title: "Tune up your delivery apps",
    tagline: "Photos, menu and hours fixed on your delivery pages",
    description: "Better photos and a clean menu lift delivery orders from the same traffic.",
    promise: "Photos, menus, and promos fixed up on your delivery apps.",
    why: "Better photos and a clean menu lift delivery orders from the same traffic.",
    expectation: "Delivery pages update fast. Ranking gains take longer.",
    heroImage: null,
  },
  nextdoor: {
    id: 'nextdoor',
    title: "Get known on Nextdoor",
    tagline: "Your neighborhood feed, kept active for you",
    description: "Nextdoor reaches the people who live closest to you.",
    promise: "Your Nextdoor page set up and your neighborhood kept warm for you.",
    why: "Nextdoor reaches the people who live closest to you.",
    expectation: "Neighborhood word of mouth builds slowly and sticks.",
    heroImage: null,
  },
  promoevent: {
    id: 'promoevent',
    title: "Promote an event",
    tagline: "Fill seats for a night, a holiday, a tasting",
    description: "Events fill when people hear about them more than once.",
    promise: "A build-up for your event: tease it, invite your list, push hard on the day.",
    why: "Events fill when people hear about them more than once.",
    expectation: "Turnout follows how early the push starts.",
    heroImage: null,
  },
  launch: {
    id: 'launch',
    title: "Launch a special",
    tagline: "Roll out a limited-time or seasonal item",
    description: "A new item deserves more than one quiet post.",
    promise: "A real launch for your new item: tease, drop day, follow-up.",
    why: "A new item deserves more than one quiet post.",
    expectation: "Launch buzz peaks on drop day. The follow-up keeps it alive.",
    heroImage: null,
  },
  creator: {
    id: 'creator',
    title: "Work with a creator",
    tagline: "A local food creator visits and posts to their audience",
    description: "A creator post reaches people who trust their taste.",
    promise: "A local food creator visits and posts you to their audience.",
    why: "A creator post reaches people who trust their taste.",
    expectation: "Results depend on the creator, their reach, and the timing.",
    heroImage: null,
  },
  welcome: {
    id: 'welcome',
    title: "Welcome new subscribers",
    tagline: "Greets every signup automatically, ends with a come-back nudge",
    description: "The first message is what sets up the second visit.",
    promise: "Every new subscriber gets a warm hello series, set up once.",
    why: "The first message is what sets up the second visit.",
    expectation: "This runs on its own after setup, one signup at a time.",
    heroImage: null,
  },
  news: {
    id: 'news',
    title: "Monthly newsletter",
    tagline: "We write and send one good email every month",
    description: "A monthly email keeps you in mind without being noisy.",
    promise: "One good email a month, written and sent for you.",
    why: "A monthly email keeps you in mind without being noisy.",
    expectation: "Newsletters pay off over months, not days.",
    heroImage: null,
  },
  slowoffer: {
    id: 'slowoffer',
    title: "Slow-night offer",
    tagline: "An email and text to fill quiet days",
    description: "A direct nudge to your own list is the fastest lever you have.",
    promise: "An email and text offer, good on your quiet days.",
    why: "A direct nudge to your own list is the fastest lever you have.",
    expectation: "Sends work when the list is real. Results land within days.",
    heroImage: null,
  },
  birthday: {
    id: 'birthday',
    title: "Birthday treat",
    tagline: "Set up once, every guest gets a treat automatically",
    description: "Birthdays bring groups. The treat pays for the table.",
    promise: "Set up once. Every guest gets a treat on their birthday.",
    why: "Birthdays bring groups. The treat pays for the table.",
    expectation: "This grows as your guest list grows.",
    heroImage: null,
  },
  earlyaccess: {
    id: 'earlyaccess',
    title: "Early access for regulars",
    tagline: "Let your list get first dibs",
    description: "First dibs makes joining your list feel worth it.",
    promise: "Your list gets first dibs before everyone else.",
    why: "First dibs makes joining your list feel worth it.",
    expectation: "Works best when the thing they get early is genuinely good.",
    heroImage: null,
  },
  shoot: {
    id: 'shoot',
    title: "Book a shoot",
    tagline: "A pro comes to you. A photo library plus a reel, yours to keep",
    description: "Good photos get reused everywhere: menu, Google, delivery apps, social.",
    promise: "A pro comes to you. A photo library plus a reel, yours to keep.",
    why: "Good photos get reused everywhere: menu, Google, delivery apps, social.",
    expectation: "You keep the files and can use them for months.",
    heroImage: null,
  },
  gbp: {
    id: 'gbp',
    title: "Polish your Google profile",
    tagline: "Profile fixed top to bottom: photos, hours, menu, info",
    description: "Your Google profile is the first thing most people check before they visit. A complete, current one is more likely to show up in search and makes it easy to pick you.",
    promise: "Your Google profile fixed top to bottom: photos, hours, menu, info.",
    why: "Your Google listing is the first thing most new guests see.",
    expectation: "A complete profile helps you show up in more nearby searches.",
    heroImage: null,
  },
  reviewsreply: {
    id: 'reviewsreply',
    title: "Reply to reviews",
    tagline: "Every review gets a drafted reply, monthly",
    description: "Replies show new guests that someone is home.",
    promise: "Every review gets a drafted reply. You approve each one.",
    why: "Replies show new guests that someone is home.",
    expectation: "Steady replies build trust over time. There is no overnight jump.",
    heroImage: null,
  },
  qr: {
    id: 'qr',
    title: "Add a table QR",
    tagline: "Design, print files, and a signup page wired to your list",
    description: "The people at your tables are the easiest list you will ever build.",
    promise: "A table QR that turns diners into your guest list, designed and wired up.",
    why: "The people at your tables are the easiest list you will ever build.",
    expectation: "Signups track your foot traffic, a few each night.",
    heroImage: null,
  },
  friction: {
    id: 'friction',
    title: "Smooth out ordering",
    tagline: "Get the order button working on your Google listing",
    description: "Every extra tap loses a hungry person.",
    promise: "The order and reserve buttons on your Google listing, working and tested.",
    why: "Every extra tap loses a hungry person.",
    expectation: "Smoother ordering converts the traffic you already have.",
    heroImage: null,
  },
  giftcard: {
    id: 'giftcard',
    title: "Push gift cards",
    tagline: "Sell gift cards for gifts and slow seasons",
    description: "Gift cards are money in the bank before the meal is served.",
    promise: "Gift cards set up and pushed for gifts and slow seasons.",
    why: "Gift cards are money in the bank before the meal is served.",
    expectation: "Gift card sales spike near holidays and slow down after.",
    heroImage: null,
  },
  ticket: {
    id: 'ticket',
    title: "Run a ticketed event",
    tagline: "Sell spots to a dinner or class",
    description: "Paid seats mean the night is full before it starts.",
    promise: "Ticket sales set up and promoted for your dinner or class.",
    why: "Paid seats mean the night is full before it starts.",
    expectation: "Ticket sales come early and late, with a lull in the middle.",
    heroImage: null,
  },
  winback: {
    id: 'winback',
    title: "Win back quiet guests",
    tagline: "One email and one text to guests you haven't seen lately",
    description: "Quiet guests have not left. Most just need a nudge.",
    promise: "One email and one text to guests you have not seen lately.",
    why: "Quiet guests have not left. Most just need a nudge.",
    expectation: "A win-back send gets its replies in the first few days.",
    heroImage: null,
  },
  direct: {
    id: 'direct',
    title: "Get orders direct",
    tagline: "Delivery apps take a cut of every order. Move regulars to direct",
    description: "Delivery apps take a cut of every order. Direct orders keep it with you.",
    promise: "Move your regulars from delivery apps to ordering direct.",
    why: "Delivery apps take a cut of every order. Direct orders keep it with you.",
    expectation: "The switch happens one regular at a time.",
    heroImage: null,
  },
}

/** Loose lookup for the untyped JSX render layer; null when the id is unknown. */
export function campaignContent(itemId: string): CampaignContent | null {
  return (CAMPAIGN_CONTENT as Record<string, CampaignContent | undefined>)[itemId] ?? null
}

/** The shape the product page has always consumed (was create-catalog-content.ts). */
export interface PdpCopy {
  /** One-line promise under the title: what this does for the owner, plainly. */
  promise: string
  /** Fallback "why this" when whyFor() has no real signal. Never states a number. */
  why: string
  /** Honest expectation: one small, true sentence about how results tend to land. */
  expect: string
}

/** Copy for a card by id (loose lookup for the untyped JSX; null when the id is unknown). */
export function pdpCopy(itemId: string): PdpCopy | null {
  const c = campaignContent(itemId)
  return c ? { promise: c.promise, why: c.why, expect: c.expectation } : null
}
