/**
 * Google Business Profile fanout.
 *
 * For each update type, translates the Apnosh payload into the
 * platform-specific format and PATCHes the GBP API. Returns a
 * normalized result the orchestrator can store in update_fanouts.
 *
 * Platform: Google Business Profile (Business Information API + Posts API)
 * Required scopes: https://www.googleapis.com/auth/business.manage
 *
 * Note: GBP API quota is restricted. This module assumes the agency
 * token has been approved for the relevant API surface.
 */

import { createClient as createAdminClient } from '@supabase/supabase-js'
import { getAgencyAccessToken } from '@/lib/gbp-agency'
import type { HoursPayload, WeeklyHours, DayKey } from '../types'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

interface FanoutResult {
  success: boolean
  externalId?: string
  externalUrl?: string
  error?: string
  skipped?: boolean
}

interface UpdateInput {
  id: string
  type: string
  client_id: string
  location_id: string | null
  payload: unknown
}

// ── Day-of-week mapping: Apnosh -> GBP API ────────────────────
const DAY_TO_GBP: Record<DayKey, string> = {
  mon: 'MONDAY',
  tue: 'TUESDAY',
  wed: 'WEDNESDAY',
  thu: 'THURSDAY',
  fri: 'FRIDAY',
  sat: 'SATURDAY',
  sun: 'SUNDAY',
}

function timeToGbp(time: string): { hours: number; minutes: number } {
  const [h, m] = time.split(':').map(Number)
  return { hours: h, minutes: m ?? 0 }
}

function weeklyHoursToGbpFormat(weekly: WeeklyHours): {
  periods: Array<{
    openDay: string; openTime: { hours: number; minutes: number }
    closeDay: string; closeTime: { hours: number; minutes: number }
  }>
} {
  const periods: ReturnType<typeof weeklyHoursToGbpFormat>['periods'] = []
  const days: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
  for (const day of days) {
    const ranges = weekly[day] ?? []
    for (const range of ranges) {
      // Closing time of "00:00" or "24:00" means close at midnight (next day)
      const isMidnight = range.close === '00:00' || range.close === '24:00'
      periods.push({
        openDay: DAY_TO_GBP[day],
        openTime: timeToGbp(range.open),
        closeDay: isMidnight ? DAY_TO_GBP[nextDay(day)] : DAY_TO_GBP[day],
        closeTime: isMidnight ? { hours: 0, minutes: 0 } : timeToGbp(range.close),
      })
    }
  }
  return { periods }
}

function nextDay(d: DayKey): DayKey {
  const order: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
  return order[(order.indexOf(d) + 1) % 7]
}

// ── Get the GBP location resource name from our store_code ────
async function resolveGbpResourceName(locationId: string): Promise<string | null> {
  const db = createAdminClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data } = await db
    .from('gbp_locations')
    .select('store_code')
    .eq('id', locationId)
    .maybeSingle()
  if (!data) return null
  const storeCode = data.store_code as string
  // Synthetic codes (no real GBP listing) can't be pushed to GBP API
  if (storeCode.startsWith('synthetic:')) return null
  // GBP API uses "locations/<numeric_id>" -- we store the numeric id as store_code
  return `locations/${storeCode}`
}

// ── Main entry point: dispatch by update type ─────────────────
export async function fanoutToGbp(update: UpdateInput): Promise<FanoutResult> {
  switch (update.type) {
    case 'hours':
      return await fanoutHours(update)
    case 'menu_item':
    case 'promotion':
    case 'event':
    case 'closure':
    case 'asset':
    case 'info':
      return { success: true, skipped: true, error: `${update.type} fanout not yet implemented for GBP` }
    default:
      return { success: false, error: `Unknown update type: ${update.type}` }
  }
}

// ── Hours fanout ──────────────────────────────────────────────
async function fanoutHours(update: UpdateInput): Promise<FanoutResult> {
  const payload = update.payload as HoursPayload
  if (!update.location_id) {
    // For multi-location clients without a specific location_id, the orchestrator
    // would normally split the update per location. For MVP we require explicit.
    return { success: false, error: 'Hours update requires a specific location_id' }
  }

  const tok = await getAgencyAccessToken()
  if (!tok) {
    return { success: false, error: 'GBP agency token not connected' }
  }

  const resourceName = await resolveGbpResourceName(update.location_id)
  if (!resourceName) {
    return { success: true, skipped: true, error: 'Location has no GBP resource (synthetic store_code)' }
  }

  // Regular hours and special hours are different fields on the GBP location resource.
  // We PATCH the relevant field with updateMask.
  if (payload.scope === 'regular' && payload.weekly) {
    return await patchRegularHours(tok.accessToken, resourceName, payload.weekly)
  }
  if (payload.scope === 'special' && payload.special && payload.special.length > 0) {
    return await patchSpecialHours(tok.accessToken, resourceName, payload.special)
  }

  return { success: false, error: 'Hours payload missing weekly or special data' }
}

async function patchRegularHours(
  accessToken: string,
  resourceName: string,
  weekly: WeeklyHours,
): Promise<FanoutResult> {
  const body = { regularHours: weeklyHoursToGbpFormat(weekly) }
  const url = `https://mybusinessbusinessinformation.googleapis.com/v1/${resourceName}?updateMask=regularHours`
  return await callGbpPatch(accessToken, url, body)
}

async function patchSpecialHours(
  accessToken: string,
  resourceName: string,
  special: NonNullable<HoursPayload['special']>,
): Promise<FanoutResult> {
  const specialHourPeriods = special.map(entry => {
    const date = new Date(entry.date + 'T00:00:00Z')
    const dateObj = {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
    }
    if (entry.hours.length === 0) {
      // Closed
      return { startDate: dateObj, endDate: dateObj, closed: true }
    }
    // Use first range (GBP supports one period per special date in v1)
    const r = entry.hours[0]
    return {
      startDate: dateObj,
      endDate: dateObj,
      openTime: timeToGbp(r.open),
      closeTime: timeToGbp(r.close),
    }
  })
  const body = { specialHours: { specialHourPeriods } }
  const url = `https://mybusinessbusinessinformation.googleapis.com/v1/${resourceName}?updateMask=specialHours`
  return await callGbpPatch(accessToken, url, body)
}

async function callGbpPatch(
  accessToken: string,
  url: string,
  body: unknown,
): Promise<FanoutResult> {
  try {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const text = await res.text()
      // Quota errors are expected until API is approved
      if (res.status === 403 && text.includes('quota')) {
        return { success: false, error: `GBP API quota not yet approved: ${text.slice(0, 200)}` }
      }
      return { success: false, error: `GBP API ${res.status}: ${text.slice(0, 200)}` }
    }

    const data = await res.json() as { name?: string }
    return {
      success: true,
      externalId: data.name ?? undefined,
    }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'GBP API call failed' }
  }
}
