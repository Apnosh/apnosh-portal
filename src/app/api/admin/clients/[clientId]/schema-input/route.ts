/**
 * Read the fields needed to emit LocalBusiness JSON-LD for a client.
 * Admin-only — pulls from gbp_locations / channel_connections /
 * the live GBP listing + reviews aggregate.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getClientListing } from '@/lib/gbp-listing'
import { getClientMenuLink } from '@/lib/gbp-menu'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

const DAY_NAMES: Record<string, string> = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday',
  fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
}

export async function GET(_req: Request, ctx: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await ctx.params

  /* Admin gate — only admins/strategists call this. */
  const server = await createClient()
  const { data: { user } } = await server.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile || !['admin', 'super_admin', 'team_member'].includes(profile.role as string)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const [listingRes, menuRes, clientRow, reviewAgg] = await Promise.all([
    getClientListing(clientId).catch(() => ({ ok: false as const, error: 'failed' })),
    getClientMenuLink(clientId).catch(() => ({ ok: false as const, error: 'failed' })),
    admin.from('clients').select('name, business_type').eq('id', clientId).maybeSingle(),
    admin.from('reviews')
      .select('rating', { count: 'exact' })
      .eq('client_id', clientId),
  ])

  /* Pull address + name from channel_connections metadata (set at
     finalize). For multi-location clients we use the primary
     location since schema lives at the brand level. */
  const { data: conn } = await admin
    .from('channel_connections')
    .select('platform_account_name, metadata')
    .eq('client_id', clientId)
    .eq('channel', 'google_business_profile')
    .eq('status', 'active')
    .neq('platform_account_id', 'pending')
    .order('connected_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const meta = (conn?.metadata ?? {}) as Record<string, unknown>
  const addrRaw = (meta.address as string | undefined) ?? ''
  /* Parse "123 Main St, Seattle, WA, 98101" — best-effort. */
  const parts = addrRaw.split(',').map(s => s.trim())
  const address = parts.length >= 3 ? {
    street: parts[0],
    locality: parts[1],
    region: parts[2],
    postal: parts[3] ?? '',
    country: 'US',
  } : undefined

  const fields = listingRes.ok ? listingRes.fields : null
  const name = conn?.platform_account_name ?? clientRow.data?.name ?? 'Restaurant'

  const hours: Array<{ day: string; opens: string; closes: string }> = []
  const regularHours = fields?.regularHours
  if (regularHours) {
    for (const [key, periods] of Object.entries(regularHours)) {
      if (!Array.isArray(periods)) continue
      for (const p of periods) {
        if (!p?.open || !p?.close) continue
        hours.push({ day: DAY_NAMES[key] ?? key, opens: p.open, closes: p.close })
      }
    }
  }

  /* Rating aggregate across all sources we track. */
  const ratings = (reviewAgg.data ?? []) as Array<{ rating: number }>
  const ratingCount = ratings.length
  const ratingAvg = ratingCount > 0
    ? Math.round((ratings.reduce((a, r) => a + Number(r.rating), 0) / ratingCount) * 10) / 10
    : 0

  const primaryCat = fields?.categories?.primary?.displayName?.toLowerCase() ?? ''
  const servesCuisine = primaryCat && primaryCat !== 'restaurant'
    ? primaryCat.replace(/ restaurant$/i, '')
    : undefined

  return NextResponse.json({
    name,
    description: fields?.description ?? '',
    phone: fields?.primaryPhone ?? '',
    website: fields?.websiteUri ?? '',
    address,
    hours,
    menuUrl: menuRes.ok ? menuRes.url : '',
    servesCuisine,
    rating: ratingCount > 0 ? { value: ratingAvg, count: ratingCount } : undefined,
  })
}
