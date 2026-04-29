'use client'

import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, CheckCircle, Calendar, ShoppingBag, BarChart3,
  MessageSquare, Wrench, Building2, CreditCard, FileText, HelpCircle, Settings,
  Menu, X, ChevronDown, BookOpen, FileBarChart, ListTodo,
  Share2, Globe, MapPin, Mail, Image as ImageIcon, Target, Link2, Newspaper,
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

const navSections: NavSection[] = [
  {
    label: null,
    items: [
      { label: 'Executive Summary', href: '/dashboard', icon: LayoutDashboard, exact: true },
    ],
  },
  {
    label: 'Services',
    items: [
      {
        label: 'Social Media',
        href: '/dashboard/social',
        icon: Share2,
        exact: false,
        serviceArea: 'social',
        children: [
          { label: 'Performance', href: '/dashboard/social', exact: true },
          { label: 'Review', href: '/dashboard/social/action-needed' },
          { label: 'Calendar', href: '/dashboard/social/calendar' },
          { label: 'Request content', href: '/dashboard/social/requests/new' },
          { label: 'Requests', href: '/dashboard/social/requests' },
        ],
      },
      {
        label: 'Website',
        href: '/dashboard/website',
        icon: Globe,
        exact: false,
        serviceArea: 'website',
        children: [
          { label: 'Performance', href: '/dashboard/website', exact: true },
          { label: 'Manage site', href: '/dashboard/website/manage' },
          { label: 'Full details', href: '/dashboard/website/traffic' },
          { label: 'Site Health', href: '/dashboard/website/health' },
          { label: 'Request a change', href: '/dashboard/website/requests/new' },
          { label: 'Change Requests', href: '/dashboard/website/requests' },
        ],
      },
      {
        label: 'Local SEO',
        href: '/dashboard/local-seo',
        icon: MapPin,
        exact: false,
        serviceArea: 'local_seo',
        children: [
          { label: 'Performance', href: '/dashboard/local-seo', exact: true },
          { label: 'Full details', href: '/dashboard/analytics' },
          { label: 'Locations', href: '/dashboard/local-seo/locations' },
          { label: 'Reviews', href: '/dashboard/local-seo/reviews' },
        ],
      },
      {
        label: 'Email & SMS',
        href: '/dashboard/email-sms',
        icon: Mail,
        exact: false,
        serviceArea: 'email_sms',
        children: [
          { label: 'Overview', href: '/dashboard/email-sms', exact: true },
          { label: 'Campaigns', href: '/dashboard/email-sms/campaigns' },
          { label: 'List & Audience', href: '/dashboard/email-sms/list' },
          { label: 'Performance', href: '/dashboard/email-sms/performance' },
        ],
      },
    ],
  },
  {
    label: 'Brand',
    items: [
      { label: 'Assets', href: '/dashboard/assets', icon: ImageIcon, exact: false },
    ],
  },
  {
    label: 'Communication',
    items: [
      {
        label: 'Messages',
        href: '/dashboard/messages',
        icon: MessageSquare,
        exact: false,
      },
      {
        label: 'Weekly Briefs',
        href: '/dashboard/briefs',
        icon: Newspaper,
        exact: false,
      },
      {
        label: 'Reports',
        href: '/dashboard/reports',
        icon: FileBarChart,
        exact: false,
      },
    ],
  },
]

const bottomItems = [
  { label: 'Business Profile', href: '/dashboard/profile', icon: Building2 },
  { label: 'My Strategy', href: '/dashboard/profile/strategy', icon: Target },
  { label: 'Brand Guidelines', href: '/dashboard/profile/brand-guidelines', icon: BookOpen },
  { label: 'Connected Accounts', href: '/dashboard/connected-accounts', icon: Link2 },
  { label: 'Agreements', href: '/dashboard/agreements', icon: FileText },
  { label: 'Billing', href: '/dashboard/billing', icon: CreditCard },
  { label: 'Settings', href: '/dashboard/settings', icon: Settings },
  { label: 'Help', href: '/dashboard/help', icon: HelpCircle },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <CartProvider>
      <ToastProvider>
        <RealtimeProvider>
          <ClientProvider>
            <SentryUserContext />
            <Suspense fallback={null}>
              <LocationLoader>
                <DashboardShell>{children}</DashboardShell>
              </LocationLoader>
            </Suspense>
          </ClientProvider>
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
  const [approvalCount, setApprovalCount] = useState(0)

  // Fetch pending approval count
  useEffect(() => {
    async function fetchApprovalCount() {
      const supabase = createClient()
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) return

      const { data: biz } = await supabase
        .from('businesses')
        .select('id')
        .eq('owner_id', authUser.id)
        .single()

      if (!biz) return

      const { count } = await supabase
        .from('deliverables')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', biz.id)
        .eq('status', 'client_review')

      setApprovalCount(count || 0)
    }
    fetchApprovalCount()

    // Refresh every 30 seconds
    const interval = setInterval(fetchApprovalCount, 30_000)
    return () => clearInterval(interval)
  }, [])

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
    const showBadge = item.label === 'Approvals' && approvalCount > 0
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
            {approvalCount}
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
