/**
 * Apnosh Sites: a public restaurant website.
 *
 * Architecture:
 * - One Next.js page renders any restaurant by slug
 * - Pulls all data from Apnosh source-of-truth tables
 * - When admin updates hours / promotions / events in Apnosh, the
 *   site re-renders on next visit -- no manual website maintenance
 *
 * Components:
 *   <ActivePromo />     -- top banner if a promotion is active right now
 *   <Hero />            -- name, tagline, hero photo, CTAs
 *   <Hours />           -- weekly + special hours, today highlighted
 *   <UpcomingEvents />  -- next 30 days of events
 *   <Location />        -- address, phone, parking, accessibility
 *
 * Future:
 *   <Menu />            -- when menu_items table is built
 *   <Photos />          -- gallery from connected GBP photos
 *   <Reviews />         -- recent GBP reviews
 *   <OrderOnline />     -- Toast / ChowNow / DoorDash links
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

// Re-validate every 60 seconds so updates from Apnosh appear quickly
export const revalidate = 60

function adminDb() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export default async function RestaurantSite({ params }: PageProps) {
  const { slug } = await params
  const db = adminDb()

  // 1. Resolve the client by slug
  const { data: client } = await db
    .from('clients')
    .select('id, name, primary_industry, brief_description, website')
    .eq('slug', slug)
    .maybeSingle()

  if (!client) notFound()

  // 2. Load site_settings (presentation layer: hero photo, colors, links)
  const settings = await getPublicSiteSettings(client.id as string)
  // Hide unpublished sites from the public unless settings is null (no settings = default-show
  // for backwards compatibility while we migrate clients to explicit publishing)
  if (settings && !settings.isPublished) notFound()

  // 3. Pull the primary location (for now, multi-location sites would
  //    need a /sites/[slug]/[location] route)
  const { data: location } = await db
    .from('gbp_locations')
    .select('location_name, address, hours, special_hours, store_code')
    .eq('client_id', client.id)
    .eq('status', 'assigned')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  // 4. Pull active promotion (one with valid_from <= now < valid_until)
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

  // 5. Pull upcoming events (start_at >= today, next 30 days)
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

  // Compose CTAs from site settings (preferred) with fallback to client.website
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
      ? { label: 'Visit website', href: client.website as string }
      : undefined)

  // Apply theme via inline CSS variables -- works even without site_settings (fallbacks)
  const themeStyle: React.CSSProperties = {
    ['--site-bg' as string]: settings?.backgroundColor ?? '#FFFFFF',
    ['--site-text' as string]: settings?.textColor ?? '#1C1917',
    ['--site-primary' as string]: settings?.primaryColor ?? '#2D4A22',
    ['--site-accent' as string]: settings?.accentColor ?? '#D97706',
  }

  return (
    <main
      className="text-stone-900"
      style={{ ...themeStyle, backgroundColor: 'var(--site-bg)', color: 'var(--site-text)' }}
    >
      <ActivePromo promotion={activePromo} />

      <Hero
        name={client.name as string}
        tagline={settings?.tagline ?? (client.brief_description as string | undefined)}
        heroPhotoUrl={settings?.heroPhotoUrl ?? undefined}
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
        websiteUrl={settings?.orderOnlineUrl ?? (client.website as string | undefined)}
      />

      <footer className="py-8 px-6 text-center text-xs text-stone-400 border-t border-stone-100">
        <p>© {new Date().getFullYear()} {client.name as string}</p>
        {(settings?.instagramUrl || settings?.facebookUrl || settings?.tiktokUrl) && (
          <p className="mt-2 flex items-center justify-center gap-3">
            {settings?.instagramUrl && (
              <a href={settings.instagramUrl} target="_blank" rel="noopener noreferrer" className="hover:text-stone-600">Instagram</a>
            )}
            {settings?.facebookUrl && (
              <a href={settings.facebookUrl} target="_blank" rel="noopener noreferrer" className="hover:text-stone-600">Facebook</a>
            )}
            {settings?.tiktokUrl && (
              <a href={settings.tiktokUrl} target="_blank" rel="noopener noreferrer" className="hover:text-stone-600">TikTok</a>
            )}
          </p>
        )}
        <p className="mt-2">Powered by <a href="https://apnosh.com" className="hover:text-stone-600">Apnosh</a></p>
      </footer>
    </main>
  )
}
