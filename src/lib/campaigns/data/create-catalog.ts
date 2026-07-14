import type { GoalKey } from '../types'

/**
 * SINGLE SOURCE OF TRUTH for the create-page campaign catalog — the items the owner picks from in the
 * builder. Three places must agree on this id set:
 *   1. the recommend feed (planning/recommend-create-items) — imports CREATE_CATALOG directly,
 *   2. the builder's deep-link validator (builder-entry CATALOG_IDS) — derives from CREATE_CATALOG_IDS,
 *   3. the JSX render catalog (apnosh-campaign.jsx `CATALOG`) — owns the card render data, so it keeps
 *      its own list, but scripts/verify-catalog-ids.ts asserts its ids equal this set.
 * Result: a recommendable id can never drift away from a renderable/plannable one without the guard
 * failing. `goal` is the GoalKey the rules ranker buckets the item under.
 *
 * `stages` = the 1-2 Home-funnel legs this item GENUINELY moves, audited against each item's real
 * composed line items (2026-07-09 catalog audit — e.g. slow-nights is orders+back because half its
 * plan is retention machinery). Rendered as tags on the campaign cards so owners see which of their
 * funnel numbers a campaign moves, in the same words Home teaches.
 */
export type FunnelStage = 'aware' | 'interest' | 'actions' | 'orders' | 'back'

/** All funnel stages in funnel order — the closed set for tag pickers + validators. */
export const FUNNEL_STAGES: readonly FunnelStage[] = ['aware', 'interest', 'actions', 'orders', 'back']

/** Owner-facing tag words — the home-funnel stage labels (short form for chips). */
export const STAGE_TAG_LABEL: Record<FunnelStage, string> = {
  aware: 'Awareness',
  interest: 'Interest',
  actions: 'Actions',
  orders: 'Orders',
  back: 'Retention',
}

// Literal source (as const) so the id set exists as a TYPE (CreateCatalogId). Per-card
// content maps (product-page copy, why templates) key on that union, so adding a card
// here without authoring its content is a COMPILE error, not a silent fallback.
const SOURCE = [
  { id: 'reach', title: 'Run local ads', goal: 'new-customers', stages: ['aware'] },
  { id: 'nights', title: 'Fill your slow nights', goal: 'slow-nights', stages: ['orders', 'back'] },
  { id: 'firstvisit', title: 'Win first-time visits', goal: 'new-customers', stages: ['aware', 'actions'] },
  { id: 'regulars', title: 'Turn first-timers into regulars', goal: 'regulars', stages: ['back'] },
  { id: 'catering', title: 'Promote your catering', goal: 'new-customers', stages: ['orders'] },
  { id: 'reviewsplan', title: 'Boost reviews and rating', goal: 'reviews', stages: ['interest', 'aware'] },
  { id: 'reel', title: 'A short video reel', goal: 'new-customers', stages: ['interest'] },
  { id: 'story', title: 'A story post', goal: 'new-customers', stages: ['interest'] },
  { id: 'graphic', title: 'A social media post', goal: 'new-customers', stages: ['interest'] },
  { id: 'dish', title: 'Feature a dish', goal: 'new-customers', stages: ['interest'] },
  { id: 'edit', title: 'Edit my footage', goal: 'new-customers', stages: ['interest'] },
  { id: 'gpost', title: 'A Google Business post', goal: 'new-customers', stages: ['aware'] },
  { id: 'listings', title: 'Get listed everywhere', goal: 'new-customers', stages: ['aware'] },
  { id: 'website', title: 'Fix your website and menu', goal: 'new-customers', stages: ['aware', 'actions'] },
  { id: 'localseo', title: 'Show up in local search', goal: 'new-customers', stages: ['aware'] },
  { id: 'delivery', title: 'Tune up your delivery apps', goal: 'new-customers', stages: ['aware', 'orders'] },
  { id: 'nextdoor', title: 'Get known on Nextdoor', goal: 'new-customers', stages: ['aware'] },
  { id: 'promoevent', title: 'Promote an event', goal: 'slow-nights', stages: ['orders', 'aware'] },
  { id: 'launch', title: 'Launch a special', goal: 'new-customers', stages: ['aware', 'orders'] },
  { id: 'creator', title: 'Work with a creator', goal: 'new-customers', stages: ['aware'] },
  { id: 'welcome', title: 'Welcome new subscribers', goal: 'regulars', stages: ['back'] },
  { id: 'news', title: 'Monthly newsletter', goal: 'regulars', stages: ['back'] },
  { id: 'slowoffer', title: 'Slow-night offer email and text', goal: 'slow-nights', stages: ['orders', 'back'] },
  { id: 'birthday', title: 'Birthday treat', goal: 'regulars', stages: ['back'] },
  { id: 'earlyaccess', title: 'Early access for regulars', goal: 'regulars', stages: ['back'] },
  { id: 'shoot', title: 'Book a photo and video shoot', goal: 'new-customers', stages: ['interest'] },
  { id: 'gbp', title: 'Polish your Google profile', goal: 'reviews', stages: ['aware', 'actions'] },
  { id: 'reviewsreply', title: 'Reply to reviews', goal: 'reviews', stages: ['interest'] },
  { id: 'qr', title: 'Add a table QR', goal: 'regulars', stages: ['actions', 'back'] },
  { id: 'friction', title: 'Smooth out ordering', goal: 'new-customers', stages: ['actions'] },
  { id: 'giftcard', title: 'Push gift cards', goal: 'new-customers', stages: ['orders'] },
  { id: 'ticket', title: 'Run a ticketed event', goal: 'new-customers', stages: ['orders', 'aware'] },
  { id: 'winback', title: 'Win back quiet guests', goal: 'regulars', stages: ['back'] },
  { id: 'direct', title: 'Get orders direct', goal: 'regulars', stages: ['actions', 'back'] },
] as const satisfies readonly { id: string; title: string; goal: GoalKey; stages: readonly FunnelStage[] }[]

/** The closed union of create-catalog ids. Per-card maps (product-page content, why
 *  templates) are typed Record<CreateCatalogId, …> so coverage is checked at compile time. */
export type CreateCatalogId = (typeof SOURCE)[number]['id']

export const CREATE_CATALOG: { id: CreateCatalogId; title: string; goal: GoalKey; stages: FunnelStage[] }[] =
  SOURCE.map((c) => ({ ...c, stages: [...c.stages] }))

/** Just the ids, for consumers that only need the closed set (e.g. the deep-link validator). */
export const CREATE_CATALOG_IDS: readonly string[] = CREATE_CATALOG.map((c) => c.id)
