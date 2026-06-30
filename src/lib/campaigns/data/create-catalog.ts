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
 */
export const CREATE_CATALOG: { id: string; title: string; goal: GoalKey }[] = [
  { id: 'reach', title: 'Reach new locals', goal: 'new-customers' },
  { id: 'nights', title: 'Fill your slow nights', goal: 'slow-nights' },
  { id: 'firstvisit', title: 'Win first-time visits', goal: 'new-customers' },
  { id: 'regulars', title: 'Turn first-timers into regulars', goal: 'regulars' },
  { id: 'catering', title: 'Catering and big orders', goal: 'new-customers' },
  { id: 'reviewsplan', title: 'Boost reviews and rating', goal: 'reviews' },
  { id: 'reel', title: 'A short video reel', goal: 'new-customers' },
  { id: 'story', title: 'A story post', goal: 'new-customers' },
  { id: 'carousel', title: 'A carousel post', goal: 'new-customers' },
  { id: 'graphic', title: 'A designed graphic', goal: 'new-customers' },
  { id: 'dish', title: 'Feature a dish', goal: 'new-customers' },
  { id: 'gpost', title: 'A Google Business post', goal: 'new-customers' },
  { id: 'promoevent', title: 'Promote an event', goal: 'slow-nights' },
  { id: 'launch', title: 'Launch a special', goal: 'new-customers' },
  { id: 'creator', title: 'Work with a creator', goal: 'new-customers' },
  { id: 'welcome', title: 'Welcome new subscribers', goal: 'regulars' },
  { id: 'second', title: 'Nudge a second visit', goal: 'regulars' },
  { id: 'news', title: 'Monthly newsletter', goal: 'regulars' },
  { id: 'slowoffer', title: 'Slow-night offer email and text', goal: 'slow-nights' },
  { id: 'birthday', title: 'Birthday treat', goal: 'regulars' },
  { id: 'earlyaccess', title: 'Early access for regulars', goal: 'regulars' },
  { id: 'shoot', title: 'Book a photo and video shoot', goal: 'new-customers' },
  { id: 'gbp', title: 'Polish your Google profile', goal: 'reviews' },
  { id: 'reviewsreply', title: 'Reply to reviews', goal: 'reviews' },
  { id: 'qr', title: 'Add a table QR', goal: 'regulars' },
  { id: 'friction', title: 'Smooth out ordering', goal: 'new-customers' },
  { id: 'giftcard', title: 'Push gift cards', goal: 'new-customers' },
  { id: 'ticket', title: 'Run a ticketed event', goal: 'new-customers' },
  { id: 'winback', title: 'Win back quiet guests', goal: 'regulars' },
]

/** Just the ids, for consumers that only need the closed set (e.g. the deep-link validator). */
export const CREATE_CATALOG_IDS: readonly string[] = CREATE_CATALOG.map((c) => c.id)
