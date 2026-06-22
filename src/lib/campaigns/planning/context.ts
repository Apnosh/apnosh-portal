import 'server-only'
/**
 * Assemble the full PlanningContext (spec §2.6): the business profile, the live
 * signals, the (stubbed) feedback history, and the closed catalog. This is the
 * single input the planner pipeline runs on.
 */
import { PRICED_CATALOG } from '@/lib/campaigns/data/priced-catalog'
import { getBusinessProfile } from './business-profile'
import { assembleSignals } from './signals'
import type { PlanningContext, PlanRequest } from './types'

export async function assemblePlanningContext(
  clientId: string,
  request: PlanRequest,
): Promise<PlanningContext> {
  const [business, signals] = await Promise.all([
    getBusinessProfile(clientId),
    assembleSignals(clientId),
  ])
  // If the caller didn't pin a goal, fall back to the business's primary goal.
  const req: PlanRequest = { ...request, goalKey: request.goalKey ?? business.goalKey }
  return {
    business,
    request: req,
    signals,
    history: { pastLines: [], droppedServiceIds: [] }, // feedback loop: later stage
    catalog: PRICED_CATALOG,
  }
}

/**
 * A minimal, I/O-free context for the route's last-resort fallback. If assembly
 * itself throws (e.g. the admin env is missing), the route can still render a
 * deterministic rules diagnosis rather than a 500.
 */
export function fallbackPlanningContext(clientId: string, request: PlanRequest): PlanningContext {
  const goalKey = request.goalKey ?? 'new-customers'
  return {
    business: { id: clientId, name: 'Your restaurant', archetype: 'Restaurant', archetypeIcon: '🍽️', goal: 'Get more new customers', goalKey, has: [], peerSpend: 0 },
    request: { ...request, goalKey },
    signals: { reputation: { rating: null, ratingCount: null, themes: [] }, segments: [], presence: [] },
    history: { pastLines: [], droppedServiceIds: [] },
    catalog: PRICED_CATALOG,
  }
}
