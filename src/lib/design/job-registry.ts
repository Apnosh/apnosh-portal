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
  group: 'promote' | 'story' | 'announce' | 'engage' | 'practical'
  emoji: string
  /** step-2 starts warm with this */
  headline?: string
  /** info this type is empty without (drives future per-type questions) */
  asks: readonly JobAsk[]
  /** honest timing note, e.g. a countdown is pointless without lead time */
  timing?: 'needs-lead-time' | 'date-anchored' | 'evergreen'
}

export const JOB_GROUP_META: Record<JobSpec['group'], { name: string; dot: string; tint: string }> = {
  promote: { name: 'Promote something', dot: '#2E9A78', tint: '#EAF6F1' },
  story: { name: 'Tell your story', dot: '#B7791F', tint: '#FBF3E4' },
  announce: { name: 'Announce', dot: '#3A6B9E', tint: '#EAF1F8' },
  engage: { name: 'Get people talking', dot: '#C25E8B', tint: '#FAEEF3' },
  practical: { name: 'The practical stuff', dot: '#7A5EA8', tint: '#F3EDF8' },
}

const spec = (
  id: DesignJobId, group: JobSpec['group'], emoji: string,
  extra: Partial<Pick<JobSpec, 'headline' | 'asks' | 'timing'>> = {},
): JobSpec => ({ id, tag: `graphic:${id}`, group, emoji, asks: [], timing: 'evergreen', ...extra })

export const JOB_REGISTRY: readonly JobSpec[] = [
  // promote
  spec('weekly-special', 'promote', '🍽️', { headline: 'This Week Only', asks: ['offer'], timing: 'date-anchored' }),
  spec('flash-sale', 'promote', '⚡', { headline: 'Today Only', asks: ['offer', 'endDate'], timing: 'needs-lead-time' }),
  spec('happy-hour', 'promote', '🍸', { headline: 'Happy Hour, Every Day', asks: ['offer'] }),
  spec('event-promo', 'promote', '🎶', { headline: 'One Night Only', asks: ['eventDate'], timing: 'needs-lead-time' }),
  spec('seasonal', 'promote', '🍂', { headline: 'New Season, New Flavors', timing: 'date-anchored' }),
  spec('giveaway', 'promote', '🎁', { headline: 'Enter To Win', asks: ['offer', 'endDate'], timing: 'needs-lead-time' }),
  spec('sports-night', 'promote', '🏈', { headline: 'Watch It Here', asks: ['eventDate'], timing: 'needs-lead-time' }),
  // story
  spec('story-behind', 'story', '👋', { headline: 'The Story Behind Us', asks: ['subject'] }),
  spec('team-spotlight', 'story', '🧑‍🍳', { headline: 'Meet The Team', asks: ['subject'] }),
  spec('behind-scenes', 'story', '🎬', { headline: 'Behind The Scenes' }),
  spec('before-after', 'story', '🔁', { headline: 'The Before And After', asks: ['subject'] }),
  spec('guest-love', 'story', '⭐', { headline: 'What Our Guests Say', asks: ['subject'] }),
  spec('milestone', 'story', '🎂', { headline: 'Thank You For The Years', asks: ['subject'], timing: 'date-anchored' }),
  spec('community', 'story', '💚', { headline: 'Giving Back', asks: ['subject'] }),
  spec('carousel', 'story', '🎠', { asks: ['subject'] }),
  // announce
  spec('new-menu', 'announce', '📖', { headline: 'Our New Menu' }),
  spec('new-item', 'announce', '✨', { headline: 'New On The Menu', asks: ['subject'] }),
  spec('announcement', 'announce', '📣', { headline: 'Big News', asks: ['subject'] }),
  spec('collab', 'announce', '🤝', { headline: 'A Special Collab', asks: ['subject'] }),
  spec('catering', 'announce', '🥂', { headline: 'Let Us Cater Your Day' }),
  spec('book-us', 'announce', '📅', { headline: 'Book Your Spot' }),
  spec('order-online', 'announce', '🛵', { headline: 'Order Online Now' }),
  spec('press', 'announce', '📰', { headline: 'As Seen In', asks: ['subject'] }),
  // engage
  spec('tips', 'engage', '💡', { headline: 'Three Things To Know', asks: ['subject'] }),
  spec('faq', 'engage', '💬', { headline: 'You Asked, We Answered', asks: ['question'] }),
  spec('poll', 'engage', '🗳️', { headline: 'You Tell Us', asks: ['question'] }),
  spec('countdown', 'engage', '⏳', { headline: 'Almost Here', asks: ['eventDate'], timing: 'needs-lead-time' }),
  spec('recap', 'engage', '🙌', { headline: 'What A Night', asks: ['eventDate'] }),
  // practical
  spec('holiday-hours', 'practical', '🕐', { headline: 'Holiday Hours', timing: 'date-anchored' }),
  spec('hiring', 'practical', '📋', { headline: 'Join Our Team', asks: ['subject'] }),
  spec('gift-cards', 'practical', '💳', { headline: 'Give The Gift Of Dinner' }),
  spec('referral', 'practical', '🫶', { headline: 'Bring A Friend', asks: ['offer'] }),
  spec('other', 'practical', '❓'),
]

export function jobSpec(id: string | null | undefined): JobSpec | null {
  return JOB_REGISTRY.find((j) => j.id === id) ?? null
}

export function jobLabelOf(id: DesignJobId): string {
  return DESIGN_JOBS.find((x) => x.id === id)?.label ?? id
}

/** The shelf, grouped in registry order — the flow renders exactly this. */
export const JOB_SHELF = (['promote', 'story', 'announce', 'engage', 'practical'] as const).map((g) => ({
  ...JOB_GROUP_META[g],
  jobs: JOB_REGISTRY.filter((j) => j.group === g),
}))
