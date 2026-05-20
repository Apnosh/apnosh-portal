'use client'

/**
 * Mobile bottom tab bar — 5 thumb-reachable destinations.
 *
 * Client (restaurant owner):
 *   Home    /dashboard                  Today + score + AI nudge
 *   Inbox   /dashboard/inbox            Unified approvals + reviews + messages
 *                                       + notifications with filter chips
 *   AI      /dashboard/chat             AI strategist chat
 *   Explore /dashboard/marketplace      Find vendors, services, packages
 *   Profile /dashboard/profile          Restaurant + brand + account settings
 *
 * Admin path keeps the existing 5 (Overview / Clients / Pipeline /
 * Billing / Reports) for staff.
 *
 * Active state is based on path prefix. Badges flow in via props so
 * the parent layout (already polling counts) can light up the Inbox
 * tab when there's pending work.
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home, Inbox, Sparkles, Compass, User,
  LayoutDashboard, Users, Kanban, CreditCard, FileBarChart,
} from 'lucide-react'

interface Tab {
  label: string
  href: string
  icon: typeof Home
  /* Match strategy:
       'prefix' = active if pathname starts with href
       'exact'  = active only when pathname === href */
  match: 'prefix' | 'exact'
}

const clientTabs: Tab[] = [
  { label: 'Home',    href: '/dashboard',             icon: Home,      match: 'exact' },
  { label: 'Inbox',   href: '/dashboard/inbox',       icon: Inbox,     match: 'prefix' },
  { label: 'AI',      href: '/dashboard/chat',        icon: Sparkles,  match: 'prefix' },
  { label: 'Explore', href: '/dashboard/marketplace', icon: Compass,   match: 'prefix' },
  { label: 'Profile', href: '/dashboard/profile',     icon: User,      match: 'prefix' },
]

const adminTabs: Tab[] = [
  { label: 'Overview', href: '/admin',          icon: LayoutDashboard, match: 'exact' },
  { label: 'Clients',  href: '/admin/clients',  icon: Users,           match: 'prefix' },
  { label: 'Pipeline', href: '/admin/pipeline', icon: Kanban,          match: 'prefix' },
  { label: 'Billing',  href: '/admin/billing',  icon: CreditCard,      match: 'prefix' },
  { label: 'Reports',  href: '/admin/reports',  icon: FileBarChart,    match: 'prefix' },
]

interface ClientTabBarProps {
  inboxBadge?: number
}

export function ClientTabBar({ inboxBadge = 0 }: ClientTabBarProps) {
  return <TabBar tabs={clientTabs} badges={{ '/dashboard/inbox': inboxBadge }} />
}

export function AdminTabBar() {
  return <TabBar tabs={adminTabs} />
}

function TabBar({
  tabs,
  badges = {},
}: {
  tabs: Tab[]
  badges?: Record<string, number>
}) {
  const pathname = usePathname()

  const isActive = (tab: Tab) => {
    if (tab.match === 'exact') return pathname === tab.href
    return pathname === tab.href || pathname.startsWith(tab.href + '/')
  }

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur border-t border-ink-6 lg:hidden safe-bottom"
      aria-label="Primary mobile navigation"
    >
      <div className="flex items-stretch">
        {tabs.map((tab) => {
          const active = isActive(tab)
          const badge = badges[tab.href] ?? 0
          const Icon = tab.icon
          return (
            <Link
              key={tab.href}
              href={tab.href}
              prefetch
              className="relative flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[60px] active:bg-ink-7/50 transition-colors"
              aria-current={active ? 'page' : undefined}
            >
              <span className={[
                'inline-flex items-center justify-center w-7 h-7 rounded-full transition-all',
                active ? 'bg-brand-tint text-brand-dark' : 'text-ink-4',
              ].join(' ')}>
                <Icon className="w-[18px] h-[18px]" strokeWidth={active ? 2.5 : 2} />
              </span>
              <span className={[
                'text-[10px] leading-none font-semibold transition-colors',
                active ? 'text-ink' : 'text-ink-4',
              ].join(' ')}>
                {tab.label}
              </span>
              {badge > 0 && (
                <span
                  className="absolute top-1.5 right-[calc(50%-22px)] min-w-[16px] h-4 px-1 rounded-full bg-rose-600 text-white text-[9px] font-bold flex items-center justify-center"
                  aria-label={`${badge} unread`}
                >
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
