/**
 * /api/dashboard/listing/categories — search Google's category catalog.
 *
 * GET with ?q=<search term> returns up to 20 categories that match.
 * Used by the typeahead in the listing editor when an owner is
 * adding or changing their primary/additional categories.
 *
 * Categories themselves are saved through the main /api/dashboard/listing
 * PATCH endpoint (categories: {...}) — this route is read-only and only
 * exists because Google requires an authenticated token to search the
 * catalog.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { searchListingCategories } from '@/lib/gbp-listing'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const { user, clientId } = await resolveCurrentClient()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!clientId) return NextResponse.json({ error: 'No client context' }, { status: 403 })

  const q = req.nextUrl.searchParams.get('q') ?? ''
  const result = await searchListingCategories(clientId, q)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 })
  return NextResponse.json({ categories: result.categories })
}
