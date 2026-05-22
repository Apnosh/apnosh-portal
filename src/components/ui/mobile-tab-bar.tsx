'use client'

/**
 * Mobile bottom tab bar — 5 items with an elevated center action.
 *
 * Layout (client / restaurant owner):
 *   [Home]  [Inbox]   (+)   [Plan]  [Menu]
 *
 * The center "+" is a FAB-style action button that opens a bottom
 * sheet of quick actions (Ask AI, Request content, Message strategist,
 * etc.). It does NOT navigate — it triggers an in-page sheet.
 *
 * The rightmost "Menu" tab opens the existing sidebar drawer (the
 * full nav with 36+ surfaces). It does NOT navigate either.
 *
 * Home / Inbox / Plan are real route destinations.
 *
 * Admin path keeps a simpler 5-item navigation bar (no FAB).
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home, Inbox, Plus, CalendarDays, LayoutGrid,
  LayoutDashboard, Users, Kanban, CreditCard, FileBarChart,
} from 'lucide-react'

interface NavTab {
  kind: 'nav'
  label: string
  href: string
  icon: typeof Home
  match: 'prefix' | 'exact'
}

interface ActionTab {
  kind: 'action'
  label: string
  icon: typeof Plus
  action: 'plus'
}

type Tab = NavTab | ActionTab

const clientTabs: Tab[] = [
  { kind: 'nav',    label: 'Home',      href: '/dashboard',           icon: Home,       match: 'exact' },
  { kind: 'nav',    label: 'Inbox',     href: '/dashboard/inbox',     icon: Inbox,      match: 'prefix' },
  { kind: 'action', label: 'Quick',     icon: Plus, action: 'plus' },
  { kind: 'nav',    label: 'Plan',      href: '/dashboard/analytics', icon: CalendarDays, match: 'prefix' },
  /* Menu now points at a real /dashboard/menu page (grouped nav cards)
     instead of opening the slide-in drawer. The drawer remains for
     desktop (sidebar is always visible there). */
  { kind: 'nav',    label: 'Menu',      href: '/dashboard/menu',      icon: LayoutGrid, match: 'prefix' },
]

const adminTabs: Tab[] = [
  { kind: 'nav', label: 'Overview', href: '/admin',          icon: LayoutDashboard, match: 'exact' },
  { kind: 'nav', label: 'Clients',  href: '/admin/clients',  icon: Users,           match: 'prefix' },
  { kind: 'nav', label: 'Pipeline', href: '/admin/pipeline', icon: Kanban,          match: 'prefix' },
  { kind: 'nav', label: 'Billing',  href: '/admin/billing',  icon: CreditCard,      match: 'prefix' },
  { kind: 'nav', label: 'Reports',  href: '/admin/reports',  icon: FileBarChart,    match: 'prefix' },
]

interface ClientTabBarProps {
  inboxBadge?: number
  onPlusClick?: () => void
}

export function ClientTabBar({ inboxBadge = 0, onPlusClick }: ClientTabBarProps) {
  return (
    <TabBar
      tabs={clientTabs}
      badges={{ '/dashboard/inbox': inboxBadge }}
      onAction={(a) => {
        if (a === 'plus') onPlusClick?.()
      }}
    />
  )
}

export function AdminTabBar() {
  return <TabBar tabs={adminTabs} />
}

function TabBar({
  tabs,
  badges = {},
  onAction,
}: {
  tabs: Tab[]
  badges?: Record<string, number>
  onAction?: (action: 'plus') => void
}) {
  const pathname = usePathname()

  const isActive = (tab: NavTab) => {
    if (tab.match === 'exact') return pathname === tab.href
    return pathname === tab.href || pathname.startsWith(tab.href + '/')
  }

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur border-t border-ink-6 lg:hidden safe-bottom"
      aria-label="Primary mobile navigation"
    >
      <div className="flex items-stretch relative">
        {tabs.map((tab, i) => {
          if (tab.kind === 'action') {
            /* Elevated center FAB — pokes above the bar via negative
               top margin + drop shadow. Brand-colored, larger touch
               target. Opens the bottom sheet. */
            return (
              <button
                key={`fab-${i}`}
                onClick={() => onAction?.('plus')}
                aria-label="Quick actions"
                className="flex-1 flex flex-col items-center justify-end pb-1 min-h-[60px] active:scale-95 transition-transform"
              >
                <span
                  className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-brand text-white shadow-lg shadow-brand/40 -mt-6 mb-1 active:bg-brand-dark transition-colors"
                  style={{ boxShadow: '0 8px 20px -4px rgba(74,189,152,0.5), 0 0 0 4px white' }}
                >
                  <Plus className="w-7 h-7" strokeWidth={2.5} />
                </span>
                <span className="text-[10px] leading-none font-semibold text-ink-3">
                  {tab.label}
                </span>
              </button>
            )
          }

          /* Real navigation tab (Home / Inbox / Analytics / Menu). */
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
