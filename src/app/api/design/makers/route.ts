import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { creatorRatingAggregates } from '@/lib/campaigns/work-ratings'
import { ratingLabel } from '@/lib/campaigns/work-ratings-core'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/design/makers — the creator marketplace as makers for a graphic
 * order. Bookable creator vendors with their LIVE rating aggregate from real
 * work_ratings rows: "4.9 (12 ratings)" or the honest "No ratings yet".
 * Never errors the flow: any failure returns an empty list and the order
 * simply offers the house tiers.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ makers: [] })
  try {
    const admin = createAdminClient()
    const { data: vendors } = await admin
      .from('vendors')
      .select('id, slug, name, vendor_type, bookable')
      .eq('bookable', true)
      .neq('vendor_type', 'apnosh')
    if (!vendors?.length) return NextResponse.json({ makers: [] })
    const ratings = await creatorRatingAggregates(vendors.map((v) => v.id as string))
    const makers = vendors.map((v) => {
      const agg = ratings.get(v.id as string) ?? null
      return {
        vendorId: v.id as string,
        slug: v.slug as string,
        name: v.name as string,
        rating: agg,
        ratingLabel: ratingLabel(agg),
      }
    })
    return NextResponse.json({ makers })
  } catch {
    return NextResponse.json({ makers: [] })
  }
}
