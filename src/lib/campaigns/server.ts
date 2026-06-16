/**
 * Campaign persistence — maps the ported System-B domain types
 * (CampaignDraft / LineItem / CampaignBrief) to the Supabase tables from
 * migration 166, and provides CRUD. Server-only (uses the admin client).
 *
 * The pure money/plan/compose logic stays in the sibling pure modules; this
 * file is only the storage boundary.
 */

import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { CampaignDraft, LineItem, CampaignBrief, BillingCadence } from './types'
import type { StageId } from './stages'
import type { SavedCampaign } from './view'

export type { SavedCampaign } from './view'

// ── row → domain ─────────────────────────────────────────────
function rowToLineItem(r: Record<string, unknown>): LineItem {
  return {
    id: r.id as string,
    serviceId: r.service_id as string,
    name: r.name as string,
    plain: (r.plain as string) ?? '',
    does: (r.does as string) ?? '',
    stage: r.stage as StageId | 'foundation',
    price: Number(r.price ?? 0),
    cadence: (r.cadence as BillingCadence) ?? { kind: 'one-time' },
    eta: (r.eta as string) ?? '',
    metric: (r.metric as LineItem['metric']) ?? undefined,
    why: (r.why as string) ?? undefined,
    market: (r.market as LineItem['market']) ?? undefined,
    handler: (r.handler as LineItem['handler']) ?? undefined,
    when: (r.when_label as string) ?? undefined,
    draft: (r.draft as LineItem['draft']) ?? undefined,
    included: (r.included as boolean) ?? true,
    optOut: (r.opt_out as LineItem['optOut']) ?? undefined,
    paused: (r.paused as boolean) ?? undefined,
    qty: (r.qty as number) ?? undefined,
    lock: (r.lock as LineItem['lock']) ?? 'editable',
  }
}

function rowToBrief(r: Record<string, unknown>): CampaignBrief {
  return {
    templateId: (r.template_id as string) ?? '',
    objective: (r.objective as string) ?? '',
    offer: (r.offer as CampaignBrief['offer']) ?? undefined,
    audienceIds: (r.audience_ids as string[]) ?? [],
    channelIds: (r.channel_ids as string[]) ?? [],
    kpi: (r.kpi as string) ?? '',
    durationWeeks: (r.duration_weeks as number | null) ?? null,
    projected: (r.projected as string) ?? undefined,
    contentBeats: (r.content_beats as CampaignBrief['contentBeats']) ?? [],
    spec: (r.spec as Record<string, string>) ?? {},
  }
}

function rowToSaved(c: Record<string, unknown>, items: LineItem[], brief: CampaignBrief | null): SavedCampaign {
  return {
    clientId: c.client_id as string,
    draft: {
      id: c.id as string,
      name: c.name as string,
      intent: c.intent as CampaignDraft['intent'],
      path: c.path as CampaignDraft['path'],
      budgetMonthly: Number(c.budget_monthly ?? 0),
      items,
      planned: (c.planned as boolean) ?? false,
      goalKey: (c.goal_key as CampaignDraft['goalKey']) ?? undefined,
      occasion: (c.occasion as string) ?? undefined,
      targetDate: (c.target_date as string) ?? undefined,
      context: (c.context as string) ?? undefined,
      brief: brief ?? undefined,
    },
    phase: (c.phase as SavedCampaign['phase']) ?? 'build',
    status: (c.status as SavedCampaign['status']) ?? 'draft',
    shippedAt: (c.shipped_at as string) ?? null,
    createdAt: c.created_at as string,
    updatedAt: c.updated_at as string,
  }
}

// ── domain → row ─────────────────────────────────────────────
function lineItemToRow(campaignId: string, clientId: string, it: LineItem, position: number) {
  return {
    campaign_id: campaignId,
    client_id: clientId,
    position,
    service_id: it.serviceId,
    name: it.name,
    plain: it.plain,
    does: it.does,
    stage: it.stage,
    price: it.price,
    cadence: it.cadence,
    eta: it.eta,
    qty: it.qty ?? null,
    included: it.included,
    opt_out: it.optOut ?? null,
    paused: it.paused ?? false,
    lock: it.lock,
    metric: it.metric ?? null,
    why: it.why ?? null,
    market: it.market ?? null,
    handler: it.handler ?? null,
    when_label: it.when ?? null,
    draft: it.draft ?? null,
  }
}

// ── CRUD ─────────────────────────────────────────────────────
export async function listCampaigns(clientId: string): Promise<SavedCampaign[]> {
  const admin = createAdminClient()
  const { data: camps } = await admin
    .from('campaigns')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
  if (!camps?.length) return []

  const ids = camps.map((c) => c.id as string)
  const [{ data: items }, { data: briefs }] = await Promise.all([
    admin.from('campaign_line_items').select('*').in('campaign_id', ids).order('position'),
    admin.from('campaign_briefs').select('*').in('campaign_id', ids),
  ])
  const itemsByCamp = new Map<string, LineItem[]>()
  for (const r of items ?? []) {
    const cid = r.campaign_id as string
    if (!itemsByCamp.has(cid)) itemsByCamp.set(cid, [])
    itemsByCamp.get(cid)!.push(rowToLineItem(r))
  }
  const briefByCamp = new Map<string, CampaignBrief>()
  for (const r of briefs ?? []) briefByCamp.set(r.campaign_id as string, rowToBrief(r))

  return camps.map((c) => rowToSaved(c, itemsByCamp.get(c.id as string) ?? [], briefByCamp.get(c.id as string) ?? null))
}

export async function getCampaign(id: string): Promise<SavedCampaign | null> {
  const admin = createAdminClient()
  const { data: c } = await admin.from('campaigns').select('*').eq('id', id).maybeSingle()
  if (!c) return null
  const [{ data: items }, { data: brief }] = await Promise.all([
    admin.from('campaign_line_items').select('*').eq('campaign_id', id).order('position'),
    admin.from('campaign_briefs').select('*').eq('campaign_id', id).maybeSingle(),
  ])
  return rowToSaved(c, (items ?? []).map(rowToLineItem), brief ? rowToBrief(brief) : null)
}

export async function createCampaign(clientId: string, createdBy: string | null, draft: CampaignDraft): Promise<string> {
  const admin = createAdminClient()
  const { data: c, error } = await admin
    .from('campaigns')
    .insert({
      client_id: clientId,
      name: draft.name,
      intent: draft.intent,
      path: draft.path,
      phase: draft.phase ?? 'build',
      budget_monthly: draft.budgetMonthly,
      planned: draft.planned ?? false,
      goal_key: draft.goalKey ?? null,
      occasion: draft.occasion ?? null,
      target_date: draft.targetDate ?? null,
      context: draft.context ?? null,
      created_by: createdBy,
    })
    .select('id')
    .single()
  if (error || !c) throw new Error(error?.message ?? 'Failed to create campaign')
  const campaignId = c.id as string

  if (draft.items.length) {
    const { error: liErr } = await admin.from('campaign_line_items').insert(draft.items.map((it, i) => lineItemToRow(campaignId, clientId, it, i)))
    if (liErr) throw new Error(`line items: ${liErr.message}`)
  }
  if (draft.brief) {
    const b = draft.brief
    const { error: bErr } = await admin.from('campaign_briefs').insert({
      campaign_id: campaignId, client_id: clientId,
      template_id: b.templateId, objective: b.objective, offer: b.offer ?? null,
      audience_ids: b.audienceIds, channel_ids: b.channelIds, kpi: b.kpi,
      duration_weeks: b.durationWeeks, projected: b.projected ?? null,
      content_beats: b.contentBeats, spec: b.spec,
    })
    if (bErr) throw new Error(`brief: ${bErr.message}`)
  }
  return campaignId
}

/** Replace a campaign's line items wholesale (positions preserved). */
export async function replaceLineItems(campaignId: string, clientId: string, items: LineItem[]): Promise<void> {
  const admin = createAdminClient()
  const { error: delErr } = await admin.from('campaign_line_items').delete().eq('campaign_id', campaignId)
  if (delErr) throw new Error(`clear line items: ${delErr.message}`)
  if (items.length) {
    const { error: insErr } = await admin.from('campaign_line_items').insert(items.map((it, i) => lineItemToRow(campaignId, clientId, it, i)))
    if (insErr) throw new Error(`replace line items: ${insErr.message}`)
  }
  await admin.from('campaigns').update({ updated_at: new Date().toISOString() }).eq('id', campaignId)
}

export async function updateCampaignFields(id: string, patch: Partial<{ name: string; budget_monthly: number; planned: boolean; phase: string; status: string; shipped_at: string; occasion: string; target_date: string; context: string }>): Promise<void> {
  const admin = createAdminClient()
  await admin.from('campaigns').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
}

export async function deleteCampaign(id: string): Promise<void> {
  const admin = createAdminClient()
  await admin.from('campaigns').delete().eq('id', id)
}
