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
 * How the eleven situations are grouped on the first screen.
 *
 * WHY GROUP AT ALL. Eleven flat cards is a wall, and a wall gets skimmed rather than read. Three
 * headed groups let someone find their own situation by first deciding which KIND of thing is
 * happening to them, which is a much easier judgement than comparing eleven sentences.
 *
 * The grouping is by what prompted the owner to open this screen, NOT by our `shape` field. Shape
 * (date / run / ongoing) is a scheduling consequence and means nothing to them; "something is
 * coming up" versus "something is off" is how they would actually describe their week.
 *
 * Grouped here rather than in the component so a sim can assert that every situation appears in
 * exactly one group. A new situation that nobody adds to a group would otherwise just vanish from
 * the only screen that offers it, silently.
 */
export interface SituationGroup {
  key: string
  /** The owner's framing, not ours. */
  title: string
  sub: string
  situations: readonly string[]
}

export const SITUATION_GROUPS: readonly SituationGroup[] = [
  /* The three subs are deliberately parallel and deliberately positive. An earlier pass had
   * "Nothing is broken, you want more of something", which makes the reader hold a negative in
   * their head to work out what the group is FOR. Say what it is, never what it is not. */
  {
    key: 'coming-up',
    title: 'Something is coming up',
    sub: 'A date, and you want people there for it',
    situations: ['opening', 'event', 'new-thing'],
  },
  {
    key: 'off',
    title: 'Something is not working',
    sub: 'It is quieter, or worse, than it should be',
    situations: ['quiet', 'slow-shifts', 'reviews', 'return'],
  },
  {
    key: 'grow',
    title: 'You want more of something',
    sub: 'One part of the business you want to build up',
    situations: ['checks', 'catering', 'takeout', 'known'],
  },
]

/** Every situation, in the order the first screen shows them. Empty groups are impossible by test. */
export const groupedSituations = (): { group: SituationGroup; items: Situation[] }[] =>
  SITUATION_GROUPS.map((group) => ({
    group,
    items: group.situations.map((v) => situationByValue(v)).filter((x): x is Situation => !!x),
  }))

/**
 * What is still worth asking: relevant to what they picked, AND not already answered.
 *
 * `known` is everything we have from onboarding or from the description they just wrote. A good
 * description can empty this list entirely, and when it does the honest thing is to go straight to
 * the plan rather than inventing a question to look thorough.
 */
export function gapsFor(situations: readonly string[], known: Partial<Record<PlanQuestion, boolean>>): PlanQuestion[] {
  const wanted = new Set<PlanQuestion>()
  for (const v of situations) for (const q of situationByValue(v)?.needs ?? []) wanted.add(q)
  return [...wanted].filter((q) => !known[q])
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
