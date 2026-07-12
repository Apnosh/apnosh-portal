import 'server-only'
/**
 * gbp-attributes — the READ side of the Google listing attribute groups the
 * diagnosis grades:
 *
 *   getting : parking + wheelchair access ("Getting here")
 *   seating : indoor/outdoor seating, restroom, laptop friendly, Wi-Fi
 *   service : dine in, takeout, delivery, curbside, payments
 *
 * Two Google v1 calls per read, merged honestly:
 *   1. Attribute METADATA — which attributes are VALID for this location and
 *      their human display names:
 *        GET {V1_BASE}/attributes?parent=locations/{l}&pageSize=200
 *      Only attributes present here are ever shown, so we never offer the
 *      owner something Google would refuse to save.
 *   2. Current VALUES on the listing:
 *        GET {V1_BASE}/locations/{l}/attributes
 *      An attribute with no value row is `null` = the owner never answered.
 *
 * Only BOOL attributes are in scope (yes/no toggles). URL/enum attributes
 * (e.g. url_menu) are handled by their own dedicated rails.
 *
 * Curation is by case-insensitive substring match of concept words against
 * the attribute id — no hardcoded per-location lists, so a location whose
 * category unlocks extra attributes (or lacks some) is always shown exactly
 * what Google supports for IT. A failed read returns { ok: false } — the
 * caller renders "could not read", never an invented list.
 */

import { getActiveTokenForClient } from '@/lib/gbp-menu'

const V1_BASE = 'https://mybusinessbusinessinformation.googleapis.com/v1'

export interface GbpAttributeItem {
  /** Bare attribute id, e.g. "has_outdoor_seating" (no "attributes/" prefix). */
  id: string
  /** Google's display name for the attribute, e.g. "Outdoor seating". */
  label: string
  /** true/false as set on Google; null = the owner never answered it. */
  value: boolean | null
}

export type GbpAttributeGroupKey = 'getting' | 'seating' | 'service'

export interface GbpAttributeGroups {
  getting: GbpAttributeItem[]
  seating: GbpAttributeItem[]
  service: GbpAttributeItem[]
}

export type GbpAttributesRead =
  | { ok: true; groups: GbpAttributeGroups }
  | { ok: false; error: string }

/* Concept words per group, matched case-insensitively as substrings of the
   attribute id. FIRST MATCH WINS in the order below, so an attribute that
   matches two groups (e.g. wheelchair_accessible_restroom hits both
   "wheelchair" and "restroom") lands in exactly one. */
const GROUP_CONCEPTS: Array<{ key: GbpAttributeGroupKey; concepts: string[] }> = [
  { key: 'getting', concepts: ['parking', 'wheelchair'] },
  { key: 'seating', concepts: ['seating', 'outdoor', 'restroom', 'good_for_working', 'wi_fi'] },
  { key: 'service', concepts: ['dine_in', 'takeout', 'delivery', 'curbside', 'pay', 'payment', 'credit_card', 'nfc'] },
]

/** Keep each group scannable for an owner on a phone. */
export const ATTRIBUTE_GROUP_CAP = 8

/* ── Defensive parsing helpers ─────────────────────────────────────
   Attribute ids appear in three shapes across the API surface:
     - metadata attributeId: "has_dine_in" OR "attributes/has_dine_in"
     - value name: "attributes/has_dine_in" OR
       "locations/{l}/attributes/has_dine_in"
   Normalize all of them to the bare id. */
function bareAttributeId(raw: string): string {
  const afterPath = raw.split('/attributes/').pop() ?? raw
  return afterPath.replace(/^attributes\//, '')
}

/** Fallback label when metadata has no displayName: "has_outdoor_seating" → "Outdoor seating". */
function humanizeId(id: string): string {
  const words = id.replace(/^(has|accepts|serves)_/, '').replace(/_/g, ' ').trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : id
}

function groupFor(id: string): GbpAttributeGroupKey | null {
  const lower = id.toLowerCase()
  for (const g of GROUP_CONCEPTS) {
    if (g.concepts.some((c) => lower.includes(c))) return g.key
  }
  return null
}

interface RawAttributeMetadata {
  attributeId?: string
  /** The LIVE v1 response carries the id here: parent: "attributes/{id}"
   *  (verified against production 2026-07-11). */
  parent?: string
  /** Some API versions carry the id under `name` instead. */
  name?: string
  valueType?: string
  displayName?: string
}

interface RawAttributeValue {
  name?: string
  valueType?: string
  values?: unknown[]
}

/**
 * Read the curated attribute groups for a client's connected location.
 * Both Google calls must succeed — a partial merge would let us show an
 * attribute as "not set" when we simply failed to read its value.
 */
export async function readGbpAttributes(clientId: string): Promise<GbpAttributesRead> {
  const tok = await getActiveTokenForClient(clientId, null)
  if ('error' in tok) return { ok: false, error: tok.error }
  const m = /locations\/([^/]+)/.exec(tok.v4Path)
  if (!m) return { ok: false, error: 'Unrecognised location resource shape' }
  const loc = `locations/${m[1]}`
  const headers = { Authorization: `Bearer ${tok.accessToken}` }

  let metaRes: Response
  let valRes: Response
  try {
    ;[metaRes, valRes] = await Promise.all([
      fetch(`${V1_BASE}/attributes?parent=${encodeURIComponent(loc)}&pageSize=200`, { headers }),
      fetch(`${V1_BASE}/${loc}/attributes`, { headers }),
    ])
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }

  type MetaBody = {
    attributeMetadata?: RawAttributeMetadata[]
    attributes?: RawAttributeMetadata[]
    nextPageToken?: string
    error?: { message?: string }
  }
  const metaBody = await metaRes.json().catch(() => ({})) as MetaBody
  if (!metaRes.ok) return { ok: false, error: metaBody?.error?.message || `HTTP ${metaRes.status}` }

  /* The metadata list can span pages; follow up to 3 extra pages so a long
     category list cannot silently hide parking/seating attributes. */
  const allMetaRows: RawAttributeMetadata[] = [...(metaBody.attributeMetadata ?? metaBody.attributes ?? [])]
  let pageToken = metaBody.nextPageToken
  for (let page = 0; pageToken && page < 3; page++) {
    let more: Response
    try {
      more = await fetch(`${V1_BASE}/attributes?parent=${encodeURIComponent(loc)}&pageSize=200&pageToken=${encodeURIComponent(pageToken)}`, { headers })
    } catch {
      break
    }
    const moreBody = await more.json().catch(() => ({})) as MetaBody
    if (!more.ok) break
    allMetaRows.push(...(moreBody.attributeMetadata ?? moreBody.attributes ?? []))
    pageToken = moreBody.nextPageToken
  }

  const valBody = await valRes.json().catch(() => ({})) as {
    attributes?: RawAttributeValue[]
    error?: { message?: string }
  }
  if (!valRes.ok) return { ok: false, error: valBody?.error?.message || `HTTP ${valRes.status}` }

  /* Current values: bare id → boolean. Only BOOL rows with a real value. */
  const current = new Map<string, boolean>()
  for (const v of valBody.attributes ?? []) {
    if (!v.name) continue
    if ((v.valueType ?? 'BOOL') !== 'BOOL') continue
    if (!Array.isArray(v.values) || v.values.length === 0) continue
    current.set(bareAttributeId(v.name), !!v.values[0])
  }

  /* Metadata rows drive what is SHOWN: only attributes Google says are valid
     for this location, only BOOL, curated into groups, capped per group. */
  const groups: GbpAttributeGroups = { getting: [], seating: [], service: [] }
  const seen = new Set<string>()
  for (const meta of allMetaRows) {
    const rawId = meta.parent ?? meta.attributeId ?? meta.name ?? ''
    if (!rawId) continue
    if ((meta.valueType ?? '') !== 'BOOL') continue
    const id = bareAttributeId(rawId)
    if (seen.has(id)) continue
    const key = groupFor(id)
    if (!key) continue
    if (groups[key].length >= ATTRIBUTE_GROUP_CAP) continue
    seen.add(id)
    groups[key].push({
      id,
      label: (meta.displayName ?? '').trim() || humanizeId(id),
      value: current.has(id) ? (current.get(id) as boolean) : null,
    })
  }

  return { ok: true, groups }
}
