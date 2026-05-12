/**
 * /work/* layout — additive operator surface.
 *
 * Nav is computed as the UNION of items relevant to whatever
 * capabilities the user holds. Strategist + Copywriter sees both
 * sets in one sidebar — they don't switch lenses. A user with no
 * /work capabilities just sees an empty shell (middleware likely
 * already redirected them, but the layout degrades gracefully).
 */

'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  CheckSquare, Users, Calendar, Menu, X, LogOut,
  Inbox, ListChecks, FileText, BarChart3, Sparkles, BookOpen,
  PenLine, Megaphone, MessagesSquare, Film, Camera, Image as ImageIcon, Star, Mail, UserPlus, Receipt, Globe,
} from 'lucide-react'
import { signOut, useUser } from '@/lib/supabase/hooks'
import { ToastProvider } from '@/components/ui/toast'
import { WORK_SURFACES_BY_CAPABILITY } from '@/lib/roles/catalog'
import type { RoleCapability } from '@/lib/auth/capabilities'

interface NavItem {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  section: string
}

// Master list of every /work nav item, with its section label and
// the icon to render. The layout filters this list down to entries
// whose href is reachable by at least one capability the user holds.
const ALL_NAV_ITEMS: NavItem[] = [
  // Daily
  { label: 'Today',      href: '/work/today',     icon: CheckSquare,    section: 'Daily' },
  { label: 'Inbox',      href: '/work/inbox',     icon: Inbox,          section: 'Daily' },
  { label: 'Approvals',  href: '/work/approvals', icon: ListChecks,     section: 'Daily' },
  { label: 'Calendar',   href: '/work/calendar',  icon: Calendar,       section: 'Daily' },
  // Editorial
  { label: 'Themes',     href: '/work/themes',    icon: BookOpen,       section: 'Editorial' },
  { label: 'Drafts',     href: '/work/drafts',    icon: Sparkles,       section: 'Editorial' },
  { label: 'Briefs',     href: '/work/briefs',    icon: PenLine,        section: 'Editorial' },
  { label: 'Visuals',    href: '/work/queue',     icon: ImageIcon,      section: 'Editorial' },
  // Production
  { label: 'Shoots',     href: '/work/shoots',    icon: Camera,         section: 'Production' },
  { label: 'Edits',      href: '/work/edits',     icon: Film,           section: 'Production' },
  { label: 'Boosts',     href: '/work/boosts',    icon: Megaphone,      section: 'Production' },
  { label: 'Engage',     href: '/work/engage',    icon: MessagesSquare, section: 'Production' },
  { label: 'Reviews',    href: '/work/reviews',   icon: Star,           section: 'Production' },
  { label: 'Campaigns',  href: '/work/campaigns', icon: Mail,           section: 'Production' },
  // Book
  { label: 'Onboarding', href: '/work/onboarding', icon: UserPlus,      section: 'Book' },
  { label: 'Clients',    href: '/work/clients',   icon: Users,          section: 'Book' },
  { label: 'Billing',    href: '/work/billing',   icon: Receipt,        section: 'Book' },
  { label: 'Web',        href: '/work/web',       icon: Globe,          section: 'Production' },
  { label: 'Quotes',     href: '/work/quotes',    icon: FileText,       section: 'Book' },
  // Insights
  { label: 'Performance', href: '/work/performance', icon: BarChart3,   section: 'Insights' },
]

const SECTION_ORDER = ['Daily', 'Editorial', 'Production', 'Book', 'Insights']

export default function WorkLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { data: user } = useUser()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Initials for the user chip in the bottom-left.
  const displayName = (user as { user_metadata?: { full_name?: string }; email?: string } | null)?.user_metadata?.full_name
    ?? (user as { email?: string } | null)?.email
    ?? 'Strategist'
  const initials = displayName.split(/[\s@]+/).slice(0, 2).map((s: string) => s[0]?.toUpperCase() ?? '').join('') || '?'

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  // Fetch the capabilities the user holds, then compute the union of
  // /work surfaces they should see. The nav adapts as we add/remove
  // capabilities to their account — no separate strategist/copywriter
  // workspaces, just one /work that includes everything they touch.
  const [heldCaps, setHeldCaps] = useState<Set<RoleCapability> | null>(null)
  useEffect(() => {
    let alive = true
    fetch('/api/me/capabilities', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : { all: [] })
      .then((j: { all?: Array<{ role: RoleCapability }> }) => {
        if (!alive) return
        setHeldCaps(new Set((j.all ?? []).map(c => c.role)))
      })
      .catch(() => { if (alive) setHeldCaps(new Set()) })
    return () => { alive = false }
  }, [])

  // Union of /work surfaces this user should see. Admin sees everything.
  const visibleHrefs = useMemo(() => {
    if (!heldCaps) return null
    if (heldCaps.has('admin')) {
      // Admin sees the whole catalog
      return new Set(ALL_NAV_ITEMS.map(i => i.href))
    }
    const set = new Set<string>()
    for (const cap of heldCaps) {
      for (const href of WORK_SURFACES_BY_CAPABILITY[cap] ?? []) {
        set.add(href)
      }
    }
    return set
  }, [heldCaps])

  // Group filtered items by section, preserving section order.
  const sections = useMemo(() => {
    if (!visibleHrefs) return [] as Array<{ label: string; items: NavItem[] }>
    const bySection = new Map<string, NavItem[]>()
    for (const item of ALL_NAV_ITEMS) {
      if (!visibleHrefs.has(item.href)) continue
      if (!bySection.has(item.section)) bySection.set(item.section, [])
      bySection.get(item.section)!.push(item)
    }
    return SECTION_ORDER
      .filter(s => bySection.has(s))
      .map(s => ({ label: s, items: bySection.get(s)! }))
  }, [visibleHrefs])

  const roleBadge = useMemo(() => {
    if (!heldCaps || heldCaps.size === 0) return 'WORK'
    if (heldCaps.has('admin')) return 'ADMIN'
    if (heldCaps.size === 1) {
      const cap = Array.from(heldCaps)[0]
      return cap.toUpperCase().replace(/_/g, ' ')
    }
    return `${heldCaps.size} ROLES`
  }, [heldCaps])

  // Resolve current page label + its section for the header breadcrumb.
  const currentCrumb = useMemo(() => {
    const item = ALL_NAV_ITEMS.find(i => pathname === i.href || pathname.startsWith(i.href + '/'))
    return item ? { section: item.section, label: item.label } : null
  }, [pathname])

  return (
    <ToastProvider>
      <div className="min-h-screen flex" style={{ background: 'radial-gradient(1200px 600px at 80% -10%, rgba(74,189,152,0.06), transparent 50%), linear-gradient(180deg, #fafafb 0%, #f4f5f7 100%)' }}>
        {/* Mobile scrim */}
        {sidebarOpen && (
          <div className="fixed inset-0 bg-black/30 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
        )}

        {/* Sidebar */}
        <aside
          className={`fixed top-0 left-0 h-full w-[240px] z-50 flex flex-col transition-transform duration-200 lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
          style={{ background: 'linear-gradient(180deg, #1d1d1f 0%, #141416 100%)', boxShadow: '1px 0 0 rgba(255,255,255,0.04) inset, 0 0 40px rgba(0,0,0,0.15)' }}
        >
          <div className="h-12 flex items-center justify-between px-4 border-b border-white/[0.06]">
            <Link href="/work" className="inline-flex items-center gap-2 group">
              <span className="font-[family-name:var(--font-display)] text-[18px] text-white tracking-tight">
                Apn<em className="text-brand italic">osh</em>
              </span>
            </Link>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden text-white/40 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <nav className="flex-1 px-3 py-3 overflow-y-auto">
            {sections.map(section => (
              <div key={section.label} className="mb-3">
                <div className="px-3 mb-1.5 text-[9px] font-semibold text-white/30 uppercase tracking-[0.18em]">
                  {section.label}
                </div>
                <div className="space-y-0.5">
                  {section.items.map(item => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setSidebarOpen(false)}
                      className={`relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all min-h-[36px] ${
                        isActive(item.href)
                          ? 'text-white'
                          : 'text-white/40 hover:bg-white/5 hover:text-white/70'
                      }`}
                      style={isActive(item.href)
                        ? { background: 'linear-gradient(90deg, rgba(74,189,152,0.16), rgba(255,255,255,0.04))', boxShadow: 'inset 0 0 0 1px rgba(74,189,152,0.18)' }
                        : undefined}
                    >
                      {isActive(item.href) && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-brand" />
                      )}
                      <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
                      <span>{item.label}</span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </nav>

          {/* User chip */}
          <div className="p-3 border-t border-white/[0.06]">
            <div className="flex items-center gap-3 px-1.5 py-1">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-emerald-200 flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, rgba(74,189,152,0.28), rgba(74,189,152,0.10))', boxShadow: 'inset 0 0 0 1px rgba(74,189,152,0.22)' }}
              >
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-medium text-white/85 truncate leading-tight">{displayName}</p>
                <p className="text-[10px] text-white/40 truncate leading-tight">{roleBadge}</p>
              </div>
              <button
                onClick={signOut}
                className="text-white/30 hover:text-red-400 transition-colors"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </aside>

        {/* Main */}
        <div className="flex-1 lg:ml-[240px] flex flex-col">
          <header className="h-12 flex items-center gap-3 px-4 lg:px-6 sticky top-0 z-30 backdrop-blur-md bg-white/80 border-b border-ink-6/60">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-ink-3 hover:text-ink min-h-[40px] min-w-[40px] flex items-center justify-center flex-shrink-0 -ml-2">
              <Menu className="w-5 h-5" />
            </button>
            <nav className="flex items-center gap-2 text-[12px] min-w-0">
              {currentCrumb ? (
                <>
                  <span className="text-ink-3 font-medium uppercase tracking-[0.12em] text-[10px] truncate">{currentCrumb.section}</span>
                  <span className="text-ink-5">/</span>
                  <span className="text-ink font-semibold truncate">{currentCrumb.label}</span>
                </>
              ) : (
                <span className="text-ink-3">Work</span>
              )}
            </nav>
            <div className="flex-1" />
          </header>
          <main className="flex-1">{children}</main>
        </div>
      </div>
    </ToastProvider>
  )
}
