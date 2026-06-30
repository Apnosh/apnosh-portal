/**
 * PURE outcome → PlanningHistory collapse (no DB, no server-only), so it is unit-testable.
 * The server-only reader (history.ts) fetches the campaign_outcomes rows and calls this.
 *
 * Conservative by design: a service is only "dropped" with consistent evidence (>=2
 * readings, all 'drop', never 'working'), so a line is never condemned on thin data.
 */
import type { PlanningHistory } from './types'
import { PRICED_CATALOG } from '@/lib/campaigns/data/priced-catalog'

// Essential (table-stakes) services are NEVER dropped from a plan — they are foundations
// the plan needs regardless of one campaign's numbers. An underperforming foundation
// shows up as evidence (pastLines), not as a removal. Only growth lines can be dropped.
const ESSENTIAL_SERVICE_IDS = new Set(PRICED_CATALOG.filter((s) => s.essential).map((s) => s.id))

export interface OutcomeRow {
  service_id: string | null
  verdict: 'working' | 'watch' | 'drop' | null
  engagement_rate: number | null
  has_data: boolean
  as_of_date: string
}

// Turn an absolute engagement rate into a signed lift vs a benchmark for pastLines.metricDelta.
const ER_BENCHMARK = 0.03

export function collapseHistory(rows: OutcomeRow[]): PlanningHistory {
  interface Agg { latest: OutcomeRow; count: number; allDrop: boolean; everWorked: boolean }
  const byService = new Map<string, Agg>()
  for (const r of rows) {
    if (!r.has_data || !r.service_id || !r.verdict) continue
    const a = byService.get(r.service_id)
    if (!a) byService.set(r.service_id, { latest: r, count: 1, allDrop: r.verdict === 'drop', everWorked: r.verdict === 'working' })
    else {
      a.count++
      a.allDrop = a.allDrop && r.verdict === 'drop'
      a.everWorked = a.everWorked || r.verdict === 'working'
      if (r.as_of_date > a.latest.as_of_date) a.latest = r
    }
  }
  const pastLines: PlanningHistory['pastLines'] = []
  const droppedServiceIds: string[] = []
  for (const [serviceId, a] of byService) {
    const er = a.latest.engagement_rate ?? 0
    pastLines.push({ serviceId, verdict: a.latest.verdict as 'working' | 'watch' | 'drop', metricDelta: Math.round((er - ER_BENCHMARK) * 1000) / 1000 })
    if (a.count >= 2 && a.allDrop && !a.everWorked && !ESSENTIAL_SERVICE_IDS.has(serviceId)) droppedServiceIds.push(serviceId)
  }
  return { pastLines, droppedServiceIds }
}
