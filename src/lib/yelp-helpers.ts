/**
 * Pure helpers for Yelp data. Importable from client and server code.
 */

export interface YelpPreview {
  alias: string
  name: string
  rating: number
  review_count: number
  is_closed: boolean
  is_claimed: boolean
  url: string
  city: string | null
  state: string | null
  categories: string[]
}

/**
 * Parse a Yelp business URL (or alias) into a stable business alias.
 *
 * Accepts any of:
 *   https://www.yelp.com/biz/starbucks-seattle-88
 *   https://yelp.com/biz/starbucks-seattle-88?osq=coffee
 *   yelp.com/biz/starbucks-seattle-88
 *   starbucks-seattle-88
 *
 * Returns null if the input doesn't look like a Yelp business reference.
 */
export function parseYelpAlias(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  // Full URL case
  const urlMatch = trimmed.match(/yelp\.com\/biz\/([^/?#]+)/i)
  if (urlMatch) return decodeURIComponent(urlMatch[1]).toLowerCase()
  // Plain alias case (no slashes, no spaces, kebab-case)
  if (/^[a-z0-9][a-z0-9-]*$/i.test(trimmed)) return trimmed.toLowerCase()
  return null
}
