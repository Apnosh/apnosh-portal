/**
 * Build the full context bundle for a single client that gets passed
 * to Claude during an analysis pass. This is the "what does the AI
 * know about this restaurant" function.
 *
 * Pulls from canonical tables:
 *   - clients (name, goals, audience, brand answers)
 *   - client_brands (colors, voice, style)
 *   - gbp_locations (primary location + hours)
 *   - gbp_metrics (last 60d for trend analysis)
 *   - client_updates (last 30d so AI knows what's been done)
 */

import { createClient as createAdminClient, SupabaseClient } from '@supabase/supabase-js'
import type { ClientContext } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminDb = SupabaseClient<any, 'public', any>

function adminDb(): AdminDb {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  ) as AdminDb
}

export async function buildClientContext(clientId: string): Promise<ClientContext | null> {
  const db = adminDb()

  const { data: clientRaw } = await db
    .from('clients')
    .select(`
      id, name, slug, primary_industry, brief_description,
      goals, target_audience, content_pillars, competitors
    `)
    .eq('id', clientId)
    .maybeSingle()
  if (!clientRaw) return null

  const { data: brand } = await db
    .from('client_brands')
    .select('primary_color, voice_notes, photo_style, visual_style')
    .eq('client_id', clientId)
    .maybeSingle()

  const { data: location } = await db
    .from('gbp_locations')
    .select('location_name, address, hours')
    .eq('client_id', clientId)
    .eq('status', 'assigned')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  // 60 days of metrics so we can compute last-30 vs prior-30 deltas
  const sixtyDaysAgo = new Date(Date.now() - 60 * 86400_000).toISOString().slice(0, 10)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10)
  const { data: metrics } = await db
    .from('gbp_metrics')
    .select('date, impressions_total, calls, directions, website_clicks, food_menu_clicks')
    .eq('client_id', clientId)
    .gte('date', sixtyDaysAgo)

  // Compute period comparisons
  let recentMetrics: ClientContext['recentMetrics'] = null
  if (metrics && metrics.length > 0) {
    const last30 = metrics.filter(m => (m.date as string) >= thirtyDaysAgo)
    const prev30 = metrics.filter(m => (m.date as string) < thirtyDaysAgo)
    const sum = (rows: typeof metrics, key: string) =>
      rows.reduce((a, r) => a + ((r as Record<string, number>)[key] ?? 0), 0)

    recentMetrics = {
      last30_impressions: sum(last30, 'impressions_total'),
      last30_calls: sum(last30, 'calls'),
      last30_directions: sum(last30, 'directions'),
      last30_website_clicks: sum(last30, 'website_clicks'),
      last30_menu_clicks: sum(last30, 'food_menu_clicks'),
      prev30_impressions: sum(prev30, 'impressions_total'),
      prev30_calls: sum(prev30, 'calls'),
      prev30_directions: sum(prev30, 'directions'),
      prev30_website_clicks: sum(prev30, 'website_clicks'),
      prev30_menu_clicks: sum(prev30, 'food_menu_clicks'),
    }
  }

  // Last 30 days of updates so AI knows what's been done
  const { data: recentUpdatesRaw } = await db
    .from('client_updates')
    .select('type, summary, published_at')
    .eq('client_id', clientId)
    .eq('status', 'published')
    .gte('published_at', new Date(Date.now() - 30 * 86400_000).toISOString())
    .order('published_at', { ascending: false })
    .limit(20)

  // Active state counts
  const now = new Date().toISOString()
  const { data: activePromos } = await db
    .from('client_updates')
    .select('id')
    .eq('client_id', clientId)
    .eq('type', 'promotion')
    .eq('status', 'published')

  let activePromosCount = 0
  for (const u of activePromos ?? []) {
    // Need to check valid_from/until in payload, but for context just count
    activePromosCount += 1
  }

  const { data: upcomingEventsRaw } = await db
    .from('client_updates')
    .select('id, payload')
    .eq('client_id', clientId)
    .eq('type', 'event')
    .eq('status', 'published')
  const upcomingEventsCount = (upcomingEventsRaw ?? []).filter(e => {
    const p = e.payload as { start_at?: string }
    return p.start_at && p.start_at > now
  }).length

  return {
    client: {
      id: clientRaw.id as string,
      name: clientRaw.name as string,
      slug: clientRaw.slug as string,
      primary_industry: (clientRaw.primary_industry as string | null) ?? null,
      brief_description: (clientRaw.brief_description as string | null) ?? null,
      goals: clientRaw.goals,
      target_audience: clientRaw.target_audience,
      content_pillars: clientRaw.content_pillars,
      competitors: clientRaw.competitors,
    },
    brand: brand
      ? {
          primary_color: (brand.primary_color as string | null) ?? null,
          voice_notes: (brand.voice_notes as string | null) ?? null,
          photo_style: (brand.photo_style as string | null) ?? null,
          visual_style: (brand.visual_style as string | null) ?? null,
        }
      : null,
    primaryLocation: location
      ? {
          name: location.location_name as string,
          address: (location.address as string | null) ?? null,
          hours: location.hours,
        }
      : null,
    recentMetrics,
    recentUpdates: (recentUpdatesRaw ?? []).map(u => ({
      type: u.type as string,
      summary: (u.summary as string | null) ?? null,
      published_at: (u.published_at as string | null) ?? null,
    })),
    activePromotions: activePromosCount,
    upcomingEvents: upcomingEventsCount,
  }
}
