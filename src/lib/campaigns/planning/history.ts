import 'server-only'
/**
 * The planner's feedback loop (Phase 3 learning hook). Reads the real campaign_outcomes
 * ledger and collapses it into PlanningHistory, which assemblePlanningContext feeds to
 * diagnose/select — so the planner sees what actually worked and stops re-proposing the
 * lines that measurably didn't. Replaces the hardcoded empty history (context.ts).
 *
 * Conservative by design: a service is only "dropped" with consistent evidence (>=2
 * readings, all 'drop', never 'working'), so a line is never condemned on thin data —
 * matching the verdict's bias-to-watch. Trajectory (the >=2 readings) fills in once the
 * daily poll runs; until then droppedServiceIds stays mostly empty and only the real
 * pastLines evidence flows, which is the safe default.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import type { PlanningHistory } from './types'
import { collapseHistory, type OutcomeRow } from './history-collapse'

/** Read the real outcome ledger for a client and collapse it into PlanningHistory.
 *  Never throws — a history read failure must not break planning. */
export async function getPlanningHistory(clientId: string): Promise<PlanningHistory> {
  if (!clientId) return { pastLines: [], droppedServiceIds: [] }
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('campaign_outcomes')
      .select('service_id, verdict, engagement_rate, has_data, as_of_date')
      .eq('client_id', clientId)
      .eq('scope', 'piece')
      .eq('has_data', true)
      .not('service_id', 'is', null)
      .order('as_of_date', { ascending: true })
      .limit(2000)
    return collapseHistory((data ?? []) as OutcomeRow[])
  } catch {
    return { pastLines: [], droppedServiceIds: [] }
  }
}
