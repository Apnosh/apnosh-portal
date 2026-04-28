/**
 * Public read-only API for external sites to fetch canonical data.
 *
 * External sites (clients running their own GitHub + Vercel sites) hit this
 * endpoint to get fresh hours / events / promotions / brand data on each
 * page render or build. Apnosh-hosted sites just read from the database
 * directly via /sites/[slug].
 *
 * Authentication: optional API key passed as `X-Apnosh-Key` header. If the
 * client has set `external_api_key` in site_settings, we require it.
 *
 * GET /api/public/sites/<slug>
 *   -> { client, brand, location, activePromo, upcomingEvents, hours, social }
 *
 * Caching: 60 second CDN cache. Stale-while-revalidate. When an Apnosh
 * update publishes, the deploy hook fires which causes a rebuild that
 * picks up fresh data.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import type {
  WeeklyHours, SpecialHoursEntry, PromotionPayload, EventPayload,
} from '@/lib/updates/types'

interface RouteCtx { params: Promise<{ slug: string }> }

function adminDb() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export async function GET(request: NextRequest, ctx: RouteCtx) {
  const { slug } = await ctx.params
  const db = adminDb()

  // 1. Resolve client
  const { data: client, error: clientErr } = await db
    .from('clients')
    .select('id, name, slug, website')
    .eq('slug', slug)
    .maybeSingle()
  if (clientErr) {
    return NextResponse.json({ error: 'lookup_failed', detail: clientErr.message }, { status: 500 })
  }
  if (!client) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  // 2. Site settings -- check site_type + optional API key auth
  const { data: settings } = await db
    .from('site_settings')
    .select('site_type, external_api_key, is_published')
    .eq('client_id', client.id)
    .maybeSingle()

  if (settings?.external_api_key) {
    const provided = request.headers.get('x-apnosh-key')
    if (provided !== settings.external_api_key) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
  }

  // 3. Brand
  const { data: brand } = await db
    .from('client_brands')
    .select('primary_color, secondary_color, accent_color, font_display, font_body, logo_url, voice_notes')
    .eq('client_id', client.id)
    .maybeSingle()

  // 4. Primary location
  const { data: location } = await db
    .from('gbp_locations')
    .select('location_name, address, hours, special_hours')
    .eq('client_id', client.id)
    .eq('status', 'assigned')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  // 5. Active promotion
  const now = new Date().toISOString()
  const { data: promoUpdates } = await db
    .from('client_updates')
    .select('payload')
    .eq('client_id', client.id)
    .eq('type', 'promotion')
    .eq('status', 'published')
  const activePromo = (() => {
    if (!promoUpdates) return null
    for (const row of promoUpdates) {
      const p = row.payload as PromotionPayload
      if (p.valid_from <= now && now < p.valid_until) return p
    }
    return null
  })()

  // 6. Upcoming events (next 30 days)
  const { data: eventUpdates } = await db
    .from('client_updates')
    .select('payload')
    .eq('client_id', client.id)
    .eq('type', 'event')
    .eq('status', 'published')
  const today = new Date().toISOString().slice(0, 10)
  const in30Days = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10)
  const upcomingEvents: EventPayload[] = (eventUpdates ?? [])
    .map(r => r.payload as EventPayload)
    .filter(e => {
      const startDate = e.start_at.slice(0, 10)
      return startDate >= today && startDate <= in30Days
    })
    .sort((a, b) => a.start_at.localeCompare(b.start_at))
    .slice(0, 10)

  // 7. Social links
  const { data: socials } = await db
    .from('platform_connections')
    .select('platform, profile_url, username')
    .eq('business_id', client.id)
  const social: Record<string, string> = {}
  for (const s of socials ?? []) {
    if (s.profile_url) social[s.platform.toLowerCase()] = s.profile_url
  }

  // 8. Hero photo (asset tagged 'hero')
  const { data: heroAsset } = await db
    .from('brand_assets')
    .select('url')
    .eq('client_id', client.id)
    .contains('tags', ['hero'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return NextResponse.json(
    {
      client: {
        id: client.id,
        name: client.name,
        slug: client.slug,
        description: null,
        website: client.website,
      },
      brand: brand ?? null,
      location: location ?? null,
      hours: (location?.hours as WeeklyHours | null) ?? null,
      specialHours: (location?.special_hours as SpecialHoursEntry[] | null) ?? null,
      activePromo,
      upcomingEvents,
      social,
      heroPhotoUrl: (heroAsset?.url as string | null) ?? null,
      meta: {
        siteType: settings?.site_type ?? 'none',
        generatedAt: new Date().toISOString(),
      },
    },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    },
  )
}
