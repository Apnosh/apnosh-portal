/**
 * Read and update a client's Google Business Profile food menus.
 *
 * Food menus live on the legacy v4 mybusiness API — v1 dropped them
 * entirely. v4 is still active for accounts that had Business Profile
 * API access before the v4 sunset (posts and reviews live there too).
 *
 * Endpoint: `accounts/{a}/locations/{l}/foodMenus`
 *   GET   → returns { name, menus: [...] }
 *   PATCH → body { menus: [...] }, query updateMask=menus
 *
 * We expose a simplified shape that's easier for the UI to render:
 *   Menu[] → Section[] → Item[]
 * Each item has name, description, and a string price ("8.99").
 * On save we round-trip the price into Google's structured money
 * format (currencyCode, units, nanos).
 *
 * Photos on menu items, dietary attributes, and serving size are
 * supported by v4 but we leave them out of the initial editor.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { refreshGoogleToken } from '@/lib/google'

const V4_BASE = 'https://mybusiness.googleapis.com/v4'
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
  /** Full v4 path: accounts/{a}/locations/{l} */
  v4Path: string
} | { error: string }> {
  const admin = createAdminClient()
  /* For multi-location clients we need the channel_connections row
     that matches the SELECTED location (not just any one), because
     each row's platform_account_id carries the accounts/{a}/locations/{l}
     prefix that v4 endpoints need. */
  let row: TokenRow | null = null
  if (locationId) {
    const { data: loc } = await admin
      .from('client_locations')
      .select('gbp_location_id')
      .eq('id', locationId)
      .eq('client_id', clientId)
      .maybeSingle()
    const rawId = loc?.gbp_location_id as string | null | undefined
    if (!rawId) return { error: 'Location not found for this client' }
    const stripped = rawId.replace(/^gbp_loc_/, '')
    const { data } = await admin
      .from('channel_connections')
      .select('id, access_token, refresh_token, token_expires_at, platform_account_id')
      .eq('client_id', clientId)
      .eq('channel', 'google_business_profile')
      .eq('status', 'active')
      .neq('platform_account_id', 'pending')
      .like('platform_account_id', `%locations/${stripped}`)
      .order('connected_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    row = data as TokenRow | null
  }
  /* Fallback: any active row (used when no locationId or the
     location-specific row isn't found). Tokens are shared across
     siblings so this works for token purposes; the account prefix
     comes from this row's platform_account_id. */
  if (!row) {
    const { data } = await admin
      .from('channel_connections')
      .select('id, access_token, refresh_token, token_expires_at, platform_account_id')
      .eq('client_id', clientId)
      .eq('channel', 'google_business_profile')
      .eq('status', 'active')
      .neq('platform_account_id', 'pending')
      .order('connected_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    row = data as TokenRow | null
  }
  const conn = row
  if (!conn?.access_token) return { error: 'No active Google Business Profile connection' }
  if (!conn.platform_account_id || conn.platform_account_id === 'pending') {
    return { error: 'Connection not finalized — re-sync first' }
  }

  /* platform_account_id is "accounts/{a}/locations/{l}". When the
     caller specified a different locationId, swap the location
     segment but keep the account segment. */
  const acctMatch = /^(accounts\/[^/]+)\/locations\//.exec(conn.platform_account_id)
  if (!acctMatch) return { error: 'Unrecognised location resource shape' }
  const accountPath = acctMatch[1]

  let v4Path: string
  if (locationId) {
    const { data: loc } = await admin
      .from('client_locations')
      .select('gbp_location_id')
      .eq('id', locationId)
      .eq('client_id', clientId)
      .maybeSingle()
    const rawId = loc?.gbp_location_id as string | null | undefined
    if (!rawId) return { error: 'Location not found for this client' }
    v4Path = `${accountPath}/locations/${rawId.replace(/^gbp_loc_/, '')}`
  } else {
    v4Path = conn.platform_account_id
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
        .eq('client_id', clientId)
        .eq('channel', 'google_business_profile')
        .eq('status', 'active')
    } catch (err) {
      return { error: `Token refresh failed: ${(err as Error).message}` }
    }
  }
  return { accessToken, v4Path }
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
  const url = `${V4_BASE}/${tok.v4Path}/foodMenus`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${tok.accessToken}` } })
  const body = await res.json().catch(() => ({}))
  /* v4 returns 404 when the location simply has no food menu set up
     yet — that's not an error from the client's perspective, just
     "empty state". Return an empty array so the editor renders the
     "Start a menu" empty state. */
  if (res.status === 404) return { ok: true, menus: [] }
  if (!res.ok) return { ok: false, error: friendlyMenuError(body?.error?.message || `HTTP ${res.status}`) }
  const data = body as { menus?: GbpMenu[] }
  return { ok: true, menus: gbpToMenus(data.menus) }
}

export async function updateClientMenus(
  clientId: string,
  menus: FoodMenu[],
  locationId?: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const tok = await getActiveTokenForClient(clientId, locationId)
  if ('error' in tok) return { ok: false, error: tok.error }
  const url = `${V4_BASE}/${tok.v4Path}/foodMenus?updateMask=menus`
  const body = { menus: menusToGbp(menus) }
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${tok.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const respBody = await res.json().catch(() => ({}))
  if (!res.ok) return { ok: false, error: friendlyMenuError(respBody?.error?.message || `HTTP ${res.status}`) }
  return { ok: true }
}

/* ── Menu link (v1, no v4 needed) ───────────────────────────────────
   Until v4 approval comes through, restaurants can still set a link
   to their menu via the v1 attributes endpoint. Google renders this
   as a "Menu" button on the listing that opens the supplied URL. */

interface V1Attribute {
  name: string
  uriValues?: Array<{ uri: string }>
  values?: unknown[]
}

const MENU_URL_ATTR = 'attributes/url_menu'

/** v4-independent path: locations/{l} from the v4Path returned above. */
function v1LocationPath(v4Path: string): string {
  const m = /locations\/([^/]+)/.exec(v4Path)
  if (!m) throw new Error('Unrecognised location resource shape')
  return `locations/${m[1]}`
}

export async function getClientMenuLink(
  clientId: string,
  locationId?: string | null,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const tok = await getActiveTokenForClient(clientId, locationId)
  if ('error' in tok) return { ok: false, error: tok.error }
  const loc = v1LocationPath(tok.v4Path)
  /* Attributes live behind a dedicated sub-resource on v1 — they
     are NOT a valid readMask field on locations.get. */
  const url = `${V1_BASE}/${loc}/attributes`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${tok.accessToken}` } })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    return { ok: false, error: friendlyMenuError(body?.error?.message || `HTTP ${res.status}`) }
  }
  const attrs = (body as { attributes?: V1Attribute[] }).attributes ?? []
  const menu = attrs.find(a => a.name === MENU_URL_ATTR)
  return { ok: true, url: menu?.uriValues?.[0]?.uri ?? '' }
}

/* Google surfaces a wall-of-text "API not enabled" error when the
   legacy mybusiness.googleapis.com API isn't toggled on for the
   project. Replace it with a short, actionable message so the UI
   doesn't show a paragraph of console URLs. */
function friendlyMenuError(raw: string): string {
  if (/mybusiness\.googleapis\.com/i.test(raw) && /not been used|disabled/i.test(raw)) {
    return 'The Google My Business API is not enabled for this project. Enable it in your Google Cloud Console (free, takes a few seconds), then reload. This is separate from your Business Profile API access request.'
  }
  return raw
}

export async function updateClientMenuLink(
  clientId: string,
  menuUrl: string,
  locationId?: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const tok = await getActiveTokenForClient(clientId, locationId)
  if ('error' in tok) return { ok: false, error: tok.error }
  const loc = v1LocationPath(tok.v4Path)
  const url = `${V1_BASE}/${loc}/attributes?updateMask=attributes`
  const trimmed = menuUrl.trim()
  const body = {
    name: `${loc}/attributes`,
    attributes: [
      {
        name: MENU_URL_ATTR,
        uriValues: trimmed ? [{ uri: trimmed }] : [],
      },
    ],
  }
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${tok.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const respBody = await res.json().catch(() => ({}))
  if (!res.ok) return { ok: false, error: friendlyMenuError(respBody?.error?.message || `HTTP ${res.status}`) }
  return { ok: true }
}
