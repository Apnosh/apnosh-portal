/**
 * /api/dashboard/listing/attributes — read + write the connected GBP
 * listing's boolean attributes (dine-in, delivery, accepts_reservations, …).
 *
 * Uses the v1 mybusinessbusinessinformation API. Independent of the
 * core listing route because attributes live on a separate sub-resource
 * with its own update mask.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { getClientAttributes, updateClientAttributes, RESTAURANT_ATTRIBUTES, type AttributeValues } from '@/lib/gbp-listing'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET(req: NextRequest) {
  const { user, clientId } = await resolveCurrentClient()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!clientId) return NextResponse.json({ error: 'No client context' }, { status: 403 })

  const locationId = req.nextUrl.searchParams.get('locationId')
  const result = await getClientAttributes(clientId, locationId)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 })
  return NextResponse.json({ values: result.values, catalog: RESTAURANT_ATTRIBUTES })
}

export async function PATCH(req: NextRequest) {
  const { user, clientId } = await resolveCurrentClient()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!clientId) return NextResponse.json({ error: 'No client context' }, { status: 403 })

  const body = await req.json().catch(() => null) as { values?: AttributeValues; locationId?: string } | null
  if (!body?.values) return NextResponse.json({ error: 'Missing values' }, { status: 400 })

  const result = await updateClientAttributes(clientId, body.values, body.locationId ?? null)

  try {
    const admin = createAdminClient()
    await admin.from('gbp_listing_audit').insert({
      client_id: clientId,
      actor_user_id: user.id,
      actor_email: user.email ?? null,
      action: 'update_attributes',
      fields: Object.keys(body.values),
      error: result.ok ? null : result.error,
    })
  } catch { /* never block a save on audit failure */ }

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 })
  return NextResponse.json({ ok: true })
}
