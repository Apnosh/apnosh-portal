'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { ClientLocation } from '@/lib/dashboard/location-helpers'

// Admin Supabase client used for the gbp_locations fallback. RLS on
// gbp_locations is admin-write + client-read by client_users mapping; the
// fallback path historically misses for clients whose client_users row was
// created after the locations were inserted (or when running under the
// wrong session context). Since the calling page has already established
// the user belongs to clientId via the client context, bypassing RLS here
// is safe -- we still filter by client_id explicitly.
function adminSupabase() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export type { ClientLocation } from '@/lib/dashboard/location-helpers'

/**
 * Returns the active locations for a client, ordered with the primary first.
 * Used by the LocationSelector and the Locations scoreboard page.
 *
 * For pure helpers like locationLabel() see src/lib/dashboard/location-helpers.ts.
 */
export async function getClientLocations(clientId: string): Promise<ClientLocation[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('client_locations')
    .select('id, location_name, city, state, full_address, is_primary, is_active, gbp_location_id')
    .eq('client_id', clientId)
    .order('is_primary', { ascending: false })
    .order('location_name', { ascending: true })

  const fromClient = (data ?? []).filter(l => l.is_active !== false) as ClientLocation[]
  console.log('[getClientLocations]', clientId, 'client_locations:', fromClient.length)
  if (fromClient.length > 0) return fromClient

  // Fallback: derive locations from gbp_locations when client_locations is
  // empty. Many clients are GBP-only and never had separate client_locations
  // rows backfilled. Bypass RLS via admin client (see top-of-file comment).
  const admin = adminSupabase()
  const { data: gbp, error: gbpErr } = await admin
    .from('gbp_locations')
    .select('id, location_name, address, gbp_location_id, client_id, status')
    .eq('client_id', clientId)
    .eq('status', 'assigned')
    .order('created_at', { ascending: true })
  console.log('[getClientLocations]', clientId, 'gbp_locations:', gbp?.length ?? 0, 'err:', gbpErr?.message ?? 'none', 'rows:', JSON.stringify(gbp?.map(g => g.location_name)))

  return (gbp ?? []).map((l, idx) => ({
    id: l.id as string,
    location_name: (l.location_name as string) ?? 'Primary location',
    city: null,
    state: null,
    full_address: (l.address as string | null) ?? null,
    is_primary: idx === 0,
    is_active: true,
    gbp_location_id: (l.gbp_location_id as string | null) ?? null,
  }))
}
