/**
 * /api/dashboard/creator-cards — the creator packages that appear inside the campaigns store.
 *
 * Feeds the store's "From local creators" spotlight and the mixed-in content-shelf cards, so a
 * restaurant browsing the store sees real creators' offerings next to Apnosh's own. Washington
 * only for v1, matching the marketplace's service area. Never errors the store: on any failure
 * it returns an empty list and the store shows just the Apnosh catalog.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { getCreatorStoreCards } from '@/lib/marketplace/store-cards'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const { user } = await resolveCurrentClient(req.nextUrl.searchParams.get('clientId'))
  if (!user) return NextResponse.json({ cards: [] })
  const cards = await getCreatorStoreCards('WA').catch(() => [])
  return NextResponse.json({ cards })
}
