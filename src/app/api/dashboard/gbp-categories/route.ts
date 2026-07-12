/**
 * GET /api/dashboard/gbp-categories?clientId=…&q=<query>
 *
 * Searches Google's business-category taxonomy for the in-app category picker.
 * Reading the taxonomy is harmless (no writes, no listing changes), so this is
 * gated by checkClientAccess ONLY — every tier can search. The owner Save that
 * follows still goes through the Pro-gated /api/dashboard/gbp-apply rail.
 *
 * Returns up to 20 matches: [{ name, displayName }] where `name` is the
 * "categories/gcid:..." resource name the Save rail expects.
 */

import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { searchListingCategories } from '@/lib/gbp-listing'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

function denied(reason: string | undefined) {
  return NextResponse.json({ error: reason ?? 'forbidden' }, { status: reason === 'unauthenticated' ? 401 : 403 })
}

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim()

  const access = await checkClientAccess(clientId)
  if (!access.authorized) return denied(access.reason)

  // A too-short query returns nothing rather than a noisy taxonomy dump.
  if (q.length < 2) return NextResponse.json({ categories: [] })

  try {
    const res = await searchListingCategories(clientId, q)
    if (!res.ok) {
      return NextResponse.json({ error: 'We could not search categories right now. Try again in a minute.' }, { status: 502 })
    }
    return NextResponse.json({ categories: res.categories.slice(0, 20) })
  } catch {
    return NextResponse.json({ error: 'We could not search categories right now. Try again in a minute.' }, { status: 502 })
  }
}
