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
import type { DestinationId } from './destinations'

/** What a type genuinely needs from the owner beyond the shared steps. */
export type JobAsk = 'eventDate' | 'endDate' | 'subject' | 'offer' | 'question' | 'action'

export interface JobSpec {
  id: DesignJobId
  /** analytics tag, always 'graphic:<id>' — the spine value stored downstream */
  tag: string
  group: 'brand' | 'info' | 'engage' | 'everyday' | 'push'
  emoji: string
  /** how the piece is built: one page, or a multi-page carousel. Story-shaped
   *  types are carousels because a story cannot live on one image. */
  format?: 'single' | 'carousel'
  /** WHERE this objective should live: the recommended placement bundle,
   *  preselected on the build step (owners know the objective; we know the
   *  distribution). The owner can add or remove anything. */
  places?: readonly DestinationId[]
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
    /** how people act on the post (apply, book, buy) when asks has 'action' */
    actionLabel?: string
    actionPh?: string
    /** step-3 note when this type needs particular photos */
    photoHint?: string
    /** THE INTERVIEW: the questions this type needs answered to make a good
     *  post. When present, the words step is these questions and nothing else
     *  (plus an optional title). First one is required. */
    questions?: readonly { label: string; ph: string }[]
    /** Some types hold MORE THAN ONE story. When present, the words step
     *  starts by asking which story to tell; each angle has its own
     *  interview. Takes precedence over questions. */
    angles?: readonly { id: string; label: string; sub: string; questions: readonly { label: string; ph: string }[] }[]
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
  extra: Partial<Pick<JobSpec, 'headline' | 'asks' | 'timing' | 'scope' | 'voice' | 'format' | 'places'>> = {},
): JobSpec => ({ id, tag: `graphic:${id}`, group, emoji, asks: [], timing: 'evergreen', scope: group === 'push' ? 'push' : 'piece', ...extra })

export const JOB_REGISTRY: readonly JobSpec[] = [
  // your story and brand
  spec('story-behind', 'brand', '👋', { places: ['instagram-post', 'facebook-post', 'linkedin-post'], format: 'carousel', headline: 'The Story Behind Us', asks: ['subject'], voice: { blurb: 'The post that tells people who you are and why you started.', ask: 'Pick the story you want to tell. Then answer a few easy questions.', angles: [
      { id: 'origin', label: 'How we started', sub: 'Your opening chapter. Great for new followers who only know the sign out front.', questions: [
        { label: 'Take us back to day one. What do you remember most?', ph: 'We sold out by noon and cried in the kitchen' },
        { label: 'What did you start with? Numbers and details help.', ph: 'Two pans, a borrowed fridge, and $800' },
        { label: 'When did you first think, this might actually work?', ph: 'A stranger came back the next day with three friends' },
        { label: 'What is different today?', ph: 'Now we know half our customers by name' },
      ] },
      { id: 'people', label: 'The people behind it', sub: 'Put real faces to the name. People connect with people, not logos.', questions: [
        { label: 'Who is behind it? Names first.', ph: 'Maria and her sister Ana' },
        { label: 'What would we see them doing before the doors open?', ph: 'Maria tastes every batch before we unlock the door' },
        { label: 'Why do they do this every day?', ph: 'Cooking was how our family showed love' },
        { label: 'A small detail people would love?', ph: 'She still uses the wooden spoon her grandmother cooked with' },
      ] },
      { id: 'craft', label: 'Why we do it our way', sub: 'Your standards, your way of doing things, and the care nobody sees.', questions: [
        { label: 'What do you refuse to cut corners on?', ph: 'Everything is made fresh, never frozen' },
        { label: 'What does that cost you?', ph: 'We are up at 4am and we throw out what does not sell' },
        { label: 'Why is it worth it?', ph: 'You can taste the difference, and our regulars know it' },
      ] },
      { id: 'overcome', label: 'A moment that tested us', sub: 'The honest chapter. These posts get shared because they feel real.', questions: [
        { label: 'What happened? Take us to that day.', ph: 'We walked in and the flood had taken everything' },
        { label: 'What was the lowest point?', ph: 'We did not know if we could reopen' },
        { label: 'Who or what got you through?', ph: 'Neighbors showed up with buckets and paint' },
        { label: 'What did it teach you?', ph: 'This town has our back' },
      ] },
      { id: 'roots', label: 'Where we come from', sub: 'Family, heritage, hometown. The history that flavors everything you do.', questions: [
        { label: 'Where does it all come from?', ph: 'Our recipes came here with our mom from Oaxaca' },
        { label: 'What tradition do you keep exactly as it was?', ph: 'The mole takes three days, same as home' },
        { label: 'What should people feel when they walk in?', ph: 'Like they are eating at our family table' },
      ] },
      { id: 'own', label: 'Something else', sub: 'A story not on this list. Tell it your way.', questions: [
        { label: 'Tell us the story', ph: 'Whatever you want people to know. Rough is fine, we shape it.' },
        { label: 'Anything else that helps?', ph: 'Names, dates, or details worth getting right' },
      ] },
    ], subject: 'The story', subjectPh: 'Two sisters, one dream, opened in 2019', headlinePh: 'How It All Started', headlines: ['How It All Started', 'From Our Family To Yours'] } }),
  spec('team-spotlight', 'brand', '🧑‍🍳', { places: ['instagram-post', 'facebook-post', 'linkedin-post'], headline: 'Meet The Team', asks: ['subject'], voice: { questions: [{ label: 'Who are we introducing?', ph: 'Maria, our head baker' }, { label: 'What do they do here?', ph: 'She has run the kitchen for 6 years' }, { label: 'Something people would love to know about them?', ph: 'She names every sourdough starter' }], photoHint: 'A clear photo of them beats a perfect one.', blurb: 'Put a face to the business. People buy from people.', ask: 'Who are we introducing?', subject: 'About them', subjectPh: 'Maria has run our kitchen for 6 years', headlinePh: 'Meet Maria', headlines: ['The Face Behind The Counter'] } }),
  spec('behind-scenes', 'brand', '🎬', { places: ['instagram-post', 'instagram-story'], format: 'carousel', headline: 'Behind The Scenes', voice: { questions: [{ label: 'What are we showing?', ph: 'How we make everything fresh each morning' }, { label: 'Why do you do it this way?', ph: 'Fresh just tastes different' }], blurb: 'Show how the work gets done. People love a peek inside.', ask: 'What are we letting people see?', subject: 'What we are showing', subjectPh: 'How we prep everything fresh each morning', headlinePh: 'A Look Inside', headlines: ['How We Make It', 'A Look Inside'] } }),
  spec('before-after', 'brand', '🔁', { places: ['instagram-post', 'facebook-post'], headline: 'The Before And After', asks: ['subject'], voice: { questions: [{ label: 'What changed?', ph: 'Our dining room got a full remodel' }, { label: 'What did it take?', ph: 'Three months and a lot of paint' }], photoHint: 'This one needs both photos: the before and the after.', blurb: 'Show the change side by side. The proof does the talking.', ask: 'What changed? We show the difference.', subject: 'The change', subjectPh: 'Our space, before and after the remodel', headlinePh: 'What A Difference', headlines: ['What A Difference'] } }),
  spec('guest-love', 'brand', '⭐', { places: ['instagram-post', 'facebook-post', 'google-listing'], headline: 'What Our Guests Say', asks: ['subject'], voice: { questions: [{ label: 'What did they say?', ph: 'Best in town, hands down' }, { label: 'Who said it?', ph: 'Maria G, on Google' }, { label: 'What would you say back to them?', ph: 'Thank you, we love you too' }], photoHint: 'A screenshot of the review works, or a photo of your place.', blurb: 'Turn a happy customer\'s words into a post worth sharing.', ask: 'Which review or kind words are we featuring?', subject: 'The quote, their words', subjectPh: 'Best in town, hands down. From Maria G.', headlinePh: 'You Said It Best', headlines: ['Five Stars', 'You Said It Best'] } }),
  spec('milestone', 'brand', '🎂', { places: ['instagram-post', 'facebook-post'], headline: 'Thank You For The Years', asks: ['subject'], timing: 'date-anchored', voice: { questions: [{ label: 'What are we celebrating?', ph: '10 years in this neighborhood' }, { label: 'Who do you want to thank?', ph: 'Every regular who kept us going' }], blurb: 'Celebrate a win with the people who got you there.', ask: 'What are we celebrating?', subject: 'The milestone', subjectPh: '10 years serving this neighborhood', headlinePh: 'Ten Years Strong', headlines: ['Ten Years Strong', 'Cheers To You'] } }),
  spec('community', 'brand', '💚', { places: ['instagram-post', 'facebook-post', 'linkedin-post'], headline: 'Giving Back', asks: ['subject'], voice: { questions: [{ label: 'Who or what are you supporting?', ph: 'A fundraiser night for Lincoln Elementary' }, { label: 'How can people help?', ph: 'Come in Thursday, half the night goes to the school' }], blurb: 'Show the good you do around town.', ask: 'Who or what are we supporting?', subject: 'The cause', subjectPh: 'A fundraiser night for Lincoln Elementary', headlinePh: 'For Our Neighbors', headlines: ['For Our Neighbors'] } }),
  // menus and announcements
  spec('new-menu', 'info', '📖', { places: ['instagram-post', 'facebook-post', 'google-listing'], headline: 'Our New Menu', voice: { questions: [{ label: 'What is new?', ph: 'Twelve new dishes for summer' }, { label: 'What should people try first?', ph: 'The grilled peach salad' }], blurb: 'Announce the new lineup and get people curious.', ask: 'What is new? A taste, not the whole list.', subject: 'What changed', subjectPh: 'Twelve new dishes for summer', headlinePh: 'The New Menu Is Here', headlines: ['The New Menu Is Here'] } }),
  spec('new-item', 'info', '✨', { places: ['instagram-post', 'instagram-story', 'google-listing'], headline: 'New On The Menu', asks: ['subject'], voice: { questions: [{ label: 'What is the new item?', ph: 'Smoked brisket sandwich' }, { label: 'What makes it special?', ph: 'House slaw and a 12 hour smoke' }], blurb: 'Give something new its moment.', ask: 'What is the new item?', subject: 'Make it sound good', subjectPh: 'Smoked brisket sandwich with house slaw', headlinePh: 'Say Hello To The New One', headlines: ['Say Hello To The New One'] } }),
  spec('announcement', 'info', '📣', { places: ['instagram-post', 'facebook-post', 'instagram-story', 'google-listing'], headline: 'Big News', asks: ['subject'], voice: { questions: [{ label: 'What is the news?', ph: 'We are opening a second location' }, { label: 'When does it happen?', ph: 'Downtown, this fall' }], blurb: 'Big news, told simply and proudly.', ask: 'What is the news?', subject: 'The news', subjectPh: 'We are opening a second location downtown', headlinePh: 'Big News', headlines: ['It Is Official'] } }),
  spec('press', 'info', '📰', { places: ['instagram-post', 'facebook-post', 'linkedin-post'], headline: 'As Seen In', asks: ['subject'], voice: { questions: [{ label: 'Who featured you?', ph: 'The Weekly' }, { label: 'What did they say?', ph: 'Named a top 10 brunch spot' }], blurb: 'Someone wrote you up. Let everyone know.', ask: 'Who featured you, and what did they say?', subject: 'The mention', subjectPh: 'Named a top 10 spot by the Weekly', headlinePh: 'As Seen In The Weekly', headlines: ['In The News'] } }),
  spec('collab', 'info', '🤝', { places: ['instagram-post', 'instagram-story'], headline: 'A Special Collab', asks: ['subject'], voice: { questions: [{ label: 'Who is the collab with?', ph: 'Blue Door Brewing' }, { label: 'What are you doing together?', ph: 'A one night dinner, their drinks and our food' }], blurb: 'Two names, one moment. Tell both crowds.', ask: 'Who is the collab with, and what are you doing together?', subject: 'The partner and the plan', subjectPh: 'One night only menu with Blue Door Brewing', headlinePh: 'A Special Collab', headlines: ['Better Together'] } }),
  spec('catering', 'info', '🥂', { places: ['instagram-post', 'facebook-post', 'printed-flyer'], headline: 'Let Us Cater Your Day', asks: ['action'], voice: { questions: [{ label: 'What do you cater?', ph: 'Weddings, office lunches, parties' }, { label: 'How many can you serve?', ph: 'Up to 200' }], actionLabel: 'How to book', actionPh: 'Call us or use the form on our site', blurb: 'Remind people you can handle their big day.', ask: 'What do you cater, and for how many?', subject: 'What you offer', subjectPh: 'Weddings, office lunches, parties up to 200', headlinePh: 'We Bring The Food', headlines: ['We Bring The Food'] } }),
  spec('holiday-hours', 'info', '🕐', { places: ['instagram-post', 'facebook-post', 'google-listing'], headline: 'Holiday Hours', timing: 'date-anchored', voice: { questions: [{ label: 'Which days change?', ph: 'Dec 24 and 25' }, { label: 'What are the new hours?', ph: 'Closed both days, normal hours Dec 26' }], blurb: 'Clear hours so nobody shows up to a locked door.', ask: 'Which days change, and to what?', subject: 'The hours', subjectPh: 'Closed Dec 24 and 25. Open New Years Day.', headlinePh: 'Holiday Hours' } }),
  // posts that engage
  spec('carousel', 'engage', '🎠', { places: ['instagram-post'], format: 'carousel', asks: ['subject'], voice: { questions: [{ label: 'What is the carousel about?', ph: 'Five things you have to try here' }, { label: 'Walk us through the slides, rough is fine', ph: 'One per slide, save the best for last' }], blurb: 'One idea per slide. Great for lists and stories.', ask: 'What is the carousel about? Rough is fine.', subject: 'The idea, slide by slide or loosely', subjectPh: 'Five things to try, one per slide', headlinePh: 'Five Things To Try', headlines: ['Five Things To Try'] } }),
  spec('tips', 'engage', '💡', { places: ['instagram-post', 'facebook-post'], format: 'carousel', headline: 'Three Things To Know', asks: ['subject'], voice: { questions: [{ label: 'What are your tips about?', ph: 'How to reheat it right at home' }, { label: 'List them, rough is fine', ph: 'Skillet not microwave. Medium heat. Lid on.' }], blurb: 'Share what you know. Helpful posts get saved.', ask: 'What do you know that your customers would love to?', subject: 'The tips', subjectPh: 'Three ways to reheat it right', headlinePh: 'Three Things To Know', headlines: ['Pro Tips From Us'] } }),
  spec('faq', 'engage', '💬', { places: ['instagram-post', 'facebook-post'], headline: 'You Asked, We Answered', asks: ['question'], voice: { questions: [{ label: 'What question do people always ask?', ph: 'Do you take reservations?' }, { label: 'Your answer?', ph: 'Yes, online or by phone' }], blurb: 'Answer the question you hear every week, once and for all.', ask: 'What question do people always ask you?', subject: 'The answer', subjectPh: 'Yes, book online or give us a call', headlinePh: 'Do you take reservations?' } }),
  spec('poll', 'engage', '🗳️', { places: ['instagram-story', 'instagram-post'], headline: 'You Tell Us', asks: ['question'], voice: { questions: [{ label: 'What are we asking your followers?', ph: 'Spicy or mild?' }, { label: 'What are the choices?', ph: 'Team spicy or team mild' }], blurb: 'Ask your followers to pick a side. Easy engagement.', ask: 'What are we asking your followers?', subject: 'The choices', subjectPh: 'Team spicy or team mild', headlinePh: 'Spicy or mild: pick a side' } }),
  spec('countdown', 'engage', '⏳', { places: ['instagram-post', 'instagram-story'], headline: 'Almost Here', asks: ['eventDate'], timing: 'needs-lead-time', voice: { questions: [{ label: 'What is coming?', ph: 'Our patio opens for the season' }, { label: 'Why should people be excited?', ph: 'Twice the seats, all summer' }], blurb: 'Build excitement for something coming soon.', ask: 'What are we counting down to?', subject: 'What is coming', subjectPh: 'Our patio opens for the season', headlinePh: 'Almost Here', headlines: ['The Countdown Is On'] } }),
  spec('recap', 'engage', '🙌', { places: ['instagram-post', 'facebook-post'], format: 'carousel', headline: 'What A Night', asks: ['eventDate'], voice: { questions: [{ label: 'What happened?', ph: 'Our first tasting night sold out' }, { label: 'A moment worth sharing?', ph: 'The toast at the end' }], photoHint: 'Photos from the day itself work best.', blurb: 'Relive a great moment and thank the crowd.', ask: 'What are we recapping? Brag a little.', subject: 'How it went', subjectPh: 'Sold out our first tasting night', headlinePh: 'What A Night', headlines: ['Thank You For Coming Out'] } }),
  // everyday needs
  spec('weekly-special', 'everyday', '🍽️', { places: ['instagram-post', 'instagram-story', 'facebook-post'], headline: 'This Week Only', asks: ['offer'], timing: 'date-anchored', voice: { blurb: 'Give people a reason to come in this week.', ask: 'What is the special?', subject: 'The fine print', subjectPh: 'Dine in only, 4pm to close', headlinePh: 'This Week Only', offerPh: '$12 burger and a drink, Tuesdays', headlines: ['Tuesday Just Got Better'] } }),
  spec('happy-hour', 'everyday', '🍸', { places: ['instagram-post', 'instagram-story'], headline: 'Happy Hour, Every Day', asks: ['offer'], voice: { blurb: 'The deal, the days, the times. Easy to share.', ask: 'What is the happy hour deal, and when?', subject: 'Days and times', subjectPh: 'Monday through Friday, 3 to 6', headlinePh: 'Happy Hour', offerPh: 'Half off drafts, 3 to 6pm' } }),
  spec('hiring', 'everyday', '📋', { places: ['instagram-post', 'facebook-post', 'linkedin-post'], headline: 'Join Our Team', asks: ['subject', 'action'], voice: { questions: [{ label: 'What role are you hiring for?', ph: 'Weekend team members' }, { label: 'What are the hours and perks?', ph: 'Part time, flexible, free meals' }], actionLabel: 'How to apply', actionPh: 'Text us, or come in and ask for Sam', blurb: 'Reach people who already love your business.', ask: 'What role are you hiring for?', subject: 'The role and the hours', subjectPh: 'Weekend team members, part time', headlinePh: 'We Are Hiring', headlines: ['We Are Hiring', 'Come Work With Us'] } }),
  spec('gift-cards', 'everyday', '💳', { places: ['instagram-post', 'facebook-post', 'email-header'], headline: 'Give The Gift Of Dinner', asks: ['action'], voice: { questions: [{ label: 'Anything special about your gift cards?', ph: 'Any amount, they never expire' }], actionLabel: 'Where to get one', actionPh: 'At the counter or on our website', blurb: 'Remind people you sell the easiest gift there is.', ask: 'Anything special about your gift cards?', subject: 'The details', subjectPh: 'Any amount, online or in store', headlinePh: 'The Perfect Gift', headlines: ['The Perfect Gift'] } }),
  spec('referral', 'everyday', '🫶', { places: ['instagram-post', 'facebook-post'], headline: 'Bring A Friend', asks: ['offer'], voice: { blurb: 'Turn regulars into your best marketing.', ask: 'What do they get for bringing a friend?', subject: 'How it works', subjectPh: 'Mention this post when you come in', headlinePh: 'Bring A Friend', offerPh: 'Bring a friend, you both get 10% off' } }),
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
