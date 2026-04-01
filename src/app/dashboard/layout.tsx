'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, CheckCircle, Calendar, ShoppingBag, BarChart3,
  MessageSquare, Wrench, Building2, CreditCard, Menu, X, LogOut, ChevronDown
} from 'lucide-react'
import { CartProvider } from '@/lib/cart-context'
import Notifications from '@/components/ui/notifications'
import QuickRequest from '@/components/ui/quick-request'
import { initialDeliverables } from '@/lib/mock-deliverables'

const navItems = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Approvals', href: '/dashboard/approvals', icon: CheckCircle, badge: initialDeliverables.filter(d => d.status === 'pending' || d.status === 'changes_requested').length },
  { label: 'Calendar', href: '/dashboard/calendar', icon: Calendar },
  { label: 'Orders', href: '/dashboard/orders', icon: ShoppingBag },
  { label: 'Analytics', href: '/dashboard/analytics', icon: BarChart3 },
  { label: 'Messages', href: '/dashboard/messages', icon: MessageSquare, badge: 2 },
  { label: 'Tools', href: '/dashboard/tools', icon: Wrench },
]

const bottomItems = [
  { label: 'Business Profile', href: '/dashboard/profile', icon: Building2 },
  { label: 'Billing', href: '/dashboard/billing', icon: CreditCard },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname.startsWith(href)
  }

  const NavLink = ({ item }: { item: typeof navItems[0] }) => (
    <Link
      href={item.href}
      onClick={() => setSidebarOpen(false)}
      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
        isActive(item.href)
          ? 'bg-brand-tint text-brand-dark'
          : 'text-ink-3 hover:bg-bg-2 hover:text-ink'
      }`}
    >
      <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
      <span className="flex-1">{item.label}</span>
      {item.badge && (
        <span className="bg-brand text-ink text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
          {item.badge}
        </span>
      )}
    </Link>
  )

  return (
    <CartProvider>
    <div className="min-h-screen bg-bg-2 flex">
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
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-ink-4 hover:text-ink">
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
        <div className="p-3 border-t border-ink-6">
          <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-bg-2 transition-colors">
            <div className="w-8 h-8 rounded-full bg-brand-tint border border-brand/20 flex items-center justify-center text-brand-dark text-xs font-bold">
              MB
            </div>
            <div className="flex-1 text-left">
              <div className="text-sm font-medium text-ink truncate">Matt Butler</div>
              <div className="text-[10px] text-ink-4">Client</div>
            </div>
            <ChevronDown className="w-4 h-4 text-ink-4" />
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 lg:ml-[260px]">
        {/* Top bar */}
        <header className="h-14 bg-white border-b border-ink-6 flex items-center justify-between px-4 lg:px-6 sticky top-0 z-30">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-ink-3 hover:text-ink">
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-3">
            <Notifications />
          </div>
        </header>

        {/* Content */}
        <main className="p-4 lg:p-6">{children}</main>
      </div>
      <QuickRequest />
    </div>
    </CartProvider>
  )
}
