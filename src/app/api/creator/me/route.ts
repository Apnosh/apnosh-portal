import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCreatorIdForUser, listWorkOrdersForCreator, getCreatorEarnings } from '@/lib/campaigns/work-orders'
import { creatorRatingAggregate, getRatingsForOrders } from '@/lib/campaigns/work-ratings'
import { ratingLabel } from '@/lib/campaigns/work-ratings-core'
import { calendarForCreator } from '@/lib/marketplace/creator-calendar-data'

// The logged-in creator's own inbox: resolves which creator this user IS
// (creator_logins) and returns their orders. No param to spoof, unlike the
// admin ?creator= preview. `ratingLabel` is the creator's own live aggregate
// from real work_ratings rows — "No ratings yet" until a client actually rates.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const creatorId = await getCreatorIdForUser(user.id)
  if (!creatorId) return NextResponse.json({ creatorId: null, orders: [], calendar: [] })
  const [orders, earnings, rating, calendar] = await Promise.all([
    listWorkOrdersForCreator(creatorId),
    getCreatorEarnings(creatorId).catch(() => null),
    creatorRatingAggregate(creatorId).catch(() => null),
    calendarForCreator(creatorId).catch(() => []),
  ])
  // Per-order stars so the history list can show what each delivery earned.
  const ratingRows = await getRatingsForOrders(orders.map((o) => o.id)).catch(() => new Map())
  const ratingsByOrder: Record<string, number> = {}
  for (const [oid, r] of ratingRows) ratingsByOrder[oid] = r.stars
  return NextResponse.json({ creatorId, orders, calendar, earnings, rating, ratingLabel: ratingLabel(rating), ratingsByOrder })
}
