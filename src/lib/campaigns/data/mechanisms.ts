/**
 * mechanisms — the rule that makes a stranger change their behaviour.
 *
 * WHY THIS LAYER EXISTS. The builder composed goal -> services, and a bake-off against an
 * unconstrained strategist showed exactly what falls through that gap. Asked for "a line outside the
 * store before we open", the goal path produced a Google profile, a photo library, a website tune-up
 * and paid ads: a coherent, correctly-priced plan that would leave a well-set-up shop with a steady
 * trickle of customers from 8am. Not one line in it concentrated arrival at a moment.
 *
 * What was missing is not a service. It is the sentence in the middle:
 *
 *     "Claim your wristband online now. Collect it at 6am on the 12th, or it goes to the next person."
 *
 * That is not a goal and not a deliverable. It is the RULE, and every service in the plan exists to
 * carry it. Once you see it, it is everywhere a restaurant actually markets: bring a competitor's
 * receipt, Tuesdays kids eat free, first fifty get the numbered print, post it and your table is on
 * us. Nobody buys a photo library. They run a mechanism, and buy photos because it needs pictures.
 *
 * THREE STAGES, NOT A LIST. A mechanism is carried by the same funnel the plan screen already draws:
 * get found, give a reason, make it easy. Splitting `carriedBy` this way is what stops a plan being
 * a shopping list, and it is what makes a missing stage visible — a brilliant offer nobody hears
 * about fails at `found`, and the screen can say so.
 *
 * `leading` IS THE MOST IMPORTANT FIELD. Every other field describes the plan. That one tells the
 * owner three weeks early whether it is working, while there is still time to spend more, change the
 * offer, or stop. A plan you cannot check until the morning of is a bet, not a plan. It is also the
 * honest fix for a measurement layer that has produced 378 outcome rows and zero verdicts: a
 * mechanism is COUNTABLE BY CONSTRUCTION. Wristbands handed out is not a correlation.
 *
 * AUTHORED, NOT GENERATED. Twelve rules a person wrote and stands behind, the same way the eleven
 * situations are. That is what makes two similar owners get consistent treatment, and it is the part
 * a model should not be improvising per request.
 *
 * PLANNING ORDER IS NOT JOURNEY ORDER. The plan screen draws found -> reason -> easy because that
 * is what happens to a stranger. Building it in that order is backwards, and the first version of
 * this file made that mistake. You decide the REASON first, because everything downstream is a
 * consequence of it: what the ad says, whether you need a claim page at all, and — the part that is
 * genuinely computable — how many people have to see it.
 *
 *   1. reason   pick the rule and the cap. The only decision the owner has real authority over.
 *   2. easy     mostly implied by the rule. Shown, not asked.
 *   3. found    SIZED from the cap. Not "include some ads" but "you need about this much reach".
 *
 * CLIENT-SAFE: pure data + resolvers, no server imports.
 */

import { GENERATED_CATALOG } from './catalog.generated'
import type { PricedService } from './priced-catalog'
import { isServiceReady, serviceNotYetReason } from './service-availability'
import { stepOf, type MonthlyStepKey } from './monthly-plan'
import type { PlanGoalKey, CampaignShape } from './plan-goals'
import { guideMoveByKey, type GuideMove } from './guide-moves'

/* ── free actions ───────────────────────────────────────────────────────────────────────── */

/**
 * A line that is genuinely part of the plan and that we do not sell.
 *
 * Half the strongest moves for a grand opening cost nothing: paper the storefront, tell the
 * customers already standing in your other shop, post in the neighbourhood group, be there at 5:45
 * so the queue has a beginning. The CONTENT of these moves lives in one place only — GUIDE_MOVES
 * (guide-moves.ts), the same record the campaign guide rail renders — so a mechanism carries a
 * REFERENCE, not a second copy that drifts (law 3: a flag is only legal with a real guide behind
 * it; the mechanisms sim enforces every ref resolves).
 *
 * `stage` and `blocks` stay on the ref because they are mechanism context: the same move can
 * serve different stages in different mechanisms, and what it blocks is specific to this rule.
 * `blocks` is the part that stops these being read as homework. A two-minute task holding up a
 * $1,295 package is the single most common reason paid work sits still.
 */
export interface FreeRef {
  guideKey: string
  stage: MonthlyStepKey
  /** what stalls or under-performs if it is skipped */
  blocks?: string
}

/** A ref resolved through GUIDE_MOVES for rendering: the guide's content plus this mechanism's context. */
export interface ResolvedFreeMove extends GuideMove {
  stage: MonthlyStepKey
  blocks?: string
}

/* ── the type ───────────────────────────────────────────────────────────────────────────── */

export type MechanismId =
  | 'first-n' | 'claim-show' | 'founding-member' | 'limited-drop'
  | 'bring-receipt' | 'standing-night' | 'beat-clock' | 'bring-someone'
  | 'nth-visit' | 'post-to-win' | 'we-give-too' | 'invited-first'
  | 'ask-every-time' | 'feed-them-once'

export interface Mechanism {
  id: MechanismId
  name: string
  /** The rule in one sentence, owner words. {cap} is replaced with the chosen number. */
  rule: string
  /** One line on why it moves people, for the card. */
  bet: string
  worksFor: readonly PlanGoalKey[]
  shapes: readonly CampaignShape[]
  cap: {
    kind: 'people' | 'units' | 'weekly' | 'window' | 'total'
    /** what the owner is choosing, in their words */
    label: string
    suggest: number
  }
  moment: 'day-of' | 'window' | 'ongoing'
  /** Real catalog service ids, split by the stage they serve. Validated by the sim. */
  carriedBy: {
    found: readonly string[]
    reason: readonly string[]
    easy: readonly string[]
  }
  freeActions: readonly FreeRef[]
  /** Countable by construction. Not a lift calculation. */
  count: { label: string; when: string }
  /**
   * The number visible BEFORE the moment. Null is an honest answer for mechanisms that genuinely
   * cannot be checked early, and the screen should say so rather than imply confidence.
   */
  leading: { label: string; when: string; healthy: string } | null
  /** How the owner works out what the cap costs them. Never a number we invent. */
  costModel: string
  /**
   * How reach turns into the cap for THIS rule, as two stated rates.
   *
   * Both are assumptions and both are shown to the owner as assumptions, because a funnel number
   * presented as fact is the same lie as a fabricated metric. An owner who knows their own numbers
   * should be able to overwrite them and watch the plan resize.
   */
  reach: {
    /** of the people who see it, roughly what share act. */
    actRate: number
    /** of the people who act, roughly what share actually turn up or redeem. 1 when acting IS the outcome. */
    showRate: number
    /** why these numbers and not others, in one line */
    basis: string
  }
  /** What it costs them beyond money. Said out loud, same rule as routes. */
  risks: readonly string[]
}

/* ── shared free-move refs (content lives in GUIDE_MOVES) ───────────────────────────────── */

const OWN_COUNTER: FreeRef = {
  guideKey: 'own-counter', stage: 'found',
  blocks: 'Skip this and the paid ads are doing work your own counter would have done better',
}
const NEIGHBOURHOOD: FreeRef = { guideKey: 'neighbourhood', stage: 'found' }
const STOREFRONT: FreeRef = { guideKey: 'storefront', stage: 'found' }
const SEED_LINE: FreeRef = {
  guideKey: 'seed-line', stage: 'easy',
  blocks: 'An empty pavement at the start time is the one failure you cannot recover from',
}
const EXPECTATIONS: FreeRef = { guideKey: 'expectations', stage: 'easy' }
const BRING_FRIEND: FreeRef = { guideKey: 'bring-friend', stage: 'easy' }
const REMIND_TWICE: FreeRef = {
  guideKey: 'remind-twice', stage: 'easy',
  blocks: 'Without it a real share of the people who signed up simply forget',
}
const ASK_REGULARS: FreeRef = { guideKey: 'ask-regulars', stage: 'found' }

/* ── the twelve ─────────────────────────────────────────────────────────────────────────── */

export const MECHANISMS: readonly Mechanism[] = [
  {
    id: 'claim-show',
    name: 'Claim it now, collect it then',
    rule: 'Claim your spot online now. Collect it in person on the day, or it goes to the next person.',
    bet: 'Keeps every bit of the scarcity, and gives you a list, a commitment, and a number to watch weeks early.',
    worksFor: ['opening', 'event', 'more-new'],
    shapes: ['date', 'run'],
    cap: { kind: 'people', label: 'How many spots?', suggest: 100 },
    moment: 'day-of',
    carriedBy: {
      found: ['gbp-setup', 'local-seo', 'paid-ads', 'creator-collab', 'graphic', 'gbp-event-post', 'fb-event', 'pr-media'],
      reason: ['incentive-design', 'photo-library'],
      easy: ['landing-page', 'site-menu'],
    },
    freeActions: [STOREFRONT, OWN_COUNTER, NEIGHBOURHOOD, EXPECTATIONS, BRING_FRIEND, REMIND_TWICE, SEED_LINE],
    count: { label: 'Spots collected on the day', when: 'the day' },
    leading: {
      label: 'Claims per day',
      when: 'from the first week',
      healthy: 'Half your cap claimed with two weeks to go. Fewer than ten in week one means the reason is wrong, not the reach.',
    },
    costModel: 'Your cap times what one prize costs you, times how many actually redeem. Cap the number and you cap the bill.',
    reach: { actRate: 0.01, showRate: 0.4, basis: 'A strong local offer converts around one in a hundred people who see it, and under half of claims turn into people standing there.' },
    risks: ['People who claim and never come. Overbook the claims against the cap.', 'It only works if the prize is worth leaving the house for.'],
  },
  {
    id: 'first-n',
    name: 'First however-many',
    rule: 'The first {cap} through the door get it. When they are gone, they are gone.',
    bet: 'The simplest scarcity there is. Turns "sometime that day" into "before it runs out".',
    worksFor: ['opening', 'event'],
    shapes: ['date'],
    cap: { kind: 'people', label: 'How many?', suggest: 100 },
    moment: 'day-of',
    carriedBy: {
      found: ['gbp-setup', 'local-seo', 'paid-ads', 'creator-collab', 'graphic', 'pr-media'],
      reason: ['incentive-design', 'photo-library'],
      easy: ['site-menu'],
    },
    freeActions: [STOREFRONT, OWN_COUNTER, NEIGHBOURHOOD, ASK_REGULARS, SEED_LINE, EXPECTATIONS],
    count: { label: 'Prizes handed out before doors', when: 'the day' },
    leading: null,
    costModel: 'Your cap times the prize. Fixed ceiling, known the day you choose it.',
    reach: { actRate: 0.008, showRate: 1, basis: 'No claim step, so turning up IS the action. Fewer act, because there is nothing to do until the day.' },
    risks: ['Nothing to watch before the day. If it is going to fail you find out on the morning.', 'Consider claim-it-now instead if you want an early warning.'],
  },
  {
    id: 'founding-member',
    name: 'Founding members',
    rule: 'The first {cap} people get a numbered card, and keep the perks for good.',
    bet: 'Buys identity rather than attendance. People queue for status in a way they do not queue for a discount, and they tell that story for years.',
    worksFor: ['opening', 'regulars'],
    shapes: ['date', 'ongoing'],
    cap: { kind: 'people', label: 'How many cards?', suggest: 100 },
    moment: 'day-of',
    carriedBy: {
      found: ['gbp-setup', 'local-seo', 'paid-ads', 'creator-collab', 'pr-media', 'graphic'],
      reason: ['incentive-design', 'photo-library', 'brand-kit'],
      easy: ['landing-page', 'site-menu'],
    },
    freeActions: [STOREFRONT, OWN_COUNTER, NEIGHBOURHOOD, ASK_REGULARS, SEED_LINE, EXPECTATIONS],
    count: { label: 'Cards issued', when: 'the day' },
    leading: { label: 'People asking about the card', when: 'from week two', healthy: 'Steady questions at the counter and in the comments' },
    costModel: 'A permanent margin point on a known number of people. Work it out as your discount times their expected yearly spend.',
    reach: { actRate: 0.012, showRate: 0.5, basis: 'Status offers convert a little better than discounts, and the same claim-to-show drop applies.' },
    risks: ['It is forever. Price the perk at something you will still be happy with in three years.'],
  },
  {
    id: 'limited-drop',
    name: 'A limited run',
    rule: 'We made {cap} of them. When they are gone, that is it.',
    bet: 'Scarcity on a thing rather than a moment, so it works across a window instead of one morning.',
    worksFor: ['more-new', 'bigger-checks', 'event'],
    shapes: ['run', 'date'],
    cap: { kind: 'units', label: 'How many?', suggest: 200 },
    moment: 'window',
    carriedBy: {
      found: ['gbp-posts', 'social-mgmt', 'creator-collab', 'paid-ads', 'graphic'],
      reason: ['lto-launch', 'photo-library', 'menu-photo-refresh'],
      easy: ['site-menu', 'ordering-setup'],
    },
    freeActions: [STOREFRONT, OWN_COUNTER, EXPECTATIONS],
    count: { label: 'Units sold', when: 'daily through the run' },
    leading: { label: 'Units sold per day', when: 'from day one', healthy: 'On pace to sell out a few days before the end' },
    costModel: 'Your unit cost times the run. Selling out is the point, so make fewer than you think.',
    reach: { actRate: 0.02, showRate: 1, basis: 'Buying the thing is the action, and it runs over a window rather than one morning.' },
    risks: ['Selling out early leaves people annoyed. That is usually a good problem, but say the number up front.'],
  },
  {
    id: 'bring-receipt',
    name: 'Bring a receipt',
    rule: 'Show us a receipt from anywhere else nearby this week and get {cap}.',
    bet: 'Aims squarely at people already spending money on your category, a few doors away.',
    worksFor: ['more-new', 'own-takeout'],
    shapes: ['run', 'ongoing'],
    cap: { kind: 'total', label: 'What do they get?', suggest: 1 },
    moment: 'window',
    carriedBy: {
      found: ['paid-ads', 'local-seo', 'gbp-posts', 'graphic'],
      reason: ['incentive-design', 'photo-library'],
      easy: ['site-menu'],
    },
    freeActions: [STOREFRONT, NEIGHBOURHOOD],
    count: { label: 'Receipts handed in', when: 'daily' },
    leading: { label: 'Receipts in the first week', when: 'week one', healthy: 'Any at all. This one either catches or it does not, quickly.' },
    costModel: 'Your giveaway cost times how many come. Uncapped unless you set an end date, so set one.',
    reach: { actRate: 0.005, showRate: 1, basis: 'Needs someone to remember a receipt, which is a high bar. Reach has to be large.' },
    risks: ['Naming a competitor in your marketing. Say "anywhere nearby" rather than naming names.'],
  },
  {
    id: 'standing-night',
    name: 'A standing night',
    rule: 'Every {cap}, the same thing happens here.',
    bet: 'Repetition beats novelty for filling a shift. People need a reason they can remember without being reminded.',
    worksFor: ['more-new', 'regulars'],
    shapes: ['ongoing'],
    cap: { kind: 'weekly', label: 'Which night?', suggest: 1 },
    moment: 'ongoing',
    carriedBy: {
      found: ['gbp-posts', 'social-mgmt', 'local-seo', 'graphic', 'fb-event'],
      reason: ['bar-events', 'event-pkg', 'menu-eng', 'seasonal-cal'],
      easy: ['site-menu'],
    },
    freeActions: [STOREFRONT, OWN_COUNTER, NEIGHBOURHOOD, ASK_REGULARS],
    count: { label: 'Covers on that night', when: 'weekly' },
    leading: { label: 'Week-on-week covers on the night', when: 'from week three', healthy: 'Growing by week four. Flat by week six means change the draw, not the marketing.' },
    costModel: 'Whatever the night itself costs to run, every week, indefinitely. This is the one that keeps costing.',
    reach: { actRate: 0.015, showRate: 1, basis: 'Repetition does the work over weeks, so any one week converts modestly.' },
    risks: ['It takes six weeks before it means anything. Stopping at week three wastes the whole spend.'],
  },
  {
    id: 'beat-clock',
    name: 'Beat the clock',
    rule: 'Come in before {cap} and it is a different price.',
    bet: 'Moves demand you already have into hours you cannot fill, without discounting the busy ones.',
    worksFor: ['more-new', 'bigger-checks'],
    shapes: ['run', 'ongoing'],
    cap: { kind: 'window', label: 'Before what time?', suggest: 18 },
    moment: 'ongoing',
    carriedBy: {
      found: ['gbp-posts', 'social-mgmt', 'paid-ads', 'graphic'],
      reason: ['incentive-design', 'menu-eng'],
      easy: ['site-menu'],
    },
    freeActions: [STOREFRONT, OWN_COUNTER],
    count: { label: 'Covers inside the window', when: 'daily' },
    leading: { label: 'Covers in the window, week on week', when: 'from week two', healthy: 'Rising without the later hours falling' },
    costModel: 'Your discount times the covers that move. Watch that they move rather than simply arrive cheaper.',
    reach: { actRate: 0.02, showRate: 1, basis: 'Mostly shifts people who were coming anyway, so it converts well and adds less.' },
    risks: ['Regulars who already came at 7 will now come at 5:30 and pay less. That is the real cost.'],
  },
  {
    id: 'bring-someone',
    name: 'Bring someone',
    rule: 'Come with someone who has not been before and you both get {cap}.',
    bet: 'Your existing customers do the finding. Cheapest new customer there is.',
    worksFor: ['more-new', 'regulars'],
    shapes: ['run', 'ongoing'],
    cap: { kind: 'total', label: 'What do they both get?', suggest: 1 },
    moment: 'ongoing',
    carriedBy: {
      found: ['gbp-posts', 'social-mgmt', 'graphic'],
      reason: ['incentive-design', 'friend-hook'],
      easy: ['site-menu'],
    },
    freeActions: [OWN_COUNTER, ASK_REGULARS],
    count: { label: 'Pairs redeemed', when: 'daily' },
    leading: { label: 'Pairs in the first two weeks', when: 'week two', healthy: 'A handful. This one starts slow and compounds.' },
    costModel: 'Two giveaways per redemption, and only when a genuinely new person comes. Self-limiting.',
    reach: { actRate: 0.03, showRate: 1, basis: 'Aimed at people who already like you, so it converts far better than cold reach.' },
    risks: ['Slow to start. It needs a month before it says anything.'],
  },
  {
    id: 'nth-visit',
    name: 'The one on us',
    rule: 'Every {cap} visit is on us.',
    bet: 'Turns a preference into a habit by making the next visit part of this one.',
    worksFor: ['regulars', 'bigger-checks'],
    shapes: ['ongoing'],
    cap: { kind: 'total', label: 'Which visit?', suggest: 5 },
    moment: 'ongoing',
    carriedBy: {
      found: ['gbp-posts', 'social-mgmt'],
      reason: ['incentive-design', 'menu-eng'],
      easy: ['site-menu'],
    },
    freeActions: [OWN_COUNTER, STOREFRONT],
    count: { label: 'Cards completed', when: 'monthly' },
    leading: { label: 'Cards started', when: 'from week one', healthy: 'Started cards climbing, with the first completions by week six' },
    costModel: 'One visit free in every N. A known share of revenue, paid only by people who came back.',
    reach: { actRate: 0.04, showRate: 1, basis: 'Offered at the till to people already buying. Almost everyone takes the card.' },
    risks: ['Most of what you give away goes to people who were coming anyway.'],
  },
  {
    id: 'post-to-win',
    name: 'Post to be in it',
    rule: 'Post it, tag us, and you are in the draw for {cap}.',
    bet: 'Buys reach with a prize rather than a budget, and the reach is from people who actually came.',
    worksFor: ['get-known', 'event', 'more-new'],
    shapes: ['date', 'run'],
    cap: { kind: 'total', label: 'What is the prize?', suggest: 1 },
    moment: 'window',
    carriedBy: {
      found: ['social-mgmt', 'ugc-rights', 'creator-collab', 'graphic'],
      reason: ['incentive-design', 'photo-library'],
      easy: ['site-menu'],
    },
    freeActions: [STOREFRONT, OWN_COUNTER, EXPECTATIONS],
    count: { label: 'Tagged posts', when: 'through the window' },
    leading: { label: 'Posts in the first few days', when: 'day three', healthy: 'A steady trickle. Zero by day three means the prize is too small.' },
    costModel: 'One prize, whatever you choose. The cheapest ceiling of any mechanism here.',
    reach: { actRate: 0.01, showRate: 1, basis: 'Posting is a real ask. Most people who intend to never do it.' },
    risks: ['Entirely dependent on the prize being worth posting for. A free coffee is not.'],
  },
  {
    id: 'we-give-too',
    name: 'We give too',
    rule: 'For every {cap}, we give to somewhere local.',
    bet: 'Gets you talked about by people who would never repost a discount, and it is true.',
    worksFor: ['get-known', 'more-new'],
    shapes: ['run', 'ongoing'],
    cap: { kind: 'total', label: 'For every what?', suggest: 1 },
    moment: 'window',
    carriedBy: {
      found: ['pr-media', 'social-mgmt', 'gbp-posts', 'graphic'],
      reason: ['photo-library', 'brand-kit'],
      easy: ['site-menu'],
    },
    freeActions: [STOREFRONT, NEIGHBOURHOOD, OWN_COUNTER],
    count: { label: 'Amount raised', when: 'monthly, published' },
    leading: { label: 'Mentions and shares', when: 'from week two', healthy: 'Being talked about by accounts that are not yours' },
    costModel: 'Your donation per unit, times volume. Publish the running total or it reads as a gimmick.',
    reach: { actRate: 0.01, showRate: 1, basis: 'Rarely changes a purchase on its own. It changes who talks about you.' },
    risks: ['It only works if you actually publish the number, every time, including the small ones.'],
  },
  {
    /* Added because the sim caught that "our reviews need work" — a situation an owner can pick on
     * the first screen — had no rule behind it at all. A goal with no mechanism is a plan that can
     * only ever be a service list. */
    id: 'ask-every-time',
    name: 'Ask every single time',
    rule: 'Every happy guest gets asked, at the table, the same way, every time.',
    bet: 'Reviews are not a marketing problem. They are an asking problem, and almost nobody asks consistently.',
    worksFor: ['reviews'],
    shapes: ['ongoing'],
    cap: { kind: 'weekly', label: 'How many asks a week?', suggest: 50 },
    moment: 'ongoing',
    carriedBy: {
      found: ['graphic', 'gbp-setup'],
      reason: ['review-responses', 'staff-advocacy'],
      easy: ['review-claim', 'listings-sync'],
    },
    freeActions: [
      { guideKey: 'ask-script', stage: 'reason', blocks: 'Without a script the asking quietly stops after two weeks' },
      { guideKey: 'ask-count', stage: 'easy' },
    ],
    count: { label: 'Asks made, and reviews landed', when: 'weekly' },
    leading: { label: 'Asks per week', when: 'from week one', healthy: 'Asks holding steady. If asks drop, reviews drop three weeks later.' },
    costModel: 'Free to run. The cost is your team remembering, every shift, forever.',
    reach: { actRate: 0.25, showRate: 0.35, basis: 'Asked face to face, so a quarter say yes. Roughly a third of those actually post one.' },
    risks: ['It decays. Every review programme dies quietly when nobody is counting the asks.'],
  },
  {
    /* Same reason: "we want catering and parties" had no mechanism either. */
    id: 'feed-them-once',
    name: 'Feed them once, free',
    rule: 'The first {cap} offices nearby that ask get a free tasting platter, no strings.',
    bet: 'Nobody books catering from a photo. They book it from something they already ate.',
    worksFor: ['catering'],
    shapes: ['run', 'ongoing'],
    cap: { kind: 'people', label: 'How many platters?', suggest: 20 },
    moment: 'window',
    carriedBy: {
      found: ['local-seo', 'paid-ads', 'graphic', 'fb-event', 'pr-media'],
      reason: ['catering-engine', 'photo-library'],
      easy: ['landing-page', 'site-menu'],
    },
    freeActions: [
      { guideKey: 'walk-the-block', stage: 'found' },
      { guideKey: 'catering-followup', stage: 'easy', blocks: 'Skip this and the free food was a donation' },
    ],
    count: { label: 'Platters out, then bookings back', when: 'monthly' },
    leading: { label: 'Offices asking', when: 'from week two', healthy: 'A few a week. Zero after two weeks means they cannot find you, not that they do not want it.' },
    costModel: 'Your food cost per platter times the cap. One booked office usually pays for all of them.',
    reach: { actRate: 0.02, showRate: 0.25, basis: 'Offices that ask for a platter are warm. A quarter turn into a booking, which is the number that matters.' },
    risks: ['Some take the free food and never book. Cap it and treat that as the cost of the channel.'],
  },
  {
    id: 'invited-first',
    name: 'Our list eats first',
    rule: 'The first {cap} seats go to our list before anyone else hears about it.',
    bet: 'Fills a soft opening with people predisposed to like it, and makes being on the list worth something.',
    worksFor: ['opening', 'regulars'],
    shapes: ['date', 'run'],
    cap: { kind: 'people', label: 'How many seats?', suggest: 60 },
    moment: 'day-of',
    carriedBy: {
      found: ['gbp-setup', 'graphic'],
      reason: ['photo-library', 'incentive-design'],
      easy: ['landing-page', 'site-menu'],
    },
    freeActions: [OWN_COUNTER, ASK_REGULARS, EXPECTATIONS, REMIND_TWICE],
    count: { label: 'Seats filled', when: 'the night' },
    leading: { label: 'Replies against seats', when: 'from the invite going out', healthy: 'Twice as many replies as seats within three days' },
    costModel: 'Whatever you comp, times the seats. Fixed and small.',
    reach: { actRate: 0.2, showRate: 0.6, basis: 'Sent to your own list, so a fifth reply. Reply-to-seat drop is the usual no-show rate.' },
    risks: ['Needs a list. With no list this is the wrong mechanism, and building one is the real first step.'],
  },
]

/* ── resolvers ──────────────────────────────────────────────────────────────────────────── */

export const mechanismById = (id: string) => MECHANISMS.find((m) => m.id === id)

/** Which rules make sense for what they picked. A mechanism that cannot fit the shape is noise. */
export function mechanismsFor(goals?: readonly string[], shape?: CampaignShape): Mechanism[] {
  return MECHANISMS.filter(
    (m) =>
      (!shape || m.shapes.includes(shape)) &&
      (!goals?.length || goals.some((g) => m.worksFor.includes(g as PlanGoalKey))),
  )
}

const svc = (id: string) => (GENERATED_CATALOG as PricedService[]).find((s) => s.id === id)

export interface MechanismLine {
  id: string
  name: string
  amount: number
  kind: string
  /** null when we can deliver it; the reason when we cannot */
  held: string | null
}

/**
 * HOW MUCH REACH THE CAP ACTUALLY DEMANDS.
 *
 * This is what putting the reason first buys you. Once a rule and a cap exist, "get found" stops
 * being "include some ads" and becomes an arithmetic problem with a stated answer: to collect a
 * hundred you need roughly this many to act, which needs roughly this many to see it.
 *
 * Every rate is an assumption and is returned alongside its reasoning, because a funnel number
 * presented as fact is the same dishonesty as a fabricated metric. An owner who knows their own
 * conversion should overwrite it and watch the plan resize.
 *
 * `ownReach` is the honest counterweight to selling ads. A shop with 300 people a day walking past
 * an eight-week window, plus a second location with its own counter, may already produce the whole
 * requirement for free — and the plan should say so rather than quietly bill for reach they had.
 */
export interface ReachNeed {
  cap: number
  /** how many have to act (claim, ask, post) to land the cap */
  actsNeeded: number
  /** how many have to SEE it for that many to act */
  seenNeeded: number
  /** what the owner's own free channels plausibly deliver, when they told us their footfall */
  ownReach: number | null
  /** what is left for paid or borrowed reach to cover. null when we have not been told the footfall. */
  gap: number | null
  assumptions: { actRate: number; showRate: number; basis: string }
}

/** Reach the cap demands. `dailyFootfall` is what the owner told us about their existing places. */
export function reachNeeded(
  m: Mechanism,
  cap: number,
  opts: { dailyFootfall?: number; weeksOut?: number } = {},
): ReachNeed {
  const actsNeeded = Math.ceil(cap / Math.max(0.01, m.reach.showRate))
  const seenNeeded = Math.ceil(actsNeeded / Math.max(0.0001, m.reach.actRate))
  /* Window and counter reach the same people repeatedly, so a day of footfall is not a day of new
   * eyes. A third is a deliberately conservative discount rather than a measured one. */
  const weeks = opts.weeksOut ?? 6
  const ownReach = opts.dailyFootfall != null ? Math.round(opts.dailyFootfall * weeks * 7 * 0.33) : null
  return {
    cap,
    actsNeeded,
    seenNeeded,
    ownReach,
    gap: ownReach == null ? null : Math.max(0, seenNeeded - ownReach),
    assumptions: { actRate: m.reach.actRate, showRate: m.reach.showRate, basis: m.reach.basis },
  }
}

export interface MechanismPlan {
  mechanism: Mechanism
  /** the rule with the chosen cap substituted in */
  rule: string
  cap: number
  stages: { found: MechanismLine[]; reason: MechanismLine[]; easy: MechanismLine[] }
  freeActions: readonly ResolvedFreeMove[]
  bill: { start: number; monthly: number; passThroughMonthly: number }
  /** minutes of the owner's own time the free actions ask for */
  yourMinutes: number
  /** how much reach the cap demands, and how much of it they may already have */
  reach: ReachNeed
}

const lineOf = (id: string): MechanismLine | null => {
  const s = svc(id)
  if (!s) return null
  const p = s.prices?.[0]
  return {
    id: s.id,
    name: s.name,
    amount: p?.amount ?? 0,
    kind: p?.kind ?? 'one-time',
    held: isServiceReady(id) ? null : serviceNotYetReason(id),
  }
}

/**
 * Lay a mechanism out across the three stages, using the real catalog.
 *
 * Held work stays VISIBLE and unbilled, the same rule as everywhere else — an owner should see that
 * the reminder texts are part of the right plan and that we cannot send them, rather than have the
 * line quietly disappear and wonder later why nobody turned up.
 */
export function composeMechanism(
  m: Mechanism,
  opts: { cap?: number; exclude?: readonly string[]; dailyFootfall?: number; weeksOut?: number } = {},
): MechanismPlan {
  const cap = opts.cap ?? m.cap.suggest
  const skip = new Set(opts.exclude ?? [])
  const pick = (ids: readonly string[]) =>
    ids.filter((id) => !skip.has(id)).map(lineOf).filter((l): l is MechanismLine => !!l)

  const stages = { found: pick(m.carriedBy.found), reason: pick(m.carriedBy.reason), easy: pick(m.carriedBy.easy) }
  const all = [...stages.found, ...stages.reason, ...stages.easy]

  let start = 0
  let monthly = 0
  let passThroughMonthly = 0
  for (const l of all) {
    if (l.held) continue
    if (l.kind === 'monthly') monthly += l.amount
    else start += l.amount
    const note = svc(l.id)?.prices?.[0]?.note
    if (note && /at cost/i.test(note)) {
      const min = /\$(\d[\d,]*)\s*\/\s*mo(?:nth)?\s+minimum/i.exec(note)
      if (min) passThroughMonthly += Number(min[1].replace(/,/g, ''))
    }
  }

  // Resolve the free-move refs through GUIDE_MOVES. An unknown key is dropped rather than
  // rendered empty (law 3), but the mechanisms sim makes a dangling ref a build failure first.
  const freeActions = m.freeActions
    .map((r): ResolvedFreeMove | null => {
      const g = guideMoveByKey(r.guideKey)
      return g ? { ...g, stage: r.stage, ...(r.blocks ? { blocks: r.blocks } : {}) } : null
    })
    .filter((a): a is ResolvedFreeMove => !!a)

  return {
    mechanism: m,
    rule: m.rule.replace('{cap}', String(cap)),
    cap,
    stages,
    freeActions,
    bill: { start, monthly, passThroughMonthly },
    yourMinutes: freeActions.reduce((n, a) => n + a.minutes, 0),
    reach: reachNeeded(m, cap, { dailyFootfall: opts.dailyFootfall, weeksOut: opts.weeksOut }),
  }
}
