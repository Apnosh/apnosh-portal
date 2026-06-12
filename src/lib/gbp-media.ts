/**
 * Upload a photo to a client's Google Business Profile listing.
 *
 * Photos (media) live on the legacy v4 mybusiness API:
 *   POST accounts/{a}/locations/{l}/media
 *   body { mediaFormat: 'PHOTO', locationAssociation: { category }, sourceUrl }
 *
 * We pass `sourceUrl` (Google fetches the image itself) rather than uploading
 * bytes, since our assets already live at public Supabase Storage URLs. The
 * URL must be publicly reachable; Google enforces format/size (JPG or PNG,
 * roughly 250x250 min, 10MB max).
 *
 * Requires the v4 "Google My Business API" to be enabled on the project and
 * the connection's token to hold the business.manage scope.
 */

import { getActiveTokenForClient } from '@/lib/gbp-menu'

const V4_BASE = 'https://mybusiness.googleapis.com/v4'

/** GBP media categories the owner can choose from (subset of the v4 enum). */
export type GbpPhotoCategory =
  | 'ADDITIONAL' | 'COVER' | 'PROFILE' | 'LOGO'
  | 'FOOD_AND_DRINK' | 'INTERIOR' | 'EXTERIOR' | 'MENU' | 'PRODUCT'

export const GBP_PHOTO_CATEGORIES: { value: GbpPhotoCategory; label: string }[] = [
  { value: 'ADDITIONAL', label: 'Additional' },
  { value: 'COVER', label: 'Cover photo' },
  { value: 'LOGO', label: 'Logo' },
  { value: 'FOOD_AND_DRINK', label: 'Food & drink' },
  { value: 'INTERIOR', label: 'Interior' },
  { value: 'EXTERIOR', label: 'Exterior' },
  { value: 'MENU', label: 'Menu' },
  { value: 'PRODUCT', label: 'Product' },
]

export async function uploadPhotoToGbp(
  clientId: string,
  sourceUrl: string,
  opts?: { category?: GbpPhotoCategory; locationId?: string | null },
): Promise<{ ok: true; name: string; googleUrl: string | null } | { ok: false; error: string }> {
  if (!sourceUrl) return { ok: false, error: 'Missing photo URL' }

  const tok = await getActiveTokenForClient(clientId, opts?.locationId ?? null)
  if ('error' in tok) return { ok: false, error: tok.error }

  let res: Response
  try {
    res = await fetch(`${V4_BASE}/${tok.v4Path}/media`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mediaFormat: 'PHOTO',
        locationAssociation: { category: opts?.category ?? 'ADDITIONAL' },
        sourceUrl,
      }),
    })
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }

  const body = await res.json().catch(() => ({})) as {
    name?: string; googleUrl?: string; thumbnailUrl?: string
    error?: { message?: string }
  }
  if (!res.ok) {
    return { ok: false, error: body?.error?.message || `HTTP ${res.status}` }
  }
  return { ok: true, name: body.name ?? '', googleUrl: body.googleUrl ?? body.thumbnailUrl ?? null }
}
