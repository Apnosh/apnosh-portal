/**
 * POST /api/dashboard/gbp-photo  { clientId, sourceUrl }
 *
 * Adds ONE photo to the owner's live Google Business Profile. The owner's file
 * is uploaded first (client-side) to the existing 'client-graphics' Supabase
 * bucket via /api/dashboard/upload-asset, which returns a public https URL;
 * that URL is passed here as `sourceUrl`. Google fetches the image itself (the
 * v4 media-create rail in src/lib/gbp-media.ts), so no bytes flow through this
 * route.
 *
 * Gates, in order (same pattern as gbp-apply):
 *   1. checkClientAccess — signed-in user must be linked to the client
 *   2. isProTier — 403 for non-Pro plans (server-enforced, never UI-only)
 *   3. validate the sourceUrl is https and points at an image we uploaded
 *   4. uploadPhotoToGbp — the existing v4 media create
 *
 * Honesty: a photo CREATE has no prior value to read back, so the returned
 * media resource IS the confirmation. live:true only when Google returned a
 * created resource. Response:
 *   200 { ok: true, live: boolean, photoUrl: string|null }
 *   4xx/5xx { ok: false, error: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { isProTier } from '@/lib/entitlements'
import { uploadPhotoToGbp } from '@/lib/gbp-media'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

function denied(reason: string | undefined) {
  return NextResponse.json({ error: reason ?? 'forbidden' }, { status: reason === 'unauthenticated' ? 401 : 403 })
}

// The photo URL must be an https link to an image (the extensions upload-asset
// sets). Deterministic + offline: no HEAD request needed.
const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif|avif|heic|heif)(\?|#|$)/i

/** True when the URL is a well-formed https link ending in an image extension. */
export function isValidPhotoUrl(url: unknown): url is string {
  if (typeof url !== 'string' || !url.trim()) return false
  const v = url.trim()
  let parsed: URL
  try {
    parsed = new URL(v)
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:') return false
  return IMAGE_EXT_RE.test(parsed.pathname)
}

export async function POST(req: NextRequest) {
  let body: { clientId?: unknown; sourceUrl?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'clientId required' }, { status: 400 })
  }
  const clientId = typeof body.clientId === 'string' && body.clientId ? body.clientId : null
  if (!clientId) return NextResponse.json({ ok: false, error: 'clientId required' }, { status: 400 })

  // Gate 1: the signed-in user must actually be this client.
  const access = await checkClientAccess(clientId)
  if (!access.authorized) return denied(access.reason)

  // Gate 2: Pro plan, enforced at the SERVER (never trust the client UI alone).
  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return NextResponse.json({ ok: false, error: 'Could not add the photo right now. Try again in a minute.' }, { status: 502 })
  }
  const { data: row } = await admin.from('clients').select('tier').eq('id', clientId).maybeSingle()
  if (!isProTier((row as { tier?: string | null } | null)?.tier)) {
    return NextResponse.json({ error: 'Adding photos to Google is on the Pro plan.' }, { status: 403 })
  }

  // Gate 3: the URL must be an https image link (one we set on upload).
  if (!isValidPhotoUrl(body.sourceUrl)) {
    return NextResponse.json({ ok: false, error: 'That is not a photo we can add. Upload a JPG or PNG and try again.' }, { status: 400 })
  }

  // Gate 4: the existing v4 media create. A create has no prior value to read
  // back, so a returned resource IS the proof — live:true only on ok.
  const result = await uploadPhotoToGbp(clientId, body.sourceUrl)
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: 'We could not add the photo to Google right now. Try again in a minute.' }, { status: 502 })
  }
  return NextResponse.json({ ok: true, live: true, photoUrl: result.googleUrl ?? null })
}
