'use client'

/**
 * Menu view — the navigation hub, designed iOS-Settings-grade.
 *
 * Design choices for a restaurant owner browsing on a phone:
 *   - Account card up top with plan badge (identity + status at a glance)
 *   - Functional search that filters the whole directory live
 *   - Colored icon squares (iOS pattern) so the eye scans by color +
 *     glyph, not just by reading every label
 *   - Tight grouped rows in rounded containers — dense but breathable
 *   - Sign out isolated at the bottom
 *
 * The colored-square + label + chevron row is the proven pattern for
 * dense menus that non-technical users navigate effortlessly.
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Search, ChevronRight, Settings,
  BarChart3, MessageSquare, Calendar,
  MapPin, Star, Building2, Sparkles, Globe, Mail,
  ShoppingBag, Users, Newspaper, Palette, Link2,
  FileText, CreditCard, HelpCircle, X,
} from 'lucide-react'
import SignOutButton from './sign-out-button'

interface NavItem {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  /* iOS-style solid color for the icon square. */
  color: string
  /* Keywords that help search match even when the label differs. */
  keywords?: string
}

interface NavGroup {
  label: string
  /* 'grid' = visual boxes (marketing channels). 'list' = dense rows
     (everything else). */
  layout: 'grid' | 'list'
  items: NavItem[]
}

/* Note: Today + Inbox are intentionally omitted — they live in the
   bottom tab bar, so repeating them here is redundant. Analytics is
   also a tab; the menu keeps Audit (score + what-to-fix), which is
   the actionable companion to the raw Analytics metrics. */
const SECTIONS: NavGroup[] = [
  {
    label: 'Your marketing',
    layout: 'grid',
    items: [
      { label: 'Google & Maps', href: '/dashboard/insights',  icon: MapPin,   color: 'bg-red-500', keywords: 'local seo search maps gbp google business listing reviews' },
      { label: 'Social media',  href: '/dashboard/insights',     icon: Sparkles, color: 'bg-fuchsia-500', keywords: 'instagram facebook tiktok posts reels' },
      { label: 'Website',       href: '/dashboard/insights',    icon: Globe,    color: 'bg-teal-500', keywords: 'site traffic pages forms' },
      { label: 'Reviews',       href: '/dashboard/insights/reviews', icon: Star, color: 'bg-amber-500', keywords: 'ratings reputation respond' },
      { label: 'Email & SMS',   href: '/dashboard/insights',  icon: Mail,     color: 'bg-indigo-500', keywords: 'campaigns newsletter list texts' },
      { label: 'Calendar',      href: '/dashboard/calendar',   icon: Calendar, color: 'bg-emerald-500', keywords: 'schedule content posts' },
    ],
  },
  {
    label: 'Grow & improve',
    layout: 'list',
    items: [
      { label: 'Audit',        href: '/dashboard/audit',       icon: BarChart3,   color: 'bg-purple-500', keywords: 'score health performance what to fix recommendations' },
      { label: 'Marketplace',  href: '/dashboard/marketplace', icon: ShoppingBag, color: 'bg-green-600', keywords: 'photographers designers agencies vendors freelancers hire' },
      { label: 'Your team',    href: '/dashboard/team',        icon: Users,       color: 'bg-violet-500', keywords: 'strategists assigned' },
      { label: 'Messages',     href: '/dashboard/messages',    icon: MessageSquare, color: 'bg-sky-500', keywords: 'chat strategist talk human' },
      { label: 'Weekly briefs', href: '/dashboard/briefs',     icon: Newspaper,   color: 'bg-slate-500', keywords: 'strategy memo recap report' },
    ],
  },
  {
    label: 'Your business',
    layout: 'list',
    items: [
      { label: 'Restaurant info', href: '/dashboard/restaurant',         icon: Building2, color: 'bg-stone-500', keywords: 'cuisine hours location details name' },
      { label: 'Brand & assets',  href: '/dashboard/assets',             icon: Palette,   color: 'bg-pink-500', keywords: 'logo photos style guide guidelines' },
      { label: 'Connections',     href: '/dashboard/connected-accounts', icon: Link2,     color: 'bg-cyan-500', keywords: 'integrations social google connect accounts' },
    ],
  },
  {
    label: 'Account',
    layout: 'list',
    items: [
      { label: 'Services',   href: '/dashboard/services',   icon: ShoppingBag, color: 'bg-emerald-600', keywords: 'subscriptions plans packages' },
      { label: 'Billing',    href: '/dashboard/billing',    icon: CreditCard,  color: 'bg-green-600', keywords: 'invoices payment card' },
      { label: 'Agreements', href: '/dashboard/agreements', icon: FileText,    color: 'bg-slate-500', keywords: 'contracts msa' },
      { label: 'Settings',   href: '/dashboard/settings',   icon: Settings,    color: 'bg-gray-500', keywords: 'preferences security profile' },
      { label: 'Help',       href: '/dashboard/help',       icon: HelpCircle,  color: 'bg-blue-500', keywords: 'support docs contact' },
    ],
  },
]

interface Props {
  restaurantName: string
  userName: string
  userEmail: string
  userInitials: string
  planLabel: string | null
}

export default function MenuView({ restaurantName, userName, userEmail, userInitials, planLabel }: Props) {
  const [query, setQuery] = useState('')

  /* Live search across all items. When searching we flatten into a
     single result list; otherwise we render the grouped sections. */
  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return null
    const out: NavItem[] = []
    for (const section of SECTIONS) {
      for (const item of section.items) {
        const hay = `${item.label} ${item.keywords ?? ''}`.toLowerCase()
        if (hay.includes(q)) out.push(item)
      }
    }
    return out
  }, [query])

  return (
    <div className="max-w-2xl mx-auto pb-tabbar lg:pb-0 -mx-4 lg:mx-0 -mt-4 lg:mt-0 bg-bg-2 min-h-screen">
      {/* Account card */}
      <div className="px-4 pt-5 pb-4">
        <Link
          href="/dashboard/settings"
          className="block bg-white rounded-2xl border border-ink-6 p-4 active:bg-ink-7 transition-colors"
        >
          <div className="flex items-center gap-3.5">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-brand to-brand-dark text-white text-[18px] font-bold flex items-center justify-center flex-shrink-0">
              {userInitials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-[16px] font-semibold text-ink truncate">{restaurantName}</p>
                {planLabel && (
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-brand-tint text-brand-dark px-1.5 py-0.5 rounded">
                    {planLabel}
                  </span>
                )}
              </div>
              <p className="text-[12.5px] text-ink-3 truncate">{userName}</p>
              {userEmail && userEmail !== userName && (
                <p className="text-[11px] text-ink-4 truncate">{userEmail}</p>
              )}
            </div>
            <ChevronRight className="w-5 h-5 text-ink-4 flex-shrink-0" />
          </div>
        </Link>
      </div>

      {/* Search */}
      <div className="px-4 mb-4">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-4" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search menu..."
            className="w-full bg-white border border-ink-6 rounded-full pl-10 pr-10 h-11 text-[14px] focus:outline-none focus:border-brand touch-input"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-ink-7 text-ink-3 flex items-center justify-center active:bg-ink-6"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Search results OR grouped sections */}
      {searchResults !== null ? (
        <div className="px-4 pb-4">
          {searchResults.length === 0 ? (
            <div className="bg-white rounded-2xl border border-ink-6 p-8 text-center">
              <p className="text-[14px] text-ink-2">No matches for &ldquo;{query}&rdquo;</p>
              <p className="text-[12px] text-ink-3 mt-1">Try a different word.</p>
            </div>
          ) : (
            <Group items={searchResults} />
          )}
        </div>
      ) : (
        <div className="space-y-5">
          {SECTIONS.map(section => (
            <section key={section.label}>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-3 px-5 mb-2">
                {section.label}
              </p>
              <div className="px-4">
                {section.layout === 'grid'
                  ? <BoxGrid items={section.items} />
                  : <Group items={section.items} />}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Sign out */}
      <div className="px-4 mt-6 mb-4">
        <SignOutButton />
      </div>

      <p className="text-center text-[11px] text-ink-4 pb-6">Apnosh · v0.1</p>
    </div>
  )
}

/* A 3-column grid of visual boxes — for the marketing channels owners
   reach for most. Each box: colored icon square + label, tappable. */
function BoxGrid({ items }: { items: NavItem[] }) {
  return (
    <div className="grid grid-cols-3 gap-2.5">
      {items.map(item => {
        const Icon = item.icon
        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch={false}
            className="bg-white rounded-2xl border border-ink-6 p-3 flex flex-col items-center text-center gap-2 min-h-[92px] justify-center active:bg-ink-7 transition-colors"
          >
            <span className={`inline-flex items-center justify-center w-11 h-11 rounded-2xl flex-shrink-0 text-white ${item.color}`}>
              <Icon className="w-[22px] h-[22px]" />
            </span>
            <span className="text-[12px] font-semibold text-ink leading-tight">{item.label}</span>
          </Link>
        )
      })}
    </div>
  )
}

/* A rounded grouped container of nav rows (iOS Settings style). */
function Group({ items }: { items: NavItem[] }) {
  return (
    <ul className="bg-white rounded-2xl border border-ink-6 divide-y divide-ink-7 overflow-hidden">
      {items.map(item => {
        const Icon = item.icon
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              prefetch={false}
              className="flex items-center gap-3 px-3.5 py-2.5 min-h-[52px] active:bg-ink-7 transition-colors"
            >
              <span className={`inline-flex items-center justify-center w-8 h-8 rounded-[9px] flex-shrink-0 text-white ${item.color}`}>
                <Icon className="w-[18px] h-[18px]" />
              </span>
              <span className="flex-1 text-[15px] font-medium text-ink">{item.label}</span>
              <ChevronRight className="w-4 h-4 text-ink-4 flex-shrink-0" />
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
