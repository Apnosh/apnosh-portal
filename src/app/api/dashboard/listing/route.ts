/**
 * /api/dashboard/listing — read + write the connected GBP listing.
 *
 * GET:  returns current title + description + phone + website + hours
 *       from the v1 Business Information API for the calling client.
 * PATCH: updates any subset of those fields back via v1.
 *
 * Both endpoints scope to the caller's own client_id; admins viewing
 * a different client would need a parallel /work surface.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { getClientListing, updateClientListing, type ListingFields } from '@/lib/gbp-listing'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET() {
  const { user, clientId } = await resolveCurrentClient()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!clientId) return NextResponse.json({ error: 'No client context' }, { status: 403 })

  const result = await getClientListing(clientId)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 })
  return NextResponse.json(result)
}

export async function PATCH(req: NextRequest) {
  const { user, clientId } = await resolveCurrentClient()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!clientId) return NextResponse.json({ error: 'No client context' }, { status: 403 })

  const body = await req.json().catch(() => null) as ListingFields | null
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const result = await updateClientListing(clientId, body)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 })
  return NextResponse.json({ ok: true })
}
