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
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET(req: NextRequest) {
  const { user, clientId } = await resolveCurrentClient()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!clientId) return NextResponse.json({ error: 'No client context' }, { status: 403 })

  const locationId = req.nextUrl.searchParams.get('locationId')
  const result = await getClientListing(clientId, locationId)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 })
  return NextResponse.json(result)
}

export async function PATCH(req: NextRequest) {
  const { user, clientId } = await resolveCurrentClient()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!clientId) return NextResponse.json({ error: 'No client context' }, { status: 403 })

  const body = await req.json().catch(() => null) as (ListingFields & { locationId?: string }) | null
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const { locationId, ...patch } = body
  const result = await updateClientListing(clientId, patch, locationId ?? null)

  /* Audit log — fire-and-forget. We capture which top-level fields
     the owner touched + the actor identity, not the values themselves
     (descriptions can be sensitive). On failure we still log so we
     have a trail of attempted edits + error reason. */
  try {
    const admin = createAdminClient()
    await admin.from('gbp_listing_audit').insert({
      client_id: clientId,
      actor_user_id: user.id,
      actor_email: user.email ?? null,
      action: 'update_listing',
      fields: { changedFields: Object.keys(patch), locationId: locationId ?? null },
      error: result.ok ? null : result.error,
    })
  } catch { /* never block a save on audit failure */ }

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 })
  return NextResponse.json({ ok: true })
}
