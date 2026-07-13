'use server'

/**
 * Admin: save a client's EXACT GA4 event config (Phase 1.5 outcome funnel).
 * These are the exact values the owner sets by hand (owner decision: NO
 * auto-detect) that drive whether ga4_menu_views / ga4_order_clicks resolve
 * CONNECTED for a client. Admin-only; writes go through the service role after
 * the requireAdminUser gate, into client_analytics_config (migration 206).
 */

import { revalidatePath } from 'next/cache'
import { requireAdminUser } from '@/lib/auth/require-admin'
import { createAdminClient } from '@/lib/supabase/admin'

/** Ensure a menu path is a leading-slash path and nothing more. Empty → null. */
function normalizeMenuPath(raw: string): string | null {
  let v = (raw || '').trim()
  if (!v) return null
  // Strip an accidental full URL down to its path.
  const m = v.match(/^https?:\/\/[^/]+(\/.*)?$/i)
  if (m) v = m[1] ?? '/'
  if (!v.startsWith('/')) v = '/' + v
  // Drop a trailing slash except for the bare root.
  if (v.length > 1 && v.endsWith('/')) v = v.slice(0, -1)
  return v
}

/** Reduce an ordering-site value to a bare host (no scheme, path, or trailing slash). Empty → null. */
function normalizeOrderDomain(raw: string): string | null {
  let v = (raw || '').trim().toLowerCase()
  if (!v) return null
  v = v.replace(/^https?:\/\//, '') // drop scheme
  v = v.split('/')[0] // drop any path
  v = v.replace(/\/+$/, '') // drop trailing slashes
  return v || null
}

export async function saveClientAnalyticsConfig(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireAdminUser()
  } catch {
    return { ok: false, error: 'Admin access required' }
  }

  const clientId = String(formData.get('clientId') ?? '').trim()
  if (!clientId) return { ok: false, error: 'Missing client' }

  const menuPath = normalizeMenuPath(String(formData.get('ga4_menu_path') ?? ''))
  const orderDomain = normalizeOrderDomain(String(formData.get('ga4_order_domain') ?? ''))

  const admin = createAdminClient()
  const { error } = await admin.from('client_analytics_config').upsert(
    {
      client_id: clientId,
      ga4_menu_path: menuPath,
      ga4_order_domain: orderDomain,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'client_id' },
  )
  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin/insights-sources')
  return { ok: true }
}
