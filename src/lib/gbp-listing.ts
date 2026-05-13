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
}

export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

/* Per day: array of {open, close} ranges in HH:MM (24h). Empty array
   means closed for that day. */
export type WeeklyHours = Record<DayKey, Array<{ open: string; close: string }>>

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

async function getActiveTokenForClient(clientId: string): Promise<{
  accessToken: string
  resourceName: string
} | { error: string }> {
  const admin = createAdminClient()
  const { data: row } = await admin
    .from('channel_connections')
    .select('id, access_token, refresh_token, token_expires_at, platform_account_id')
    .eq('client_id', clientId)
    .eq('channel', 'google_business_profile')
    .eq('status', 'active')
    .maybeSingle()
  const conn = row as TokenRow | null
  if (!conn?.access_token) return { error: 'No active Google Business Profile connection' }
  if (!conn.platform_account_id || conn.platform_account_id === 'pending') {
    return { error: 'Google Business Profile connection is not finalized — re-sync first' }
  }
  /* Stored as accounts/{a}/locations/{l}; v1 endpoint takes just locations/{l}. */
  const m = /locations\/([^/]+)/.exec(conn.platform_account_id)
  if (!m) return { error: 'Unrecognised location resource shape' }
  const resourceName = `locations/${m[1]}`

  let accessToken = conn.access_token
  const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0
  if (expiresAt - Date.now() < 60_000 && conn.refresh_token) {
    try {
      const refreshed = await refreshGoogleToken(conn.refresh_token)
      accessToken = refreshed.access_token
      const newExpires = new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
      await admin
        .from('channel_connections')
        .update({ access_token: accessToken, token_expires_at: newExpires })
        .eq('id', conn.id)
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

/* ── Read current listing ──────────────────────────────────────── */

export async function getClientListing(clientId: string): Promise<{
  ok: true
  resourceName: string
  title: string | null
  fields: ListingFields
} | { ok: false; error: string }> {
  const tok = await getActiveTokenForClient(clientId)
  if ('error' in tok) return { ok: false, error: tok.error }
  const { accessToken, resourceName } = tok

  const readMask = 'title,profile,websiteUri,phoneNumbers,regularHours'
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
    },
  }
}

/* ── Write listing changes ─────────────────────────────────────── */

export async function updateClientListing(
  clientId: string,
  patch: ListingFields,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const tok = await getActiveTokenForClient(clientId)
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
