import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { getCampaign, replaceLineItems, updateCampaignFields, deleteCampaign, materializeCampaignDrafts, getCampaignProgress } from '@/lib/campaigns/server'
import { mintWorkOrders, clearCampaignBriefCache, getCampaignCharges, campaignHasAccruedMoney, reconcileCampaignProduction } from '@/lib/campaigns/work-orders'
import { planCampaignPieces } from '@/lib/campaigns/work-orders-core'
import { getCampaignOutcomes } from '@/lib/campaigns/outcomes/read'
import { beatsFromLines } from '@/lib/campaigns/catalog'
import { deriveSchedule } from '@/lib/campaigns/schedule'
import { notifyStaffForClient } from '@/lib/notifications'
import type { LineItem, PieceProducer } from '@/lib/campaigns/types'

async function authorize(id: string) {
  const campaign = await getCampaign(id)
  if (!campaign) return { campaign: null, res: NextResponse.json({ error: 'not found' }, { status: 404 }) }
  const access = await checkClientAccess(campaign.clientId)
  if (!access.authorized) return { campaign, res: NextResponse.json({ error: 'forbidden' }, { status: 403 }) }
  return { campaign, res: null }
}

// GET /api/campaigns/:id — full campaign (items + brief).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { campaign, res } = await authorize(id)
  if (res) return res
  // Only shipped, team-run campaigns have materialized pieces / accrued charges;
  // skip the queries for drafts and DIY.
  const shipped = !!campaign && campaign.status === 'shipped'
  const shippedTeamRun = shipped && campaign!.draft.path !== 'diy'
  // Outcomes apply to any shipped campaign with published pieces (team or DIY); progress/
  // charges are team-run only. Each read is best-effort so one failure never blanks the page.
  const [progress, charges, outcomes] = await Promise.all([
    shippedTeamRun ? getCampaignProgress(id).catch(() => null) : Promise.resolve(null),
    shippedTeamRun ? getCampaignCharges(id).catch(() => null) : Promise.resolve(null),
    shipped ? getCampaignOutcomes(id).catch(() => null) : Promise.resolve(null),
  ])
  return NextResponse.json({ campaign, progress, charges, outcomes })
}

// PATCH /api/campaigns/:id — { items?: LineItem[], fields?: {...} }.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { campaign, res } = await authorize(id)
  if (res || !campaign) return res ?? NextResponse.json({ error: 'not found' }, { status: 404 })
  const body = await req.json().catch(() => ({}))
  // Validate the enum'd field so a bad value is a clean 400, not a DB-check 500.
  if (body.fields?.creative_control && !['handoff', 'approve_concept', 'owner_directs'].includes(body.fields.creative_control)) {
    return NextResponse.json({ error: 'invalid creative_control' }, { status: 400 })
  }
  // Sanitize execution: only the known string keys, length-capped — so unbounded
  // or instruction-injected text can never reach the creative-brief AI prompt.
  if (body.fields?.execution !== undefined) {
    const e = body.fields.execution
    if (typeof e !== 'object' || e === null || Array.isArray(e)) return NextResponse.json({ error: 'invalid execution' }, { status: 400 })
    const clean: Record<string, string> = {}
    for (const k of ['featuring', 'offerText', 'mustSay', 'avoid', 'postNotes']) {
      const v = (e as Record<string, unknown>)[k]
      if (v === undefined) continue
      if (typeof v !== 'string') return NextResponse.json({ error: `execution.${k} must be a string` }, { status: 400 })
      if (v.length > 2000) return NextResponse.json({ error: `execution.${k} is too long (2000 max)` }, { status: 400 })
      clean[k] = v
    }
    body.fields.execution = clean
  }
  // Validate producer_choices: a bounded map of pieceKey → the service ('team' |
  // 'creator' | 'diy' | 'ai'). The key is "<group>:<slot>" where group is a discipline
  // (Video/Photo/Social/Design) for shots OR the content type (email/sms/…) for sends —
  // so accept any word:slot, not just the four disciplines (else sends can't be chosen).
  // Cap the count + pin the shape so a bad/oversized payload can't accrete junk jsonb.
  const PIECE_KEY = /^[A-Za-z]+:\d{1,3}$/
  const PRODUCERS = new Set(['team', 'creator', 'diy', 'ai'])
  if (body.fields?.producer_choices !== undefined) {
    // The mint is one-shot at ship, so a post-ship change would silently no-op —
    // fail loudly instead of round-tripping a choice that changes no production.
    if (campaign.status === 'shipped') return NextResponse.json({ error: 'service choices are locked once the campaign has shipped' }, { status: 409 })
    const pc = body.fields.producer_choices
    if (typeof pc !== 'object' || pc === null || Array.isArray(pc)) return NextResponse.json({ error: 'invalid producer_choices' }, { status: 400 })
    const entries = Object.entries(pc as Record<string, unknown>)
    if (entries.length > 64) return NextResponse.json({ error: 'too many producer_choices (64 max)' }, { status: 400 })
    const clean: Record<string, PieceProducer> = {}
    for (const [k, v] of entries) {
      if (!PIECE_KEY.test(k)) return NextResponse.json({ error: `producer_choices key '${k}' is not a valid piece key` }, { status: 400 })
      if (typeof v !== 'string' || !PRODUCERS.has(v)) return NextResponse.json({ error: `producer_choices.${k} must be team, creator, diy, or ai` }, { status: 400 })
      clean[k] = v as PieceProducer
    }
    body.fields.producer_choices = clean
  }
  // Detect the ship transition BEFORE the write (campaign holds the pre-update state).
  const justShipped = body.fields?.status === 'shipped' && campaign.status !== 'shipped'
  try {
    if (Array.isArray(body.items)) await replaceLineItems(id, campaign.clientId, body.items as LineItem[])
    if (body.fields && typeof body.fields === 'object') await updateCampaignFields(id, body.fields)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'update failed' }, { status: 500 })
  }
  // Keep the in-memory campaign authoritative for materialize + mint: the ship
  // re-sends the owner's last-seen creator picks, covering a swallowed save.
  if (body.fields?.creator_choices && typeof body.fields.creator_choices === 'object') {
    campaign.creatorChoices = body.fields.creator_choices as Record<string, string>
  }
  // Regenerate the briefs only when a brief-relevant input actually changed
  // (vs the pre-update execution), so an unrelated/no-op save costs nothing.
  if (body.fields?.execution) {
    const delta = body.fields.execution as Record<string, string>
    const cur = (campaign.execution ?? {}) as Record<string, string>
    const changed = ['featuring', 'offerText', 'mustSay', 'avoid'].some((k) => k in delta && (delta[k] ?? '') !== (cur[k] ?? ''))
    if (changed) await clearCampaignBriefCache(id).catch(() => {})
  }
  // The owner shipping a team-run campaign is the handoff signal: tell the staff
  // assigned to this client so the "your team is preparing each piece" promise is
  // real. DIY ships are owner-run, so no handoff. Best-effort; never blocks save.
  if (justShipped && campaign.draft.path !== 'diy') {
    // Turn the campaign's content calendar into real production work items, and
    // tell the team. Both best-effort: a successful ship must never 500 here.
    const shipISO = typeof body.fields?.shipped_at === 'string' ? body.fields.shipped_at : new Date().toISOString()
    // Lock estimate-mode dates at ship: with no target date or occasion,
    // deriveSchedule re-anchors to "now" on every call, so the dates the owner
    // approved would drift forward by the review→ship gap. Persist the anchor as
    // target_date so calendar, drafts, and orders all agree from here on.
    // A menu campaign has no brief, so its calendar is derived from its lines — anchor
    // off THOSE beats, else every later edit re-anchors to a fresh "now" and churns
    // every piece's due date through the reconcile.
    if (!campaign.draft.targetDate && !campaign.draft.occasion) {
      const beats = (campaign.draft.brief?.contentBeats?.length ?? 0) > 0
        ? campaign.draft.brief!.contentBeats
        : beatsFromLines((campaign.draft.items ?? []).filter((it) => it.included))
      if (beats.length > 0) {
        const anchor = deriveSchedule({ contentBeats: beats }, shipISO).firstPostISO
        if (anchor) {
          await updateCampaignFields(id, { target_date: anchor }).catch(() => {})
          campaign.draft.targetDate = anchor
        }
      }
    }
    // One plan, two lanes: team pieces become content_drafts, creator pieces
    // become orders — each piece in exactly one lane. Computing both expectations
    // up front lets each dead-letter below fire only when its OWN lane dropped
    // work, now that a 0 from either side can be legitimate (all-team / all-creator).
    const pieces = planCampaignPieces(campaign, shipISO)
    const expectedTeam = pieces.filter((p) => p.producer === 'team').length
    const expectedOrders = pieces.filter((p) => p.producer === 'creator' && p.creatorId).length
    const made = await materializeCampaignDrafts(campaign, shipISO).catch(() => 0)
    // Dispatch the creator-run pieces to the chosen creators' inboxes (the supply
    // side). Best-effort; never blocks the ship.
    const minted = await mintWorkOrders(campaign, shipISO).catch(() => 0)
    // Only hand off to staff when there is actually team/creator work to build. A menu
    // campaign whose pieces are all DIY (the owner makes them) is path 'ai' but produces
    // nothing for the team, so the path-based gate above isn't enough.
    if (expectedTeam > 0 || expectedOrders > 0) {
      await notifyStaffForClient(
        campaign.clientId,
        ['strategist', 'community_mgr'],
        {
          kind: 'client_signoff',
          title: 'Owner shipped a campaign, ready to build',
          body: `${campaign.draft.name}. The owner approved it to go live. Build and run the pieces.`,
          link: `/work/campaigns?focus=${id}`,
        },
      ).catch(() => ({ notified: 0 }))
    }
    // Dead-letter: the campaign had TEAM pieces to produce but made none (the
    // silent-drop bug) gets flagged for manual setup, never vanishes.
    if (made === 0 && expectedTeam > 0) {
      await notifyStaffForClient(campaign.clientId, ['strategist'], {
        kind: 'client_signoff',
        title: 'Campaign shipped but produced no work items',
        body: `${campaign.draft.name} shipped, but no content pieces were created. Set it up manually.`,
        link: `/work/campaigns?focus=${id}`,
      }).catch(() => ({ notified: 0 }))
    }
    // Dead-letter: the campaign had creative work to dispatch but no creator
    // order was minted (transient insert error / missing table) — never let the
    // supply side silently strand. Re-mint is safe (idempotent) once fixed.
    if (expectedOrders > 0 && minted === 0) {
      await notifyStaffForClient(campaign.clientId, ['strategist'], {
        kind: 'client_signoff',
        title: 'Campaign shipped but creators were not dispatched',
        body: `${campaign.draft.name} shipped with ${expectedOrders} creative ${expectedOrders === 1 ? 'order' : 'orders'} to assign, but none reached a creator. Assign manually.`,
        link: `/work/campaigns?focus=${id}`,
      }).catch(() => ({ notified: 0 }))
    }
  }
  // Editing an ALREADY-shipped campaign (not the initial ship) → reconcile production
  // to the new plan: mint added pieces, void removed-and-not-started ones, re-date the
  // moved. Best-effort; never blocks the save. DIY ships mint nothing, so nothing to sync.
  if (!justShipped && campaign.status === 'shipped' && campaign.draft.path !== 'diy' && (Array.isArray(body.items) || body.fields?.target_date !== undefined)) {
    const updated = await getCampaign(id)
    if (updated) await reconcileCampaignProduction(updated).catch(() => null)
  }
  return NextResponse.json({ campaign: await getCampaign(id) })
}

// DELETE /api/campaigns/:id
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { res } = await authorize(id)
  if (res) return res
  // Don't let a delete strand money: a campaign with accrued owner charges or
  // creator payouts has real work that was billed/owed. Deleting would erase the
  // charge (cascade) but orphan the payout (set-null), losing its provenance.
  if (await campaignHasAccruedMoney(id).catch(() => false)) {
    return NextResponse.json({ error: 'this campaign has billed or owed pieces — resolve its charges and payouts before deleting' }, { status: 409 })
  }
  await deleteCampaign(id)
  return NextResponse.json({ ok: true })
}
