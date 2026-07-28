/**
 * GUIDE MOVES — the moves worth recommending that nobody can buy.
 *
 * Law 2 (the orphan rule): a genuinely useful move is never silently dropped because we cannot
 * sell it. Law 3: it may only ship with a REAL guide behind it — a flag with no steps renders an
 * empty state, which is worse than saying nothing. The guide-moves sim enforces that pairing at
 * build time.
 *
 * These are upgraded from the mechanisms layer's FreeActions, which proved the concept ("a line
 * that is genuinely part of the plan and that we do not sell") but carried only a why and a
 * minute count. A GuideMove adds the steps: what to actually do, concretely enough to do it
 * tonight. Same content pattern as HostGuide/RegistrarGuide: a keyed record, plain words, an
 * honest gotcha where one exists.
 *
 * Pure data, client-safe. Rendered in the LineCard drawer pre- and post-ship.
 */
import type { MonthlyStepKey } from './monthly-plan'

export interface GuideMove {
  key: string
  /** The line-item name: what the move is, in the owner's words. */
  title: string
  /** Why it is in the plan at all. */
  why: string
  /** Honest time cost. Renders as "you · N min" where a price would sit. */
  minutes: number
  /** What to actually do. Two or more, each concrete enough to act on tonight. */
  steps: { label: string; detail: string }[]
}

export const GUIDE_MOVES: Record<string, GuideMove> = {
  'own-counter': {
    key: 'own-counter',
    title: 'Tell the customers you already have',
    why: 'The people already standing in your shop are the highest-converting audience you will ever reach, and reaching them is free.',
    minutes: 30,
    steps: [
      { label: 'Put a card in every bag', detail: 'One line and your handle or link. The print shop by you does 250 for cheap; even a home printer works for week one.' },
      { label: 'Put a small sign at the register', detail: 'Where people wait to pay is the one place everyone looks. Same line as the card.' },
      { label: 'Give the staff one sentence', detail: 'Something they can say while handing over the bag. One sentence, word for word, so nobody has to improvise.' },
    ],
  },
  'ask-regulars': {
    key: 'ask-regulars',
    title: 'Ask ten regulars in person',
    why: 'Not a post. Asked by name, in person, is the highest-converting invitation that exists and it is free.',
    minutes: 30,
    steps: [
      { label: 'Pick the ten', detail: 'The ones who know your name. Write the list down; ten is a real number, "some regulars" is not.' },
      { label: 'Ask them yourself, by name', detail: 'When they are in this week: "We are doing X on Tuesday. I would love it if you came." That is the whole script.' },
      { label: 'Make it easy to say yes', detail: 'Tell them they can bring someone. One person becomes two, and nobody sits alone.' },
    ],
  },
  neighbourhood: {
    key: 'neighbourhood',
    title: 'Post in the neighbourhood groups',
    why: 'Nextdoor, the local Facebook group, the neighbourhood subreddit. This is where things actually spread locally, and it costs an evening.',
    minutes: 40,
    steps: [
      { label: 'Find your three groups', detail: 'Nextdoor for your area, the biggest local Facebook group, and the neighbourhood subreddit if one exists. Join today; some approve slowly.' },
      { label: 'Write it like a neighbor, not an ad', detail: 'First person, one photo, what and when, and answer the comments. Groups delete ads and embrace people.' },
      { label: 'Ask one friendly regular to post too', detail: 'A recommendation from a member lands better than anything from the business itself.' },
    ],
  },
  storefront: {
    key: 'storefront',
    title: 'Put it in your window',
    why: 'Everyone who walks past sees your window every day. It is the cheapest billboard you will ever own.',
    minutes: 20,
    steps: [
      { label: 'One sign, three things', detail: 'What is happening, when, and a code or handle to scan. Big type; someone across the street should be able to read the first line.' },
      { label: 'Put it at eye level, facing out', detail: 'Not on the counter, not by the door frame. Where a person walking past actually looks.' },
    ],
  },
  'remind-twice': {
    key: 'remind-twice',
    title: 'Remind people twice, yourself',
    why: 'We cannot send texts for you yet, so this one is genuinely yours, and it is the highest-leverage message in the whole plan: a real share of people who said yes simply forget.',
    minutes: 20,
    steps: [
      { label: 'The night before', detail: 'A story or a post plus a personal message to the people who said yes: "See you tomorrow." Short beats clever.' },
      { label: 'The morning of', detail: 'Same channel, one line, the time and one photo. That second touch is what actually gets people through the door.' },
    ],
  },
  'greet-by-name': {
    key: 'greet-by-name',
    title: 'Learn twenty names',
    why: 'Being known is the reason people pick a place over a slightly better one. It cannot be bought, only done.',
    minutes: 15,
    steps: [
      { label: 'One name a shift', detail: 'When a repeat face pays, introduce yourself and ask theirs. Once is enough; twice makes it stick.' },
      { label: 'Use it next time', detail: 'That is the entire mechanic. The visit after you first greet someone by name is the one that makes them a regular.' },
    ],
  },
  'seed-line': {
    key: 'seed-line',
    title: 'Get the first twenty there yourself',
    why: 'A line does not start itself. Twenty people at the start time is the photo that pulls the next eighty.',
    minutes: 45,
    steps: [
      { label: 'Write the twenty down', detail: 'Staff, family, suppliers, your loudest regulars. Names on paper; "some people will come" is how a pavement ends up empty.' },
      { label: 'Give them a time fifteen minutes early', detail: 'Tell them 5:45 for a 6:00 start, personally. The line has to exist before the first stranger walks past it.' },
      { label: 'Take the photo', detail: 'The queue at minute one is the best content the whole opening produces. Post it while it is still true.' },
    ],
  },
  expectations: {
    key: 'expectations',
    title: 'Say what the wait is actually like',
    why: 'People do not fear queuing. They fear queuing badly.',
    minutes: 15,
    steps: [
      { label: 'Answer the five questions', detail: 'Covered or not, how long, is there coffee, can I bring a kid, when am I out. One post and one sign, same words.' },
      { label: 'Put it where the decision happens', detail: 'On the event page and at the door. The person deciding whether to come is not standing in your shop yet.' },
    ],
  },
  'bring-friend': {
    key: 'bring-friend',
    title: 'Let them bring someone',
    why: 'One person becomes two, and nobody has to stand on their own.',
    minutes: 10,
    steps: [
      { label: 'Say plus-one in every invite', detail: 'Add "bring someone" to the post, the sign and the message. People act on it only when it is said out loud.' },
      { label: 'Tell the staff the rule counts for two', detail: 'One sentence at the shift start, so nobody at the door turns away the friend the invite promised.' },
    ],
  },
  'ask-script': {
    key: 'ask-script',
    title: 'Agree the one sentence your team says',
    why: 'One sentence, said the same way by everyone, at the moment the plates are cleared. Consistency beats charm here.',
    minutes: 20,
    steps: [
      { label: 'Write it word for word', detail: 'Something like "If you enjoyed it, a Google review really helps us." Ten words, no improvising, no pressure.' },
      { label: 'Pick the one moment', detail: 'Clearing plates or bringing the bill. The same moment every time is what keeps it happening in week six.' },
      { label: 'Put it where they stand', detail: 'A small card at the till or the pass. The script dies the day it lives only in memory.' },
    ],
  },
  'ask-count': {
    key: 'ask-count',
    title: 'Count the asks, not the reviews',
    why: 'Reviews follow asks at a fairly steady rate, so the asks are the number you can actually control.',
    minutes: 10,
    steps: [
      { label: 'Put a tally by the till', detail: 'A stroke per ask, any shift, no exceptions. Paper is fine; the point is that it is visible.' },
      { label: 'Read it once a week', detail: 'Asks holding steady is the health check. If asks drop, reviews drop about three weeks later.' },
    ],
  },
  'walk-the-block': {
    key: 'walk-the-block',
    title: 'Walk into ten offices yourself',
    why: 'Reception desks within four blocks. A card and a face beats any ad you could buy for the same money.',
    minutes: 90,
    steps: [
      { label: 'List the ten', detail: 'Offices within four blocks with a real reception desk. Mid-morning is when reception has time to talk.' },
      { label: 'Bring the card and the offer', detail: 'A menu, a card, and the free-platter line. Ask who books lunches; that name is the whole visit.' },
      { label: 'Note the name before the next door', detail: 'Who you spoke to, at which office, and what they said. The follow-up call depends on this list existing.' },
    ],
  },
  'catering-followup': {
    key: 'catering-followup',
    title: 'Ring them a week after the platter',
    why: 'The platter opens the door. The call is what turns it into a standing order, and almost nobody makes it.',
    minutes: 30,
    steps: [
      { label: 'Diary the call when the platter leaves', detail: 'Seven days later, to the name you collected. If it is not in the diary the call never happens.' },
      { label: 'Ask one question', detail: '"Would a monthly order make lunches easier?" Then stop talking. The platter already made the argument.' },
    ],
  },
}

/**
 * Which guide moves ride each system goal's plan, and in WHICH of that goal's stages: the same
 * move can serve two goals in different stages (own-counter feeds firstvisit's capture and
 * regulars' reward), so the stage lives on the mapping, not the move. At most 3 per goal — a
 * plan drowning in homework stops being a plan. Every key must exist in GUIDE_MOVES (law 3,
 * sim-enforced).
 */
export const GUIDE_MOVES_FOR_GOAL: Record<string, { key: string; stage: string }[]> = {
  firstvisit: [
    { key: 'storefront', stage: 'be-found' },
    { key: 'neighbourhood', stage: 'get-discovered' },
    { key: 'own-counter', stage: 'capture-return' },
  ],
  nights: [
    { key: 'ask-regulars', stage: 'activate' },
    { key: 'remind-twice', stage: 'activate' },
  ],
  regulars: [
    { key: 'greet-by-name', stage: 'reward' },
    { key: 'own-counter', stage: 'own' },
  ],
  reviews: [],
}

export function guideMovesFor(goal: string): { move: GuideMove; stage: string }[] {
  return (GUIDE_MOVES_FOR_GOAL[goal] ?? [])
    .map((e) => ({ move: GUIDE_MOVES[e.key], stage: e.stage }))
    .filter((x): x is { move: GuideMove; stage: string } => !!x.move)
    .slice(0, 3)
}

/**
 * Which guide moves ride the MONTHLY plan's draft, per funnel step. The Record type IS the
 * vocabulary pin: keying this by a card id ('firstvisit') or a goal key ('more-new') is a compile
 * error, not a silent zero — the drift that shipped twice in the goal-keyed maps cannot happen
 * here. 'reason' is honestly empty (no owner-run move genuinely serves "give them a reason"
 * better than the paid work does); ≤2 per step, ≤5 total — a plan drowning in homework stops
 * being a plan.
 */
export const GUIDE_MOVES_FOR_MONTHLY: Record<MonthlyStepKey, { key: string }[]> = {
  found: [{ key: 'storefront' }, { key: 'neighbourhood' }],
  reason: [],
  easy: [{ key: 'expectations' }],
  back: [{ key: 'greet-by-name' }, { key: 'ask-regulars' }],
}

export function guideMovesForMonthly(step: MonthlyStepKey): GuideMove[] {
  return (GUIDE_MOVES_FOR_MONTHLY[step] ?? [])
    .map((e) => GUIDE_MOVES[e.key])
    .filter((g): g is GuideMove => !!g)
    .slice(0, 2)
}

export const guideMoveByKey = (key: string | undefined): GuideMove | undefined =>
  key ? GUIDE_MOVES[key] : undefined
