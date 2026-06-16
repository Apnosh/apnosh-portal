import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { getCampaign, replaceLineItems, updateCampaignFields, deleteCampaign } from '@/lib/campaigns/server'
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
  return NextResponse.json({ campaign })
}

// PATCH /api/campaigns/:id — { items?: LineItem[], fields?: {...} }.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { campaign, res } = await authorize(id)
  if (res || !campaign) return res ?? NextResponse.json({ error: 'not found' }, { status: 404 })
  const body = await req.json().catch(() => ({}))
  try {
    if (Array.isArray(body.items)) await replaceLineItems(id, campaign.clientId, body.items as LineItem[])
    if (body.fields && typeof body.fields === 'object') await updateCampaignFields(id, body.fields)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'update failed' }, { status: 500 })
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
