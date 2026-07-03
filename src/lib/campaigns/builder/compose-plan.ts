/**
 * composePlanForGoal — the campaign-plan composer (Phase 2).
 *
 * Replaces the old static `PLANS[itemId].beats` table. Every catalog item declares
 * an ItemShape: a `seed` (its irreplaceable identity — the exact pieces that item
 * has always produced) plus a `kind` that decides whether the plan gets goal-funnel
 * completion. Only `kind === 'program'` items are funnel-expanded; `piece`, `event`
 * and `setup` items return their seed verbatim, so a lone reel stays one reel and a
 * launch keeps its teaser → post → story buildup. No per-item-tailoring regression
 * by construction.
 *
 * PURE + synchronous + client-safe: no server-only, no await, no AI, no new deps.
 * It runs inside `useMemo(draftFromBuilder)` in the plan flow AND at module load in
 * item-prices.ts, so it must stay total on an empty spec. Budget is NOT an input here
 * — the composer emits the strategically-complete plan and Phase 1's advisory trim is
 * the sole money-fit layer.
 *
 * NOTE: this is the focused-campaign composer for the madlib create flow. The async
 * AI planning brain (planning/buildPlan, sequence.ts) is a different product
 * (whole-operation, server-only) and is intentionally untouched.
 */

import type { CampaignTemplate, CampaignCategory, ContentBeatSpec } from '../data/campaign-templates'
import { AUDIENCES } from '../data/campaign-templates'
import type { GoalKey, PlanMove, PlanStage } from '../types'
import { playsForGoal } from '../catalog'
import { PRICED_CATALOG, type SystemGoal, type Tier } from '../data/priced-catalog'
import { playsForGoalAtoms, DIALED_STAGES, type PlanGoal } from '../data/atom-plays'
import { dialedContentBeats, enforceInfraDeps } from './build-from-atoms'
import { classifyPlay, leadHeadline, movedHeadline } from '../brain/signal-fit'
import { isNoOfferSentinel } from '../campaign-composer'
import type { BrainSignals } from '../brain/signals'

export type Goal = 'acquire' | 'capacity' | 'retain' | 'reviews'
export type Dur = 'ongoing' | 'once' | 'short' | 'setup'
export type PieceType = 'reel' | 'photo' | 'post' | 'story' | 'email' | 'sms'
/** What kind of plan an item is — gates funnel completion. Only 'program' grows. */
export type ItemKind = 'program' | 'piece' | 'event' | 'setup'
/** A piece in a plan. The 4th slot is an optional explicit campaign week (event playbooks
 *  carry a real phased week); programs/single pieces omit it and fall to positional order. The
 *  5th is an optional `because` — a plain owner-facing reason the situation-aware adapt() pass
 *  attaches when it adds/moves a piece, so no change is ever a silent black box. */
// serviceId (6th slot) rides only on dialed atom-engine beats — it lets the plan UI look up the
// AI's per-play reason for THIS owner. Legacy 5-tuples simply leave it undefined.
export type Beat = [type: PieceType, channel: string, label: string, week?: number, because?: string, serviceId?: string]

export interface ItemShape {
  title: string
  /** Decides funnel behavior. 'program' items get goal-funnel completion; the rest
   *  return their seed verbatim. */
  kind: ItemKind
  goal: Goal
  dur: Dur
  /** The item's literal identity — the exact pieces it has always produced. Never removed. */
  seed: Beat[]
  /** add a local-ads line (paid-ads service) to the plan */
  ads?: boolean
  /** override default audience ids */
  audiences?: string[]
  /** When the picked date is a moment the campaign builds TOWARD (a launch, an event),
   *  name it so deriveSchedule runs BACKWARD — teasers land before, the launch piece on the day. */
  occasionName?: string
}

export const GOAL_META: Record<Goal, { goalKey: GoalKey; category: CampaignCategory; kpi: string; objective: string; expect: string; audiences: string[] }> = {
  acquire: { goalKey: 'new-customers', category: 'demand', kpi: 'new guests from the campaign', objective: 'Bring in new guests', expect: 'More first-time guests through the door', audiences: ['everyone'] },
  capacity: { goalKey: 'slow-nights', category: 'capacity', kpi: 'covers on your slow shifts', objective: 'Fill your slower shifts', expect: 'Fuller tables on your slow shifts', audiences: ['everyone'] },
  retain: { goalKey: 'regulars', category: 'retain', kpi: 'repeat visits per month', objective: 'Bring guests back more often', expect: 'More repeat visits from the guests you have', audiences: ['regulars', 'firsttimers'] },
  reviews: { goalKey: 'reviews', category: 'reputation', kpi: 'fresh reviews and a higher rating', objective: 'Grow your reviews and rating', expect: 'More fresh reviews and a higher rating', audiences: ['everyone'] },
}
export const DUR_WEEKS: Record<Dur, number | null> = { ongoing: null, once: 1, short: 3, setup: 2 }

/* Per-catalog-item shapes. `seed` is the item's exact historical beats; `kind` decides
 * funnel growth. Beat labels are owner-facing piece names — descriptive on purpose so the
 * plan reads like a real campaign, not a content checklist. */
export const ITEM_SHAPE: Record<string, ItemShape> = {
  // Programs (ongoing, goal-driven — these get funnel completion)
  reach: { title: 'Reach new locals', kind: 'program', goal: 'acquire', dur: 'ongoing', ads: true, seed: [['reel', 'reels', 'Discovery reel — a reason to stop scrolling'], ['post', 'gbp', 'Google post for nearby searches']] },
  nights: { title: 'Fill your slow nights', kind: 'program', goal: 'capacity', dur: 'ongoing', seed: [['post', 'social', 'Slow-night offer post'], ['sms', 'sms', 'Day-before text to your regulars'], ['email', 'email', 'Slow-night offer email']] },
  firstvisit: { title: 'Win first-time visits', kind: 'program', goal: 'acquire', dur: 'ongoing', seed: [['reel', 'reels', 'Teaser reel — your signature dish, up close'], ['post', 'social', 'First-visit offer post']] },
  regulars: { title: 'Turn first-timers into regulars', kind: 'program', goal: 'retain', dur: 'ongoing', seed: [['email', 'email', 'Come-back reward email'], ['sms', 'sms', 'Thank-you text with a reason to return']] },
  catering: { title: 'Catering and big orders', kind: 'program', goal: 'acquire', dur: 'ongoing', seed: [['photo', 'social', 'Hero photo of your catering spread'], ['post', 'social', 'Catering & big-order post'], ['email', 'email', 'Catering outreach email']] },
  reviewsplan: { title: 'Boost reviews and rating', kind: 'program', goal: 'reviews', dur: 'ongoing', seed: [['post', 'gbp', 'Review-ask Google post'], ['email', 'email', 'Follow-up review request']] },
  // The SYSTEM 'reviews' goal (staged services, like firstvisit/nights/regulars). isSystemGoal
  // routes itemId 'reviews' to buildSystem; the seed is unused for system goals.
  reviews: { title: 'Raise your rating', kind: 'program', goal: 'reviews', dur: 'ongoing', seed: [['post', 'gbp', 'Review-ask Google post']] },

  // Single content pieces (verbatim — never funnel-grown)
  reel: { title: 'A short video', kind: 'piece', goal: 'acquire', dur: 'once', seed: [['reel', 'reels', 'Short-form reel — your best dish in motion']] },
  story: { title: 'A story', kind: 'piece', goal: 'acquire', dur: 'once', seed: [['story', 'social', 'Behind-the-scenes story']] },
  carousel: { title: 'A carousel post', kind: 'piece', goal: 'acquire', dur: 'once', seed: [['post', 'social', 'Swipeable carousel post']] },
  graphic: { title: 'A designed graphic', kind: 'piece', goal: 'acquire', dur: 'once', seed: [['post', 'social', 'Designed graphic post']] },
  dish: { title: 'Feature a dish', kind: 'piece', goal: 'acquire', dur: 'once', seed: [['photo', 'social', 'Hero photo of the dish'], ['post', 'social', 'Dish feature post']] },
  gpost: { title: 'A Google Business post', kind: 'piece', goal: 'acquire', dur: 'once', seed: [['post', 'gbp', 'Google Business post']] },

  // Events (build toward a date — verbatim seed + occasionName)
  promoevent: { title: 'Promote an event', kind: 'event', goal: 'acquire', dur: 'short', occasionName: 'your event', seed: [['reel', 'reels', 'Event teaser reel'], ['post', 'social', 'Event announcement post'], ['email', 'email', 'Event invite email']] },
  launch: { title: 'Launch a special', kind: 'event', goal: 'acquire', dur: 'short', occasionName: 'your launch', seed: [['reel', 'reels', 'Teaser reel — the new item, up close'], ['post', 'social', 'Launch-day announcement post'], ['story', 'social', 'Launch-day story']] },
  // The creator films on THEIR timeline (no date you control → no playbook). The team's real
  // pieces are amplification + reuse, not making the creator's reel: repost, reshare, reuse-cut.
  creator: { title: 'Work with a creator', kind: 'event', goal: 'acquire', dur: 'short', seed: [['post', 'social', 'Repost the creator with your caption'], ['story', 'social', 'Reshare to your story, tag them'], ['reel', 'reels', 'Cut a short from their footage']] },

  // Email / SMS sends (small fixed sequences — verbatim, not funnel-grown)
  welcome: { title: 'Welcome new subscribers', kind: 'piece', goal: 'retain', dur: 'ongoing', seed: [['email', 'email', 'Welcome email to new subscribers']] },
  second: { title: 'Nudge a second visit', kind: 'piece', goal: 'retain', dur: 'ongoing', seed: [['email', 'email', 'Come-back email — a reason to return'], ['sms', 'sms', 'Come-back text']] },
  news: { title: 'Monthly newsletter', kind: 'piece', goal: 'retain', dur: 'ongoing', seed: [['email', 'email', "What's-new monthly newsletter"]] },
  slowoffer: { title: 'Slow-night offer', kind: 'piece', goal: 'capacity', dur: 'ongoing', seed: [['email', 'email', 'Slow-night offer email'], ['sms', 'sms', 'Slow-night offer text']] },
  birthday: { title: 'Birthday treat', kind: 'piece', goal: 'retain', dur: 'ongoing', seed: [['email', 'email', 'Birthday treat email'], ['sms', 'sms', 'Birthday treat text']] },
  earlyaccess: { title: 'Early access for regulars', kind: 'piece', goal: 'retain', dur: 'once', seed: [['email', 'email', 'Early-access email for regulars']] },

  // Tasks / setup (fixed deliverables — verbatim)
  shoot: { title: 'Book a shoot', kind: 'setup', goal: 'acquire', dur: 'setup', seed: [['photo', 'social', 'On-site photo + video shoot'], ['reel', 'reels', 'Reel cut from the shoot']] },
  gbp: { title: 'Polish your Google profile', kind: 'setup', goal: 'reviews', dur: 'setup', seed: [['post', 'gbp', 'Profile refresh + Google post']] },
  reviewsreply: { title: 'Reply to reviews', kind: 'setup', goal: 'reviews', dur: 'ongoing', seed: [['post', 'gbp', 'Drafted replies to your reviews']] },
  qr: { title: 'Add a table QR', kind: 'setup', goal: 'retain', dur: 'setup', seed: [['post', 'social', 'QR table-card design']] },
  friction: { title: 'Smooth out ordering', kind: 'setup', goal: 'acquire', dur: 'setup', seed: [['post', 'social', 'Order-now post with your links']] },

  // Events (offers around a moment)
  giftcard: { title: 'Push gift cards', kind: 'event', goal: 'acquire', dur: 'short', occasionName: 'the gifting date', seed: [['post', 'social', 'Gift-card post'], ['email', 'email', 'Gift-card email']] },
  ticket: { title: 'Run a ticketed event', kind: 'event', goal: 'acquire', dur: 'short', occasionName: 'your event', seed: [['post', 'social', 'Ticketed-event post'], ['email', 'email', 'Event invite email']] },
  // The 'run-deal' brain goal (dialed content beats drive the plan; this gives it a real title +
  // occasion instead of falling back to the generic "New campaign").
  deal: { title: 'Run a deal', kind: 'event', goal: 'acquire', dur: 'short', occasionName: 'your deal', seed: [['post', 'social', 'Deal announcement post'], ['email', 'email', 'Deal email to your list']] },

  // Automation (a send — verbatim)
  winback: { title: 'Win back quiet guests', kind: 'piece', goal: 'retain', dur: 'ongoing', audiences: ['lapsed'], seed: [['email', 'email', 'We-miss-you email'], ['sms', 'sms', 'Win-back text with an offer']] },
}

function fallbackShape(): ItemShape {
  return { title: 'New campaign', kind: 'piece', goal: 'acquire', dur: 'once', seed: [['post', 'social', 'A post']] }
}

/* Targeting (the locked decision): the owner's free-text "who's this for?" answer should
 * drive who the campaign targets. These keyword rules resolve that answer to the guest
 * segments composeCampaign understands; a no-match leaves targeting at the goal default. */
const AUDIENCE_KEYWORDS: { re: RegExp; id: string }[] = [
  { re: /lapsed|quiet|haven'?t|miss|drift|been a while|used to/i, id: 'lapsed' },
  { re: /regular|loyal|repeat|frequent/i, id: 'regulars' },
  { re: /first[- ]?time|new guest|first visit|tried us once/i, id: 'firsttimers' },
  { re: /\bvip\b|top (custom|spend)|big spender|best custom/i, id: 'vips' },
  { re: /famil|kid|parent/i, id: 'families' },
  { re: /\bdate[- ]?night\b|\bdates?\b|couple|romanti/i, id: 'datenight' },
  // Catering buyers (B2B) — the catering "who's this for" answers.
  { re: /office|corporate|compan|workplace|coworker/i, id: 'offices' },
  { re: /planner|event plann|organiz/i, id: 'planners' },
  { re: /school|univers|college|student|teacher/i, id: 'schools' },
  { re: /past (big )?order|repeat cater|ordered before|previous cater/i, id: 'past-orders' },
  { re: /nearby|\blocal\b|discover|never been|in the area|haven'?t tried|new (guest|local|to the area|in town|customer|to us)|new locals?/i, id: 'new-locals' },
  { re: /everyone|every ?one|all (guests|custom)|anybody|the public/i, id: 'everyone' },
]

/** Map the owner's free-text audience answer to valid AUDIENCES ids by keyword. Returns
 *  matched, de-duped, valid ids (empty if none — the caller then keeps the template/goal
 *  default, never an empty targeting set). */
export function mapAudience(raw: string): string[] {
  const text = raw || ''
  const ids: string[] = []
  for (const { re, id } of AUDIENCE_KEYWORDS) if (re.test(text) && AUDIENCES[id] && !ids.includes(id)) ids.push(id)
  return ids
}

/* Goal → funnel: each goal's preferred candidate piece for each funnel leg
 * (get-seen → convert → keep). A program that is missing a leg gets the top
 * candidate for it appended. Modeled on plan-engine's CANDIDATES_BY_GOAL, but at the
 * content-piece level. The labels are starting points — the plan flow's beatLabel
 * regenerates owner-facing copy from the dish/offer. */
const FUNNEL_BY_GOAL: Record<Goal, { seen: Beat[]; convert: Beat[]; keep: Beat[] }> = {
  acquire: {
    seen: [['reel', 'reels', 'Discovery reel — a reason to stop scrolling'], ['photo', 'social', 'Hero photo of your best dish']],
    convert: [['post', 'social', 'Offer post — a reason to come in'], ['email', 'email', 'Offer email to your list']],
    keep: [['email', 'email', 'Come-back email — a reason to return']],
  },
  capacity: {
    seen: [['post', 'social', 'Slow-night offer post'], ['reel', 'reels', 'Slow-night teaser reel']],
    convert: [['sms', 'sms', 'Day-before text to your regulars'], ['email', 'email', 'Slow-night offer email']],
    keep: [['sms', 'sms', 'Slow-night reminder text']],
  },
  retain: {
    seen: [['story', 'social', 'Behind-the-scenes story']],
    convert: [['email', 'email', 'Come-back reward email'], ['sms', 'sms', 'Thank-you text with a reason to return']],
    keep: [['email', 'email', 'Monthly check-in email'], ['sms', 'sms', 'Loyalty reward text']],
  },
  reviews: {
    seen: [['post', 'gbp', 'Review-ask Google post']],
    convert: [['email', 'email', 'Follow-up review request']],
    keep: [['post', 'social', 'Drafted replies to your reviews']],
  },
}

/** Segments whose owner already has a list to nurture — these (and the retain goal)
 *  are the only campaigns that get a 'keep' leg, so an acquire program targeting new
 *  locals doesn't sprout a loyalty email nobody asked for. */
const LIST_SEGMENTS = new Set(['regulars', 'lapsed', 'firsttimers', 'vips'])
function needsKeep(audienceIds: string[], goal: Goal): boolean {
  if (goal === 'retain') return true
  return audienceIds.some((a) => LIST_SEGMENTS.has(a))
}

/** The plan's beats. Programs get goal-funnel completion: for each leg the seed doesn't
 *  already cover, append that goal's top candidate. Non-program items (single pieces,
 *  events, setup tasks) return their seed verbatim, so they're never bloated. */
function fillFunnel(shape: ItemShape, audienceIds: string[]): Beat[] {
  if (shape.kind !== 'program') return shape.seed
  const funnel = FUNNEL_BY_GOAL[shape.goal]
  const beats: Beat[] = [...shape.seed]
  // Coverage is by TYPE: a leg is covered if a seed beat shares a candidate's type. This is
  // intentional — e.g. reach's Google discovery post counts as convert coverage, so the
  // awareness play stays lean (firstvisit is the deliberate conversion sibling). To force an
  // explicit convert/offer piece on a program, add it to that item's seed (as catering's photo).
  const covers = (leg: Beat[]) => leg.some(([t]) => beats.some((b) => b[0] === t))
  const legs: ('seen' | 'convert' | 'keep')[] = needsKeep(audienceIds, shape.goal) ? ['seen', 'convert', 'keep'] : ['seen', 'convert']
  for (const leg of legs) {
    const candidates = funnel[leg]
    if (candidates.length && !covers(candidates)) {
      // Add the top candidate whose type isn't already in the plan (avoid a duplicate type).
      beats.push(candidates.find(([t]) => !beats.some((b) => b[0] === t)) ?? candidates[0])
    }
  }
  return beats
}

/* ── Event playbooks ──────────────────────────────────────────────────────
 * Event campaigns (a launch, …) get a REAL phased plan, not just their seed: a
 * tease → announce → drive-trial → day-of urgency → social-proof arc. The owner's
 * email + SMS LIST is the highest-ROI launch channel, so list sends are central
 * (gated on the owner actually having a list); paid reach is an opt-in dial; intensity
 * sets the runway.
 *
 * `week` is RELATIVE within the playbook (1..max). deriveSchedule event mode posts week W
 * at (max - W) * 7 days BEFORE the picked date, so the MAX week is the day-of. Day-of +
 * proof beats all share the max week, so they land on the date with no schedule change. */
interface EventCtx { hasList: boolean; boost: boolean; intensity: 'soft' | 'big'; hasOffer: boolean }
interface PlaybookBeat { t: PieceType; ch: string; label: string; week: number; need?: 'list' | 'boost' }

/** Read the event dials from the madlib spec. Total + safe on an EMPTY spec (the module-load
 *  price estimate): no list, no boost, soft push, no offer — the lean plan. */
function eventCtx(spec: Record<string, string>): EventCtx {
  return {
    hasList: /\b(list|email|text)\b/i.test(spec.list || ''),
    boost: /\b(yes|paid|boost)\b/i.test(spec.boost || ''),
    intensity: (spec.intensity || '').includes('big') ? 'big' : 'soft',
    hasOffer: !!(spec.offer && spec.offer.trim()),
  }
}

const EVENT_PLAYBOOK: Record<string, (ctx: EventCtx) => PlaybookBeat[]> = {
  // Launch: build anticipation, give the list first dibs, hit hard on the day, prove it worked.
  launch: (ctx) => {
    const max = ctx.intensity === 'big' ? 4 : 3
    const beats: PlaybookBeat[] = [
      { t: 'reel', ch: 'reels', label: 'Teaser of your new dish, up close', week: 1 },
      { t: 'email', ch: 'email', label: 'First look for your list', week: 1, need: 'list' },
      { t: 'story', ch: 'social', label: 'A sneak peek before it drops', week: 2 },
      { t: 'post', ch: 'social', label: "It's here, launch-day post", week: max },
      { t: 'email', ch: 'email', label: "It's live, come try it", week: max, need: 'list' },
      { t: 'story', ch: 'social', label: 'Last call, today only', week: max },
      { t: 'sms', ch: 'sms', label: 'Tonight only, the new dish is on', week: max, need: 'list' },
      { t: 'post', ch: 'social', label: 'What people are saying', week: max },
    ]
    // A big launch gets a longer runway: an extra countdown story at the start.
    if (ctx.intensity === 'big') beats.unshift({ t: 'story', ch: 'social', label: 'Coming soon, count down with us', week: 1 })
    return beats
  },

  // Promote a (usually free) event — a night, a holiday, a tasting. Build interest, give the
  // list a heads-up, then push hard on the day. Distinct from launch (a menu-item drop) and
  // ticket (paid seats): no price, no discount code — just "come to the night."
  promoevent: (ctx) => {
    const max = ctx.intensity === 'big' ? 4 : 3
    const beats: PlaybookBeat[] = [
      { t: 'reel', ch: 'reels', label: 'Teaser for the night', week: 1 },
      { t: 'email', ch: 'email', label: 'Save the date, here is what is on', week: 1, need: 'list' },
      { t: 'post', ch: 'social', label: 'What to expect, who it is for', week: 2 },
      { t: 'post', ch: 'social', label: 'Tonight, here is the plan', week: max },
      { t: 'email', ch: 'email', label: 'It is tonight, come through', week: max, need: 'list' },
      { t: 'sms', ch: 'sms', label: 'Doors open tonight', week: max, need: 'list' },
      { t: 'post', ch: 'social', label: 'What a night, thank you', week: max },
    ]
    if (ctx.intensity === 'big') beats.unshift({ t: 'story', ch: 'social', label: 'Counting down to the night', week: 1 })
    return beats
  },

  // Ticketed event — it lives or dies on SELL-THROUGH over time: announce sale -> sell -> seats
  // going -> last call -> day-of -> recap. The list buys first, so list sends are the spine.
  ticket: (ctx) => {
    const max = ctx.intensity === 'big' ? 4 : 3
    const beats: PlaybookBeat[] = [
      { t: 'post', ch: 'social', label: 'Tickets are on sale, here is the night', week: 1 },
      { t: 'email', ch: 'email', label: 'Get your seat first, link inside', week: 1, need: 'list' },
      { t: 'story', ch: 'social', label: 'Seats are going, grab yours', week: 2 },
      { t: 'sms', ch: 'sms', label: 'Half the seats are gone', week: 2, need: 'list' },
      { t: 'email', ch: 'email', label: 'Last call for tickets', week: max, need: 'list' },
      { t: 'post', ch: 'social', label: 'Last seats, this week only', week: max },
      { t: 'post', ch: 'social', label: 'Sold-out night, thank you', week: max },
    ]
    if (ctx.intensity === 'big') beats.unshift({ t: 'reel', ch: 'reels', label: 'A taste of what the night is', week: 1 })
    return beats
  },

  // Gift cards around a gifting moment (holidays, Mother's Day). The whole game is "order in
  // time": announce -> (bonus, if there is one) -> order-soon -> last chance before the cutoff.
  giftcard: (ctx) => {
    const max = ctx.intensity === 'big' ? 4 : 3
    const beats: PlaybookBeat[] = [
      { t: 'post', ch: 'social', label: 'Gift cards are here, the easy gift', week: 1 },
      { t: 'email', ch: 'email', label: 'Send one in a click', week: 1, need: 'list' },
      { t: 'post', ch: 'social', label: 'Order soon to gift on time', week: max },
      { t: 'email', ch: 'email', label: 'Last chance to gift in time', week: max, need: 'list' },
      { t: 'sms', ch: 'sms', label: 'Today is the last day to gift on time', week: max, need: 'list' },
      { t: 'story', ch: 'social', label: 'Last call, gift cards close tonight', week: max },
    ]
    if (ctx.hasOffer) beats.splice(2, 0, { t: 'story', ch: 'social', label: 'Bonus when you buy this week', week: 2 })
    return beats
  },
}

/** A pure, phased plan for an event item that has a playbook (list/paid beats gated by the
 *  owner's answers). Returns [] of beats; an event with no playbook keeps its verbatim seed. */
function buildEventPlanBeats(itemId: string, spec: Record<string, string>): Beat[] {
  const fn = EVENT_PLAYBOOK[itemId]
  if (!fn) return ITEM_SHAPE[itemId]?.seed ?? []
  const ctx = eventCtx(spec)
  return fn(ctx)
    .filter((b) => !b.need || (b.need === 'list' && ctx.hasList) || (b.need === 'boost' && ctx.boost))
    .map((b) => [b.t, b.ch, b.label, b.week] as Beat)
}

/* ── Format / channel-shaped single pieces ─────────────────────────────────
 * Some non-program items let the owner pick the FORMAT (dish), the medium (shoot), or the
 * CHANNELS (slowoffer, birthday). That pick must change the pieces ACTUALLY produced, not
 * just the brief — otherwise picking "a short video" or "email only" silently does nothing
 * (the same ignored-input bug that made launch bad). Each item maps the owner's choice to
 * beats; an EMPTY choice returns the item's verbatim seed, so the module-load price estimate
 * stays lean + total and the default plan equals today's. */
function splitPicks(v?: string): string[] {
  return (v || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
}
function channelBeats(v: string | undefined, shape: ItemShape, map: { email?: Beat; text?: Beat; social?: Beat }): Beat[] {
  const picks = splitPicks(v)
  if (!picks.length) return shape.seed
  const beats: Beat[] = []
  if (map.email && picks.some((p) => /email/.test(p))) beats.push(map.email)
  if (map.text && picks.some((p) => /text|sms/.test(p))) beats.push(map.text)
  if (map.social && picks.some((p) => /social|post/.test(p))) beats.push(map.social)
  return beats.length ? beats : shape.seed
}

const SPEC_SHAPED_PIECES: Record<string, (spec: Record<string, string>, shape: ItemShape) => Beat[]> = {
  // Feature a dish AS the format(s) the owner picked, plus the post that ships it. Default 'a photo'.
  dish: (spec, shape) => {
    const picks = splitPicks(spec.format)
    if (!picks.length) return shape.seed
    const beats: Beat[] = []
    if (picks.some((f) => /photo/.test(f))) beats.push(['photo', 'social', 'Hero photo of the dish'])
    if (picks.some((f) => /video|reel/.test(f))) beats.push(['reel', 'reels', 'Short video of the dish'])
    if (picks.some((f) => /graphic/.test(f))) beats.push(['post', 'social', 'Designed graphic of the dish'])
    if (picks.some((f) => /carousel/.test(f))) beats.push(['post', 'social', 'Swipeable carousel of the dish'])
    if (!beats.length) return shape.seed
    beats.push(['post', 'social', 'Dish feature post'])
    return beats
  },
  // Shoot only the medium they booked. Default 'photo and video' → both (the seed).
  shoot: (spec, shape) => {
    const k = (spec.kind || '').toLowerCase()
    if (!k) return shape.seed
    const beats: Beat[] = []
    if (/photo/.test(k)) beats.push(['photo', 'social', 'On-site photo shoot'])
    if (/video/.test(k)) beats.push(['reel', 'reels', 'Reel cut from the shoot'])
    return beats.length ? beats : shape.seed
  },
  // Send the slow-night offer on the channels they picked. Default email + text → the seed.
  slowoffer: (spec, shape) => channelBeats(spec.channel, shape, {
    email: ['email', 'email', 'Slow-night offer email'],
    text: ['sms', 'sms', 'Slow-night offer text'],
    social: ['post', 'social', 'Slow-night offer post'],
  }),
  // Birthday treat on the channels they picked. Default email + text → the seed.
  birthday: (spec, shape) => channelBeats(spec.channel, shape, {
    email: ['email', 'email', 'Birthday treat email'],
    text: ['sms', 'sms', 'Birthday treat text'],
  }),
  // The graphic goes WHERE the owner said. The type system has no print type, so a print pick keeps
  // the designed-graphic pricing but the LABEL names the real deliverable (and specInstructions
  // carries "Format / where it goes" to the maker) — never a generic "social post" for a flyer.
  graphic: (spec, shape) => {
    const w = (spec.where || '').toLowerCase()
    const head = spec.headline?.trim()
    if (/flyer|print/.test(w)) return [['post', 'social', head ? `Print-ready flyer — ${head}` : 'Print-ready flyer design']]
    if (/menu board/.test(w)) return [['post', 'social', head ? `Menu board design — ${head}` : 'Menu board design']]
    if (/story/.test(w)) return [['story', 'stories', head ? `Story graphic — ${head}` : 'Story graphic']]
    return shape.seed
  },
}

/** The owner's own words name the campaign when they gave them (event name, launch subject) — so
 *  "Jazz Trivia Thursday" never renders as "Promote an event" in lists, briefs, or work orders. */
function specName(itemId: string, spec: Record<string, string>): string | null {
  const v = (k: string) => (spec[k]?.trim() ? spec[k].trim() : null)
  if (itemId === 'promoevent' || itemId === 'ticket') return v('event')
  if (itemId === 'launch') { const s = v('subject'); return s ? `Launch: ${s}` : null }
  return null
}

/* ── Programs that lean on the owner's list ────────────────────────────────
 * nights / regulars / firstvisit drive conversion through email + SMS. Those sends only work
 * if the owner has a connected list (spec.list, set by the madlib + coerced by gateList). With
 * no list the plan stays honest: the list legs fall back to a social post (and a nudge to
 * connect one). firstvisit's seed has no list send, so it instead GAINS an offer email when a
 * list exists. Catering's email is cold B2B outreach, not a subscriber send, so it is NOT gated. */
function socialFallback(beats: Beat[]): Beat[] {
  const kept = beats.filter(([t]) => t !== 'email' && t !== 'sms')
  const droppedList = kept.length !== beats.length
  if (droppedList && !kept.some(([t]) => t === 'post')) kept.push(['post', 'social', 'Offer post for guests who follow you'])
  return kept
}
const LIST_PROGRAM: Record<string, (base: Beat[], hasList: boolean) => Beat[]> = {
  nights: (base, hasList) => (hasList ? base : socialFallback(base)),
  regulars: (base, hasList) => (hasList ? base : socialFallback(base)),
  // firstvisit now has a full PROGRAM_PLAN that handles its own list gating, so it is not here.
}

/* Additive beats a program gains from a specific method answer (the funnel covers the core; this
 * honors an explicit pick — e.g. asking for reviews "by a table card or QR" / "a follow-up text"). */
const SPEC_AUGMENT: Record<string, (spec: Record<string, string>, beats: Beat[]) => Beat[]> = {
  reviewsplan: (spec, beats) => {
    const how = (spec.how || '').toLowerCase()
    const add: Beat[] = []
    if (/qr|table card/.test(how)) add.push(['post', 'social', 'QR table-card to ask for reviews'])
    if (/follow-?up text|\btext\b|sms/.test(how)) add.push(['sms', 'sms', 'Follow-up review request text'])
    return [...beats, ...add.filter(([t, , l]) => !beats.some((b) => b[0] === t && b[2] === l))]
  },
}

/* ── Full program plans (the "template" campaigns) ────────────────────────
 * Some programs deserve a complete, input-driven funnel instead of seed + funnel-fill.
 * firstvisit is the template: a stranger has to SEE you (a boostable reel + a hero photo of the
 * dish) → get a reason to come now (an offer post + a Google post for "near me" searches) → and
 * then the campaign CAPTURES the new guest (a table-QR list grab) and brings them back (a
 * second-visit nudge), so a first visit becomes a repeat one. The email is gated on a real list;
 * the second-visit nudge runs off the contacts the QR collects, so it works even with no list yet. */
const PROGRAM_PLAN: Record<string, (spec: Record<string, string>, hasList: boolean) => Beat[]> = {
  firstvisit: (spec, hasList) => {
    const beats: Beat[] = [
      ['reel', 'reels', 'Teaser reel of your signature dish'],
      ['photo', 'social', 'Hero photo of your signature dish'],
      ['post', 'social', 'First-visit offer post'],
      ['post', 'gbp', 'Google offer post for nearby searches'],
    ]
    if (hasList) beats.push(['email', 'email', 'First-visit offer email to your list'])
    // Complete the funnel: capture the new guest at the table, then bring them back.
    beats.push(['post', 'social', 'Table QR to grow your list'])
    beats.push(['sms', 'sms', 'Second-visit nudge to bring them back'])
    return beats
  },
}

/** The campaign's paid-reach mode. The `reach` slot (firstvisit's "using …") is the explicit
 *  control; without it we fall back to the boost dial (events / single pieces) or shape.ads (the
 *  reach program). 'boost' = a one-time per-piece boost (ad cost only, attaches to a piece);
 *  'managed' = the $/mo ads-management retainer; 'none' = organic. */
function paidMode(spec: Record<string, string>, shape: ItemShape, declinedAds: boolean, optedBoost: boolean): 'none' | 'boost' | 'managed' {
  const r = (spec.reach || '').toLowerCase()
  if (r) {
    if (/boost/.test(r)) return 'boost'
    if (/always|month|545|retainer|ongoing/.test(r)) return 'managed'
    return 'none' // "just my followers" / organic
  }
  if (!!shape.ads && !declinedAds && shape.kind === 'program') return 'managed'
  if (optedBoost && shape.kind !== 'program') return 'boost'
  return 'none'
}

/* ── adapt(): the situation-aware plan pass (the "best plan" layer) ─────────
 * AI proposes, rules dispose. The pure composer above builds the strategically-complete plan; this
 * pass BENDS it for the owner's real situation — add / reorder / skip — each change carrying a plain
 * `because` the owner sees, and revertible (an additive change is just a piece they can delete). The
 * steer rides in as plain spec flags (the server-side diagnosis reduces to spec.situation, etc.), so
 * this stays PURE + synchronous and the module-load price path never calls a model. NO matching
 * situation = the plan returns verbatim (identity), so an empty or uncertain signal costs nothing —
 * the safety guarantee the whole layer rests on.
 *
 * This pass handles CONTENT-level bends. NO-LIST CAPTURE (hard binary, can't misfire): a list-
 * dependent program with no list STARTS a list (capture at the table) instead of silently degrading.
 * The bigger situational moves (reputation, get-found) are OPERATIONAL — a service, not a content
 * piece — so they ride as a LEAD MOVE (see composePlanForGoal / LEAD_MOVES), with content demoted
 * beneath them. With nothing matching, the plan is returned verbatim. */
function adapt(beats: Beat[], itemId: string, spec: Record<string, string>): Beat[] {
  const hasList = /\b(list|email|text)\b/i.test(spec.list || '')
  if (!hasList && LIST_PROGRAM[itemId]) {
    const hasCapture = beats.some(([, , l]) => /\bqr\b|grow your list/i.test(l))
    if (!hasCapture) beats = [...beats, ['post', 'social', 'Table QR to grow your list', undefined, 'No list yet, so the plan starts one by capturing guests at the table']]
  }
  return beats
}

/** Seed the Content Menu cart from a selected catalog item: its title (a name suggestion)
 *  + its content pieces, drawn from the one ITEM_SHAPE table the plan flow uses. */
export function seedFromItem(itemId: string): { name: string; pieces: Array<{ type: string; label: string }> } {
  const shape = ITEM_SHAPE[itemId] || fallbackShape()
  return { name: shape.title, pieces: shape.seed.map(([type, , label]) => ({ type, label })) }
}

/* ── SYSTEM PLANS — a goal as a staged set of catalog SERVICES, not content beats ──────────
 * Some goals (win first visits) are won by an end-to-end SYSTEM of real services across four
 * stages, budget-gated, not by a handful of social posts. A system plan emits `moves` (catalog
 * service ids tagged by stage + role); the adapter costs each as a real line, and the plan flow
 * renders the four stages instead of the content Walk. Tiers nest: lean ⊂ standard ⊂ aggressive.
 * Demand is a diversified portfolio (cheap always-on floor + a creator spike + a paid scaler),
 * never a single bet — and the cheap floor (Nextdoor + sampling) is what lets the Lean tier move
 * real volume, not just convert existing search. */
const TIER_RANK: Record<Tier, number> = { lean: 0, standard: 1, aggressive: 2 }


// Catalog price index, built once, for the fit-to-plan tier math below.
const CATALOG_BY_ID = new Map(PRICED_CATALOG.map((s) => [s.id, s]))

/** The fixed cost of a goal's plan at an EXPLICIT tier: sums the catalog's one-time and monthly
 *  prices for every service the plan includes. Per-unit (volume-dependent) prices are left out of
 *  the fixed floor. Pass an explicit tier so tierFor short-circuits on spec.tier and never re-enters
 *  budget-based selection (the recursion this path must avoid). Non-system goals price at 0 here. */
export function planCostForGoal(itemId: string, tier: Tier): { oneTime: number; monthly: number; firstMonth: number } {
  if (!isSystemGoal(itemId)) return { oneTime: 0, monthly: 0, firstMonth: 0 }
  const { moves } = buildSystem(itemId, { tier })
  let oneTime = 0, monthly = 0
  for (const m of moves) {
    const svc = CATALOG_BY_ID.get(m.serviceId)
    if (!svc) continue
    for (const p of svc.prices) {
      if (p.kind === 'monthly') monthly += p.amount
      else if (p.kind === 'one-time') oneTime += p.amount
    }
  }
  return { oneTime, monthly, firstMonth: oneTime + monthly }
}

/** Fit to the real plan (owner decision 2026-07-02): pick the BIGGEST tier whose ongoing monthly
 *  cost fits the stated budget, instead of the old fixed cutoffs that mapped $300/mo to an $8k plan.
 *  If even lean overshoots, return lean and let the trim / over-budget ship flow handle the gap. */
export function fitTierToMonthlyBudget(itemId: string, monthlyBudget: number): Tier {
  if (monthlyBudget <= 0) return 'standard'
  for (const tier of ['aggressive', 'standard', 'lean'] as Tier[]) {
    if (planCostForGoal(itemId, tier).monthly <= monthlyBudget) return tier
  }
  return 'lean'
}

/** Budget → tier (ask-budget-then-scale). An explicit spec.tier wins; else a monthly budget number
 *  scales it; absent budget defaults to the recommended Standard. When the goal is known (itemId),
 *  a numeric budget FITS to the real plan; without it, the legacy cutoffs apply (event goals). */
export function tierFor(spec: Record<string, string>, itemId?: string): Tier {
  // Accept an explicit tier, a friendly madlib label ("a lean start" / "the full plan" / "an all-in
  // push"), or a raw monthly budget number; default to the recommended Standard.
  const t = `${spec.tier || ''} ${spec.budget || ''}`.toLowerCase()
  if (/\blean\b/.test(t)) return 'lean'
  if (/all-?in|aggressive/.test(t)) return 'aggressive'
  if (/\bfull\b|standard|recommend/.test(t)) return 'standard'
  const b = parseInt(`${spec.budget || spec.monthlyBudget || spec.budgetMonthly || ''}`.replace(/[^0-9]/g, ''), 10) || 0
  if (!b) return 'standard'
  // Fit to the real plan when we know a system goal; otherwise fall back to the legacy cutoffs.
  if (itemId && isSystemGoal(itemId)) return fitTierToMonthlyBudget(itemId, b)
  if (b < 250) return 'lean'
  if (b < 700) return 'standard'
  return 'aggressive'
}

const FV_STAGES: PlanStage[] = [
  { stage: 'be-found', title: 'Be found', sub: 'Make the places they check before coming convincing' },
  { stage: 'give-reason', title: 'Give a reason', sub: 'A real offer, and the reviews that close it' },
  { stage: 'get-discovered', title: 'Get discovered', sub: 'Put your food in front of new neighbors' },
  { stage: 'capture-return', title: 'Keep them coming', sub: 'Turn one visit into a list, a second, a friend' },
]

/* Fill slow weeknights (capacity) — give a known audience a repeating reason to come on a NAMED
 * night, then nudge the list with day-of/day-before timing. Timing + activation, not discovery. */
const NIGHTS_STAGES: PlanStage[] = [
  { stage: 'lock', title: 'Lock the night', sub: 'Pick the slow night, a margin-safe reason, and measure it' },
  { stage: 'draw', title: 'Build the draw', sub: 'A standing weeknight reason people put on the calendar' },
  { stage: 'activate', title: 'Activate your people', sub: 'Nudge the regulars and the list to the named night' },
  { stage: 'habit', title: 'Make it a habit', sub: 'Turn one weeknight visit into a standing routine' },
]

/* Turn guests into regulars (retain) — frequency + spend, not net-new reach. Own the list, reward
 * the return, run lifecycle sends, win back the drifting and turn regulars into advocates. */
const REG_STAGES: PlanStage[] = [
  { stage: 'own', title: 'Own the list', sub: 'Build the guest list and see who comes back' },
  { stage: 'reward', title: 'Reward the return', sub: 'Reasons to come back and spend a little more' },
  { stage: 'lifecycle', title: 'Stay in front', sub: 'Lifecycle sends on autopilot, on your own channels' },
  { stage: 'advocate', title: 'Win back and grow', sub: 'Recover the drifting, turn regulars into advocates' },
]

/* Raise your rating (reviews) — fix the listing the rating sits on, catch problems before they go
 * public, ask happy guests, then respond to lift the score. Reputation, not reach. */
const REVIEWS_STAGES: PlanStage[] = [
  { stage: 'listing', title: 'Fix the listing', sub: 'The profile your rating sits on' },
  { stage: 'intercept', title: 'Catch issues early', sub: 'Hear unhappy guests before they post' },
  { stage: 'ask', title: 'Ask happy guests', sub: 'Turn good visits into fresh reviews' },
  { stage: 'respond', title: 'Respond and rise', sub: 'Reply to every review to lift the score' },
]

/* The only residual goal-shaped table: each goal's stage LABELS (display copy). Which SERVICES
 * fill those stages now lives on the catalog (goalPlays), queried via playsForGoal. */
export const SYSTEM_STAGES: Record<SystemGoal, PlanStage[]> = {
  firstvisit: FV_STAGES,
  nights: NIGHTS_STAGES,
  regulars: REG_STAGES,
  reviews: REVIEWS_STAGES,
}
export function isSystemGoal(itemId: string): itemId is SystemGoal {
  return Object.prototype.hasOwnProperty.call(SYSTEM_STAGES, itemId)
}

/** Catalog items that ARE a brain goal under another id (promoevent → the 'promote-event' atom
 *  goal). resolveBrainGoal returns the brain vocabulary (never the catalog id) or null. The route,
 *  the builder, and this composer share it so the gates can never drift. Add a goal by authoring its
 *  atom plays + outcome and one alias line — no code change. */
const EVENT_GOAL_ALIAS: Record<string, PlanGoal> = { promoevent: 'promote-event', launch: 'launch', deal: 'run-deal' }
export function resolveBrainGoal(itemId: string): PlanGoal | null {
  if (isSystemGoal(itemId)) return itemId
  return EVENT_GOAL_ALIAS[itemId] ?? null
}
export const isBrainGoal = (itemId: string): boolean => resolveBrainGoal(itemId) !== null

/**
 * The honest cold-start headline for a composed plan: it inspects the plan's ACTUAL lead move (the
 * first service of the first populated stage, in the chosen mix order) and only emits a line that is
 * true of that plan. So "Led with reviews" appears only when a reputation play really leads; a plan
 * with no review step (nights, a deal) can never claim it. When the signal-driven class is present
 * but isn't the overall lead, it falls back to an honest "Moved X earlier". Null when nothing real to
 * say. The reviews goal suppresses the reviews-nudge line (tautological — that goal IS reviews).
 */
export function planLeadHeadline(goal: PlanGoal, mix: string[], signals: BrainSignals): string | null {
  const stages = (SYSTEM_STAGES as Record<string, PlanStage[]>)[goal] ?? DIALED_STAGES[goal]
  if (!stages) return null
  const stageOrder = new Map(stages.map((s, i) => [s.stage, i] as const))
  const rank = new Map(mix.map((id, i) => [id, i] as const))
  const plays = playsForGoalAtoms(goal).filter((p) => rank.has(p.serviceId))
  if (!plays.length) return null
  plays.sort((a, b) => {
    const sa = stageOrder.get(a.stage) ?? 999, sb = stageOrder.get(b.stage) ?? 999
    if (sa !== sb) return sa - sb
    return (rank.get(a.serviceId) ?? 999) - (rank.get(b.serviceId) ?? 999)
  })
  const strong = leadHeadline(classifyPlay(plays[0]), signals)
  if (strong) return strong
  const classes = new Set(plays.map((p) => classifyPlay(p)))
  return movedHeadline(signals, {
    reputation: goal !== 'reviews' && classes.has('reputation'),
    captureBuild: classes.has('capture-build'),
  })
}

/** The AI-chosen mix (ordered serviceIds) precomputed server-side by select-mix.ts and passed
 *  in through spec.aiMix. Returns id -> rank, or null when absent — null = the deterministic plan.
 *  The composer never calls the model; it only consumes this precomputed string. */
function parseAiMix(raw?: string): Map<string, number> | null {
  if (!raw) return null
  const ids = raw.split(',').map((s) => s.trim()).filter(Boolean)
  if (!ids.length) return null
  const m = new Map<string, number>()
  ids.forEach((id, i) => { if (!m.has(id)) m.set(id, i) })
  return m
}

/** Build a system goal's plan by QUERYING the catalog (playsForGoal) instead of reading a
 *  hardcoded list: tier-filter the services tagged for this goal. When an AI mix is present
 *  (spec.aiMix), restrict to that chosen subset and order within a stage by the AI's rank;
 *  otherwise keep every affordable service ordered by stage then within-stage weight (the
 *  deterministic default + offline fallback). Returns the moves + the stages that populated. */
export function buildSystem(goal: SystemGoal, spec: Record<string, string>): { moves: PlanMove[]; stages: PlanStage[] } {
  const rank = TIER_RANK[tierFor(spec, goal)]
  const stages = SYSTEM_STAGES[goal]
  const stageOrder = new Map(stages.map((s, i) => [s.stage, i] as const))
  const affordable = playsForGoal(goal)
    .map((c, i) => ({ ...c, i }))
    .filter((c) => TIER_RANK[c.play.minTier] <= rank)
  // AI mix: restrict to the chosen ids (intersected with the affordable set, so any stale or
  // over-tier id is dropped). If it would empty the plan, fall back to the full affordable set.
  const aiOrder = parseAiMix(spec.aiMix)
  const picked = aiOrder ? affordable.filter((c) => aiOrder.has(c.service.id)) : affordable
  const usingAi = !!aiOrder && picked.length > 0
  const chosen = picked.length ? picked : affordable
  chosen.sort((a, b) => {
    const sa = stageOrder.get(a.play.stage) ?? 999, sb = stageOrder.get(b.play.stage) ?? 999
    if (sa !== sb) return sa - sb
    if (usingAi) {
      const ra = aiOrder!.get(a.service.id) ?? 999, rb = aiOrder!.get(b.service.id) ?? 999
      if (ra !== rb) return ra - rb
    } else {
      const wa = a.play.weight ?? 0, wb = b.play.weight ?? 0
      if (wa !== wb) return wb - wa
    }
    return a.i - b.i
  })
  const moves: PlanMove[] = enforceInfraDeps(chosen.map((c) => ({ serviceId: c.service.id, stage: c.play.stage, role: c.play.role, ...(c.play.because ? { because: c.play.because } : {}) })))
  const present = new Set(moves.map((m) => m.stage))
  return { moves, stages: stages.filter((s) => present.has(s.stage)) }
}

/** THE CANONICAL ENTRY. Pure, total on an empty spec. Builds the CampaignTemplate the
 *  adapter hands to composeCampaign, plus the occasion (gated on a picked date) and goalKey. */
export function composePlanForGoal(itemId: string, spec: Record<string, string>): { tpl: CampaignTemplate; occasion?: string; goalKey: GoalKey; ads: boolean; heldAds?: boolean; leadMove?: { serviceId: string; title: string; because: string }; moves?: PlanMove[]; stages?: PlanStage[] } {
  const shape = ITEM_SHAPE[itemId] || fallbackShape()
  const meta = GOAL_META[shape.goal]
  // Needs-aware: the funnel responds to who the owner is ACTUALLY targeting (their mapped
  // audience), not just the item's static default — so retargeting a program onto a list
  // segment (regulars / lapsed / …) earns a keep/retention piece.
  const audienceIds = (spec.audience ? spec.audience.split(',') : (shape.audiences ?? meta.audiences)).filter(Boolean)
  // Events with a playbook build a real phased plan from the owner's inputs (list / boost /
  // intensity); programs get funnel completion; everything else keeps its verbatim seed.
  // Does the owner have a connected list? (spec.list is set by the madlib and coerced to
  // 'social only' by gateList when there is no real list.) Gates program email/SMS legs.
  const hasList = /\b(list|email|text)\b/i.test(spec.list || '')
  const playbook = shape.kind === 'event' ? EVENT_PLAYBOOK[itemId] : undefined
  const shaped = SPEC_SHAPED_PIECES[itemId]
  const programPlan = PROGRAM_PLAN[itemId]
  // Brain event goals (promote-event) compose from the dialed atom engine — budget-scaled and
  // lift-orderable — then map to content beats so the existing content render / pricing / schedule
  // are unchanged. Empty (a misconfigured atom layer) falls THROUGH to the legacy content-beat path,
  // so this is self-healing and can never blank the plan. Produces content beats, not moves, so
  // isSystem stays false and the builder renders it exactly like today's event plan.
  const dialedGoal = !isSystemGoal(itemId) ? resolveBrainGoal(itemId) : null
  let brainEventBeats = dialedGoal ? dialedContentBeats(dialedGoal, spec) : []
  // No list → never propose a send (mirrors the playbook's need:'list' gating for the atom path).
  if (brainEventBeats.length && !hasList) brainEventBeats = brainEventBeats.filter((b) => b.type !== 'email' && b.type !== 'sms')
  let beats: Beat[] = brainEventBeats.length
    ? brainEventBeats.map((b) => [b.type, b.channel, b.label, b.week, b.because, b.serviceId] as Beat)
    : playbook
      ? buildEventPlanBeats(itemId, spec)
      : shaped
        ? shaped(spec, shape)
        : programPlan
          ? programPlan(spec, hasList)
          : fillFunnel(shape, audienceIds)
  if (LIST_PROGRAM[itemId]) beats = LIST_PROGRAM[itemId](beats, hasList)
  if (SPEC_AUGMENT[itemId]) beats = SPEC_AUGMENT[itemId](spec, beats)
  // The situation-aware content pass (no-list capture). Identity when nothing matches.
  beats = adapt(beats, itemId, spec)

  // A SYSTEM plan (e.g. firstvisit) is built from staged catalog SERVICES (moves), not content
  // beats — so it carries no content pieces; the moves ride as line items via the adapter, and the
  // foundation/paid gating is handled by the tier (no separate lead move or held-ads needed).
  const sys = isSystemGoal(itemId) ? buildSystem(itemId, spec) : undefined
  if (sys) beats = []

  // ── THE LEAD MOVE — the best plan leads with the one operational move the binding constraint
  // demands, not with content. The live number is the gate (never a guess). On an acquisition/
  // capacity PROGRAM: a REAL low rating (rating<4.0 & >=15 reviews) → the review engine is the lead;
  // a weak listing (GBP completeness<70, or barely-on-the-map with <10 reviews) → get found on Google
  // is the lead. Reputation outranks get-found. While a foundation move leads, paid reach is HELD
  // (don't pay to send strangers into a leaky funnel) — the owner can override with one tap. Content
  // stays in the plan, demoted to the support slot beneath the lead. */
  const rating = Number(spec.rating), ratingCount = Number(spec.ratingCount), presence = Number(spec.presence)
  const acquireProg = shape.kind === 'program' && (shape.goal === 'acquire' || shape.goal === 'capacity')
  const repBinds = acquireProg && rating > 0 && rating < 4.0 && ratingCount >= 15
  const getFoundBinds = shape.kind === 'program' && shape.goal === 'acquire' && !repBinds
    && ((presence > 0 && presence < 70) || (ratingCount > 0 && ratingCount < 10))
  const leadMove = repBinds
    ? { serviceId: 'review-engine', title: 'Turn on review requests', because: `Your ${rating.toFixed(1)} rating is the real ceiling, so we ask every happy guest for a review before paying to send strangers in.` }
    : getFoundBinds
      ? { serviceId: 'gbp-setup', title: 'Get found on Google', because: `Most new guests look you up before deciding, so we fix your Google listing first. A complete profile lifts calls and directions in 30 to 60 days.` }
      : undefined
  const overridden = spec.reachOverride === 'on'

  // Paid reach modes (see paidMode): 'managed' = ongoing $/mo retainer; 'boost' = one-time per-piece;
  // 'none' = organic. A leading foundation move HOLDS paid reach (unless overridden). heldAds = we
  // actually suppressed paid reach the owner would otherwise have had → the plan flow shows the override.
  const declinedAds = /\bno\b|organic/i.test(spec.paidreach || '')
  const optedBoost = /\b(yes|paid|boost)\b/i.test(spec.boost || '')
  const normalMode = paidMode(spec, shape, declinedAds, optedBoost)
  const holdAds = !!leadMove && !overridden
  const mode = holdAds ? 'none' : normalMode
  const heldAds = holdAds && normalMode !== 'none'
  const managedAds = mode === 'managed'
  // Tie a boost to the content it amplifies: the lead reel / post / story (first one in the plan).
  let boostIdx = -1
  if (mode === 'boost') {
    boostIdx = beats.findIndex(([t]) => t === 'reel' || t === 'post' || t === 'story')
    if (boostIdx < 0) boostIdx = 0
  }

  const contentPlan: ContentBeatSpec[] = beats.map(([type, channel, label, week, because, serviceId], i) => ({ week: week ?? (i + 1), type, channel, label, ...(i === boostIdx ? { boost: true } : {}), ...(because ? { because } : {}), ...(serviceId ? { serviceId } : {}) }))
  const channels = Array.from(new Set([...beats.map(([, ch]) => ch), ...(managedAds ? ['ads'] : [])]))
  // Geo comes from the owner's real profile (their neighborhood) when we have it, else a radius;
  // it drives the "near me" framing + the ad targeting, so the brief reads like their actual area.
  // never paste a no-offer sentinel into the owner-visible objective ("... with No offer")
  const objectiveBase = spec.offer && !isNoOfferSentinel(spec.offer) ? `${meta.objective} with ${spec.offer}` : meta.objective
  const geo = spec.neighborhood ? ` in ${spec.neighborhood}` : (spec.radius ? ` within ${spec.radius} miles` : '')
  const objective = `${objectiveBase}${geo}`

  const tpl: CampaignTemplate = {
    id: `builder-${itemId}`,
    icon: '✨',
    name: specName(itemId, spec) ?? shape.title,
    tagline: '',
    category: meta.category,
    goalKey: meta.goalKey,
    objective,
    kpi: meta.kpi,
    durationWeeks: DUR_WEEKS[shape.dur],
    suggestedOffers: [],
    defaultAudienceIds: shape.audiences ?? meta.audiences,
    defaultChannelIds: channels,
    contentPlan,
    projected: '',
    questions: [],
  }

  // Name the occasion only for items that build toward the picked date (launch, ticketed
  // event) so the schedule runs backward. Items where the date is a start/shoot day leave
  // this unset and run forward.
  const occasion = spec.date && shape.occasionName ? shape.occasionName : undefined
  // `ads` here means the ongoing managed-ads retainer (drives the $/mo paid-ads line). A per-piece
  // boost is carried on the beat (contentPlan[boostIdx].boost), not via this flag. `heldAds` flags
  // that a lead move suppressed paid reach the owner would otherwise have had (drives the override).
  // `leadMove` is the operational move the plan LEADS with; the adapter costs it + the plan flow
  // shows it above the content (which is now the support slot).
  // A system plan overrides the content-era outputs: no content ads, no held-ads, no single lead
  // move (the staged moves replace all three). Non-system goals are unchanged.
  return sys
    ? { tpl, occasion, goalKey: meta.goalKey, ads: false, heldAds: false, leadMove: undefined, moves: sys.moves, stages: sys.stages }
    : { tpl, occasion, goalKey: meta.goalKey, ads: managedAds, heldAds, leadMove }
}
