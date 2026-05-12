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
  PenLine, Megaphone, MessagesSquare, Film, Camera,
} from 'lucide-react'
import { signOut, useUser } from '@/lib/supabase/hooks'
import WorkspaceSwitcher from '@/components/dashboard/workspace-switcher'
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
  // Production
  { label: 'Shoots',     href: '/work/shoots',    icon: Camera,         section: 'Production' },
  { label: 'Edits',      href: '/work/edits',     icon: Film,           section: 'Production' },
  { label: 'Boosts',     href: '/work/boosts',    icon: Megaphone,      section: 'Production' },
  { label: 'Engage',     href: '/work/engage',    icon: MessagesSquare, section: 'Production' },
  // Book
  { label: 'Clients',    href: '/work/clients',   icon: Users,          section: 'Book' },
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
    if (heldCaps.size > 2) return 'MULTI'
    if (heldCaps.size === 1) {
      const cap = Array.from(heldCaps)[0]
      return cap.toUpperCase().replace('_', ' ')
    }
    // 2 caps → first one's label compact
    return 'MULTI'
  }, [heldCaps])

  return (
    <ToastProvider>
      <div className="min-h-screen bg-bg-2 flex">
        {/* Mobile scrim */}
        {sidebarOpen && (
          <div className="fixed inset-0 bg-black/30 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
        )}

        {/* Sidebar */}
        <aside className={`fixed top-0 left-0 h-full w-[240px] bg-ink z-50 flex flex-col transition-transform duration-200 lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="h-14 flex items-center justify-between px-5 border-b border-white/8">
            <Link href="/work" className="font-[family-name:var(--font-display)] text-lg text-white/80">
              Apn<em className="text-brand italic">osh</em>
            </Link>
            <div className="flex items-center gap-2">
              <span className="bg-emerald-500/20 text-emerald-300 text-[9px] font-bold px-2 py-0.5 rounded-full">
                {roleBadge}
              </span>
              <button
                onClick={() => setSidebarOpen(false)}
                className="lg:hidden text-white/40 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <nav className="flex-1 px-3 py-3 overflow-y-auto">
            {sections.map(section => (
              <div key={section.label} className="mb-3">
                <div className="px-3 mb-1 text-[10px] font-semibold text-white/25 uppercase tracking-wider">
                  {section.label}
                </div>
                <div className="space-y-0.5">
                  {section.items.map(item => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setSidebarOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors min-h-[36px] ${
                        isActive(item.href)
                          ? 'bg-white/10 text-white'
                          : 'text-white/40 hover:bg-white/5 hover:text-white/70'
                      }`}
                    >
                      <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
                      <span>{item.label}</span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </nav>

          {/* User chip */}
          <div className="p-3 border-t border-white/8">
            <div className="flex items-center gap-3 px-2 py-1.5">
              <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center text-xs font-bold">
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-medium text-white/80 truncate">{displayName}</p>
              </div>
              <button
                onClick={signOut}
                className="text-white/40 hover:text-red-400"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </aside>

        {/* Main */}
        <div className="flex-1 lg:ml-[240px] flex flex-col">
          <header className="h-14 bg-white border-b border-ink-6 flex items-center justify-between px-4 lg:px-6 sticky top-0 z-30">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-ink-3 hover:text-ink min-h-[44px] min-w-[44px] flex items-center justify-center">
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <WorkspaceSwitcher />
            </div>
            <div className="flex-1" />
          </header>
          <main className="flex-1">{children}</main>
        </div>
      </div>
    </ToastProvider>
  )
}
