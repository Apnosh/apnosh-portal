/**
 * Campaign catalog (in progress) — the services an owner can order, designed
 * fresh with the owner, section by section.
 *
 * The sections are split on ONE clean axis — the kind of work — with cadence as
 * a separate tag, so nothing is subjective:
 *   - Setup    = one-time TECHNICAL groundwork (plumbing): claim, connect, wire,
 *                stand up, import, track, test. An operator does it.
 *   - Creative = the CRAFT: design, writing, shooting. A designer/writer/shooter
 *                does it. Can be one-time (logo, website design) or ongoing (reels).
 *   Every service also carries `cadence` (one-time | ongoing).
 *
 * Split rule for half-and-half work (a website, a menu): the stand-it-up part is
 * Setup, the design + write part is Creative. Listings stay whole in Setup — you
 * upload the same photos everywhere rather than re-crafting per listing.
 *
 *   - Manage & maintain = recurring retainers: managed programs that move the
 *                funnel, plus upkeep (hosting/subscriptions) marked `upkeep` with
 *                no funnel metric.
 *
 * Distribution is NOT its own section: posting/boosting a creative piece is an
 * add-on on that piece, and the ongoing version is bundled into a Managed program.
 *
 * Shape: Section > Category > Service. Still to come: Offer, Measure.
 * No prices yet on purpose — pricing is a separate pass and needs owner sign-off.
 */

/** How broadly a service applies. */
export type ServiceTier = 'core' | 'conditional'

/** Photo/video only: 'shoot' needs an on-site capture day; 'edit' works from
 *  footage the restaurant already has. */
export type ProductionNeed = 'shoot' | 'edit'

/** How often the work happens. Orthogonal to the section (a one-time thing can be
 *  Creative, an ongoing thing can be Distribution, etc.). */
export type Cadence = 'one-time' | 'ongoing'

export interface Service {
  /** stable id, unique within its category */
  id: string
  /** owner-facing name */
  name: string
  /** one line: the work, plainly */
  what: string
  /** optional finer display group inside a category (readability only) */
  group?: string
  /** 'core' = nearly every restaurant; 'conditional' = only when `when` is true */
  tier: ServiceTier
  /** for conditional services, the trigger that makes it relevant */
  when?: string
  /** photo/video only: needs an on-site shoot, or edit-only from footage */
  needs?: ProductionNeed
  /** one-time vs ongoing (a tag, not a section) */
  cadence: Cadence
  /** true for pure upkeep (hosting, subscriptions) that keeps things running but
   *  maps to NO funnel metric, so it never shows up in campaign results. */
  upkeep?: boolean
}

export interface Category {
  id: string
  label: string
  services: Service[]
}

export interface Section {
  id: string
  label: string
  categories: Category[]
}

// ── SETUP ──────────────────────────────────────────────────────────────────
// One-time TECHNICAL plumbing. Claim, connect, wire, stand up, import, track,
// test. The craft that feeds these (photos, copy, design) lives in Creative.
export const SETUP_SECTION: Section = {
  id: 'setup',
  label: 'Setup',
  categories: [
    {
      id: 'get-found',
      label: 'Get found',
      services: [
        // Maps & search listings — claim, verify, enter your info, upload the photos Creative made
        { id: 'gbp', name: 'Google Business Profile', what: 'Claim, verify, and set up your Google profile with your info and photos.', group: 'Maps & search', tier: 'core', cadence: 'one-time' },
        { id: 'apple-maps', name: 'Apple Maps', what: 'Claim and set up your listing in Apple Business Connect.', group: 'Maps & search', tier: 'core', cadence: 'one-time' },
        { id: 'bing-places', name: 'Bing Places', what: 'Claim and set up your Bing Places listing.', group: 'Maps & search', tier: 'core', cadence: 'one-time' },

        // Review & discovery sites
        { id: 'yelp', name: 'Yelp', what: 'Claim and set up your Yelp business page.', group: 'Review & discovery', tier: 'core', cadence: 'one-time' },
        { id: 'tripadvisor', name: 'TripAdvisor', what: 'Claim and set up your TripAdvisor listing.', group: 'Review & discovery', tier: 'conditional', when: 'tourist or destination spot', cadence: 'one-time' },
        { id: 'nextdoor', name: 'Nextdoor', what: 'Set up your Nextdoor business page.', group: 'Review & discovery', tier: 'conditional', when: 'neighborhood-driven', cadence: 'one-time' },

        // Social profiles — the technical set-up + connect (the content that fills them is Creative)
        { id: 'instagram', name: 'Instagram', what: 'Set up and connect your Instagram business profile.', group: 'Social', tier: 'core', cadence: 'one-time' },
        { id: 'tiktok', name: 'TikTok', what: 'Set up and connect your TikTok business account.', group: 'Social', tier: 'core', cadence: 'one-time' },
        { id: 'facebook', name: 'Facebook Page', what: 'Set up and connect your Facebook Page.', group: 'Social', tier: 'core', cadence: 'one-time' },
        { id: 'youtube', name: 'YouTube', what: 'Set up your YouTube channel.', group: 'Social', tier: 'conditional', when: 'will post longer video', cadence: 'one-time' },
        { id: 'pinterest', name: 'Pinterest', what: 'Set up your Pinterest business profile.', group: 'Social', tier: 'conditional', when: 'bakery or aesthetic-forward', cadence: 'one-time' },

        // Delivery marketplaces
        { id: 'doordash', name: 'DoorDash listing', what: 'Set up your DoorDash storefront.', group: 'Delivery', tier: 'conditional', when: 'you deliver', cadence: 'one-time' },
        { id: 'ubereats', name: 'Uber Eats listing', what: 'Set up your Uber Eats storefront.', group: 'Delivery', tier: 'conditional', when: 'you deliver', cadence: 'one-time' },
        { id: 'grubhub', name: 'Grubhub listing', what: 'Set up your Grubhub storefront.', group: 'Delivery', tier: 'conditional', when: 'you deliver', cadence: 'one-time' },

        // Reservation networks
        { id: 'opentable', name: 'OpenTable', what: 'Set up your OpenTable restaurant profile.', group: 'Reservations', tier: 'conditional', when: 'you take reservations', cadence: 'one-time' },
        { id: 'resy', name: 'Resy', what: 'Set up your Resy restaurant profile.', group: 'Reservations', tier: 'conditional', when: 'you take reservations', cadence: 'one-time' },

        // Connective tissue
        { id: 'local-seo', name: 'Local SEO foundations', what: 'Consistent name, address, phone, and citations so the listings above rank.', group: 'Foundations', tier: 'core', cadence: 'one-time' },
      ],
    },
    {
      id: 'home-base',
      label: 'Home base',
      // The stand-it-up part only. The design + copy of the site/menu is in Creative.
      services: [
        { id: 'website-setup', name: 'Website setup', what: 'Stand up your website and point your domain at it.', tier: 'core', cadence: 'one-time' },
        { id: 'menu-setup', name: 'Online menu setup', what: 'Set up your online menu as structured, current data across your site and Google.', tier: 'core', cadence: 'one-time' },
        { id: 'ordering-setup', name: 'Direct online ordering', what: 'Set up direct online ordering on your own site.', tier: 'conditional', when: 'wants direct orders', cadence: 'one-time' },
        { id: 'reservation-setup', name: 'Reservation setup', what: 'Connect and set up your booking/reservation tool.', tier: 'conditional', when: 'takes reservations', cadence: 'one-time' },
      ],
    },
    {
      id: 'your-list',
      label: 'Your list',
      services: [
        { id: 'list-standup', name: 'Stand up your contact list', what: 'Set up the contact list / CRM everything sends from.', tier: 'core', cadence: 'one-time' },
        { id: 'import-contacts', name: 'Import your contacts', what: 'Pull in existing contacts from POS, reservations, and past orders.', tier: 'core', cadence: 'one-time' },
        { id: 'capture-points', name: 'Set up capture points', what: 'Table QR, WiFi signup, and checkout opt-in so the list keeps growing.', tier: 'core', cadence: 'one-time' },
        { id: 'consent', name: 'Consent & compliance', what: 'Handle SMS and email opt-in and compliance the right way.', tier: 'core', cadence: 'one-time' },
      ],
    },
    {
      id: 'plumbing',
      label: 'Plumbing',
      services: [
        { id: 'connect-accounts', name: 'Connect your accounts', what: 'Connect Instagram, Facebook, Google, your POS/ordering, and your email + text sender.', tier: 'core', cadence: 'one-time' },
        { id: 'tracking', name: 'Tracking & attribution', what: 'Set up tracked links and attribution so results are real, not guessed.', tier: 'core', cadence: 'one-time' },
        { id: 'automations', name: 'Core automations', what: 'Wire the always-on flows: welcome, review request, birthday.', tier: 'core', cadence: 'one-time' },
        { id: 'test-flows', name: 'Test end-to-end', what: 'Confirm every connected piece actually fires.', tier: 'core', cadence: 'one-time' },
      ],
    },
  ],
}

// ── CREATIVE ───────────────────────────────────────────────────────────────
// The craft: design, writing, shooting. One-time (logo, website design) or
// ongoing (reels, captions) — cadence is the tag. Not split by platform (one
// video posts everywhere); photo/video IS split by shoot vs edit-only.
export const CREATIVE_SECTION: Section = {
  id: 'creative',
  label: 'Creative',
  categories: [
    {
      id: 'photo-video',
      label: 'Photo & video',
      services: [
        { id: 'short-video-shoot', name: 'Short-form video (from a shoot)', what: 'We shoot and cut a vertical Reel or TikTok.', tier: 'core', needs: 'shoot', cadence: 'ongoing' },
        { id: 'short-video-edit', name: 'Short-form video (edit only)', what: 'We cut a vertical Reel or TikTok from footage you already have.', tier: 'core', needs: 'edit', cadence: 'ongoing' },
        { id: 'long-video-shoot', name: 'Longer-form video (from a shoot)', what: 'We shoot and produce a longer video, like a menu tour or story piece.', tier: 'conditional', when: 'wants longer video', needs: 'shoot', cadence: 'ongoing' },
        { id: 'long-video-edit', name: 'Longer-form video (edit only)', what: 'We produce a longer video from your existing footage.', tier: 'conditional', when: 'wants longer video', needs: 'edit', cadence: 'ongoing' },
        { id: 'photo-set-shoot', name: 'Photo set (from a shoot)', what: 'An on-site shoot, then edited, delivered photos of your food and space.', tier: 'core', needs: 'shoot', cadence: 'ongoing' },
        { id: 'photo-set-edit', name: 'Photo set (edit only)', what: 'We select, edit, and deliver from photos you already have.', tier: 'core', needs: 'edit', cadence: 'ongoing' },
      ],
    },
    {
      id: 'graphics',
      label: 'Graphics & design',
      services: [
        { id: 'feed-graphic', name: 'Feed graphic / flyer', what: 'A designed post or flyer.', tier: 'core', cadence: 'ongoing' },
        { id: 'story-graphic', name: 'Story graphic', what: 'A designed Instagram or Facebook story.', tier: 'core', cadence: 'ongoing' },
        { id: 'printed-card', name: 'Printed card', what: 'A table tent, QR card, or referral card, designed to print.', tier: 'conditional', when: 'wants in-store print', cadence: 'one-time' },
        { id: 'menu-design', name: 'Menu design', what: 'A designed menu, print or digital.', tier: 'conditional', when: 'menu needs a redesign', cadence: 'one-time' },
        { id: 'website-design', name: 'Website design', what: 'Design the look and layout of your site.', tier: 'conditional', when: 'site needs design', cadence: 'one-time' },
      ],
    },
    {
      id: 'written',
      label: 'Written copy',
      services: [
        { id: 'post-caption', name: 'Social post caption', what: 'Caption for an Instagram, Facebook, or TikTok post.', tier: 'core', cadence: 'ongoing' },
        { id: 'google-post', name: 'Google post', what: 'A written Google Business Profile post.', tier: 'core', cadence: 'ongoing' },
        { id: 'email', name: 'Email', what: 'A written and designed email.', tier: 'core', cadence: 'ongoing' },
        { id: 'sms', name: 'Text / SMS', what: 'A written text message.', tier: 'core', cadence: 'ongoing' },
        { id: 'offer-copy', name: 'Offer copy', what: 'The wording for a deal or promotion.', tier: 'core', cadence: 'ongoing' },
        { id: 'review-reply', name: 'Review reply', what: 'A written reply to a customer review.', tier: 'core', cadence: 'ongoing' },
        { id: 'item-descriptions', name: 'Menu item descriptions', what: 'Appetizing descriptions for your menu items.', tier: 'conditional', when: 'menu needs copy', cadence: 'one-time' },
        { id: 'website-copy', name: 'Website copy', what: 'Write the words on your site.', tier: 'conditional', when: 'site needs copy', cadence: 'one-time' },
        { id: 'b2b-proposal', name: 'Catering / B2B proposal', what: 'A proposal template for catering or corporate leads.', tier: 'conditional', when: 'does catering', cadence: 'one-time' },
      ],
    },
    {
      id: 'brand',
      label: 'Brand kit',
      // Craft, but done once — moved here from Setup (it takes design skill, not plumbing).
      services: [
        { id: 'logo', name: 'Logo', what: 'Design your logo.', tier: 'conditional', when: 'no logo or a dated one', cadence: 'one-time' },
        { id: 'colors-fonts', name: 'Colors & fonts', what: 'Set your brand colors and fonts.', tier: 'core', cadence: 'one-time' },
        { id: 'brand-voice', name: 'Brand voice', what: 'A short guide to how you sound.', tier: 'core', cadence: 'one-time' },
        { id: 'photo-style', name: 'Photo style guide', what: 'The look your photos should share.', tier: 'core', cadence: 'one-time' },
        { id: 'asset-library', name: 'Asset library', what: 'Organize your logos, photos, and templates in one place to pull from.', tier: 'core', cadence: 'one-time' },
      ],
    },
    {
      id: 'ideas',
      label: 'Ideas',
      services: [
        { id: 'content-ideas', name: 'Content ideas & angles', what: 'A batch of promo ideas, story angles, and video concepts to pull from.', tier: 'core', cadence: 'ongoing' },
      ],
    },
  ],
}

// ── MANAGE & MAINTAIN ────────────────────────────────────────────────────────
// Recurring retainers and upkeep. Two honest kinds:
//   - Managed programs: ongoing EXECUTION sold monthly. These DO move the funnel
//     (they are how content + ads get out consistently), and they bundle in the
//     per-piece distribution add-ons (posting, boosting) so you never pay twice.
//   - Upkeep: keep-the-lights-on with NO funnel metric (marked `upkeep`), so it
//     never pretends to drive a number it can't.
export const MANAGE_SECTION: Section = {
  id: 'manage',
  label: 'Manage & maintain',
  categories: [
    {
      id: 'managed-programs',
      label: 'Managed programs',
      services: [
        { id: 'social-media-mgmt', name: 'Social media management', what: 'Plan, make, and post a set number of pieces a month to all or selected socials, plus community replies.', tier: 'core', cadence: 'ongoing' },
        { id: 'ads-mgmt', name: 'Paid ads management', what: 'Set up, run, and optimize your paid ads. Ad spend is billed separately.', tier: 'conditional', when: 'runs paid ads', cadence: 'ongoing' },
        { id: 'email-sms-program', name: 'Email & SMS program', what: 'A steady drumbeat of emails and texts to your list.', tier: 'conditional', when: 'has a contact list', cadence: 'ongoing' },
        { id: 'review-mgmt', name: 'Review management', what: 'Keep asking for reviews and replying to them, every week.', tier: 'core', cadence: 'ongoing' },
      ],
    },
    {
      id: 'upkeep',
      label: 'Upkeep',
      services: [
        { id: 'website-hosting', name: 'Website hosting & maintenance', what: 'Keep your site online, fast, and up to date.', tier: 'conditional', when: 'site hosted with us', cadence: 'ongoing', upkeep: true },
        { id: 'tool-subscriptions', name: 'Tool subscriptions', what: 'The ongoing software your marketing runs on (email, texts, ordering, CRM).', tier: 'core', cadence: 'ongoing', upkeep: true },
        { id: 'listing-monitoring', name: 'Listing monitoring', what: 'Keep your listings accurate as hours, menu, and info change.', tier: 'core', cadence: 'ongoing', upkeep: true },
      ],
    },
  ],
}

/** Every section of the new catalog, in order. */
export const CATALOG: Section[] = [SETUP_SECTION, CREATIVE_SECTION, MANAGE_SECTION]
