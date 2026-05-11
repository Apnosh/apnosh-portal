'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Users, ShoppingBag, Kanban, UserCog, FileBarChart,
  FileText, CreditCard, MessageSquare, Settings, Menu, X, ChevronDown, Shield, Plus,
  BarChart3, Calendar, ListTodo, Send, MessageCircle, Sparkles, CheckSquare,
  Plug, Gauge,
} from 'lucide-react'
import { useUser, signOut } from '@/lib/supabase/hooks'
import { ToastProvider } from '@/components/ui/toast'
import { RealtimeProvider } from '@/lib/realtime'
import GlobalSearch from '@/components/ui/global-search'
import Breadcrumbs from '@/components/ui/breadcrumbs'
import Notifications from '@/components/ui/notifications'
import { AdminTabBar } from '@/components/ui/mobile-tab-bar'

// Sidebar trimmed to the 10 daily essentials for a strategist.
// Hidden but still reachable via deep links / breadcrumbs:
//   /admin (the Overview front door) — accessible from the Apnosh logo
//   /admin/orders         — reach via client detail tabs
//   /admin/pipeline + subroutes — folded into Content Engine
//   /admin/publish        — sub-action of Calendar
//   /admin/analytics      — weekly task, reach via Reports
//   /admin/inbox          — only valuable when Meta webhook is live
//   /admin/agreements     — reach via client detail or Settings
//   /admin/integrations   — agency-wide config, reach via Settings
//   /admin/team           — owner-of-agency action, reach via Settings
const navSections = [
  {
    label: 'Work',
    items: [
      { label: 'Today', href: '/admin/today', icon: CheckSquare },
      { label: 'Console', href: '/admin/console', icon: Gauge },
      { label: 'Clients', href: '/admin/clients', icon: Users },
    ],
  },
  {
    label: 'Production',
    items: [
      { label: 'Content Engine', href: '/admin/content-engine', icon: Sparkles },
      { label: 'Queue', href: '/admin/queue', icon: ListTodo },
      { label: 'Calendar', href: '/admin/calendar', icon: Calendar },
    ],
  },
  {
    label: 'Business',
    items: [
      { label: 'Messages', href: '/admin/messages', icon: MessageSquare },
      { label: 'Billing', href: '/admin/billing', icon: CreditCard },
      { label: 'Reports', href: '/admin/reports', icon: FileBarChart },
    ],
  },
  {
    label: 'Setup',
    items: [
      { label: 'Strategists', href: '/admin/strategists', icon: UserCog },
      { label: 'Settings', href: '/admin/settings', icon: Settings },
    ],
  },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const { data: user, loading: userLoading } = useUser()
  const displayName = user?.full_name || 'Admin'
  const initials = displayName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)

  const isActive = (href: string) => {
    if (href === '/admin') return pathname === '/admin'
    return pathname.startsWith(href)
  }

  // Overdue / due-today task counts for the sidebar badge on "Today".
  // Polled every 60s + re-fetched on pathname change so completing a
  // task updates the count within a click or a minute.
  const [overdueCount, setOverdueCount] = useState(0)
  useEffect(() => {
    let cancelled = false
    async function load() {
      const supabase = createClient()
      const endOfToday = new Date()
      endOfToday.setHours(23, 59, 59, 999)
      const { count } = await supabase
        .from('client_tasks')
        .select('id', { count: 'exact', head: true })
        .in('status', ['todo', 'doing'])
        .lte('due_at', endOfToday.toISOString())
      if (!cancelled) setOverdueCount(count ?? 0)
    }
    void load()
    const t = setInterval(() => void load(), 60_000)
    return () => { cancelled = true; clearInterval(t) }
  }, [pathname])

  return (
    <ToastProvider>
    <RealtimeProvider>
    <div className="min-h-screen bg-bg-2 flex pb-14 lg:pb-0">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/30 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`fixed top-0 left-0 h-full w-[260px] bg-ink z-50 flex flex-col transition-transform duration-200 lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-14 flex items-center justify-between px-5 border-b border-white/8">
          <Link href="/admin" className="font-[family-name:var(--font-display)] text-lg text-white/80">
            Apn<em className="text-brand italic">osh</em>
          </Link>
          <div className="flex items-center gap-2">
            <span className="bg-brand/20 text-brand text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
              <Shield className="w-2.5 h-2.5" /> ADMIN
            </span>
            <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-white/40 hover:text-white min-h-[44px] min-w-[44px] flex items-center justify-center">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <nav className="flex-1 px-3 py-3 overflow-y-auto">
          {navSections.map((section) => (
            <div key={section.label} className="mb-3">
              <div className="px-3 mb-1 text-[10px] font-semibold text-white/25 uppercase tracking-wider">
                {section.label}
              </div>
              <div className="space-y-0.5">
                {section.items.map((item) => (
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
                    <span className="flex-1">{item.label}</span>
                    {item.href === '/admin/today' && overdueCount > 0 && (
                      <span
                        className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center"
                        title={`${overdueCount} task${overdueCount === 1 ? '' : 's'} due today or overdue`}
                      >
                        {overdueCount > 99 ? '99+' : overdueCount}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-3 border-t border-white/8 relative">
          <button onClick={() => setUserMenuOpen(!userMenuOpen)} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors min-h-[44px]">
            {userLoading ? (
              <div className="w-8 h-8 rounded-full bg-white/10 animate-pulse" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-brand/20 flex items-center justify-center text-brand text-xs font-bold">
                {initials}
              </div>
            )}
            <div className="flex-1 text-left">
              {userLoading ? (
                <div className="h-4 w-20 bg-white/10 rounded animate-pulse" />
              ) : (
                <>
                  <div className="text-sm font-medium text-white/80 truncate">{displayName}</div>
                  <div className="text-[10px] text-white/30">Admin</div>
                </>
              )}
            </div>
            <ChevronDown className={`w-4 h-4 text-white/30 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
          </button>
          {userMenuOpen && (
            <div className="absolute bottom-full left-3 right-3 mb-1 bg-ink rounded-xl border border-white/10 shadow-lg overflow-hidden z-50">
              <a href="/admin/settings" className="block px-4 py-2.5 text-sm text-white/60 hover:bg-white/5 transition-colors">Settings</a>
              <a href="/dashboard" className="block px-4 py-2.5 text-sm text-white/60 hover:bg-white/5 transition-colors">Client View</a>
              <div className="border-t border-white/8" />
              <button onClick={signOut} className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors">
                Sign out
              </button>
            </div>
          )}
        </div>
      </aside>

      <div className="flex-1 lg:ml-[260px]">
        {/* Top bar with global search, quick add, notifications */}
        <header className="h-14 bg-white border-b border-ink-6 flex items-center gap-3 px-4 lg:px-6 sticky top-0 z-30">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-ink-3 hover:text-ink min-h-[44px] min-w-[44px] flex items-center justify-center">
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <GlobalSearch />
          </div>
          <div className="flex items-center gap-2">
            {/* Quick Add */}
            <div className="relative">
              <button
                onClick={() => setQuickAddOpen(!quickAddOpen)}
                className="w-8 h-8 rounded-lg bg-brand hover:bg-brand-dark text-white flex items-center justify-center transition-colors"
                title="Quick add"
              >
                <Plus className="w-4 h-4" />
              </button>
              {quickAddOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setQuickAddOpen(false)} />
                  <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl border border-ink-6 shadow-lg shadow-black/8 z-50 py-1.5">
                    <Link href="/admin/clients" onClick={() => setQuickAddOpen(false)} className="flex items-center gap-2.5 px-4 py-2 text-sm text-ink hover:bg-bg-2 transition-colors">
                      <Users className="w-4 h-4 text-ink-4" /> New Client
                    </Link>
                    <Link href="/admin/billing" onClick={() => setQuickAddOpen(false)} className="flex items-center gap-2.5 px-4 py-2 text-sm text-ink hover:bg-bg-2 transition-colors">
                      <CreditCard className="w-4 h-4 text-ink-4" /> New Invoice
                    </Link>
                    <Link href="/admin/agreements/send" onClick={() => setQuickAddOpen(false)} className="flex items-center gap-2.5 px-4 py-2 text-sm text-ink hover:bg-bg-2 transition-colors">
                      <FileText className="w-4 h-4 text-ink-4" /> New Agreement
                    </Link>
                    <Link href="/admin/messages" onClick={() => setQuickAddOpen(false)} className="flex items-center gap-2.5 px-4 py-2 text-sm text-ink hover:bg-bg-2 transition-colors">
                      <MessageSquare className="w-4 h-4 text-ink-4" /> New Message
                    </Link>
                  </div>
                </>
              )}
            </div>
            <Notifications />
            <Link href="/dashboard" className="text-xs text-ink-4 hover:text-brand-dark transition-colors hidden sm:block">
              Client View &rarr;
            </Link>
          </div>
        </header>

        <main className="p-4 lg:p-6">
          <Breadcrumbs />
          {children}
        </main>
      </div>
      <AdminTabBar />
    </div>
    </RealtimeProvider>
    </ToastProvider>
  )
}
