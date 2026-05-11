'use client'

import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, CheckCircle, Calendar, ShoppingBag, BarChart3,
  MessageSquare, Wrench, Building2, CreditCard, FileText, HelpCircle, Settings,
  Menu, X, ChevronDown, BookOpen, FileBarChart, ListTodo,
  Share2, Globe, MapPin, Mail, Image as ImageIcon, Link2, Newspaper,
  Inbox, Star, Sparkles, Palette,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { CartProvider } from '@/lib/cart-context'
import { ToastProvider } from '@/components/ui/toast'
import { RealtimeProvider } from '@/lib/realtime'
import { ClientProvider, useClient } from '@/lib/client-context'
import SentryUserContext from '@/components/sentry-user-context'
import { LocationProvider, useLocationContext } from '@/lib/dashboard/location-context'
import { getClientLocations } from '@/lib/dashboard/get-client-locations'
import LocationSelector from '@/components/dashboard/location-selector'
import type { ClientLocation } from '@/lib/dashboard/location-helpers'
import Notifications from '@/components/ui/notifications'
import Breadcrumbs from '@/components/ui/breadcrumbs'
import { ClientTabBar } from '@/components/ui/mobile-tab-bar'
import QuickRequest from '@/components/ui/quick-request'
import { useUser, signOut } from '@/lib/supabase/hooks'

import type { ServiceArea } from '@/types/database'

interface NavChildItem {
  label: string
  href: string
  exact?: boolean
}

interface NavItem {
  label: string
  href: string
  icon: typeof LayoutDashboard
  exact: boolean
  serviceArea?: ServiceArea
  children?: NavChildItem[]
}

interface NavSection {
  label: string | null
  items: NavItem[]
}

// ─────────────────────────────────────────────────────────────────────
// Sidebar config (v1)
//
// Trimmed from ~30 visible items to ~13 for a typical client. We hide
// surfaces that are: half-built (mock data, coming-soon shells), thin
// hubs that just link to children, or duplicates. The pages themselves
// stay in the codebase -- only the nav exposure is gated.
//
// See docs/CLIENT-DASHBOARD-AUDIT.md for the full classification.
//
// Hidden for v1 (re-add when the underlying surface is ready):
//   /dashboard/website (Performance hub -- thin)
//   /dashboard/local-seo (Performance hub -- thin)
//   /dashboard/local-seo/locations (placeholder, no data)
//   /dashboard/analytics (redundant with local-seo)
//   /dashboard/social (use the children directly)
//   /dashboard/social/performance (duplicate)
//   /dashboard/email-sms/performance (low value vs Overview)
//   /dashboard/profile/strategy (advanced; revisit)
//   /dashboard/reports (overlaps Weekly Briefs)
//   /dashboard/approvals (rebuilding on real data; was mock)
//   /dashboard/tools (coming-soon shells)
//   /dashboard/calendar (becoming master calendar; rebuild)
//   /dashboard/orders/* (off-path for v1 onboarding)
//   /dashboard/goals (first-run only; surface as setup card)
//   /dashboard/notifications (use the bell icon in header)
// ─────────────────────────────────────────────────────────────────────
// Sidebar reorganized around marketing JOBS, not internal service-areas:
//   Today / Inbox / Calendar    — daily destinations
//   Publish (group)              — content channels
//   Engage (group)               — customer-facing surfaces
//   Brand (group)                — assets + guidelines combined
// Settings + low-frequency items moved to bottomItems.
const navSections: NavSection[] = [
  {
    label: null,
    items: [
      { label: 'Today', href: '/dashboard', icon: LayoutDashboard, exact: true },
      { label: 'Inbox', href: '/dashboard/inbox', icon: Inbox, exact: false },
      { label: 'Calendar', href: '/dashboard/calendar', icon: Calendar, exact: false },
    ],
  },
  {
    label: 'Publish',
    items: [
      // Each channel routes to its analytics-overview page by default;
      // operational sub-pages (calendar, drafts, etc.) are children.
      // Default click answers "how is this channel doing?" first; the
      // owner can then drill into the operational sub-pages.
      {
        label: 'Social media',
        href: '/dashboard/social',  // the publisher's hub
        icon: Sparkles,
        exact: true,
        serviceArea: 'social',
        children: [
          { label: 'Hub', href: '/dashboard/social', exact: true },
          { label: 'Request content', href: '/dashboard/social/request' },
          { label: 'Boost a post', href: '/dashboard/social/boost' },
          { label: 'Calendar', href: '/dashboard/calendar' },
          { label: 'Performance', href: '/dashboard/social/performance' },
          { label: 'Action needed', href: '/dashboard/social/action-needed' },
        ],
      },
      {
        label: 'Local SEO',
        href: '/dashboard/local-seo',
        icon: MapPin,
        exact: false,
        serviceArea: 'local_seo',
      },
      {
        label: 'Email & SMS',
        href: '/dashboard/email-sms',  // overview = performance first
        icon: Mail,
        exact: true,
        serviceArea: 'email_sms',
        children: [
          { label: 'Performance', href: '/dashboard/email-sms', exact: true },
          { label: 'Campaigns', href: '/dashboard/email-sms/campaigns' },
          { label: 'List & Audience', href: '/dashboard/email-sms/list' },
        ],
      },
      {
        label: 'Website',
        href: '/dashboard/website/traffic',  // analytics-first instead of /manage
        icon: Globe,
        exact: false,
        serviceArea: 'website',
        children: [
          { label: 'Traffic', href: '/dashboard/website/traffic' },
          { label: 'Site Health', href: '/dashboard/website/health' },
          { label: 'Manage site', href: '/dashboard/website/manage' },
          { label: 'Request a change', href: '/dashboard/website/requests/new' },
          { label: 'Change Requests', href: '/dashboard/website/requests' },
        ],
      },
    ],
  },
  {
    label: 'Engage',
    items: [
      {
        label: 'Reviews',
        href: '/dashboard/local-seo/reviews',
        icon: Star,
        exact: false,
      },
      {
        label: 'Messages',
        href: '/dashboard/messages',
        icon: MessageSquare,
        exact: false,
      },
    ],
  },
  {
    label: 'Your business',
    items: [
      {
        label: 'Your restaurant',
        href: '/dashboard/restaurant',
        icon: Building2,
        exact: false,
        children: [
          { label: 'Restaurant details', href: '/dashboard/restaurant' },
          { label: 'Goals', href: '/dashboard/goals' },
        ],
      },
      {
        label: 'Brand & Assets',
        href: '/dashboard/assets',
        icon: Palette,
        exact: false,
        children: [
          { label: 'Assets', href: '/dashboard/assets' },
          { label: 'Brand guidelines', href: '/dashboard/profile/brand-guidelines' },
        ],
      },
      {
        label: 'Weekly briefs',
        href: '/dashboard/briefs',
        icon: Newspaper,
        exact: false,
      },
    ],
  },
]

// Footer items — low-frequency settings, kept compact in the bottom rail.
const bottomItems = [
  { label: 'Connections', href: '/dashboard/connected-accounts', icon: Link2 },
  { label: 'Business profile', href: '/dashboard/profile', icon: Building2 },
  { label: 'Billing', href: '/dashboard/billing', icon: CreditCard },
  { label: 'Agreements', href: '/dashboard/agreements', icon: FileText },
  { label: 'Settings', href: '/dashboard/settings', icon: Settings },
  { label: 'Help', href: '/dashboard/help', icon: HelpCircle },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <CartProvider>
      <ToastProvider>
        <RealtimeProvider>
          {/* ClientProvider reads useSearchParams (for the admin
              ?clientId= picker handoff) so it has to live inside a
              Suspense boundary or static generation rejects the build. */}
          <Suspense fallback={null}>
            <ClientProvider>
              <SentryUserContext />
              <LocationLoader>
                <DashboardShell>{children}</DashboardShell>
              </LocationLoader>
            </ClientProvider>
          </Suspense>
        </RealtimeProvider>
      </ToastProvider>
    </CartProvider>
  )
}

/**
 * Loads the client's locations once the client is resolved, then mounts the
 * LocationProvider so every page below can read the current location selection.
 * The LocationSelector itself lives in the header (see DashboardShell).
 */
function LocationLoader({ children }: { children: React.ReactNode }) {
  const { client, loading: clientLoading } = useClient()
  const [locations, setLocations] = useState<ClientLocation[]>([])

  useEffect(() => {
    if (clientLoading || !client?.id) return
    let cancelled = false
    // Fetch the client's locations via the public locations API. We use a
    // plain GET endpoint instead of the getClientLocations server action
    // because Next.js was caching the action's result aggressively across
    // deploys, masking the gbp_locations fallback path.
    fetch(`/api/dashboard/locations?clientId=${client.id}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return
        setLocations(Array.isArray(data.locations) ? data.locations : [])
      })
      .catch(() => { /* non-fatal: selector hides itself when N <= 1 */ })
    return () => { cancelled = true }
  }, [client?.id, clientLoading])

  return (
    <LocationProvider clientId={client?.id ?? null} locations={locations}>
      {children}
    </LocationProvider>
  )
}

/**
 * Header component reading from LocationContext. Only renders the selector
 * when the client has more than one location (the component itself returns
 * null in that case, so this is just a thin wrapper).
 */
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

function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const { data: user, loading: userLoading } = useUser()
  const { client, enrolledServices, loading: clientLoading } = useClient()

  // Sidebar badge counts. Reads from the consolidated /api/dashboard/load
  // endpoint so we get inbox, reviews (and later messages) in one shot
  // and use the same auth path that handles all client linkage types
  // (admin / profile / business owner / client_users magic-link portal).
  const [navCounts, setNavCounts] = useState<{ inbox: number; reviews: number; approvals: number }>({
    inbox: 0,
    reviews: 0,
    approvals: 0,
  })

  useEffect(() => {
    if (!client?.id) return
    let cancelled = false
    async function fetchCounts() {
      try {
        const r = await fetch(`/api/dashboard/load?clientId=${encodeURIComponent(client!.id)}`)
        if (!r.ok) return
        const json = await r.json() as {
          counts?: { unansweredReviews?: number; pendingApprovals?: number }
          agenda?: Array<{ urgency: 'high' | 'medium' | 'low' }>
        }
        if (cancelled) return
        const inbox = (json.agenda ?? []).filter(a => a.urgency === 'high' || a.urgency === 'medium').length
        setNavCounts({
          inbox,
          reviews: json.counts?.unansweredReviews ?? 0,
          approvals: json.counts?.pendingApprovals ?? 0,
        })
      } catch { /* silent */ }
    }
    fetchCounts()
    const interval = setInterval(fetchCounts, 60_000)  // 60s — was 30s, eases server load
    return () => { cancelled = true; clearInterval(interval) }
  }, [client?.id])

  // Map nav-item label/href to the right count.
  function badgeFor(item: { label: string; href: string }): number {
    if (item.label === 'Inbox' || item.href === '/dashboard/approvals') return navCounts.inbox
    if (item.label === 'Reviews') return navCounts.reviews
    return 0
  }

  // Display name preference: explicit user name -> restaurant name -> email
  // local-part -> 'User'. Avoids the generic "User · Client" label when the
  // auth user record has no full_name set.
  const emailLocal = user?.email?.split('@')[0]
  const displayName = user?.full_name || client?.name || emailLocal || 'User'
  const initials = displayName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
  const roleLabel = user?.role === 'admin' ? 'Admin' : (client?.name ? client.name : 'Client')

  const isActive = (href: string, exact?: boolean) => {
    if (exact || href === '/dashboard') return pathname === href
    return pathname === href || pathname.startsWith(href + '/')
  }

  // Track which expandable nav items are open. Auto-open based on current path.
  const [expandedItems, setExpandedItems] = useState<Set<string>>(() => {
    const initial = new Set<string>()
    for (const section of navSections) {
      for (const item of section.items) {
        if (item.children && pathname.startsWith(item.href)) {
          initial.add(item.href)
        }
      }
    }
    return initial
  })

  // Auto-open when pathname changes to a sub-page
  useEffect(() => {
    setExpandedItems(prev => {
      const next = new Set(prev)
      for (const section of navSections) {
        for (const item of section.items) {
          if (item.children && pathname.startsWith(item.href)) {
            next.add(item.href)
          }
        }
      }
      return next
    })
  }, [pathname])

  function toggleExpanded(href: string) {
    setExpandedItems(prev => {
      const next = new Set(prev)
      if (next.has(href)) next.delete(href)
      else next.add(href)
      return next
    })
  }

  const NavLink = ({ item }: { item: NavItem | { label: string; href: string; icon: typeof LayoutDashboard; exact?: boolean; serviceArea?: ServiceArea; children?: NavChildItem[] } }) => {
    const badgeCount = badgeFor(item)
    const showBadge = badgeCount > 0
    const hasChildren = 'children' in item && item.children && item.children.length > 0
    const isExpanded = hasChildren && expandedItems.has(item.href)
    const active = isActive(item.href, item.exact)

    // For items with children, render an expandable dropdown
    if (hasChildren) {
      return (
        <div>
          <div className={`flex items-center rounded-lg transition-colors ${
            active ? 'bg-brand-tint text-brand-dark' : 'text-ink-3 hover:bg-bg-2 hover:text-ink'
          }`}>
            <Link
              href={item.href}
              onClick={() => setSidebarOpen(false)}
              className="flex items-center gap-3 px-3 py-2 flex-1 min-h-[44px] text-sm font-medium rounded-l-lg"
            >
              <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
              <span className="flex-1">{item.label}</span>
              {showBadge && (
                <span className="min-w-[20px] h-5 flex items-center justify-center rounded-full bg-brand text-white text-[11px] font-bold px-1.5">
                  {badgeCount > 99 ? '99+' : badgeCount}
                </span>
              )}
            </Link>
            <button
              onClick={e => { e.preventDefault(); toggleExpanded(item.href) }}
              className="px-2 py-2 min-h-[44px] flex items-center justify-center rounded-r-lg hover:bg-black/5 transition-colors"
              aria-label={isExpanded ? 'Collapse' : 'Expand'}
            >
              <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
            </button>
          </div>
          {isExpanded && 'children' in item && item.children && (
            <div className="ml-4 mt-0.5 space-y-0.5 border-l border-ink-6 pl-3">
              {item.children.map(child => {
                const childActive = isActive(child.href, child.exact)
                return (
                  <Link
                    key={child.href}
                    href={child.href}
                    onClick={() => setSidebarOpen(false)}
                    className={`block px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors min-h-[36px] flex items-center ${
                      childActive
                        ? 'bg-brand-tint/60 text-brand-dark'
                        : 'text-ink-3 hover:bg-bg-2 hover:text-ink'
                    }`}
                  >
                    {child.label}
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      )
    }

    return (
      <Link
        href={item.href}
        onClick={() => setSidebarOpen(false)}
        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${
          active
            ? 'bg-brand-tint text-brand-dark'
            : 'text-ink-3 hover:bg-bg-2 hover:text-ink'
        }`}
      >
        <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
        <span className="flex-1">{item.label}</span>
        {showBadge && (
          <span className="min-w-[20px] h-5 flex items-center justify-center rounded-full bg-brand text-white text-[11px] font-bold px-1.5">
            {badgeCount > 99 ? '99+' : badgeCount}
          </span>
        )}
      </Link>
    )
  }

  return (
    <div className="min-h-screen bg-bg-2 flex pb-14 lg:pb-0">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/30 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed top-0 left-0 h-full w-[260px] bg-white border-r border-ink-6 z-50 flex flex-col transition-transform duration-200 lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        {/* Logo */}
        <div className="h-14 flex items-center justify-between px-5 border-b border-ink-6">
          <Link href="/dashboard" className="font-[family-name:var(--font-display)] text-lg text-ink">
            Apn<em className="text-brand-dark italic">osh</em>
          </Link>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-ink-4 hover:text-ink min-h-[44px] min-w-[44px] flex items-center justify-center">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 overflow-y-auto">
          {navSections.map((section, idx) => {
            // Filter service-gated items based on enrollment.
            // While loading, hide service-gated items to avoid flicker — they
            // appear once enrollment resolves.
            const visibleItems = section.items.filter(item =>
              !item.serviceArea || (!clientLoading && enrolledServices.has(item.serviceArea))
            )
            if (visibleItems.length === 0) return null
            return (
              <div key={idx} className={idx > 0 ? 'mt-4' : ''}>
                {section.label && (
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-4 px-3 mb-1.5">
                    {section.label}
                  </div>
                )}
                <div className="space-y-0.5">
                  {visibleItems.map((item) => <NavLink key={item.href} item={item} />)}
                </div>
              </div>
            )
          })}
          <div className="h-px bg-ink-6 my-4" />
          <div className="space-y-0.5">
            {bottomItems.map((item) => <NavLink key={item.href} item={item} />)}
          </div>
        </nav>

        {/* User */}
        <div className="p-3 border-t border-ink-6 relative">
          <button onClick={() => setUserMenuOpen(!userMenuOpen)} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-bg-2 transition-colors min-h-[44px]">
            {userLoading ? (
              <div className="w-8 h-8 rounded-full bg-ink-6 animate-pulse" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-brand-tint border border-brand/20 flex items-center justify-center text-brand-dark text-xs font-bold">
                {initials}
              </div>
            )}
            <div className="flex-1 text-left">
              {userLoading ? (
                <div className="h-4 w-24 bg-ink-6 rounded animate-pulse" />
              ) : (
                <>
                  <div className="text-sm font-medium text-ink truncate">{displayName}</div>
                  <div className="text-[10px] text-ink-4">{roleLabel}</div>
                </>
              )}
            </div>
            <ChevronDown className={`w-4 h-4 text-ink-4 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
          </button>
          {userMenuOpen && (
            <div className="absolute bottom-full left-3 right-3 mb-1 bg-white rounded-xl border border-ink-6 shadow-lg overflow-hidden z-50">
              <a href="/dashboard/profile" className="block px-4 py-2.5 text-sm text-ink-2 hover:bg-bg-2 transition-colors">Profile</a>
              <a href="/dashboard/settings" className="block px-4 py-2.5 text-sm text-ink-2 hover:bg-bg-2 transition-colors">Settings</a>
              <div className="border-t border-ink-6" />
              <button onClick={signOut} className="w-full text-left px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors">
                Sign out
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 lg:ml-[260px]">
        {/* Top bar */}
        <header className="h-14 bg-white border-b border-ink-6 flex items-center justify-between px-4 lg:px-6 sticky top-0 z-30">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-ink-3 hover:text-ink min-h-[44px] min-w-[44px] flex items-center justify-center">
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-3">
            <HeaderLocationSelector />
            <Link href="/dashboard/messages" className="text-ink-4 hover:text-ink transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center">
              <MessageSquare className="w-5 h-5" />
            </Link>
            <Notifications />
          </div>
        </header>

        {/* Content */}
        <main className="p-4 lg:p-6">
          <Breadcrumbs />
          {children}
        </main>
      </div>
      <QuickRequest />
      <ClientTabBar />
    </div>
  )
}
