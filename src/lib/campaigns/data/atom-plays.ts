/**
 * The play layer — the routing brain, moved DOWN from whole services onto atomic step-types.
 *
 * Each AtomPlay says "this concrete step serves this goal, at this stage, from this budget tier
 * up, in this order, routed to this lane, proven by this number." It is the single record the
 * engine (buildFromAtoms), the work order, and the analytics all read.
 *
 * PHASE 1 (this file) is lossless scaffolding: ATOM_PLAYS is SEEDED directly from the existing
 * whole-service goalPlays (data/priced-catalog), so the new engine reproduces today's plans
 * byte-for-byte (proven by scripts/verify-atom-engine.ts). Each play keeps its serviceId for
 * parity and is attached to the service's representative atom step (service-atom-map.generated).
 * The new dials — crucial, scale, lane, track, measuredWeight — carry safe defaults here and
 * become team-tunable in later phases. Nothing in this file is wired into the live composer yet.
 *
 * Pure + synchronous (mirrors the composer); no DB, no server-only.
 */
import { PRICED_CATALOG, type SystemGoal, type Tier } from './priced-catalog'
import { atomById } from './atomic-catalog'
import { SERVICE_PRIMARY_ATOM } from './service-atom-map.generated'
import type { PlanStage } from '../types'

/** The goals the engine can build: the 4 SYSTEM goals (seeded from service goalPlays, run in
 *  byte-identical parity mode) plus the dialed campaign goals authored on the play layer. */
export type PlanGoal = SystemGoal | 'promote-event' | 'launch' | 'run-deal'

/** Where a step is fulfilled. producer is the doer; discipline/capability route it to a queue. */
export interface AtomLane {
  producer: 'team' | 'creator' | 'ai' | 'owner'
  discipline: string
  capability: string
}
/** What proves a step worked, and on which channel analytics resolves its numbers. */
export interface AtomTrack {
  metric: string
  channel: string
}
/** How many of a repeatable step at each budget tier (Phase 2 dial; Phase 1 default 1/1/1). */
export interface AtomScale {
  lean: number
  standard: number
  aggressive: number
}

export interface AtomPlay {
  /** The catalog service this play descends from. Phase 1 keeps service identity for parity. */
  serviceId: string
  /** The atom step-type this play sits on, plus the concrete type variant. */
  atom: string
  type: string
  goal: PlanGoal
  stage: string
  /** Always keep, even at the lowest budget — the crucial spine. Phase 1 default = essential. */
  crucial: boolean
  /** Cheapest budget tier that includes this play (tiers nest lean ⊂ standard ⊂ aggressive). */
  minTier: Tier
  /** Quantity per budget tier. */
  scale: AtomScale
  /** Seeded order hint (from the goalPlay weight). Higher sorts first within a stage. */
  weight: number
  /** Written back from real results later; preferred over weight when present. Phase 1: unset. */
  measuredWeight?: number
  /** Owner-facing one-liner. */
  role: string
  /** Optional deeper rationale. */
  because?: string
  lane: AtomLane
  track: AtomTrack
}

/* ── Lane + track derivation (enrichment; does not affect Phase 1 parity) ─────────────────── */

const DISCIPLINE_BY_ATOM: Record<string, { discipline: string; capability: string }> = {
  'write-copy': { discipline: 'Copy', capability: 'copywriter' },
  'brainstorm': { discipline: 'Strategy', capability: 'strategist' },
  'design-graphic': { discipline: 'Design', capability: 'designer' },
  'shoot': { discipline: 'Production', capability: 'videographer' },
  'edit-media': { discipline: 'Editing', capability: 'editor' },
  'brand-system': { discipline: 'Design', capability: 'designer' },
  'schedule-publish': { discipline: 'Channel', capability: 'publisher' },
  'send-blast': { discipline: 'Channel', capability: 'publisher' },
  'reply-engage': { discipline: 'Community', capability: 'community-manager' },
  'listing-update': { discipline: 'Listings', capability: 'specialist' },
  'web-page': { discipline: 'Web', capability: 'developer' },
  'wire-integration': { discipline: 'Web', capability: 'developer' },
  'stand-up-platform': { discipline: 'Setup', capability: 'specialist' },
  'set-tracking': { discipline: 'Analytics', capability: 'analyst' },
  'build-automation': { discipline: 'Automation', capability: 'specialist' },
  'test-flow': { discipline: 'QA', capability: 'specialist' },
  'claim-listing': { discipline: 'Listings', capability: 'specialist' },
  'design-offer': { discipline: 'Growth', capability: 'strategist' },
  'margin-math': { discipline: 'Growth', capability: 'strategist' },
  'paid-ads': { discipline: 'Ads', capability: 'ads-manager' },
  'plan-calendar': { discipline: 'Strategy', capability: 'strategist' },
  'segment-tags': { discipline: 'Analytics', capability: 'analyst' },
  'assemble-report': { discipline: 'Analytics', capability: 'analyst' },
  'monitor-ops': { discipline: 'Ops', capability: 'specialist' },
  'source-partner': { discipline: 'Outreach', capability: 'coordinator' },
  'field-event': { discipline: 'Field', capability: 'coordinator' },
  'capture-contacts': { discipline: 'Field', capability: 'coordinator' },
  'assemble-kit': { discipline: 'Outreach', capability: 'coordinator' },
  'prospect-list': { discipline: 'Outreach', capability: 'coordinator' },
  'pitch-followup': { discipline: 'PR', capability: 'coordinator' },
  'enable-staff': { discipline: 'Enablement', capability: 'trainer' },
}

function laneOf(atomId: string): AtomLane {
  const fit = atomById(atomId)?.fit ?? 'human'
  // Phase 1: AI-fit steps route to the AI lane; everything else to the team. Real creator
  // dispatch arrives in a later phase, so human/hybrid default to team for now.
  const producer: AtomLane['producer'] = fit === 'ai' ? 'ai' : 'team'
  const d = DISCIPLINE_BY_ATOM[atomId] ?? { discipline: 'General', capability: 'specialist' }
  return { producer, discipline: d.discipline, capability: d.capability }
}

function trackOf(atomId: string, typeId: string): AtomTrack {
  const t = `${atomId} ${typeId}`
  let channel = 'general'
  if (/google|gbp/.test(t)) channel = 'gbp'
  else if (/email/.test(t)) channel = 'email'
  else if (/\bsms\b|text|blast/.test(t)) channel = 'sms'
  else if (/paid-ads|ads/.test(t)) channel = 'ads'
  else if (/web-page|page|menu/.test(t)) channel = 'web'
  else if (atomId === 'schedule-publish' || atomId === 'reply-engage' || /social|story|caption|post/.test(t)) channel = 'social'
  else if (/shoot|edit-media|design-graphic|brand/.test(t)) channel = 'content'
  const metric =
    channel === 'ads' ? 'cost per new guest'
    : channel === 'email' || channel === 'sms' ? 'opens and clicks'
    : channel === 'web' ? 'visits'
    : channel === 'gbp' ? 'views and actions'
    : 'reach and engagement'
  return { metric, channel }
}

const FALLBACK_STEP = { atom: 'write-copy', type: 'social-post' }

/** Services whose representative atom/type would mis-derive their analytics channel via trackOf.
 *  newsletter's 'story-angle' type trips the social regex, but a newsletter IS email — so it must
 *  earn the email channel-fit boost and attribute correctly. Pin the channel here. */
const CHANNEL_OVERRIDE: Record<string, string> = { newsletter: 'email' }

/**
 * The seeded play layer. One AtomPlay per (service, goalPlay), in PRICED_CATALOG order then
 * goalPlay order — IDENTICAL traversal to playsForGoal — so the engine's output matches
 * buildSystem. The atom/type/lane/track/crucial/scale are enrichment that do not affect the
 * service-level plan; they make the play layer real and seed the later phases.
 */
export const ATOM_PLAYS: AtomPlay[] = (() => {
  const out: AtomPlay[] = []
  for (const s of PRICED_CATALOG) {
    const step = SERVICE_PRIMARY_ATOM[s.id] ?? FALLBACK_STEP
    for (const p of s.goalPlays ?? []) {
      out.push({
        serviceId: s.id,
        atom: step.atom,
        type: step.type,
        goal: p.goal,
        stage: p.stage,
        crucial: !!s.essential,
        minTier: p.minTier,
        scale: { lean: 1, standard: 1, aggressive: 1 },
        weight: p.weight ?? 0,
        role: p.role,
        ...(p.because ? { because: p.because } : {}),
        lane: laneOf(step.atom),
        track: CHANNEL_OVERRIDE[s.id] ? { ...trackOf(step.atom, step.type), channel: CHANNEL_OVERRIDE[s.id] } : trackOf(step.atom, step.type),
      })
    }
  }
  return out
})()

/* ── Dialed campaign goals (Phase 2) ─────────────────────────────────────────────────────────
 * Goals authored DIRECTLY on the play layer (not seeded from a system goal's goalPlays), with the
 * two budget dials live: `crucial` keeps the spine at any budget, `minTier` gates a nice-to-have,
 * and `scale` sets how many at each tier. The engine's dialed mode (build-from-atoms) reads these.
 *
 * ONE SKELETON, not a list per goal. event/launch/deal are the SAME promo shape — a graphic, a
 * teaser, a multi-channel announce, a reminder, a paid boost, proof — so they share one library of
 * promo SLOTS (the atom/stage/dials/default copy of each step). A goal is then a thin CONFIG: which
 * slots it uses, in what order, with its own serviceId + owner-facing copy and the occasional dial
 * tweak. Adding a new promo goal (ticket, gift card, reopening, seasonal) is a config, not a clone —
 * and a fix to the announce step lands in one place for every goal. buildPromoPlays expands a config
 * into the AtomPlay[] the engine reads, identical to the hand-written lists it replaced. */

/** One reusable promo step: its atom mechanics + budget dials + default rationale. The goal config
 *  supplies the serviceId + owner copy and may override weight/scale/minTier/crucial per goal. */
interface PromoSlot {
  atom: string
  type: string
  stage: string
  crucial: boolean
  minTier: Tier
  weight: number
  scale: AtomScale
  because?: string
}

const PROMO_SLOTS = {
  graphic:  { atom: 'design-graphic', type: 'feed-post', stage: 'prep', crucial: true, minTier: 'lean', weight: 90, scale: { lean: 1, standard: 1, aggressive: 1 } },
  fbpage:   { atom: 'web-page', type: 'page-build', stage: 'prep', crucial: true, minTier: 'lean', weight: 82, scale: { lean: 1, standard: 1, aggressive: 1 }, because: 'The RSVP home base searchers and invitees land on.' },
  reel:     { atom: 'shoot', type: 'video', stage: 'prep', crucial: false, minTier: 'standard', weight: 60, scale: { lean: 0, standard: 1, aggressive: 2 } },
  teasers:  { atom: 'schedule-publish', type: 'schedule', stage: 'prep', crucial: false, minTier: 'standard', weight: 50, scale: { lean: 0, standard: 2, aggressive: 4 } },
  announce: { atom: 'schedule-publish', type: 'schedule', stage: 'announce', crucial: true, minTier: 'lean', weight: 88, scale: { lean: 2, standard: 2, aggressive: 2 } },
  email:    { atom: 'send-blast', type: 'email-blast', stage: 'announce', crucial: true, minTier: 'lean', weight: 76, scale: { lean: 1, standard: 1, aggressive: 2 } },
  google:   { atom: 'write-copy', type: 'google-post', stage: 'announce', crucial: true, minTier: 'lean', weight: 72, scale: { lean: 1, standard: 1, aggressive: 2 } },
  reminder: { atom: 'schedule-publish', type: 'schedule', stage: 'remind', crucial: true, minTier: 'lean', weight: 66, scale: { lean: 1, standard: 1, aggressive: 1 } },
  sustain:  { atom: 'schedule-publish', type: 'schedule', stage: 'remind', crucial: false, minTier: 'standard', weight: 55, scale: { lean: 0, standard: 2, aggressive: 4 } },
  sms:      { atom: 'send-blast', type: 'text-blast', stage: 'remind', crucial: false, minTier: 'aggressive', weight: 54, scale: { lean: 0, standard: 0, aggressive: 1 } },
  boost:    { atom: 'paid-ads', type: 'promos', stage: 'amplify', crucial: false, minTier: 'standard', weight: 46, scale: { lean: 0, standard: 1, aggressive: 1 } },
  recap:    { atom: 'edit-media', type: 'video-edit', stage: 'recap', crucial: false, minTier: 'aggressive', weight: 40, scale: { lean: 0, standard: 0, aggressive: 1 } },
  proof:    { atom: 'schedule-publish', type: 'schedule', stage: 'recap', crucial: false, minTier: 'aggressive', weight: 42, scale: { lean: 0, standard: 0, aggressive: 1 } },
  measure:  { atom: 'set-tracking', type: 'tracking', stage: 'prep', crucial: true, minTier: 'lean', weight: 95, scale: { lean: 1, standard: 1, aggressive: 1 } },
  reach:    { atom: 'source-partner', type: 'collab', stage: 'amplify', crucial: false, minTier: 'standard', weight: 48, scale: { lean: 0, standard: 1, aggressive: 1 } },
} as const satisfies Record<string, PromoSlot>

/** A goal's use of a slot: its serviceId + owner copy, plus optional per-goal dial overrides. */
interface PromoStepCfg {
  slot: keyof typeof PROMO_SLOTS
  id: string
  role: string
  because?: string
  weight?: number
  scale?: AtomScale
  minTier?: Tier
  crucial?: boolean
}
interface PromoGoalCfg {
  goal: PlanGoal
  stages: PlanStage[]
  steps: PromoStepCfg[]
}

/** Expand a goal config into the AtomPlay[] the engine reads — the per-goal override wins over the
 *  slot default, and lane/track derive from the atom exactly as the hand-written lists did. */
function buildPromoPlays(cfg: PromoGoalCfg): AtomPlay[] {
  return cfg.steps.map((st) => {
    const slot: PromoSlot = PROMO_SLOTS[st.slot]
    const because = st.because ?? slot.because
    return {
      serviceId: st.id,
      atom: slot.atom,
      type: slot.type,
      goal: cfg.goal,
      stage: slot.stage,
      crucial: st.crucial ?? slot.crucial,
      minTier: st.minTier ?? slot.minTier,
      scale: st.scale ?? slot.scale,
      weight: st.weight ?? slot.weight,
      role: st.role,
      ...(because ? { because } : {}),
      lane: laneOf(slot.atom),
      track: trackOf(slot.atom, slot.type),
    }
  })
}

/* ── Promote an event ────────────────────────────────────────────────────────────────────────── */
export const EVENT_STAGES: PlanStage[] = [
  { stage: 'prep', title: 'Get ready', sub: 'The graphic, the page, the teasers' },
  { stage: 'announce', title: 'Announce it', sub: 'Hit every channel the same day' },
  { stage: 'remind', title: 'Remind them', sub: 'Nudge right before the doors open' },
  { stage: 'amplify', title: 'Put money behind it', sub: 'Paid reach on the best post' },
  { stage: 'recap', title: 'Show it off', sub: 'Proof that pulls the next crowd' },
]
export const EVENT_PLAYS: AtomPlay[] = buildPromoPlays({
  goal: 'promote-event',
  stages: EVENT_STAGES,
  steps: [
    { slot: 'graphic', id: 'evt-graphic', role: 'Make the event graphic' },
    { slot: 'fbpage', id: 'evt-fbpage', role: 'Build the Facebook event page' },
    { slot: 'reel', id: 'evt-reel', role: 'Film a teaser reel', because: 'Short video drives the most reach for events.' },
    { slot: 'teasers', id: 'evt-tease', role: 'Countdown teaser posts' },
    { slot: 'announce', id: 'evt-announce', role: 'Announce on Instagram + Facebook' },
    { slot: 'google', id: 'evt-google', role: 'Post the event on Google' },
    { slot: 'email', id: 'evt-email', role: 'Email the list', because: 'Your list is the cheapest, highest-intent channel to fill the room.' },
    { slot: 'reminder', id: 'evt-dayof', role: 'Day-of reminder post' },
    { slot: 'sms', id: 'evt-sms', role: 'Day-of SMS reminder' },
    { slot: 'boost', id: 'evt-boost', role: 'Put a paid boost behind it' },
    { slot: 'recap', id: 'evt-recap', role: 'Post-event proof recap' },
  ],
})

/* ── Launch a special / feature an item ─────────────────────────────────────────────────────── */
export const LAUNCH_STAGES: PlanStage[] = [
  { stage: 'prep', title: 'Build anticipation', sub: 'Tease the new item before it drops' },
  { stage: 'announce', title: 'Launch it', sub: 'Hit every channel on launch day' },
  { stage: 'remind', title: 'Keep it going', sub: 'Stay on it through the first weeks' },
  { stage: 'amplify', title: 'Put money behind it', sub: 'Paid reach on the best post' },
  { stage: 'recap', title: 'Show it off', sub: 'Proof from guests who tried it' },
]
export const LAUNCH_PLAYS: AtomPlay[] = buildPromoPlays({
  goal: 'launch',
  stages: LAUNCH_STAGES,
  steps: [
    { slot: 'graphic', id: 'lnch-graphic', role: 'Design the launch graphic' },
    { slot: 'reel', id: 'lnch-reel', role: 'Film a teaser reel of the new item', because: 'Short video drives the most reach for a launch.', weight: 62 },
    { slot: 'teasers', id: 'lnch-tease', role: 'Countdown teaser posts', scale: { lean: 0, standard: 2, aggressive: 3 } },
    { slot: 'announce', id: 'lnch-announce', role: 'Announce it on Instagram + Facebook' },
    { slot: 'email', id: 'lnch-email', role: 'Email the launch to your list', because: 'Your list is the first audience to put the new item in front of.' },
    { slot: 'google', id: 'lnch-google', role: 'Post the new item on Google', weight: 70, scale: { lean: 1, standard: 1, aggressive: 1 } },
    { slot: 'sustain', id: 'lnch-sustain', role: 'Keep featuring it the first weeks' },
    { slot: 'reach', id: 'lnch-creator', role: 'Get a local creator to feature the new item', because: 'Trial needs NEW guests; a creator puts the item in front of people who do not follow you yet.' },
    { slot: 'boost', id: 'lnch-boost', role: 'Put a paid boost behind it' },
    { slot: 'proof', id: 'lnch-proof', role: 'Repost a guest trying the new item' },
  ],
})

/* ── Run a deal (a discount/special to bring people in) ──────────────────────────────────────── */
export const DEAL_STAGES: PlanStage[] = [
  { stage: 'prep', title: 'Set it up', sub: 'The graphic and a teaser' },
  { stage: 'announce', title: 'Announce the deal', sub: 'Hit every channel' },
  { stage: 'remind', title: 'Last call', sub: 'Nudge before it ends' },
  { stage: 'amplify', title: 'Put money behind it', sub: 'Paid reach on the deal' },
]
export const DEAL_PLAYS: AtomPlay[] = buildPromoPlays({
  goal: 'run-deal',
  stages: DEAL_STAGES,
  steps: [
    { slot: 'measure', id: 'deal-track', role: 'Set up redemption tracking', because: 'The deal is measured by redemptions; this is how you count them and prove it worked.' },
    { slot: 'graphic', id: 'deal-graphic', role: 'Design the deal graphic' },
    { slot: 'teasers', id: 'deal-tease', role: 'Tease the deal', scale: { lean: 0, standard: 1, aggressive: 3 } },
    { slot: 'announce', id: 'deal-announce', role: 'Announce the deal on Instagram + Facebook' },
    { slot: 'email', id: 'deal-email', role: 'Email the deal to your list', because: 'Your list is the fastest, cheapest way to move a time-boxed deal.' },
    { slot: 'google', id: 'deal-google', role: 'Post the deal on Google', weight: 70, scale: { lean: 1, standard: 1, aggressive: 1 } },
    { slot: 'reminder', id: 'deal-remind', role: 'Last-chance reminder post' },
    { slot: 'sms', id: 'deal-sms', role: 'Text the deal to your list', because: 'A text is the most-opened nudge for a deal that ends soon.', minTier: 'standard', scale: { lean: 0, standard: 1, aggressive: 1 } },
    { slot: 'boost', id: 'deal-boost', role: 'Put a paid boost behind it' },
  ],
})

/** Stages per dialed (event/promo) goal — the engine + the content-beat bridge look these up. */
export const DIALED_STAGES: Record<string, PlanStage[]> = {
  'promote-event': EVENT_STAGES,
  launch: LAUNCH_STAGES,
  'run-deal': DEAL_STAGES,
}

/** All plays across every goal: the system seed first (parity order preserved), then the dialed
 *  campaign goals. Filtering by a system goal returns only its seeded plays, unchanged. */
const ALL_PLAYS: AtomPlay[] = [...ATOM_PLAYS, ...EVENT_PLAYS, ...LAUNCH_PLAYS, ...DEAL_PLAYS]

/** Every play tagged for a goal, in seed order. The atom-level mirror of playsForGoal. */
export function playsForGoalAtoms(goal: PlanGoal): AtomPlay[] {
  return ALL_PLAYS.filter((p) => p.goal === goal)
}
