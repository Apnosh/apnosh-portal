/**
 * /api/dashboard/citations — the owner's name, address and phone as Google has them, which
 * is the only thing the "Get listed everywhere" card needs from the server.
 *
 * There is no directory inspection here by design (see `@/lib/citations/directories`). We do
 * not call Yelp, we do not read citation_audits, and we do not report on any listing's state.
 * The card hands the owner the correct text and the right links; whether each site now matches
 * is their word, recorded on the campaign.
 *
 * citation_audits and the Yelp check still exist for the STRATEGIST (admin SEO toolkit). They
 * hold what a person verified. Deliberately not mixed in here: an owner saying "I sorted it"
 * must never end up filed as evidence that we looked.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { getClientListing } from '@/lib/gbp-listing'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildCitationPlan, type SourceNap } from '@/lib/citations/directories'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 20

export async function GET(req: NextRequest) {
  const { user, clientId } = await resolveCurrentClient(req.nextUrl.searchParams.get('clientId'))
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!clientId) return NextResponse.json({ error: 'No client context' }, { status: 403 })

  // Same two sources the strategist's audit uses for the truth NAP: the connection carries
  // the verified business name and address, the listing carries the phone.
  const db = createAdminClient()
  const [listing, conn] = await Promise.all([
    getClientListing(clientId).catch(() => null),
    db.from('channel_connections')
      .select('platform_account_name, metadata')
      .eq('client_id', clientId)
      .eq('channel', 'google_business_profile')
      .eq('status', 'active')
      .neq('platform_account_id', 'pending')
      .order('connected_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const meta = (conn.data?.metadata ?? {}) as Record<string, unknown>
  const source: SourceNap = {
    name: conn.data?.platform_account_name ?? '',
    address: (meta.address as string | undefined) ?? '',
    phone: (listing?.ok ? listing.fields.primaryPhone : '') ?? '',
  }

  const fixedParam = req.nextUrl.searchParams.get('fixed')
  const fixed = fixedParam ? fixedParam.split(',').filter(Boolean) : []

  return NextResponse.json(buildCitationPlan(source, fixed))
}
