/**
 * Read and update a client's Google Business Profile food menus.
 *
 * Uses the v1 mybusinessbusinessinformation API. The `foodMenus`
 * field on a Location holds the structured menus that show on the
 * listing's Menu tab — sections of items with names, descriptions,
 * and prices.
 *
 * We expose a simplified shape that's easier for the UI to render:
 *   Menu[] → Section[] → Item[]
 * Each item has name, description, and a string price ("8.99").
 * On save we round-trip the price into Google's structured money
 * format (currencyCode, units, nanos).
 *
 * Photos on menu items, dietary attributes, and serving size all
 * exist on v1 but we leave them out of the initial editor.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { refreshGoogleToken } from '@/lib/google'

const V1_BASE = 'https://mybusinessbusinessinformation.googleapis.com/v1'

export interface MenuItem {
  name: string
  description?: string
  /** Plain string e.g. "8.99" — saved as USD by default. */
  price?: string
}

export interface MenuSection {
  name: string
  items: MenuItem[]
}

export interface FoodMenu {
  name: string
  sections: MenuSection[]
}

/* ── Token + resource helpers (mirror gbp-listing). ─────────────── */

interface TokenRow {
  id: string
  access_token: string | null
  refresh_token: string | null
  token_expires_at: string | null
  platform_account_id: string | null
}

async function getActiveTokenForClient(
  clientId: string,
  locationId?: string | null,
): Promise<{
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
    return { error: 'Connection not finalized — re-sync first' }
  }

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
    resourceName = `locations/${rawId.replace(/^gbp_loc_/, '')}`
  } else {
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

/* ── GBP money <-> string price ─────────────────────────────────── */

interface GbpMoney { currencyCode?: string; units?: string | number; nanos?: number }

function priceToString(p?: GbpMoney): string {
  if (!p) return ''
  const units = Number(p.units ?? 0)
  const cents = Math.round((p.nanos ?? 0) / 10_000_000) /* nanos → 2-decimal */
  if (cents === 0) return units.toString()
  return `${units}.${cents.toString().padStart(2, '0')}`
}

function stringToPrice(s: string): GbpMoney | undefined {
  const trimmed = s.trim().replace(/^\$/, '')
  if (!trimmed) return undefined
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(trimmed)
  if (!m) return undefined
  const units = Number(m[1])
  const decimal = m[2] ? Number(m[2].padEnd(2, '0')) : 0
  return {
    currencyCode: 'USD',
    units: units.toString(),
    nanos: decimal * 10_000_000,
  }
}

/* ── Google → simplified shape ──────────────────────────────────── */

interface GbpMenuName { displayName?: string; languageCode?: string }
interface GbpAttributes {
  price?: GbpMoney
  description?: { localizedLabels?: GbpMenuName[]; displayName?: string }
  /** Items often hold their primary label inside attributes.name */
  name?: { localizedLabels?: GbpMenuName[]; displayName?: string }
}
interface GbpItem {
  labels?: Array<{ displayName?: string; languageCode?: string; description?: string }>
  attributes?: GbpAttributes
}
interface GbpSection {
  labels?: Array<{ displayName?: string; languageCode?: string }>
  items?: GbpItem[]
}
interface GbpMenu {
  labels?: Array<{ displayName?: string; languageCode?: string }>
  sections?: GbpSection[]
}

function preferredLabel(labels?: Array<{ displayName?: string; languageCode?: string }>): string {
  if (!labels || labels.length === 0) return ''
  return labels[0].displayName ?? ''
}

function gbpToMenus(raw: GbpMenu[] | undefined): FoodMenu[] {
  return (raw ?? []).map(m => ({
    name: preferredLabel(m.labels),
    sections: (m.sections ?? []).map(s => ({
      name: preferredLabel(s.labels),
      items: (s.items ?? []).map(i => ({
        name: preferredLabel(i.labels),
        description: i.labels?.[0]?.description ?? '',
        price: priceToString(i.attributes?.price),
      })),
    })),
  }))
}

function menusToGbp(menus: FoodMenu[]): GbpMenu[] {
  return menus.map(m => ({
    labels: [{ displayName: m.name, languageCode: 'en' }],
    sections: m.sections.map(s => ({
      labels: [{ displayName: s.name, languageCode: 'en' }],
      items: s.items
        .filter(i => i.name.trim().length > 0)
        .map(i => ({
          labels: [{
            displayName: i.name,
            languageCode: 'en',
            ...(i.description ? { description: i.description } : {}),
          }],
          ...(i.price && stringToPrice(i.price) ? { attributes: { price: stringToPrice(i.price) } } : {}),
        })),
    })),
  }))
}

/* ── Read + write ───────────────────────────────────────────────── */

export async function getClientMenus(clientId: string, locationId?: string | null): Promise<
  { ok: true; menus: FoodMenu[] } | { ok: false; error: string }
> {
  const tok = await getActiveTokenForClient(clientId, locationId)
  if ('error' in tok) return { ok: false, error: tok.error }
  const url = `${V1_BASE}/${tok.resourceName}?readMask=foodMenus`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${tok.accessToken}` } })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) return { ok: false, error: body?.error?.message || `HTTP ${res.status}` }
  const data = body as { foodMenus?: { menus?: GbpMenu[] } }
  return { ok: true, menus: gbpToMenus(data.foodMenus?.menus) }
}

export async function updateClientMenus(
  clientId: string,
  menus: FoodMenu[],
  locationId?: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const tok = await getActiveTokenForClient(clientId, locationId)
  if ('error' in tok) return { ok: false, error: tok.error }
  const body = { foodMenus: { menus: menusToGbp(menus) } }
  const url = `${V1_BASE}/${tok.resourceName}?updateMask=foodMenus`
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${tok.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const respBody = await res.json().catch(() => ({}))
  if (!res.ok) return { ok: false, error: respBody?.error?.message || `HTTP ${res.status}` }
  return { ok: true }
}
