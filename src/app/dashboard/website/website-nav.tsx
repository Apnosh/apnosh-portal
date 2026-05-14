'use client'

/**
 * Sticky sub-navigation for every Website page. Mirrors the Local
 * SEO tab strip exactly so owners learn one navigation pattern that
 * works for both channels.
 *
 * Local SEO: Overview / Full analytics / Reviews / Your listing / Menu
 * Website:   Overview / Full analytics / Your site / Requests
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart3, LineChart, Globe, Inbox, Mail } from 'lucide-react'

interface Tab {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  exact?: boolean
}

const TABS: Tab[] = [
  { label: 'Overview',       href: '/dashboard/website',          icon: BarChart3, exact: true },
  { label: 'Full analytics', href: '/dashboard/website/traffic',  icon: LineChart },
  { label: 'Your site',      href: '/dashboard/website/manage',   icon: Globe },
  { label: 'Forms',          href: '/dashboard/website/forms',    icon: Mail },
  { label: 'Requests',       href: '/dashboard/website/requests', icon: Inbox },
]

export default function WebsiteNav() {
  const pathname = usePathname()

  function isActive(t: Tab): boolean {
    if (t.exact) return pathname === t.href
    return pathname === t.href || pathname.startsWith(t.href + '/')
  }

  return (
    <nav
      className="sticky top-0 z-20 bg-bg-2/95 backdrop-blur border-b border-ink-6"
      aria-label="Website sub-navigation"
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
