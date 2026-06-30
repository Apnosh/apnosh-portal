import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { getCampaignProfile } from '@/lib/campaigns/builder/campaign-profile'

/**
 * GET /api/campaigns/profile?clientId=… — the real account profile the campaign builder
 * hydrates its madlib defaults from (the owner's neighborhood, target audience, budget,
 * rating). Lets the builder arrive pre-filled instead of asking what onboarding already knew.
 */
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ profile: null })
  const access = await checkClientAccess(clientId)
  if (!access.authorized) return NextResponse.json({ profile: null })
  const profile = await getCampaignProfile(clientId)
  return NextResponse.json({ profile })
}
