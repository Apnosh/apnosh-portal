'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import {
  syncAgencyMetricsForDate,
  getAgencyAccessToken,
  listAllAgencyLocations,
  type SyncResult,
} from '@/lib/gbp-agency'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

function adminDb() {
  return createAdminClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function requireAdmin(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  return profile?.role === 'admin' || profile?.role === 'super_admin'
}

export interface IntegrationsStatus {
  drive: { connected: boolean; email: string | null }
  gbp: {
    connected: boolean
    email: string | null
    locationsCount: number | null
    lastSyncAt: string | null
  }
}

/**
 * Get the connection status of the agency-wide Drive and GBP
 * integrations. Used by the Admin → Integrations page.
 */
export async function getAgencyIntegrationsStatus(): Promise<
  | { success: true; data: IntegrationsStatus }
  | { success: false; error: string }
> {
  if (!(await requireAdmin())) return { success: false, error: 'Admin only' }

  const db = adminDb()
  const { data: rows } = await db
    .from('integrations')
    .select('provider, metadata, refresh_token')
    .in('provider', ['google_drive', 'google_business'])

  const list = (rows ?? []) as Array<{
    provider: string
    metadata: { email?: string } | null
    refresh_token: string | null
  }>
  const drive = list.find(r => r.provider === 'google_drive')
  const gbp = list.find(r => r.provider === 'google_business')

  // For GBP, also ask the API how many locations are visible (uses
  // the live token, refreshing if needed).
  let locationsCount: number | null = null
  let lastSyncAt: string | null = null
  if (gbp && gbp.refresh_token) {
    const tok = await getAgencyAccessToken()
    if (tok) {
      try {
        const locs = await listAllAgencyLocations(tok.accessToken)
        locationsCount = locs.length
      } catch (err) {
        console.error('[integrations] listAll failed:', (err as Error).message)
      }
    }
    // Most recent gbp_metrics row stamped by the API
    const { data: latest } = await db
      .from('gbp_metrics')
      .select('date, created_at')
      .eq('source', 'gbp_api')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    lastSyncAt = (latest as { created_at?: string } | null)?.created_at ?? null
  }

  return {
    success: true,
    data: {
      drive: {
        connected: !!drive,
        email: drive?.metadata?.email ?? null,
      },
      gbp: {
        connected: !!gbp,
        email: gbp?.metadata?.email ?? null,
        locationsCount,
        lastSyncAt,
      },
    },
  }
}

/**
 * Manually trigger an agency GBP sync for yesterday. Used by the
 * "Sync yesterday now" button on the Integrations page.
 */
export async function runGbpAgencySyncNow(): Promise<
  | { success: true; data: SyncResult }
  | { success: false; error: string }
> {
  if (!(await requireAdmin())) return { success: false, error: 'Admin only' }
  const res = await syncAgencyMetricsForDate()
  if (!res.ok || !res.data) return { success: false, error: res.message ?? 'Sync failed' }
  return { success: true, data: res.data }
}
