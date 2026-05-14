'use server'

/**
 * Reads commerce_events into funnel summaries for the analytics
 * page. Counts each stage within a date range, returns the
 * stage-by-stage conversion rates.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'

export type CommerceKind = 'order' | 'reservation'
export type CommerceStage = 'started' | 'added' | 'submitted' | 'confirmed' | 'cancelled'

export interface FunnelStage {
  stage: CommerceStage
  count: number
  /* Percent of the previous stage that made it here. */
  conversionFromPrev: number | null
}

export interface CommerceFunnel {
  kind: CommerceKind
  totalRevenueCents: number      /* sum of confirmed orders */
  totalReservationsConfirmed: number
  partySizeAverage: number | null
  stages: FunnelStage[]
}

const ORDER_STAGES: CommerceStage[] = ['started', 'added', 'submitted', 'confirmed', 'cancelled']
const RESERVATION_STAGES: CommerceStage[] = ['started', 'added', 'submitted', 'confirmed', 'cancelled']

export async function getCommerceFunnel(
  kind: CommerceKind,
  startDate: string,
  endDate: string,
): Promise<CommerceFunnel | null> {
  const { clientId } = await resolveCurrentClient()
  if (!clientId) return null

  const admin = createAdminClient()
  const { data } = await admin
    .from('commerce_events')
    .select('stage, amount_cents, party_size, occurred_at')
    .eq('client_id', clientId)
    .eq('kind', kind)
    .gte('occurred_at', startDate + 'T00:00:00Z')
    .lte('occurred_at', endDate + 'T23:59:59Z')
  const rows = (data ?? []) as Array<{ stage: CommerceStage; amount_cents: number | null; party_size: number | null; occurred_at: string }>
  if (rows.length === 0) return null

  const stageCounts: Record<CommerceStage, number> = {
    started: 0, added: 0, submitted: 0, confirmed: 0, cancelled: 0,
  }
  let revenueCents = 0
  let partyTotal = 0
  let partyCount = 0
  for (const r of rows) {
    stageCounts[r.stage] = (stageCounts[r.stage] ?? 0) + 1
    if (r.stage === 'confirmed') {
      if (r.amount_cents != null) revenueCents += r.amount_cents
      if (r.party_size != null) { partyTotal += r.party_size; partyCount++ }
    }
  }

  const orderedStages = kind === 'order' ? ORDER_STAGES : RESERVATION_STAGES
  const stages: FunnelStage[] = []
  for (let i = 0; i < orderedStages.length; i++) {
    const s = orderedStages[i]
    if (s === 'cancelled') continue
    const count = stageCounts[s]
    const prev = i === 0 ? null : stageCounts[orderedStages[i - 1]]
    const conversionFromPrev = prev != null && prev > 0
      ? Math.round((count / prev) * 1000) / 10
      : null
    stages.push({ stage: s, count, conversionFromPrev })
  }
  /* Append cancelled as a side-stat. */
  stages.push({
    stage: 'cancelled',
    count: stageCounts.cancelled,
    conversionFromPrev: null,
  })

  return {
    kind,
    totalRevenueCents: revenueCents,
    totalReservationsConfirmed: stageCounts.confirmed,
    partySizeAverage: partyCount > 0 ? Math.round((partyTotal / partyCount) * 10) / 10 : null,
    stages,
  }
}
