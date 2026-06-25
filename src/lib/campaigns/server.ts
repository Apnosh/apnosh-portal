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
import { planCampaignPieces } from './work-orders-core'
import type { StageId } from './stages'
import type { SavedCampaign, CampaignProgress } from './view'

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
    creatorChoices: (c.creator_choices as Record<string, string> | null) ?? {},
    producerChoices: (c.producer_choices as Record<string, 'team' | 'creator'> | null) ?? {},
    creativeControl: (c.creative_control as SavedCampaign['creativeControl']) ?? 'handoff',
    execution: (c.execution as SavedCampaign['execution']) ?? {},
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

export async function updateCampaignFields(id: string, patch: Partial<{ name: string; budget_monthly: number; planned: boolean; phase: string; status: string; shipped_at: string; occasion: string; target_date: string; context: string; creator_choices: Record<string, string>; producer_choices: Record<string, 'team' | 'creator'>; creative_control: string; execution: Record<string, unknown> }>): Promise<void> {
  const admin = createAdminClient()
  // execution + producer_choices are partial deltas — merge into the stored jsonb
  // so a save of one field/piece never clobbers the others (concurrent edits, a
  // single per-piece toggle, unsurfaced keys).
  if (patch.execution) {
    const { data } = await admin.from('campaigns').select('execution').eq('id', id).maybeSingle()
    patch = { ...patch, execution: { ...((data?.execution as Record<string, unknown>) ?? {}), ...patch.execution } }
  }
  if (patch.producer_choices) {
    const { data } = await admin.from('campaigns').select('producer_choices').eq('id', id).maybeSingle()
    patch = { ...patch, producer_choices: { ...((data?.producer_choices as Record<string, 'team' | 'creator'>) ?? {}), ...patch.producer_choices } }
  }
  // Throw on error like createCampaign/replaceLineItems do, so a failed write
  // (e.g. a failed ship) surfaces as a 500 instead of silently succeeding and,
  // for a ship, firing a phantom "ready to build" staff notification.
  const { error } = await admin.from('campaigns').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw new Error(`update campaign: ${error.message}`)
}

export async function deleteCampaign(id: string): Promise<void> {
  const admin = createAdminClient()
  await admin.from('campaigns').delete().eq('id', id)
}

/* ── Publish bridge: ship → production queue ──────────────────────────────────
   When an owner ships a team-run campaign, turn its content calendar into real
   work items for the production team (so "your team is preparing each piece" has
   substance). The team then produces + schedules them; the publish-scheduled
   cron sends them. Nothing here can auto-publish (drafts are created 'idea'). */

const DRAFT_SERVICE_LINE: Record<string, string> = {
  reel: 'social', photo: 'social', post: 'social', story: 'social', email: 'email', sms: 'email',
}
function draftServiceLine(beat: { type?: string; channel?: string }): string {
  const ch = (beat.channel || '').toLowerCase()
  if (ch.includes('google') || ch.includes('gbp') || ch.includes('maps')) return 'local'
  return DRAFT_SERVICE_LINE[beat.type ?? ''] ?? 'social'
}
/**
 * Materialize a shipped campaign's TEAM-assigned pieces as content_drafts (status
 * 'idea') for the production team. The producer split lives in planCampaignPieces:
 * pieces the owner kept in-house (or with no creator) land here; creator-assigned
 * pieces are minted as work orders instead, so no piece is produced twice.
 * Idempotent: skips if drafts already exist for this campaign. Status is ALWAYS
 * 'idea' so the publish-scheduled cron (status='scheduled' only) can never
 * auto-send them. Returns the count created (0 if no team pieces / already done).
 *
 * Dates come from the same deriveSchedule the owner saw pre-ship (via the planner),
 * so the team's pieces land on the dates the owner approved.
 */
export async function materializeCampaignDrafts(campaign: SavedCampaign, shipISO: string): Promise<number> {
  // Only the team's share of the calendar (the rest goes to creators); each piece
  // already follows the owner's edited line items, so produced == billed.
  const teamPieces = planCampaignPieces(campaign, shipISO).filter((p) => p.producer === 'team')
  if (!teamPieces.length) return 0
  const admin = createAdminClient()
  const { data: existing, error: existErr } = await admin
    .from('content_drafts')
    .select('id')
    .eq('campaign_id', campaign.draft.id)
    .limit(1)
  // Bail on a read error (e.g. the campaign_id column not present yet) instead of
  // falling through to an insert that would throw — keeps a pre-migration ship a
  // clean no-op rather than logging a failed insert.
  if (existErr) return 0
  if (existing && existing.length) return 0
  const rows = teamPieces.map((p) => ({
    client_id: campaign.clientId,
    campaign_id: campaign.draft.id,
    idea: (p.label || 'Campaign piece').slice(0, 280),
    status: 'idea',
    service_line: draftServiceLine({ type: p.type, channel: p.channel }),
    proposed_via: 'strategist',
    target_publish_date: p.postISO,    // already clamped to >= ship day in the planner
  }))
  const { error } = await admin.from('content_drafts').insert(rows)
  if (error) throw new Error(`materialize campaign drafts: ${error.message}`)
  return rows.length
}

/**
 * Owner-facing progress rollup of a shipped campaign's pieces, UNIONED across both
 * production lanes — team pieces (content_drafts) and creator pieces
 * (creator_work_orders) — so the detail mirror counts the whole campaign, not just
 * the half the team is making. Returns null when nothing is materialized yet (a
 * draft, or pre-migration), so callers degrade cleanly.
 */
export async function getCampaignProgress(campaignId: string): Promise<CampaignProgress | null> {
  const admin = createAdminClient()
  const [{ data: drafts }, { data: orders }] = await Promise.all([
    admin.from('content_drafts').select('status, target_publish_date').eq('campaign_id', campaignId),
    admin.from('creator_work_orders').select('status, due_date').eq('campaign_id', campaignId),
  ])
  let total = 0, live = 0, queued = 0, awaitingYou = 0, inProgress = 0
  let nextDueISO: string | null = null
  const bumpDue = (raw: string | null) => {
    const dt = (raw ?? '').slice(0, 10)
    if (dt && (!nextDueISO || dt < nextDueISO)) nextDueISO = dt
  }

  // Team lane: content_drafts. A campaign draft can reach idea/draft/revising/
  // produced (in progress), approved/scheduled (queued), published (live), or
  // rejected (dead) — there is NO owner-review status on this table, so team
  // pieces never contribute to awaitingYou. Owner sign-off on team work is wired
  // in Phase 2 (the publish bridge); only the creator lane drives awaitingYou today.
  const DEAD = new Set(['rejected', 'failed', 'archived'])     // terminal: not real work
  const QUEUED = new Set(['scheduled', 'approved'])            // committed to go out
  for (const d of drafts ?? []) {
    const s = (d.status as string) ?? ''
    if (DEAD.has(s)) continue
    total++
    if (s === 'published') { live++; continue }
    if (QUEUED.has(s)) queued++
    else inProgress++
    bumpDue(d.target_publish_date as string | null)
  }

  // Creator lane: creator_work_orders. An approved order isn't live until the
  // publish bridge runs, so it counts as queued; a delivery needs the owner's
  // review (awaitingYou); a declined order is dead.
  for (const o of orders ?? []) {
    const s = (o.status as string) ?? ''
    if (s === 'declined') continue
    total++
    if (s === 'approved') queued++
    else if (s === 'delivered') awaitingYou++
    else inProgress++   // offered / accepted / in_progress / revision
    bumpDue(o.due_date as string | null)
  }

  if (!total) return null
  return { total, live, queued, awaitingYou, inProgress, nextDueISO }
}
