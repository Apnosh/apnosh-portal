import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { getCampaign } from '@/lib/campaigns/server'
import { getCampaignReadiness } from '@/lib/campaigns/readiness'

// The post-ship "Get it ready" checklist for one campaign. Owner/team/admin only.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const campaign = await getCampaign(id)
  if (!campaign) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const access = await checkClientAccess(campaign.clientId)
  if (!access.authorized) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const report = await getCampaignReadiness(id)
  return NextResponse.json({ report })
}
