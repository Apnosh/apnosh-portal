/**
 * POST /api/dashboard/listing/post — publish a "What's new" local post to
 * the owner's Google Business Profile (v4 localPosts). Optional single photo.
 * This is a public write to the live listing.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { getActiveTokenForClient } from '@/lib/gbp-menu'
import { publishToGbp } from '@/lib/publish/gbp'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(req: NextRequest) {
  const { user, clientId } = await resolveCurrentClient()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!clientId) return NextResponse.json({ error: 'No client context' }, { status: 403 })

  const body = await req.json().catch(() => null) as { text?: string; imageUrl?: string | null } | null
  const text = body?.text?.trim()
  if (!text) return NextResponse.json({ error: 'Post text is required' }, { status: 400 })

  const tok = await getActiveTokenForClient(clientId, null)
  if ('error' in tok) return NextResponse.json({ error: tok.error }, { status: 409 })

  const result = await publishToGbp({
    resourceName: tok.v4Path,
    accessToken: tok.accessToken,
    text,
    mediaUrls: body?.imageUrl ? [body.imageUrl] : [],
  })

  try {
    const admin = createAdminClient()
    await admin.from('gbp_listing_audit').insert({
      client_id: clientId,
      actor_user_id: user.id,
      actor_email: user.email ?? null,
      action: 'create_post',
      fields: { length: text.length, hasPhoto: !!body?.imageUrl },
      error: result.success ? null : result.error,
    })
  } catch { /* never block on audit failure */ }

  if (!result.success) return NextResponse.json({ error: result.error ?? 'Failed to publish' }, { status: 502 })
  return NextResponse.json({ ok: true, searchUrl: result.searchUrl ?? null })
}
