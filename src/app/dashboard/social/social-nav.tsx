'use client'

/**
 * Sticky sub-navigation for every Social page. Mirrors website-nav.tsx
 * so owners learn one navigation pattern across the portal.
 *
 * 5 tabs: Overview / Calendar / Inbox / Performance / Library
 *
 * Old standalone pages (action-needed, quotes, engage, results, plan,
 * boost, request) redirect into the right tab so existing bookmarks
 * keep working through the consolidation phases.
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Calendar, Inbox, BarChart3, Folder, Megaphone } from 'lucide-react'

interface Tab {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  exact?: boolean
  /** Other path prefixes that should also light this tab up. */
  alsoMatch?: string[]
}

const TABS: Tab[] = [
  { label: 'Overview',    href: '/dashboard/social',             icon: Home, exact: true },
  { label: 'Calendar',    href: '/dashboard/social/calendar',    icon: Calendar, alsoMatch: ['/dashboard/social/plan'] },
  { label: 'Ads',         href: '/dashboard/social/ads',         icon: Megaphone, alsoMatch: ['/dashboard/social/boost'] },
  { label: 'Inbox',       href: '/dashboard/social/inbox',       icon: Inbox, alsoMatch: ['/dashboard/social/action-needed', '/dashboard/social/quotes', '/dashboard/social/engage', '/dashboard/social/requests'] },
  { label: 'Performance', href: '/dashboard/social/performance', icon: BarChart3, alsoMatch: ['/dashboard/social/results'] },
  { label: 'Library',     href: '/dashboard/social/library',     icon: Folder },
]

export default function SocialNav() {
  const pathname = usePathname()

  function isActive(t: Tab): boolean {
    if (t.exact) return pathname === t.href
    if (pathname === t.href || pathname.startsWith(t.href + '/')) return true
    if (t.alsoMatch?.some(p => pathname === p || pathname.startsWith(p + '/'))) return true
    return false
  }

  return (
    <nav
      className="sticky top-0 z-20 bg-bg-2/95 backdrop-blur border-b border-ink-6"
      aria-label="Social sub-navigation"
    >
      <div className="max-w-5xl mx-auto px-4 lg:px-6">
        <div className="flex items-center gap-1 overflow-x-auto -mb-px">
          {TABS.map(t => {
            const Icon = t.icon
            const active = isActive(t)
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`relative inline-flex items-center gap-1.5 px-3 py-3 text-[13px] font-medium whitespace-nowrap transition-colors ${
                  active ? 'text-ink' : 'text-ink-3 hover:text-ink-2'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
                {active && (
                  <span className="absolute left-0 right-0 -bottom-px h-[2px] bg-brand rounded-full" />
                )}
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
