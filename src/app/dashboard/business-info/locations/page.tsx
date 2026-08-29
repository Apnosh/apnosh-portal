/**
 * /dashboard/business-info/locations — every spot, each with its own info.
 * The business holds the defaults; a location field left empty inherits
 * them, a filled one overrides for that spot only (migration 248).
 */

import { redirect } from 'next/navigation'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { createClient } from '@/lib/supabase/server'
import { loadBusinessInfo } from '../actions'
import LocationsEditor, { type LocationRow, type BrandDefaults } from './locations-editor'

export const dynamic = 'force-dynamic'

const FULL_COLS = 'id, location_name, full_address, city, state, zip, is_primary, is_active, phone, website, price_range, biz_type, cuisine, menu_url'
const CORE_COLS = 'id, location_name, full_address, city, state, zip, is_primary, is_active'

export default async function LocationsPage() {
  const { user, clientId } = await resolveCurrentClient(null)
  if (!user) redirect('/login')
  if (!clientId) redirect('/dashboard/business-info')

  const supabase = await createClient()
  // Tolerate an unrun migration 248: fall back to the core columns.
  let rows: Record<string, unknown>[] | null = null
  let overridesReady = true
  {
    const { data, error } = await supabase
      .from('client_locations')
      .select(FULL_COLS)
      .eq('client_id', clientId)
      .order('is_primary', { ascending: false })
      .order('location_name', { ascending: true })
    if (error && error.code === '42703') {
      overridesReady = false
      const { data: coreData } = await supabase
        .from('client_locations')
        .select(CORE_COLS)
        .eq('client_id', clientId)
        .order('is_primary', { ascending: false })
      rows = (coreData ?? []) as Record<string, unknown>[]
    } else {
      rows = (data ?? []) as unknown as Record<string, unknown>[]
    }
  }

  const loaded = await loadBusinessInfo()
  const brand: BrandDefaults = {
    phone: loaded.info?.phone || '',
    website: loaded.info?.website || '',
  }

  const locations: LocationRow[] = (rows ?? [])
    .filter((r) => r.is_active !== false)
    .map((r) => ({
      id: String(r.id),
      location_name: (r.location_name as string | null) ?? '',
      full_address: (r.full_address as string | null) ?? '',
      is_primary: !!r.is_primary,
      phone: (r.phone as string | null) ?? '',
      website: (r.website as string | null) ?? '',
      price_range: (r.price_range as string | null) ?? '',
      biz_type: (r.biz_type as string | null) ?? '',
      cuisine: (r.cuisine as string | null) ?? '',
      menu_url: (r.menu_url as string | null) ?? '',
    }))

  return (
    <LocationsEditor
      clientId={clientId}
      initial={locations}
      brand={brand}
      overridesReady={overridesReady}
    />
  )
}
