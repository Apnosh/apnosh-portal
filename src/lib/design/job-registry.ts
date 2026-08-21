/**
 * THE TYPE REGISTRY — every graphic type as one config record (P1 of the
 * catalog decision, owner call 2026-08-21: format is the product, TOPIC is the
 * tag; adding a type must stay a one-record change with no pricing decision).
 *
 * One record drives everything that knows about a type:
 *   - the visual shelf (group, emoji, tint) on the order flow's step 1
 *   - the headline seed step 2 starts warm with
 *   - what the type genuinely needs asked (asks) and its timing reality
 *   - the analytics tag that rides order -> draft -> send-off -> published post,
 *     so "what does what" is a query and the recommender can learn per type
 *
 * Labels and free-text matcher cues stay in design-read.ts (the reader's
 * vocabulary); this file is the type's PRODUCT-side truth.
 */

import { DESIGN_JOBS, type DesignJobId } from './design-read'

/** What a type genuinely needs from the owner beyond the shared steps. */
export type JobAsk = 'eventDate' | 'endDate' | 'subject' | 'offer' | 'question'

export interface JobSpec {
  id: DesignJobId
  /** analytics tag, always 'graphic:<id>' — the spine value stored downstream */
  tag: string
  group: 'brand' | 'info' | 'engage' | 'everyday' | 'push'
  emoji: string
  /** 'piece' = a specific single graphic (shows on the graphics shelf);
   *  'push' = a marketing MOMENT that wants a full campaign, not one image —
   *  kept in the registry for the campaign bridge, hidden from the graphic
   *  shelf (owner call 2026-08-21: graphics is the custom/specific lane). */
  scope: 'piece' | 'push'
  /** step-2 starts warm with this */
  headline?: string
  /** info this type is empty without (drives future per-type questions) */
  asks: readonly JobAsk[]
  /** honest timing note, e.g. a countdown is pointless without lead time */
  timing?: 'needs-lead-time' | 'date-anchored' | 'evergreen'
}

export const JOB_GROUP_META: Record<JobSpec['group'], { name: string; dot: string; tint: string }> = {
  brand: { name: 'Your story and brand', dot: '#B7791F', tint: '#FBF3E4' },
  info: { name: 'Menus and announcements', dot: '#3A6B9E', tint: '#EAF1F8' },
  engage: { name: 'Posts that engage', dot: '#C25E8B', tint: '#FAEEF3' },
  everyday: { name: 'Everyday needs', dot: '#2E9A78', tint: '#EAF6F1' },
  /* never rendered on the graphics shelf; these become campaign cards */
  push: { name: 'Campaign moments', dot: '#7A5EA8', tint: '#F3EDF8' },
}

const spec = (
  id: DesignJobId, group: JobSpec['group'], emoji: string,
  extra: Partial<Pick<JobSpec, 'headline' | 'asks' | 'timing' | 'scope'>> = {},
): JobSpec => ({ id, tag: `graphic:${id}`, group, emoji, asks: [], timing: 'evergreen', scope: group === 'push' ? 'push' : 'piece', ...extra })

export const JOB_REGISTRY: readonly JobSpec[] = [
  // your story and brand
  spec('story-behind', 'brand', '👋', { headline: 'The Story Behind Us', asks: ['subject'] }),
  spec('team-spotlight', 'brand', '🧑‍🍳', { headline: 'Meet The Team', asks: ['subject'] }),
  spec('behind-scenes', 'brand', '🎬', { headline: 'Behind The Scenes' }),
  spec('before-after', 'brand', '🔁', { headline: 'The Before And After', asks: ['subject'] }),
  spec('guest-love', 'brand', '⭐', { headline: 'What Our Guests Say', asks: ['subject'] }),
  spec('milestone', 'brand', '🎂', { headline: 'Thank You For The Years', asks: ['subject'], timing: 'date-anchored' }),
  spec('community', 'brand', '💚', { headline: 'Giving Back', asks: ['subject'] }),
  // menus and announcements
  spec('new-menu', 'info', '📖', { headline: 'Our New Menu' }),
  spec('new-item', 'info', '✨', { headline: 'New On The Menu', asks: ['subject'] }),
  spec('announcement', 'info', '📣', { headline: 'Big News', asks: ['subject'] }),
  spec('press', 'info', '📰', { headline: 'As Seen In', asks: ['subject'] }),
  spec('collab', 'info', '🤝', { headline: 'A Special Collab', asks: ['subject'] }),
  spec('catering', 'info', '🥂', { headline: 'Let Us Cater Your Day' }),
  spec('holiday-hours', 'info', '🕐', { headline: 'Holiday Hours', timing: 'date-anchored' }),
  // posts that engage
  spec('carousel', 'engage', '🎠', { asks: ['subject'] }),
  spec('tips', 'engage', '💡', { headline: 'Three Things To Know', asks: ['subject'] }),
  spec('faq', 'engage', '💬', { headline: 'You Asked, We Answered', asks: ['question'] }),
  spec('poll', 'engage', '🗳️', { headline: 'You Tell Us', asks: ['question'] }),
  spec('countdown', 'engage', '⏳', { headline: 'Almost Here', asks: ['eventDate'], timing: 'needs-lead-time' }),
  spec('recap', 'engage', '🙌', { headline: 'What A Night', asks: ['eventDate'] }),
  // everyday needs
  spec('weekly-special', 'everyday', '🍽️', { headline: 'This Week Only', asks: ['offer'], timing: 'date-anchored' }),
  spec('happy-hour', 'everyday', '🍸', { headline: 'Happy Hour, Every Day', asks: ['offer'] }),
  spec('hiring', 'everyday', '📋', { headline: 'Join Our Team', asks: ['subject'] }),
  spec('gift-cards', 'everyday', '💳', { headline: 'Give The Gift Of Dinner' }),
  spec('referral', 'everyday', '🫶', { headline: 'Bring A Friend', asks: ['offer'] }),
  spec('other', 'everyday', '❓'),
  // campaign MOMENTS — push scope, off the graphics shelf, wired later as campaign cards
  spec('flash-sale', 'push', '⚡', { headline: 'Today Only', asks: ['offer', 'endDate'], timing: 'needs-lead-time' }),
  spec('event-promo', 'push', '🎶', { headline: 'One Night Only', asks: ['eventDate'], timing: 'needs-lead-time' }),
  spec('seasonal', 'push', '🍂', { headline: 'New Season, New Flavors', timing: 'date-anchored' }),
  spec('giveaway', 'push', '🎁', { headline: 'Enter To Win', asks: ['offer', 'endDate'], timing: 'needs-lead-time' }),
  spec('sports-night', 'push', '🏈', { headline: 'Watch It Here', asks: ['eventDate'], timing: 'needs-lead-time' }),
  spec('book-us', 'push', '📅', { headline: 'Book Your Spot' }),
  spec('order-online', 'push', '🛵', { headline: 'Order Online Now' }),
]

export function jobSpec(id: string | null | undefined): JobSpec | null {
  return JOB_REGISTRY.find((j) => j.id === id) ?? null
}

export function jobLabelOf(id: DesignJobId): string {
  return DESIGN_JOBS.find((x) => x.id === id)?.label ?? id
}

/** The GRAPHICS shelf: piece-scope only — the custom/specific lane. Push-scope
 *  types stay registered (tag spine, matcher, future campaign cards) but never
 *  render here. */
export const JOB_SHELF = (['brand', 'info', 'engage', 'everyday'] as const).map((g) => ({
  ...JOB_GROUP_META[g],
  jobs: JOB_REGISTRY.filter((j) => j.group === g && j.scope === 'piece'),
}))
