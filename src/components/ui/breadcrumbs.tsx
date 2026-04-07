'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRight, Home } from 'lucide-react'

const LABEL_MAP: Record<string, string> = {
  admin: 'Admin',
  dashboard: 'Dashboard',
  clients: 'Clients',
  agreements: 'Agreements',
  orders: 'Orders',
  pipeline: 'Pipeline',
  billing: 'Billing',
  messages: 'Messages',
  reports: 'Reports',
  team: 'Team',
  settings: 'Settings',
  templates: 'Templates',
  send: 'Send',
  profile: 'Business Profile',
  approvals: 'Approvals',
  analytics: 'Analytics',
  calendar: 'Calendar',
  tools: 'Tools',
  help: 'Help',
  checkout: 'Checkout',
  success: 'Success',
}

export default function Breadcrumbs() {
  const pathname = usePathname()
  const segments = pathname.split('/').filter(Boolean)

  // Don't show breadcrumbs on top-level pages
  if (segments.length <= 1) return null

  const crumbs = segments.map((seg, i) => {
    const href = '/' + segments.slice(0, i + 1).join('/')
    const isLast = i === segments.length - 1
    // UUID segments get a generic label
    const isUuid = /^[0-9a-f]{8}-/.test(seg)
    const label = isUuid ? 'Details' : LABEL_MAP[seg] || seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, ' ')

    return { href, label, isLast }
  })

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm mb-4">
      <Link href={segments[0] === 'admin' ? '/admin' : '/dashboard'} className="text-ink-4 hover:text-ink transition-colors">
        <Home className="w-3.5 h-3.5" />
      </Link>
      {crumbs.map((crumb) => (
        <span key={crumb.href} className="flex items-center gap-1.5">
          <ChevronRight className="w-3 h-3 text-ink-5" />
          {crumb.isLast ? (
            <span className="text-ink font-medium">{crumb.label}</span>
          ) : (
            <Link href={crumb.href} className="text-ink-4 hover:text-ink transition-colors">
              {crumb.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  )
}
