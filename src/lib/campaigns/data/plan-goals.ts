/**
 * plan-goals — what an owner is actually trying to move, and the real work behind each.
 *
 * WHY THIS REPLACES THE FOUR HARDCODED LISTS. monthly-plan.ts carried a copy of plan-engine's
 * per-goal candidate arrays. Three things were wrong with that:
 *   - it named `second-visit` and `offer-eng`, which are not in the catalog, so the two plays its
 *     own ranking called highest-leverage silently did nothing;
 *   - it listed roughly half the services the catalog actually tags for each goal (11 of 22 for
 *     first visits), so plans were thinner than the shelf;
 *   - it could not grow. Eleven deliverable services — a $650 catering engine, a $1,295 pre-opening
 *     package, $750 of PR, the whole event-promo kit — had no goal that could ask for them. Real
 *     work nobody could buy, because the door was narrower than the room.
 *
 * So membership and leverage are now READ FROM THE CATALOG's goalPlays, which is where a service
 * already declares which goals it serves and how much it matters (`weight`). Retag a service in the
 * catalog and the goal list follows it. Nobody hand-maintains 57 services in two places.
 *
 * THE PENDING BLOCK IS DELIBERATE AND TEMPORARY. Three goals below are authored here rather than
 * read from goalPlays, because the catalog does not tag them yet. The SQL that moves them into
 * catalog_services lives beside this file (supabase/manual/goal-plays-new-goals.sql). When it is
 * applied and the catalog republished, delete the `pending` arrays — the derivation will already be
 * returning the same ids. Authoring them here is the honest interim: the work is real and priced,
 * only the tagging is missing.
 *
 * CLIENT-SAFE: pure data + resolvers, no server imports.
 */

import { GENERATED_CATALOG } from './catalog.generated'
import { isServiceReady } from './service-availability'

/**
 * THE SHAPE OF THE WORK, which the builder could not express at all until now.
 *
 * Two of the three requests that prompted this redesign were dated ("new location opening, I want a
 * line at the grand opening", "we have a concert coming up") and could not be typed into a form
 * whose answers were goals, budget, promote, audience, reach and avoid. Shape decides whether the
 * one-time event kit applies, and it drives deriveSchedule, which already knows how to work
 * BACKWARDS from a date so the last beat lands on the night.
 */
export type CampaignShape = 'date' | 'run' | 'ongoing'

export const SHAPES: readonly { v: CampaignShape; label: string; sub: string; asks: string }[] = [
  { v: 'date', label: 'One day or night', sub: 'A grand opening, a concert, a holiday', asks: 'When is it?' },
  { v: 'run', label: 'A stretch', sub: 'A new menu, a season, a limited offer', asks: 'From when to when?' },
  { v: 'ongoing', label: 'Ongoing', sub: 'No end date. It just keeps running', asks: '' },
]

export type PlanGoalKey =
  | 'opening'
  | 'event'
  | 'more-new'
  | 'reviews'
  | 'bigger-checks'
  | 'catering'
  | 'own-takeout'
  | 'get-known'
  | 'regulars'

export interface Candidate {
  id: string
  kind: 'foundation' | 'growth'
  priority?: number
}

/**
 * The plumbing every plan stands on, whichever goal is chosen. Kept as an explicit short list rather
 * than derived: the catalog's `essential` flag marks 28 of 57 services, which is a different idea
 * (things a good plan usually wants) from this one (things without which the rest cannot run).
 */
const FOUNDATIONS = new Set([
  'gbp-setup',
  'site-menu',
  'tracking',
  'crm-list',
  'photo-library',
  'review-claim',
  'listings-sync',
  'channel-connect',
  'email-found',
  'sms-found',
])

export interface PlanGoal {
  key: PlanGoalKey
  /** the owner's words, not ours */
  label: string
  sub: string
  /** the goal tag the catalog uses, when it has one */
  catalogGoal?: string
  /** authored until the catalog carries the tagging — see the header */
  pending?: Candidate[]
  /** offering a goal we cannot serve is worse than not offering it */
  state: 'ready' | 'coming-soon'
  /** shown on the card when coming-soon, so the gap is named rather than hidden */
  soonWhy?: string
  /** which shapes this goal makes sense for. A grand opening is not an ongoing programme, and
   *  "get them coming back" is not a single night. Offering either in the wrong shape is noise. */
  shapes: readonly CampaignShape[]
  col: string
}

const ALL_SHAPES: readonly CampaignShape[] = ['date', 'run', 'ongoing']

/**
 * THE SEVEN.
 *
 * "Busier quiet nights" is deliberately NOT here. It was never a different goal from "more new
 * people" — it is the same goal on a Tuesday. A *when* modifies any goal rather than replacing one,
 * so it moved to its own question and merges the `nights` candidates on top of whatever is picked.
 */
export const PLAN_GOALS: readonly PlanGoal[] = [
  {
    key: 'opening',
    shapes: ['date', 'run'],
    label: 'We are opening a new place',
    sub: 'A grand opening, or a relaunch',
    state: 'ready',
    col: '#D97757',
    /*
     * The catalog has had a $1,295 pre-opening package all along, described as "the 8-week ladder:
     * coming-soon page + list building, GBP live 90 days pre-open, countdown content, staged soft
     * opening, opening press push". It was reachable by NO goal at all. This is that door.
     */
    pending: [
      { id: 'pre-opening', kind: 'growth', priority: 1 },
      { id: 'gbp-setup', kind: 'foundation' },
      { id: 'site-menu', kind: 'foundation' },
      { id: 'photo-library', kind: 'foundation' },
      { id: 'tracking', kind: 'foundation' },
      { id: 'listings-sync', kind: 'foundation' },
      { id: 'local-seo', kind: 'growth', priority: 2 },
      { id: 'paid-ads', kind: 'growth', priority: 3 },
      { id: 'pr-media', kind: 'growth', priority: 4 },
      { id: 'creator-collab', kind: 'growth', priority: 5 },
      { id: 'graphic', kind: 'growth', priority: 6 },
      { id: 'fb-event', kind: 'growth', priority: 7 },
      { id: 'gbp-event-post', kind: 'growth', priority: 8 },
      { id: 'street-sampling', kind: 'growth', priority: 9 },
    ],
  },
  {
    key: 'event',
    shapes: ['date', 'run'],
    label: 'We have something coming up',
    sub: 'A concert, a party, a one-off night',
    state: 'ready',
    col: '#7B77D6',
    /*
     * The event kit is built, priced and deliverable, and the old promote-event path never touched
     * it: it composed synthetic ids (evt-graphic, evt-fbpage) that got priced as GENERIC content by
     * type, so an owner promoting a concert was billed a $70 Instagram post instead of the
     * purpose-built $45 Google event post. These are the real catalog ids.
     */
    pending: [
      { id: 'event-pkg', kind: 'growth', priority: 1 },
      { id: 'graphic', kind: 'growth', priority: 2 },
      { id: 'fb-event', kind: 'growth', priority: 3 },
      { id: 'gbp-event-post', kind: 'growth', priority: 4 },
      { id: 'paid-ads', kind: 'growth', priority: 5 },
      { id: 'creator-collab', kind: 'growth', priority: 6 },
      { id: 'gbp-posts', kind: 'growth', priority: 7 },
      { id: 'photo-library', kind: 'foundation' },
      { id: 'tracking', kind: 'foundation' },
      { id: 'site-menu', kind: 'foundation' },
    ],
  },
  {
    key: 'more-new',
    shapes: ['run', 'ongoing'],
    label: 'More new people',
    sub: 'Folks who have never been in',
    catalogGoal: 'firstvisit',
    state: 'ready',
    col: '#5FA8D3',
  },
  {
    key: 'reviews',
    shapes: ['ongoing'],
    label: 'Better reviews',
    sub: 'More of them, and better ones',
    catalogGoal: 'reviews',
    state: 'ready',
    col: '#34C08E',
  },
  {
    key: 'bigger-checks',
    shapes: ['run', 'ongoing'],
    label: 'Bigger checks',
    sub: 'Get more from the guests you already have',
    state: 'ready',
    col: '#E0A458',
    // The only goal that needs no new customers at all, which is why operators reach for it first.
    pending: [
      { id: 'menu-eng', kind: 'growth', priority: 1 },
      { id: 'incentive-design', kind: 'growth', priority: 2 },
      { id: 'photo-library', kind: 'foundation' },
      { id: 'site-menu', kind: 'foundation' },
      { id: 'tracking', kind: 'foundation' },
      { id: 'reporting', kind: 'growth', priority: 6 },
    ],
  },
  {
    key: 'catering',
    shapes: ['run', 'ongoing'],
    label: 'Catering and parties',
    sub: 'Private events, big tables, offices',
    state: 'ready',
    col: '#C86FBF',
    // The highest-margin revenue in most buildings, and it had no door at all until now.
    pending: [
      { id: 'catering-engine', kind: 'growth', priority: 1 },
      { id: 'site-menu', kind: 'foundation' },
      { id: 'photo-library', kind: 'foundation' },
      { id: 'tracking', kind: 'foundation' },
      { id: 'graphic', kind: 'growth', priority: 4 },
      { id: 'fb-event', kind: 'growth', priority: 5 },
      { id: 'local-seo', kind: 'growth', priority: 3 },
      // Ongoing work, or this is a setup with nothing keeping it alive afterwards.
      { id: 'gbp-posts', kind: 'growth', priority: 6 },
      { id: 'social-mgmt', kind: 'growth', priority: 7 },
    ],
  },
  {
    key: 'own-takeout',
    shapes: ['ongoing'],
    label: 'Own your takeout',
    sub: 'Orders on your site, not the apps',
    state: 'ready',
    col: '#4F9D8C',
    // "Stop paying thirty percent" is a sentence every operator has said out loud.
    pending: [
      { id: 'ordering-setup', kind: 'growth', priority: 1 },
      { id: 'site-menu', kind: 'foundation' },
      { id: 'photo-library', kind: 'foundation' },
      { id: 'tracking', kind: 'foundation' },
      { id: 'website-care', kind: 'growth', priority: 4 },
      { id: 'gbp-setup', kind: 'foundation' },
    ],
  },
  {
    key: 'get-known',
    shapes: ['run', 'ongoing'],
    label: 'Get known around here',
    sub: 'Press, a look, a name people recognise',
    state: 'ready',
    col: '#8E7CC3',
    pending: [
      { id: 'brand-kit', kind: 'foundation' },
      { id: 'pr-media', kind: 'growth', priority: 2 },
      { id: 'video-single', kind: 'growth', priority: 3 },
      { id: 'social-mgmt', kind: 'growth', priority: 1 },
      { id: 'photo-library', kind: 'foundation' },
      { id: 'tracking', kind: 'foundation' },
    ],
  },
  {
    key: 'regulars',
    shapes: ['ongoing'],
    label: 'Get them coming back',
    sub: 'The same faces, more often',
    catalogGoal: 'regulars',
    state: 'coming-soon',
    soonWhy: 'Needs email and texting, which we cannot send for you yet. Picking it today would buy you almost nothing, so we are not selling it.',
    col: '#7B77D6',
  },
]

/**
 * WHAT THE OWNER ACTUALLY SAYS, in their words, with the shape falling out of it.
 *
 * The first version of this screen opened with "Is this a date, a run, or ongoing?" — a taxonomy
 * question, invented to solve OUR dependency (shape gates the goals) rather than theirs. Nobody
 * walks in thinking in shapes. They walk in with a situation: "we are opening a new location", "we
 * have a concert coming up", "it is dead in here". The shape is already inside the sentence.
 *
 * So the situation IS the first question, and the shape is derived. Picking one dims the situations
 * of a different shape, which shows the constraint instead of asking about it.
 */
/** A question the builder can ask. Only these five reach the composer. */
export type PlanQuestion = 'assets' | 'promote' | 'reach' | 'shift' | 'avoid'

/**
 * The whole bank of follow-ups, and what each one actually changes about the plan.
 *
 * This exists so the model can CHOOSE the follow-ups for a particular brief instead of us running a
 * fixed list per situation. Two openings are not the same campaign: one that says "12 September, we
 * have DJs and giveaways, pull from the whole city" has already answered three of these, and one
 * that says "we're opening soon" has answered none.
 *
 * It is a bank and not a blank page on purpose. A model inventing its own questions would collect
 * answers nothing downstream can read, and the plan would be composed from five fields regardless.
 * Choosing from a fixed five keeps the output structured while still letting the choice be genuinely
 * per-brief.
 *
 * `changes` is written for the model, not the screen: it is the basis on which "is this worth asking
 * about THIS campaign" can be judged, and it is the same text the prompt ships, so the rule the
 * model is given can never drift from the rule this file states.
 */
export const PLAN_QUESTIONS: readonly { q: PlanQuestion; asks: string; changes: string }[] = [
  {
    q: 'assets',
    asks: 'What they already have or can easily get: a DJ, something to give away, tickets, a room or patio, staff willing to be filmed, their own photos.',
    changes: 'Anything they bring is not sold back to them, and some services become worth more because of it. Skip if they already listed what they have.',
  },
  {
    q: 'promote',
    asks: 'Which dish, room, night or offer the work should put in front of people.',
    changes: 'Decides what the posts, ads and photographs are actually about. Skip if they already named the thing.',
  },
  {
    q: 'reach',
    asks: 'How far to pull people from, and who walks in.',
    changes: 'Drops services that only work on a local address, and sizes how many people have to see it. Skip if they said the neighbourhood, the city, or named an audience.',
  },
  {
    q: 'shift',
    asks: 'Which shifts or nights are the empty ones.',
    changes: 'Aims the same work at the shifts that sit empty instead of spreading it across the week. Only worth asking when the problem is uneven across the week.',
  },
  {
    q: 'avoid',
    asks: 'Anything off limits: no discounting, no filming staff, no paid ads.',
    changes: 'Removes whole services before the plan is priced. Cheap to ask and expensive to get wrong, but skip it if they already said what they will not do.',
  },
]

export interface Situation {
  v: string
  /** the sentence an owner would actually say */
  label: string
  sub: string
  goal: PlanGoalKey
  shape: CampaignShape
  /**
   * WHICH FOLLOW-UPS THIS SITUATION ACTUALLY NEEDS.
   *
   * Every version of this screen asked all five of everyone, which is how someone fixing their
   * review score ended up picking menu items to promote and naming which nights are slow. A
   * question that cannot change this particular plan is noise dressed as diligence, and the owner
   * reads it as a form rather than as being understood.
   *
   * Relevance is only half the rule. A relevant question is still skipped when we already know the
   * answer, either from onboarding or from what they just wrote.
   */
  needs: readonly PlanQuestion[]
}

/**
 * THE RULE FOR `sub`: it says more about the SITUATION. Never what we would do about it, and never
 * the outcome they want.
 *
 * Two of these used to break it, and it was the main reason the list read as muddled: "Nobody
 * around here knows us" was subtitled "Press, a look, a name people recognise" (our services) and
 * "People come once and never again" was subtitled "The same faces, more often" (the goal). Scanning
 * eleven cards is only fast when every sub-line is answering the same question.
 */
export const SITUATIONS: readonly Situation[] = [
  { v: 'opening', needs: ['assets', 'reach', 'avoid'], label: 'We are opening a new place', sub: 'A grand opening, or a relaunch', goal: 'opening', shape: 'date' },
  { v: 'event', needs: ['assets', 'reach', 'avoid'], label: 'We have something coming up', sub: 'A concert, a party, a one-off night', goal: 'event', shape: 'date' },
  { v: 'new-thing', needs: ['promote', 'assets', 'reach', 'avoid'], label: 'We are putting something new on', sub: 'A new menu, a dish, a limited run', goal: 'more-new', shape: 'run' },
  { v: 'quiet', needs: ['promote', 'reach', 'avoid'], label: 'It has gone quiet', sub: 'Fewer people are coming in than before', goal: 'more-new', shape: 'ongoing' },
  { v: 'slow-shifts', needs: ['shift', 'promote', 'avoid'], label: 'Certain shifts are dead', sub: 'Some nights sit empty while others are fine', goal: 'more-new', shape: 'ongoing' },
  { v: 'reviews', needs: ['avoid'], label: 'Our reviews need work', sub: 'Too few of them, or the wrong ones', goal: 'reviews', shape: 'ongoing' },
  { v: 'checks', needs: ['promote', 'avoid'], label: 'We want bigger checks', sub: 'More from the guests already coming', goal: 'bigger-checks', shape: 'ongoing' },
  { v: 'catering', needs: ['assets', 'reach', 'avoid'], label: 'We want catering and parties', sub: 'Private events, big tables, offices', goal: 'catering', shape: 'ongoing' },
  { v: 'takeout', needs: ['promote', 'avoid'], label: 'We want to own our takeout', sub: 'Orders on our site, not the apps', goal: 'own-takeout', shape: 'ongoing' },
  { v: 'known', needs: ['assets', 'promote', 'reach', 'avoid'], label: 'Nobody around here knows us', sub: 'You have been open a while and the neighbourhood has not noticed', goal: 'get-known', shape: 'ongoing' },
  { v: 'return', needs: ['avoid'], label: 'People come once and never again', sub: 'Plenty of first visits, hardly any second ones', goal: 'regulars', shape: 'ongoing' },
]

export const situationByValue = (v: string) => SITUATIONS.find((x) => x.v === v)

/**
 * Read a situation out of the owner's own sentence, with no model involved.
 *
 * WHY THIS EXISTS. The first screen is now one box: the owner describes their situation and we work
 * out the rest. Everything downstream — which goals get composed, whether a date is asked for, which
 * follow-ups are relevant — hangs off the situation, and the only thing that sets it is the parse.
 * So a screen with a single box and a single model call is a screen with a single point of failure,
 * and we have already watched that failure happen: the Anthropic balance ran dry and the front door
 * stopped working, silently, for everyone.
 *
 * This is the floor under that. It is deliberately dumb — weighted keyword counting, no cleverness —
 * because its whole job is to be available when the smart thing is not. The model still runs first
 * and still does better (it also reads the date, the assets and what we cannot do). This only
 * catches the fall.
 *
 * Phrases are scored above single words: "gone quiet" is evidence, "quiet" on its own could be
 * anything. A tie or a miss returns null, and null is honest — the screen then asks rather than
 * guessing, which is the one thing a fallback must never get wrong.
 */
interface Cue {
  v: string
  /** Multi-word phrases. Strong evidence, worth 3. */
  phrases: readonly string[]
  /** Single words. Weak evidence, worth 1. */
  words: readonly string[]
}

const CUES: readonly Cue[] = [
  { v: 'opening',
    phrases: ['grand opening', 'new location', 'second location', 'another location', 'new place', 'new shop', 'new store', 'opening day', 'we open', 'we are opening', 'were opening', 'about to open', 're-open', 'reopen', 'relaunch'],
    words: ['opening', 'launch'] },
  { v: 'event',
    phrases: ['live music', 'one off', 'one-off', 'guest chef', 'we have a', 'coming up on', 'ticketed'],
    words: ['event', 'concert', 'party', 'dj', 'gig', 'anniversary', 'festival', 'show'] },
  { v: 'new-thing',
    phrases: ['new menu', 'new dish', 'new item', 'limited run', 'limited time', 'putting on', 'adding a', 'seasonal menu'],
    words: ['special', 'seasonal', 'tasting'] },
  { v: 'quiet',
    phrases: ['gone quiet', 'slowed down', 'fewer people', 'less busy', 'not busy', 'no one is coming', 'nobody is coming', 'nobody comes', 'down on last', 'sales are down', 'super slow', 'really slow'],
    words: ['quiet', 'slow', 'empty', 'dead', 'dropped'] },
  { v: 'slow-shifts',
    phrases: ['slow nights', 'dead nights', 'slow shifts', 'certain nights', 'some nights', 'mid week', 'midweek', 'week nights', 'weeknights', 'lunch service', 'lunch is', 'monday and tuesday', 'tuesdays and wednesdays'],
    words: ['tuesday', 'wednesday', 'monday', 'weekday', 'lunches'] },
  { v: 'reviews',
    phrases: ['google reviews', 'bad reviews', 'more reviews', 'star rating', 'our rating', 'one star', 'review score'],
    words: ['reviews', 'review', 'yelp', 'stars', 'rating', 'reputation'] },
  { v: 'checks',
    phrases: ['average check', 'bigger checks', 'spend more', 'order more', 'ticket size', 'per head', 'add ons', 'add-ons'],
    words: ['upsell'] },
  { v: 'catering',
    phrases: ['private event', 'private events', 'large group', 'large groups', 'big tables', 'office lunch', 'office orders', 'corporate orders', 'book the space', 'private dining'],
    words: ['catering', 'cater', 'banquet', 'functions'] },
  { v: 'takeout',
    phrases: ['our own site', 'our own website', 'off the apps', 'third party apps', 'delivery apps', 'online ordering', 'order direct', 'direct orders', 'commission fees'],
    words: ['takeout', 'takeaway', 'doordash', 'ubereats', 'grubhub', 'deliveroo'] },
  { v: 'known',
    phrases: ['nobody knows', 'no one knows', 'never heard of', 'not on the map', 'get our name', 'build our name', 'brand awareness', 'get known', 'more people knew'],
    words: ['unknown', 'press', 'awareness'] },
  { v: 'return',
    phrases: ['come back', 'coming back', 'come once', 'second visit', 'never return', 'do not return', 'repeat customers', 'repeat business', 'same faces', 'one time'],
    words: ['regulars', 'loyalty', 'retention'] },
]

export interface SituationMatch {
  situation: Situation
  /** How much evidence there was. Useful for deciding whether to state it or ask. */
  score: number
}

/**
 * Best-effort situation from free text. Null when nothing scored, or when the top two tie —
 * a coin-flip dressed as an answer is worse than admitting we did not follow.
 */
export function matchSituation(text: string): SituationMatch | null {
  const hay = ' ' + text.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ') + ' '
  if (hay.trim().length < 3) return null

  const scored = CUES.map((c) => {
    let score = 0
    for (const p of c.phrases) if (hay.includes(' ' + p + ' ') || hay.includes(' ' + p)) score += 3
    for (const w of c.words) if (hay.includes(' ' + w + ' ') || hay.includes(' ' + w + 's ')) score += 1
    return { v: c.v, score }
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)

  if (!scored.length) return null
  if (scored.length > 1 && scored[0].score === scored[1].score) return null

  const situation = situationByValue(scored[0].v)
  return situation ? { situation, score: scored[0].score } : null
}

/**
 * What is still worth asking: relevant to what they picked, AND not already answered.
 *
 * `known` is everything we have from onboarding or from the description they just wrote. A good
 * description can empty this list entirely, and when it does the honest thing is to go straight to
 * the plan rather than inventing a question to look thorough.
 */
/**
 * Take a model's chosen follow-ups and keep only what this codebase can actually act on.
 *
 * Lives here rather than in the route because it is vocabulary validation, and the vocabulary is
 * defined in this file. It is also the part most worth testing: a question key we do not recognise
 * renders nothing, and a repeated one renders the same step twice under different numbers, and both
 * failures are invisible until an owner hits them.
 */
export function sanitizeAsk(raw: unknown): { q: PlanQuestion; why: string }[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<PlanQuestion>()
  const out: { q: PlanQuestion; why: string }[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const q = (item as { q?: unknown }).q
    if (!PLAN_QUESTIONS.some((p) => p.q === q)) continue
    if (seen.has(q as PlanQuestion)) continue
    seen.add(q as PlanQuestion)
    const why = (item as { why?: unknown }).why
    out.push({ q: q as PlanQuestion, why: typeof why === 'string' ? why.slice(0, 160) : '' })
    if (out.length >= PLAN_QUESTIONS.length) break
  }
  return out
}

export function gapsFor(
  situations: readonly string[],
  known: Partial<Record<PlanQuestion, boolean>>,
  /**
   * What the model decided THIS brief still needs, if it got a look.
   *
   * `undefined` means no read happened (model down, or nothing described yet) and the situation's
   * standing list is used. An empty array is a real answer and is honoured: it means the paragraph
   * covered everything, and we go straight to building rather than inventing a question so the
   * screen looks thorough.
   */
  chosen?: readonly PlanQuestion[],
): PlanQuestion[] {
  let wanted: PlanQuestion[]
  if (chosen) {
    wanted = [...new Set(chosen)]
  } else {
    const set = new Set<PlanQuestion>()
    for (const v of situations) for (const q of situationByValue(v)?.needs ?? []) set.add(q)
    wanted = [...set]
  }
  /* Still subtracted, whoever chose. The model does not see the account, so it can ask for the one
   * thing onboarding already answered — and being asked something the portal demonstrably knows is
   * the exact failure this whole module exists to prevent. */
  return wanted.filter((q) => !known[q])
}

/**
 * WHAT THE OWNER BRINGS.
 *
 * Both event requests that prompted this redesign LED with their own assets: "we can do DJs,
 * giveaways", "we have DJs and can give away concert tickets". The system captured none of it.
 * Searching the repo for dj, raffle, contest or prize as an owner input returned nothing, so those
 * words landed in a free-text box, were copied verbatim into the maker brief, and changed nothing
 * about what was composed, priced or scheduled.
 *
 * Two effects, deliberately kept apart:
 *   covers  we do not sell what they already have. Feeds the existing `have` path, so a covered
 *           service renders as "you already have this" at $0 through machinery already tested.
 *   boosts  this service is worth more BECAUSE of what they bring. A DJ makes the event package
 *           something to promote; 200 tickets make offer design worth paying for.
 *
 * `covers` is deliberately thin. Having a prize is not the same as knowing how to structure the
 * offer, and claiming otherwise would be the flattering-but-wrong direction. Owner-supplied photos
 * genuinely do replace a shoot, and there is precedent: footageSource 'owner' already suppresses a
 * shoot gate elsewhere in the codebase.
 */
export interface OwnerAsset {
  v: string
  label: string
  sub: string
  covers?: readonly string[]
  boosts?: readonly string[]
}

export const OWNER_ASSETS: readonly OwnerAsset[] = [
  { v: 'A DJ or live music', label: 'A DJ or live music', sub: 'Someone booked, or easy to book', boosts: ['event-pkg', 'bar-events', 'graphic'] },
  { v: 'Something to give away', label: 'Something to give away', sub: 'A meal, merch, a prize', boosts: ['incentive-design', 'event-pkg'] },
  { v: 'Tickets', label: 'Tickets', sub: 'To the show, the game, the night', boosts: ['incentive-design', 'creator-collab'] },
  { v: 'A private room or patio', label: 'A room or patio', sub: 'Space we can fill or feature', boosts: ['catering-engine', 'fb-event'] },
  { v: 'Staff happy to be on camera', label: 'Staff on camera', sub: 'People who will film with us', boosts: ['video-single', 'staff-advocacy'] },
  { v: 'Our own photos or video', label: 'Our own photos or video', sub: 'Recent, and good enough to post', covers: ['photo-library', 'menu-photo-refresh'] },
  { v: 'A special dish or menu', label: 'A special dish or menu', sub: 'Something new, or just for this', boosts: ['lto-launch', 'menu-eng'] },
  { v: 'A partner or sponsor', label: 'A partner or sponsor', sub: 'Another business in on it', boosts: ['pr-media', 'creator-collab'] },
  { v: 'Nothing yet', label: 'Nothing yet', sub: 'Tell us what is worth getting' },
]

const assetByValue = (v: string) => OWNER_ASSETS.find((a) => a.v === v)

/** Services the owner's own assets make unnecessary. Merge into `have` and they cost nothing. */
export function assetsCover(assets?: readonly string[]): string[] {
  return [...new Set((assets ?? []).flatMap((v) => assetByValue(v)?.covers ?? []))]
}

/** Services worth more because of what they bring. Ranked ahead of their neighbours, not forced. */
export function assetsBoost(assets?: readonly string[]): string[] {
  return [...new Set((assets ?? []).flatMap((v) => assetByValue(v)?.boosts ?? []))]
}

/**
 * TAILORED SUGGESTIONS (owner, 2026-07-30): the asset list ordered by how much THIS campaign
 * can use each one. No new data: an asset matters here exactly when its covers/boosts intersect
 * the picked situations' candidate services. A DJ leads for an event, a room leads for
 * catering, and the order is honest because it derives from the same tables that price and
 * rank the work. Ties keep the authored order. 'Nothing yet' never ranks (it is the escape).
 */
export function relevantAssets(situations: readonly string[]): string[] {
  const svc = new Set(
    situations.flatMap((v) => {
      const sit = situationByValue(v)
      return sit ? candidatesForGoal(sit.goal).map((c) => c.id) : []
    }),
  )
  const score = (a: OwnerAsset) => [...(a.covers ?? []), ...(a.boosts ?? [])].filter((id) => svc.has(id)).length
  return OWNER_ASSETS
    .filter((a) => a.v !== 'Nothing yet')
    .map((a, i) => ({ v: a.v, s: score(a), i }))
    .sort((x, y) => y.s - x.s || x.i - y.i)
    .map((x) => x.v)
}

/** Goals worth offering for a shape. A grand opening is not an ongoing programme. */
export function goalsForShape(shape?: CampaignShape): readonly PlanGoal[] {
  if (!shape) return PLAN_GOALS
  return PLAN_GOALS.filter((g) => g.shapes.includes(shape))
}

/** The *when*, not a goal. Merges the catalog's night work on top of whatever outcome is picked. */
export const SHIFT_GOAL = 'nights'

export const goalByKey = (k: string): PlanGoal | undefined => PLAN_GOALS.find((g) => g.key === k)

/**
 * Membership and leverage, read from the catalog. `weight` is how much a service matters to a goal,
 * so a high weight becomes a low priority number — the packer takes priority 1 first.
 */
function derived(catalogGoal: string): Candidate[] {
  const out: Candidate[] = []
  for (const s of GENERATED_CATALOG as { id: string; goalPlays?: { goal: string; weight?: number }[] }[]) {
    const play = s.goalPlays?.find((g) => g.goal === catalogGoal)
    if (!play) continue
    out.push({
      id: s.id,
      kind: FOUNDATIONS.has(s.id) ? 'foundation' : 'growth',
      priority: 10 - Math.min(9, play.weight ?? 1),
    })
  }
  return out
}

/** Everything a goal wants, catalog-derived plus anything still authored here. Deduped by id. */
export function candidatesForGoal(key: string): Candidate[] {
  const g = goalByKey(key)
  if (!g) return []
  const seen = new Map<string, Candidate>()
  for (const c of [...(g.catalogGoal ? derived(g.catalogGoal) : []), ...(g.pending ?? [])]) {
    const cur = seen.get(c.id)
    if (!cur) seen.set(c.id, c)
    else if ((c.priority ?? 99) < (cur.priority ?? 99)) seen.set(c.id, { ...cur, priority: c.priority })
  }
  return [...seen.values()]
}

/** The shift question's own candidates, merged in when the owner names a slow stretch. */
export function shiftCandidates(): Candidate[] {
  return derived(SHIFT_GOAL)
}

/**
 * How much of a goal we can actually deliver today. The setup screen shows this on the card, so an
 * owner never picks something and discovers afterwards that most of it is held.
 */
export function goalReadiness(key: string): { ready: number; held: number } {
  let ready = 0
  let held = 0
  for (const c of candidatesForGoal(key)) {
    if (isServiceReady(c.id)) ready += 1
    else held += 1
  }
  return { ready, held }
}

/* ═══════════════════════════════════════════════════════ the walk's option vocabularies ═══ */

/**
 * THE VOCABULARIES THE WALK OFFERS, in one place, because two things validate against them:
 * the question screens render them, and the describe read (Phase 2 of the Campaign Ledger,
 * docs/CAMPAIGN-LEDGER-PLAN.md) may only extract values that appear here. The model does not
 * get to widen the vocabulary — same law as situations and assets above.
 */
export interface WalkOpt { v: string; label: string; sub?: string }

/* Days + dayparts, matching how owners say it ("Tuesday nights are dead"). The week strip
 * renders the first seven; the daypart chips render the rest. */
export const SHIFT_DAYS: readonly WalkOpt[] = [
  { v: 'Monday', label: 'M' },
  { v: 'Tuesday', label: 'T' },
  { v: 'Wednesday', label: 'W' },
  { v: 'Thursday', label: 'T' },
  { v: 'Friday', label: 'F' },
  { v: 'Saturday', label: 'S' },
  { v: 'Sunday', label: 'S' },
]
export const SHIFT_PARTS: readonly WalkOpt[] = [
  { v: 'Lunch', label: 'Lunch', sub: 'The midday shift' },
  { v: 'Dinner', label: 'Dinner', sub: 'The evening shift' },
  { v: 'After the rush', label: 'Late', sub: 'The last hours' },
  { v: 'The off-season', label: 'Off-season', sub: 'The slow months' },
]
export const SHIFT_OPTIONS: readonly WalkOpt[] = [...SHIFT_DAYS, ...SHIFT_PARTS]

/** Who walks in: age, life stage and occasion together, because owners think in all three. */
export const AUDIENCE_OPTIONS: readonly WalkOpt[] = [
  { v: 'Young professionals', label: 'Young professionals', sub: 'Mid twenties to forties, after work' },
  { v: 'Families with kids', label: 'Families', sub: 'Kids in tow, early evening' },
  { v: 'Students', label: 'Students', sub: 'Price matters, late hours' },
  { v: 'Older regulars', label: 'Older regulars', sub: 'Fifty-five and up, daytime and early' },
  { v: 'Couples and date night', label: 'Date night', sub: 'Couples, weekend, unhurried' },
  { v: 'Groups and celebrations', label: 'Groups', sub: 'Birthdays, work dos, big tables' },
  { v: 'The weekday lunch crowd', label: 'Lunch crowd', sub: 'Nearby offices, fast, weekday' },
  { v: 'Late night', label: 'Late night', sub: 'After the bars, after a shift' },
  { v: 'Visitors and tourists', label: 'Visitors', sub: 'Hotels, sightseers, passing through' },
]

export const REACH_OPTIONS: readonly { v: 'walk' | 'local' | 'city' | 'region' | 'anywhere'; label: string; sub: string }[] = [
  { v: 'walk', label: 'The block', sub: 'People who can walk here' },
  { v: 'local', label: 'The neighbourhood', sub: 'A mile or two out' },
  { v: 'city', label: 'The whole city', sub: 'Worth crossing town for' },
  { v: 'region', label: 'The wider region', sub: 'Worth a drive' },
  { v: 'anywhere', label: 'Anywhere', sub: 'We ship or deliver beyond the area' },
]

/** What NOT to do. Every one of these is a real complaint an owner has had about marketing. */
export const AVOID_OPTIONS: readonly WalkOpt[] = [
  { v: 'Discounts and deals', label: 'Discounts', sub: 'Nothing that reads as cheap' },
  { v: 'Anything about price', label: 'Price talk', sub: 'Leave the numbers out' },
  { v: 'Staff or faces on camera', label: 'Faces on camera', sub: 'Nobody on film' },
  { v: 'Alcohol front and centre', label: 'Alcohol-led', sub: 'Keep drink out of the lead' },
  { v: 'Emoji and slang', label: 'Emoji and slang', sub: 'Keep the tone straight' },
  { v: 'Trends and memes', label: 'Trends', sub: 'No chasing the feed' },
  { v: 'Comparing us to others', label: 'Comparisons', sub: 'Never name a competitor' },
  { v: 'Politics or anything topical', label: 'Anything topical', sub: 'Stay out of the news' },
]

/** Everything a restaurant advertises that is not a dish. The menu is offered alongside these. */
export const PROMOTE_OTHER_OPTIONS: readonly { group: string; items: WalkOpt[] }[] = [
  {
    group: 'The place',
    items: [
      { v: 'The bar and the drinks', label: 'The bar', sub: 'Cocktails, wine, the list' },
      { v: 'The patio or outdoor space', label: 'The patio', sub: 'Outdoor seating, the terrace' },
      { v: 'The room itself', label: 'The room', sub: 'The space, the light, the feel' },
      { v: 'A private or group space', label: 'Private space', sub: 'Back room, big tables' },
    ],
  },
  {
    group: 'What you do',
    items: [
      { v: 'A weekly night or event', label: 'A weekly night', sub: 'Trivia, music, game day' },
      { v: 'Happy hour', label: 'Happy hour', sub: 'The early window' },
      { v: 'Catering and private events', label: 'Catering', sub: 'Parties, offices, functions' },
      { v: 'Takeout and delivery', label: 'Takeout', sub: 'Off-premise, delivery apps' },
    ],
  },
  {
    group: 'Who you are',
    items: [
      { v: 'The chef or the owner', label: 'The chef', sub: 'The person behind it' },
      { v: 'The family story', label: 'The story', sub: 'How it started, who runs it' },
      { v: 'How long you have been here', label: 'The years', sub: 'Longevity, the institution' },
      { v: 'An award or a write-up', label: 'The press', sub: 'A review, a list, a prize' },
    ],
  },
]

/* ══════════════════════════════════════════ the describe read (Campaign Ledger, Tier 2) ═══ */

/**
 * What the paragraph itself answered, beyond the situation. Every field here was EXTRACTED, not
 * asked — sanitizeRead only lets a value through when the model backed it with a quote that
 * actually appears in the owner's text (the evidence law), and the value survives our own
 * vocabulary. The screen prefills from this and drops the matching question from the walk;
 * budget is the exception — it always gets an explicit confirm tap before it sizes anything
 * (owner rule, 2026-07-29).
 */
export interface DescribeRead {
  budget?: number
  /** 'asap' or ISO yyyy-mm-dd. Only meaningful for ongoing shapes — dated shapes use `when`. */
  start?: string
  reach?: 'walk' | 'local' | 'city' | 'region' | 'anywhere'
  shift?: string[]
  avoid?: string[]
  audience?: string[]
  promote?: string[]
  offerTerms?: string
  offerLimit?: string
  offerExpiry?: string
}

/**
 * A full date is only credible when its DAY appears as a number in the owner's own text
 * (owner catch, 2026-07-30: "in September" was being coerced to "September 1st"). Digit runs
 * are compared whole, so day 2 never sneaks in via "2026". A month with no day is not a date;
 * it is a month, and the screen should ask with the calendar opened there.
 */
/**
 * A read date must be in the FUTURE (owner intent is always an upcoming moment; the model can
 * guess a past year when the text names no year, e.g. "August 15" read as last year). A past
 * date rolls forward one year when that lands it in the future; anything still past is no
 * date at all.
 */
export function futureDate(iso: string, todayISO: string): string | null {
  if (iso >= todayISO) return iso
  const bumped = String(Number(iso.slice(0, 4)) + 1) + iso.slice(4)
  return bumped >= todayISO ? bumped : null
}

export function credibleDate(iso: string | null | undefined, text: string): boolean {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false
  const day = Number(iso.slice(8))
  const runs = (text.match(/\d+/g) ?? []).map(Number)
  return runs.includes(day)
}

const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

/**
 * The month they wrote, when they wrote one ("in September"), local and deterministic — no
 * model involved, so the calendar opens on their month whether or not the read behaved. A
 * month already past this year means next year. Returns 'YYYY-MM' or null.
 */
export function monthHintFrom(text: string, todayISO: string): string | null {
  const t = text.toLowerCase()
  const idx = MONTH_NAMES.findIndex((m) => t.includes(m))
  if (idx < 0) return null
  const y = Number(todayISO.slice(0, 4))
  const cur = Number(todayISO.slice(5, 7))
  const year = idx + 1 < cur ? y + 1 : y
  return `${year}-${String(idx + 1).padStart(2, '0')}`
}

import { norm, backedValue } from './read-evidence'

/**
 * THE EVIDENCE LAW, enforced. The model returns every read field as {value, quote}; a field whose
 * quote is missing, invented, or not a substring of what the owner wrote is dropped — a null the
 * walk asks about beats a confident fabrication that composes a wrong plan. List values are then
 * filtered to our own vocabularies, exactly like situations and assets: anything the model made
 * up silently disappears rather than silently composing.
 *
 * Pure and sim-locked (scripts/sim/campaign-ledger.ts), so the guardrail cannot drift from the
 * route that uses it.
 */
export function sanitizeRead(raw: unknown, text: string, menuNames: readonly string[]): DescribeRead {
  if (!raw || typeof raw !== 'object') return {}
  const r = raw as Record<string, { value?: unknown; quote?: unknown } | undefined>
  /** The shared evidence gate (read-evidence.ts): one law, every flow. */
  const backed = (k: string): unknown => backedValue(r[k], text)
  const str = (v: unknown, max = 120) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined)
  const inVocab = (v: unknown, vocab: readonly string[]) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && vocab.includes(x)) : []
  const out: DescribeRead = {}

  const budget = backed('budget')
  const n = typeof budget === 'number' ? Math.round(budget) : typeof budget === 'string' ? Math.round(Number(budget.replace(/[^0-9.]/g, ''))) : NaN
  if (Number.isFinite(n) && n >= 50 && n <= 50000) out.budget = n

  const start = backed('start')
  if (start === 'asap' || (typeof start === 'string' && credibleDate(start, text))) out.start = start

  const reach = backed('reach')
  if (REACH_OPTIONS.some((o) => o.v === reach)) out.reach = reach as DescribeRead['reach']

  const shift = inVocab(backed('shift'), SHIFT_OPTIONS.map((o) => o.v))
  if (shift.length) out.shift = shift
  const avoid = inVocab(backed('avoid'), AVOID_OPTIONS.map((o) => o.v))
  if (avoid.length) out.avoid = avoid
  const audience = inVocab(backed('audience'), AUDIENCE_OPTIONS.map((o) => o.v))
  if (audience.length) out.audience = audience
  const promote = inVocab(backed('promote'), [...menuNames, ...PROMOTE_OTHER_OPTIONS.flatMap((g) => g.items.map((i) => i.v))])
  if (promote.length) out.promote = promote

  const terms = str(backed('offerTerms'))
  /* A vague deal cannot be run, tracked, or capped ("some kind of deal"). No number and no
   * free/two-for-one shape means it is a wish, not terms — drop it so the composer asks. */
  const concrete = (t: string) => /\d/.test(t) || /free|two for one|2 for 1|bogo/i.test(t)
  if (terms && concrete(terms)) out.offerTerms = terms
  const limit = str(backed('offerLimit'))
  if (limit) out.offerLimit = limit
  const expiry = str(backed('offerExpiry'))
  if (expiry) out.offerExpiry = expiry

  return out
}
