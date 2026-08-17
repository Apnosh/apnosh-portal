'use server'

/**
 * Choose-your-metrics server actions (owner ask 2026-08-18).
 * ==========================================================
 * The toggle menu is derived from the SAME registry the funnel sums
 * (compute-stages SUMMABLE x source-registry), so a metric can never appear
 * here without also being gated everywhere the moment it is switched.
 *
 * Access follows the connect-lane rule: the caller must prove they may act
 * for the client (client_users link, business ownership, or staff role).
 */

import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { SUMMABLE } from '@/lib/insights/compute-stages'
import { SOURCES, STAGE_NAMES, type FunnelStage } from '@/lib/insights/source-registry'
import { userMayConnectClient } from '@/lib/connect-access'

const PROVIDER_LABEL: Record<string, string> = {
  google_business_profile: 'Google Business',
  google_analytics: 'Google Analytics',
  google_search_console: 'Search Console',
  instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok',
  linkedin: 'LinkedIn', youtube: 'YouTube', social: 'Social',
  pos: 'Register', reservations: 'Reservations', delivery: 'Delivery',
  ads: 'Ads', yelp: 'Yelp', loyalty: 'Loyalty',
}

export interface MetricToggle {
  id: string
  label: string
  description: string
  providerLabel: string
  enabled: boolean
  /** false → source cannot flow yet; show the hint instead of a switch */
  available: boolean
  hint: string | null
}
export interface MetricToggleGroup {
  stage: number
  stageLabel: string
  items: MetricToggle[]
}

async function resolveClient(requestedClientId?: string): Promise<{ userId: string; clientId: string } | null> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = createAdminClient()
  if (requestedClientId && await userMayConnectClient(user.id, requestedClientId)) {
    return { userId: user.id, clientId: requestedClientId }
  }
  const { data: biz } = await admin.from('businesses').select('client_id').eq('owner_id', user.id).maybeSingle()
  if (biz?.client_id) return { userId: user.id, clientId: biz.client_id }
  const { data: cu } = await admin.from('client_users').select('client_id').eq('auth_user_id', user.id).maybeSingle()
  return cu?.client_id ? { userId: user.id, clientId: cu.client_id } : null
}

export async function listMetricToggles(selectedClientId?: string): Promise<MetricToggleGroup[]> {
  const who = await resolveClient(selectedClientId)
  if (!who) return []
  const { getDisabledSourceSet } = await import('@/lib/metric-prefs')
  const { resolveSourceStatuses } = await import('@/lib/insights/resolve-source-statuses')
  const [disabled, statuses] = await Promise.all([
    getDisabledSourceSet(who.clientId),
    resolveSourceStatuses(who.clientId),
  ])
  const byId = new Map(SOURCES.map((d) => [d.id, d]))
  const groups: MetricToggleGroup[] = []
  for (const stage of [1, 2, 3, 4, 5] as FunnelStage[]) {
    const items: MetricToggle[] = []
    for (const id of SUMMABLE[stage] ?? []) {
      const def = byId.get(id)
      if (!def) continue
      const st = statuses[id]?.status
      const available = st === 'CONNECTED' || st === 'MANUAL_ENTRY'
      const providerLabel = PROVIDER_LABEL[def.provider] ?? def.provider
      items.push({
        id,
        label: def.displayName,
        description: '',
        providerLabel,
        enabled: !disabled.has(id),
        available,
        hint: available ? null
          : st === 'COMING_SOON' ? 'Coming soon'
          : st === 'ERROR' ? `${providerLabel} connection needs attention`
          : `Connect ${providerLabel} to use this`,
      })
    }
    if (items.length) groups.push({ stage, stageLabel: STAGE_NAMES[stage], items })
  }
  return groups
}

export async function setMetricToggle(
  sourceId: string,
  enabled: boolean,
  selectedClientId?: string,
): Promise<{ success: true } | { success: false; error: string }> {
  /* only ids the funnel actually sums are togglable — anything else is a bug
   * or a crafted request, and both deserve a refusal */
  const known = Object.values(SUMMABLE).some((ids) => ids.includes(sourceId))
  if (!known) return { success: false, error: 'Unknown metric' }
  const who = await resolveClient(selectedClientId)
  if (!who) return { success: false, error: 'Not signed in' }

  const admin = createAdminClient()
  const { data } = await admin
    .from('client_metric_prefs')
    .select('disabled_sources')
    .eq('client_id', who.clientId)
    .maybeSingle()
  const cur = new Set(Array.isArray(data?.disabled_sources)
    ? (data.disabled_sources as unknown[]).filter((v): v is string => typeof v === 'string')
    : [])
  if (enabled) cur.delete(sourceId)
  else cur.add(sourceId)

  const { error } = await admin.from('client_metric_prefs').upsert(
    {
      client_id: who.clientId,
      disabled_sources: [...cur],
      updated_at: new Date().toISOString(),
      updated_by: who.userId,
    },
    { onConflict: 'client_id' },
  )
  if (error) return { success: false, error: error.message }
  return { success: true }
}
