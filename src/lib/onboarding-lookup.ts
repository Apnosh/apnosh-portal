'use server'

/**
 * Onboarding prefill helpers. Two independent sources, both best-effort:
 *
 *  1. Google Places (New) — turns a business-name search into a confirmed
 *     set of facts (address, phone, website, hours, price tier). Gated on
 *     GOOGLE_PLACES_API_KEY; when the key is absent every function returns
 *     an empty/null result so the wizard silently falls back to manual entry.
 *
 *  2. Website extraction — given a site URL, fetches the page and asks Claude
 *     to draft a description, cuisine, signature dishes, menu items, and
 *     recurring specials. Uses the existing ANTHROPIC_API_KEY. The owner
 *     reviews and edits; nothing here is treated as ground truth.
 *
 * Nothing in this file writes to the database. It only returns drafts the
 * client merges into onboarding state, so a bad lookup can never corrupt a
 * saved profile.
 */

import Anthropic from '@anthropic-ai/sdk'

// Accept either var so the owner provisions a single key. Prefer the
// server-only name; fall back to the public one the legacy address
// autocomplete in step-location already uses. A key with application
// restriction "None" + API restriction "Places API" works for both the
// browser widget (sends a referer) and these server calls (send none).
const PLACES_KEY = process.env.GOOGLE_PLACES_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY || ''
const PLACES_BASE = 'https://places.googleapis.com/v1'

export interface PlaceCandidate {
  placeId: string
  name: string
  address: string
}

export interface BusinessPrefill {
  name: string
  website: string
  phone: string
  full_address: string
  city: string
  state: string
  zip: string
  hours: Record<string, { open: string; close: string; closed: boolean }>
  price_range: '' | '$' | '$$' | '$$$' | '$$$$'
  is_food: boolean
}

export interface WebsiteExtract {
  description: string
  cuisine: string
  signature_items: string[]
  menu_items: Array<{ name: string; price: string; category: string }>
  specials: Array<{ title: string; time_window: string; details: string }>
}

const DAY_KEYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

/** True when Places lookups are available (key present). */
export async function isLookupEnabled(): Promise<boolean> {
  return !!PLACES_KEY
}

/**
 * Search businesses by free-text name (optionally with a city for accuracy).
 * Returns up to 5 candidates. Empty array when the key is missing or the
 * query is too short, so callers never need to special-case "disabled".
 */
export async function searchBusinesses(query: string): Promise<PlaceCandidate[]> {
  const q = query.trim()
  if (!PLACES_KEY || q.length < 3) return []

  try {
    const res = await fetch(`${PLACES_BASE}/places:searchText`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': PLACES_KEY,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress',
      },
      body: JSON.stringify({ textQuery: q, maxResultCount: 5 }),
      // Places data changes rarely; let the platform cache identical typeaheads.
      cache: 'no-store',
    })
    if (!res.ok) {
      console.error('[lookup] searchText failed:', res.status, await res.text())
      return []
    }
    const json = (await res.json()) as {
      places?: Array<{ id: string; displayName?: { text?: string }; formattedAddress?: string }>
    }
    return (json.places || []).map((p) => ({
      placeId: p.id,
      name: p.displayName?.text || '',
      address: p.formattedAddress || '',
    }))
  } catch (e) {
    console.error('[lookup] searchBusinesses threw:', e)
    return []
  }
}

/** Map Places priceLevel enum to the wizard's $..$$$$ tiers. */
function mapPriceLevel(level?: string): BusinessPrefill['price_range'] {
  switch (level) {
    case 'PRICE_LEVEL_INEXPENSIVE': return '$'
    case 'PRICE_LEVEL_MODERATE': return '$$'
    case 'PRICE_LEVEL_EXPENSIVE': return '$$$'
    case 'PRICE_LEVEL_VERY_EXPENSIVE': return '$$$$'
    default: return ''
  }
}

/** "1430" / "0900" (Places 24h HHMM) -> "14:30". Empty string on bad input. */
function fmtTime(hour?: number, minute?: number): string {
  if (typeof hour !== 'number') return ''
  const h = String(hour).padStart(2, '0')
  const m = String(minute ?? 0).padStart(2, '0')
  return `${h}:${m}`
}

/**
 * Convert Places regularOpeningHours.periods into the wizard's per-day map.
 * A day with no period is marked closed. Days that span midnight keep the
 * open day's close time as given (good enough for a prefill the owner edits).
 */
function mapHours(
  periods?: Array<{
    open?: { day?: number; hour?: number; minute?: number }
    close?: { day?: number; hour?: number; minute?: number }
  }>,
): BusinessPrefill['hours'] {
  const hours: BusinessPrefill['hours'] = {}
  for (const key of DAY_KEYS) hours[key] = { open: '', close: '', closed: true }
  if (!periods) return hours
  for (const p of periods) {
    const day = p.open?.day
    if (typeof day !== 'number' || day < 0 || day > 6) continue
    const key = DAY_KEYS[day]
    hours[key] = {
      open: fmtTime(p.open?.hour, p.open?.minute),
      close: fmtTime(p.close?.hour, p.close?.minute),
      closed: false,
    }
  }
  return hours
}

/** Pull a single address component by type from Places addressComponents. */
function comp(
  components: Array<{ types?: string[]; longText?: string; shortText?: string }> | undefined,
  type: string,
  short = false,
): string {
  const c = components?.find((x) => x.types?.includes(type))
  return (short ? c?.shortText : c?.longText) || ''
}

/**
 * Fetch full details for a chosen place and normalize into a prefill object.
 * Returns null when the key is missing or the call fails.
 */
export async function getBusinessPrefill(placeId: string): Promise<BusinessPrefill | null> {
  if (!PLACES_KEY || !placeId) return null

  const fields = [
    'id', 'displayName', 'formattedAddress', 'addressComponents',
    'nationalPhoneNumber', 'websiteUri', 'regularOpeningHours', 'priceLevel', 'types',
  ].join(',')

  try {
    const res = await fetch(`${PLACES_BASE}/places/${encodeURIComponent(placeId)}`, {
      headers: {
        'X-Goog-Api-Key': PLACES_KEY,
        'X-Goog-FieldMask': fields,
      },
      cache: 'no-store',
    })
    if (!res.ok) {
      console.error('[lookup] place details failed:', res.status, await res.text())
      return null
    }
    const p = (await res.json()) as {
      displayName?: { text?: string }
      formattedAddress?: string
      addressComponents?: Array<{ types?: string[]; longText?: string; shortText?: string }>
      nationalPhoneNumber?: string
      websiteUri?: string
      regularOpeningHours?: { periods?: Parameters<typeof mapHours>[0] }
      priceLevel?: string
      types?: string[]
    }

    const foodTypes = ['restaurant', 'cafe', 'bar', 'bakery', 'meal_takeaway', 'meal_delivery', 'food']
    const isFood = (p.types || []).some((t) => foodTypes.includes(t))

    const streetNumber = comp(p.addressComponents, 'street_number')
    const route = comp(p.addressComponents, 'route')
    const line1 = [streetNumber, route].filter(Boolean).join(' ')

    return {
      name: p.displayName?.text || '',
      website: p.websiteUri || '',
      phone: p.nationalPhoneNumber || '',
      full_address: line1 || p.formattedAddress || '',
      city: comp(p.addressComponents, 'locality')
        || comp(p.addressComponents, 'postal_town')
        || comp(p.addressComponents, 'sublocality'),
      state: comp(p.addressComponents, 'administrative_area_level_1', true),
      zip: comp(p.addressComponents, 'postal_code'),
      hours: mapHours(p.regularOpeningHours?.periods),
      price_range: mapPriceLevel(p.priceLevel),
      is_food: isFood,
    }
  } catch (e) {
    console.error('[lookup] getBusinessPrefill threw:', e)
    return null
  }
}

/** Strip a fetched HTML document down to visible-ish text for the model. */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 18000) // keep the prompt bounded; menus rarely need more
}

/** Normalize a user-entered URL to an https absolute URL, or null. */
function normalizeUrl(raw: string): string | null {
  const t = raw.trim()
  if (!t) return null
  try {
    const url = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.toString()
  } catch {
    return null
  }
}

/**
 * Fetch a business website and ask Claude to draft onboarding fields from it.
 * Best-effort: returns null if the URL is unusable, the fetch fails, or the
 * model returns nothing parseable. Never throws into the caller.
 */
export async function extractFromWebsite(url: string): Promise<WebsiteExtract | null> {
  const target = normalizeUrl(url)
  if (!target) return null

  let text = ''
  try {
    const res = await fetch(target, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ApnoshOnboarding/1.0)' },
      cache: 'no-store',
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) {
      console.error('[lookup] website fetch failed:', res.status, target)
      return null
    }
    text = htmlToText(await res.text())
  } catch (e) {
    console.error('[lookup] website fetch threw:', e)
    return null
  }
  if (text.length < 80) return null

  const prompt = `You are reading the website text of a local business to help pre-fill an onboarding form. Extract only what is clearly supported by the text. Do not invent dishes, prices, or claims. If something is not present, use an empty string or empty array.

Return ONLY raw JSON (no markdown, no commentary) with exactly this shape:
{
  "description": "one or two plain sentences describing the business, 5th-grade reading level, no em dashes",
  "cuisine": "single best-fit cuisine label or empty string",
  "signature_items": ["up to 5 standout dishes or products"],
  "menu_items": [{"name": "", "price": "", "category": ""}],
  "specials": [{"title": "", "time_window": "", "details": ""}]
}

Rules:
- menu_items: include real items you can see, with price as written (e.g. "$12") or "" if none. category is a section like "Tacos" or "" if unclear. Cap at 25 items.
- specials: recurring deals like happy hour or taco Tuesday only. Empty array if none.
- Keep all copy free of em dashes.

WEBSITE TEXT:
${text}`

  try {
    const anthropic = new Anthropic()
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      temperature: 0.2,
      messages: [{ role: 'user', content: prompt }],
    })
    const raw = msg.content[0]?.type === 'text' ? msg.content[0].text : ''
    const jsonStr = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)
    const parsed = JSON.parse(jsonStr) as Partial<WebsiteExtract>

    const cleanMenu = Array.isArray(parsed.menu_items)
      ? parsed.menu_items
          .filter((m) => m && typeof m.name === 'string' && m.name.trim())
          .slice(0, 25)
          .map((m) => ({
            name: String(m.name).trim(),
            price: typeof m.price === 'string' ? m.price.trim() : '',
            category: typeof m.category === 'string' ? m.category.trim() : '',
          }))
      : []
    const cleanSpecials = Array.isArray(parsed.specials)
      ? parsed.specials
          .filter((s) => s && typeof s.title === 'string' && s.title.trim())
          .slice(0, 10)
          .map((s) => ({
            title: String(s.title).trim(),
            time_window: typeof s.time_window === 'string' ? s.time_window.trim() : '',
            details: typeof s.details === 'string' ? s.details.trim() : '',
          }))
      : []

    return {
      description: typeof parsed.description === 'string' ? parsed.description.trim() : '',
      cuisine: typeof parsed.cuisine === 'string' ? parsed.cuisine.trim() : '',
      signature_items: Array.isArray(parsed.signature_items)
        ? parsed.signature_items.filter((s) => typeof s === 'string' && s.trim()).slice(0, 5).map((s) => s.trim())
        : [],
      menu_items: cleanMenu,
      specials: cleanSpecials,
    }
  } catch (e) {
    console.error('[lookup] extractFromWebsite model/parse threw:', e)
    return null
  }
}
