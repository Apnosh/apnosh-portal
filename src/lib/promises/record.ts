import 'server-only'
/**
 * promises/record — write the promise WHEN THE ORDER MINTS.
 *
 * Called from the campaign ship block (paid and free converge there) and from the desk order
 * route. Best-effort and idempotent (unique on campaign+service+metric / request+metric): a
 * re-ship never double-writes, and a failure here never blocks an order. Pre-migration-253 the
 * insert fails with 42P01 and is swallowed; the order still stands.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import type { SavedCampaign } from '@/lib/campaigns/view'
import { PROMISE_BY_CARD, PROMISE_BY_REQUEST_TYPE, type PromiseSpec } from './registry'
import { baseline, shiftDays } from './metrics'
import { specsForService } from './registry'

interface Row {
  client_id: string
  campaign_id: string | null
  creative_request_id: string | null
  service_id: string | null
  catalog_id: string | null
  label: string
  metric_key: string
  metric_label: string
  taken_by: string
  state: string
  reason: string | null
  ordered_on: string
  start_on: string | null
  count_from: string
  shows_on: string
  baseline_value: number | null
  baseline_days: number | null
}

async function build(clientId: string, spec: PromiseSpec, label: string, orderedOn: string, startOn: string | null, ids: { campaignId?: string | null; requestId?: string | null; serviceId?: string | null; catalogId?: string | null }): Promise<Row> {
  const anchor = startOn ?? orderedOn
  const countFrom = shiftDays(anchor, spec.lagDays)
  const showsOn = shiftDays(countFrom, spec.windowDays)
  const held = !!startOn && startOn > orderedOn
  const state = spec.notCountedReason ? 'not_counted' : held ? 'held' : 'counting'
  let bv: number | null = null, bd: number | null = null
  if (!spec.notCountedReason && spec.metric !== 'delivered_files') {
    try { const b = await baseline(clientId, spec.metric, countFrom, 30); bv = b.value; bd = b.reportedDays } catch { /* no baseline is honest: the row says "first count" */ }
  }
  return {
    client_id: clientId,
    campaign_id: ids.campaignId ?? null,
    creative_request_id: ids.requestId ?? null,
    service_id: ids.serviceId ?? null,
    catalog_id: ids.catalogId ?? null,
    label,
    metric_key: spec.metric,
    metric_label: spec.label,
    taken_by: spec.takenBy,
    state,
    reason: spec.notCountedReason ?? null,
    ordered_on: orderedOn,
    start_on: startOn,
    count_from: countFrom,
    shows_on: showsOn,
    baseline_value: bv,
    baseline_days: bd,
  }
}

/** Every included, non-opted-out line becomes its promise rows; a plan with no matching line
 *  falls back to the store card it came from. Returns the number of rows written. */
export async function recordCampaignPromises(campaign: SavedCampaign, campaignId: string, shipISO: string, opts: { heldFrom?: string | null } = {}): Promise<number> {
  const orderedOn = shipISO.slice(0, 10)
  // HELD is decided by the caller: the ship block knows whether the owner picked a date and when
  // the first piece lands. The estimate-mode anchor it stamps onto target_date is a first-post
  // date, not a hold, so target_date is never read here.
  const startOn = opts.heldFrom && opts.heldFrom > orderedOn ? opts.heldFrom : null
  const rows: Row[] = []
  const seen = new Set<string>()
  const items = (campaign.draft.items ?? []).filter((it) => it.included && !it.optOut)
  for (const it of items) {
    for (const spec of specsForService(it.serviceId)) {
      const key = `${it.serviceId}:${spec.metric}`
      if (seen.has(key)) continue
      seen.add(key)
      rows.push(await build(campaign.clientId, spec, it.plain || it.name || campaign.draft.name, orderedOn, startOn, { campaignId, serviceId: it.serviceId, catalogId: campaign.draft.sourceCatalogId ?? null }))
    }
  }
  if (!rows.length) {
    const cardId = campaign.draft.sourceCatalogId ?? null
    for (const spec of (cardId ? PROMISE_BY_CARD[cardId] : undefined) ?? []) {
      rows.push(await build(campaign.clientId, spec, campaign.draft.name, orderedOn, startOn, { campaignId, serviceId: null, catalogId: cardId }))
    }
  }
  if (!rows.length) return 0
  const { error } = await createAdminClient().from('order_promises').upsert(rows, { onConflict: 'campaign_id,service_id,metric_key', ignoreDuplicates: true })
  if (error) { console.warn('[promises] campaign write skipped:', error.message); return 0 }
  return rows.length
}

/** A creative desk order has no campaign row: anchor on the request id. */
export async function recordRequestPromise(args: { clientId: string; requestId: string; type: string; label: string; orderedISO?: string }): Promise<number> {
  const specs = PROMISE_BY_REQUEST_TYPE[args.type] ?? []
  if (!specs.length) return 0
  const orderedOn = (args.orderedISO ?? new Date().toISOString()).slice(0, 10)
  const rows: Row[] = []
  for (const spec of specs) rows.push(await build(args.clientId, spec, args.label, orderedOn, null, { requestId: args.requestId, serviceId: `request:${args.type}`, catalogId: `creative-${args.type}` }))
  const { error } = await createAdminClient().from('order_promises').upsert(rows, { onConflict: 'creative_request_id,metric_key', ignoreDuplicates: true })
  if (error) { console.warn('[promises] request write skipped:', error.message); return 0 }
  return rows.length
}

/** When a service work order is delivered, move the count window to start from delivery (plus the
 *  source lag) and recompute the baseline against the days before it. A promise that is already
 *  counting from a later date, or is held/not counted, is left alone. */
export async function reanchorPromise(args: { campaignId: string | null; serviceId: string | null; deliveredISO: string }): Promise<void> {
  if (!args.campaignId || !args.serviceId) return
  const a = createAdminClient()
  const { data } = await a.from('order_promises').select('id, client_id, metric_key, count_from, state').eq('campaign_id', args.campaignId).eq('service_id', args.serviceId)
  const deliveredOn = args.deliveredISO.slice(0, 10)
  for (const row of (data ?? []) as { id: string; client_id: string; metric_key: string; count_from: string; state: string }[]) {
    if (row.state === 'not_counted' || row.state === 'held') continue
    const spec = specsForService(args.serviceId).find((sp) => sp.metric === row.metric_key)
    if (!spec || spec.metric === 'delivered_files') continue
    const countFrom = shiftDays(deliveredOn, spec.lagDays)
    if (countFrom <= row.count_from) continue
    let bv: number | null = null, bd: number | null = null
    try { const b = await baseline(row.client_id, spec.metric, countFrom, 30); bv = b.value; bd = b.reportedDays } catch { /* keep the mint baseline */ }
    await a.from('order_promises').update({ count_from: countFrom, shows_on: shiftDays(countFrom, spec.windowDays), baseline_value: bv, baseline_days: bd, updated_at: new Date().toISOString() }).eq('id', row.id)
  }
}
