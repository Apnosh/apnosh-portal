/**
 * GET /api/campaigns/plan-mix?clientId=…&goal=…&budget=… — the AI selection layer.
 * For a system goal (firstvisit/nights/regulars/reviews) it grounds the model in the owner's
 * real signals and returns the best ORDERED mix of catalog serviceIds for their situation. The
 * builder threads this into spec.aiMix; the pure/sync composer consumes it.
 *
 * Best-plan-brain Phase 1 wiring:
 *  - signals come from assembleBrainSignals (the single front door), not a 6-field ad-hoc struct.
 *  - data-richness ROUTING: a thin-data business keeps the deterministic plan rather than letting
 *    the AI reorder on null signals (returned as source 'rules', route 'safe').
 *  - proven losers (history.droppedServiceIds) are passed as excludeIds so the model never
 *    re-proposes a play that measurably flopped here.
 *  - with no explicit budget, a tier is SUGGESTED from the profile (the owner confirms it in the
 *    UI) instead of silently defaulting to Standard.
 * Non-system items, no key, or any failure -> empty mix (the deterministic plan stays).
 */
import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { selectMix, type MixSignals } from '@/lib/campaigns/builder/select-mix'
import { tierFor, isSystemGoal, planLeadHeadline } from '@/lib/campaigns/builder/compose-plan'
import { assembleBrain } from '@/lib/campaigns/brain/assemble-signals'
import { planRoute } from '@/lib/campaigns/brain/signals'
import { suggestTier } from '@/lib/campaigns/brain/suggest-tier'
import { brainRankedMix, rankMixByLift } from '@/lib/campaigns/brain/rank'
import type { Reading } from '@/lib/campaigns/brain/readiness'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/** The value if usable, else null — never invents. */
function val<T>(r: Reading<T>): T | null {
  return r.readiness === 'usable' ? r.value : null
}

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('clientId')
  const goal = req.nextUrl.searchParams.get('goal') ?? ''
  const budget = req.nextUrl.searchParams.get('budget') ?? ''
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })
  // The 4 system goals + the dialed event goal get a brain plan; everything else keeps its static plan.
  const isEventGoal = goal === 'promote-event' || goal === 'launch' || goal === 'run-deal'
  if (!isSystemGoal(goal) && !isEventGoal) return NextResponse.json({ mix: [], source: 'none' })

  const access = await checkClientAccess(clientId)
  if (!access.authorized) return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status: access.reason === 'unauthenticated' ? 401 : 403 })

  try {
    const { signals: brain, measured } = await assembleBrain(clientId)

    // Data-richness routing: without enough real signal, keep the deterministic plan.
    if (planRoute(brain) === 'safe') return NextResponse.json({ mix: [], source: 'rules', route: 'safe' })

    // Tier: an explicit budget wins; otherwise suggest one from the profile (owner confirms in UI).
    const suggested = suggestTier({
      monthlyBudget: val(brain.monthlyBudget),
      priceRange: val(brain.priceRange),
      primaryGoal: val(brain.primaryGoal),
      hasList: val(brain.hasList),
    })
    const tier = budget ? tierFor({ budget }) : suggested.tier

    const signals: MixSignals = {
      rating: val(brain.rating),
      ratingCount: val(brain.ratingCount),
      presence: val(brain.listingCompleteness),
      hasList: val(brain.hasList),
      neighborhood: val(brain.neighborhood),
      monthlyBudget: val(brain.monthlyBudget),
    }
    const excludeIds = [...(val(brain.droppedServiceIds) ?? [])]
    // No list → never propose a send: drop the email/text plays from the mix, for EVERY promo goal
    // (the composer also type-filters email/sms beats; keeping the mix consistent avoids drift).
    if (isEventGoal && val(brain.hasList) === false) excludeIds.push('evt-email', 'evt-sms', 'lnch-email', 'deal-email', 'deal-sms')

    // The objective function drives the ORDER by expected lift on the goal's outcome (threaded via
    // spec.aiMix). Events use the deterministic lift mix; system goals also get the AI's focused pick,
    // re-ranked by lift. The pure composer consumes the mix, untouched.
    const brainGoal = goal as Parameters<typeof brainRankedMix>[0]
    const ranked = brainRankedMix(brainGoal, tier, brain, { excludeIds, measured })
    const result = isSystemGoal(goal) ? await selectMix(goal, tier, signals, { excludeIds }) : null
    const mix = result ? rankMixByLift(result.mix, brainGoal, brain, { excludeIds, measured }) : ranked.mix
    // Cold-start headline: derived from the plan's ACTUAL lead move, so it can never claim a class
    // (e.g. reviews) the composed plan does not actually lead with.
    const lead = planLeadHeadline(brainGoal, mix, brain)
    return NextResponse.json({
      mix,
      ...(result?.reasons ? { reasons: result.reasons } : {}),
      source: result ? 'ai+lift' : 'brain',
      outcome: ranked.outcome.label,
      ...(lead ? { lead } : {}),
      ...(budget ? {} : { suggestedTier: suggested }),
    })
  } catch {
    return NextResponse.json({ mix: [], source: 'rules' })
  }
}
