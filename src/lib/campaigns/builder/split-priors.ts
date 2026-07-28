/**
 * SPLIT PRIORS — how a plan's spend should lean, by what kind of place this is. ADVISORY ONLY.
 *
 * WHAT THIS IS. For each system goal, minimum shares of MONTHLY spend that its stages should
 * carry, with adjustments by business concept (the LIVE archetype vocabulary from
 * src/lib/goals/types.ts, derived at onboarding). A plan whose spend falls below a floor gets an
 * advisory in owner words on the review screen. Nothing here blocks, and nothing here steers
 * composition — that is the router's job in a later phase. This is the strategist saying "places
 * like yours usually need more here" out loud instead of thinking it.
 *
 * ── CITE YOUR SOURCE (law 7) ───────────────────────────────────────────────────────────────────
 *
 * Every advisory ends in "Our estimate." because that is what these numbers ARE: authored
 * judgment, not measured cohorts. The floors are deliberately LOW — an advisory that fires on
 * every plan is a nag, and a nag trains the owner to ignore the one that matters. When
 * plan_allocations accumulates n >= 5 outcomes per concept x goal cohort, a later phase swaps
 * the source string to "verified median" per cohort — the field exists now so v1 ships honest
 * rather than shipping mute.
 *
 * Pure, client-safe.
 */
import type { Concept } from '@/lib/goals/types'
import type { LineItem, PlanMove } from '../types'
import { stageSpend, totalMonthly } from './stage-spend'

/** Concepts collapse into the groups we can defend distinct advice for. */
export type ConceptGroup = 'value' | 'mainstream' | 'craft' | 'bar' | 'cafe'

export function conceptGroup(concept: Concept | null | undefined): ConceptGroup {
  switch (concept) {
    case 'qsr': case 'fast_casual': case 'mobile': case 'delivery_only': return 'value'
    case 'fine_dining': return 'craft'
    case 'bar': return 'bar'
    case 'cafe': return 'cafe'
    case 'casual': case 'catering_heavy': default: return 'mainstream'
  }
}

interface StageFloor {
  /** The goal's own stage key ('be-found', 'own', 'lock', …). */
  stage: string
  /** Minimum share of monthly spend, 0..1. Deliberately low; see header. */
  floor: number
  /** Why, in the owner's words. Rendered with the share numbers around it. */
  because: string
}

/**
 * The base floors per goal, in the goal's own stage vocabulary. Only the stages where
 * under-investment is a KNOWN failure mode carry a floor at all — flooring every stage would
 * just restate the plan.
 */
const BASE_FLOORS: Record<string, StageFloor[]> = {
  firstvisit: [
    { stage: 'be-found', floor: 0.2, because: 'New guests check Google before they ever see an ad. If the places they look are thin, the rest of the plan pays for traffic that bounces.' },
    { stage: 'capture-return', floor: 0.1, because: 'A first visit that never becomes a second is rented, not earned.' },
  ],
  nights: [
    { stage: 'lock', floor: 0.15, because: 'Without measuring the named night, you cannot tell if any of this worked.' },
    { stage: 'activate', floor: 0.15, because: 'The cheapest fill for a slow night is the people who already like you.' },
  ],
  regulars: [
    { stage: 'own', floor: 0.2, because: 'Every send in this plan lands on the list this stage builds. A thin list starves the rest.' },
  ],
  reviews: [
    { stage: 'ask', floor: 0.15, because: 'Ratings rise when happy guests are asked. Fixing the listing alone holds ground; asking gains it.' },
  ],
}

/** Concept adjustments: only where the group genuinely changes the advice. Values REPLACE the
 *  base floor for that stage. */
const CONCEPT_TWEAKS: Partial<Record<ConceptGroup, Record<string, Partial<Record<string, number>>>>> = {
  // Craft places win on reasons, not reach: the give-a-reason stage carries more of the load.
  craft: { firstvisit: { 'give-reason': 0.15, 'get-discovered': 0 } },
  // Value places win on volume: discovery earns a floor of its own.
  value: { firstvisit: { 'get-discovered': 0.15 } },
  // Bars live and die on the slow-night draw.
  bar: { nights: { draw: 0.2 } },
}

export interface SplitAdvisory {
  goal: string
  stage: string
  stageTitle: string
  /** The advisory sentence, owner words, ending in the data-maturity phrase. */
  line: string
}

/** The floors that apply for this concept x goal, tweaks folded in. Exported for the sim. */
export function floorsFor(concept: Concept | null | undefined, goal: string): StageFloor[] {
  const base = BASE_FLOORS[goal] ?? []
  const tweaks = CONCEPT_TWEAKS[conceptGroup(concept)]?.[goal]
  if (!tweaks) return base
  const merged = new Map(base.map((f) => [f.stage, f]))
  for (const [stage, floor] of Object.entries(tweaks)) {
    if (floor === undefined) continue
    if (floor <= 0) { merged.delete(stage); continue }
    const cur = merged.get(stage)
    merged.set(stage, { stage, floor, because: cur?.because ?? 'Places like yours usually lean harder here.' })
  }
  return [...merged.values()]
}

/**
 * Compare a composed plan's monthly split against the floors. At most 2 advisories, worst
 * shortfall first. Silent when: no moves (not a system plan), no monthly spend at all (nothing
 * to split), or every floored stage holds its floor.
 */
export function checkSplit(
  items: LineItem[],
  moves: PlanMove[] | undefined,
  concept: Concept | null | undefined,
  goal: string,
  stageTitles?: Record<string, string>,
): SplitAdvisory[] {
  if (!moves?.length) return []
  const spend = stageSpend(items, moves)
  const total = totalMonthly(spend)
  if (total <= 0) return []

  const advisories: { adv: SplitAdvisory; gap: number }[] = []
  for (const f of floorsFor(concept, goal)) {
    const share = (spend[f.stage]?.monthly ?? 0) / total
    if (share >= f.floor) continue
    const title = stageTitles?.[f.stage] ?? f.stage
    const pct = Math.round(share * 100)
    const floorPct = Math.round(f.floor * 100)
    advisories.push({
      gap: f.floor - share,
      adv: {
        goal,
        stage: f.stage,
        stageTitle: title,
        line: `${title} is ${pct}% of this plan's monthly spend. Places like yours usually put at least ${floorPct}% there. ${f.because} Our estimate.`,
      },
    })
  }
  return advisories.sort((a, b) => b.gap - a.gap).slice(0, 2).map((x) => x.adv)
}
