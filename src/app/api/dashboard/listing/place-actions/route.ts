/**
 * /api/dashboard/listing/place-actions — read/write the order & reserve
 * action links on the connected Google Business Profile.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { listPlaceActionLinks, savePlaceActionLinks, PLACE_ACTION_TYPES, type PlaceActionType } from '@/lib/gbp-place-actions'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET(req: NextRequest) {
  const { user, clientId } = await resolveCurrentClient(req.nextUrl.searchParams.get('clientId'))
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!clientId) return NextResponse.json({ error: 'No client context' }, { status: 403 })

  const result = await listPlaceActionLinks(clientId)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 })
  return NextResponse.json({ links: result.links, types: PLACE_ACTION_TYPES })
}

export async function PATCH(req: NextRequest) {
  const { user, clientId } = await resolveCurrentClient(req.nextUrl.searchParams.get('clientId'))
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!clientId) return NextResponse.json({ error: 'No client context' }, { status: 403 })

  const body = await req.json().catch(() => null) as { links?: Partial<Record<PlaceActionType, string>> } | null
  if (!body?.links) return NextResponse.json({ error: 'Missing links' }, { status: 400 })

  const result = await savePlaceActionLinks(clientId, body.links)

  try {
    const admin = createAdminClient()
    await admin.from('gbp_listing_audit').insert({
      client_id: clientId, actor_user_id: user.id, actor_email: user.email ?? null,
      action: 'update_place_actions', fields: { types: Object.keys(body.links) }, error: result.ok ? null : result.error,
    })
  } catch { /* ignore */ }

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 })
  return NextResponse.json({ ok: true })
}
