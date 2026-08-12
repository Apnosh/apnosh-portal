/**
 * /api/dashboard/social-profile-kit — everything the "Set up your social profiles" walkthrough
 * needs from the server: the business facts the copy lines are built from (same NAP sources the
 * listings card trusts) plus which platforms are already linked to the dashboard.
 *
 * No platform inspection by design: Instagram, Facebook, TikTok, LinkedIn and YouTube give us no
 * way to read a profile's bio, so the card never claims to have checked one. The kit hands the
 * owner the correct text and the right links; whether each profile now matches is their word,
 * recorded on the campaign.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { getClientListing } from '@/lib/gbp-listing'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 20

const SOCIAL_VENDORS = ['zernio', 'ayrshare']
const PLATFORMS = ['instagram', 'facebook', 'tiktok', 'linkedin', 'youtube'] as const

export async function GET(req: NextRequest) {
  const { user, clientId } = await resolveCurrentClient(req.nextUrl.searchParams.get('clientId'))
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!clientId) return NextResponse.json({ error: 'No client context' }, { status: 403 })

  const db = createAdminClient()
  const [listing, gbpConn, socialConns, biz] = await Promise.all([
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
    db.from('channel_connections')
      .select('channel, metadata, status')
      .eq('client_id', clientId)
      .in('channel', SOCIAL_VENDORS)
      .eq('status', 'active'),
    db.from('clients')
      .select('name, website, industry, location')
      .eq('id', clientId)
      .maybeSingle(),
  ])

  const gbpMeta = (gbpConn.data?.metadata ?? {}) as Record<string, unknown>
  // which platforms the social vendor holds (the connected-accounts page's own source of truth)
  const linked: Record<string, boolean> = Object.fromEntries(PLATFORMS.map((p) => [p, false]))
  for (const row of socialConns.data ?? []) {
    const platforms = ((row.metadata as Record<string, unknown> | null)?.platforms ?? []) as string[]
    for (const p of platforms) if (p in linked) linked[p] = true
  }

  const b = (biz.data ?? {}) as Record<string, unknown>
  const gbpFields = listing?.ok ? listing.fields : null
  return NextResponse.json({
    business: {
      name: (gbpConn.data?.platform_account_name || b.name || '') as string,
      address: ((gbpMeta.address as string | undefined) ?? '') || '',
      phone: gbpFields?.primaryPhone ?? '',
      website: ((b.website as string | undefined) || gbpFields?.websiteUri || '') as string,
      cuisine: (b.industry as string | undefined) ?? '',
      city: (b.location as string | undefined) ?? '',
      description: gbpFields?.description ?? '',
    },
    linked,
  })
}
