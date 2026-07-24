/**
 * CREATIVE CATALOG — the standard menu of creative products Apnosh defines, per craft.
 *
 * This is the piece that keeps the creative marketplace honest and comparable. A creator does NOT
 * invent a bespoke package from a blank box; they pick a standard product ("Dish Photo Day"),
 * then set their own price, add their own portfolio, and optionally scale it into tiers. So a
 * restaurant browsing "photographers" sees the SAME product from several creators and compares the
 * one thing that should vary (their eye, their price, their reviews) with the deliverable held
 * fixed. Taste is subjective; the spec is not.
 *
 * A product carries the objective spec; the creator carries the price and the portfolio. Tiers are
 * templates of SCOPE (how many, how much, how fast), never quality — the same creator, more of the
 * work. A product with no tiers is the simple one-price case. `quotable` products can also be sold
 * "by quote" for anything off the standard shape.
 *
 * Each product also declares its BOOKING SHAPE, which decides how a restaurant books it:
 *   scheduled  someone comes on-site, so it needs a real time  → a calendar of open slots
 *   async      a deliverable with no visit                     → a short brief + a delivered-by date
 *   recurring  an ongoing monthly plan                         → a start date
 * and the 2-3 INTAKE questions to ask at booking, so the creator arrives (or starts) already knowing
 * what they need. One booking screen for everything is what creates the back-and-forth; matching the
 * flow to the shape is what removes it.
 *
 * Pure data + small lookups, no I/O. The editor seeds a new package from a product here; the store
 * reads a published package back through the shared package model. This file is the source of truth
 * for what a "standard creative product" IS.
 */

import { slugify, type PackageCategory, type ListingType, type BillingPeriod, type CreatorPackage, type PackageTier, type BookingShape, type IntakeItem } from './package'

// BookingShape's canonical home is now package.ts (creators author it per offer). Re-exported here
// so existing importers (store-cards) keep working unchanged.
export type { BookingShape }

/** One tier template: a name and the scope at that level. No price — the creator sets that. */
export interface CreativeTier {
  /** Owner-facing tier name, product-specific ("3 reels", "Full day", "Standard"). */
  name: string
  /** What the buyer gets at this tier. Becomes the tier's deliverables when seeded. */
  scope: string[]
  /** One short line to help a creator (and later a buyer) tell tiers apart. */
  blurb?: string
}

/** One question asked at booking, so the creator starts ready. Kept to 2-3 per product. */
export interface IntakeQuestion {
  id: string
  /** The question, in the restaurant's words. */
  label: string
  /** Placeholder / helper text. */
  hint?: string
  /** A required question blocks the booking until answered; optional ones do not. */
  required?: boolean
}

/** A standard creative product. Apnosh authors these; creators offer their version. */
export interface CreativeProduct {
  /** Stable id, unique across the catalog. Stored on the package as productId. */
  id: string
  craft: PackageCategory
  /** Plain product name the store and editor both show. */
  name: string
  /** One sentence: what this product is, in a restaurant owner's words. */
  summary: string
  /** How it is sold. Most creative work is one_off; management is a subscription. */
  listingType: ListingType
  billingPeriod: BillingPeriod
  /** How it gets booked (drives the product page's booking flow). */
  bookingShape: BookingShape
  /** The 2-3 things to ask the restaurant at booking, so the creator starts ready. */
  intake: IntakeQuestion[]
  /**
   * Tier templates, scope-only. 0 = a single-price product (creator sets one price). 2-3 = a
   * tiered product (creator sets a price per tier). Tiers scale scope, never quality.
   */
  tiers: CreativeTier[]
  /** The baseline deliverables for a single-price product (used only when tiers is empty). */
  deliverables: string[]
  /** Common add-ons for this product. Labels only; the creator sets each price. */
  suggestedOptions: string[]
  /** Whether this product can also be offered "by quote" for off-standard scope. */
  quotable: boolean
}

/**
 * THE MENU. Two to three products per creative craft, each a real, deliverable-based unit of
 * food-marketing work. Kept deliberately short and honest: every line is a thing a creator can
 * actually hand over, not a vague promise.
 */
export const CREATIVE_PRODUCTS: CreativeProduct[] = [
  /* ── Videographer — SHOOT (video) ─────────────────────────────── */
  {
    id: 'reel-pack', craft: 'videographer', name: 'Reel Pack',
    summary: 'Short vertical reels shot and edited at your restaurant, ready to post.',
    listingType: 'one_off', billingPeriod: 'one_time',
    bookingShape: 'scheduled',
    intake: [
      { id: 'feature', label: 'What should we film?', hint: 'A signature dish, the space, the team…', required: true },
      { id: 'access', label: 'Best time to be there?', hint: 'Before you open, a slow afternoon…' },
      { id: 'avoid', label: 'Anything to avoid?', hint: 'Optional' },
    ],
    tiers: [
      { name: '2 reels', scope: ['2 vertical reels', 'Shot and edited on location'], blurb: 'A quick, steady drop of content.' },
      { name: '3 reels', scope: ['3 vertical reels', '1 hero cut for ads', 'Shot and edited on location'], blurb: 'The usual pick: enough to test what lands.' },
      { name: '5 reels', scope: ['5 vertical reels', '1 hero cut for ads', 'Captions burned in', 'Shot and edited on location'], blurb: 'A full month of reels in one visit.' },
    ],
    deliverables: [],
    suggestedOptions: ['Extra reel', 'Rush in 48 hours', 'Raw footage handoff'],
    quotable: true,
  },
  {
    id: 'content-day', craft: 'videographer', name: 'Full Content Day',
    summary: 'A shoot day that captures a batch of video at once, so you post for weeks off one visit.',
    listingType: 'one_off', billingPeriod: 'one_time',
    bookingShape: 'scheduled',
    intake: [
      { id: 'shots', label: 'What do you want to come away with?', hint: 'Dishes, space, team, a specific promo…', required: true },
      { id: 'access', label: 'Best day and time to film?', hint: 'When is the kitchen and room free?' },
      { id: 'avoid', label: 'Anything to avoid?', hint: 'Optional' },
    ],
    tiers: [
      { name: 'Half day', scope: ['Up to 4 hours on site', 'About 4 finished reels'], blurb: 'A focused morning or afternoon.' },
      { name: 'Full day', scope: ['Up to 8 hours on site', 'About 8 finished reels', 'A handful of photo stills'], blurb: 'Everything in one day: menu, space, team.' },
    ],
    deliverables: [],
    suggestedOptions: ['Second shooter', 'Same-week edit', 'Add photo edits'],
    quotable: true,
  },
  {
    id: 'monthly-reels', craft: 'videographer', name: 'Monthly Reels',
    summary: 'A steady stream of reels every month, so your feed never goes quiet.',
    listingType: 'subscription', billingPeriod: 'monthly',
    bookingShape: 'recurring',
    intake: [
      { id: 'first', label: 'What should we film first?', hint: 'Your best seller, a new item…', required: true },
      { id: 'visit', label: 'Best day for a monthly visit?', hint: 'A slow weekday works well' },
      { id: 'goal', label: 'What are you going for?', hint: 'More followers, more orders…' },
    ],
    tiers: [
      { name: '2 a month', scope: ['2 reels every month', 'One short visit a month'], blurb: 'Keep the lights on.' },
      { name: '4 a month', scope: ['4 reels every month', 'One visit a month', 'A simple monthly plan'], blurb: 'A real, consistent presence.' },
    ],
    deliverables: [],
    suggestedOptions: ['Add a monthly photo set', 'Priority turnaround'],
    quotable: false,
  },

  /* ── Photographer — SHOOT (photo) ─────────────────────────────── */
  {
    id: 'dish-photo-day', craft: 'photographer', name: 'Dish Photo Day',
    summary: 'A shoot at your restaurant that makes the plate the hero, with a set of finished photos.',
    listingType: 'one_off', billingPeriod: 'one_time',
    bookingShape: 'scheduled',
    intake: [
      { id: 'dishes', label: 'Which dishes to feature?', hint: 'Your best sellers, a new item…', required: true },
      { id: 'kitchen', label: 'When can we get into the kitchen?', hint: 'Before service is ideal' },
      { id: 'avoid', label: 'Anything we should not shoot?', hint: 'Optional' },
    ],
    tiers: [
      { name: '10 photos', scope: ['10 edited photos', 'Your top dishes'], blurb: 'The hits, done right.' },
      { name: '20 photos', scope: ['20 edited photos', 'Shot list planned before the day'], blurb: 'Enough to cover a menu and a month of posts.' },
      { name: '35 photos', scope: ['35 edited photos', 'Shot list planned before the day', 'Drinks included'], blurb: 'The full spread, food and drinks.' },
    ],
    deliverables: [],
    suggestedOptions: ['Add your drinks menu', 'Same-week delivery', 'Lifestyle shots with guests'],
    quotable: true,
  },
  {
    id: 'menu-shoot', craft: 'photographer', name: 'Full Menu Shoot',
    summary: 'Every dish on your menu, shot clean and consistent for your site and delivery apps.',
    listingType: 'one_off', billingPeriod: 'one_time',
    bookingShape: 'scheduled',
    intake: [
      { id: 'menu', label: 'Share your current menu', hint: 'A photo or file so we plan the day', required: true },
      { id: 'kitchen', label: 'When can we get into the kitchen?', hint: 'We will need a few uninterrupted hours' },
    ],
    tiers: [
      { name: 'Up to 25 dishes', scope: ['One photo per dish, up to 25', 'Consistent white or on-brand background', 'Sized for web and delivery apps'] },
      { name: 'Up to 50 dishes', scope: ['One photo per dish, up to 50', 'Consistent background', 'Sized for web and delivery apps'] },
    ],
    deliverables: [],
    suggestedOptions: ['Two angles per dish', 'Rush delivery'],
    quotable: true,
  },
  {
    id: 'brand-photo-day', craft: 'photographer', name: 'Brand + Space Shoot',
    summary: 'Your room, your team, your atmosphere, so your brand looks like the real place.',
    listingType: 'one_off', billingPeriod: 'one_time',
    bookingShape: 'scheduled',
    intake: [
      { id: 'feel', label: 'What feeling are you going for?', hint: 'Cozy, lively, upscale…', required: true },
      { id: 'when', label: 'Best time for the room to look its best?', hint: 'Golden hour, before a rush…' },
      { id: 'team', label: 'Will the team be in the photos?', hint: 'Optional' },
    ],
    tiers: [],
    deliverables: ['A half-day shoot of your space and team', 'About 25 edited photos', 'A mix of interior, detail, and candid shots'],
    suggestedOptions: ['Add headshots for the team', 'Evening + daytime light'],
    quotable: true,
  },

  /* ── Food influencer — INFLUENCE ──────────────────────────────── */
  {
    id: 'tasting-post', craft: 'food_influencer', name: 'Tasting Visit + Post',
    summary: 'A local creator visits, tastes, and posts to their own audience to send real people your way.',
    listingType: 'one_off', billingPeriod: 'one_time',
    bookingShape: 'scheduled',
    intake: [
      { id: 'try', label: 'What should they try?', hint: 'Your signature dishes, a new item…', required: true },
      { id: 'when', label: 'Best day and time to visit?', hint: 'When you can host them well' },
      { id: 'highlight', label: 'Anything to highlight?', hint: 'A special, your patio, happy hour…' },
    ],
    tiers: [
      { name: 'Story set', scope: ['3 to 5 stories', 'Your location tagged', 'Link to your page'], blurb: 'A quick, honest first look.' },
      { name: 'Post + stories', scope: ['1 in-feed post', '3 stories', 'Your location tagged'], blurb: 'The usual pick: a post that stays up.' },
      { name: 'Reel + post', scope: ['1 reel to their audience', '1 in-feed post', '3 stories'], blurb: 'The most reach, a reel plus a post.' },
    ],
    deliverables: [],
    suggestedOptions: ['Whitelist for you to boost as an ad', 'Bring a photographer'],
    quotable: false,
  },
  {
    id: 'reel-collab', craft: 'food_influencer', name: 'Reel Collaboration',
    summary: 'A co-branded reel made for their audience and yours, posted to both.',
    listingType: 'one_off', billingPeriod: 'one_time',
    bookingShape: 'scheduled',
    intake: [
      { id: 'idea', label: 'What is the reel about?', hint: 'A dish, a story, a trend you like…', required: true },
      { id: 'when', label: 'Best day and time to film?', hint: 'When the restaurant looks its best' },
    ],
    tiers: [],
    deliverables: ['1 reel filmed at your restaurant', 'Posted as a collab to their audience and yours', 'You keep the reel to reuse'],
    suggestedOptions: ['Add a second reel', 'Whitelist for ads'],
    quotable: false,
  },

  /* ── Graphic designer — DESIGN ────────────────────────────────── */
  {
    id: 'menu-redesign', craft: 'graphic_designer', name: 'Menu Redesign',
    summary: 'A clean, on-brand menu that is easy to read and easy to update, print and digital.',
    listingType: 'one_off', billingPeriod: 'one_time',
    bookingShape: 'async',
    intake: [
      { id: 'menu', label: 'Share your current menu', hint: 'A photo or file to work from', required: true },
      { id: 'look', label: 'Brand colors or a look you like?', hint: 'A link or a few words' },
      { id: 'deadline', label: 'When do you need it?', hint: 'Optional' },
    ],
    tiers: [
      { name: 'One concept', scope: ['1 design concept', '2 rounds of changes', 'Print-ready files'], blurb: 'One strong direction, refined.' },
      { name: 'Two concepts', scope: ['2 design concepts to choose from', '3 rounds of changes', 'Print and digital files'], blurb: 'See two directions, pick the winner.' },
    ],
    deliverables: [],
    suggestedOptions: ['Add a takeout menu', 'Add a matching table card'],
    quotable: true,
  },
  {
    id: 'brand-refresh', craft: 'graphic_designer', name: 'Brand Refresh',
    summary: 'A tidy-up or rebuild of your look, so everything from your sign to your posts matches.',
    listingType: 'one_off', billingPeriod: 'one_time',
    bookingShape: 'async',
    intake: [
      { id: 'have', label: 'What do you have now?', hint: 'Logo, colors, anything you like or hate', required: true },
      { id: 'want', label: 'A look you are going for?', hint: 'A link or a few words' },
      { id: 'deadline', label: 'When do you need it?', hint: 'Optional' },
    ],
    tiers: [
      { name: 'Logo refresh', scope: ['A refreshed logo', 'Files for print and web'], blurb: 'Fix what you have.' },
      { name: 'Logo + basics', scope: ['A refreshed logo', 'A color palette', '3 social templates'], blurb: 'Logo plus the pieces you post with.' },
      { name: 'Mini brand kit', scope: ['A refreshed logo', 'A color palette and fonts', '6 social templates', 'A one-page brand guide'], blurb: 'A full, consistent look.' },
    ],
    deliverables: [],
    suggestedOptions: ['Add business cards', 'Add signage files'],
    quotable: true,
  },
  {
    id: 'promo-pack', craft: 'graphic_designer', name: 'Promo Graphics Pack',
    summary: 'A set of matching graphics for a special, an event, or a new item.',
    listingType: 'one_off', billingPeriod: 'one_time',
    bookingShape: 'async',
    intake: [
      { id: 'promo', label: 'What is the promo or item?', hint: 'The thing these graphics are for', required: true },
      { id: 'text', label: 'Any dates or text to include?', hint: 'Prices, times, a tagline…' },
      { id: 'colors', label: 'Brand colors or a look?', hint: 'Optional' },
    ],
    tiers: [],
    deliverables: ['5 matching graphics sized for posts and stories', '1 round of changes', 'Ready to post'],
    suggestedOptions: ['Add a printable flyer', 'Add a menu insert'],
    quotable: false,
  },

  /* ── Social manager — MANAGE ──────────────────────────────────── */
  {
    id: 'monthly-social', craft: 'social_manager', name: 'Monthly Social Management',
    summary: 'Someone runs your social every month: plans it, posts it, and keeps it consistent.',
    listingType: 'subscription', billingPeriod: 'monthly',
    bookingShape: 'recurring',
    intake: [
      { id: 'platforms', label: 'Which platforms?', hint: 'Instagram, TikTok, Facebook…', required: true },
      { id: 'goal', label: 'What are you going for?', hint: 'More followers, more orders, more bookings…' },
      { id: 'offlimits', label: 'Anything off-limits?', hint: 'Optional' },
    ],
    tiers: [
      { name: 'Lite', scope: ['8 posts a month', '1 platform', 'A simple monthly plan'], blurb: 'Keep one channel alive.' },
      { name: 'Standard', scope: ['12 posts a month', 'Stories through the week', '2 platforms', 'A monthly plan'], blurb: 'A real, active presence.' },
      { name: 'Plus', scope: ['20 posts a month', 'Stories through the week', '2 platforms', 'A monthly planning call'], blurb: 'Hands-off, with a person you talk to.' },
    ],
    deliverables: [],
    suggestedOptions: ['Add reply management', 'Add a monthly content shoot'],
    quotable: false,
  },
  {
    id: 'launch-month', craft: 'social_manager', name: 'Launch Month',
    summary: 'A focused first month to get your social off the ground before a steady plan.',
    listingType: 'one_off', billingPeriod: 'one_time',
    bookingShape: 'async',
    intake: [
      { id: 'platforms', label: 'Which platforms?', hint: 'Where you want to show up', required: true },
      { id: 'goal', label: 'What is the goal this month?', hint: 'Opening buzz, a grand reopening…' },
      { id: 'happening', label: 'Anything happening we should push?', hint: 'An event, a special…' },
    ],
    tiers: [],
    deliverables: ['Set up and tidy your profiles', 'A month of planned and posted content', 'A simple plan to hand off or continue'],
    suggestedOptions: ['Roll into a monthly plan'],
    quotable: false,
  },
]

/** The crafts that have a standard menu, in store order. */
export const CREATIVE_CRAFTS: PackageCategory[] = [
  'videographer', 'photographer', 'food_influencer', 'graphic_designer', 'social_manager',
]

const BY_ID = new Map(CREATIVE_PRODUCTS.map((p) => [p.id, p]))

/** Look up one product by id, or null. The one place the id → product mapping lives. */
export function productById(id: string | null | undefined): CreativeProduct | null {
  if (!id) return null
  return BY_ID.get(id) ?? null
}

/** Every product for a craft, in menu order. Empty when the craft has no standard menu. */
export function productsForCraft(craft: PackageCategory): CreativeProduct[] {
  return CREATIVE_PRODUCTS.filter((p) => p.craft === craft)
}

/** Whether a product is sold on a recurring basis (drives "monthly" vs "one-time" copy). */
export function isRecurring(p: CreativeProduct): boolean {
  return p.listingType === 'subscription'
}

/**
 * The booking shape for a craft, used as a fallback when a package has no productId (a legacy or
 * from-scratch package): shoots and visits are scheduled, design is async, management is recurring.
 */
export function bookingShapeForCategory(craft: PackageCategory): BookingShape {
  if (craft === 'graphic_designer') return 'async'
  if (craft === 'social_manager') return 'recurring'
  // photographer, videographer, food_influencer all involve an on-site visit.
  return 'scheduled'
}

/**
 * Seed a fresh editor package from a standard product. Fills in everything Apnosh defines (name,
 * craft, how it is sold, the spec, the tier scaffolds) and leaves everything the CREATOR owns
 * blank: the prices (per tier, or a base price for a single-price product) and the portfolio.
 * Suggested add-ons are NOT pre-filled — the editor offers them as quick-adds so a creator only
 * carries the ones they actually offer, each at their own price.
 */
export function packageFromProduct(p: CreativeProduct): CreatorPackage {
  const tiers: PackageTier[] = p.tiers.map((t, i) => ({
    id: `tier-${i}`,
    name: t.name,
    priceCents: 0, // the creator sets this
    deliverables: [...t.scope],
    ...(t.blurb ? { note: t.blurb } : {}),
  }))
  // Seed the creator's own intake from the product's, so a template arrives with sensible
  // questions they can then edit or delete. Photos are always theirs to add.
  const intake: IntakeItem[] = p.intake.map((q, i) => ({
    id: `ask-${i}`,
    label: q.label,
    ...(q.hint ? { hint: q.hint } : {}),
    ...(q.required ? { required: true } : {}),
  }))
  return {
    slug: slugify(p.name),
    title: p.name,
    category: p.craft,
    listingType: p.listingType,
    description: p.summary,
    productId: p.id,
    priceCents: null,
    billingPeriod: p.billingPeriod,
    deliverables: p.tiers.length ? [] : [...p.deliverables],
    tiers,
    options: [],
    turnaroundDays: null,
    revisions: null,
    photos: [],
    intake,
    bookingShape: p.bookingShape,
    active: false,
  }
}
