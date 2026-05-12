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
      { label: 'Team', href: '/admin/team', icon: UserCog },
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

  // Sidebar badges. One poll per surface that has work waiting:
  //   Today    -> tasks due today or overdue
  //   Queue    -> deliverables awaiting client approval
  //   Messages -> unread messages
  //   Billing  -> draft or overdue invoices
  // Polled every 60s + on pathname change so completing work clears
  // the count within a click or a minute.
  const [counts, setCounts] = useState<Record<string, number>>({})
  useEffect(() => {
    let cancelled = false
    async function load() {
      const supabase = createClient()
      const endOfToday = new Date()
      endOfToday.setHours(23, 59, 59, 999)

      const [today, queue, messages, billing] = await Promise.all([
        supabase
          .from('client_tasks')
          .select('id', { count: 'exact', head: true })
          .in('status', ['todo', 'doing'])
          .lte('due_at', endOfToday.toISOString()),
        supabase
          .from('deliverables')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'awaiting_approval'),
        supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .is('read_at', null)
          .neq('sender_role', 'admin'),
        supabase
          .from('invoices')
          .select('id', { count: 'exact', head: true })
          .in('status', ['draft', 'overdue']),
      ])

      if (cancelled) return
      setCounts({
        '/admin/today': today.count ?? 0,
        '/admin/queue': queue.count ?? 0,
        '/admin/messages': messages.count ?? 0,
        '/admin/billing': billing.count ?? 0,
      })
    }
    void load()
    const t = setInterval(() => void load(), 60_000)
    return () => { cancelled = true; clearInterval(t) }
  }, [pathname])

  // Color per badge — red for time-sensitive, amber for things that
  // need attention but aren't blocking, ink (dark) for everything else.
  const badgeTone: Record<string, string> = {
    '/admin/today':    'bg-red-500',
    '/admin/queue':    'bg-amber-500',
    '/admin/messages': 'bg-emerald-500',
    '/admin/billing':  'bg-amber-500',
  }

  // Is the signed-in user an actual admin? Non-admin strategists hit
  // /admin/clients/[slug] for client drill-in, and we render a slim
  // strategist-only nav for them so they don't see admin-only items
  // (Strategists, Settings, Billing, etc.) they can't access anyway.
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    void createClient()
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setIsAdmin((data?.role as string | null) === 'admin')
      })
    return () => { cancelled = true }
  }, [user?.id])

  // Strategist nav: the same shape they see in /work/* so the drill-in
  // experience feels like a continuation, not a context-switch.
  const strategistNav = [
    {
      label: 'Daily',
      items: [
        { label: 'Today',     href: '/work/today',     icon: CheckSquare },
        { label: 'Inbox',     href: '/work/inbox',     icon: MessageSquare },
        { label: 'Approvals', href: '/work/approvals', icon: ListTodo },
        { label: 'Calendar',  href: '/work/calendar',  icon: Calendar },
      ],
    },
    {
      label: 'Editorial',
      items: [
        { label: 'Drafts', href: '/work/drafts', icon: Sparkles },
      ],
    },
    {
      label: 'Book',
      items: [
        { label: 'Clients', href: '/work/clients', icon: Users },
        { label: 'Quotes',  href: '/work/quotes',  icon: FileText },
      ],
    },
    {
      label: 'Insights',
      items: [
        { label: 'Performance', href: '/work/performance', icon: FileBarChart },
      ],
    },
  ]
  // Default to the strategist nav until we explicitly confirm admin.
  // Showing admin nav to a non-admin (even briefly) leaks options they
  // can't use; the reverse just delays a beat of UI for real admins.
  const renderedNav = isAdmin === true ? navSections : strategistNav

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
            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
              isAdmin === true ? 'bg-brand/20 text-brand' : 'bg-emerald-500/20 text-emerald-300'
            }`}>
              <Shield className="w-2.5 h-2.5" /> {isAdmin === true ? 'ADMIN' : 'STRATEGIST'}
            </span>
            <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-white/40 hover:text-white min-h-[44px] min-w-[44px] flex items-center justify-center">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <nav className="flex-1 px-3 py-3 overflow-y-auto">
          {renderedNav.map((section) => (
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
                    {counts[item.href] > 0 && (
                      <span
                        className={`min-w-[18px] h-[18px] px-1 rounded-full text-white text-[10px] font-semibold flex items-center justify-center ${badgeTone[item.href] ?? 'bg-ink-4'}`}
                        title={`${counts[item.href]} item${counts[item.href] === 1 ? '' : 's'} need${counts[item.href] === 1 ? 's' : ''} attention`}
                      >
                        {counts[item.href] > 99 ? '99+' : counts[item.href]}
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
                  <div className="text-[10px] text-white/30">{isAdmin === true ? 'Admin' : 'Strategist'}</div>
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
              {/* Quick Add is admin-only. Non-admin strategists shouldn't see
                  "New Client" / "New Invoice" — those are agency-wide.
                  Default-hide until we confirm admin. */}
              {isAdmin === true && <button
                onClick={() => setQuickAddOpen(!quickAddOpen)}
                className="w-8 h-8 rounded-lg bg-brand hover:bg-brand-dark text-white flex items-center justify-center transition-colors"
                title="Quick add"
              >
                <Plus className="w-4 h-4" />
              </button>}
              {isAdmin === true && quickAddOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setQuickAddOpen(false)} />
                  <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl border border-ink-6 shadow-lg shadow-black/8 z-50 py-1.5">
                    {/* Each link includes ?new=1 so the destination page opens
                        its creation modal automatically instead of landing on
                        the list view. Pages read this via useSearchParams. */}
                    <Link href="/admin/clients?new=1" onClick={() => setQuickAddOpen(false)} className="flex items-center gap-2.5 px-4 py-2 text-sm text-ink hover:bg-bg-2 transition-colors">
                      <Users className="w-4 h-4 text-ink-4" /> New Client
                    </Link>
                    <Link href="/admin/billing?new=1" onClick={() => setQuickAddOpen(false)} className="flex items-center gap-2.5 px-4 py-2 text-sm text-ink hover:bg-bg-2 transition-colors">
                      <CreditCard className="w-4 h-4 text-ink-4" /> New Invoice
                    </Link>
                    <Link href="/admin/agreements/send" onClick={() => setQuickAddOpen(false)} className="flex items-center gap-2.5 px-4 py-2 text-sm text-ink hover:bg-bg-2 transition-colors">
                      <FileText className="w-4 h-4 text-ink-4" /> New Agreement
                    </Link>
                    <Link href="/admin/messages?new=1" onClick={() => setQuickAddOpen(false)} className="flex items-center gap-2.5 px-4 py-2 text-sm text-ink hover:bg-bg-2 transition-colors">
                      <MessageSquare className="w-4 h-4 text-ink-4" /> New Message
                    </Link>
                    <Link href="/admin/team" onClick={() => setQuickAddOpen(false)} className="flex items-center gap-2.5 px-4 py-2 text-sm text-ink hover:bg-bg-2 transition-colors border-t border-ink-7 mt-1 pt-2">
                      <UserCog className="w-4 h-4 text-ink-4" /> Invite team member
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
