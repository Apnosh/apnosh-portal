'use server'

/**
 * Builds the "what we're doing for each goal" explanation rows for the
 * dashboard (Phase B5). For each active goal, returns the recommended
 * service mix from the playbook crossed with the client's actually-
 * active services -- so the explanation reflects reality, not just the
 * theoretical playbook.
 *
 * Each explanation row: goal slug + display name + array of services
 * (active vs not active, primary/secondary/incidental). Used by
 * PlaybookExplanations component.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { getActiveClientGoals, getClientShape, getPlaybookForGoal } from '@/lib/goals/queries'
import type { GoalSlug, PlaybookEmphasis } from '@/lib/goals/types'

export interface PlaybookServiceLine {
  serviceSlug: string
  serviceName: string
  emphasis: PlaybookEmphasis
  isActive: boolean
  rationale: string | null
}

export interface PlaybookExplanation {
  goalSlug: GoalSlug
  goalDisplayName: string
  goalRationale: string
  shapeAware: boolean
  services: PlaybookServiceLine[]
}

const GOAL_DISPLAY: Record<GoalSlug, string> = {
  more_foot_traffic: 'More foot traffic',
  regulars_more_often: 'Regulars return more often',
  more_online_orders: 'More online orders',
  more_reservations: 'More reservations',
  better_reputation: 'Better reputation',
  be_known_for: 'Be known as the spot',
  fill_slow_times: 'Fill slow times',
  grow_catering: 'Grow catering',
}

const GOAL_RATIONALE: Record<GoalSlug, string> = {
  more_foot_traffic: 'Drives sales through volume.',
  regulars_more_often: 'Drives sales through frequency.',
  more_online_orders: 'Drives sales through digital channels.',
  more_reservations: 'Drives sales through booked covers.',
  better_reputation: 'Drives sales through trust.',
  be_known_for: 'Drives sales through branded demand.',
  fill_slow_times: 'Drives sales through better daypart utilization.',
  grow_catering: 'Drives sales through B2B and events.',
}

export async function getPlaybookExplanations(clientId: string): Promise<PlaybookExplanation[]> {
  const [goals, shape] = await Promise.all([
    getActiveClientGoals(clientId),
    getClientShape(clientId),
  ])
  if (goals.length === 0 || !shape) return []

  const admin = createAdminClient()
  const { data: clientServicesRows } = await admin
    .from('client_services')
    .select('service_slug, display_name')
    .eq('client_id', clientId)
    .eq('status', 'active')

  const activeServiceMap = new Map<string, string>()
  for (const r of clientServicesRows ?? []) {
    activeServiceMap.set(r.service_slug as string, (r.display_name as string) ?? humanize(r.service_slug as string))
  }

  const results: PlaybookExplanation[] = []
  for (const goal of goals) {
    const playbook = await getPlaybookForGoal(goal.goalSlug, shape)
    // Use the playbook to build the service list. Filter out 'avoid'
    // entries (those communicate "this won't help for your shape" and
    // we don't surface them as something we're doing).
    const services: PlaybookServiceLine[] = playbook
      .filter(p => p.emphasis !== 'avoid')
      .map(p => ({
        serviceSlug: p.serviceSlug,
        serviceName: activeServiceMap.get(p.serviceSlug) ?? humanize(p.serviceSlug),
        emphasis: p.emphasis,
        isActive: activeServiceMap.has(p.serviceSlug),
        rationale: p.notes,
      }))

    results.push({
      goalSlug: goal.goalSlug,
      goalDisplayName: GOAL_DISPLAY[goal.goalSlug],
      goalRationale: GOAL_RATIONALE[goal.goalSlug],
      shapeAware: playbook.some(p => p.footprintMatch || p.conceptMatch),
      services,
    })
  }
  return results
}

function humanize(slug: string): string {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}
