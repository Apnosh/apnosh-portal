import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { getCampaign, replaceLineItems, updateCampaignFields, deleteCampaign, materializeCampaignDrafts, getCampaignProgress } from '@/lib/campaigns/server'
import { mintWorkOrders, clearCampaignBriefCache } from '@/lib/campaigns/work-orders'
import { buildWorkOrderRows } from '@/lib/campaigns/work-orders-core'
import { deriveSchedule } from '@/lib/campaigns/schedule'
import { notifyStaffForClient } from '@/lib/notifications'
import type { LineItem } from '@/lib/campaigns/types'

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
  // Only shipped, team-run campaigns have materialized pieces; skip the query
  // for drafts and DIY (they can never have content_drafts to roll up).
  const progress = campaign && campaign.status === 'shipped' && campaign.draft.path !== 'diy'
    ? await getCampaignProgress(id).catch(() => null)
    : null
  return NextResponse.json({ campaign, progress })
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
  // The owner changed the "Get it ready" inputs → regenerate the briefs with them.
  if (body.fields?.execution) await clearCampaignBriefCache(id).catch(() => {})
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
    if (!campaign.draft.targetDate && !campaign.draft.occasion && (campaign.draft.brief?.contentBeats?.length ?? 0) > 0) {
      const anchor = deriveSchedule({ contentBeats: campaign.draft.brief?.contentBeats }, shipISO).firstPostISO
      if (anchor) {
        await updateCampaignFields(id, { target_date: anchor }).catch(() => {})
        campaign.draft.targetDate = anchor
      }
    }
    const made = await materializeCampaignDrafts(id, campaign.clientId, campaign.draft, shipISO).catch(() => 0)
    // Dispatch the creative work to the chosen creators' inboxes (the supply
    // side). Best-effort; never blocks the ship. We compare what SHOULD have
    // been minted against what was, so a silent mint failure is caught below.
    const expectedOrders = buildWorkOrderRows(campaign, shipISO).length
    const minted = await mintWorkOrders(campaign, shipISO).catch(() => 0)
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
    // Dead-letter: a team-run campaign that should have produced pieces but made
    // none (the silent-drop bug) gets flagged for manual setup, never vanishes.
    if (made === 0 && (campaign.draft.brief?.contentBeats?.length ?? 0) > 0) {
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
  return NextResponse.json({ campaign: await getCampaign(id) })
}

// DELETE /api/campaigns/:id
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { res } = await authorize(id)
  if (res) return res
  await deleteCampaign(id)
  return NextResponse.json({ ok: true })
}
