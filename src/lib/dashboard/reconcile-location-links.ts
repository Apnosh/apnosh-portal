import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Link client_locations to their GBP metric key so per-location filtering works.
 *
 * Two location sets exist for a client and were never joined:
 *   - client_locations  (created at onboarding; what the LocationSelector uses)
 *   - gbp_locations      (created by the GBP sync; carries store_code)
 * Per-location metrics key on `gbp_metrics.location_id = 'gbp_loc_<store_code>'`,
 * and the views filter via `client_locations.gbp_location_id`. When that's null
 * (the default after onboarding), every location tab falls back to the
 * client-wide total — they all look identical.
 *
 * This backfills the link by matching the two sets on a distinctive name token
 * (e.g. "Alki", "Kent"). Idempotent and conservative: only fills rows whose
 * gbp_location_id is null AND that have exactly one confident name match.
 */

const STOP = new Set([
  'the', 'and', 'of', 'llc', 'inc', 'co', 'restaurant', 'cafe', 'café', 'grill',
  'kitchen', 'bar', 'bbq', 'korean', 'do', 'si', 'beach',
])

function distinctiveTokens(name: string): Set<string> {
  return new Set(
    (name || '')
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length >= 3 && !STOP.has(t)),
  )
}

export async function reconcileLocationLinks(
  admin: SupabaseClient,
  clientId: string,
): Promise<number> {
  const [clRes, glRes] = await Promise.all([
    admin.from('client_locations').select('id, location_name, gbp_location_id').eq('client_id', clientId),
    admin.from('gbp_locations').select('location_name, store_code').eq('client_id', clientId).not('store_code', 'is', null),
  ])

  const needs = ((clRes.data ?? []) as Array<{ id: string; location_name: string; gbp_location_id: string | null }>)
    .filter(c => !c.gbp_location_id)
  const gbpLocs = (glRes.data ?? []) as Array<{ location_name: string; store_code: string }>
  if (needs.length === 0 || gbpLocs.length === 0) return 0

  let linked = 0
  for (const cl of needs) {
    const clTok = distinctiveTokens(cl.location_name)
    if (clTok.size === 0) continue
    const matches = gbpLocs.filter(gl => {
      const glTok = distinctiveTokens(gl.location_name)
      for (const t of clTok) if (glTok.has(t)) return true
      return false
    })
    if (matches.length !== 1) continue // skip ambiguous or unmatched
    const { error } = await admin
      .from('client_locations')
      .update({ gbp_location_id: `gbp_loc_${matches[0].store_code}` })
      .eq('id', cl.id)
    if (!error) linked++
  }
  return linked
}
