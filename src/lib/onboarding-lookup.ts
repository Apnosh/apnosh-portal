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
  hours: Record<string, {
    open: string; close: string; closed: boolean
    ranges?: Array<{ open: string; close: string }>
  }>
  price_range: '' | '$' | '$$' | '$$$' | '$$$$'
  is_food: boolean
}

export interface WebsiteExtract {
  description: string
  cuisine: string
  signature_items: string[]
  menu_items: Array<{ name: string; price: string; category: string }>
  specials: Array<{ title: string; time_window: string; details: string }>
  // Fact-based profile fields, only filled when the site clearly shows them.
  // Each is validated against the wizard's allowed values before returning, so
  // a hallucinated label can never reach onboarding state.
  service_styles: string[]
  dietary_options: string[]
  reservations_platform: string
  delivery_platforms: string[]
  // Later-step drafts (Story / Brand / Discovery). Free-form, so we only trim
  // and cap them; the owner reviews and edits every one. Grounded in the site
  // text only -- the model is told to leave them empty when unsupported.
  unique: string            // what makes this place stand out (story step)
  main_offerings: string    // the core of what they sell (promote step)
  target_keywords: string[] // search phrases a diner would use (discovery)
  brand_hashtags: string[]  // hashtags/handles shown on the site (discovery)
}

// Allowed values, mirrored from the wizard's data.ts option lists. The model
// is told to copy these verbatim; we also filter its output to this set so any
// invented label is dropped rather than written into the form.
const ALLOWED_SERVICE_STYLES = [
  'Fast food', 'Quick service / fast casual', 'Casual dining', 'Family style',
  'Fine dining', 'Café / coffee shop', 'Bar / lounge', 'Buffet / AYCE',
  'Food truck / pop-up', 'Catering', 'Bakery / patisserie', 'Other',
]
const ALLOWED_DIETARY = [
  'Vegan', 'Vegetarian', 'Gluten-free', 'Halal', 'Kosher',
  'Nut-free', 'Dairy-free', 'Keto / low-carb', 'Organic / local', 'Allergen-friendly',
]
const ALLOWED_RESERVATIONS = [
  'OpenTable', 'Resy', 'Tock', 'Yelp Reservations', 'In-house only', 'No reservations',
]
const ALLOWED_DELIVERY = [
  'DoorDash', 'Uber Eats', 'Grubhub', 'Toast', 'Our own', 'No delivery',
]

/** Keep only the model's values that exactly match an allowed option. */
function keepAllowed(values: unknown, allowed: string[]): string[] {
  if (!Array.isArray(values)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const v of values) {
    if (typeof v !== 'string') continue
    const match = allowed.find((a) => a.toLowerCase() === v.trim().toLowerCase())
    if (match && !seen.has(match)) { seen.add(match); out.push(match) }
  }
  return out
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
 * A day with no period is marked closed. Days with more than one period (a
 * lunch + dinner service with a midday closure) keep every window in `ranges`
 * so the closure is preserved; `open`/`close` carry the overall span for any
 * reader that only looks at those. Good enough for a prefill the owner edits.
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
  const byDay: Record<string, Array<{ open: string; close: string }>> = {}
  for (const p of periods) {
    const day = p.open?.day
    if (typeof day !== 'number' || day < 0 || day > 6) continue
    const key = DAY_KEYS[day]
    ;(byDay[key] ||= []).push({
      open: fmtTime(p.open?.hour, p.open?.minute),
      close: fmtTime(p.close?.hour, p.close?.minute),
    })
  }
  for (const key of DAY_KEYS) {
    const ranges = (byDay[key] || []).sort((a, b) => a.open.localeCompare(b.open))
    if (!ranges.length) continue
    const open = ranges[0].open
    const close = ranges.reduce((a, r) => (r.close > a ? r.close : a), ranges[0].close)
    hours[key] = { open, close, closed: false, ranges }
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

/**
 * Decode the HTML entities that show up in real menus and business names.
 * Without this, "Joe&#39;s" reaches the model as a mangled token and comes
 * back as "Joes". Em/en dashes are folded to a plain hyphen so drafted copy
 * stays free of em dashes.
 */
function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&(?:apos|#39|#x27);/gi, "'")
    .replace(/&(?:lsquo|rsquo|#8216|#8217|#x2018|#x2019);/gi, "'")
    .replace(/&(?:quot|ldquo|rdquo|#8220|#8221|#x201c|#x201d);/gi, '"')
    .replace(/&(?:mdash|ndash|#8211|#8212|#x2013|#x2014);/gi, '-')
    .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(parseInt(n, 10)) } catch { return ' ' } })
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => { try { return String.fromCodePoint(parseInt(n, 16)) } catch { return ' ' } })
    .replace(/&[a-z]+;/gi, ' ')
}

/** Strip a fetched HTML document down to visible-ish text for the model. */
function htmlToText(html: string): string {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
  return decodeEntities(stripped)
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

/** Fetch one page, returning its raw HTML and stripped text, or null on error. */
async function fetchPage(target: string): Promise<{ html: string; text: string } | null> {
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
    const html = await res.text()
    return { html, text: htmlToText(html) }
  } catch (e) {
    console.error('[lookup] website fetch threw:', e)
    return null
  }
}

/**
 * Find a likely "menu" page link in the homepage HTML. Real menus almost
 * always live on their own page (or a PDF we can't read), so the landing page
 * alone yields no menu items. Returns an absolute URL or null. Skips PDFs,
 * mail/tel links, and same-page anchors.
 */
function findMenuLink(html: string, base: string): string | null {
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const href = m[1]
    if (href.startsWith('#') || /^(mailto:|tel:)/i.test(href) || /\.pdf(\?|$)/i.test(href)) continue
    const hay = `${href} ${htmlToText(m[2] || '')}`.toLowerCase()
    if (!/\bmenu/.test(hay)) continue
    try { return new URL(href, base).toString() } catch { /* ignore bad href */ }
  }
  return null
}

/**
 * Fetch a business website and ask Claude to draft onboarding fields from it.
 * Reads the homepage plus a linked menu page when one exists, so menu items
 * are actually drafted instead of left blank. Best-effort: returns null if the
 * URL is unusable, the fetch fails, or the model returns nothing parseable.
 * Never throws into the caller.
 */
export async function extractFromWebsite(url: string): Promise<WebsiteExtract | null> {
  const target = normalizeUrl(url)
  if (!target) return null

  const home = await fetchPage(target)
  if (!home) return null
  let text = home.text

  // Pull a linked menu page too. Homepages rarely list the full menu, so this
  // is the difference between drafting real menu items and returning none.
  const menuUrl = findMenuLink(home.html, target)
  if (menuUrl && menuUrl !== target) {
    const menu = await fetchPage(menuUrl)
    if (menu && menu.text.length > 80) {
      text = `${text}\n\nMENU PAGE:\n${menu.text}`.slice(0, 18000)
    }
  }
  if (text.length < 80) return null

  const prompt = `You are reading the website text of a local business to help pre-fill an onboarding form. Extract only what is clearly supported by the text. Do not invent dishes, prices, or claims. If something is not present, use an empty string or empty array.

Return ONLY raw JSON (no markdown, no commentary) with exactly this shape:
{
  "description": "one or two plain sentences describing the business, 5th-grade reading level, no em dashes",
  "cuisine": "single best-fit cuisine label or empty string",
  "signature_items": ["up to 5 standout dishes or products"],
  "menu_items": [{"name": "", "price": "", "category": ""}],
  "specials": [{"title": "", "time_window": "", "details": ""}],
  "service_styles": [],
  "dietary_options": [],
  "reservations_platform": "",
  "delivery_platforms": [],
  "unique": "one plain sentence on what makes this place stand out, or empty string",
  "main_offerings": "one short phrase naming the core of what they sell, or empty string",
  "target_keywords": ["search phrases a hungry local would type to find a place like this"],
  "brand_hashtags": ["hashtags or social handles actually shown on the site"]
}

Rules:
- menu_items: include real items you can see, with price as written (e.g. "$12") or "" if none. category is a section like "Tacos" or "" if unclear. Cap at 25 items.
- specials: recurring deals like happy hour or taco Tuesday only. Empty array if none.
- unique: only if the site states or clearly implies a standout (a specialty, an award, a method, history). Empty string if nothing stands out. 5th-grade reading level.
- main_offerings: e.g. "wood-fired pizza and pasta" or "specialty coffee and pastries". Empty string if unclear.
- target_keywords: up to 6 lowercase phrases grounded in the cuisine, dishes, and city you can see (e.g. "ramen seattle", "late night noodles"). Empty array if you cannot ground them. Do not invent a city.
- brand_hashtags: only hashtags (with #) or @handles that literally appear in the text. Empty array if none. Never invent one.
- Keep all copy free of em dashes.

Facts only for the next four fields. Include a value ONLY when the website text clearly supports it. Never guess. Never infer service style from cuisine alone. Copy values VERBATIM from these lists; if nothing fits, leave it empty.
- service_styles: pick any that clearly apply from: ${ALLOWED_SERVICE_STYLES.join(', ')}
- dietary_options: pick any clearly advertised from: ${ALLOWED_DIETARY.join(', ')}
- reservations_platform: pick ONE if a reservation link or name is shown from: ${ALLOWED_RESERVATIONS.join(', ')}. Empty string if none shown.
- delivery_platforms: pick any whose link or name appears from: ${ALLOWED_DELIVERY.join(', ')}

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
    const seenSpecials = new Set<string>()
    const cleanSpecials = Array.isArray(parsed.specials)
      ? parsed.specials
          .filter((s) => s && typeof s.title === 'string' && s.title.trim().length >= 3)
          .map((s) => ({
            title: String(s.title).trim(),
            time_window: typeof s.time_window === 'string' ? s.time_window.trim() : '',
            details: typeof s.details === 'string' ? s.details.trim() : '',
          }))
          // Drop repeats of the same special (case-insensitive title match).
          .filter((s) => {
            const key = s.title.toLowerCase()
            if (seenSpecials.has(key)) return false
            seenSpecials.add(key)
            return true
          })
          .slice(0, 10)
      : []

    // Trim + cap a free-form string list (keywords, hashtags). De-dupes
    // case-insensitively and drops blanks so a sloppy model reply stays clean.
    const cleanStrList = (v: unknown, cap: number, max = 40): string[] => {
      if (!Array.isArray(v)) return []
      const seen = new Set<string>()
      const out: string[] = []
      for (const s of v) {
        if (typeof s !== 'string') continue
        const t = s.trim().slice(0, max)
        if (!t) continue
        const key = t.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        out.push(t)
        if (out.length >= cap) break
      }
      return out
    }

    return {
      description: typeof parsed.description === 'string' ? parsed.description.trim() : '',
      cuisine: typeof parsed.cuisine === 'string' ? parsed.cuisine.trim() : '',
      signature_items: Array.isArray(parsed.signature_items)
        ? parsed.signature_items.filter((s) => typeof s === 'string' && s.trim()).slice(0, 5).map((s) => s.trim())
        : [],
      menu_items: cleanMenu,
      specials: cleanSpecials,
      service_styles: keepAllowed(parsed.service_styles, ALLOWED_SERVICE_STYLES),
      dietary_options: keepAllowed(parsed.dietary_options, ALLOWED_DIETARY),
      reservations_platform: keepAllowed([parsed.reservations_platform], ALLOWED_RESERVATIONS)[0] || '',
      delivery_platforms: keepAllowed(parsed.delivery_platforms, ALLOWED_DELIVERY),
      unique: typeof parsed.unique === 'string' ? parsed.unique.trim() : '',
      main_offerings: typeof parsed.main_offerings === 'string' ? parsed.main_offerings.trim() : '',
      target_keywords: cleanStrList(parsed.target_keywords, 6),
      brand_hashtags: cleanStrList(parsed.brand_hashtags, 6),
    }
  } catch (e) {
    console.error('[lookup] extractFromWebsite model/parse threw:', e)
    return null
  }
}
