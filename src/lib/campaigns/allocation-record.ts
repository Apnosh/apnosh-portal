import 'server-only'
/**
 * The allocation record (strategist-flow law 4): inputs → recommendation → final plan → outcome.
 *
 * WHY THIS EXISTS. The first cohort of real campaigns is the only training set this system will
 * ever have. Every learned weight, every "did our advice work" claim, and the whole disagreement
 * log (what the AI proposed vs what the owner shipped) read from here. Writing it is nearly free
 * at the moments it happens; skipping it is unrecoverable.
 *
 * TWO MOMENTS, ONE ROW:
 *  - COMPOSE (campaign create): the pre-edit plan and the signals the strategist saw, exactly as
 *    captured by the adapter when the plan was composed. This is the half that cannot be
 *    reconstructed later, because owner edits replace line items wholesale.
 *  - MINT (ship): the final items and producer choices as actually ordered.
 *
 * PROVENANCE IS NEVER LAUNDERED (owner revision 1): `signals_at` says when the signals snapshot
 * was taken. 'compose' only when the plan-mix snapshot genuinely rode the draft; a ship with no
 * capture gets a fresh fetch marked 'mint', and no reader can mistake one for the other.
 *
 * FIRE-AND-FORGET BY CONTRACT: an audit row may never break an order. Every failure lands as a
 * console.warn, not a thrown error — the same posture as the AI call log.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import type { CampaignDraft, LineItem, PieceProducer } from './types'

/** At create: persist the compose-time capture. No-op (with a warn) when the draft carries none —
 *  a draft composed before this feature shipped, or a path that never ran the adapter. */
export async function recordComposeAllocation(campaignId: string, clientId: string, draft: CampaignDraft): Promise<void> {
  try {
    const cap = draft.allocation
    if (!cap?.composed?.length) return
    const admin = createAdminClient()
    const { error } = await admin.from('plan_allocations').insert({
      campaign_id: campaignId,
      client_id: clientId,
      goal: draft.goalKey ?? draft.sourceCatalogId ?? 'unknown',
      route: cap.route,
      composed: cap.composed,
      // Provisional: the items at create. finalizeAllocation overwrites at ship with the truth.
      final_items: draft.items,
      choices: {},
      signals: cap.signals ?? {},
      signals_at: cap.signals ? 'compose' : 'mint',
    })
    if (error) console.warn('[allocation] compose record failed:', error.message)
  } catch (e) {
    console.warn('[allocation] compose record failed:', e instanceof Error ? e.message : e)
  }
}

/** At ship: stamp the finals onto the newest row, or write the whole record as a mint-time
 *  fallback when no compose capture exists. Empty compose-time signals get a fresh fetch here,
 *  already honestly marked 'mint' by the create step. */
export async function finalizeAllocation(opts: {
  campaignId: string
  clientId: string
  goal: string
  finalItems: LineItem[]
  choices: Record<string, PieceProducer>
}): Promise<void> {
  try {
    const admin = createAdminClient()
    const { data: rows } = await admin
      .from('plan_allocations')
      .select('id, signals, signals_at')
      .eq('campaign_id', opts.campaignId)
      .order('created_at', { ascending: false })
      .limit(1)
    const row = rows?.[0] as { id: string; signals: unknown; signals_at: string } | undefined

    // A mint-provenance row with empty signals means the capture never rode the draft: fetch now,
    // and the flag already says so.
    const needsSignals = !row || !row.signals || Object.keys(row.signals as object).length === 0
    let signals: unknown = row?.signals ?? {}
    if (needsSignals) {
      const { assembleBrainSignals } = await import('./brain/assemble-signals')
      signals = await assembleBrainSignals(opts.clientId).catch(() => ({}))
    }

    if (row) {
      const { error } = await admin
        .from('plan_allocations')
        .update({ final_items: opts.finalItems, choices: opts.choices, ...(needsSignals ? { signals } : {}) })
        .eq('id', row.id)
      if (error) console.warn('[allocation] finalize failed:', error.message)
    } else {
      const { error } = await admin.from('plan_allocations').insert({
        campaign_id: opts.campaignId,
        client_id: opts.clientId,
        goal: opts.goal,
        route: null,
        // No compose capture survived, so the pre-edit plan is honestly unknown: the finals stand
        // in for both halves and the provenance flag says the signals are mint-time.
        composed: opts.finalItems,
        final_items: opts.finalItems,
        choices: opts.choices,
        signals,
        signals_at: 'mint',
      })
      if (error) console.warn('[allocation] mint fallback failed:', error.message)
    }
  } catch (e) {
    console.warn('[allocation] finalize failed:', e instanceof Error ? e.message : e)
  }
}
