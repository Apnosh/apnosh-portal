/**
 * PURE outcome → PlanningHistory collapse (no DB, no server-only), so it is unit-testable.
 * The server-only reader (history.ts) fetches the campaign_outcomes rows and calls this.
 *
 * Conservative by design: a service is only "dropped" with consistent evidence (>=2
 * distinct pieces, all 'drop', never 'working'), so a line is never condemned on thin data.
 *
 * Two honesty rules keep the loop from mislearning once outcome data flows:
 * - Distinct pieces, not repeated polls: the daily poll re-snapshots the SAME piece each
 *   day, so readings are deduped to the latest per piece (content_draft_id) before any
 *   counting. Otherwise one weak post polled on two days would blocklist a whole service.
 * - 'watch' is neither a win nor a loss: the verdict is biased to watch on thin data, so
 *   counting watch pieces against a service would poison the measured win-rate. Only
 *   decisive pieces ('working' / 'drop') become pastLines — one line per piece — so the
 *   brain's measuredLiftFrom sees the true decisive-piece count per service as its n.
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
  /** The piece this reading measures (content_drafts.id) — the dedupe key across poll days. */
  content_draft_id: string | null
}

// Turn an absolute engagement rate into a signed lift vs a benchmark for pastLines.metricDelta.
const ER_BENCHMARK = 0.03

export function collapseHistory(rows: OutcomeRow[]): PlanningHistory {
  // Latest reading per distinct piece. The writer emits one row per piece per day, so a
  // piece's trajectory is many rows; only its most recent reading counts as evidence.
  // A row with no content_draft_id (the writer always sets one for scope='piece') keys
  // per service instead, so unkeyed re-polls still collapse to one piece, never many.
  const latestByPiece = new Map<string, OutcomeRow>()
  // "Never 'working'" spans ALL readings, superseded ones included — a service that ever
  // worked is never blocklisted, even if its pieces later decayed to 'drop'.
  const everWorked = new Set<string>()
  for (const r of rows) {
    if (!r.has_data || !r.service_id || !r.verdict) continue
    if (r.verdict === 'working') everWorked.add(r.service_id)
    const key = r.content_draft_id ?? `unkeyed:${r.service_id}`
    const prev = latestByPiece.get(key)
    if (!prev || r.as_of_date > prev.as_of_date) latestByPiece.set(key, r)
  }

  const piecesByService = new Map<string, OutcomeRow[]>()
  for (const piece of latestByPiece.values()) {
    const serviceId = piece.service_id as string
    const list = piecesByService.get(serviceId)
    if (list) list.push(piece)
    else piecesByService.set(serviceId, [piece])
  }

  const pastLines: PlanningHistory['pastLines'] = []
  const droppedServiceIds: string[] = []
  for (const [serviceId, pieces] of piecesByService) {
    // One evidence line per DECISIVE piece; a 'watch' piece is still gathering, so it
    // must not count for or against the service.
    for (const p of pieces) {
      if (p.verdict === 'watch') continue
      const er = p.engagement_rate ?? 0
      pastLines.push({ serviceId, verdict: p.verdict as 'working' | 'drop', metricDelta: Math.round((er - ER_BENCHMARK) * 1000) / 1000 })
    }
    // The blocklist gate counts distinct pieces: >=2 pieces, every one 'drop' (a 'watch'
    // piece blocks it), no 'working' reading ever, and never an essential foundation.
    const allDrop = pieces.every((p) => p.verdict === 'drop')
    if (pieces.length >= 2 && allDrop && !everWorked.has(serviceId) && !ESSENTIAL_SERVICE_IDS.has(serviceId)) droppedServiceIds.push(serviceId)
  }
  return { pastLines, droppedServiceIds }
}
