'use client'

/**
 * Owner dashboard layout.
 *
 * The owner experience is now fully mobile-mvp: each owner page renders its own
 * full-screen MvpShell (header + bottom nav). So this layout adds NO chrome by
 * default — it just mounts the providers and gets out of the way. The only
 * exception is the handful of legacy desktop "deep tools" the mvp hubs link to
 * (e.g. website/traffic, social/library, local-seo/analytics); those get a thin
 * "back to <hub>" header instead of the old 260px sidebar.
 *
 * The previous desktop shell (sidebar nav, badge-count polling, connected-
 * channel queries, breadcrumbs, mobile tab bar, quick-request FAB) is gone:
 * nothing rendered it for owners anymore, and it was running its data effects +
 * a 60s poll behind every full-screen overlay. Team (/work) and admin (/admin)
 * have their own separate layouts and are unaffected.
 */

import { Suspense, useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { ToastProvider } from '@/components/ui/toast'
import { RealtimeProvider } from '@/lib/realtime'
import { ClientProvider, useClient } from '@/lib/client-context'
import SentryUserContext from '@/components/sentry-user-context'
import { LocationProvider, useLocationContext } from '@/lib/dashboard/location-context'
import LocationSelector from '@/components/dashboard/location-selector'
import type { ClientLocation } from '@/lib/dashboard/location-helpers'

// Floating "Ask Apnosh" chat — lazy so its client JS stays off the critical
// path for every owner route.
const AgentChat = dynamic(() => import('@/components/dashboard/agent-chat'), { ssr: false })

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
      <ToastProvider>
        <RealtimeProvider>
          {/* ClientProvider reads useSearchParams (admin ?clientId= handoff),
              so it must sit inside a Suspense boundary. */}
          <Suspense fallback={null}>
            <ClientProvider>
              <SentryUserContext />
              <LocationLoader>
                <DashboardShell>{children}</DashboardShell>
                <AgentChat />
              </LocationLoader>
            </ClientProvider>
          </Suspense>
        </RealtimeProvider>
      </ToastProvider>
  )
}

/**
 * Loads the client's locations once the client resolves, then mounts the
 * LocationProvider so the legacy deep tools (and the back-header selector) can
 * read/switch location. One fetch per session — the provider stays mounted
 * across client-side navigation.
 */
function LocationLoader({ children }: { children: React.ReactNode }) {
  const { client, loading: clientLoading } = useClient()
  const [locations, setLocations] = useState<ClientLocation[]>([])

  useEffect(() => {
    if (clientLoading || !client?.id) return
    let cancelled = false
    fetch(`/api/dashboard/locations?clientId=${client.id}`)
      .then(r => r.json())
      .then(data => { if (!cancelled) setLocations(Array.isArray(data.locations) ? data.locations : []) })
      .catch(() => { /* non-fatal: selector hides itself when N <= 1 */ })
    return () => { cancelled = true }
  }, [client?.id, clientLoading])

  return (
    <LocationProvider clientId={client?.id ?? null} locations={locations}>
      {children}
    </LocationProvider>
  )
}

function HeaderLocationSelector() {
  const { locations, selectedLocationId, setSelectedLocationId } = useLocationContext()
  return (
    <LocationSelector
      locations={locations}
      selectedLocationId={selectedLocationId}
      onChange={setSelectedLocationId}
    />
  )
}

/* Routes that ARE the mvp owner experience — they render their own MvpShell,
   so this layout adds nothing. Everything else under /dashboard is a legacy
   desktop deep tool and gets the thin back-header. */
const MVP_EXACT = new Set([
  '/dashboard', '/dashboard/orders', '/dashboard/inbox', '/dashboard/messages', '/dashboard/insights',
  '/dashboard/more', '/dashboard/billing',
  '/dashboard/assets', '/dashboard/goals', '/dashboard/help', '/dashboard/google-profile',
  '/dashboard/order-buttons', '/dashboard/review-replies', '/dashboard/listings',
])
const MVP_PREFIX = [
  '/dashboard/insights', // insights + its sub-routes (e.g. /insights/analyst) own their full-screen chrome
  '/dashboard/campaigns', '/dashboard/reviews', '/dashboard/business-info',
  '/dashboard/agreements', '/dashboard/settings', '/dashboard/connected-accounts',
  '/dashboard/connect-accounts', // the reconnect pickers (GA property / GSC site) — keep them full-screen mobile, not legacy desktop chrome
  '/dashboard/billing', // billing + its sub-routes (e.g. /billing/orders/[id]) own their full-screen chrome
]
function isMvpRoute(path: string): boolean {
  return MVP_EXACT.has(path) || MVP_PREFIX.some(p => path === p || path.startsWith(p + '/'))
}

/* Where a legacy deep tool's "back" goes: to its channel hub when it lives
   under one, otherwise to the More hub. */
function backTarget(path: string): { href: string; label: string } {
  if (path.startsWith('/dashboard/insights/')) return { href: '/dashboard/insights', label: 'Insights' }
  return { href: '/dashboard/more', label: 'More' }
}

function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  // mvp owner pages own their full-screen chrome; add nothing.
  if (isMvpRoute(pathname)) return <>{children}</>

  // Legacy desktop deep tool: a thin back header (keeps the multi-location
  // selector, which self-hides for single-location clients), then the page.
  const back = backTarget(pathname)
  return (
    <div className="min-h-screen bg-bg-2">
      <header className="h-13 bg-white border-b border-ink-6 flex items-center gap-2 px-3 sticky top-0 z-30" style={{ height: 52 }}>
        <Link href={back.href} className="inline-flex items-center gap-1.5 text-[14.5px] font-semibold text-brand-dark px-2 py-2 -ml-1 rounded-lg hover:bg-bg-2 transition-colors">
          <ArrowLeft className="w-[18px] h-[18px]" /> {back.label}
        </Link>
        <div className="flex-1" />
        <HeaderLocationSelector />
      </header>
      <main className="p-4 lg:p-6">{children}</main>
    </div>
  )
}
