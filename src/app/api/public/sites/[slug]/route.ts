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

  // 9. Menu items -- structured menu (banh mi, boba, espresso, sauces etc.)
  // Returned grouped by category to match how customer site templates
  // typically render. Modifiers and items are separated so a section
  // (e.g. "Boba") can show items + a sub-list of toppings.
  const { data: menuRows } = await db
    .from('menu_items')
    .select('id, category, kind, name, description, price_cents, photo_url, display_order, is_available, is_featured, available_location_ids')
    .eq('client_id', client.id)
    .eq('is_available', true)
    .order('category', { ascending: true })
    .order('display_order', { ascending: true })
    .order('name', { ascending: true })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const menuItem = (r: any) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    price_cents: r.price_cents,
    price: r.price_cents != null ? `$${(r.price_cents / 100).toFixed(2).replace(/\.00$/, '')}` : null,
    photoUrl: r.photo_url,
    isFeatured: !!r.is_featured,
    locationIds: r.available_location_ids ?? [],
  })
  const menu: Record<string, { items: ReturnType<typeof menuItem>[]; modifiers: ReturnType<typeof menuItem>[] }> = {}
  for (const r of menuRows ?? []) {
    const cat = r.category as string
    if (!menu[cat]) menu[cat] = { items: [], modifiers: [] }
    if (r.kind === 'modifier') menu[cat].modifiers.push(menuItem(r))
    else menu[cat].items.push(menuItem(r))
  }

  // 10. Daily specials (active recurring deals).
  const { data: specialRows } = await db
    .from('client_specials')
    .select('id, title, tagline, time_window, price, save_label, includes, photo_url, display_order, available_location_ids')
    .eq('client_id', client.id)
    .eq('is_active', true)
    .order('display_order', { ascending: true })
    .order('title', { ascending: true })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const specials = (specialRows ?? []).map((r: any) => ({
    id: r.id,
    title: r.title,
    tagline: r.tagline,
    timeWindow: r.time_window,
    price: r.price,
    saveLabel: r.save_label,
    includes: r.includes ?? [],
    photoUrl: r.photo_url,
    locationIds: r.available_location_ids ?? [],
  }))

  // 11. Content field overrides (typed copy edits the client published).
  // Returned as a flat object keyed by field_key for easy template lookup,
  // e.g. content['hero.subhead']. Customer site uses this with fallback
  // to its own default copy.
  const { data: contentRows } = await db
    .from('client_content_fields')
    .select('field_key, value')
    .eq('client_id', client.id)
  const content: Record<string, string> = {}
  for (const r of contentRows ?? []) {
    content[r.field_key as string] = r.value as string
  }

  // 12. Unified site_configs.published_data — the new source of truth.
  // When present, templates should prefer this over the legacy fields
  // above. Legacy fields stay for backwards compatibility during the
  // transition.
  const { data: siteConfig } = await db
    .from('site_configs')
    .select('vertical, template_id, published_data, version, published_at')
    .eq('client_id', client.id)
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
      menu,
      specials,
      content,
      // New: full site config (preferred by templates that support it)
      site: siteConfig?.published_data ?? null,
      siteMeta: siteConfig
        ? {
            vertical: siteConfig.vertical,
            templateId: siteConfig.template_id,
            version: siteConfig.version,
            publishedAt: siteConfig.published_at,
          }
        : null,
      meta: {
        siteType: settings?.site_type ?? 'none',
        generatedAt: new Date().toISOString(),
      },
    },
    {
      headers: {
        // No CDN caching: external sites only refetch at build time (or via ISR
        // if they choose), and the deploy hook fires whenever data changes. Any
        // CDN cache here would mask freshly-published updates from the next build.
        'Cache-Control': 'no-store',
      },
    },
  )
}
