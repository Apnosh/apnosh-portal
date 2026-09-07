/**
 * The shape of the business: the one fact that changes what the store is allowed to show.
 *
 * A truck has no fixed pin, so "get directions" is the wrong thing to sell it. A delivery-only
 * kitchen has no dining room, so a Reserve button is a lie. Two shops each have their own numbers.
 * Until now nothing on the client said any of this, so every shelf was drawn for a storefront.
 *
 * Six values, because six is what the shelf actually branches on (migration 256's CHECK). The
 * column is read everywhere and written once, at onboarding.
 *
 * CLIENT-SAFE at the top: the values, the labels and the inference are pure. getClientShape does
 * the database read and imports the admin client lazily, so importing this file from a client
 * component never pulls the service-role key into the browser bundle.
 */

export type ClientShape = 'storefront' | 'truck' | 'delivery_only' | 'two_locations' | 'catering' | 'seasonal'

export const CLIENT_SHAPES: readonly ClientShape[] = ['storefront', 'truck', 'delivery_only', 'two_locations', 'catering', 'seasonal']

/** What the owner sees, in their words. Used by the onboarding question and the shelf header. */
export const SHAPE_LABEL: Record<ClientShape, { title: string; sub: string }> = {
  storefront: { title: 'A place people come to', sub: 'One dining room, counter or shop' },
  truck: { title: 'A truck or a pop-up', sub: 'The spot changes' },
  delivery_only: { title: 'Delivery only', sub: 'No dining room. The food goes out.' },
  two_locations: { title: 'Two or more places', sub: 'Each one has its own numbers' },
  catering: { title: 'Mostly catering', sub: 'Offices, parties, big orders' },
  seasonal: { title: 'Open for a season', sub: 'Busy part of the year, quiet the rest' },
}

/** The shape we assume when nobody has said otherwise. Every shelf works for it. */
export const DEFAULT_SHAPE: ClientShape = 'storefront'

export function isClientShape(v: unknown): v is ClientShape {
  return typeof v === 'string' && (CLIENT_SHAPES as readonly string[]).includes(v)
}

/**
 * The best guess from what onboarding already asked, so most owners never see the question as a
 * question: a truck style wins outright, then two or more places, then catering as the primary
 * style. Delivery-only and seasonal cannot be inferred from anything we ask, so they are the two
 * the owner picks by hand. Pure.
 */
export function inferClientShape(data: {
  service_styles?: string[] | null
  location_count?: string | null
  locations?: unknown[] | null
}): ClientShape {
  const styles = (data.service_styles ?? []).map((s) => String(s))
  if (styles.some((s) => /food truck|pop-up/i.test(s))) return 'truck'

  // Two or more places: either the chip says so, or a second address was typed in.
  const extra = Array.isArray(data.locations)
    ? data.locations.filter((l) => {
        const a = (l as { full_address?: unknown })?.full_address
        return typeof a === 'string' && a.trim() !== ''
      }).length
    : 0
  const lc = String(data.location_count ?? '')
  if (extra > 0 || /[2-9]|\+/.test(lc)) return 'two_locations'

  // Catering only counts when it is the FIRST style they picked (their primary), otherwise a
  // restaurant that also caters would lose its storefront shelf.
  if (styles[0] && /catering/i.test(styles[0])) return 'catering'

  return DEFAULT_SHAPE
}

/**
 * The client's shape, read from the database. Safe before migration 256 runs: a missing column
 * comes back as 42703 (or PostgREST's PGRST204) and we return the storefront default rather than
 * failing the page. Never throws.
 */
export async function getClientShape(clientId: string): Promise<ClientShape> {
  if (!clientId) return DEFAULT_SHAPE
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const { data, error } = await createAdminClient()
      .from('clients')
      .select('shape')
      .eq('id', clientId)
      .maybeSingle()
    if (error) {
      if (error.code === '42703' || error.code === 'PGRST204') {
        console.warn('[getClientShape] clients.shape is missing; run migration 256. Using storefront.')
      } else {
        console.warn('[getClientShape] read failed:', error.message)
      }
      return DEFAULT_SHAPE
    }
    const v = (data as { shape?: unknown } | null)?.shape
    return isClientShape(v) ? v : DEFAULT_SHAPE
  } catch (e) {
    console.warn('[getClientShape] threw:', e)
    return DEFAULT_SHAPE
  }
}
