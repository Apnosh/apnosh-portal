/**
 * Returns the locations for a given client_id, normalized into the
 * ClientLocation shape the dashboard UI expects.
 *
 * Why this is a route instead of a server action: Next.js was caching the
 * `getClientLocations` server action's result aggressively across deploys,
 * which masked the gbp_locations fallback path. The route guarantees a
 * fresh execution per request.
 *
 * Auth: requires the caller to be a signed-in user who has a row in
 * client_users mapping them to the requested client_id.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

interface LocationOut {
  id: string
  location_name: string | null
  city: string | null
  state: string | null
  full_address: string | null
  is_primary: boolean
  is_active: boolean
  gbp_location_id: string | null
}

function adminDb() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export async function GET(req: NextRequest) {
  const clientId = new URL(req.url).searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })

  // 1. Auth: caller must be admin OR mapped to this clientId via client_users
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  const isAdmin = profile && ['admin', 'super_admin'].includes(profile.role)

  if (!isAdmin) {
    const admin = adminDb()
    const { data: cu } = await admin
      .from('client_users')
      .select('client_id')
      .eq('auth_user_id', user.id)
      .eq('client_id', clientId)
      .maybeSingle()
    if (!cu) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  // 2. Try client_locations first
  const { data: cl } = await supabase
    .from('client_locations')
    .select('id, location_name, city, state, full_address, is_primary, is_active, gbp_location_id')
    .eq('client_id', clientId)
    .order('is_primary', { ascending: false })
    .order('location_name', { ascending: true })

  const fromClient: LocationOut[] = (cl ?? [])
    .filter(l => l.is_active !== false)
    .map(l => ({
      id: l.id as string,
      location_name: (l.location_name as string | null) ?? null,
      city: (l.city as string | null) ?? null,
      state: (l.state as string | null) ?? null,
      full_address: (l.full_address as string | null) ?? null,
      is_primary: !!l.is_primary,
      is_active: l.is_active !== false,
      gbp_location_id: (l.gbp_location_id as string | null) ?? null,
    }))

  if (fromClient.length > 0) {
    return NextResponse.json({ locations: fromClient }, { headers: { 'Cache-Control': 'no-store' } })
  }

  // 3. Fall back to gbp_locations via admin (RLS-safe; we already verified caller)
  const admin = adminDb()
  const { data: gbp } = await admin
    .from('gbp_locations')
    .select('id, location_name, address, gbp_location_id')
    .eq('client_id', clientId)
    .eq('status', 'assigned')
    .order('created_at', { ascending: true })

  const locations: LocationOut[] = (gbp ?? []).map((l, idx) => ({
    id: l.id as string,
    location_name: (l.location_name as string | null) ?? 'Primary location',
    city: null,
    state: null,
    full_address: (l.address as string | null) ?? null,
    is_primary: idx === 0,
    is_active: true,
    gbp_location_id: (l.gbp_location_id as string | null) ?? null,
  }))

  return NextResponse.json({ locations }, { headers: { 'Cache-Control': 'no-store' } })
}
