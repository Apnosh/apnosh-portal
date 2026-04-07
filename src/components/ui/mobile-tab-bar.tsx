'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, CheckCircle, ShoppingBag, MessageSquare, Menu,
  Users, Kanban, CreditCard, FileBarChart,
} from 'lucide-react'

const clientTabs = [
  { label: 'Home', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Approvals', href: '/dashboard/approvals', icon: CheckCircle },
  { label: 'Orders', href: '/dashboard/orders', icon: ShoppingBag },
  { label: 'Messages', href: '/dashboard/messages', icon: MessageSquare },
]

const adminTabs = [
  { label: 'Overview', href: '/admin', icon: LayoutDashboard },
  { label: 'Clients', href: '/admin/clients', icon: Users },
  { label: 'Pipeline', href: '/admin/pipeline', icon: Kanban },
  { label: 'Billing', href: '/admin/billing', icon: CreditCard },
  { label: 'Reports', href: '/admin/reports', icon: FileBarChart },
]

export function ClientTabBar() {
  return <TabBar tabs={clientTabs} />
}

export function AdminTabBar() {
  return <TabBar tabs={adminTabs} />
}

function TabBar({ tabs }: { tabs: { label: string; href: string; icon: typeof LayoutDashboard }[] }) {
  const pathname = usePathname()

  const isActive = (href: string) => {
    if (href === '/dashboard' || href === '/admin') return pathname === href
    return pathname.startsWith(href)
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-ink-6 lg:hidden safe-bottom">
      <div className="flex items-stretch">
        {tabs.map((tab) => {
          const active = isActive(tab.href)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] transition-colors ${
                active ? 'text-brand-dark' : 'text-ink-4'
              }`}
            >
              <tab.icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{tab.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
