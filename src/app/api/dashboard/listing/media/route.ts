/**
 * /api/dashboard/listing/media — push a photo to the connected GBP listing.
 * Legacy v4 mybusiness media endpoint. The owner picks an image from their
 * asset library; we hand Google its public URL.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { uploadPhotoToGbp, type GbpPhotoCategory } from '@/lib/gbp-media'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(req: NextRequest) {
  const { user, clientId } = await resolveCurrentClient(req.nextUrl.searchParams.get('clientId'))
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!clientId) return NextResponse.json({ error: 'No client context' }, { status: 403 })

  const body = await req.json().catch(() => null) as {
    sourceUrl?: string
    category?: GbpPhotoCategory
    locationId?: string | null
  } | null
  if (!body?.sourceUrl) return NextResponse.json({ error: 'Missing sourceUrl' }, { status: 400 })

  const result = await uploadPhotoToGbp(clientId, body.sourceUrl, {
    category: body.category,
    locationId: body.locationId ?? null,
  })

  try {
    const admin = createAdminClient()
    await admin.from('gbp_listing_audit').insert({
      client_id: clientId,
      actor_user_id: user.id,
      actor_email: user.email ?? null,
      action: 'add_photo',
      fields: { category: body.category ?? 'ADDITIONAL', sourceUrl: body.sourceUrl },
      error: result.ok ? null : result.error,
    })
  } catch { /* never block on audit failure */ }

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 })
  return NextResponse.json({ ok: true, googleUrl: result.googleUrl })
}
