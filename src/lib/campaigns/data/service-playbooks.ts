/**
 * service-playbooks.ts — the hand-authored, per-service STEP TEMPLATE that turns a purchased service
 * line into a real work checklist. Keyed by serviceId, same authoring pattern as service-turnaround.ts
 * and service-channels (NOT in the generated catalog, so it survives regen and the catalog team can
 * tune it). A service is a repeatable recipe done hundreds of times, so the spine is templated, not
 * freeform; operators may add ad-hoc steps on top for edge cases, but the default is this list.
 *
 * Each step carries a short `lead` (one line: what the step is) plus `actions` — the concrete task
 * bullets an operator checks off to complete the step. The action bullets are the "exactly what to do"
 * list; a step is done when all its actions are checked (delivered still requires proof on the order).
 *
 * gbp-setup ("Show up on Google") + gbp-posts (the recurring GBP management cycle) are authored.
 * seedSteps() instantiates a template into the runtime jsonb the service_work_orders row stores.
 */

/** Who acts on a step: the Apnosh operator, the client (an input we need), or an external gate. */
export type StepActor = 'ops' | 'client' | 'gate'

/** One authored step in a service's playbook (the template — no runtime state). */
export interface PlaybookStep {
  id: string
  /** Client-facing short label ("Claim and verify your Google listing"). No em dashes. */
  label: string
  /** One-line summary of what this step is. */
  lead: string
  /** The concrete task bullets to complete the step. Each becomes a checkable item. */
  actions: string[]
  actor: StepActor
  /** The external turnaround gate this step can wait on (service-turnaround.ts kind), e.g. 'gbp-verify'. */
  gateKind?: string
  /** The readiness / service-needs key the client must satisfy before this step can proceed. */
  needsInput?: string
  /** What evidence marks it done, for the operator UI + the delivered proof pack. */
  proof?: 'link' | 'screenshot' | 'note' | 'none'
}

export interface ServicePlaybook {
  serviceId: string
  steps: PlaybookStep[]
  /** What the client receives on delivery. */
  deliverable: {
    /** Label for the live-result link the operator pastes (proof_url). */
    liveLinkLabel: string
    /** The metric the owner watches after, read from the catalog's metric. */
    metricLabel: string
  }
}

/** One runtime action bullet (stored in the step's jsonb): the task text plus its checked state. */
export interface WorkOrderAction {
  text: string
  done: boolean
  doneAt?: string
}

/** The runtime step, stored in service_work_orders.steps jsonb — the template plus live state. */
export interface WorkOrderStep {
  id: string
  label: string
  lead: string
  actions: WorkOrderAction[]
  actor: StepActor
  /** Derived from the actions (all done → 'done'); the operator toggles the bullets, not this. */
  status: 'todo' | 'done'
  gateKind?: string
  needsInput?: string
  proof?: 'link' | 'screenshot' | 'note' | 'none'
  proofUrl?: string
  doneAt?: string
}

export const SERVICE_PLAYBOOKS: Record<string, ServicePlaybook> = {
  // ── "Show up on Google" — the one-time GBP setup. Best-possible restaurant version, built from a
  //    5-lens expert workflow. Scope is deliberately drawn to NOT overlap neighboring sellable
  //    services: Order/Reserve-button wiring is google-food-order; ongoing posts + Q&A are gbp-posts;
  //    ongoing review replies are review-responses; the monthly report is reporting. This service
  //    stands the profile up complete and correct once, and hands the rest off. ──
  'gbp-setup': {
    serviceId: 'gbp-setup',
    steps: [
      {
        id: 'intake',
        label: 'Get us in and gather the facts',
        lead: 'Collect access and the facts only the owner has, before any work starts.',
        actions: [
          'Owner adds Apnosh as a Manager on the Google profile (Owner if it is unclaimed)',
          'Get the exact business name as shown on the sign',
          'Get the full address, best public phone, and website',
          'Get regular hours and any holiday closures',
          'Get the service model: dine-in, takeout, delivery, curbside, reservations',
          'Get the main cuisine and 3 to 8 signature dishes',
          'Get the menu with prices (link or file)',
          'Get ordering and reservation links, and the owner\'s preferred one',
          'Get 15 to 20 real photos: storefront, inside, hero dishes, logo',
          'Ask about any duplicate or old-address listing to clean up',
        ],
        actor: 'client',
        needsInput: 'gbp-access',
        proof: 'note',
      },
      {
        id: 'access-proof',
        label: 'Confirm access with proof',
        lead: 'Prove we can actually reach the profile before starting.',
        actions: [
          'Run a connection probe on the profile',
          'Screenshot Apnosh showing in the Managers or Owners list',
          'If no listing exists yet, note it and go to Claim',
        ],
        actor: 'ops',
        proof: 'screenshot',
      },
      {
        id: 'baseline',
        label: 'Capture the starting numbers',
        lead: 'Record the before picture so the lift can be proven later.',
        actions: [
          'Screenshot the profile as it looks today',
          'Record the last 30 days: calls, direction requests, website clicks, views',
          'For a brand-new listing, write "no prior data, new listing"',
        ],
        actor: 'ops',
        proof: 'screenshot',
      },
      {
        id: 'claim',
        label: 'Claim, verify, and clean up duplicates',
        lead: 'Take ownership and make sure there is only one correct listing.',
        actions: [
          'Find the correct listing and claim it',
          'Start Google verification (video, postcard, phone, or instant)',
          'Merge or request removal of duplicate, old-owner, or wrong-address listings',
          'Confirm the map pin sits on the real front door',
          'If none exists, create the listing',
          'Note the verification method and expected clear date',
        ],
        actor: 'ops',
        gateKind: 'gbp-verify',
        proof: 'screenshot',
      },
      {
        id: 'category',
        label: 'Set the primary category and attributes',
        lead: 'Pick the strongest category and switch on the true attributes.',
        actions: [
          'Set the most specific primary category (e.g. "Korean barbecue restaurant", not "Restaurant")',
          'Glance at who already ranks nearby and record why this category',
          'Add 2 to 3 real secondary categories',
          'Set service options: dine-in, takeout, delivery, curbside',
          'Set the true attributes: reservations, accessibility, outdoor seating',
          'Set food filters: vegetarian or vegan, serves alcohol, kid-friendly',
        ],
        actor: 'ops',
        proof: 'screenshot',
      },
      {
        id: 'content',
        label: 'Write the description and services',
        lead: 'Fill the words that carry keywords and answer "why here".',
        actions: [
          'Write the ~750-character description, leading with cuisine, neighborhood, and signature dishes',
          'Keep it natural, no keyword stuffing',
          'Fill the Services list with real offerings and dish families',
          'Phrase them the way locals search ("birria tacos", "happy hour", "catering")',
        ],
        actor: 'ops',
        proof: 'screenshot',
      },
      {
        id: 'coreinfo',
        label: 'Fill hours, phone, website, and menu link',
        lead: 'Lock in the info that earns calls and directions.',
        actions: [
          'Enter regular hours and any holiday hours',
          'Set the service area if there is one',
          'Add the primary local phone',
          'Add the website, UTM-tagged for the owner\'s own analytics',
          'Add a working menu link',
        ],
        actor: 'ops',
        proof: 'screenshot',
      },
      {
        id: 'menu',
        label: 'Build the on-profile menu and dishes',
        lead: 'Put a real, readable menu on the profile where it renders.',
        actions: [
          'If Google\'s menu editor is available, enter menu sections (starters, mains, desserts, drinks)',
          'Add item names, short descriptions, and prices',
          'Seed the owner\'s signature dishes',
          'If the editor is not available, keep the external menu link as the fallback',
        ],
        actor: 'ops',
        proof: 'screenshot',
      },
      {
        id: 'photos',
        label: 'Load the food photo set that sells',
        lead: 'Upload owner photos into the right categories.',
        actions: [
          'Upload storefront and exterior shots',
          'Upload interior and ambiance shots',
          'Upload hero shots of the signature dishes',
          'Upload the logo and set the best food photo as cover',
          'Use owner photos only; if none exist, flag a photo shoot as a separate service',
        ],
        actor: 'ops',
        needsInput: 'gbp-photos',
        proof: 'link',
      },
      {
        id: 'review-link',
        label: 'Stand up the review request link',
        lead: 'Build the capture rail so reviews can start coming in.',
        actions: [
          'Generate the profile\'s short review link',
          'Make a printable QR code for the link',
          'Confirm the star rating surface is live',
          'Hand the link and QR to the owner',
        ],
        actor: 'ops',
        proof: 'link',
      },
      {
        id: 'signoff',
        label: 'Owner signs off on the choices',
        lead: 'Get a quick yes on the judgment calls before it goes out.',
        actions: [
          'Show the owner the primary category',
          'Show the owner the description',
          'Show the owner any button target',
          'Get a yes, or make the changes they ask for',
        ],
        actor: 'client',
        proof: 'note',
      },
      {
        id: 'qa-deliver',
        label: 'Check on a real phone and deliver',
        lead: 'Prove it works on a phone, then hand it over with the proof.',
        actions: [
          'Open the live profile on a real phone in Google Search and Maps',
          'Check category, hours, phone, website, and description',
          'Check the menu, photos, and any Order or Reserve buttons render and route right',
          'Confirm no wrong or duplicate info remains',
          'If Order or Reserve buttons are wanted but not set, flag the Google order and reserve service',
          'Deliver the live profile link plus the QA and baseline screenshots',
          'Add a plain note: verification and ranking are outside our control; actions build over 30 to 60 days; ongoing posts, replies, and updates are separate services',
        ],
        actor: 'ops',
        proof: 'link',
      },
    ],
    deliverable: {
      liveLinkLabel: 'Your live Google profile',
      metricLabel: 'Calls and direction requests from Google',
    },
  },

  // ── "GBP posts & Q&A" — the RECURRING GBP management service (already sold; this authors its
  //    monthly work cycle). One work order = one month's cycle. Keeps the profile active so it holds
  //    its rank, which the setup service explicitly hands off to. ──
  'gbp-posts': {
    serviceId: 'gbp-posts',
    steps: [
      {
        id: 'plan-month',
        label: 'Plan the month from real data',
        lead: 'Decide what to post from the real menu and events.',
        actions: [
          'Pull this month\'s menu, specials, and events',
          'Pick four post topics and the current offer to feature',
          'Note the top diner questions worth answering',
        ],
        actor: 'ops',
        proof: 'note',
      },
      {
        id: 'draft',
        label: 'Draft four posts and Q&A',
        lead: 'Write the month\'s posts and answers in brand voice.',
        actions: [
          'Write four Google posts in the owner\'s brand voice',
          'Write the Q&A answers from the real menu and events',
          'No stock filler',
        ],
        actor: 'ops',
        proof: 'note',
      },
      {
        id: 'qa-review',
        label: 'Human review before publish',
        lead: 'A person checks everything before it goes live.',
        actions: [
          'Review every post and answer',
          'Check voice, accuracy, and that the offer is right',
        ],
        actor: 'ops',
        proof: 'note',
      },
      {
        id: 'publish',
        label: 'Publish live to the profile',
        lead: 'Put the posts and answers on the live profile.',
        actions: [
          'Publish the four posts across the month',
          'Post the Q&A answers',
          'Confirm each renders on Search and Maps',
        ],
        actor: 'ops',
        proof: 'link',
      },
      {
        id: 'log-actions',
        label: 'Log the month\'s profile actions',
        lead: 'Record the numbers so the trend is visible.',
        actions: [
          'Record the month\'s profile actions: post views, calls, directions',
          'Pass the numbers to the Monthly report service',
        ],
        actor: 'ops',
        proof: 'screenshot',
      },
    ],
    deliverable: {
      liveLinkLabel: 'Your Google profile',
      metricLabel: 'Google profile actions',
    },
  },

  // ── "Fix your website and menu" (site-menu). A one-time tune-up: rebuild the online menu, fix
  //    speed and correctness, make ordering obvious. Ends with a real live link + before/after
  //    page-speed proof. Scope stays clear of neighbors: listings live in listings-sync, the Google
  //    order button in google-food-order, ongoing site changes in website-care. ──
  'site-menu': {
    serviceId: 'site-menu',
    steps: [
      {
        id: 'intake',
        label: 'Get access and your current menu',
        lead: 'Collect site access and the facts only the owner has, before any work starts.',
        actions: [
          'Get access to the website (CMS login or the developer to contact)',
          'Get the current menu with prices (link or file)',
          'Get the logo, brand colors, and any key photos',
          'Get the ordering and reservation links',
          'Confirm the top pages and the main thing a guest should do',
          'Note anything already broken the owner knows about',
        ],
        actor: 'client',
        needsInput: 'menu-source',
        proof: 'note',
      },
      {
        id: 'baseline',
        label: 'Capture the before picture',
        lead: 'Record the starting state so the lift can be proven later.',
        actions: [
          'Run a page-speed test on the homepage and menu page and save the scores',
          'Screenshot the current menu and key pages',
          'Note broken links, wrong hours, and missing prices',
          'Open the site on a real phone and note what breaks',
        ],
        actor: 'ops',
        proof: 'screenshot',
      },
      {
        id: 'menu-rebuild',
        label: 'Rebuild the online menu',
        lead: 'Put a fast, correct, readable menu on the site.',
        actions: [
          'Enter every section, item, description, and price',
          'Match the item names to how guests actually search',
          'Mark dietary, spicy, and most-popular items',
          'Make sure the menu loads fast and reads well on a phone',
        ],
        actor: 'ops',
        proof: 'screenshot',
      },
      {
        id: 'site-fix',
        label: 'Fix speed, correctness, and ordering',
        lead: 'Make the site fast, right, and easy to order from.',
        actions: [
          'Fix the hours, address, and phone everywhere they show',
          'Compress images and remove what slows the page',
          'Make the order and reserve buttons obvious and working',
          'Fix broken links and mobile layout issues',
        ],
        actor: 'ops',
        proof: 'screenshot',
      },
      {
        id: 'signoff',
        label: 'Owner signs off on the changes',
        lead: 'Get a quick yes before it goes live.',
        actions: [
          'Show the owner the new menu and key pages',
          'Confirm the hours, prices, and links are right',
          'Get a yes, or make the changes they ask for',
        ],
        actor: 'client',
        proof: 'note',
      },
      {
        id: 'qa-deliver',
        label: 'Check on a real phone and deliver',
        lead: 'Prove it works on a phone, then hand it over with the proof.',
        actions: [
          'Open the live site and menu on a real phone',
          'Re-run the page-speed test and record the new scores',
          'Confirm the order and reserve buttons work end to end',
          'Deliver the live link plus the before-and-after speed screenshots',
          'Add a plain note on what changed and what to watch',
        ],
        actor: 'ops',
        proof: 'link',
      },
    ],
    deliverable: {
      liveLinkLabel: 'Your updated site and menu',
      metricLabel: 'Website visits and menu views',
    },
  },

  // ── "Get listed everywhere" (listings-sync). Claim and standardize the business across Yelp,
  //    Apple Maps, Facebook, Bing, and more, then clean up duplicates. Listing propagation is a
  //    real external wait (up to a week), carried as the gate. ──
  'listings-sync': {
    serviceId: 'listings-sync',
    steps: [
      {
        id: 'intake',
        label: 'Gather the exact business facts',
        lead: 'Collect the one true set of facts every listing must match.',
        actions: [
          'Get the exact business name, address, phone, and hours',
          'Get the menu and website links',
          'List the platforms to cover (Yelp, Apple Maps, Facebook, Bing, and others)',
          'Get login access, or confirm we can claim each one',
        ],
        actor: 'client',
        needsInput: 'listing-access',
        proof: 'note',
      },
      {
        id: 'audit',
        label: 'Find every listing and what is wrong',
        lead: 'See the full picture before changing anything.',
        actions: [
          'Search each platform for existing and duplicate listings',
          'Record wrong hours, addresses, phones, and categories',
          'Note duplicates and old-address listings to merge or remove',
        ],
        actor: 'ops',
        proof: 'screenshot',
      },
      {
        id: 'claim',
        label: 'Claim and standardize each listing',
        lead: 'One exact set of info, pushed everywhere.',
        actions: [
          'Claim or get access to each listing',
          'Set one exact name, address, phone, and hours across all',
          'Set the right category and add the menu and website links',
        ],
        actor: 'ops',
        gateKind: 'listing-propagation',
        proof: 'screenshot',
      },
      {
        id: 'dedupe',
        label: 'Merge or remove duplicates',
        lead: 'Leave one clean listing per platform.',
        actions: [
          'Merge duplicates where the platform allows',
          'Request removal of old or wrong-address listings',
          'Confirm one clean listing per platform',
        ],
        actor: 'ops',
        proof: 'note',
      },
      {
        id: 'signoff',
        label: 'Owner signs off on the standard info',
        lead: 'Get a yes on the info before it spreads everywhere.',
        actions: [
          'Show the owner the standard name, address, phone, and hours being pushed',
          'Confirm the menu and website links are right',
          'Get a yes, or make the changes they ask for',
        ],
        actor: 'client',
        proof: 'note',
      },
      {
        id: 'qa-deliver',
        label: 'Confirm live and deliver the links',
        lead: 'Prove each listing is right, then hand over the list.',
        actions: [
          'Check each platform shows the right name, hours, and menu link',
          'Confirm the map pin sits on the real front door',
          'Deliver a list of every live listing link',
          'Add a plain note that some platforms take up to a week to fully update',
        ],
        actor: 'ops',
        proof: 'link',
      },
    ],
    deliverable: {
      liveLinkLabel: 'Your synced listings',
      metricLabel: 'Listing views and clicks',
    },
  },

  // ── "Show up in local search" (local-seo). RECURRING: one work order = one month's cycle of
  //    citation work + on-page local signals + a tracked report. Keeps the profile ranking the
  //    setup hands off to. ──
  'local-seo': {
    serviceId: 'local-seo',
    steps: [
      {
        id: 'intake',
        label: 'Get your targets and access',
        lead: 'Collect the terms, area, and access the work needs.',
        actions: [
          'Get the business name, address, phone, and categories',
          'Get the service area and neighborhoods to target',
          'Get the top dishes and the search terms guests use',
          'Confirm Google profile access',
        ],
        actor: 'client',
        needsInput: 'gbp-access',
        proof: 'note',
      },
      {
        id: 'baseline',
        label: 'Record the starting local rank',
        lead: 'Capture the before picture so movement is provable.',
        actions: [
          'Record current local pack rankings for the main terms',
          'Note current citations and name-address-phone consistency',
          'Screenshot the starting map visibility',
        ],
        actor: 'ops',
        proof: 'screenshot',
      },
      {
        id: 'citations',
        label: 'Build and fix citations',
        lead: 'Make the business findable and consistent across the web.',
        actions: [
          'Submit or fix citations on the major directories',
          'Make name, address, and phone identical everywhere',
          'Add the right categories and service areas',
        ],
        actor: 'ops',
        proof: 'note',
      },
      {
        id: 'onpage',
        label: 'Strengthen local signals',
        lead: 'Tune the site and profile for the target searches.',
        actions: [
          'Optimize the site and Google profile for the target terms',
          'Add location and dish keywords naturally, no stuffing',
          'Build or update the location and menu pages',
        ],
        actor: 'ops',
        proof: 'note',
      },
      {
        id: 'report',
        label: 'Track and report the month',
        lead: 'Record the movement so the trend is visible.',
        actions: [
          'Re-check the local rankings and record the movement',
          'Note the new citations live this month',
          'Pass the numbers to the Monthly report service',
        ],
        actor: 'ops',
        proof: 'screenshot',
      },
    ],
    deliverable: {
      liveLinkLabel: 'Your local search presence',
      metricLabel: 'Local search rank and map views',
    },
  },

  // ── "Tune up your delivery apps" (delivery-opt). Fix menu, photos, hours, and promos on the
  //    delivery marketplaces. The POS/ordering vendor controls go-live timing, carried as the gate. ──
  'delivery-opt': {
    serviceId: 'delivery-opt',
    steps: [
      {
        id: 'intake',
        label: 'Get your delivery apps and access',
        lead: 'Collect which apps to fix and how to reach them.',
        actions: [
          'Get which delivery apps you sell on (DoorDash, Uber Eats, Grubhub)',
          'Get login access or the store IDs for each',
          'Get the current menu with prices',
          'Note any items that should not be on delivery',
        ],
        actor: 'client',
        needsInput: 'pos-vendor',
        proof: 'note',
      },
      {
        id: 'audit',
        label: 'Review each delivery page',
        lead: 'See what is weak on each app before fixing.',
        actions: [
          'Screenshot the current menu, photos, and hours on each app',
          'Note missing photos, weak descriptions, and wrong prices',
          'Check ratings and the common complaints',
        ],
        actor: 'ops',
        proof: 'screenshot',
      },
      {
        id: 'optimize',
        label: 'Fix the menu and photos',
        lead: 'Make each page sell better from the same traffic.',
        actions: [
          'Rewrite item names and descriptions to sell',
          'Upload strong photos to the top items',
          'Fix prices, modifiers, and hours',
          'Set up any promos or featured items',
        ],
        actor: 'ops',
        gateKind: 'pos-vendor',
        needsInput: 'pos-vendor',
        proof: 'screenshot',
      },
      {
        id: 'signoff',
        label: 'Owner signs off on the pages',
        lead: 'Get a yes on prices and promos before they go live.',
        actions: [
          'Show the owner the updated pages and any promo',
          'Confirm the prices and items are right',
          'Get a yes, or make the changes they ask for',
        ],
        actor: 'client',
        proof: 'note',
      },
      {
        id: 'qa-deliver',
        label: 'Confirm live and deliver',
        lead: 'Prove each page is right on a phone, then hand over the links.',
        actions: [
          'Open each delivery page on a real phone',
          'Confirm menu, photos, hours, and promos render right',
          'Deliver links to each updated page plus before-and-after screenshots',
          'Add a plain note that ranking gains build over a few weeks',
        ],
        actor: 'ops',
        proof: 'link',
      },
    ],
    deliverable: {
      liveLinkLabel: 'Your delivery app pages',
      metricLabel: 'Delivery orders and menu views',
    },
  },

  // ── "Get known on Nextdoor" (nextdoor-local). MANUAL by design — there is no Nextdoor posting
  //    API, so a real person stands up the page and posts to the neighborhood feed by hand. One
  //    work order = one month's cycle. ──
  'nextdoor-local': {
    serviceId: 'nextdoor-local',
    steps: [
      {
        id: 'intake',
        label: 'Get your page and neighborhoods',
        lead: 'Collect the page, the area, and what to post.',
        actions: [
          'Confirm the business Nextdoor page, or that we should create one',
          'Get the neighborhoods to reach',
          'Get the story, offers, and events to post about',
          'Get photos and the logo',
        ],
        actor: 'client',
        proof: 'note',
      },
      {
        id: 'setup',
        label: 'Stand up the Nextdoor business page',
        lead: 'Create or claim the page and fill it out.',
        actions: [
          'Create or claim the Nextdoor business page',
          'Fill the profile, hours, and links',
          'Add the logo and photos',
          'Verify the address and neighborhoods',
        ],
        actor: 'ops',
        proof: 'screenshot',
      },
      {
        id: 'plan',
        label: 'Plan the month of neighborhood posts',
        lead: 'Decide what to post from real menu, events, and offers.',
        actions: [
          'Pick post topics from the real menu, events, and offers',
          'Write posts in a friendly, neighborly voice',
          'No stock filler',
        ],
        actor: 'ops',
        proof: 'note',
      },
      {
        id: 'publish',
        label: 'Post to the neighborhood feed by hand',
        lead: 'Publish and reply on the live feed.',
        actions: [
          'Publish the planned posts by hand across the month',
          'Reply to neighbor comments and questions',
          'Confirm each post is live on the feed',
        ],
        actor: 'ops',
        proof: 'link',
      },
      {
        id: 'report',
        label: 'Track the month',
        lead: 'Record reach so the trend is visible.',
        actions: [
          'Record post reach and engagement',
          'Note new followers and messages',
          'Pass the numbers to the Monthly report service',
        ],
        actor: 'ops',
        proof: 'screenshot',
      },
    ],
    deliverable: {
      liveLinkLabel: 'Your Nextdoor page',
      metricLabel: 'Neighborhood reach and followers',
    },
  },

  // ── "Reply to reviews" (review-responses). RECURRING: one work order = one month of drafted
  //    replies. The owner approves every reply before it posts (a real consent gate), then we post
  //    the approved ones to the live Google listing. ──
  'review-responses': {
    serviceId: 'review-responses',
    steps: [
      {
        id: 'intake',
        label: 'Get access and your voice',
        lead: 'Collect access and the brand voice before drafting.',
        actions: [
          'Owner adds Apnosh as a Manager on the Google profile',
          'Get the brand voice and any lines to always use or avoid',
          'Confirm who signs off on replies',
        ],
        actor: 'client',
        needsInput: 'gbp-access',
        proof: 'note',
      },
      {
        id: 'pull',
        label: 'Pull the reviews to answer',
        lead: 'Gather this month\'s unanswered reviews.',
        actions: [
          'Pull all new and unanswered reviews this month',
          'Sort by rating and urgency',
          'Flag anything that needs the owner directly',
        ],
        actor: 'ops',
        proof: 'note',
      },
      {
        id: 'draft',
        label: 'Draft a reply to every review',
        lead: 'Write a personal reply to each one in brand voice.',
        actions: [
          'Write a personal reply to each review in the owner\'s voice',
          'Thank the good ones by name and detail',
          'Answer the critical ones with care and a fix, never defensive',
          'No copy-paste replies',
        ],
        actor: 'ops',
        proof: 'note',
      },
      {
        id: 'approve',
        label: 'Owner approves the replies',
        lead: 'Get a yes on every reply before it posts.',
        actions: [
          'Show the owner every drafted reply',
          'Make any changes they ask for',
          'Get a yes to post',
        ],
        actor: 'client',
        proof: 'note',
      },
      {
        id: 'publish',
        label: 'Post the approved replies',
        lead: 'Put the approved replies on the live listing.',
        actions: [
          'Post each approved reply to the live listing',
          'Confirm each reply shows publicly',
          'Record which reviews were answered',
        ],
        actor: 'ops',
        proof: 'link',
      },
    ],
    deliverable: {
      liveLinkLabel: 'Your answered reviews',
      metricLabel: 'Review replies and rating',
    },
  },

  // ── "Smooth out ordering" (google-food-order). Wire the Order Online + Reserve a Table links on
  //    the Google profile to the owner's real provider, tested on a phone. The POS/reservation
  //    vendor controls timing, carried as the gate. ──
  'google-food-order': {
    serviceId: 'google-food-order',
    steps: [
      {
        id: 'intake',
        label: 'Get your ordering system and links',
        lead: 'Collect the provider and links the buttons point to.',
        actions: [
          'Get which ordering or reservation system you use (Toast, Square, OpenTable, and others)',
          'Get the ordering and reservation links',
          'Confirm Google profile access',
          'Confirm the preferred provider for the button',
        ],
        actor: 'client',
        needsInput: 'pos-vendor',
        proof: 'note',
      },
      {
        id: 'baseline',
        label: 'Record the starting state',
        lead: 'Capture what the profile shows today.',
        actions: [
          'Screenshot the current Google profile buttons',
          'Note whether Order and Reserve are present and where they point',
        ],
        actor: 'ops',
        proof: 'screenshot',
      },
      {
        id: 'wire',
        label: 'Wire the order and reserve links',
        lead: 'Point the buttons at the owner\'s real provider.',
        actions: [
          'Add or fix the Order Online link to the owner\'s chosen provider',
          'Add or fix the Reserve a Table link',
          'Set the preferred provider so Google shows the right one',
          'UTM-tag the links for the owner\'s own analytics',
        ],
        actor: 'ops',
        gateKind: 'pos-vendor',
        needsInput: 'pos-vendor',
        proof: 'screenshot',
      },
      {
        id: 'signoff',
        label: 'Owner signs off on the targets',
        lead: 'Get a yes on where the buttons point.',
        actions: [
          'Show the owner where the Order and Reserve buttons point',
          'Confirm the provider and links are right',
          'Get a yes, or make the changes they ask for',
        ],
        actor: 'client',
        proof: 'note',
      },
      {
        id: 'qa-deliver',
        label: 'Test on a real phone and deliver',
        lead: 'Prove the buttons work on a phone, then hand over the proof.',
        actions: [
          'Open the profile on a real phone in Search and Maps',
          'Tap Order and Reserve and confirm they route right',
          'Walk the order path far enough to confirm it works',
          'Deliver the live profile link plus screenshots',
          'Add a plain note that provider changes can take a few days to show',
        ],
        actor: 'ops',
        proof: 'link',
      },
    ],
    deliverable: {
      liveLinkLabel: 'Your Google order and reserve buttons',
      metricLabel: 'Orders and reservations from Google',
    },
  },

  // ── "Book a shoot" (photo-library). An on-site pro shoot → an edited photo library plus a reel
  //    the owner keeps. The shoot date is locked BEFORE checkout by the pre-checkout booking gate
  //    (gates/derive.ts), so this playbook confirms it and runs the shoot; it never invents a slot. ──
  'photo-library': {
    serviceId: 'photo-library',
    steps: [
      {
        id: 'intake',
        label: 'Confirm the shoot details',
        lead: 'Lock the date, contact, and dishes before the shoot.',
        actions: [
          'Confirm the booked shoot date, time, and address',
          'Get the on-site contact name and role',
          'Get the list of dishes and any hero plates to feature',
          'Confirm it is OK to film and tag staff',
          'Note parking, entry, and the best light',
        ],
        actor: 'client',
        needsInput: 'onSiteContact',
        proof: 'note',
      },
      {
        id: 'prep',
        label: 'Plan the shoot',
        lead: 'Build the shot list and confirm logistics.',
        actions: [
          'Build a shot list from the dishes and the brand look',
          'Confirm gear, timing, and who plates the food',
          'Confirm the styling and props',
        ],
        actor: 'ops',
        proof: 'note',
      },
      {
        id: 'shoot',
        label: 'Run the on-site shoot',
        lead: 'Capture the dishes and the space per the shot list.',
        actions: [
          'Arrive on time and set up',
          'Shoot each dish and the space per the shot list',
          'Capture extra angles and detail shots',
          'Back up the files on site',
        ],
        actor: 'ops',
        proof: 'note',
      },
      {
        id: 'edit',
        label: 'Cull and edit the library',
        lead: 'Turn the raw files into a finished library and reel.',
        actions: [
          'Cull to the best frames',
          'Color-correct and retouch each selected photo',
          'Cut a short reel from the footage',
          'Export web and print sizes',
        ],
        actor: 'ops',
        proof: 'screenshot',
      },
      {
        id: 'signoff',
        label: 'Owner previews the gallery',
        lead: 'Get a yes on the edit before final delivery.',
        actions: [
          'Share a preview gallery with the owner',
          'Take any swap or re-edit requests',
          'Get a yes',
        ],
        actor: 'client',
        proof: 'note',
      },
      {
        id: 'deliver',
        label: 'Deliver the library and reel',
        lead: 'Hand over the files the owner keeps, with usage notes.',
        actions: [
          'Deliver a link to the full edited photo library the owner keeps',
          'Deliver the reel file',
          'Include usage notes for menu, Google, delivery, and social',
          'Confirm the owner can download everything',
        ],
        actor: 'ops',
        proof: 'link',
      },
    ],
    deliverable: {
      liveLinkLabel: 'Your photo library and reel',
      metricLabel: 'Photos used across your channels',
    },
  },

  // ── "Run local ads" (paid-ads). RECURRING management of paid campaigns. Ad SPEND is billed by the
  //    platform at cost, separate from the management fee — stated plainly, never hidden. No content
  //    is invented here; the creative rides from the campaign's own pieces. ──
  'paid-ads': {
    serviceId: 'paid-ads',
    steps: [
      {
        id: 'intake',
        label: 'Get ad access and your budget',
        lead: 'Collect account access, budget, and the goal before launch.',
        actions: [
          'Grant access to the ad accounts (Meta Business, Google Ads), or let us create them',
          'Get the monthly ad budget',
          'Get the goal, the offer, and the area to target',
          'Confirm billing is set on the ad account (spend is paid to the platform at cost)',
        ],
        actor: 'client',
        needsInput: 'ad-access',
        proof: 'note',
      },
      {
        id: 'setup',
        label: 'Stand up the campaigns',
        lead: 'Build the accounts, audiences, and ad sets.',
        actions: [
          'Set up or connect the ad accounts and the pixel or tag',
          'Build the audiences and the target area',
          'Create the ad sets for the goal and budget',
          'Load the creative and copy',
        ],
        actor: 'ops',
        proof: 'screenshot',
      },
      {
        id: 'qa-review',
        label: 'Human review before launch',
        lead: 'A person checks targeting, billing, and tracking before spend starts.',
        actions: [
          'Check targeting, budget caps, and billing',
          'Check the creative, links, and tracking',
          'Confirm the offer and landing page work',
        ],
        actor: 'ops',
        proof: 'note',
      },
      {
        id: 'launch',
        label: 'Launch and confirm live',
        lead: 'Put the ads live and confirm they deliver.',
        actions: [
          'Launch the campaigns',
          'Confirm ads are delivering and tracked',
          'Screenshot the live campaigns',
        ],
        actor: 'ops',
        proof: 'link',
      },
      {
        id: 'optimize-report',
        label: 'Tune and report the month',
        lead: 'Watch the spend, tune the ads, and report the results.',
        actions: [
          'Watch spend and results and tune the ads',
          'Pause what is not working and scale what is',
          'Record spend, reach, and results',
          'Pass the numbers to the Monthly report service',
          'Note that ad spend is billed by the platform at cost, separate from the fee',
        ],
        actor: 'ops',
        proof: 'screenshot',
      },
    ],
    deliverable: {
      liveLinkLabel: 'Your live ad campaigns',
      metricLabel: 'Ad reach, clicks, and cost per result',
    },
  },
}

export function playbookFor(serviceId: string): ServicePlaybook | undefined {
  return SERVICE_PLAYBOOKS[serviceId]
}

/**
 * The deliver-with-proof HONESTY GATE, as one pure, testable decision. A service can only be marked
 * delivered when (a) a real proof link exists and (b) — on the transition into delivered — every step
 * is actually done, so an order can never be handed over half-worked or without evidence. The admin
 * PATCH route calls this against the FINAL row state (not just the UI), so no request can bypass it,
 * and it is generic over the steps jsonb, so it covers every authored playbook the same way.
 *
 * `checkSteps` is false when the row is already delivered (a re-save of a closed record only needs the
 * proof invariant, never re-validates the checklist). Returns { ok } or { ok:false, reason } with an
 * owner-facing message. Client-safe + pure (no I/O), so both the route and its tests use one truth.
 */
export function deliverGuard(
  steps: Array<{ id?: string; status?: string; label?: string }> | null | undefined,
  proofUrl: string | null | undefined,
  opts?: { checkSteps?: boolean },
): { ok: true } | { ok: false; reason: string } {
  if (!proofUrl || !String(proofUrl).trim()) {
    return { ok: false, reason: 'A proof link is required before a service can be marked delivered.' }
  }
  if (opts?.checkSteps !== false) {
    const open = (steps ?? []).filter((s) => s?.status !== 'done')
    if (open.length > 0) {
      const names = open.map((s) => s.label ?? s.id ?? 'a step').slice(0, 3).join(', ')
      return { ok: false, reason: `Not everything is done yet: ${names}${open.length > 3 ? '…' : ''}.` }
    }
  }
  return { ok: true }
}

/** Every needsInput key a service's playbook declares, deduped in step order. This is the intake
 *  rail's source: the team's checklist opens with things only the owner can give (Manager access,
 *  logins, photos, brand voice), and before this helper NOTHING consumed those keys — /ready said
 *  "all set" while the first step sat waiting on the owner. Pure + client-safe. */
export function playbookNeedKeys(serviceId: string): string[] {
  const pb = SERVICE_PLAYBOOKS[serviceId]
  if (!pb) return []
  const out: string[] = []
  for (const st of pb.steps) if (st.needsInput && !out.includes(st.needsInput)) out.push(st.needsInput)
  return out
}

/** Instantiate a service's playbook into the runtime step list stored on the work order. Returns []
 *  for a service with no authored playbook yet (the work order still exists; it just has no checklist
 *  until a playbook is authored — honest, never a fake step). */
export function seedSteps(serviceId: string): WorkOrderStep[] {
  const pb = SERVICE_PLAYBOOKS[serviceId]
  if (!pb) return []
  return pb.steps.map((s) => ({
    id: s.id,
    label: s.label,
    lead: s.lead,
    actions: s.actions.map((text) => ({ text, done: false })),
    actor: s.actor,
    status: 'todo' as const,
    ...(s.gateKind ? { gateKind: s.gateKind } : {}),
    ...(s.needsInput ? { needsInput: s.needsInput } : {}),
    ...(s.proof ? { proof: s.proof } : {}),
  }))
}
