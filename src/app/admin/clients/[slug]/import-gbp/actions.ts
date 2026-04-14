'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export interface GbpImportRow {
  date: string
  directions: number
  calls: number
  website_clicks: number
  search_views: number
  location_name?: string
}

export async function importGbpData(
  clientId: string,
  rows: GbpImportRow[]
): Promise<{ success: boolean; error?: string; data?: { imported: number } }> {
  const supabase = await createClient()

  // Verify admin role
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
    return { success: false, error: 'Not authorized' }
  }

  // Group by location
  const locationMap = new Map<string, GbpImportRow[]>()
  for (const row of rows) {
    const loc = row.location_name || 'Default Location'
    if (!locationMap.has(loc)) locationMap.set(loc, [])
    locationMap.get(loc)!.push(row)
  }

  let totalImported = 0

  for (const [locationName, locationRows] of locationMap) {
    // Upsert gbp_connection
    const locationId = `loc_${locationName.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 50)}`

    await supabase
      .from('gbp_connections')
      .upsert({
        client_id: clientId,
        location_id: locationId,
        location_name: locationName,
        connection_type: 'csv_import',
        last_sync_at: new Date().toISOString(),
        sync_status: 'active',
      }, { onConflict: 'client_id,location_id' })

    // Upsert metric rows
    const upsertRows = locationRows.map((r) => ({
      client_id: clientId,
      location_id: locationId,
      location_name: locationName,
      date: r.date,
      directions: r.directions || 0,
      calls: r.calls || 0,
      website_clicks: r.website_clicks || 0,
      search_views: r.search_views || 0,
    }))

    // Batch in chunks of 500
    for (let i = 0; i < upsertRows.length; i += 500) {
      const chunk = upsertRows.slice(i, i + 500)
      const { error } = await supabase
        .from('gbp_metrics')
        .upsert(chunk, { onConflict: 'client_id,location_id,date' })

      if (error) {
        return { success: false, error: `Import failed at row ${i}: ${error.message}` }
      }
      totalImported += chunk.length
    }
  }

  revalidatePath(`/admin/clients/${clientId}`)
  return { success: true, data: { imported: totalImported } }
}
