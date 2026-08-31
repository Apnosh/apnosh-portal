/**
 * Inherit-then-override: the ONE rule for multi-location facts.
 *
 * The business (brand) holds the defaults. A location row's field left
 * null/empty means "same as the business"; a set value wins for that spot
 * only. Every consumer that needs a fact "for this location" should resolve
 * it through here instead of reading brand fields directly, so single-location
 * clients keep working unchanged and multi-location variance shows up exactly
 * where it was set.
 *
 * v1 override set: phone, hours, website, price_range, biz_type, cuisine,
 * menu_url (a link to that spot's own menu; structured per-location menu
 * items are a later step).
 */

export interface BrandFacts {
  phone?: string | null
  website?: string | null
  price_range?: string | null
  biz_type?: string | null
  cuisine?: string | null
  menu_url?: string | null
  hours?: Record<string, unknown> | null
  service_styles?: string[] | null
}

export interface LocationOverrides extends BrandFacts {
  id?: string
  location_name?: string | null
  full_address?: string | null
  is_primary?: boolean
}

export interface ResolvedLocationFacts extends BrandFacts {
  location_name: string | null
  full_address: string | null
  /** Which fields this location overrides (differs from the brand). */
  overridden: string[]
}

const OVERRIDE_KEYS = ['phone', 'website', 'price_range', 'biz_type', 'cuisine', 'menu_url', 'hours', 'service_styles'] as const

function isSet(v: unknown): boolean {
  if (v == null) return false
  if (typeof v === 'string') return v.trim() !== ''
  if (typeof v === 'object') return Object.keys(v as object).length > 0
  return true
}

export function resolveLocationFacts(brand: BrandFacts, loc: LocationOverrides): ResolvedLocationFacts {
  const out: ResolvedLocationFacts = {
    location_name: loc.location_name ?? null,
    full_address: loc.full_address ?? null,
    overridden: [],
  }
  for (const k of OVERRIDE_KEYS) {
    const own = loc[k]
    if (isSet(own)) {
      ;(out as unknown as Record<string, unknown>)[k] = own
      out.overridden.push(k)
    } else {
      ;(out as unknown as Record<string, unknown>)[k] = brand[k] ?? null
    }
  }
  return out
}
