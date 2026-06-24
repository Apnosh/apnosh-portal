import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { getCampaign, replaceLineItems, updateCampaignFields, deleteCampaign, materializeCampaignDrafts, getCampaignProgress } from '@/lib/campaigns/server'
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
  // Detect the ship transition BEFORE the write (campaign holds the pre-update state).
  const justShipped = body.fields?.status === 'shipped' && campaign.status !== 'shipped'
  try {
    if (Array.isArray(body.items)) await replaceLineItems(id, campaign.clientId, body.items as LineItem[])
    if (body.fields && typeof body.fields === 'object') await updateCampaignFields(id, body.fields)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'update failed' }, { status: 500 })
  }
  // The owner shipping a team-run campaign is the handoff signal: tell the staff
  // assigned to this client so the "your team is preparing each piece" promise is
  // real. DIY ships are owner-run, so no handoff. Best-effort; never blocks save.
  if (justShipped && campaign.draft.path !== 'diy') {
    // Turn the campaign's content calendar into real production work items, and
    // tell the team. Both best-effort: a successful ship must never 500 here.
    const shipISO = typeof body.fields?.shipped_at === 'string' ? body.fields.shipped_at : new Date().toISOString()
    const made = await materializeCampaignDrafts(id, campaign.clientId, campaign.draft, shipISO).catch(() => 0)
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
