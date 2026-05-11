'use server'

/**
 * Builds GoalCardData[] for the dashboard's top-of-page goal cards.
 *
 * One card per active goal, in priority order. For each goal we attempt
 * to attach a real signal (value + delta) by mapping the goal to the
 * existing pulse data. Goals without a pulse mapping yet (catering,
 * slow times, reservations) get a 'no-data' state until we wire them
 * up in Phase B6/C.
 *
 * Also computes a one-line "what we're doing" by reading active services
 * tagged primary for each goal (from service_goal_tags).
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { getActiveClientGoals, getClientShape } from '@/lib/goals/queries'
import { getPulseData } from './get-pulse-data'
import { benchmarkLine, type BenchmarkSignal } from './benchmarks'
import type { GoalCardData } from '@/components/dashboard/goal-progress-cards'
import type { GoalSlug } from '@/lib/goals/types'

// What each goal currently maps to in our pulse data.
// Phase B6 will broaden this; for now we cover the goals our data layer
// already supports.
type SignalSource =
  | { kind: 'pulse_customers' }       // GBP actions
  | { kind: 'pulse_reach' }            // social reach
  | { kind: 'pulse_reputation' }       // avg star
  | { kind: 'unmapped' }

const GOAL_TO_SIGNAL: Record<GoalSlug, SignalSource> = {
  more_foot_traffic: { kind: 'pulse_customers' },
  better_reputation: { kind: 'pulse_reputation' },
  be_known_for: { kind: 'pulse_reach' },
  regulars_more_often: { kind: 'unmapped' },   // needs email/repeat metric
  more_online_orders: { kind: 'unmapped' },     // needs order data
  more_reservations: { kind: 'unmapped' },      // needs reservation data
  fill_slow_times: { kind: 'unmapped' },        // needs daypart data
  grow_catering: { kind: 'unmapped' },          // needs catering inquiry data
}

const GOAL_SIGNAL_LABEL: Record<GoalSlug, string> = {
  more_foot_traffic: 'Calls, directions, bookings',
  better_reputation: 'Avg star + new reviews',
  be_known_for: 'Reach across social',
  regulars_more_often: 'Repeat visit frequency',
  more_online_orders: 'Online + delivery orders',
  more_reservations: 'Booked covers',
  fill_slow_times: 'Slow-time daypart traffic',
  grow_catering: 'Catering inquiries',
}

const GOAL_HREF: Record<GoalSlug, string> = {
  more_foot_traffic: '/dashboard/local-seo',
  better_reputation: '/dashboard/local-seo/reviews',
  be_known_for: '/dashboard/social',
  regulars_more_often: '/dashboard/email-sms',
  more_online_orders: '/dashboard/website',
  more_reservations: '/dashboard/website',
  fill_slow_times: '/dashboard/email-sms',
  grow_catering: '/dashboard/website',
}

export async function getGoalCards(clientId: string): Promise<GoalCardData[]> {
  const [goals, pulse, shape] = await Promise.all([
    getActiveClientGoals(clientId),
    getPulseData(clientId),
    getClientShape(clientId),
  ])

  if (goals.length === 0) return []

  // Pull primary service tags for each active goal, in one query, to
  // compose the "what we're doing" line per goal.
  const admin = createAdminClient()
  const goalSlugs = goals.map(g => g.goalSlug)
  const { data: tags } = await admin
    .from('service_goal_tags')
    .select('service_slug, goal_slug, strength')
    .in('goal_slug', goalSlugs)
    .eq('strength', 'primary')

  // Cross-reference with the client's active services.
  const { data: clientServices } = await admin
    .from('client_services')
    .select('service_slug')
    .eq('client_id', clientId)
    .eq('status', 'active')

  const activeServiceSlugs = new Set((clientServices ?? []).map(s => s.service_slug as string))
  const primaryByGoal = new Map<string, string[]>()
  for (const t of tags ?? []) {
    const slug = t.service_slug as string
    if (!activeServiceSlugs.has(slug)) continue
    const arr = primaryByGoal.get(t.goal_slug as string) ?? []
    arr.push(slug)
    primaryByGoal.set(t.goal_slug as string, arr)
  }

  return goals.map(goal => {
    const signal = GOAL_TO_SIGNAL[goal.goalSlug]
    const primaryServices = primaryByGoal.get(goal.goalSlug) ?? []
    const whatWereDoing = primaryServices.length > 0
      ? `Working: ${primaryServices.map(humanize).join(', ')}`
      : undefined

    const benchSignal = goalToBenchmarkSignal(goal.goalSlug)

    if (signal.kind === 'unmapped') {
      return {
        slug: goal.goalSlug,
        priority: goal.priority,
        displayName: displayName(goal.goalSlug),
        state: 'no-data',
        signal: GOAL_SIGNAL_LABEL[goal.goalSlug],
        whatWereDoing,
        benchmarkLine: benchSignal && shape ? benchmarkLine(benchSignal, shape, null) : undefined,
        href: GOAL_HREF[goal.goalSlug],
        connectLabel: 'Talk to your strategist',
      } as GoalCardData
    }

    // Map to pulse data.
    const card =
      signal.kind === 'pulse_customers' ? pulse.customers :
      signal.kind === 'pulse_reach' ? pulse.reach :
      pulse.reputation

    // Best-effort numeric for benchmark comparison. Pulse cards expose
    // value as a formatted string ("1.2k"); we parse it for a rough
    // observed number. Good enough for the typical/below/above band.
    let observed: number | null = null
    if ('value' in card && typeof card.value === 'string') {
      observed = parseCompact(card.value)
    }

    return {
      slug: goal.goalSlug,
      priority: goal.priority,
      displayName: displayName(goal.goalSlug),
      state: card.state,
      value: 'value' in card ? card.value : undefined,
      delta: 'delta' in card ? card.delta : null,
      up: 'up' in card ? card.up : null,
      signal: GOAL_SIGNAL_LABEL[goal.goalSlug],
      whatWereDoing,
      benchmarkLine: benchSignal && shape ? benchmarkLine(benchSignal, shape, observed) : undefined,
      href: card.href ?? GOAL_HREF[goal.goalSlug],
      connectLabel: card.state === 'no-data' && 'connectLabel' in card ? card.connectLabel : undefined,
    } as GoalCardData
  })
}

function goalToBenchmarkSignal(slug: GoalSlug): BenchmarkSignal | null {
  switch (slug) {
    case 'more_foot_traffic': return 'gbp_actions'
    case 'better_reputation': return 'avg_rating'
    case 'be_known_for': return 'social_reach'
    default: return null
  }
}

function parseCompact(s: string): number | null {
  const m = s.match(/^([\d.]+)([kKmM]?)/)
  if (!m) return null
  const n = parseFloat(m[1])
  if (isNaN(n)) return null
  if (m[2] === 'k' || m[2] === 'K') return n * 1000
  if (m[2] === 'm' || m[2] === 'M') return n * 1_000_000
  return n
}

function displayName(slug: GoalSlug): string {
  const map: Record<GoalSlug, string> = {
    more_foot_traffic: 'More foot traffic',
    regulars_more_often: 'Regulars return',
    more_online_orders: 'More online orders',
    more_reservations: 'More reservations',
    better_reputation: 'Better reputation',
    be_known_for: 'Be known as the spot',
    fill_slow_times: 'Fill slow times',
    grow_catering: 'Grow catering',
  }
  return map[slug]
}

function humanize(slug: string): string {
  return slug
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}
