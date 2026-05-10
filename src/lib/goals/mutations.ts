'use server'

/**
 * Server-side writes for the goal layer (migration 092).
 *
 * Used by:
 * - Onboarding (capture initial shape + goals)
 * - Quarterly review flow (update goals)
 * - Strategist console (set/edit goals on behalf of clients)
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { logEvent } from '@/lib/events/log'
import type {
  ClientGoal,
  GoalSlug,
  RestaurantShape,
  Footprint,
  Concept,
  CustomerMix,
  DigitalMaturity,
} from './types'

// ─────────────────────────────────────────────────────────────────
// Shape capture
// ─────────────────────────────────────────────────────────────────

export interface SetShapeInput {
  clientId: string
  footprint: Footprint
  concept: Concept
  customerMix: CustomerMix
  digitalMaturity: DigitalMaturity
  capturedBy?: string | null              // team_members.id
  actorAuthId?: string | null             // auth.users.id for events
}

export async function setClientShape(
  input: SetShapeInput
): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient()
  const now = new Date().toISOString()

  const { error } = await admin
    .from('clients')
    .update({
      shape_footprint: input.footprint,
      shape_concept: input.concept,
      shape_customer_mix: input.customerMix,
      shape_digital_maturity: input.digitalMaturity,
      shape_captured_at: now,
      shape_captured_by: input.capturedBy ?? null,
    })
    .eq('id', input.clientId)

  if (error) return { ok: false, error: error.message }

  await logEvent({
    clientId: input.clientId,
    eventType: 'shape.captured',
    subjectType: 'client',
    subjectId: input.clientId,
    actorId: input.actorAuthId ?? null,
    actorRole: 'strategist',
    payload: {
      footprint: input.footprint,
      concept: input.concept,
      customerMix: input.customerMix,
      digitalMaturity: input.digitalMaturity,
    },
    summary: `Restaurant shape captured: ${input.footprint} / ${input.concept}`,
  })

  return { ok: true }
}

// ─────────────────────────────────────────────────────────────────
// Goal management
// ─────────────────────────────────────────────────────────────────

export interface SetGoalInput {
  clientId: string
  goalSlug: GoalSlug
  priority: 1 | 2 | 3
  targetDate?: string | null
  notes?: string | null
  setBy?: string | null
  actorAuthId?: string | null
}

/**
 * Set or replace an active goal at a priority slot.
 * If a goal already exists at this priority for this client, it gets
 * superseded. Up to 3 active goals (enforced by unique index).
 */
export async function setClientGoal(
  input: SetGoalInput
): Promise<{ ok: boolean; goal?: ClientGoal; error?: string }> {
  const admin = createAdminClient()

  // Supersede any existing active goal at this priority.
  await admin
    .from('client_goals')
    .update({ status: 'superseded', ended_at: new Date().toISOString() })
    .eq('client_id', input.clientId)
    .eq('priority', input.priority)
    .eq('status', 'active')

  const { data, error } = await admin
    .from('client_goals')
    .insert({
      client_id: input.clientId,
      goal_slug: input.goalSlug,
      priority: input.priority,
      target_date: input.targetDate ?? null,
      status: 'active',
      notes: input.notes ?? null,
      set_by: input.setBy ?? null,
    })
    .select('*')
    .single()

  if (error) return { ok: false, error: error.message }

  await logEvent({
    clientId: input.clientId,
    eventType: 'goal.set',
    subjectType: 'client_goal',
    subjectId: data.id as string,
    actorId: input.actorAuthId ?? null,
    actorRole: 'strategist',
    payload: {
      goalSlug: input.goalSlug,
      priority: input.priority,
      targetDate: input.targetDate,
    },
    summary: `Goal P${input.priority} set: ${input.goalSlug}`,
  })

  return { ok: true, goal: rowToGoal(data) }
}

/**
 * Mark a goal as achieved or abandoned. Owner-driven via Q-review.
 */
export async function closeGoal(args: {
  goalId: string
  outcome: 'achieved' | 'abandoned'
  actorAuthId?: string | null
}): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient()

  const { data: goal } = await admin
    .from('client_goals')
    .select('client_id, goal_slug, priority')
    .eq('id', args.goalId)
    .maybeSingle()
  if (!goal) return { ok: false, error: 'Goal not found' }

  const { error } = await admin
    .from('client_goals')
    .update({ status: args.outcome, ended_at: new Date().toISOString() })
    .eq('id', args.goalId)
  if (error) return { ok: false, error: error.message }

  await logEvent({
    clientId: goal.client_id as string,
    eventType: `goal.${args.outcome}`,
    subjectType: 'client_goal',
    subjectId: args.goalId,
    actorId: args.actorAuthId ?? null,
    actorRole: 'strategist',
    payload: { goalSlug: goal.goal_slug, priority: goal.priority },
    summary: `Goal P${goal.priority} ${args.outcome}: ${goal.goal_slug}`,
  })

  return { ok: true }
}

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

// ─────────────────────────────────────────────────────────────────
// Smart defaults — for owners who can't articulate goals at onboarding
// ─────────────────────────────────────────────────────────────────

/**
 * Returns 3 default goals for a given shape, per docs/PRODUCT-SPEC.md
 * default-goals matrix. Owner can override during onboarding.
 */
export function defaultGoalsForShape(shape: {
  footprint: Footprint | null
  concept: Concept | null
}): GoalSlug[] {
  const { footprint, concept } = shape

  if (footprint === 'ghost' || concept === 'delivery_only') {
    return ['more_online_orders', 'better_reputation', 'fill_slow_times']
  }
  if (footprint === 'mobile' || concept === 'mobile') {
    return ['be_known_for', 'more_foot_traffic', 'more_online_orders']
  }
  if (concept === 'fine_dining') {
    return ['better_reputation', 'more_reservations', 'be_known_for']
  }
  if (footprint === 'multi_local' || footprint === 'multi_regional') {
    return ['more_foot_traffic', 'better_reputation', 'be_known_for']
  }
  if (concept === 'qsr' || concept === 'fast_casual') {
    return ['more_foot_traffic', 'regulars_more_often', 'better_reputation']
  }
  if (concept === 'catering_heavy') {
    return ['grow_catering', 'better_reputation', 'be_known_for']
  }
  // Default: single-neighborhood casual / cafe / bar
  return ['more_foot_traffic', 'regulars_more_often', 'better_reputation']
}
