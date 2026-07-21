/**
 * Order / reserve "action links" on the Google Business Profile listing.
 *
 * These are the Order online / Delivery / Takeout / Reserve buttons Google
 * shows on the listing. They live on the dedicated Place Actions API
 * (mybusinessplaceactions.googleapis.com), keyed by `locations/{id}`.
 *
 * We can only edit MERCHANT links we created (isEditable). Aggregator links
 * Google adds itself (DoorDash, etc.) are read-only.
 */

import { getActiveTokenForClient } from '@/lib/gbp-menu'

const BASE = 'https://mybusinessplaceactions.googleapis.com/v1'

export type PlaceActionType = 'FOOD_ORDERING' | 'FOOD_DELIVERY' | 'FOOD_TAKEOUT' | 'DINING_RESERVATION'

export const PLACE_ACTION_TYPES: { value: PlaceActionType; label: string; hint: string }[] = [
  { value: 'FOOD_ORDERING', label: 'Order online', hint: 'Your own online ordering page' },
  { value: 'FOOD_DELIVERY', label: 'Delivery', hint: 'Delivery ordering link' },
  { value: 'FOOD_TAKEOUT', label: 'Takeout', hint: 'Pickup / takeout ordering link' },
  { value: 'DINING_RESERVATION', label: 'Reserve a table', hint: 'OpenTable, Resy, or your booking page' },
]

export interface PlaceActionLink {
  name: string
  uri: string
  placeActionType: string
  providerType?: string
  isEditable?: boolean
}

function locationPath(v4Path: string): string | null {
  const id = v4Path.split('/locations/')[1]
  return id ? `locations/${id}` : null
}

export async function listPlaceActionLinks(
  clientId: string,
): Promise<{ ok: true; links: PlaceActionLink[] } | { ok: false; error: string }> {
  const tok = await getActiveTokenForClient(clientId, null)
  if ('error' in tok) return { ok: false, error: tok.error }
  const loc = locationPath(tok.v4Path)
  if (!loc) return { ok: false, error: 'No GBP location resolved' }

  const res = await fetch(`${BASE}/${loc}/placeActionLinks`, { headers: { Authorization: `Bearer ${tok.accessToken}` } })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) return { ok: false, error: body?.error?.message || `HTTP ${res.status}` }
  const links = ((body as { placeActionLinks?: PlaceActionLink[] }).placeActionLinks ?? []).map(l => ({
    name: l.name, uri: l.uri, placeActionType: l.placeActionType, providerType: l.providerType, isEditable: l.isEditable,
  }))
  return { ok: true, links }
}

/** Reconcile our editable links to the desired {type -> uri} map: create new,
 *  patch changed, delete cleared. Aggregator/non-editable links are left alone. */
export async function savePlaceActionLinks(
  clientId: string,
  desired: Partial<Record<PlaceActionType, string>>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const tok = await getActiveTokenForClient(clientId, null)
  if ('error' in tok) return { ok: false, error: tok.error }
  const loc = locationPath(tok.v4Path)
  if (!loc) return { ok: false, error: 'No GBP location resolved' }
  const auth = { Authorization: `Bearer ${tok.accessToken}`, 'Content-Type': 'application/json' }

  const current = await listPlaceActionLinks(clientId)
  if (!current.ok) return { ok: false, error: current.error }
  // Our editable merchant link per type (we only manage one per type).
  const mine = new Map<string, PlaceActionLink>()
  for (const l of current.links) {
    if (l.isEditable !== false && l.providerType !== 'AGGREGATOR_3P') mine.set(l.placeActionType, l)
  }

  for (const t of PLACE_ACTION_TYPES) {
    const uri = (desired[t.value] ?? '').trim()
    const existing = mine.get(t.value)
    try {
      // Every branch checks the response. These used to be bare awaits with the result
      // thrown away, so a link Google refused still reported ok:true and the owner was
      // told their button was fixed when it was not.
      let res: Response | null = null
      let what = ''
      if (uri && existing && existing.uri !== uri) {
        what = `update ${t.label}`
        res = await fetch(`${BASE}/${existing.name}?updateMask=uri`, { method: 'PATCH', headers: auth, body: JSON.stringify({ uri }) })
      } else if (uri && !existing) {
        what = `add ${t.label}`
        res = await fetch(`${BASE}/${loc}/placeActionLinks`, { method: 'POST', headers: auth, body: JSON.stringify({ uri, placeActionType: t.value }) })
      } else if (!uri && existing) {
        what = `remove ${t.label}`
        res = await fetch(`${BASE}/${existing.name}`, { method: 'DELETE', headers: { Authorization: `Bearer ${tok.accessToken}` } })
      }
      if (res && !res.ok) {
        const body = await res.json().catch(() => ({}))
        const detail = (body as { error?: { message?: string } })?.error?.message
        return { ok: false, error: `Could not ${what}: ${detail || `HTTP ${res.status}`}` }
      }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  }
  return { ok: true }
}
