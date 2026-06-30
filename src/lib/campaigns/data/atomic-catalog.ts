/**
 * Internal atomic action catalog — the AI plan builder's palette.
 *
 * This is NOT the storefront. Owners never shop these directly. This is the
 * complete, deduplicated set of every distinct THING Apnosh can do, so the AI
 * builder has the richest possible material to compose a plan tailored to each
 * business. The familiar campaigns owners actually shop are RECIPES (below) that
 * reference these atoms.
 *
 * Why it exists: the priced-catalog ships 64 "services", but only ~27 are true
 * single actions. The other 37 are bundles (programs + campaigns) that each mix
 * many actions, and across all 64 the same act is written 178 different ways
 * ("Write a social post" / "Write a Google post" / "Write a reply" are all just
 * write-copy; "Design a graphic" is baked separately into 8 services). That made
 * the builder repeat work and read the catalog as campaigns instead of tools.
 *
 * The fix, captured here:
 *  - 31 atomic actions, each defined ONCE, grouped into 6 families.
 *  - Each atom carries its AI-fit (who does it best) and the type-variants that
 *    used to be separate services (one design-graphic with {post, story, card,
 *    logo}; one write-copy with {post, email, sms, reply, brief, ...}).
 *  - Every original action string is recorded in a type's `from[]`, so the file
 *    itself proves nothing was dropped (see atomicCoverage()).
 *  - Recipes map each storefront bundle back to the atoms it's made of.
 *
 * AI-fit is honest: only 5 of 31 atoms are genuinely AI-best (write, brainstorm,
 * draft a graphic, schedule, assemble a report). The work that actually moves a
 * restaurant — shoots, setup, offers, field + relationship work — stays human.
 *
 * Pricing lives in priced-catalog, not here. This module is structure only.
 */

/** Who does the work best. AI = model drafts + human QA; hybrid = AI assists,
 *  human finishes; human = hands-on, AI can't do it. */
export type AtomFit = 'ai' | 'hybrid' | 'human'

/** The six families, for display/grouping only. The builder reads atoms, not families. */
export type AtomFamily = 'create' | 'publish' | 'build' | 'money' | 'measure' | 'people'

export const FAMILY_LABEL: Record<AtomFamily, string> = {
  create: 'Create',
  publish: 'Publish',
  build: 'Build the machine',
  money: 'Money & offers',
  measure: 'Plan & measure',
  people: 'People & field',
}

export const FIT_LABEL: Record<AtomFit, string> = {
  ai: 'AI drafts it',
  hybrid: 'Hybrid',
  human: 'Hands-on',
}

/** A concrete variant of an atom — the actual line the builder can place. */
export interface ActionType {
  /** Stable id, unique within its atom. */
  id: string
  /** Plain-language label. No jargon, no em dashes. */
  label: string
  /** Override the atom's fit when this specific variant differs (e.g. publishing
   *  to Google needs human account access even though scheduling is AI). */
  fit?: AtomFit
  /** The original priced-catalog action strings this variant absorbs. The union
   *  of every `from` across the whole catalog equals the 178 source strings. */
  from: string[]
}

/** One atomic action — the smallest reusable unit of work. */
export interface AtomicAction {
  id: string
  /** Short verb-led name. */
  name: string
  family: AtomFamily
  /** Default who-does-it for this atom; a type may override. */
  fit: AtomFit
  /** One honest sentence on why that fit. */
  fitWhy: string
  /** The concrete variants. At least one. */
  types: ActionType[]
}

/* ── The 31 atoms ──────────────────────────────────────────────────────────
 * Ordered by family. `from` strings are the audit trail back to the 64 services. */

export const ATOMIC_ACTIONS: AtomicAction[] = [
  /* ── Create ─────────────────────────────────────────────────────────── */
  {
    id: 'write-copy', name: 'Write copy', family: 'create', fit: 'ai',
    fitWhy: 'The model drafts fast across every channel; a person edits for voice and facts.',
    types: [
      { id: 'social-post', label: 'A social post', from: ['Write a social post'] },
      { id: 'google-post', label: 'A Google post', from: ['Write a Google post'] },
      { id: 'email', label: 'An email', from: ['Write an email'] },
      { id: 'sms', label: 'A text message', from: ['Write a text message', 'Write a text', 'Write a message'] },
      { id: 'review-reply', label: 'A review reply', from: ['Write a reply'] },
      { id: 'caption', label: 'A video caption', from: ['Write captions'] },
      { id: 'story', label: 'A story', from: ['Write a social story'] },
      { id: 'creator-brief', label: 'A creator brief', from: ['Write a creator brief', 'Write a brief', 'Take one brief'] },
      { id: 'item-desc', label: 'Menu item descriptions', from: ['Write item descriptions'] },
      { id: 'proposal', label: 'A B2B proposal', from: ['Write proposal templates'] },
      { id: 'lifecycle-msg', label: 'A win-back / nudge message', from: ['Write a recovery message', 'Send a monthly nudge'] },
      { id: 'offer-copy', label: 'Offer copy', from: ['Write the offer copy'] },
      { id: 'page-copy', label: 'Web page copy', from: ['Write the page copy'] },
      { id: 'opt-in-wording', label: 'Text opt-in wording', fit: 'hybrid', from: ['Write opt-in wording'] },
    ],
  },
  {
    id: 'brainstorm', name: 'Brainstorm angles & ideas', family: 'create', fit: 'ai',
    fitWhy: 'The model generates lots of options from the menu and data; the owner picks.',
    types: [
      { id: 'promo-ideas', label: 'Promo ideas', from: ['Generate promo ideas'] },
      { id: 'story-angle', label: 'A press / story angle', from: ['Mine the story angle', 'Pick the angle'] },
      { id: 'video-concept', label: 'A video concept', from: ['Plan a video concept'] },
      { id: 'classify', label: 'Classify / triage data', from: ['Classify menu items', 'Triage feedback'] },
    ],
  },
  {
    id: 'design-graphic', name: 'Design a graphic', family: 'create', fit: 'ai',
    fitWhy: 'AI explores layouts in seconds; a designer does a quick on-brand QA pass.',
    types: [
      { id: 'feed-post', label: 'A feed post / flyer', from: ['Design a graphic'] },
      { id: 'printed-card', label: 'A printed card', fit: 'hybrid', from: ['Design and print cards', 'Design referral cards'] },
      { id: 'logo', label: 'A logo', fit: 'hybrid', from: ['Design a logo'] },
    ],
  },
  {
    id: 'shoot', name: 'On-site photo / video shoot', family: 'create', fit: 'human',
    fitWhy: 'A camera has to be in the room. AI cannot capture real food or a real space.',
    types: [
      { id: 'shot-list', label: 'Plan the shot list', from: ['Plan a shot list', 'Plan the shot list'] },
      { id: 'photo', label: 'Shoot photos', from: ['Run a photo shoot', 'Shoot photos on site'] },
      { id: 'video', label: 'Shoot video', from: ['Run a video shoot'] },
    ],
  },
  {
    id: 'edit-media', name: 'Edit & cut media', family: 'create', fit: 'human',
    fitWhy: 'Final cuts and retouching are craft work; the owner expects polish.',
    types: [
      { id: 'video-edit', label: 'Cut a short video', from: ['Make a short video'] },
      { id: 'photo-edit', label: 'Edit & deliver photos', from: ['Edit and deliver photos', 'Edit photos'] },
    ],
  },
  {
    id: 'brand-system', name: 'Build a brand system', family: 'create', fit: 'hybrid',
    fitWhy: 'AI explores directions; a designer builds the system the owner signs off on.',
    types: [
      { id: 'colors-fonts', label: 'Colors & fonts', from: ['Set brand colors and fonts'] },
      { id: 'voice', label: 'A brand voice guide', from: ['Write a brand voice guide'] },
      { id: 'photo-style', label: 'A photo style guide', from: ['Write a photo style guide'] },
    ],
  },

  /* ── Publish ────────────────────────────────────────────────────────── */
  {
    id: 'schedule-publish', name: 'Schedule & publish posts', family: 'publish', fit: 'ai',
    fitWhy: 'Calendaring and pushing live is mechanical; a person spot-checks before it goes.',
    types: [
      { id: 'schedule', label: 'Schedule to the calendar', from: ['Schedule posts'] },
      { id: 'publish-google', label: 'Publish to Google', fit: 'human', from: ['Publish to Google profile'] },
      { id: 'approve-post', label: 'Approve & post', fit: 'hybrid', from: ['Approve and post'] },
      { id: 'geo-post', label: 'Post geo-targeted content', from: ['Post geo-targeted content'] },
      { id: 'curate-ugc', label: 'Curate & upload guest content', fit: 'hybrid', from: ['Curate guest content'] },
      { id: 'invite', label: 'Invite followers to an event', from: ['Invite followers'] },
    ],
  },
  {
    id: 'send-blast', name: 'Send a blast', family: 'publish', fit: 'hybrid',
    fitWhy: 'The send is automated, but timing and segment are a human call.',
    types: [
      { id: 'email-blast', label: 'An email blast', from: ['Send an email blast'] },
      { id: 'text-blast', label: 'A text blast', from: ['Send a text blast', 'Send a message blast', 'Send a text', 'Send a text message'] },
    ],
  },
  {
    id: 'reply-engage', name: 'Reply to comments, DMs & groups', family: 'publish', fit: 'hybrid',
    fitWhy: 'AI drafts a reply, but a real voice answers guests and neighbors.',
    types: [
      { id: 'comments-dms', label: 'Comments & DMs', from: ['Answer comments and DMs'] },
      { id: 'community', label: 'Community / neighbor groups', fit: 'human', from: ['Reply in community groups'] },
      { id: 'qa', label: 'Google Q&A', from: ['Answer questions'] },
    ],
  },
  {
    id: 'listing-update', name: 'Update listing data', family: 'publish', fit: 'hybrid',
    fitWhy: 'AI can propagate a change everywhere, but a person catches conflicts.',
    types: [
      { id: 'sync', label: 'Sync info across platforms', from: ['Update listings', 'Set the master listing record', 'Push info to all listings', 'Catch listing conflicts'] },
      { id: 'hours-menu', label: 'Hours, menu & calendar edits', from: ['Update menu and hours', 'Update the site calendar'] },
      { id: 'fix', label: 'Fix wrong listing data', from: ['Fix listing data'] },
      { id: 'schema', label: 'Add schema markup', from: ['Add schema markup'] },
    ],
  },

  /* ── Build the machine ──────────────────────────────────────────────── */
  {
    id: 'web-page', name: 'Build a web page or menu', family: 'build', fit: 'human',
    fitWhy: 'Real build + mobile QA; the owner reviews it before it ships.',
    types: [
      { id: 'page-build', label: 'A page (landing / event / site)', from: ['Build a web page', 'Build the page', 'Build a landing page', 'Build a lead capture page', 'Create the event page'] },
      { id: 'menu-build', label: 'A menu (build / reprice / lay out)', from: ['Build the online menu', 'Rebuild a menu', 'Rebuild the menu', 'Lay out the menu', 'Reprice the menu'] },
      { id: 'speed', label: 'Speed pass', from: ['Speed up the site', 'Run a speed check'] },
      { id: 'buttons-links', label: 'Call / order buttons & links', from: ['Add call/order buttons', 'Add a menu link'] },
      { id: 'menu-photos', label: 'Add item photos', from: ['Add item photos'] },
    ],
  },
  {
    id: 'wire-integration', name: 'Wire an integration', family: 'build', fit: 'human',
    fitWhy: 'Connecting two systems needs account access and integration work.',
    types: [
      { id: 'crm-wire', label: 'Signups into the CRM', from: ['Wire signups to the CRM'] },
      { id: 'payments', label: 'Payments / order path', from: ['Wire up payments', 'Wire the buttons'] },
      { id: 'channel-connect', label: 'Connect a social account', from: ['Connect a social account', 'Verify posting access'] },
      { id: 'missed-call', label: 'Missed-call text-back', from: ['Set up missed-call text-back'] },
    ],
  },
  {
    id: 'stand-up-platform', name: 'Stand up a platform', family: 'build', fit: 'human',
    fitWhy: 'One-time technical setup of a new system, often with compliance steps.',
    types: [
      { id: 'crm', label: 'A CRM', from: ['Set up the CRM'] },
      { id: 'esp', label: 'Email sending (ESP + domain)', from: ['Wire the ESP', 'Set up sending domain', 'Add email authentication records'] },
      { id: 'sms-platform', label: 'Texting (10DLC + compliance)', from: ['Register the texting number', 'Set quiet hours and opt-out', 'Ensure compliance'] },
      { id: 'pos-giftcards', label: 'POS / gift cards', from: ['Set up POS and app', 'Set up gift cards'] },
      { id: 'ai-phone', label: 'AI phone answering', from: ['Set up AI call answering'] },
      { id: 'survey', label: 'A survey', from: ['Build a survey'] },
      { id: 'ordering', label: 'Online ordering stack', from: ['Pick the ordering stack'] },
      { id: 'birthday-field', label: 'Birthday capture field', from: ['Collect the date'] },
      { id: 'review-invites', label: 'Review invites', from: ['Set up review invites'] },
    ],
  },
  {
    id: 'set-tracking', name: 'Set up tracking', family: 'build', fit: 'human',
    fitWhy: 'One-time analytics install; spending without it is spending blind.',
    types: [
      { id: 'tracking', label: 'Analytics & conversions', from: ['Set up tracking'] },
      { id: 'utms', label: 'Tag links with UTMs', from: ['Tag links with UTMs'] },
      { id: 'baseline', label: 'Capture a baseline', from: ['Capture a baseline snapshot'] },
    ],
  },
  {
    id: 'build-automation', name: 'Build an automation', family: 'build', fit: 'hybrid',
    fitWhy: 'AI can map and draft the sequence; a person sets the logic and triggers.',
    types: [
      { id: 'build', label: 'Build the sequence', from: ['Build the automation', 'Build an automation', 'Set up automation'] },
      { id: 'map', label: 'Map the sequence', from: ['Map the sequence'] },
      { id: 'trigger', label: 'Define the triggers', from: ['Define the trigger', 'Define the trigger logic'] },
      { id: 'reminders', label: 'Reminders & follow-ups', from: ['Set up reminders', 'Set up automated reminders', 'Set up follow-up automation'] },
      { id: 'escalation', label: 'An escalation path', from: ['Build an escalation path'] },
    ],
  },
  {
    id: 'test-flow', name: 'Test a flow end-to-end', family: 'build', fit: 'human',
    fitWhy: 'A person has to walk the real path to catch what breaks before guests do.',
    types: [
      { id: 'test', label: 'Walk the path', from: ['Test the flow', 'Test the path', 'Test the signup path', 'Test the order path'] },
      { id: 'deliverability', label: 'Deliverability / test send', from: ['Run a deliverability test', 'Send a test text'] },
    ],
  },
  {
    id: 'claim-listing', name: 'Claim / verify a listing', family: 'build', fit: 'human',
    fitWhy: 'Taking ownership of a profile needs platform access and judgment.',
    types: [
      { id: 'claim', label: 'Claim & verify', from: ['Claim a listing', 'Claim and set up the listing'] },
      { id: 'flag', label: 'Flag bad reviews', from: ['Flag bad reviews'] },
      { id: 'alerts', label: 'Set up alerts', from: ['Set up alerts'] },
      { id: 'upload-photos', label: 'Upload photos', from: ['Upload photos'] },
    ],
  },

  /* ── Money & offers ─────────────────────────────────────────────────── */
  {
    id: 'design-offer', name: 'Design an offer or program', family: 'money', fit: 'human',
    fitWhy: 'The deal has to protect margin and fit the business; that is a human call.',
    types: [
      { id: 'offer', label: 'An offer / discount', from: ['Design the offer', 'Design an offer', 'Pick the offer'] },
      { id: 'program', label: 'A loyalty / referral program', from: ['Design the program'] },
      { id: 'deposit', label: 'A deposit policy', from: ['Design a deposit policy'] },
      { id: 'reciprocal', label: 'A reciprocal partner deal', from: ['Design a reciprocal offer'] },
    ],
  },
  {
    id: 'margin-math', name: 'Run the margin math', family: 'money', fit: 'human',
    fitWhy: 'Pricing a promo so it makes money needs the real numbers and judgment.',
    types: [
      { id: 'math', label: 'Check the margin', from: ['Run the margin math'] },
    ],
  },
  {
    id: 'paid-ads', name: 'Run paid ads / promos', family: 'money', fit: 'human',
    fitWhy: 'Live budgets, bids, and account ownership need a person watching them.',
    types: [
      { id: 'build-ads', label: 'Build the campaigns', from: ['Build ad campaigns'] },
      { id: 'rotate', label: 'Rotate creative', from: ['Rotate ad creative'] },
      { id: 'optimize', label: 'Optimize weekly', from: ['Optimize weekly'] },
      { id: 'promos', label: 'Run a promo / seasonal push', from: ['Run promos and ads', 'Run a seasonal campaign'] },
    ],
  },

  /* ── Plan & measure ─────────────────────────────────────────────────── */
  {
    id: 'plan-calendar', name: 'Plan the content calendar', family: 'measure', fit: 'hybrid',
    fitWhy: 'AI proposes the calendar; the owner signs off on what goes out.',
    types: [
      { id: 'month', label: 'Plan the month', from: ['Plan the month'] },
      { id: 'quarter', label: 'Plan the quarter', from: ['Plan the quarter'] },
      { id: 'refresh', label: 'Refresh the calendar', from: ['Refresh the calendar'] },
      { id: 'planning-call', label: 'A planning call', fit: 'human', from: ['Run a planning call'] },
    ],
  },
  {
    id: 'segment-tags', name: 'Pick a segment / build tags', family: 'measure', fit: 'hybrid',
    fitWhy: 'AI can group the list; a person decides who should actually hear what.',
    types: [
      { id: 'pick-segment', label: 'Pick a segment', from: ['Pick the segment', 'Pick a segment'] },
      { id: 'build-tags', label: 'Build segments & tags', from: ['Build segments and tags'] },
      { id: 'import-contacts', label: 'Import & de-dupe contacts', from: ['Import and de-dupe contacts'] },
    ],
  },
  {
    id: 'assemble-report', name: 'Assemble & read a report', family: 'measure', fit: 'ai',
    fitWhy: 'AI pulls and writes up the numbers; a person reads them with the owner.',
    types: [
      { id: 'assemble', label: 'Pull the numbers', from: ['Assemble the numbers', 'Pull the data'] },
      { id: 'report-write', label: 'Write the report', from: ['Write a report'] },
      { id: 'read', label: 'Read the result', fit: 'human', from: ['Read the result', 'Read performance'] },
      { id: 'track', label: 'Track a trend / ranking', from: ['Track the result', 'Track the trend', 'Track rankings', 'Track cost per customer'] },
      { id: 'readout-call', label: 'A check-in call', fit: 'human', from: ['Run a check-in call'] },
    ],
  },
  {
    id: 'monitor-ops', name: 'Monitor ongoing ops', family: 'measure', fit: 'human',
    fitWhy: 'Someone has to keep watch on uptime, ratings, and monthly account care.',
    types: [
      { id: 'hosting', label: 'Hosting & uptime', from: ['Watch hosting and uptime'] },
      { id: 'monthly', label: 'Monthly account care', from: ['Monitor monthly', 'Manage monthly care'] },
      { id: 'ratings', label: 'Delivery / review ratings', from: ['Monitor ratings'] },
    ],
  },

  /* ── People & field ─────────────────────────────────────────────────── */
  {
    id: 'source-partner', name: 'Source, vet & close a partner', family: 'people', fit: 'human',
    fitWhy: 'Creators, partners, and rights are relationship work, not automation.',
    types: [
      { id: 'source-creator', label: 'Source & close a creator', from: ['Source a creator', 'Negotiate terms', 'Coordinate the visit'] },
      { id: 'map-partners', label: 'Map & sign partners', from: ['Map partner businesses', 'Set up partnerships'] },
      { id: 'ugc-rights', label: 'Get photo / UGC permission', from: ['Get photo permission'] },
    ],
  },
  {
    id: 'field-event', name: 'Run a field event', family: 'people', fit: 'human',
    fitWhy: 'Booths, permits, soft opens, and in-person visits are on-the-ground work.',
    types: [
      { id: 'scout', label: 'Scout & book events', from: ['Scout and book events'] },
      { id: 'permits', label: 'Handle permits', from: ['Handle permits'] },
      { id: 'booth', label: 'Run a sampling booth', from: ['Set up sampling booth'] },
      { id: 'soft-open', label: 'Run a soft opening', from: ['Run a soft opening'] },
      { id: 'visits', label: 'In-person visits', from: ['Make monthly in-person visits'] },
    ],
  },
  {
    id: 'capture-contacts', name: 'Capture contacts in person', family: 'people', fit: 'human',
    fitWhy: 'Collecting real signups at an event is hands-on at the table.',
    types: [
      { id: 'capture', label: 'Capture contacts', from: ['Capture contacts'] },
    ],
  },
  {
    id: 'assemble-kit', name: 'Assemble a kit', family: 'people', fit: 'hybrid',
    fitWhy: 'AI drafts the contents; a person assembles the press or concierge kit.',
    types: [
      { id: 'press-kit', label: 'A press / concierge kit', from: ['Build a press kit', 'Build the kit'] },
      { id: 'refresh-kit', label: 'Refresh a kit', from: ['Refresh the kit'] },
    ],
  },
  {
    id: 'prospect-list', name: 'Build a prospect / target list', family: 'people', fit: 'hybrid',
    fitWhy: 'AI can gather candidates; a person verifies who is worth pursuing.',
    types: [
      { id: 'target-list', label: 'A press / B2B target list', from: ['Build a target list'] },
      { id: 'local-groups', label: 'Find local groups', from: ['Find local groups'] },
    ],
  },
  {
    id: 'pitch-followup', name: 'Pitch & follow up', family: 'people', fit: 'human',
    fitWhy: 'Earned media and B2B run on real outreach and persistence.',
    types: [
      { id: 'pitch', label: 'Pitch the press', from: ['Pitch the press'] },
      { id: 'followup', label: 'Follow up on pitches', from: ['Follow up on pitches'] },
      { id: 'b2b', label: 'B2B outreach', from: ['Do B2B outreach'] },
    ],
  },
  {
    id: 'enable-staff', name: 'Enable staff', family: 'people', fit: 'human',
    fitWhy: 'AI can write the script; the staff still have to be trained to use it.',
    types: [
      { id: 'train', label: 'Train the staff', from: ['Train the staff'] },
      { id: 'one-pager', label: 'A staff one-pager', from: ['Write a staff one-pager'] },
      { id: 'script', label: 'A table-side script', from: ['Write a staff script'] },
    ],
  },
]

/* ── Recipes: the storefront bundles, mapped back to atoms ──────────────────
 * Each recipe is a familiar campaign or program an owner shops. It is made of
 * atom references (atom id + optional type + quantity). This is the seed for the
 * storefront layer and the proof that no bundle is lost in the restructure — it
 * is data, not the storefront UI itself. Quantities are approximate and meant to
 * be refined; `by` overrides who does that line when it differs from the atom. */

export type RecipeKind = 'program' | 'campaign'

export interface RecipeLine {
  atom: string
  /** Type id within the atom, when a specific variant is meant. */
  type?: string
  /** Roughly how many of this line the bundle includes per cycle. */
  qty?: number
  /** Override the atom/type fit for this line. */
  by?: AtomFit
}

export interface Recipe {
  /** Matches the priced-catalog service id, so the storefront keeps its price. */
  id: string
  name: string
  kind: RecipeKind
  lines: RecipeLine[]
}

export const RECIPES: Recipe[] = [
  /* programs (recurring engines) */
  { id: 'website-care', name: 'Website care', kind: 'program', lines: [
    { atom: 'monitor-ops', type: 'hosting' }, { atom: 'listing-update', type: 'hours-menu' }, { atom: 'web-page', type: 'speed' } ] },
  { id: 'listings-sync', name: 'Listings sync', kind: 'program', lines: [
    { atom: 'listing-update', type: 'sync', qty: 3 } ] },
  { id: 'video-engine', name: 'Video engine', kind: 'program', lines: [
    { atom: 'plan-calendar', type: 'month' }, { atom: 'shoot', type: 'video' }, { atom: 'edit-media', type: 'video-edit', qty: 8 }, { atom: 'write-copy', type: 'caption', qty: 8 }, { atom: 'schedule-publish', type: 'schedule' }, { atom: 'assemble-report' } ] },
  { id: 'social-mgmt', name: 'Social management', kind: 'program', lines: [
    { atom: 'plan-calendar', type: 'month' }, { atom: 'write-copy', type: 'social-post', qty: 12 }, { atom: 'schedule-publish', type: 'schedule' }, { atom: 'reply-engage', type: 'comments-dms' } ] },
  { id: 'gbp-posts', name: 'Google posts', kind: 'program', lines: [
    { atom: 'plan-calendar', type: 'month' }, { atom: 'write-copy', type: 'google-post', qty: 4 }, { atom: 'reply-engage', type: 'qa' }, { atom: 'schedule-publish', type: 'publish-google' } ] },
  { id: 'local-seo', name: 'Local SEO', kind: 'program', lines: [
    { atom: 'listing-update', type: 'fix' }, { atom: 'listing-update', type: 'schema' }, { atom: 'assemble-report', type: 'track' }, { atom: 'monitor-ops', type: 'monthly' } ] },
  { id: 'delivery-opt', name: 'Delivery optimization', kind: 'program', lines: [
    { atom: 'web-page', type: 'menu-build' }, { atom: 'web-page', type: 'menu-photos' }, { atom: 'write-copy', type: 'item-desc' }, { atom: 'paid-ads', type: 'promos' }, { atom: 'monitor-ops', type: 'ratings' } ] },
  { id: 'paid-ads', name: 'Paid ads', kind: 'program', lines: [
    { atom: 'paid-ads', type: 'build-ads' }, { atom: 'paid-ads', type: 'rotate' }, { atom: 'paid-ads', type: 'optimize' }, { atom: 'assemble-report', type: 'track' } ] },
  { id: 'nextdoor-local', name: 'Nextdoor local', kind: 'program', lines: [
    { atom: 'claim-listing', type: 'claim' }, { atom: 'prospect-list', type: 'local-groups' }, { atom: 'reply-engage', type: 'community' }, { atom: 'schedule-publish', type: 'geo-post' }, { atom: 'monitor-ops', type: 'monthly' } ] },
  { id: 'cross-promo', name: 'Cross promotion', kind: 'program', lines: [
    { atom: 'source-partner', type: 'map-partners' }, { atom: 'design-offer', type: 'reciprocal' }, { atom: 'design-graphic', type: 'printed-card' } ] },
  { id: 'truck-location', name: 'Truck location broadcast', kind: 'program', lines: [
    { atom: 'write-copy', type: 'social-post' }, { atom: 'listing-update', type: 'hours-menu', qty: 2 }, { atom: 'send-blast', type: 'email-blast' }, { atom: 'schedule-publish', type: 'schedule' } ] },
  { id: 'newsletter', name: 'Newsletter', kind: 'program', lines: [
    { atom: 'brainstorm', type: 'promo-ideas' }, { atom: 'write-copy', type: 'email' }, { atom: 'send-blast', type: 'email-blast' } ] },
  { id: 'sms-program', name: 'SMS program', kind: 'program', lines: [
    { atom: 'segment-tags', type: 'pick-segment' }, { atom: 'write-copy', type: 'sms' }, { atom: 'send-blast', type: 'text-blast' } ] },
  { id: 'bar-events', name: 'Bar events engine', kind: 'program', lines: [
    { atom: 'plan-calendar', type: 'month' }, { atom: 'design-graphic', type: 'feed-post' }, { atom: 'write-copy', type: 'social-post' }, { atom: 'send-blast', type: 'text-blast' }, { atom: 'listing-update', type: 'hours-menu' } ] },
  { id: 'catering-engine', name: 'Catering / B2B engine', kind: 'program', lines: [
    { atom: 'web-page', type: 'page-build' }, { atom: 'write-copy', type: 'proposal' }, { atom: 'build-automation', type: 'reminders' }, { atom: 'pitch-followup', type: 'b2b' } ] },
  { id: 'giftcards', name: 'Gift cards', kind: 'program', lines: [
    { atom: 'stand-up-platform', type: 'pos-giftcards' }, { atom: 'write-copy', type: 'social-post' }, { atom: 'write-copy', type: 'email' }, { atom: 'paid-ads', type: 'promos' } ] },
  { id: 'review-responses', name: 'Review responses', kind: 'program', lines: [
    { atom: 'write-copy', type: 'review-reply' }, { atom: 'assemble-report', type: 'track' } ] },
  { id: 'loyalty', name: 'Loyalty', kind: 'program', lines: [
    { atom: 'design-offer', type: 'program' }, { atom: 'margin-math' }, { atom: 'stand-up-platform', type: 'pos-giftcards' }, { atom: 'enable-staff', type: 'train' }, { atom: 'monitor-ops', type: 'monthly' } ] },
  { id: 'winback', name: 'Win-back', kind: 'program', lines: [
    { atom: 'build-automation', type: 'map' }, { atom: 'build-automation', type: 'build' }, { atom: 'write-copy', type: 'lifecycle-msg' }, { atom: 'test-flow', type: 'test' } ] },
  { id: 'referral', name: 'Referral', kind: 'program', lines: [
    { atom: 'design-offer', type: 'offer' }, { atom: 'set-tracking', type: 'tracking' }, { atom: 'enable-staff', type: 'script' }, { atom: 'build-automation', type: 'build' }, { atom: 'write-copy', type: 'lifecycle-msg' } ] },
  { id: 'friend-hook', name: 'Bring-a-friend', kind: 'program', lines: [
    { atom: 'design-offer', type: 'offer' }, { atom: 'design-graphic', type: 'feed-post' }, { atom: 'set-tracking', type: 'tracking' }, { atom: 'build-automation', type: 'build' }, { atom: 'test-flow', type: 'test' } ] },
  { id: 'birthday', name: 'Birthday', kind: 'program', lines: [
    { atom: 'stand-up-platform', type: 'birthday-field' }, { atom: 'write-copy', type: 'sms' }, { atom: 'build-automation', type: 'build' }, { atom: 'test-flow', type: 'test' }, { atom: 'assemble-report', type: 'track' } ] },
  { id: 'seasonal-cal', name: 'Seasonal calendar', kind: 'program', lines: [
    { atom: 'plan-calendar', type: 'quarter' }, { atom: 'plan-calendar', type: 'refresh' }, { atom: 'brainstorm', type: 'promo-ideas' } ] },
  { id: 'concierge', name: 'Concierge outreach', kind: 'program', lines: [
    { atom: 'design-graphic', type: 'printed-card' }, { atom: 'assemble-kit', type: 'press-kit' }, { atom: 'field-event', type: 'visits' }, { atom: 'set-tracking', type: 'tracking' }, { atom: 'assemble-kit', type: 'refresh-kit' } ] },
  { id: 'reporting', name: 'Reporting', kind: 'program', lines: [
    { atom: 'assemble-report', type: 'assemble' }, { atom: 'assemble-report', type: 'report-write' }, { atom: 'assemble-report', type: 'readout-call' } ] },
  { id: 'happy-hour-engine', name: 'Happy hour engine', kind: 'program', lines: [
    { atom: 'design-offer', type: 'offer' }, { atom: 'margin-math' }, { atom: 'enable-staff', type: 'train' }, { atom: 'write-copy', type: 'social-post' }, { atom: 'schedule-publish', type: 'schedule' }, { atom: 'listing-update', type: 'hours-menu' } ] },
  { id: 'ugc-rights', name: 'UGC rights & curation', kind: 'program', lines: [
    { atom: 'source-partner', type: 'ugc-rights' }, { atom: 'schedule-publish', type: 'curate-ugc' }, { atom: 'write-copy', type: 'caption' } ] },

  /* campaigns (one-time pushes) */
  { id: 'creator-collab', name: 'Creator collab', kind: 'campaign', lines: [
    { atom: 'source-partner', type: 'source-creator' }, { atom: 'write-copy', type: 'creator-brief' } ] },
  { id: 'street-sampling', name: 'Street sampling', kind: 'campaign', lines: [
    { atom: 'field-event', type: 'scout' }, { atom: 'field-event', type: 'permits' }, { atom: 'field-event', type: 'booth' }, { atom: 'set-tracking', type: 'tracking' }, { atom: 'capture-contacts', type: 'capture' } ] },
  { id: 'pr-media', name: 'PR / media', kind: 'campaign', lines: [
    { atom: 'brainstorm', type: 'story-angle' }, { atom: 'assemble-kit', type: 'press-kit' }, { atom: 'prospect-list', type: 'target-list' }, { atom: 'pitch-followup', type: 'pitch' }, { atom: 'pitch-followup', type: 'followup' } ] },
  { id: 'fb-event', name: 'Facebook event', kind: 'campaign', lines: [
    { atom: 'web-page', type: 'page-build' }, { atom: 'design-graphic', type: 'feed-post' }, { atom: 'schedule-publish', type: 'invite' }, { atom: 'build-automation', type: 'reminders' } ] },
  { id: 'pre-opening', name: 'Pre-opening launch', kind: 'campaign', lines: [
    { atom: 'web-page', type: 'page-build' }, { atom: 'claim-listing', type: 'claim' }, { atom: 'plan-calendar', type: 'month' }, { atom: 'field-event', type: 'soft-open' }, { atom: 'pitch-followup', type: 'pitch' } ] },
  { id: 'welcome-seq', name: 'Welcome sequence', kind: 'campaign', lines: [
    { atom: 'build-automation', type: 'map' }, { atom: 'build-automation', type: 'build' }, { atom: 'write-copy', type: 'email' }, { atom: 'write-copy', type: 'sms' }, { atom: 'test-flow', type: 'test' } ] },
  { id: 'event-pkg', name: 'Event package', kind: 'campaign', lines: [
    { atom: 'design-graphic', type: 'feed-post' }, { atom: 'write-copy', type: 'email' }, { atom: 'write-copy', type: 'sms' }, { atom: 'write-copy', type: 'google-post' }, { atom: 'write-copy', type: 'story' } ] },
  { id: 'vip-comms', name: 'VIP comms', kind: 'campaign', lines: [
    { atom: 'segment-tags', type: 'pick-segment' }, { atom: 'write-copy', type: 'email' }, { atom: 'write-copy', type: 'sms' }, { atom: 'send-blast', type: 'email-blast' }, { atom: 'send-blast', type: 'text-blast' } ] },
  { id: 'menu-photo-refresh', name: 'Menu photo refresh', kind: 'campaign', lines: [
    { atom: 'shoot', type: 'shot-list' }, { atom: 'shoot', type: 'photo' }, { atom: 'edit-media', type: 'photo-edit' }, { atom: 'listing-update', type: 'sync' } ] },
  { id: 'lto-launch', name: 'Limited-time offer launch', kind: 'campaign', lines: [
    { atom: 'write-copy', type: 'social-post' }, { atom: 'write-copy', type: 'email' }, { atom: 'write-copy', type: 'sms' }, { atom: 'write-copy', type: 'google-post' }, { atom: 'design-graphic', type: 'feed-post' }, { atom: 'schedule-publish', type: 'schedule' } ] },
]

/* ── Helpers ────────────────────────────────────────────────────────────── */

const ATOM_BY_ID = new Map(ATOMIC_ACTIONS.map((a) => [a.id, a]))

export function atomById(id: string): AtomicAction | undefined {
  return ATOM_BY_ID.get(id)
}

/** Effective fit for a line: the type override, else the atom default. */
export function fitOf(atomId: string, typeId?: string): AtomFit | undefined {
  const atom = ATOM_BY_ID.get(atomId)
  if (!atom) return undefined
  const t = typeId ? atom.types.find((x) => x.id === typeId) : undefined
  return t?.fit ?? atom.fit
}

/** Every concrete action type, flattened — the builder's full pick list. */
export function allActionTypes(): { atom: AtomicAction; type: ActionType; fit: AtomFit }[] {
  const out: { atom: AtomicAction; type: ActionType; fit: AtomFit }[] = []
  for (const atom of ATOMIC_ACTIONS) for (const type of atom.types) out.push({ atom, type, fit: type.fit ?? atom.fit })
  return out
}

/** Resolve a recipe's lines to their atoms/types (drops any unresolved line). */
export function expandRecipe(recipe: Recipe) {
  return recipe.lines
    .map((l) => {
      const atom = ATOM_BY_ID.get(l.atom)
      if (!atom) return null
      const type = l.type ? atom.types.find((t) => t.id === l.type) : undefined
      return { atom, type, qty: l.qty ?? 1, fit: l.by ?? type?.fit ?? atom.fit }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
}

/** Coverage audit — proves the restructure is lossless. Pure, no throw.
 *  - sourceStrings: total `from` entries across all types (should be 178)
 *  - duplicates: any source string claimed by more than one type (should be empty)
 *  - unresolvedRecipeLines: recipe lines whose atom/type id doesn't exist */
export function atomicCoverage() {
  const seen = new Map<string, number>()
  let sourceStrings = 0
  for (const atom of ATOMIC_ACTIONS) {
    for (const type of atom.types) {
      for (const s of type.from) {
        sourceStrings++
        seen.set(s, (seen.get(s) ?? 0) + 1)
      }
    }
  }
  const duplicates = [...seen.entries()].filter(([, n]) => n > 1).map(([s]) => s)
  const unresolvedRecipeLines: { recipe: string; atom: string; type?: string }[] = []
  for (const r of RECIPES) {
    for (const l of r.lines) {
      const atom = ATOM_BY_ID.get(l.atom)
      if (!atom || (l.type && !atom.types.find((t) => t.id === l.type))) {
        unresolvedRecipeLines.push({ recipe: r.id, atom: l.atom, type: l.type })
      }
    }
  }
  return {
    atoms: ATOMIC_ACTIONS.length,
    actionTypes: allActionTypes().length,
    distinctSourceStrings: seen.size,
    sourceStrings,
    duplicates,
    recipes: RECIPES.length,
    unresolvedRecipeLines,
    fitTally: ATOMIC_ACTIONS.reduce(
      (acc, a) => ({ ...acc, [a.fit]: (acc[a.fit] ?? 0) + 1 }),
      {} as Record<AtomFit, number>,
    ),
  }
}
