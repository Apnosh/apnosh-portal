/**
 * Apnosh Sites: a public restaurant website.
 *
 * Architecture: ZERO duplication. Pulls every piece of data from the
 * canonical source-of-truth table where it already lives:
 *
 *   clients              -> name, slug, brief_description, website
 *   client_brands        -> primary/secondary/accent colors, fonts, logo
 *   gbp_locations        -> address, hours, special_hours
 *   client_updates       -> active promotions, upcoming events
 *   platform_connections -> Instagram / Facebook / TikTok URLs
 *   site_settings        -> ONLY: is_published, custom_domain
 *
 * The principle: a restaurant manager edits their data ONCE in the
 * Apnosh dashboard (brand colors in Brand tab, hours in Updates,
 * social handles in connections). All those edits flow into this
 * site automatically. site_settings is just "publish y/n" + custom
 * domain configuration -- nothing presentational.
 */

import { notFound } from 'next/navigation'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import type {
  WeeklyHours, SpecialHoursEntry, PromotionPayload, EventPayload,
} from '@/lib/updates/types'
import { getPublicSiteSettings } from '@/lib/site-settings/actions'
import Hero from '@/components/sites/hero'
import Hours from '@/components/sites/hours'
import Location from '@/components/sites/location'
import ActivePromo from '@/components/sites/active-promo'
import UpcomingEvents from '@/components/sites/upcoming-events'

interface PageProps { params: Promise<{ slug: string }> }

// Re-validate every 60 seconds; publishUpdate() also force-revalidates this path
// so updates appear in seconds rather than waiting for the timer.
export const revalidate = 60

function adminDb() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

interface ClientRow {
  id: string
  name: string
  slug: string
  brief_description: string | null
  website: string | null
}

interface BrandRow {
  primary_color: string | null
  secondary_color: string | null
  accent_color: string | null
  font_display: string | null
  font_body: string | null
  logo_url: string | null
  voice_notes: string | null
}

interface PlatformConnectionRow {
  platform: string
  profile_url: string | null
  username: string | null
}

export default async function RestaurantSite({ params }: PageProps) {
  const { slug } = await params
  const db = adminDb()

  // 1. Resolve the client by slug
  const { data: clientRaw } = await db
    .from('clients')
    .select('id, name, slug, brief_description, website')
    .eq('slug', slug)
    .maybeSingle()
  const client = clientRaw as ClientRow | null
  if (!client) notFound()

  // 2. Site publication state lives in site_settings -- but only that.
  //    Everything else flows from canonical tables.
  const settings = await getPublicSiteSettings(client.id)
  if (settings && !settings.isPublished) {
    return <UnpublishedPlaceholder name={client.name} slug={client.slug} />
  }

  // 3. Brand: pull colors / fonts / logo from client_brands
  const { data: brandRaw } = await db
    .from('client_brands')
    .select('primary_color, secondary_color, accent_color, font_display, font_body, logo_url, voice_notes')
    .eq('client_id', client.id)
    .maybeSingle()
  const brand = brandRaw as BrandRow | null

  // 4. Primary location (multi-location sites would add /sites/[slug]/[location])
  const { data: location } = await db
    .from('gbp_locations')
    .select('location_name, address, hours, special_hours')
    .eq('client_id', client.id)
    .eq('status', 'assigned')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  // 5. Active promotion (valid_from <= now < valid_until)
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
    .slice(0, 5)

  // 7. Social profile URLs from platform_connections
  const { data: socialRaw } = await db
    .from('platform_connections')
    .select('platform, profile_url, username')
    .eq('business_id', client.id)
  const socials = (socialRaw as PlatformConnectionRow[] | null) ?? []
  const findSocial = (p: string) => {
    const row = socials.find(s => s.platform.toLowerCase() === p)
    if (!row) return null
    if (row.profile_url) return row.profile_url
    if (row.username) {
      // Construct from username if URL not stored
      if (p === 'instagram') return `https://instagram.com/${row.username.replace(/^@/, '')}`
      if (p === 'facebook')  return `https://facebook.com/${row.username}`
      if (p === 'tiktok')    return `https://tiktok.com/@${row.username.replace(/^@/, '')}`
    }
    return null
  }
  const instagramUrl = findSocial('instagram')
  const facebookUrl  = findSocial('facebook')
  const tiktokUrl    = findSocial('tiktok')

  // 8. Look for a hero photo: try brand_assets tagged 'hero', then fall back
  //    to logo_url, then nothing. Future: dedicated photo gallery selection.
  const { data: heroAsset } = await db
    .from('brand_assets')
    .select('url')
    .eq('client_id', client.id)
    .contains('tags', ['hero'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const heroPhotoUrl = (heroAsset?.url as string | undefined) ?? undefined

  // ── Compose CTAs ────────────────────────────────────────────
  // Primary CTA preference order:
  //  1. Reservation link (if client has one configured)
  //  2. Order online link (if configured)
  //  3. Find us on the map
  // Secondary fills the unused slot. We don't have reservation/order URLs in
  // canonical tables yet, so they come from site_settings for now.
  const primaryCta = settings?.reservationUrl
    ? { label: 'Reserve a table', href: settings.reservationUrl }
    : settings?.orderOnlineUrl
    ? { label: 'Order online', href: settings.orderOnlineUrl }
    : location?.address
    ? {
        label: 'Find us',
        href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location.address as string)}`,
      }
    : undefined

  const secondaryCta = settings?.orderOnlineUrl && settings?.reservationUrl
    ? { label: 'Order online', href: settings.orderOnlineUrl }
    : (client.website
      ? { label: 'Visit website', href: client.website }
      : undefined)

  // ── Theme: pull from client_brands ──────────────────────────
  const themeStyle: React.CSSProperties = {
    ['--site-bg' as string]: '#FFFFFF',
    ['--site-text' as string]: '#1C1917',
    ['--site-primary' as string]: brand?.primary_color ?? '#2D4A22',
    ['--site-accent' as string]: brand?.accent_color ?? '#D97706',
  }

  return (
    <main
      className="text-stone-900"
      style={{ ...themeStyle, backgroundColor: 'var(--site-bg)', color: 'var(--site-text)' }}
    >
      <ActivePromo promotion={activePromo} />

      <Hero
        name={client.name}
        tagline={client.brief_description ?? undefined}
        heroPhotoUrl={heroPhotoUrl}
        primaryCta={primaryCta}
        secondaryCta={secondaryCta}
        activePromoName={activePromo?.name}
      />

      {location?.hours && (
        <Hours
          hours={location.hours as WeeklyHours}
          specialHours={(location.special_hours as SpecialHoursEntry[]) ?? []}
        />
      )}

      {upcomingEvents.length > 0 && <UpcomingEvents events={upcomingEvents} />}

      <Location
        address={location?.address as string | undefined}
        websiteUrl={settings?.orderOnlineUrl ?? client.website ?? undefined}
      />

      <footer className="py-8 px-6 text-center text-xs text-stone-400 border-t border-stone-100">
        <p>© {new Date().getFullYear()} {client.name}</p>
        {(instagramUrl || facebookUrl || tiktokUrl) && (
          <p className="mt-2 flex items-center justify-center gap-3">
            {instagramUrl && (
              <a href={instagramUrl} target="_blank" rel="noopener noreferrer" className="hover:text-stone-600">Instagram</a>
            )}
            {facebookUrl && (
              <a href={facebookUrl} target="_blank" rel="noopener noreferrer" className="hover:text-stone-600">Facebook</a>
            )}
            {tiktokUrl && (
              <a href={tiktokUrl} target="_blank" rel="noopener noreferrer" className="hover:text-stone-600">TikTok</a>
            )}
          </p>
        )}
        <p className="mt-2">Powered by <a href="https://apnosh.com" className="hover:text-stone-600">Apnosh</a></p>
      </footer>
    </main>
  )
}

// ── Unpublished state shown to admins/visitors when toggle is off ──
function UnpublishedPlaceholder({ name, slug }: { name: string; slug: string }) {
  return (
    <main className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl border border-stone-200 p-8 text-center">
        <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-amber-100 flex items-center justify-center">
          <svg
            xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className="w-6 h-6 text-amber-600"
          >
            <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-stone-900 mb-2">
          {name} site is not yet published
        </h1>
        <p className="text-sm text-stone-600 mb-6">
          The Apnosh Site for this restaurant is configured but not yet live. Toggle &ldquo;Site is live&rdquo;
          in the admin to publish it.
        </p>
        <a
          href={`/admin/clients/${slug}/site`}
          className="inline-block px-4 py-2 bg-stone-900 text-white text-sm font-medium rounded-lg hover:bg-stone-800"
        >
          Open site settings →
        </a>
      </div>
    </main>
  )
}
