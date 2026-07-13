/**
 * Per-client analytics config (Phase 1.5 outcome funnel).
 * =======================================================
 * The EXACT values the owner sets by hand for a client's GA4 event sources
 * (owner decision: NO auto-detect):
 *   - ga4_menu_path    -> the client's menu page path, e.g. "/menu"
 *   - ga4_order_domain -> the client's outbound ordering domain, e.g. "order.toasttab.com"
 *
 * Lives in the client_analytics_config table (migration 206), keyed by
 * client_id to match website_metrics / channel_connections / the admin picker.
 *
 * Read is server-only, admin-client, and BEST-EFFORT: it never throws. If the
 * table doesn't exist yet (migration not applied) or a read fails, it returns
 * an empty config so callers degrade honestly (source stays not-connected).
 */

import { createAdminClient } from '@/lib/supabase/admin'

export interface ClientAnalyticsConfig {
  menuPath: string | null
  orderDomain: string | null
}

export const EMPTY_ANALYTICS_CONFIG: ClientAnalyticsConfig = {
  menuPath: null,
  orderDomain: null,
}

function clean(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t.length ? t : null
}

/** Load one client's analytics config. Never throws; missing table/row → empty. */
export async function loadClientAnalyticsConfig(clientId: string): Promise<ClientAnalyticsConfig> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('client_analytics_config')
      .select('ga4_menu_path, ga4_order_domain')
      .eq('client_id', clientId)
      .maybeSingle()
    if (error || !data) return { ...EMPTY_ANALYTICS_CONFIG }
    const row = data as { ga4_menu_path: string | null; ga4_order_domain: string | null }
    return {
      menuPath: clean(row.ga4_menu_path),
      orderDomain: clean(row.ga4_order_domain),
    }
  } catch {
    return { ...EMPTY_ANALYTICS_CONFIG }
  }
}
