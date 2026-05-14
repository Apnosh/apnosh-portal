/**
 * Returns a compact preview-friendly view of the GBP listing, used
 * by the mobile preview card on the owner's listing page.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { getClientListing } from '@/lib/gbp-listing'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

const DAYS = ['sun','mon','tue','wed','thu','fri','sat'] as const

export async function GET(req: NextRequest) {
  const { user, clientId } = await resolveCurrentClient()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!clientId) return NextResponse.json({ error: 'No client context' }, { status: 403 })

  const locationId = req.nextUrl.searchParams.get('locationId')
  const admin = createAdminClient()

  const [listingRes, conn, reviewAgg] = await Promise.all([
    getClientListing(clientId, locationId).catch(() => ({ ok: false as const, error: 'failed' })),
    admin.from('channel_connections')
      .select('platform_account_name, metadata')
      .eq('client_id', clientId)
      .eq('channel', 'google_business_profile')
      .eq('status', 'active')
      .neq('platform_account_id', 'pending')
      .order('connected_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin.from('reviews').select('rating').eq('client_id', clientId),
  ])

  const fields = listingRes.ok ? listingRes.fields : null
  const meta = (conn.data?.metadata ?? {}) as Record<string, unknown>
  const ratings = (reviewAgg.data ?? []) as Array<{ rating: number }>
  const reviewCount = ratings.length
  const ratingAvg = reviewCount > 0
    ? Math.round((ratings.reduce((a, r) => a + Number(r.rating), 0) / reviewCount) * 10) / 10
    : 0

  /* Today's hours summary. */
  const today = DAYS[new Date().getDay()]
  const todaysPeriods = fields?.regularHours?.[today] ?? []
  const hoursToday = todaysPeriods.length === 0
    ? 'Closed today'
    : 'Open today · ' + todaysPeriods.map(p => `${fmtTime(p.open)} – ${fmtTime(p.close)}`).join(', ')

  return NextResponse.json({
    title: conn.data?.platform_account_name ?? '',
    category: fields?.categories?.primary?.displayName ?? '',
    rating: ratingAvg,
    reviewCount,
    description: fields?.description ?? '',
    phone: fields?.primaryPhone ?? '',
    website: fields?.websiteUri ?? '',
    address: (meta.address as string | undefined) ?? '',
    hoursToday,
  })
}

function fmtTime(t: string): string {
  /* "11:00" → "11 AM"; "14:30" → "2:30 PM". */
  const [h, m] = t.split(':').map(Number)
  if (isNaN(h)) return t
  const period = h >= 12 ? 'PM' : 'AM'
  const hour12 = ((h + 11) % 12) + 1
  return m ? `${hour12}:${String(m).padStart(2, '0')} ${period}` : `${hour12} ${period}`
}
