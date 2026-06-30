import 'server-only'
/**
 * AI selection layer (Phase 2) — "AI picks the best mix from the tagged catalog".
 *
 * The deterministic buildSystem (compose-plan.ts) returns EVERY service a goal is
 * tagged for at/below the budget tier. This layer asks the model to pick the BEST
 * SUBSET for the owner's REAL situation (rating, Google completeness, list, budget),
 * then CODE disposes: validates ids against the closed candidate set, always keeps the
 * foundations (essential), satisfies hard dependencies, dedupes. It returns an ordered
 * list of serviceIds — the "mix" — that the route hands back; buildSystem consumes it
 * through a spec key and never calls the model. Mirrors planning/select.ts (propose then
 * dispose). callStructuredOutput returns null on any failure, so a null mix here simply
 * means "use the deterministic plan" — no blank screens, no throws.
 */
import { playsForGoal } from '@/lib/campaigns/catalog'
import type { PricedService, SystemGoal, Tier } from '@/lib/campaigns/data/priced-catalog'
import { callStructuredOutput } from '@/lib/campaigns/planning/anthropic'

const TIER_RANK: Record<Tier, number> = { lean: 0, standard: 1, aggressive: 2 }

export interface MixSignals {
  rating: number | null
  ratingCount: number | null
  /** Google listing completeness 0-100 (lower = weaker presence). */
  presence: number | null
  hasList: boolean | null
  neighborhood: string | null
  /** The owner's rough monthly comfort, advisory only. */
  monthlyBudget: number | null
}

export interface MixCandidate {
  id: string
  name: string
  section: string
  essential: boolean
  /** Monthly-equivalent load (recurring at face, one-time spread over 6). */
  monthlyLoad: number
  stage: string
  role: string
  minTier: Tier
  weight: number
}

/** Monthly-equivalent load — mirrors planning/select.ts so the numbers read the same. */
function monthlyLoad(s: PricedService): number {
  const p = s.prices[0]
  if (!p) return 0
  return p.kind === 'monthly' ? p.amount : p.amount / 6
}

/** The tier-affordable services tagged for this goal, as model candidates. Pure. */
export function mixCandidates(goal: SystemGoal, tier: Tier): MixCandidate[] {
  const rank = TIER_RANK[tier]
  return playsForGoal(goal)
    .filter((c) => TIER_RANK[c.play.minTier] <= rank)
    .map((c) => ({
      id: c.service.id,
      name: c.service.name,
      section: c.service.section,
      essential: !!c.service.essential,
      monthlyLoad: Math.round(monthlyLoad(c.service)),
      stage: c.play.stage,
      role: c.play.role,
      minTier: c.play.minTier,
      weight: c.play.weight ?? 0,
    }))
}

/* Hard dependencies — a service that cannot do its job without another. Honest, not
 * exhaustive: paid reach without measurement is spending blind; texting/reminders
 * without a list have no one to send to; posts/replies need the surface they act on;
 * the second-visit nudge needs a captured contact. "Satisfied if ANY listed dep is in
 * the mix." A missing dep is pulled in when available, else the dependent is dropped. */
const DEPENDS: Record<string, string[]> = {
  'paid-ads': ['tracking'],
  'sms-program': ['crm-list', 'sms-found'],
  'reminder-send': ['crm-list', 'sms-found'],
  'gbp-posts': ['gbp-setup'],
  'review-responses': ['review-engine'],
  'second-visit': ['capture-kit', 'crm-list'],
}

/* Mutually-exclusive near-twins — services that do the SAME job, where a plan should carry at most
 * one. If the model picks more than one from a group, keep its highest-ranked and drop the rest, so a
 * plan never double-charges for overlapping work. Distinct-but-related pairs (e.g. friend-hook vs
 * referral) are guided in the prompt instead, not hard-deduped here. */
const MUTEX: string[][] = [
  ['event-pkg', 'bar-events'], // a one-off event test vs the committed weekly series — not both
]

interface Proposal {
  keep: { serviceId: string; reason: string }[]
  drop?: { serviceId: string; why: string }[]
}
const PROPOSAL_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['keep'],
  properties: {
    keep: {
      type: 'array',
      description: 'The best mix for THIS owner, ordered most-important first. serviceIds from the candidate list ONLY.',
      items: { type: 'object', additionalProperties: false, required: ['serviceId', 'reason'], properties: { serviceId: { type: 'string' }, reason: { type: 'string' } } },
    },
    drop: {
      type: 'array',
      description: 'Candidates deliberately left out for this owner, with a short why.',
      items: { type: 'object', additionalProperties: false, required: ['serviceId', 'why'], properties: { serviceId: { type: 'string' }, why: { type: 'string' } } },
    },
  },
}

const GOAL_LABEL: Record<SystemGoal, string> = {
  firstvisit: 'win first-time visits from new locals',
  nights: 'fill slow weeknights',
  regulars: 'turn guests into regulars',
  reviews: 'raise your star rating',
}

const SYSTEM = `You are a restaurant marketing strategist choosing the best mix of services for ONE owner.
You are given a goal, the owner's real situation, and a fixed CANDIDATE list of services (each already
affordable for their budget). You pick the SUBSET that best fits this owner and order it most-important
first. You never invent a service: every serviceId must come from the candidate list. Plain language,
no jargon, no em dashes.

How to choose:
- Always keep the foundations (marked [foundation]); they are the base everything else runs on.
- Lead with what this owner's situation most needs: a low rating means reviews come first; a weak Google
  listing means be-found first; no guest list means capture a list before sends that need one.
- Prefer a focused, high-leverage mix over including everything. Dropping a weak-fit service is good.
- Some services overlap; do not pick both of a pair unless each clearly earns its place: friend-hook (a first-visit bring-a-friend pass) vs referral (an ongoing referral loop for regulars); reminder-send (a one-off book-now nudge) vs vip-comms (VIP early-access sends); event-pkg (a single event) vs bar-events (a committed weekly series).
- Keep the order honest: most-important first. Reason each keep in one short sentence tied to their situation.`

function buildUser(goal: SystemGoal, tier: Tier, s: MixSignals, cands: MixCandidate[]): string {
  const L: string[] = []
  L.push(`GOAL: ${GOAL_LABEL[goal]} (budget level: ${tier}).`)
  L.push('')
  L.push("OWNER'S SITUATION:")
  L.push(`- Rating: ${s.rating != null ? `${s.rating} from ${s.ratingCount ?? '?'} reviews` : 'unknown'}`)
  L.push(`- Google listing completeness: ${s.presence != null ? `${s.presence}%` : 'unknown'}`)
  L.push(`- Guest list: ${s.hasList == null ? 'unknown' : s.hasList ? 'has an email/text list' : 'no guest list yet'}`)
  if (s.neighborhood) L.push(`- Neighborhood: ${s.neighborhood}`)
  if (s.monthlyBudget) L.push(`- Rough monthly comfort: about $${s.monthlyBudget} (advisory)`)
  L.push('')
  L.push('CANDIDATES (choose serviceIds from here only; ~$/mo is the running cost):')
  for (const c of cands) {
    L.push(`- ${c.id} [stage: ${c.stage}${c.essential ? ', foundation' : ''}] ~$${c.monthlyLoad}/mo: ${c.role}`)
  }
  L.push('')
  L.push('Return keep (ordered best-first) and drop. Keep the foundations. Serve this owner.')
  return L.join('\n')
}

/** Code disposal: a validated proposal -> an ordered list of real serviceIds, foundations
 *  always kept, hard dependencies satisfied, deduped. Order = the model's keep order. */
function dispose(keep: { serviceId: string }[], cands: MixCandidate[]): string[] {
  const byId = new Map(cands.map((c) => [c.id, c]))
  const out: string[] = []
  const have = new Set<string>()
  const push = (id: string) => { if (byId.has(id) && !have.has(id)) { have.add(id); out.push(id) } }

  for (const k of keep) push(k.serviceId)          // model order, validated against the closed set
  for (const c of cands) if (c.essential) push(c.id) // foundations always kept

  // Hard dependencies: ensure each kept service has a dep in the mix; pull one in if available,
  // else drop the dependent (it can't run honestly without it).
  for (const id of [...out]) {
    const deps = DEPENDS[id]
    if (!deps || deps.some((d) => have.has(d))) continue
    const avail = deps.find((d) => byId.has(d))
    if (avail) push(avail)
    else { have.delete(id); const i = out.indexOf(id); if (i >= 0) out.splice(i, 1) }
  }

  // Near-twins: keep at most one per MUTEX group (the highest-ranked = earliest in out), drop the rest.
  for (const group of MUTEX) {
    const present = group.filter((id) => have.has(id))
    if (present.length <= 1) continue
    const keepId = present.reduce((a, b) => (out.indexOf(a) <= out.indexOf(b) ? a : b))
    for (const id of present) if (id !== keepId) { have.delete(id); const i = out.indexOf(id); if (i >= 0) out.splice(i, 1) }
  }
  return out
}

/**
 * The AI mix for a goal, or null to use the deterministic plan. Returns the ordered,
 * disposed serviceId list (a subset of the candidates). Never throws.
 */
export async function selectMix(goal: SystemGoal, tier: Tier, signals: MixSignals, opts?: { excludeIds?: readonly string[] }): Promise<{ mix: string[]; reasons: Record<string, string> } | null> {
  // Proven losers (services that measurably flopped for THIS business) are dropped from the
  // candidate set BEFORE the model sees them, so a known loser can never be re-proposed; dispose
  // validates against this same closed set, so it cannot reappear downstream either.
  const exclude = opts?.excludeIds && opts.excludeIds.length ? new Set(opts.excludeIds) : null
  const cands = exclude ? mixCandidates(goal, tier).filter((c) => !exclude.has(c.id)) : mixCandidates(goal, tier)
  if (cands.length === 0) return null
  const parsed = await callStructuredOutput<Proposal>({
    system: SYSTEM,
    user: buildUser(goal, tier, signals, cands),
    schema: PROPOSAL_SCHEMA,
    maxTokens: 1400,
  })
  const keep = (parsed?.keep ?? []).filter((k) => k && typeof k.serviceId === 'string')
  if (keep.length === 0) return null
  const mix = dispose(keep, cands)
  if (mix.length === 0) return null
  const reasons: Record<string, string> = {}
  for (const k of keep) if (typeof k.reason === 'string') reasons[k.serviceId] = k.reason
  return { mix, reasons }
}
