import 'server-only'
/**
 * The planner's feedback loop (Phase 3 learning hook). Reads the real campaign_outcomes
 * ledger and collapses it into PlanningHistory, which assemblePlanningContext feeds to
 * diagnose/select — so the planner sees what actually worked and stops re-proposing the
 * lines that measurably didn't. Replaces the hardcoded empty history (context.ts).
 *
 * Conservative by design: a service is only "dropped" with consistent evidence (>=2
 * distinct pieces, all 'drop', never 'working'), so a line is never condemned on thin
 * data — matching the verdict's bias-to-watch. The daily poll re-reads the SAME pieces,
 * so the collapse dedupes to the latest reading per piece; until a second piece ships,
 * droppedServiceIds stays mostly empty and only the real pastLines evidence flows,
 * which is the safe default.
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
      .select('service_id, verdict, engagement_rate, has_data, as_of_date, content_draft_id')
      .eq('client_id', clientId)
      .eq('scope', 'piece')
      .eq('has_data', true)
      .not('service_id', 'is', null)
      // Newest first: the row cap must shed the OLDEST poll snapshots, never a piece's
      // latest reading. The collapse keys on max as_of_date, so order is otherwise free.
      .order('as_of_date', { ascending: false })
      .limit(2000)
    return collapseHistory((data ?? []) as OutcomeRow[])
  } catch {
    return { pastLines: [], droppedServiceIds: [] }
  }
}
