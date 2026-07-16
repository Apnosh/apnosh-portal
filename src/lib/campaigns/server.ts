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
import type { CampaignDraft, LineItem, CampaignBrief, BillingCadence, PieceProducer } from './types'
import { planCampaignPieces, teamDraftRowForPiece, PLAN_REMOVED_NOTE, STOP_NOTE } from './work-orders-core'
import { turnaroundFor } from './data/service-turnaround'
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
    producer: (r.producer as LineItem['producer']) ?? undefined,
    ownerMode: (r.owner_mode as LineItem['ownerMode']) ?? undefined,
    brief: (r.brief as LineItem['brief']) ?? undefined,
    postISO: (r.post_iso as string) ?? undefined,
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
      // The catalog card this campaign was built from — written on create (server.ts) but never
      // hydrated back until now. Service-needs reads it (e.g. the `edit` card's footage-upload ask),
      // so without this the ask never fires on the readiness path.
      sourceCatalogId: (c.source_catalog_id as string) ?? undefined,
      brief: brief ?? undefined,
    },
    phase: (c.phase as SavedCampaign['phase']) ?? 'build',
    status: (c.status as SavedCampaign['status']) ?? 'draft',
    shippedAt: (c.shipped_at as string) ?? null,
    // undefined = the column does not exist yet (pre-migration) -> the UI treats it as legacy-confirmed;
    // null = shipped but a human has not confirmed it yet (the real waiting state).
    confirmedAt: 'confirmed_at' in c ? ((c.confirmed_at as string) ?? null) : undefined,
    createdAt: c.created_at as string,
    updatedAt: c.updated_at as string,
    creatorChoices: (c.creator_choices as Record<string, string> | null) ?? {},
    producerChoices: (c.producer_choices as Record<string, PieceProducer> | null) ?? {},
    creativeControl: (c.creative_control as SavedCampaign['creativeControl']) ?? 'handoff',
    execution: (c.execution as SavedCampaign['execution']) ?? {},
  }
}

// ── domain → row ─────────────────────────────────────────────
function lineItemToRow(campaignId: string, clientId: string, it: LineItem, position: number) {
  const row: Record<string, unknown> = {
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
  // Content Menu per-piece fields (migration 183). Only written when SET, so a legacy
  // line never references these columns and inserts work unchanged pre-183.
  if (it.producer !== undefined) row.producer = it.producer
  // owner_mode (migration 202): only the owner-run gbp lanes set it, so a legacy line
  // never references the column and inserts work unchanged pre-202.
  if (it.ownerMode !== undefined) row.owner_mode = it.ownerMode
  if (it.brief !== undefined) row.brief = it.brief ?? null
  if (it.postISO !== undefined) row.post_iso = it.postISO ?? null
  return row
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
      source_catalog_id: draft.sourceCatalogId ?? null,
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
  // No transaction across PostgREST calls, so snapshot before the delete: a failed
  // insert must put the old plan back, not leave a (possibly shipped) campaign with
  // ZERO line items — the plan is also the pricing source for every piece.
  const { data: prior, error: readErr } = await admin.from('campaign_line_items').select('*').eq('campaign_id', campaignId)
  if (readErr) throw new Error(`read line items: ${readErr.message}`)
  const { error: delErr } = await admin.from('campaign_line_items').delete().eq('campaign_id', campaignId)
  if (delErr) throw new Error(`clear line items: ${delErr.message}`)
  if (items.length) {
    const { error: insErr } = await admin.from('campaign_line_items').insert(items.map((it, i) => lineItemToRow(campaignId, clientId, it, i)))
    if (insErr) {
      // Best-effort restore of the snapshot (same ids, already deleted, so no conflict).
      let restored = false
      if (prior?.length) {
        const r = await admin.from('campaign_line_items').insert(prior)
        restored = !r.error
      }
      throw new Error(`replace line items: ${insErr.message}${restored ? ' (previous plan restored)' : ''}`)
    }
  }
  await admin.from('campaigns').update({ updated_at: new Date().toISOString() }).eq('id', campaignId)
}

/** Returns whether the update applied. With opts.onlyIfNotShipped the write is guarded on
 *  status <> 'shipped' — the atomic claim of the one-shot ship transition, so two racing
 *  ship PATCHes can never both "win" (the loser matches zero rows and gets false). */
export async function updateCampaignFields(id: string, patch: Partial<{ name: string; budget_monthly: number; planned: boolean; phase: string; status: string; shipped_at: string; occasion: string; target_date: string; context: string; creator_choices: Record<string, string>; producer_choices: Record<string, PieceProducer>; creative_control: string; execution: Record<string, unknown> }>, opts?: { onlyIfNotShipped?: boolean }): Promise<boolean> {
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
    patch = { ...patch, producer_choices: { ...((data?.producer_choices as Record<string, PieceProducer>) ?? {}), ...patch.producer_choices } }
  }
  // Throw on error like createCampaign/replaceLineItems do, so a failed write
  // (e.g. a failed ship) surfaces as a 500 instead of silently succeeding and,
  // for a ship, firing a phantom "ready to build" staff notification.
  const row = { ...patch, updated_at: new Date().toISOString() }
  if (opts?.onlyIfNotShipped) {
    // The ship claim: only a DRAFT can ship. eq('draft') (not neq('shipped')) so a
    // STOPPED campaign can never be re-shipped — that would re-run the one-shot
    // mint block and double-materialize production.
    const { data, error } = await admin.from('campaigns').update(row).eq('id', id).eq('status', 'draft').select('id')
    if (error) throw new Error(`update campaign: ${error.message}`)
    return (data?.length ?? 0) > 0
  }
  const { error } = await admin.from('campaigns').update(row).eq('id', id)
  if (error) throw new Error(`update campaign: ${error.message}`)
  return true
}

export async function deleteCampaign(id: string): Promise<void> {
  const admin = createAdminClient()
  // This campaign's content_drafts have campaign_id ON DELETE SET NULL, so a bare
  // delete would strand them as schedulable orphans (the team-materialized pieces
  // AND the bridged creator pieces). Reject every non-published draft first so it
  // leaves the team's publish/schedule queue ('rejected' is the table's terminal
  // dead state — 'archived' is NOT in the content_drafts status CHECK); published
  // work is left untouched.
  await admin.from('content_drafts').update({ status: 'rejected' }).eq('campaign_id', id).neq('status', 'published')
  await admin.from('campaigns').delete().eq('id', id)
}

/* ── Publish bridge: ship → production queue ──────────────────────────────────
   When an owner ships a team-run campaign, turn its content calendar into real
   work items for the production team (so "your team is preparing each piece" has
   substance). The team then produces + schedules them; the publish-scheduled
   cron sends them. Nothing here can auto-publish (drafts are created 'idea'). */

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
  // The team's share of the calendar (creator pieces go to orders; DIY pieces mint
  // nothing). An AI-draft piece also lands here — the team finalizes the AI first draft —
  // until real generation is wired. Each piece follows the owner's edited line items.
  const teamPieces = planCampaignPieces(campaign, shipISO).filter((p) => p.producer === 'team' || p.producer === 'ai')
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
  // teamDraftRowForPiece stamps campaign_piece_key (for the post-ship reconcile) +
  // service line; target_publish_date is already clamped to >= ship day by the planner.
  const rows = teamPieces.map((p) => teamDraftRowForPiece(campaign, p))
  let { error } = await admin.from('content_drafts').insert(rows)
  if (error && error.code === '42703') {
    // Pre-migration 182 (campaign_piece_key absent) — insert without the key so a
    // ship never breaks; the reconcile just can't match these team drafts until 182.
    const stripped = rows.map((r) => { const c = { ...r } as Record<string, unknown>; delete c.campaign_piece_key; return c })
    ;({ error } = await admin.from('content_drafts').insert(stripped))
  }
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
  const [{ data: drafts }, { data: orders }, { data: services }] = await Promise.all([
    admin.from('content_drafts').select('id, status, target_publish_date, client_signed_off_at').eq('campaign_id', campaignId),
    // select('*') so a missing content_draft_id column (pre-179) doesn't error.
    admin.from('creator_work_orders').select('*').eq('campaign_id', campaignId),
    // Service lane (migration 190). select('*') + `?? []` so a missing table
    // pre-190 keeps the exact null-when-nothing-materialized semantics.
    admin.from('service_work_orders').select('*').eq('campaign_id', campaignId),
  ])
  return computeProgress((drafts ?? []) as Record<string, unknown>[], (orders ?? []) as Record<string, unknown>[], (services ?? []) as Record<string, unknown>[])
}

/** Progress for MANY campaigns in three queries (list views need one per card without N round-trips). */
export async function getCampaignProgressBatch(campaignIds: string[]): Promise<Record<string, CampaignProgress>> {
  if (!campaignIds.length) return {}
  const admin = createAdminClient()
  const [{ data: drafts }, { data: orders }, { data: services }] = await Promise.all([
    admin.from('content_drafts').select('id, campaign_id, status, target_publish_date, client_signed_off_at').in('campaign_id', campaignIds),
    admin.from('creator_work_orders').select('*').in('campaign_id', campaignIds),
    admin.from('service_work_orders').select('*').in('campaign_id', campaignIds),
  ])
  const group = (rows: Record<string, unknown>[]): Map<string, Record<string, unknown>[]> => {
    const m = new Map<string, Record<string, unknown>[]>()
    for (const r of rows) { const k = r.campaign_id as string; const a = m.get(k) ?? []; a.push(r); m.set(k, a) }
    return m
  }
  const dBy = group((drafts ?? []) as Record<string, unknown>[]), oBy = group((orders ?? []) as Record<string, unknown>[]), sBy = group((services ?? []) as Record<string, unknown>[])
  const out: Record<string, CampaignProgress> = {}
  for (const id of campaignIds) { const p = computeProgress(dBy.get(id) ?? [], oBy.get(id) ?? [], sBy.get(id) ?? []); if (p) out[id] = p }
  return out
}

/** Pure bucketing of a campaign's content_drafts (team lane) + creator_work_orders
 *  (creator lane) + service_work_orders (service lane, migration 190). */
function computeProgress(drafts: Record<string, unknown>[], orders: Record<string, unknown>[], serviceOrders: Record<string, unknown>[] = []): CampaignProgress | null {
  let total = 0, live = 0, queued = 0, awaitingYou = 0, inProgress = 0, dropped = 0, servicesAwaitingYou = 0
  let nextDueISO: string | null = null
  const bumpDue = (raw: string | null) => {
    const dt = (raw ?? '').slice(0, 10)
    if (dt && (!nextDueISO || dt < nextDueISO)) nextDueISO = dt
  }

  // Team lane: content_drafts. idea/draft/revising/produced are in progress;
  // scheduled is queued; published is live. 'approved' splits on the owner's
  // sign-off gate: the publish paths hold an unsigned draft until the owner signs
  // (attempt-publish 'awaiting_signoff'), so approved+unsigned is the OWNER'S turn
  // (awaitingYou), and approved+signed is queued. (Sign-off is required for every
  // live client today; where a client turns it off the piece just moves on fast,
  // so a brief awaitingYou miscount there is harmless.)
  const DEAD = new Set(['rejected', 'failed', 'archived'])     // terminal: not real work
  // A bridged order is counted via its content_draft ONLY while that draft is
  // alive. If the team rejects/archives it, the order falls back through (creator
  // lane, below) so the piece is never silently dropped from the total.
  const aliveDraftIds = new Set((drafts ?? []).filter((d) => !DEAD.has((d.status as string) ?? '')).map((d) => d.id as string))
  const orderByDraft = new Map<string, Record<string, unknown>>()
  for (const o of orders ?? []) { const cd = o.content_draft_id as string | null; if (cd) orderByDraft.set(cd, o) }
  for (const d of drafts ?? []) {
    const s = (d.status as string) ?? ''
    if (DEAD.has(s)) {
      // A killed campaign piece stays visible as 'dropped' (never silently shrinks the
      // owner's plan) — unless a backing order represents it in the creator lane below.
      if (!orderByDraft.has(d.id as string)) dropped++
      continue
    }
    total++
    if (s === 'published') { live++; continue }
    // scheduled-unsigned is held by the publish cron until the owner signs, so
    // it is STILL the owner's turn, same as approved-unsigned.
    if (s === 'scheduled' || s === 'approved') { if (d.client_signed_off_at) queued++; else awaitingYou++ }
    else inProgress++
    bumpDue(d.target_publish_date as string | null)
  }

  // Creator lane: creator_work_orders. An approved order isn't live until the
  // publish bridge runs, so it counts as queued; a delivery needs the owner's
  // review (awaitingYou). A creator's decline is a visible 'dropped' (the piece
  // still needs a maker); a plan-removed void (PLAN_REMOVED_NOTE) is the owner's
  // own edit, so it vanishes entirely.
  for (const o of orders ?? []) {
    const s = (o.status as string) ?? ''
    if (s === 'declined') {
      // Owner-initiated voids vanish: a plan-removal (PLAN_REMOVED_NOTE) or a
      // campaign stop (STOP_NOTE) is the owner's own call, not a dropped piece.
      const note = o.note as string | null
      if (note !== PLAN_REMOVED_NOTE && note !== STOP_NOTE) dropped++
      continue
    }
    // Bridged on approval → its LIVE content_draft represents it in the team lane;
    // skip here so the piece is counted once. If that draft was rejected/archived,
    // fall through and count the order so the piece is never dropped from total.
    if (o.content_draft_id && aliveDraftIds.has(o.content_draft_id as string)) continue
    total++
    if (s === 'approved') queued++
    else if (s === 'delivered') awaitingYou++
    else inProgress++   // offered / accepted / in_progress / revision
    bumpDue(o.due_date as string | null)
  }

  // Service lane: real, checkable service work minted at ship (migration 190).
  // 'delivered' is the proof-backed done (all steps complete + proof required by
  // the admin route) → live. The client-blocked states are the OWNER's turn but
  // live in their own field (servicesAwaitingYou), never awaitingYou — the
  // piece-worded surfaces (readiness "review N pieces", inbox CTA, digest) would
  // miscount and dead-end otherwise. RECURRING-class services (monthly cycles,
  // continuous care) are programs, not finite pieces — excluded entirely so an
  // ongoing cycle can never hold a campaign out of 'done' forever. 'cancelled'
  // (a stopped campaign's void) is not work anymore.
  for (const w of serviceOrders ?? []) {
    if (turnaroundFor((w.service_id as string) ?? '')?.class === 'recurring') continue
    const s = (w.status as string) ?? ''
    if (s === 'cancelled') continue
    total++
    if (s === 'delivered') { live++; continue }
    if (s === 'ready_for_client' || s === 'blocked_client') servicesAwaitingYou++
    else inProgress++   // queued / claimed / in_progress / blocked_gate
    bumpDue(w.due_date as string | null)
  }

  if (!total && !dropped) return null
  return { total, live, queued, awaitingYou, inProgress, nextDueISO, dropped, servicesAwaitingYou }
}
