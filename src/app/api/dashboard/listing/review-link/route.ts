/**
 * /api/dashboard/listing/review-link — the owner's "leave a Google review"
 * deep link, built from the listing's Places place_id. Powers the
 * review-request kit (link + QR + share templates).
 */

import { NextResponse, type NextRequest } from 'next/server'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const { user, clientId } = await resolveCurrentClient(req.nextUrl.searchParams.get('clientId'))
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!clientId) return NextResponse.json({ error: 'No client context' }, { status: 403 })

  const admin = createAdminClient()
  const [{ data: locs }, { data: clientRow }] = await Promise.all([
    admin.from('gbp_locations').select('location_name, place_id, is_primary').eq('client_id', clientId),
    admin.from('clients').select('name').eq('id', clientId).maybeSingle(),
  ])

  const rows = (locs ?? []) as { location_name: string; place_id: string | null; is_primary?: boolean }[]
  const primary = rows.find(r => r.is_primary && r.place_id) ?? rows.find(r => r.place_id)
  const placeId = primary?.place_id ?? null
  const businessName = clientRow?.name ?? primary?.location_name ?? 'your restaurant'

  return NextResponse.json({
    placeId,
    businessName,
    // Google's canonical "write a review" deep link for a place.
    reviewUrl: placeId ? `https://search.google.com/local/writereview?placeid=${placeId}` : null,
  })
}
