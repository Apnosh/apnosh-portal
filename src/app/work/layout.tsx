/**
 * /work/* layout — operator surface (strategist today, more roles to come).
 *
 * Strategist gets a real sidebar nav so they can move between Today,
 * Clients, and Calendar. Field roles (videographer, photographer,
 * influencer) get a similar shell with a different nav profile —
 * but they're rare enough that we currently only render the strategist
 * nav. We'll branch on active capability in a later pass.
 */

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  CheckSquare, Users, Calendar, Menu, X, LogOut,
  Inbox, ListChecks, FileText, BarChart3,
} from 'lucide-react'
import { signOut, useUser } from '@/lib/supabase/hooks'
import WorkspaceSwitcher from '@/components/dashboard/workspace-switcher'
import { ToastProvider } from '@/components/ui/toast'

// Real-workspace nav for the strategist. Three groups so a daily user
// can find every surface within reach without scrolling.
const NAV_SECTIONS = [
  {
    label: 'Daily',
    items: [
      { label: 'Today',      href: '/work/today',     icon: CheckSquare },
      { label: 'Inbox',      href: '/work/inbox',     icon: Inbox },
      { label: 'Approvals',  href: '/work/approvals', icon: ListChecks },
      { label: 'Calendar',   href: '/work/calendar',  icon: Calendar },
    ],
  },
  {
    label: 'Book',
    items: [
      { label: 'Clients',  href: '/work/clients',  icon: Users },
      { label: 'Quotes',   href: '/work/quotes',   icon: FileText },
    ],
  },
  {
    label: 'Insights',
    items: [
      { label: 'Performance', href: '/work/performance', icon: BarChart3 },
    ],
  },
]

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
                STRATEGIST
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
            {NAV_SECTIONS.map(section => (
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
