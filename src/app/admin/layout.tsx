'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Users, ShoppingBag, Kanban, UserCog, FileBarChart,
  Menu, X, ChevronDown, Shield
} from 'lucide-react'

const navItems = [
  { label: 'Overview', href: '/admin', icon: LayoutDashboard },
  { label: 'Clients', href: '/admin/clients', icon: Users },
  { label: 'Orders', href: '/admin/orders', icon: ShoppingBag, badge: 8 },
  { label: 'Pipeline', href: '/admin/pipeline', icon: Kanban },
  { label: 'Team', href: '/admin/team', icon: UserCog },
  { label: 'Reports', href: '/admin/reports', icon: FileBarChart },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const isActive = (href: string) => {
    if (href === '/admin') return pathname === '/admin'
    return pathname.startsWith(href)
  }

  return (
    <div className="min-h-screen bg-bg-2 flex">
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
            <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-white/40 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive(item.href)
                  ? 'bg-white/10 text-white'
                  : 'text-white/40 hover:bg-white/5 hover:text-white/70'
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
          ))}
        </nav>

        <div className="p-3 border-t border-white/8">
          <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors">
            <div className="w-8 h-8 rounded-full bg-brand/20 flex items-center justify-center text-brand text-xs font-bold">
              MB
            </div>
            <div className="flex-1 text-left">
              <div className="text-sm font-medium text-white/80 truncate">Matt Butler</div>
              <div className="text-[10px] text-white/30">Admin</div>
            </div>
            <ChevronDown className="w-4 h-4 text-white/30" />
          </button>
        </div>
      </aside>

      <div className="flex-1 lg:ml-[260px]">
        <header className="h-14 bg-white border-b border-ink-6 flex items-center justify-between px-4 lg:px-6 sticky top-0 z-30">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-ink-3 hover:text-ink">
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex-1" />
          <Link href="/dashboard" className="text-xs text-ink-4 hover:text-brand-dark transition-colors">
            Switch to Client View &rarr;
          </Link>
        </header>
        <main className="p-4 lg:p-6">{children}</main>
      </div>
    </div>
  )
}
