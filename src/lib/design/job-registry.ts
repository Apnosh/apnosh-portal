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
  /** info this type is empty without (drives the per-type step-2 blanks) */
  asks: readonly JobAsk[]
  /** step-2 voice: the type's own question, labels, and example blanks, so
   *  picking a type reshapes the flow instead of funneling into generic slots */
  voice?: {
    /** step 1 sub when this type is picked: what this post does for you */
    blurb?: string
    /** the warm one-line question step 2 leads with */
    ask: string
    /** label for the supporting line (replaces the generic details label) */
    subject?: string
    subjectPh?: string
    /** placeholder for the big line; for question types this IS the question */
    headlinePh?: string
    /** extra tap-in title ideas beyond the headline seed */
    headlines?: readonly string[]
    offerPh?: string
  }
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
  extra: Partial<Pick<JobSpec, 'headline' | 'asks' | 'timing' | 'scope' | 'voice'>> = {},
): JobSpec => ({ id, tag: `graphic:${id}`, group, emoji, asks: [], timing: 'evergreen', scope: group === 'push' ? 'push' : 'piece', ...extra })

export const JOB_REGISTRY: readonly JobSpec[] = [
  // your story and brand
  spec('story-behind', 'brand', '👋', { headline: 'The Story Behind Us', asks: ['subject'], voice: { blurb: 'The post that tells people who you are and why you started.', ask: 'Tell your story in one line. We shape the rest.', subject: 'The story', subjectPh: 'Two sisters, one dream, opened in 2019', headlinePh: 'How It All Started', headlines: ['How It All Started', 'From Our Family To Yours'] } }),
  spec('team-spotlight', 'brand', '🧑‍🍳', { headline: 'Meet The Team', asks: ['subject'], voice: { blurb: 'Put a face to the business. People buy from people.', ask: 'Who are we introducing?', subject: 'About them', subjectPh: 'Maria has run our kitchen for 6 years', headlinePh: 'Meet Maria', headlines: ['The Face Behind The Counter'] } }),
  spec('behind-scenes', 'brand', '🎬', { headline: 'Behind The Scenes', voice: { blurb: 'Show how the work gets done. People love a peek inside.', ask: 'What are we letting people see?', subject: 'What we are showing', subjectPh: 'How we prep everything fresh each morning', headlinePh: 'A Look Inside', headlines: ['How We Make It', 'A Look Inside'] } }),
  spec('before-after', 'brand', '🔁', { headline: 'The Before And After', asks: ['subject'], voice: { blurb: 'Show the change side by side. The proof does the talking.', ask: 'What changed? We show the difference.', subject: 'The change', subjectPh: 'Our space, before and after the remodel', headlinePh: 'What A Difference', headlines: ['What A Difference'] } }),
  spec('guest-love', 'brand', '⭐', { headline: 'What Our Guests Say', asks: ['subject'], voice: { blurb: 'Turn a happy customer\'s words into a post worth sharing.', ask: 'Which review or kind words are we featuring?', subject: 'The quote, their words', subjectPh: 'Best in town, hands down. From Maria G.', headlinePh: 'You Said It Best', headlines: ['Five Stars', 'You Said It Best'] } }),
  spec('milestone', 'brand', '🎂', { headline: 'Thank You For The Years', asks: ['subject'], timing: 'date-anchored', voice: { blurb: 'Celebrate a win with the people who got you there.', ask: 'What are we celebrating?', subject: 'The milestone', subjectPh: '10 years serving this neighborhood', headlinePh: 'Ten Years Strong', headlines: ['Ten Years Strong', 'Cheers To You'] } }),
  spec('community', 'brand', '💚', { headline: 'Giving Back', asks: ['subject'], voice: { blurb: 'Show the good you do around town.', ask: 'Who or what are we supporting?', subject: 'The cause', subjectPh: 'A fundraiser night for Lincoln Elementary', headlinePh: 'For Our Neighbors', headlines: ['For Our Neighbors'] } }),
  // menus and announcements
  spec('new-menu', 'info', '📖', { headline: 'Our New Menu', voice: { blurb: 'Announce the new lineup and get people curious.', ask: 'What is new? A taste, not the whole list.', subject: 'What changed', subjectPh: 'Twelve new dishes for summer', headlinePh: 'The New Menu Is Here', headlines: ['The New Menu Is Here'] } }),
  spec('new-item', 'info', '✨', { headline: 'New On The Menu', asks: ['subject'], voice: { blurb: 'Give something new its moment.', ask: 'What is the new item?', subject: 'Make it sound good', subjectPh: 'Smoked brisket sandwich with house slaw', headlinePh: 'Say Hello To The New One', headlines: ['Say Hello To The New One'] } }),
  spec('announcement', 'info', '📣', { headline: 'Big News', asks: ['subject'], voice: { blurb: 'Big news, told simply and proudly.', ask: 'What is the news?', subject: 'The news', subjectPh: 'We are opening a second location downtown', headlinePh: 'Big News', headlines: ['It Is Official'] } }),
  spec('press', 'info', '📰', { headline: 'As Seen In', asks: ['subject'], voice: { blurb: 'Someone wrote you up. Let everyone know.', ask: 'Who featured you, and what did they say?', subject: 'The mention', subjectPh: 'Named a top 10 spot by the Weekly', headlinePh: 'As Seen In The Weekly', headlines: ['In The News'] } }),
  spec('collab', 'info', '🤝', { headline: 'A Special Collab', asks: ['subject'], voice: { blurb: 'Two names, one moment. Tell both crowds.', ask: 'Who is the collab with, and what are you doing together?', subject: 'The partner and the plan', subjectPh: 'One night only menu with Blue Door Brewing', headlinePh: 'A Special Collab', headlines: ['Better Together'] } }),
  spec('catering', 'info', '🥂', { headline: 'Let Us Cater Your Day', voice: { blurb: 'Remind people you can handle their big day.', ask: 'What do you cater, and for how many?', subject: 'What you offer', subjectPh: 'Weddings, office lunches, parties up to 200', headlinePh: 'We Bring The Food', headlines: ['We Bring The Food'] } }),
  spec('holiday-hours', 'info', '🕐', { headline: 'Holiday Hours', timing: 'date-anchored', voice: { blurb: 'Clear hours so nobody shows up to a locked door.', ask: 'Which days change, and to what?', subject: 'The hours', subjectPh: 'Closed Dec 24 and 25. Open New Years Day.', headlinePh: 'Holiday Hours' } }),
  // posts that engage
  spec('carousel', 'engage', '🎠', { asks: ['subject'], voice: { blurb: 'One idea per slide. Great for lists and stories.', ask: 'What is the carousel about? Rough is fine.', subject: 'The idea, slide by slide or loosely', subjectPh: 'Five things to try, one per slide', headlinePh: 'Five Things To Try', headlines: ['Five Things To Try'] } }),
  spec('tips', 'engage', '💡', { headline: 'Three Things To Know', asks: ['subject'], voice: { blurb: 'Share what you know. Helpful posts get saved.', ask: 'What do you know that your customers would love to?', subject: 'The tips', subjectPh: 'Three ways to reheat it right', headlinePh: 'Three Things To Know', headlines: ['Pro Tips From Us'] } }),
  spec('faq', 'engage', '💬', { headline: 'You Asked, We Answered', asks: ['question'], voice: { blurb: 'Answer the question you hear every week, once and for all.', ask: 'What question do people always ask you?', subject: 'The answer', subjectPh: 'Yes, book online or give us a call', headlinePh: 'Do you take reservations?' } }),
  spec('poll', 'engage', '🗳️', { headline: 'You Tell Us', asks: ['question'], voice: { blurb: 'Ask your followers to pick a side. Easy engagement.', ask: 'What are we asking your followers?', subject: 'The choices', subjectPh: 'Team spicy or team mild', headlinePh: 'Spicy or mild: pick a side' } }),
  spec('countdown', 'engage', '⏳', { headline: 'Almost Here', asks: ['eventDate'], timing: 'needs-lead-time', voice: { blurb: 'Build excitement for something coming soon.', ask: 'What are we counting down to?', subject: 'What is coming', subjectPh: 'Our patio opens for the season', headlinePh: 'Almost Here', headlines: ['The Countdown Is On'] } }),
  spec('recap', 'engage', '🙌', { headline: 'What A Night', asks: ['eventDate'], voice: { blurb: 'Relive a great moment and thank the crowd.', ask: 'What are we recapping? Brag a little.', subject: 'How it went', subjectPh: 'Sold out our first tasting night', headlinePh: 'What A Night', headlines: ['Thank You For Coming Out'] } }),
  // everyday needs
  spec('weekly-special', 'everyday', '🍽️', { headline: 'This Week Only', asks: ['offer'], timing: 'date-anchored', voice: { blurb: 'Give people a reason to come in this week.', ask: 'What is the special?', subject: 'The fine print', subjectPh: 'Dine in only, 4pm to close', headlinePh: 'This Week Only', offerPh: '$12 burger and a drink, Tuesdays', headlines: ['Tuesday Just Got Better'] } }),
  spec('happy-hour', 'everyday', '🍸', { headline: 'Happy Hour, Every Day', asks: ['offer'], voice: { blurb: 'The deal, the days, the times. Easy to share.', ask: 'What is the happy hour deal, and when?', subject: 'Days and times', subjectPh: 'Monday through Friday, 3 to 6', headlinePh: 'Happy Hour', offerPh: 'Half off drafts, 3 to 6pm' } }),
  spec('hiring', 'everyday', '📋', { headline: 'Join Our Team', asks: ['subject'], voice: { blurb: 'Reach people who already love your business.', ask: 'What role are you hiring for?', subject: 'The role and the hours', subjectPh: 'Weekend team members, part time', headlinePh: 'We Are Hiring', headlines: ['We Are Hiring', 'Come Work With Us'] } }),
  spec('gift-cards', 'everyday', '💳', { headline: 'Give The Gift Of Dinner', voice: { blurb: 'Remind people you sell the easiest gift there is.', ask: 'Anything special about your gift cards?', subject: 'The details', subjectPh: 'Any amount, online or in store', headlinePh: 'The Perfect Gift', headlines: ['The Perfect Gift'] } }),
  spec('referral', 'everyday', '🫶', { headline: 'Bring A Friend', asks: ['offer'], voice: { blurb: 'Turn regulars into your best marketing.', ask: 'What do they get for bringing a friend?', subject: 'How it works', subjectPh: 'Mention this post when you come in', headlinePh: 'Bring A Friend', offerPh: 'Bring a friend, you both get 10% off' } }),
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
