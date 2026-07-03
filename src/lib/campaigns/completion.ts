import 'server-only'
/**
 * Campaign completion — the wrap-up moment that never existed.
 *
 * A shipped campaign whose every piece reached its terminal state (live >= total,
 * the same predicate as the card's "Done" phase) previously just... sat there.
 * Nothing marked completion and nobody told the owner. This sweep (piggybacked on
 * the daily outcomes-poll cron, after fresh outcome snapshots land):
 *
 *   1. finds completed campaigns that haven't been wrapped,
 *   2. claims each race-proof (guarded update on execution.wrapUpSentAt — the
 *      ship one-shot pattern; the jsonb key is owner-forgery-proof because the
 *      owner PATCH whitelist drops unknown execution keys),
 *   3. writes a short wrap-up letter grounded STRICTLY in real data — the
 *      campaign's outcome readouts and its charge ledger. Pieces still gathering
 *      say so; numbers are never invented. AI phrases it; a deterministic
 *      fallback says the same facts plainer.
 *   4. notifies the owner (kind 'campaign_wrapped', visible in the inbox wins lane).
 *
 * DIY campaigns are excluded (no production spine). Services-only campaigns
 * complete too now that finite service work orders count in progress (delivered
 * with proof = live); campaigns whose services are ALL recurring-class stay
 * total=0 and never wrap — a monthly program has no finish line.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { getCampaignProgressBatch } from './server'
import { getCampaignOutcomes } from './outcomes/read'
import { getCampaignCharges } from './work-orders'
import { callStructuredOutput } from './planning/anthropic'
import { notifyClientOwners } from '@/lib/notifications'

/** Each wrap-up is one model call; keep a tick small — the rest wrap tomorrow. */
const MAX_PER_TICK = 5

interface Letter { title: string; body: string }

const LETTER_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Short, warm, factual. e.g. "Your slow-nights campaign wrapped". No exclamation marks.' },
    body: {
      type: 'string',
      description: '2-4 short sentences. Plain words a busy owner reads in ten seconds. State what went out, what the results show so far (or that results are still coming in), and what was billed. ONLY the facts given — never invent numbers.',
    },
  },
  required: ['title', 'body'],
  additionalProperties: false,
} as const

const LETTER_SYSTEM = [
  'You write a short wrap-up note to a restaurant owner whose marketing campaign just finished.',
  'Use ONLY the facts provided. Never invent numbers, links, or claims.',
  'If pieces are marked still gathering, say results are still coming in — do not guess.',
  'Warm, plain, confident. No marketing jargon. No exclamation marks.',
].join(' ')

export interface CompletionSweep { checked: number; completed: number; notified: number }

export async function sweepCampaignCompletions(): Promise<CompletionSweep> {
  const admin = createAdminClient()
  const { data: rows, error } = await admin
    .from('campaigns')
    .select('id, client_id, name, path, execution')
    .eq('status', 'shipped')
    .filter('execution->>wrapUpSentAt', 'is', null)
  if (error || !rows || rows.length === 0) return { checked: 0, completed: 0, notified: 0 }

  const candidates = rows.filter((r) => r.path !== 'diy')
  if (!candidates.length) return { checked: 0, completed: 0, notified: 0 }
  const progress = await getCampaignProgressBatch(candidates.map((r) => r.id as string))

  let completed = 0
  let notified = 0
  for (const r of candidates) {
    if (completed >= MAX_PER_TICK) break
    const p = progress[r.id as string]
    // Done = every non-dropped piece is live (shippedStatus's predicate). total=0
    // (services-only) can never complete — excluded, not stalled.
    if (!p || p.total <= 0 || p.live < p.total) continue

    // Race-proof claim: only one sweep wins the stamp; a lost claim just skips.
    const nowIso = new Date().toISOString()
    const exec = (r.execution && typeof r.execution === 'object' ? r.execution : {}) as Record<string, unknown>
    const { data: claimed } = await admin
      .from('campaigns')
      .update({ execution: { ...exec, wrapUpSentAt: nowIso }, updated_at: nowIso })
      .eq('id', r.id)
      .filter('execution->>wrapUpSentAt', 'is', null)
      .select('id')
      .maybeSingle()
    if (!claimed) continue
    completed++

    const name = (r.name as string) || 'Your campaign'
    const letter = await composeWrapUpLetter(r.id as string, name).catch(() => null)
    const res = await notifyClientOwners(r.client_id as string, {
      kind: 'campaign_wrapped',
      title: letter?.title ?? `${name} wrapped`,
      body: letter?.body ?? 'Every piece went out. Open the campaign to see the full results.',
      link: `/dashboard/campaigns/${r.id}`,
    }).catch(() => ({ notified: 0 }))
    if (res.notified > 0) notified++
  }
  return { checked: candidates.length, completed, notified }
}

/** Grounded letter: outcomes readouts + delivered services + the charge ledger,
 *  AI-phrased with a deterministic same-facts fallback. Honest by construction. */
async function composeWrapUpLetter(campaignId: string, name: string): Promise<Letter> {
  const admin = createAdminClient()
  const [outcomes, charges, swoRes] = await Promise.all([
    getCampaignOutcomes(campaignId).catch(() => null),
    getCampaignCharges(campaignId).catch(() => null),
    admin.from('service_work_orders').select('title, status').eq('campaign_id', campaignId).eq('status', 'delivered'),
  ])
  const pieces = (outcomes?.pieces ?? []).map((p) => ({
    piece: p.label ?? 'a piece',
    result: p.readout.gathering ? 'still gathering' : (p.readout.value || p.readout.plain || 'posted'),
  }))
  // First-party link taps across the campaign's tracked links (null pieces contribute 0).
  const totalClicks = (outcomes?.pieces ?? []).reduce((n, p) => n + (p.clicks ?? 0), 0)
  const servicesDone = ((swoRes.data ?? []) as { title: string | null }[]).map((s) => s.title).filter((t): t is string => !!t)
  const gatheringCount = pieces.filter((p) => p.result === 'still gathering').length
  const rollupPlain = outcomes && !outcomes.rollup.gathering ? outcomes.rollup.plain : null
  const billedCents = charges?.accruedCents ?? 0
  const billed = billedCents > 0 ? `$${Math.round(billedCents / 100)}` : null

  // Deterministic fallback — the same facts, plainer.
  const parts: string[] = [pieces.length > 0 ? `Every piece of ${name} went out.` : `Everything in ${name} is done.`]
  if (servicesDone.length > 0) parts.push(`Finished for you: ${servicesDone.slice(0, 3).join(', ')}${servicesDone.length > 3 ? ` and ${servicesDone.length - 3} more` : ''}.`)
  if (rollupPlain) parts.push(rollupPlain)
  else if (gatheringCount > 0) parts.push('Results are still coming in. Numbers land over the next days.')
  if (totalClicks > 0) parts.push(`People tapped your links ${totalClicks} time${totalClicks === 1 ? '' : 's'}.`)
  if (billed) parts.push(`Billed for this campaign so far: ${billed}.`)
  parts.push('Open the campaign for the full breakdown.')
  const fallback: Letter = { title: `${name} wrapped`, body: parts.join(' ') }

  const ai = await callStructuredOutput<Letter>({
    system: LETTER_SYSTEM,
    user: JSON.stringify({ campaignName: name, pieces, servicesFinished: servicesDone, linkTaps: totalClicks > 0 ? totalClicks : null, overallSoFar: rollupPlain ?? 'still gathering', billedSoFar: billed ?? 'nothing billed yet' }),
    schema: LETTER_SCHEMA as unknown as object,
    maxTokens: 400,
  })
  return ai?.title && ai.body ? { title: ai.title.slice(0, 120), body: ai.body.slice(0, 600) } : fallback
}
