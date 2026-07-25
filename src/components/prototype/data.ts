/**
 * PROTOTYPE DATA — the shop at full potential.
 *
 * Everything here is INVENTED. No database, no API, no real people. It exists to answer one
 * question: if we had a deep bench of real creators and every campaign was genuinely
 * deliverable, what would buying one feel like?
 *
 * Two rules held throughout, because they are the same rules the real thing has to keep:
 *
 *   1. Nothing forecasts a result. The shop shows what gets made, by whom, and when. It never
 *      claims a number of customers. The only numbers that appear after a campaign runs are
 *      counts of things that actually happened.
 *   2. Price is the sum of who is on it. There is no abstract budget dial. You change the cost
 *      by changing the cast, and every price traces to one person's day rate times the effort
 *      that piece takes.
 *
 * @see kit.tsx for the visual tokens, shop.tsx for the flow.
 */

/* ─────────────────────────────────────────────────────────────────────────────
   CRAFTS — what a person does. A good needs one; the bench supplies it.
   ──────────────────────────────────────────────────────────────────────────── */

export type Craft = 'photo' | 'design' | 'video' | 'social' | 'copy'

export const CRAFT_LABEL: Record<Craft, string> = {
  photo: 'Photographer',
  design: 'Designer',
  video: 'Video',
  social: 'Social',
  copy: 'Writer',
}

/* ─────────────────────────────────────────────────────────────────────────────
   THE BENCH — "unlimited creators" in practice means enough real difference that
   choosing between two people is a genuine decision, not a coin flip. Each one
   differs on the four things an owner actually weighs: look, speed, price, and
   whether they have done this before.
   ──────────────────────────────────────────────────────────────────────────── */

export interface Creator {
  id: string
  name: string
  crafts: Craft[]
  /** How their work reads. This is the axis the AI matches on first. */
  style: string
  styleTags: string[]
  /** Day rate. Every price in the shop derives from this. Theirs to set, not ours. */
  rate: number
  /** Working days from brief to delivery. */
  turnaround: number
  /** Restaurant jobs finished on this platform. The honest proxy for "done this before". */
  jobs: number
  /** Out of 5, from owners who hired them. `null` until enough people have rated. */
  rating: number | null
  /** Delivered on the promised day, as a percentage. Measured, never claimed. */
  onTime: number | null
  /** Days from now until they can start. Drives whether they can make your date at all. */
  free: number
  /** Two hues for their sample-work thumbnails, so each bench card reads distinctly. */
  hue: [string, string]
  blurb: string
}

export const BENCH: Creator[] = [
  // ── photographers ──────────────────────────────────────────────────────────
  { id: 'sam', name: 'Sam Rivera', crafts: ['photo', 'video'], style: 'Moody, low light',
    styleTags: ['moody', 'low-light', 'evening'], rate: 520, turnaround: 2, jobs: 31, rating: 4.9,
    onTime: 100, free: 1, hue: ['#3d2f4a', '#7d5480'],
    blurb: 'Shoots evening service without a flash. Every frame looks like the room felt.' },
  { id: 'nia', name: 'Nia Osei', crafts: ['photo'], style: 'Documentary, people first',
    styleTags: ['documentary', 'people', 'candid'], rate: 600, turnaround: 3, jobs: 47, rating: 5.0,
    onTime: 98, free: 4, hue: ['#2f3f4a', '#4a7c8a'],
    blurb: 'Photographs the crowd, not the plate. Books out fast around events.' },
  { id: 'tomas', name: 'Tomas Beck', crafts: ['photo'], style: 'Food macro, high detail',
    styleTags: ['food', 'macro', 'crisp'], rate: 450, turnaround: 4, jobs: 22, rating: 4.8,
    onTime: 95, free: 2, hue: ['#4a3a2a', '#a8762a'],
    blurb: 'Close, sharp and hungry-making. The one to call for a dish, not a night.' },
  { id: 'priya', name: 'Priya Raman', crafts: ['photo'], style: 'Warm, natural light',
    styleTags: ['warm', 'daylight', 'clean'], rate: 380, turnaround: 3, jobs: 14, rating: 4.6,
    onTime: 93, free: 1, hue: ['#4a3f2a', '#c9a35e'],
    blurb: 'Daylight and soft colour. Best before sundown, honest about it.' },
  { id: 'dee', name: 'Dee Kwan', crafts: ['photo'], style: 'Bright and clean',
    styleTags: ['bright', 'clean', 'simple'], rate: 340, turnaround: 5, jobs: 9, rating: null,
    onTime: null, free: 0, hue: ['#2a3f3a', '#4abd98'],
    blurb: 'Newer here, cheaper, free at short notice. Not yet rated by enough owners.' },

  // ── designers ──────────────────────────────────────────────────────────────
  { id: 'maya', name: 'Maya Lin', crafts: ['design'], style: 'Bold, type led',
    styleTags: ['bold', 'type', 'loud'], rate: 420, turnaround: 3, jobs: 38, rating: 4.9,
    onTime: 99, free: 1, hue: ['#4a2a2a', '#c05c44'],
    blurb: 'Big type you can read across a street. Works fast off a fresh shoot.' },
  { id: 'ines', name: 'Ines Ferro', crafts: ['design'], style: 'Photo led layouts',
    styleTags: ['photo-led', 'editorial', 'calm'], rate: 440, turnaround: 3, jobs: 33, rating: 4.9,
    onTime: 97, free: 2, hue: ['#2a3a4a', '#5b7fa8'],
    blurb: 'Lets the photograph carry it. Needs good photos to be worth the money.' },
  { id: 'owen', name: 'Owen Castle', crafts: ['design'], style: 'Elegant, minimal',
    styleTags: ['minimal', 'elegant', 'quiet'], rate: 500, turnaround: 4, jobs: 26, rating: 4.8,
    onTime: 96, free: 5, hue: ['#33322e', '#8a8578'],
    blurb: 'Restrained and expensive-looking. Slower, and worth it for a launch.' },
  { id: 'bex', name: 'Bex Arnold', crafts: ['design'], style: 'Playful, illustrated',
    styleTags: ['playful', 'illustrated', 'fun'], rate: 360, turnaround: 2, jobs: 19, rating: 4.7,
    onTime: 94, free: 0, hue: ['#4a3a2f', '#e08a52'],
    blurb: 'Draws rather than lays out. Good when there are no photos worth using.' },

  // ── video ──────────────────────────────────────────────────────────────────
  { id: 'kai', name: 'Kai Mendez', crafts: ['video'], style: 'Short form, punchy',
    styleTags: ['fast-cut', 'social', 'punchy'], rate: 700, turnaround: 4, jobs: 29, rating: 4.9,
    onTime: 97, free: 3, hue: ['#3a2a4a', '#9a5fc4'],
    blurb: 'Built for a phone screen and the first two seconds.' },
  { id: 'lena', name: 'Lena Whitfield', crafts: ['video'], style: 'Cinematic',
    styleTags: ['cinematic', 'slow', 'premium'], rate: 850, turnaround: 6, jobs: 41, rating: 5.0,
    onTime: 100, free: 7, hue: ['#22303a', '#3f7d8a'],
    blurb: 'The expensive one. Books weeks out and never misses a date.' },
  { id: 'rudy', name: 'Rudy Sant', crafts: ['video'], style: 'Fast social cuts',
    styleTags: ['fast', 'cheap', 'social'], rate: 480, turnaround: 2, jobs: 12, rating: 4.5,
    onTime: 88, free: 0, hue: ['#3a3a2a', '#a8a052'],
    blurb: 'Quickest turnaround on the bench. Has been late before, and it shows above.' },

  // ── social ─────────────────────────────────────────────────────────────────
  { id: 'jo', name: 'Jo Kealoha', crafts: ['social', 'copy'], style: 'Restaurant native',
    styleTags: ['restaurant', 'local', 'consistent'], rate: 300, turnaround: 1, jobs: 52, rating: 4.9,
    onTime: 99, free: 0, hue: ['#2a3f35', '#4abd98'],
    blurb: 'Has run more restaurant feeds than anyone here. Free almost always.' },
  { id: 'ari', name: 'Ari Delgado', crafts: ['social'], style: 'Community building',
    styleTags: ['community', 'replies', 'regulars'], rate: 340, turnaround: 2, jobs: 30, rating: 4.8,
    onTime: 96, free: 1, hue: ['#2f3a4a', '#6a8fc4'],
    blurb: 'Talks to your regulars in the comments, not just at them.' },
  { id: 'fen', name: 'Fen Mbeki', crafts: ['social'], style: 'Paid and organic',
    styleTags: ['paid', 'reach', 'targeting'], rate: 420, turnaround: 2, jobs: 21, rating: 4.7,
    onTime: 95, free: 2, hue: ['#3f2a3a', '#b05c8a'],
    blurb: 'Runs the boost as well as the post. Charges for the skill, not the ad spend.' },

  // ── writers ────────────────────────────────────────────────────────────────
  { id: 'cal', name: 'Cal Nguyen', crafts: ['copy'], style: 'Menu and brand voice',
    styleTags: ['menu', 'voice', 'careful'], rate: 360, turnaround: 2, jobs: 24, rating: 4.8,
    onTime: 98, free: 1, hue: ['#3a352a', '#a89052'],
    blurb: 'Writes the way you talk, once they have heard you talk.' },
  { id: 'hattie', name: 'Hattie Voss', crafts: ['copy'], style: 'Promo and short punchy',
    styleTags: ['promo', 'short', 'fast'], rate: 290, turnaround: 1, jobs: 16, rating: 4.6,
    onTime: 92, free: 0, hue: ['#4a2f35', '#c4708a'],
    blurb: 'Quick lines for a poster or a text. Cheapest on the bench.' },
]

export const byId = (id: string) => BENCH.find((c) => c.id === id) ?? null

/* ─────────────────────────────────────────────────────────────────────────────
   THE NON-HUMAN LANES. Always available, never book out, and priced flat because
   nobody is selling their day.
   ──────────────────────────────────────────────────────────────────────────── */

export type LaneId = 'you' | 'ai' | 'team'

export const LANES: Record<LaneId, { name: string; note: string }> = {
  you: { name: 'You do it', note: 'Free, and it is real work on your plate' },
  ai: { name: 'Apnosh AI', note: 'Instant, reviewed by our team before it goes out' },
  team: { name: 'Our team', note: 'Staff, not contractors. Steady and unremarkable.' },
}

/* ─────────────────────────────────────────────────────────────────────────────
   THE GOODS — the actual things an owner receives. A shop shows goods, not services.
   ──────────────────────────────────────────────────────────────────────────── */

export type ArtKind =
  | 'photos' | 'poster' | 'event' | 'posts' | 'google' | 'reel'
  | 'text' | 'email' | 'clock' | 'listing' | 'stars' | 'menu'

export interface Good {
  id: string
  name: string
  /** One line on what it actually is, in the owner's words. */
  what: string
  /** How it reads when sold ALONE. Written out, never derived — lowercasing the display
   *  name produced "Just your google profile, fixed", which is both ungrammatical and
   *  quietly wrong about a proper noun. */
  solo?: string
  /** Which shelf a one-off belongs on. A good can appear in several campaigns; it still
   *  only gets sold on its own in one place. */
  soloStage?: Stage
  art: ArtKind
  /** The craft a human needs to make this. `null` = only AI/team/you can. */
  craft: Craft | null
  /** Fraction of a working day. Price = creator day rate × this. */
  effort: number
  /** Flat prices for the non-human lanes. `null` = that lane cannot make this. */
  aiPrice: number | null
  teamPrice: number | null
  /** Can the owner do it themselves? */
  diy: boolean
  /** Made out of these. Missing them is a downgrade, never an error. */
  from?: string[]
  /** Working days before the target date this has to land. Drives the schedule. */
  lead: number
  /** Charged every month rather than once. */
  monthly?: boolean
}

export const GOODS: Record<string, Good> = {
  shootNight: { id: 'shootNight', name: 'Photos of the night', what: '18 edited shots of the room, the food and the crowd',
    art: 'photos', craft: 'photo', effort: 0.5, aiPrice: null, teamPrice: null, diy: true, lead: 11 },
  shootFood: { id: 'shootFood', name: 'Photos of the dish', what: '12 edited shots built around one plate',
    art: 'photos', craft: 'photo', effort: 0.5, aiPrice: null, teamPrice: null, diy: true, lead: 11 },
  menuShoot: { id: 'menuShoot', name: 'Your whole menu, shot', what: 'Every dish photographed the same way',
    art: 'menu', craft: 'photo', effort: 1.5, aiPrice: null, teamPrice: null, diy: false, lead: 14 },
  poster: { id: 'poster', name: 'The poster', what: 'One image that works on a wall and a phone',
    solo: 'Just a poster', soloStage: 'interest', art: 'poster', craft: 'design', effort: 0.5, aiPrice: 20, teamPrice: 60, diy: false, from: ['shootNight', 'shootFood'], lead: 9 },
  storySet: { id: 'storySet', name: 'Story graphics', what: 'Six vertical frames for stories',
    art: 'posts', craft: 'design', effort: 0.5, aiPrice: 25, teamPrice: 65, diy: false, from: ['shootNight', 'shootFood'], lead: 7 },
  eventPage: { id: 'eventPage', name: 'Facebook event page', what: 'Set up, described and linked to your booking page',
    art: 'event', craft: null, effort: 0, aiPrice: 35, teamPrice: 70, diy: true, from: ['poster'], lead: 8 },
  posts: { id: 'posts', name: 'Six posts, scheduled', what: 'Written, made and queued across your channels',
    art: 'posts', craft: 'social', effort: 1, aiPrice: 45, teamPrice: 110, diy: true, from: ['shootNight', 'shootFood'], lead: 5 },
  googlePost: { id: 'googlePost', name: 'Google post', what: 'The thing that shows under your listing when people search you',
    art: 'google', craft: null, effort: 0, aiPrice: 25, teamPrice: 50, diy: true, from: ['poster'], lead: 5 },
  reel: { id: 'reel', name: 'A 20 second reel', what: 'Shot, cut and captioned for a phone',
    art: 'reel', craft: 'video', effort: 0.5, aiPrice: null, teamPrice: null, diy: false, from: ['shootNight', 'shootFood'], lead: 4 },
  textBlast: { id: 'textBlast', name: 'Text your regulars', what: 'One message to everyone who opted in',
    art: 'text', craft: 'copy', effort: 0.25, aiPrice: 30, teamPrice: 80, diy: true, lead: 2 },
  reminder: { id: 'reminder', name: 'Reminder on the day', what: 'The nudge that lands the morning of, not three days early',
    solo: 'Just a reminder on the day', soloStage: 'door', art: 'clock', craft: null, effort: 0, aiPrice: 25, teamPrice: 45, diy: true, lead: 0 },
  emailBlast: { id: 'emailBlast', name: 'Email the list', what: 'One proper email, written and sent',
    art: 'email', craft: 'copy', effort: 0.25, aiPrice: 30, teamPrice: 70, diy: true, lead: 3 },
  gbpFix: { id: 'gbpFix', name: 'Your Google profile, fixed', what: 'Hours, categories, photos and description all corrected',
    solo: 'Just fix my Google profile', soloStage: 'found', art: 'google', craft: null, effort: 0, aiPrice: 100, teamPrice: 180, diy: true, lead: 5 },
  listings: { id: 'listings', name: 'Listed the same everywhere', what: 'Yelp, Apple Maps and four more saying identical things',
    solo: 'Just get me listed everywhere', soloStage: 'found', art: 'listing', craft: null, effort: 0, aiPrice: null, teamPrice: 195, diy: true, lead: 7 },
  reviewReplies: { id: 'reviewReplies', name: 'Every review answered', what: 'In your voice, within a day, every month',
    solo: 'Just answer my reviews', soloStage: 'back', art: 'stars', craft: null, effort: 0, aiPrice: 165, teamPrice: 260, diy: true, lead: 3, monthly: true },
  menuOnline: { id: 'menuOnline', name: 'Your menu, online properly', what: 'Readable on a phone, findable by search',
    art: 'menu', craft: null, effort: 0, aiPrice: null, teamPrice: 240, diy: false, from: ['menuShoot'], lead: 6 },
}

/* ─────────────────────────────────────────────────────────────────────────────
   THE SHELF — outcomes, in funnel order, because every owner wants all of them
   and what differs is only which one they need first.
   ──────────────────────────────────────────────────────────────────────────── */

export type Stage = 'found' | 'interest' | 'door' | 'back'

export const STAGE_LABEL: Record<Stage, string> = {
  found: 'Get found',
  interest: 'Give them a reason',
  door: 'Get them through the door',
  back: 'Bring them back',
}

export interface Campaign {
  id: string
  title: string
  /** What the owner is actually trying to make happen. Shown, not buried. */
  blurb: string
  stage: Stage
  /** Does it need a date to make sense? */
  dated: boolean
  goods: string[]
  /** Which goods each level includes. Level is one tap; tweaking is per good. */
  levels: { lean: string[]; standard: string[]; full: string[] }
}

export const CAMPAIGNS: Campaign[] = [
  {
    id: 'event', title: 'Fill a night', stage: 'door', dated: true,
    blurb: 'You have something on and you need people in the room for it.',
    goods: ['shootNight', 'poster', 'eventPage', 'posts', 'googlePost', 'reel', 'textBlast', 'reminder'],
    levels: {
      lean: ['poster', 'eventPage', 'posts', 'reminder'],
      standard: ['shootNight', 'poster', 'eventPage', 'posts', 'googlePost', 'textBlast', 'reminder'],
      full: ['shootNight', 'poster', 'eventPage', 'posts', 'googlePost', 'reel', 'textBlast', 'reminder'],
    },
  },
  {
    id: 'found', title: 'Get discovered', stage: 'found', dated: false,
    blurb: 'People nearby are searching for somewhere to eat and not finding you.',
    goods: ['gbpFix', 'listings', 'googlePost', 'reviewReplies'],
    levels: {
      lean: ['gbpFix'],
      standard: ['gbpFix', 'listings', 'googlePost'],
      full: ['gbpFix', 'listings', 'googlePost', 'reviewReplies'],
    },
  },
  {
    id: 'dish', title: 'Push a dish', stage: 'interest', dated: true,
    blurb: 'One plate deserves more attention than the rest of the menu.',
    goods: ['shootFood', 'poster', 'storySet', 'posts', 'reel', 'googlePost'],
    levels: {
      lean: ['poster', 'posts'],
      standard: ['shootFood', 'poster', 'storySet', 'posts'],
      full: ['shootFood', 'poster', 'storySet', 'posts', 'reel', 'googlePost'],
    },
  },
  {
    id: 'look', title: 'Look worth going to', stage: 'interest', dated: false,
    blurb: 'Your feed and your listing look worse than your food is.',
    goods: ['menuShoot', 'shootFood', 'storySet', 'posts', 'menuOnline'],
    levels: {
      lean: ['shootFood', 'posts'],
      standard: ['menuShoot', 'storySet', 'posts'],
      full: ['menuShoot', 'shootFood', 'storySet', 'posts', 'menuOnline'],
    },
  },
  {
    id: 'back', title: 'Bring them back', stage: 'back', dated: false,
    blurb: 'People come once and you never hear from them again.',
    goods: ['emailBlast', 'textBlast', 'reviewReplies', 'storySet'],
    levels: {
      lean: ['emailBlast'],
      standard: ['emailBlast', 'textBlast', 'reviewReplies'],
      full: ['emailBlast', 'textBlast', 'reviewReplies', 'storySet'],
    },
  },
]

/** Sold on their own, deliberately small. One card, one price, no chain. */
export const ONE_OFFS = ['gbpFix', 'listings', 'reviewReplies', 'poster', 'reminder']

export const STAGE_ORDER: Stage[] = ['found', 'interest', 'door', 'back']

/* ─────────────────────────────────────────────────────────────────────────────
   MATCHING — what the owner says matters, and how the bench gets ranked by it.
   This is the AI's actual job on the casting screen: not picking for them, but
   putting the right five in front of them in the right order.
   ──────────────────────────────────────────────────────────────────────────── */

export type Priority = 'look' | 'fast' | 'cheap' | 'proven'

export const PRIORITY_LABEL: Record<Priority, { label: string; ask: string }> = {
  look: { label: 'The look', ask: 'Matches the style you asked for' },
  fast: { label: 'Speed', ask: 'Free soonest and turns it around quickest' },
  cheap: { label: 'Price', ask: 'Costs the least for this piece' },
  proven: { label: 'Track record', ask: 'Most restaurant jobs finished, best on time' },
}

export interface Match { creator: Creator; price: number; score: number; why: string }

/** What one person charges for one piece: their day rate times the effort it takes. */
export function priceFor(creator: Creator, good: Good): number {
  return Math.max(25, Math.round((creator.rate * good.effort) / 5) * 5)
}

/**
 * Rank the bench for one good. Deterministic, explicable, and it always says WHY the
 * top one is on top — an owner should never be handed an order they cannot interrogate.
 *
 * `styleWant` is free text from the owner ("moody", "bright and fun"); it is matched
 * against each creator's style tags. Anything unmatched simply scores zero on look
 * rather than dropping the person, so a vague answer still returns the full bench.
 */
export function rankBench(
  good: Good,
  priorities: Priority[],
  styleWant: string,
  daysUntilNeeded: number,
): Match[] {
  if (!good.craft) return []
  const want = styleWant.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2)
  const pool = BENCH.filter((c) => c.crafts.includes(good.craft as Craft))
  const prices = pool.map((c) => priceFor(c, good))
  const lo = Math.min(...prices), hi = Math.max(...prices)

  const scored = pool.map((c) => {
    const price = priceFor(c, good)
    const hits = want.filter((w) => c.styleTags.some((t) => t.includes(w) || w.includes(t))).length
    const look = want.length ? hits / want.length : 0
    const fast = 1 - Math.min(1, (c.free + c.turnaround) / 14)
    const cheap = hi === lo ? 1 : 1 - (price - lo) / (hi - lo)
    const proven = Math.min(1, c.jobs / 50) * 0.6 + ((c.onTime ?? 80) / 100) * 0.4
    const parts: Record<Priority, number> = { look, fast, cheap, proven }

    // Chosen priorities carry the weight; the rest still nudge, so a bench with no
    // stated preference still comes back in a sensible order rather than at random.
    let score = 0
    ;(Object.keys(parts) as Priority[]).forEach((k) => {
      score += parts[k] * (priorities.includes(k) ? 1 : 0.18)
    })
    // Someone who physically cannot make the date is not a real option.
    const canMake = c.free + c.turnaround <= daysUntilNeeded
    if (!canMake) score -= 2

    const best = (priorities.length ? priorities : (['proven'] as Priority[]))
      .slice().sort((a, b) => parts[b] - parts[a])[0]
    const why = !canMake
      ? `Cannot make your date — needs ${c.free + c.turnaround} days, you have ${daysUntilNeeded}`
      : best === 'look' && hits > 0 ? `Closest to "${styleWant}"`
      : best === 'fast' ? `Free in ${c.free === 0 ? 'a day' : c.free + ' days'}, delivers in ${c.turnaround}`
      : best === 'cheap' ? 'Least expensive who can do it'
      : c.jobs > 30 ? `${c.jobs} restaurant jobs, ${c.onTime}% on time`
      : 'Available and rated well'

    return { creator: c, price, score, why, canMake }
  })

  return scored
    .sort((a, b) => (b.score - a.score) || (a.price - b.price))
    .map(({ creator, price, score, why }) => ({ creator, price, score, why }))
}

/* ─────────────────────────────────────────────────────────────────────────────
   DATES — a schedule built BACKWARDS from the night, so every job has slack and
   nobody is asked to start before the person feeding them has finished.
   ──────────────────────────────────────────────────────────────────────────── */

export function addDays(from: Date, n: number): Date {
  const d = new Date(from); d.setDate(d.getDate() + n); return d
}
export function dayLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}
export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

/* ─────────────────────────────────────────────────────────────────────────────
   WHAT HAPPENED — the reckoning. Counts of things that genuinely occurred, and a
   read on where the drop was. No forecast, no guarantee, no invented covers.
   ──────────────────────────────────────────────────────────────────────────── */

export interface FunnelStep { label: string; n: number; measured: boolean }

/**
 * The post-campaign numbers. Reach, taps and RSVPs are things the platform can
 * genuinely count. Who actually walked in is NOT — it needs the owner's word or a
 * till connection, which is why it is flagged `measured: false` and says so.
 */
export function outcomeFor(goodCount: number): { steps: FunnelStep[]; leak: number; why: string; fix: string } {
  const saw = 900 + goodCount * 260
  const tapped = Math.round(saw * 0.034)
  const said = Math.round(tapped * 0.43)
  const came = Math.round(said * 0.29)
  return {
    steps: [
      { label: 'Saw it', n: saw, measured: true },
      { label: 'Tapped through', n: tapped, measured: true },
      { label: 'Said they were coming', n: said, measured: true },
      { label: 'Actually came', n: came, measured: false },
    ],
    leak: 3,
    why: 'The top of this worked. Reach was strong and the tap rate beat your usual. You lost it between yes and the door.',
    fix: 'Your reminder went out three days early. Send it the morning of instead. Same plan, same cost, one date moved.',
  }
}
