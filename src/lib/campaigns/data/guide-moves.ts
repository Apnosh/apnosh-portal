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

export const guideMoveByKey = (key: string | undefined): GuideMove | undefined =>
  key ? GUIDE_MOVES[key] : undefined
