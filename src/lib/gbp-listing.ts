/**
 * Read and update a client's Google Business Profile listing fields.
 *
 * Uses the v1 mybusinessbusinessinformation API (already approved + enabled).
 * Per-client OAuth token from channel_connections — the listing edits
 * here are scoped to the location the owner connected to the portal.
 *
 * Field coverage (v1):
 *   - profile.description        Business description shown on Google
 *   - phoneNumbers.primaryPhone  Primary phone number
 *   - websiteUri                 Restaurant website
 *   - regularHours               Weekly opening hours
 *
 * Photos, categories, address, attributes, and more all exist on v1
 * but each has different validation rules (e.g. category requires
 * picking from Google's taxonomy) — defer until owner asks.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { refreshGoogleToken } from '@/lib/google'

const V1_BASE = 'https://mybusinessbusinessinformation.googleapis.com/v1'

export interface ListingFields {
  description?: string | null
  primaryPhone?: string | null
  websiteUri?: string | null
  regularHours?: WeeklyHours | null
  specialHours?: SpecialHours | null
  categories?: ListingCategories | null
}

export interface ListingCategory {
  /** Full resource name e.g. "categories/gcid:restaurant" */
  name: string
  displayName: string
}

export interface ListingCategories {
  primary: ListingCategory | null
  additional: ListingCategory[]
}

export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

/* Per day: array of {open, close} ranges in HH:MM (24h). Empty array
   means closed for that day. */
export type WeeklyHours = Record<DayKey, Array<{ open: string; close: string }>>

/* Date-specific overrides. Each entry is one calendar day where the
   restaurant deviates from regular hours: closed (e.g. holidays) or
   on alternate hours (e.g. limited Thanksgiving service). */
export type SpecialHours = Array<{
  date: string  /* YYYY-MM-DD */
  closed: boolean
  /* Used only when closed === false. */
  open?: string
  close?: string
}>

const DAY_TO_GBP: Record<DayKey, string> = {
  mon: 'MONDAY', tue: 'TUESDAY', wed: 'WEDNESDAY', thu: 'THURSDAY',
  fri: 'FRIDAY', sat: 'SATURDAY', sun: 'SUNDAY',
}

const GBP_TO_DAY: Record<string, DayKey> = Object.fromEntries(
  Object.entries(DAY_TO_GBP).map(([k, v]) => [v, k as DayKey])
)

/* ── Token helpers ─────────────────────────────────────────────── */

interface TokenRow {
  id: string
  access_token: string | null
  refresh_token: string | null
  token_expires_at: string | null
  platform_account_id: string | null
}

async function getActiveTokenForClient(
  clientId: string,
  /* Optional client_locations.id. When set, we operate on that
     location's GBP resource instead of the primary stored in
     channel_connections — same OAuth token works for any location
     the connecting account manages. */
  locationId?: string | null,
): Promise<{
  accessToken: string
  resourceName: string
} | { error: string }> {
  const admin = createAdminClient()
  /* Multi-location clients have one channel_connections row per
     linked location. Tokens are identical across rows; pick the
     most recently connected. .maybeSingle() alone would error on
     >1 matching row. */
  const { data: row } = await admin
    .from('channel_connections')
    .select('id, access_token, refresh_token, token_expires_at, platform_account_id')
    .eq('client_id', clientId)
    .eq('channel', 'google_business_profile')
    .eq('status', 'active')
    .neq('platform_account_id', 'pending')
    .order('connected_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const conn = row as TokenRow | null
  if (!conn?.access_token) return { error: 'No active Google Business Profile connection' }
  if (!conn.platform_account_id || conn.platform_account_id === 'pending') {
    return { error: 'Google Business Profile connection is not finalized — re-sync first' }
  }

  /* Resolve which location to operate on. Default = primary from
     channel_connections.platform_account_id; override = caller-supplied
     locationId (a client_locations.id). */
  let resourceName: string
  if (locationId) {
    const { data: loc } = await admin
      .from('client_locations')
      .select('gbp_location_id')
      .eq('id', locationId)
      .eq('client_id', clientId)
      .maybeSingle()
    const rawId = loc?.gbp_location_id as string | null | undefined
    if (!rawId) return { error: 'Location not found for this client' }
    /* gbp_location_id stores "gbp_loc_<numeric>"; v1 endpoint needs
       "locations/<numeric>". Tolerate either format defensively. */
    const stripped = rawId.replace(/^gbp_loc_/, '')
    resourceName = `locations/${stripped}`
  } else {
    /* Stored as accounts/{a}/locations/{l}; v1 endpoint takes just locations/{l}. */
    const m = /locations\/([^/]+)/.exec(conn.platform_account_id)
    if (!m) return { error: 'Unrecognised location resource shape' }
    resourceName = `locations/${m[1]}`
  }

  let accessToken = conn.access_token
  const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0
  if (expiresAt - Date.now() < 60_000 && conn.refresh_token) {
    try {
      const refreshed = await refreshGoogleToken(conn.refresh_token)
      accessToken = refreshed.access_token
      const newExpires = new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
      /* Update every active GBP row for this client so siblings
         don't keep firing stale-token refreshes. */
      await admin
        .from('channel_connections')
        .update({ access_token: accessToken, token_expires_at: newExpires })
        .eq('client_id', clientId)
        .eq('channel', 'google_business_profile')
        .eq('status', 'active')
    } catch (err) {
      return { error: `Token refresh failed: ${(err as Error).message}` }
    }
  }

  return { accessToken, resourceName }
}

/* ── Hours parsing ─────────────────────────────────────────────── */

interface GbpPeriod {
  openDay: string
  openTime: { hours?: number; minutes?: number }
  closeDay: string
  closeTime: { hours?: number; minutes?: number }
}

function hh(t?: { hours?: number; minutes?: number }): string {
  const h = String(t?.hours ?? 0).padStart(2, '0')
  const m = String(t?.minutes ?? 0).padStart(2, '0')
  return `${h}:${m}`
}

function periodsToWeekly(periods: GbpPeriod[] | undefined): WeeklyHours {
  const out: WeeklyHours = {
    mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [],
  }
  for (const p of periods ?? []) {
    const day = GBP_TO_DAY[p.openDay]
    if (!day) continue
    const open = hh(p.openTime)
    /* If close day differs from open day, the range crosses midnight —
       represent as close at "24:00". */
    const sameDay = p.closeDay === p.openDay
    const close = sameDay ? hh(p.closeTime) : '24:00'
    out[day].push({ open, close })
  }
  return out
}

interface GbpDate { year: number; month: number; day: number }
interface GbpSpecialPeriod {
  startDate: GbpDate
  endDate?: GbpDate
  closed?: boolean
  openTime?: { hours?: number; minutes?: number }
  closeTime?: { hours?: number; minutes?: number }
}

function dateToYmd(d: GbpDate): string {
  const y = String(d.year).padStart(4, '0')
  const m = String(d.month).padStart(2, '0')
  const day = String(d.day).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function ymdToDate(ymd: string): GbpDate {
  const [y, m, d] = ymd.split('-').map(Number)
  return { year: y, month: m, day: d }
}

function specialPeriodsToList(periods: GbpSpecialPeriod[] | undefined): SpecialHours {
  return (periods ?? []).map(p => ({
    date: dateToYmd(p.startDate),
    closed: !!p.closed,
    open: !p.closed && p.openTime ? hh(p.openTime) : undefined,
    close: !p.closed && p.closeTime ? hh(p.closeTime) : undefined,
  }))
}

function specialListToPeriods(list: SpecialHours): GbpSpecialPeriod[] {
  return list
    .filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s.date))
    .map(s => {
      const d = ymdToDate(s.date)
      if (s.closed) {
        return { startDate: d, endDate: d, closed: true }
      }
      const [oh, om] = (s.open ?? '11:00').split(':').map(Number)
      const [ch, cm] = (s.close ?? '21:00').split(':').map(Number)
      return {
        startDate: d, endDate: d,
        closed: false,
        openTime: { hours: oh, minutes: om || 0 },
        closeTime: { hours: ch, minutes: cm || 0 },
      }
    })
}

function weeklyToGbpPeriods(weekly: WeeklyHours): GbpPeriod[] {
  const order: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
  const periods: GbpPeriod[] = []
  for (const day of order) {
    for (const range of weekly[day] ?? []) {
      const [oh, om] = range.open.split(':').map(Number)
      const isMid = range.close === '00:00' || range.close === '24:00'
      const closeDay = isMid ? order[(order.indexOf(day) + 1) % 7] : day
      const [ch, cm] = (isMid ? '00:00' : range.close).split(':').map(Number)
      periods.push({
        openDay: DAY_TO_GBP[day],
        openTime: { hours: oh, minutes: om || 0 },
        closeDay: DAY_TO_GBP[closeDay],
        closeTime: { hours: ch, minutes: cm || 0 },
      })
    }
  }
  return periods
}

/* ── Attributes ────────────────────────────────────────────────── */

/* Curated list of restaurant-relevant boolean attributes. Google's
   v1 API supports many more per-category, but listing all of them
   would overwhelm a restaurant owner. Add to this set as owners ask
   for them. The order here is the order the UI renders. */
export const RESTAURANT_ATTRIBUTES: Array<{ id: string; label: string; group: string }> = [
  /* Service options */
  { id: 'has_dine_in', label: 'Dine-in', group: 'Service options' },
  { id: 'has_takeout', label: 'Takeout', group: 'Service options' },
  { id: 'has_delivery', label: 'Delivery', group: 'Service options' },
  { id: 'has_curbside_pickup', label: 'Curbside pickup', group: 'Service options' },
  /* Amenities */
  { id: 'has_outdoor_seating', label: 'Outdoor seating', group: 'Amenities' },
  { id: 'wheelchair_accessible_entrance', label: 'Wheelchair-accessible entrance', group: 'Amenities' },
  { id: 'wheelchair_accessible_parking', label: 'Wheelchair-accessible parking', group: 'Amenities' },
  { id: 'wheelchair_accessible_restroom', label: 'Wheelchair-accessible restroom', group: 'Amenities' },
  /* Offerings */
  { id: 'serves_breakfast', label: 'Serves breakfast', group: 'Offerings' },
  { id: 'serves_lunch', label: 'Serves lunch', group: 'Offerings' },
  { id: 'serves_dinner', label: 'Serves dinner', group: 'Offerings' },
  { id: 'serves_brunch', label: 'Serves brunch', group: 'Offerings' },
  { id: 'serves_dessert', label: 'Serves dessert', group: 'Offerings' },
  { id: 'serves_coffee', label: 'Serves coffee', group: 'Offerings' },
  { id: 'serves_vegetarian_food', label: 'Vegetarian options', group: 'Offerings' },
  /* Planning */
  { id: 'accepts_reservations', label: 'Accepts reservations', group: 'Planning' },
  /* Payments */
  { id: 'accepts_credit_cards', label: 'Accepts credit cards', group: 'Payments' },
  { id: 'accepts_debit_cards', label: 'Accepts debit cards', group: 'Payments' },
  { id: 'accepts_cash_only', label: 'Cash only', group: 'Payments' },
  { id: 'accepts_nfc_mobile_payments', label: 'Accepts mobile / contactless payments', group: 'Payments' },
]

export type AttributeValues = Record<string, boolean>

interface RawAttribute {
  name: string
  valueType?: string
  values?: unknown[]
}

export async function getClientAttributes(clientId: string, locationId?: string | null): Promise<
  { ok: true; values: AttributeValues } | { ok: false; error: string }
> {
  const tok = await getActiveTokenForClient(clientId, locationId)
  if ('error' in tok) return { ok: false, error: tok.error }
  const url = `${V1_BASE}/${tok.resourceName}/attributes`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${tok.accessToken}` } })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) return { ok: false, error: body?.error?.message || `HTTP ${res.status}` }
  const out: AttributeValues = {}
  const attrs = ((body as { attributes?: RawAttribute[] }).attributes ?? [])
  for (const a of attrs) {
    const id = a.name.replace(/^attributes\//, '')
    if (a.valueType === 'BOOL' && Array.isArray(a.values) && a.values.length > 0) {
      out[id] = !!a.values[0]
    }
  }
  return { ok: true, values: out }
}

export async function updateClientAttributes(
  clientId: string,
  values: AttributeValues,
  locationId?: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const tok = await getActiveTokenForClient(clientId, locationId)
  if ('error' in tok) return { ok: false, error: tok.error }
  const attributes = Object.entries(values).map(([id, v]) => ({
    name: `attributes/${id}`,
    valueType: 'BOOL',
    values: [v],
  }))
  const url = `${V1_BASE}/${tok.resourceName}/attributes?updateMask=attributes`
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${tok.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: `${tok.resourceName}/attributes`, attributes }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) return { ok: false, error: body?.error?.message || `HTTP ${res.status}` }
  return { ok: true }
}

/* ── Read current listing ──────────────────────────────────────── */

export async function getClientListing(clientId: string, locationId?: string | null): Promise<{
  ok: true
  resourceName: string
  title: string | null
  fields: ListingFields
} | { ok: false; error: string }> {
  const tok = await getActiveTokenForClient(clientId, locationId)
  if ('error' in tok) return { ok: false, error: tok.error }
  const { accessToken, resourceName } = tok

  const readMask = 'title,profile,websiteUri,phoneNumbers,regularHours,specialHours,categories'
  const url = `${V1_BASE}/${resourceName}?readMask=${encodeURIComponent(readMask)}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    return { ok: false, error: body?.error?.message || `HTTP ${res.status}` }
  }
  const data = body as {
    title?: string
    profile?: { description?: string }
    phoneNumbers?: { primaryPhone?: string }
    websiteUri?: string
    regularHours?: { periods?: GbpPeriod[] }
    specialHours?: { specialHourPeriods?: GbpSpecialPeriod[] }
    categories?: {
      primaryCategory?: ListingCategory
      additionalCategories?: ListingCategory[]
    }
  }
  return {
    ok: true,
    resourceName,
    title: data.title ?? null,
    fields: {
      description: data.profile?.description ?? null,
      primaryPhone: data.phoneNumbers?.primaryPhone ?? null,
      websiteUri: data.websiteUri ?? null,
      regularHours: periodsToWeekly(data.regularHours?.periods),
      specialHours: specialPeriodsToList(data.specialHours?.specialHourPeriods),
      categories: {
        primary: data.categories?.primaryCategory
          ? { name: data.categories.primaryCategory.name, displayName: data.categories.primaryCategory.displayName }
          : null,
        additional: (data.categories?.additionalCategories ?? []).map(c => ({
          name: c.name,
          displayName: c.displayName,
        })),
      },
    },
  }
}

/* Search Google's category catalog. Returns up to 20 matching
   categories for a search term. Used by the typeahead in the
   listing editor's category picker. */
export async function searchListingCategories(clientId: string, query: string): Promise<
  { ok: true; categories: ListingCategory[] } | { ok: false; error: string }
> {
  if (!query || query.trim().length < 2) return { ok: true, categories: [] }
  const tok = await getActiveTokenForClient(clientId, null)
  if ('error' in tok) return { ok: false, error: tok.error }
  const url = `${V1_BASE}/categories:search?searchTerm=${encodeURIComponent(query.trim())}&regionCode=US&languageCode=en&view=BASIC&pageSize=20`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${tok.accessToken}` } })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) return { ok: false, error: body?.error?.message || `HTTP ${res.status}` }
  const categories = ((body as { categories?: Array<{ name: string; displayName: string }> }).categories ?? [])
    .map(c => ({ name: c.name, displayName: c.displayName }))
  return { ok: true, categories }
}

/* ── Write listing changes ─────────────────────────────────────── */

export async function updateClientListing(
  clientId: string,
  patch: ListingFields,
  locationId?: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const tok = await getActiveTokenForClient(clientId, locationId)
  if ('error' in tok) return { ok: false, error: tok.error }
  const { accessToken, resourceName } = tok

  /* GBP v1 PATCH requires updateMask listing exactly which fields are
     being changed. We only send the fields the caller provided so we
     never accidentally clobber something. */
  const updateMaskParts: string[] = []
  const body: Record<string, unknown> = {}

  if (patch.description !== undefined) {
    body.profile = { description: patch.description ?? '' }
    updateMaskParts.push('profile.description')
  }
  if (patch.primaryPhone !== undefined) {
    body.phoneNumbers = { primaryPhone: patch.primaryPhone ?? '' }
    updateMaskParts.push('phoneNumbers.primaryPhone')
  }
  if (patch.websiteUri !== undefined) {
    body.websiteUri = patch.websiteUri ?? ''
    updateMaskParts.push('websiteUri')
  }
  if (patch.regularHours !== undefined) {
    body.regularHours = patch.regularHours
      ? { periods: weeklyToGbpPeriods(patch.regularHours) }
      : { periods: [] }
    updateMaskParts.push('regularHours')
  }
  if (patch.specialHours !== undefined) {
    body.specialHours = patch.specialHours
      ? { specialHourPeriods: specialListToPeriods(patch.specialHours) }
      : { specialHourPeriods: [] }
    updateMaskParts.push('specialHours')
  }
  if (patch.categories !== undefined && patch.categories) {
    body.categories = {
      primaryCategory: patch.categories.primary
        ? { name: patch.categories.primary.name }
        : undefined,
      additionalCategories: patch.categories.additional.map(c => ({ name: c.name })),
    }
    updateMaskParts.push('categories')
  }

  if (updateMaskParts.length === 0) {
    return { ok: false, error: 'No fields to update' }
  }

  const url = `${V1_BASE}/${resourceName}?updateMask=${encodeURIComponent(updateMaskParts.join(','))}`
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const respBody = await res.json().catch(() => ({}))
  if (!res.ok) {
    return { ok: false, error: respBody?.error?.message || `HTTP ${res.status}` }
  }
  return { ok: true }
}
