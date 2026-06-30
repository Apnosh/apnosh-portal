/**
 * buildFromAtoms — the ONE plan engine, generalized from buildSystem to run over the atom-level
 * play layer (data/atom-plays) instead of whole-service goalPlays.
 *
 * PHASE 1: this is an exact re-expression of buildSystem. It runs the identical algorithm (pull
 * the plays tagged for the goal, tier-filter by minTier, optionally restrict+rank by the AI mix,
 * else order by stage then weight, stable by seed order) over ATOM_PLAYS, then collapses the
 * chosen plays back to service-level PlanMove[] via toServiceMoves. Because ATOM_PLAYS is seeded
 * 1:1 from goalPlays in the same traversal order, toServiceMoves(buildFromAtoms(goal, spec))
 * deep-equals buildSystem(goal, spec) for every goal and tier — proven by
 * scripts/verify-atom-engine.ts. Nothing here is wired into the live composer yet.
 *
 * Later phases turn on the two budget dials that live on each play (crucial inclusion + scale
 * quantities) and route atomMoves to work orders; the parity oracle (buildSystem) stays until
 * each goal is flipped and diffed.
 *
 * Pure + synchronous, like the composer it will eventually replace.
 */
import { tierFor, SYSTEM_STAGES } from './compose-plan'
import { playsForGoalAtoms, EVENT_STAGES, DIALED_STAGES, type AtomPlay, type PlanGoal } from '../data/atom-plays'
import type { ContentBeatSpec } from '../data/campaign-templates'
import type { SystemGoal, Tier } from '../data/priced-catalog'
import type { PlanMove, PlanStage } from '../types'

/** Mirror of compose-plan's TIER_RANK (tiers nest lean ⊂ standard ⊂ aggressive). */
const TIER_RANK: Record<Tier, number> = { lean: 0, standard: 1, aggressive: 2 }

/** Engine options. excludeIds = serviceIds that measurably FLOPPED for this business (from
 *  history); they are removed from candidates before selection, so a known loser is never
 *  re-proposed. Empty/undefined → no filtering → byte-identical parity with buildSystem. */
export interface BuildOpts {
  excludeIds?: readonly string[]
  /** Within-stage ordering score (higher first), e.g. expected lift on the goal's outcome
   *  (see brain/objective.ts). Absent → order by the seeded weight (byte-identical parity).
   *  Ignored when an AI mix is present (the mix's order wins). */
  scoreOf?: (p: AtomPlay) => number
}
const EMPTY_EXCLUDE: ReadonlySet<string> = new Set()
function excludeSet(opts?: BuildOpts): ReadonlySet<string> {
  return opts?.excludeIds && opts.excludeIds.length ? new Set(opts.excludeIds) : EMPTY_EXCLUDE
}

/** Mirror of compose-plan's parseAiMix: a comma serviceId string -> id->rank, or null. */
function parseAiMix(raw?: string): Map<string, number> | null {
  if (!raw) return null
  const ids = raw.split(',').map((s) => s.trim()).filter(Boolean)
  if (!ids.length) return null
  const m = new Map<string, number>()
  ids.forEach((id, i) => { if (!m.has(id)) m.set(id, i) })
  return m
}

/** Collapse chosen atom-plays to the service-level moves the live flow consumes. Mirrors the
 *  exact move shape buildSystem emits: { serviceId, stage, role, because? } in chosen order. */
export function toServiceMoves(atomMoves: AtomPlay[]): PlanMove[] {
  return atomMoves.map((c) => ({
    serviceId: c.serviceId,
    stage: c.stage,
    role: c.role,
    ...(c.because ? { because: c.because } : {}),
  }))
}

/* Hard infrastructure prerequisites: a SEND can never run before the sending infrastructure it
 * needs exists. Unlike a generic "build before send" rule, these hold even when the owner already
 * has a list (the CRM / sending domain still has to be set up before a blast can fire), so it is
 * safe to enforce unconditionally. The lift order is otherwise preserved. */
const SEND_DEPS: Record<string, readonly string[]> = {
  'sms-program': ['sms-found', 'crm-list'],
  'reminder-send': ['sms-found', 'crm-list'],
  'welcome-seq': ['email-found', 'crm-list'],
  'newsletter': ['email-found', 'crm-list'],
  'second-visit': ['crm-list'],
}

/** Within each stage, push a dependent move to just after the latest of its present prerequisites,
 *  but ONLY when a prerequisite currently sits later (an inversion). Otherwise order is untouched, so
 *  the lift/weight ranking is preserved. Pure + stable; applied identically by buildSystem and
 *  buildFromAtoms so their byte-for-byte parity holds. */
export function enforceInfraDeps<T extends { serviceId: string; stage: string }>(moves: T[]): T[] {
  const keyed = moves.map((m, i) => {
    const deps = SEND_DEPS[m.serviceId]
    let key = i
    if (deps) {
      for (const d of deps) {
        const di = moves.findIndex((x) => x.serviceId === d && x.stage === m.stage)
        if (di > i) key = Math.max(key, di + 0.5)
      }
    }
    return { m, i, key }
  })
  keyed.sort((a, b) => (a.key !== b.key ? a.key - b.key : a.i - b.i))
  return keyed.map((k) => k.m)
}

/**
 * Build a system goal's plan from the atom-level play layer. Returns the service-level moves +
 * stages (identical to buildSystem) plus the underlying atomMoves (the per-step plays, for the
 * work-order + analytics layers in later phases).
 */
export function buildFromAtoms(
  goal: SystemGoal,
  spec: Record<string, string>,
  opts?: BuildOpts,
): { moves: PlanMove[]; stages: PlanStage[]; atomMoves: AtomPlay[] } {
  const rank = TIER_RANK[tierFor(spec)]
  const stages = SYSTEM_STAGES[goal]
  const stageOrder = new Map(stages.map((s, i) => [s.stage, i] as const))
  const exclude = excludeSet(opts)
  const scoreOf = opts?.scoreOf
  const affordable = playsForGoalAtoms(goal)
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => TIER_RANK[c.minTier] <= rank && !exclude.has(c.serviceId))
  // AI mix: restrict to the chosen ids (intersected with affordable); empty -> fall back to all.
  const aiOrder = parseAiMix(spec.aiMix)
  const picked = aiOrder ? affordable.filter(({ c }) => aiOrder.has(c.serviceId)) : affordable
  const usingAi = !!aiOrder && picked.length > 0
  const chosen = picked.length ? picked : affordable
  chosen.sort((a, b) => {
    const sa = stageOrder.get(a.c.stage) ?? 999, sb = stageOrder.get(b.c.stage) ?? 999
    if (sa !== sb) return sa - sb
    if (usingAi) {
      const ra = aiOrder!.get(a.c.serviceId) ?? 999, rb = aiOrder!.get(b.c.serviceId) ?? 999
      if (ra !== rb) return ra - rb
    } else if (scoreOf) {
      const la = scoreOf(a.c), lb = scoreOf(b.c)
      if (la !== lb) return lb - la
    } else {
      const wa = a.c.weight ?? 0, wb = b.c.weight ?? 0
      if (wa !== wb) return wb - wa
    }
    return a.i - b.i
  })
  const atomMoves = chosen.map(({ c }) => c)
  const moves = enforceInfraDeps(toServiceMoves(atomMoves))
  const present = new Set(moves.map((m) => m.stage))
  return { moves, stages: stages.filter((s) => present.has(s.stage)), atomMoves }
}

/* ── Dialed mode (Phase 2): the budget dials, live ───────────────────────────────────────────
 * The same selector, but for goals authored on the play layer with the dials turned on:
 *  - inclusion: keep a step if it is crucial (the spine, kept at any budget) OR its minTier is at
 *    or below the owner's tier (a nice-to-have the budget can afford).
 *  - quantity: each kept step gets scale[tier] copies; steps that scale to 0 at this tier drop.
 * System goals never run this path, so their byte-identical parity is untouched. */

export interface PlanStep {
  play: AtomPlay
  /** How many of this step at the owner's budget tier (scale[tier]). */
  amount: number
}

export function buildDialedPlan(
  goal: PlanGoal,
  spec: Record<string, string>,
  stages: PlanStage[],
  opts?: BuildOpts,
): { steps: PlanStep[]; stages: PlanStage[]; moves: PlanMove[] } {
  const tier = tierFor(spec)
  const rank = TIER_RANK[tier]
  const stageOrder = new Map(stages.map((s, i) => [s.stage, i] as const))
  const exclude = excludeSet(opts)
  const scoreOf = opts?.scoreOf
  // The brain's lift order, threaded as spec.aiMix (same channel buildSystem uses), wins within a
  // stage when present; else the caller's scoreOf; else the seeded weight.
  const aiOrder = parseAiMix(spec.aiMix)
  const chosen = playsForGoalAtoms(goal)
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => (c.crucial || TIER_RANK[c.minTier] <= rank) && c.scale[tier] > 0 && !exclude.has(c.serviceId))
  chosen.sort((a, b) => {
    const sa = stageOrder.get(a.c.stage) ?? 999, sb = stageOrder.get(b.c.stage) ?? 999
    if (sa !== sb) return sa - sb
    if (aiOrder) {
      const ra = aiOrder.get(a.c.serviceId) ?? 999, rb = aiOrder.get(b.c.serviceId) ?? 999
      if (ra !== rb) return ra - rb
    } else if (scoreOf) {
      const la = scoreOf(a.c), lb = scoreOf(b.c)
      if (la !== lb) return lb - la
    } else {
      const wa = a.c.weight ?? 0, wb = b.c.weight ?? 0
      if (wa !== wb) return wb - wa
    }
    return a.i - b.i
  })
  const steps: PlanStep[] = chosen.map(({ c }) => ({ play: c, amount: c.scale[tier] }))
  const moves = toServiceMoves(steps.map((s) => s.play))
  const present = new Set(steps.map((s) => s.play.stage))
  return { steps, stages: stages.filter((s) => present.has(s.stage)), moves }
}

/** The promote-event plan, with the budget dials live. Low budget = the crucial spine; higher
 *  budgets unlock nice-to-haves (reels, SMS, paid boost) and scale the quantities. */
export function buildEventPlan(spec: Record<string, string>, opts?: BuildOpts) {
  return buildDialedPlan('promote-event', spec, EVENT_STAGES, opts)
}

/* ── Path B bridge: dialed plan → content beats ──────────────────────────────────────────────
 * Map the dialed atom engine's PlanSteps into the ContentBeatSpec shape the live content builder
 * already renders (dates, the per-piece customize sheet, per-type pricing). So a brain event goal
 * composes from the budget-dialed, lift-ordered engine but renders identically to today's content
 * plan. One-way + lossy by design: setup steps (the FB event page) are not content pieces and are
 * dropped here; the paid boost is dropped (the composer's own paidMode decides boost). Pure. */

const STAGE_WEEK: Record<string, number> = { prep: 1, announce: 2, remind: 3, amplify: 2, recap: 4 }

function beatTypeFor(p: AtomPlay): string {
  switch (p.atom) {
    case 'shoot': case 'edit-media': return 'reel'
    case 'send-blast': return p.track.channel === 'sms' ? 'sms' : 'email'
    case 'schedule-publish': return p.stage === 'remind' ? 'story' : 'post'
    default: return 'post' // design-graphic, write-copy, ...
  }
}
function beatChannelFor(type: string, channel: string): string {
  if (type === 'reel') return 'reels'
  if (type === 'email') return 'email'
  if (type === 'sms') return 'sms'
  if (channel === 'gbp') return 'gbp'
  return 'social'
}

/** Map dialed steps to content beats. amount → that many beats (the budget dial, made visible).
 *  paid-ads → boost flag on its host piece (lost when re-tupled to a Beat; the composer's paidMode
 *  re-decides boost, so no double-boost). web-page (setup) → dropped. */
export function stepsToContentBeats(steps: PlanStep[]): ContentBeatSpec[] {
  const beats: ContentBeatSpec[] = []
  let wantBoost = false
  for (const step of steps) {
    const p = step.play
    if (p.atom === 'paid-ads') { wantBoost = true; continue }
    if (p.atom === 'web-page') {
      // The RSVP / Facebook event page is a CRUCIAL owner step (the home base invitees land on) — it
      // was previously dropped because it isn't a social piece. Surface it as a week-1 setup line so
      // the owner actually sees it; priced as a page-equivalent post.
      beats.push({ week: STAGE_WEEK[p.stage] ?? 1, type: 'post', label: p.role, channel: 'web', ...(p.because ? { because: p.because } : {}) })
      continue
    }
    if (p.atom === 'set-tracking') {
      // A measurement step (e.g. count deal redemptions) is not a social piece either; show it as a
      // week-1 setup line so the plan can actually prove the outcome it promises.
      beats.push({ week: STAGE_WEEK[p.stage] ?? 1, type: 'post', label: p.role, channel: 'web', ...(p.because ? { because: p.because } : {}) })
      continue
    }
    const type = beatTypeFor(p)
    const channel = beatChannelFor(type, p.track.channel)
    const week = STAGE_WEEK[p.stage] ?? 2
    const n = Math.max(1, step.amount)
    for (let i = 0; i < n; i++) {
      beats.push({ week, type, label: p.role, channel, ...(p.because ? { because: p.because } : {}) })
    }
  }
  if (wantBoost) {
    const host = beats.find((b) => b.type === 'reel' || b.type === 'post' || b.type === 'story')
    if (host) host.boost = true
  }
  return beats
}

/** Any dialed (event/promo) goal's content plan: the dialed engine (budget-scaled, lift-orderable
 *  via spec.aiMix or opts.scoreOf) mapped to content beats. The goal's stages come from
 *  DIALED_STAGES. Empty → the caller falls back to the legacy content-beat path. */
export function dialedContentBeats(goal: PlanGoal, spec: Record<string, string>, opts?: BuildOpts): ContentBeatSpec[] {
  const stages = DIALED_STAGES[goal]
  if (!stages) return []
  return stepsToContentBeats(buildDialedPlan(goal, spec, stages, opts).steps)
}

/** promote-event content plan (kept for existing callers/tests; delegates to dialedContentBeats). */
export function eventContentBeats(spec: Record<string, string>, opts?: BuildOpts): ContentBeatSpec[] {
  return dialedContentBeats('promote-event', spec, opts)
}
