'use server'

/**
 * Server-side reads for the goal layer. Per migration 092.
 *
 * Strategist console, client dashboard, and onboarding all read from
 * here. Writes (set goal, update priority, achieve goal) live in
 * mutations.ts (next).
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type {
  CatalogGoal,
  ClientGoal,
  GoalSlug,
  PlaybookEntry,
  RestaurantShape,
  ServiceGoalTag,
} from './types'

// ─────────────────────────────────────────────────────────────────
// Catalog
// ─────────────────────────────────────────────────────────────────

interface CatalogRow {
  slug: string
  display_name: string
  owner_voice: string
  rationale: string
  primary_signal: string | null
  primary_lever: string | null
  sort_order: number
  is_active: boolean
}

export async function getGoalsCatalog(): Promise<CatalogGoal[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('goals_catalog')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (error) throw new Error(error.message)
  return ((data ?? []) as CatalogRow[]).map(r => ({
    slug: r.slug as GoalSlug,
    displayName: r.display_name,
    ownerVoice: r.owner_voice,
    rationale: r.rationale,
    primarySignal: r.primary_signal,
    primaryLever: r.primary_lever,
    sortOrder: r.sort_order,
    isActive: r.is_active,
  }))
}

// ─────────────────────────────────────────────────────────────────
// Client shape
// ─────────────────────────────────────────────────────────────────

interface ShapeRow {
  shape_footprint: string | null
  shape_concept: string | null
  shape_customer_mix: string | null
  shape_digital_maturity: string | null
  shape_captured_at: string | null
  shape_captured_by: string | null
}

export async function getClientShape(clientId: string): Promise<RestaurantShape | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('clients')
    .select('shape_footprint, shape_concept, shape_customer_mix, shape_digital_maturity, shape_captured_at, shape_captured_by')
    .eq('id', clientId)
    .maybeSingle<ShapeRow>()

  if (error) throw new Error(error.message)
  if (!data) return null
  return {
    footprint: (data.shape_footprint as RestaurantShape['footprint']) ?? null,
    concept: (data.shape_concept as RestaurantShape['concept']) ?? null,
    customerMix: (data.shape_customer_mix as RestaurantShape['customerMix']) ?? null,
    digitalMaturity: (data.shape_digital_maturity as RestaurantShape['digitalMaturity']) ?? null,
    capturedAt: data.shape_captured_at,
    capturedBy: data.shape_captured_by,
  }
}

// ─────────────────────────────────────────────────────────────────
// Active goals for a client
// ─────────────────────────────────────────────────────────────────

interface GoalRow {
  id: string
  client_id: string
  goal_slug: string
  priority: number
  target_date: string | null
  status: string
  notes: string | null
  set_by: string | null
  started_at: string
  ended_at: string | null
  created_at: string
  updated_at: string
}

function rowToGoal(r: GoalRow): ClientGoal {
  return {
    id: r.id,
    clientId: r.client_id,
    goalSlug: r.goal_slug as GoalSlug,
    priority: r.priority as 1 | 2 | 3,
    targetDate: r.target_date,
    status: r.status as ClientGoal['status'],
    notes: r.notes,
    setBy: r.set_by,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export async function getActiveClientGoals(clientId: string): Promise<ClientGoal[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('client_goals')
    .select('*')
    .eq('client_id', clientId)
    .eq('status', 'active')
    .order('priority', { ascending: true })

  if (error) throw new Error(error.message)
  return ((data ?? []) as GoalRow[]).map(rowToGoal)
}

export async function getClientGoalHistory(clientId: string): Promise<ClientGoal[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('client_goals')
    .select('*')
    .eq('client_id', clientId)
    .order('started_at', { ascending: false })

  if (error) throw new Error(error.message)
  return ((data ?? []) as GoalRow[]).map(rowToGoal)
}

// ─────────────────────────────────────────────────────────────────
// Playbook resolution
// ─────────────────────────────────────────────────────────────────

interface PlaybookRow {
  id: string
  goal_slug: string
  footprint_match: string[] | null
  concept_match: string[] | null
  customer_mix_match: string[] | null
  digital_maturity_match: string[] | null
  service_slug: string
  emphasis: string
  notes: string | null
  sort_order: number
}

function rowToPlaybook(r: PlaybookRow): PlaybookEntry {
  return {
    id: r.id,
    goalSlug: r.goal_slug as GoalSlug,
    footprintMatch: r.footprint_match as PlaybookEntry['footprintMatch'],
    conceptMatch: r.concept_match as PlaybookEntry['conceptMatch'],
    customerMixMatch: r.customer_mix_match as PlaybookEntry['customerMixMatch'],
    digitalMaturityMatch: r.digital_maturity_match as PlaybookEntry['digitalMaturityMatch'],
    serviceSlug: r.service_slug,
    emphasis: r.emphasis as PlaybookEntry['emphasis'],
    notes: r.notes,
    sortOrder: r.sort_order,
  }
}

/** Returns playbook entries that apply to the given goal + shape combination. */
export async function getPlaybookForGoal(
  goalSlug: GoalSlug,
  shape: RestaurantShape
): Promise<PlaybookEntry[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('goal_playbooks')
    .select('*')
    .eq('goal_slug', goalSlug)
    .order('sort_order', { ascending: true })

  if (error) throw new Error(error.message)
  const all = ((data ?? []) as PlaybookRow[]).map(rowToPlaybook)

  // Filter to entries whose shape modifiers match this client's shape.
  // A null match-array means "applies to all values" for that dimension.
  return all.filter(p => {
    if (p.footprintMatch && shape.footprint && !p.footprintMatch.includes(shape.footprint)) return false
    if (p.conceptMatch && shape.concept && !p.conceptMatch.includes(shape.concept)) return false
    if (p.customerMixMatch && shape.customerMix && !p.customerMixMatch.includes(shape.customerMix)) return false
    if (p.digitalMaturityMatch && shape.digitalMaturity && !p.digitalMaturityMatch.includes(shape.digitalMaturity)) return false
    return true
  })
}

/**
 * Resolve the recommended service mix for a client given their active
 * goals + shape. Combines playbooks across all active goals, weighted
 * by priority (P1 = 50%, P2 = 30%, P3 = 20%).
 *
 * Returns a Map of service_slug -> aggregate emphasis score.
 * Higher score = more emphasis. 'avoid' contributions cap the score.
 */
export interface ServiceRecommendation {
  serviceSlug: string
  score: number          // 0-100, weighted by goal priority + emphasis
  contributingGoals: GoalSlug[]
  hasAvoid: boolean      // true if any goal said 'avoid' for this service
}

const PRIORITY_WEIGHT: Record<1 | 2 | 3, number> = { 1: 0.5, 2: 0.3, 3: 0.2 }
const EMPHASIS_WEIGHT: Record<string, number> = {
  high: 100,
  medium: 60,
  low: 25,
  avoid: -100,
}

export async function recommendServices(
  clientId: string
): Promise<ServiceRecommendation[]> {
  const [shape, goals] = await Promise.all([
    getClientShape(clientId),
    getActiveClientGoals(clientId),
  ])

  if (!shape || goals.length === 0) return []

  const accum = new Map<string, ServiceRecommendation>()

  for (const goal of goals) {
    const playbook = await getPlaybookForGoal(goal.goalSlug, shape)
    const priorityWeight = PRIORITY_WEIGHT[goal.priority]
    for (const entry of playbook) {
      const cur = accum.get(entry.serviceSlug) ?? {
        serviceSlug: entry.serviceSlug,
        score: 0,
        contributingGoals: [],
        hasAvoid: false,
      }
      cur.score += priorityWeight * EMPHASIS_WEIGHT[entry.emphasis]
      if (!cur.contributingGoals.includes(goal.goalSlug)) {
        cur.contributingGoals.push(goal.goalSlug)
      }
      if (entry.emphasis === 'avoid') cur.hasAvoid = true
      accum.set(entry.serviceSlug, cur)
    }
  }

  return Array.from(accum.values()).sort((a, b) => b.score - a.score)
}

// ─────────────────────────────────────────────────────────────────
// Service goal tags
// ─────────────────────────────────────────────────────────────────

export async function getServiceGoalTags(): Promise<ServiceGoalTag[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('service_goal_tags')
    .select('service_slug, goal_slug, strength')

  if (error) throw new Error(error.message)
  return (data ?? []).map(r => ({
    serviceSlug: r.service_slug as string,
    goalSlug: r.goal_slug as GoalSlug,
    strength: r.strength as ServiceGoalTag['strength'],
  }))
}
