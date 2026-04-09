'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, CheckCircle, Calendar, ShoppingBag, BarChart3,
  MessageSquare, Wrench, Building2, CreditCard, FileText, HelpCircle, Settings,
  Menu, X, ChevronDown, BookOpen, FileBarChart, ListTodo,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { CartProvider } from '@/lib/cart-context'
import { ToastProvider } from '@/components/ui/toast'
import { RealtimeProvider } from '@/lib/realtime'
import Notifications from '@/components/ui/notifications'
import Breadcrumbs from '@/components/ui/breadcrumbs'
import { ClientTabBar } from '@/components/ui/mobile-tab-bar'
import QuickRequest from '@/components/ui/quick-request'
import { useUser, signOut } from '@/lib/supabase/hooks'

const navItems = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Requests', href: '/dashboard/requests', icon: ListTodo },
  { label: 'Approvals', href: '/dashboard/approvals', icon: CheckCircle },
  { label: 'Calendar', href: '/dashboard/calendar', icon: Calendar },
  { label: 'Orders', href: '/dashboard/orders', icon: ShoppingBag },
  { label: 'Analytics', href: '/dashboard/analytics', icon: BarChart3 },
  { label: 'Reports', href: '/dashboard/reports', icon: FileBarChart },
  { label: 'Messages', href: '/dashboard/messages', icon: MessageSquare },
  { label: 'Tools', href: '/dashboard/tools', icon: Wrench },
]

const bottomItems = [
  { label: 'Agreements', href: '/dashboard/agreements', icon: FileText },
  { label: 'Business Profile', href: '/dashboard/profile', icon: Building2 },
  { label: 'Brand Guidelines', href: '/dashboard/profile/brand-guidelines', icon: BookOpen },
  { label: 'Billing', href: '/dashboard/billing', icon: CreditCard },
  { label: 'Settings', href: '/dashboard/settings', icon: Settings },
  { label: 'Help', href: '/dashboard/help', icon: HelpCircle },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const { data: user, loading: userLoading } = useUser()
  const [approvalCount, setApprovalCount] = useState(0)

  // Fetch pending approval count
  useEffect(() => {
    async function fetchApprovalCount() {
      const supabase = createClient()
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) return

      const { data: biz } = await supabase
        .from('businesses')
        .select('id')
        .eq('owner_id', authUser.id)
        .single()

      if (!biz) return

      const { count } = await supabase
        .from('deliverables')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', biz.id)
        .eq('status', 'client_review')

      setApprovalCount(count || 0)
    }
    fetchApprovalCount()

    // Refresh every 30 seconds
    const interval = setInterval(fetchApprovalCount, 30_000)
    return () => clearInterval(interval)
  }, [])

  const displayName = user?.full_name || 'User'
  const initials = displayName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
  const roleLabel = user?.role === 'admin' ? 'Admin' : 'Client'

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname.startsWith(href)
  }

  const NavLink = ({ item }: { item: { label: string; href: string; icon: typeof LayoutDashboard } }) => {
    const showBadge = item.label === 'Approvals' && approvalCount > 0
    return (
      <Link
        href={item.href}
        onClick={() => setSidebarOpen(false)}
        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${
          isActive(item.href)
            ? 'bg-brand-tint text-brand-dark'
            : 'text-ink-3 hover:bg-bg-2 hover:text-ink'
        }`}
      >
        <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
        <span className="flex-1">{item.label}</span>
        {showBadge && (
          <span className="min-w-[20px] h-5 flex items-center justify-center rounded-full bg-brand text-white text-[11px] font-bold px-1.5">
            {approvalCount}
          </span>
        )}
      </Link>
    )
  }

  return (
    <CartProvider>
    <ToastProvider>
    <RealtimeProvider>
    <div className="min-h-screen bg-bg-2 flex pb-14 lg:pb-0">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/30 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed top-0 left-0 h-full w-[260px] bg-white border-r border-ink-6 z-50 flex flex-col transition-transform duration-200 lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        {/* Logo */}
        <div className="h-14 flex items-center justify-between px-5 border-b border-ink-6">
          <Link href="/dashboard" className="font-[family-name:var(--font-display)] text-lg text-ink">
            Apn<em className="text-brand-dark italic">osh</em>
          </Link>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-ink-4 hover:text-ink min-h-[44px] min-w-[44px] flex items-center justify-center">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => <NavLink key={item.href} item={item} />)}
          <div className="h-px bg-ink-6 my-3" />
          {bottomItems.map((item) => <NavLink key={item.href} item={item} />)}
        </nav>

        {/* User */}
        <div className="p-3 border-t border-ink-6 relative">
          <button onClick={() => setUserMenuOpen(!userMenuOpen)} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-bg-2 transition-colors min-h-[44px]">
            {userLoading ? (
              <div className="w-8 h-8 rounded-full bg-ink-6 animate-pulse" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-brand-tint border border-brand/20 flex items-center justify-center text-brand-dark text-xs font-bold">
                {initials}
              </div>
            )}
            <div className="flex-1 text-left">
              {userLoading ? (
                <div className="h-4 w-24 bg-ink-6 rounded animate-pulse" />
              ) : (
                <>
                  <div className="text-sm font-medium text-ink truncate">{displayName}</div>
                  <div className="text-[10px] text-ink-4">{roleLabel}</div>
                </>
              )}
            </div>
            <ChevronDown className={`w-4 h-4 text-ink-4 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
          </button>
          {userMenuOpen && (
            <div className="absolute bottom-full left-3 right-3 mb-1 bg-white rounded-xl border border-ink-6 shadow-lg overflow-hidden z-50">
              <a href="/dashboard/profile" className="block px-4 py-2.5 text-sm text-ink-2 hover:bg-bg-2 transition-colors">Profile</a>
              <a href="/dashboard/settings" className="block px-4 py-2.5 text-sm text-ink-2 hover:bg-bg-2 transition-colors">Settings</a>
              <div className="border-t border-ink-6" />
              <button onClick={signOut} className="w-full text-left px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors">
                Sign out
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 lg:ml-[260px]">
        {/* Top bar */}
        <header className="h-14 bg-white border-b border-ink-6 flex items-center justify-between px-4 lg:px-6 sticky top-0 z-30">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-ink-3 hover:text-ink min-h-[44px] min-w-[44px] flex items-center justify-center">
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-3">
            <Link href="/dashboard/messages" className="text-ink-4 hover:text-ink transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center">
              <MessageSquare className="w-5 h-5" />
            </Link>
            <Notifications />
          </div>
        </header>

        {/* Content */}
        <main className="p-4 lg:p-6">
          <Breadcrumbs />
          {children}
        </main>
      </div>
      <QuickRequest />
      <ClientTabBar />
    </div>
    </RealtimeProvider>
    </ToastProvider>
    </CartProvider>
  )
}
