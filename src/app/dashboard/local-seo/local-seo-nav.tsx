'use client'

/**
 * Shared sub-navigation for every Local SEO page.
 *
 * Renders as a sticky tab strip below the main shell so an owner can
 * move between Overview / Reviews / Listing / Locations without
 * jumping back to the global sidebar. Mirrors the pattern used by
 * Social media's sub-pages (Hub / Plan / Engage / Library / …).
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { BarChart3, Star, MapPin, Layers } from 'lucide-react'
import { useClient } from '@/lib/client-context'

interface Tab {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  /** Match exactly (overview) vs prefix-match (reviews, listing). */
  exact?: boolean
  /** Hide the tab when the client has 0 or 1 connected locations — comparison
     view only makes sense with multiple listings. */
  multiLocationOnly?: boolean
}

const TABS: Tab[] = [
  { label: 'Overview', href: '/dashboard/local-seo', icon: BarChart3, exact: true },
  { label: 'Reviews', href: '/dashboard/local-seo/reviews', icon: Star },
  { label: 'Your listing', href: '/dashboard/local-seo/listing', icon: MapPin },
  { label: 'Locations', href: '/dashboard/local-seo/locations', icon: Layers, multiLocationOnly: true },
]

export default function LocalSeoNav() {
  const pathname = usePathname()
  const { client } = useClient()
  const [locationCount, setLocationCount] = useState<number | null>(null)

  useEffect(() => {
    if (!client?.id) return
    let cancelled = false
    fetch(`/api/dashboard/locations?clientId=${encodeURIComponent(client.id)}`)
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (cancelled || !json) return
        const n = Array.isArray(json?.locations) ? json.locations.length : 0
        setLocationCount(n)
      })
      .catch(() => { /* leave null, render conservatively */ })
    return () => { cancelled = true }
  }, [client?.id])

  const visible = TABS.filter(t => {
    if (!t.multiLocationOnly) return true
    return locationCount !== null && locationCount > 1
  })

  function isActive(t: Tab): boolean {
    if (t.exact) return pathname === t.href
    return pathname === t.href || pathname.startsWith(t.href + '/')
  }

  return (
    <nav
      className="sticky top-0 z-20 bg-bg-2/95 backdrop-blur border-b border-ink-6"
      aria-label="Local SEO sub-navigation"
    >
      <div className="max-w-5xl mx-auto px-4 lg:px-6">
        <div className="flex items-center gap-1 overflow-x-auto -mb-px">
          {visible.map(t => {
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
