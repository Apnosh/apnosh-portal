/**
 * AI Marketing Plan Builder — Part 1 (Strategist / Diagnose) contracts.
 *
 * Maps the handoff spec's §2.6 PlanningContext and §3 Diagnosis onto this app's
 * existing domain types. We REUSE BusinessProfile / PricedService / GoalKey from
 * the campaign domain rather than copy the doc's shapes.
 *
 * Principle (spec §0): the LLM proposes (diagnoses); code disposes. Nothing in
 * Diagnosis carries a serviceId or a price — money only enters at Part 2 (Select).
 */
import type { BusinessProfile, GoalKey } from '@/lib/campaigns/types'
import type { PricedService } from '@/lib/campaigns/data/priced-catalog'

/**
 * The owner's ask for a plan. Named PlanRequest (not CampaignIntent) to avoid
 * colliding with the domain's CampaignIntent — a 4-value draft-kind union.
 * `budgetMonthly` is carried here but is NOT read by Diagnose: the diagnosis is
 * budget-independent (spec §3), so dragging the budget slider never re-diagnoses.
 */
export interface PlanRequest {
  intent: 'full-plan' | 'one-off' | 'ongoing' | 'single-item'
  budgetMonthly: number
  goalKey?: GoalKey
  occasion?: string
  targetDate?: string
  spec: Record<string, string>
}

/** Reputation signal — code computes the numbers; the model only interprets. */
export interface ReputationSignal {
  rating: number | null
  ratingCount: number | null
  /** review-volume change vs last month (count), when known */
  trend?: number
  /** what guests praise/gripe — the KEY signal */
  themes: { label: string; good: boolean; mentions: number }[]
}

/** A CRM/guest bucket (spec §2.3). Empty for most clients until a list sync feeds
 *  email_list_snapshot — we then assert nothing and never invent counts. */
export interface SegmentSignal { id: string; name: string; count: number; tone: 'good' | 'opportunity' | 'risk' }

/** Per-channel "are we found" (spec §2.3). completeness is 0-100. */
export interface PresenceSignal { name: string; completeness: number; gaps: string[] }

export interface PlanningSignals {
  reputation: ReputationSignal
  segments: SegmentSignal[]
  presence: PresenceSignal[]
  contentHistory?: { type: string; reach?: number }[]
}

/** Feedback loop — stubbed today (spec §2.6 history / Part 5). */
export interface PlanningHistory {
  pastLines: { serviceId: string; verdict: 'working' | 'watch' | 'drop'; metricDelta: number }[]
  droppedServiceIds: string[]
}

/** The assembled input the planner pipeline runs on (spec §2.6). */
export interface PlanningContext {
  business: BusinessProfile
  request: PlanRequest
  signals: PlanningSignals
  history: PlanningHistory
  catalog: PricedService[]
}

/**
 * The strategist's output (spec §3): a decision, not a paragraph. Carries NO
 * serviceId and NO price — the model never touches money. Requiring
 * bindingConstraint/bet/skip forces the model to commit instead of hedging.
 */
export interface Diagnosis {
  situation: string
  bindingConstraint: string
  bet: string
  skip: { what: string; why: string }[]
  evidence: string[]
  confidence: 'high' | 'medium' | 'low'
}

/** Diagnose result, tagged with where it came from (graceful-degradation rule). */
export interface DiagnoseResult {
  diagnosis: Diagnosis
  source: 'ai' | 'rules'
}
