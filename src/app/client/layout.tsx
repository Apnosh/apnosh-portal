'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, ListTodo, BookOpen, CheckCircle, LogOut, Menu, X,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ToastProvider } from '@/components/ui/toast'
import { RealtimeProvider } from '@/lib/realtime'
import type { Client, ClientBrand } from '@/types/database'

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const [client, setClient] = useState<Client | null>(null)
  const [brand, setBrand] = useState<ClientBrand | null>(null)
  const [userName, setUserName] = useState<string>('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  // Extract slug from pathname: /client/[slug]/...
  const slug = pathname.split('/')[2]

  useEffect(() => {
    async function load() {
      if (!slug) return

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const { data: clientData } = await supabase
        .from('clients')
        .select('*')
        .eq('slug', slug)
        .single()

      if (clientData) {
        setClient(clientData as Client)

        const { data: brandData } = await supabase
          .from('client_brands')
          .select('*')
          .eq('client_id', (clientData as Client).id)
          .maybeSingle()

        if (brandData) setBrand(brandData as ClientBrand)
      }

      // Get client_user name
      const { data: clientUser } = await supabase
        .from('client_users')
        .select('name, email')
        .eq('auth_user_id', user.id)
        .maybeSingle()

      if (clientUser) {
        setUserName(clientUser.name || clientUser.email)
      } else {
        setUserName(user.email || 'User')
      }

      setLoading(false)
    }
    load()
  }, [slug, router, supabase])

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-2">
        <div className="text-ink-4 text-sm">Loading...</div>
      </div>
    )
  }

  const navItems = [
    { label: 'Dashboard', href: `/client/${slug}`, icon: LayoutDashboard, exact: true },
    { label: 'Requests', href: `/client/${slug}/requests`, icon: ListTodo, exact: false },
    { label: 'Brand', href: `/client/${slug}/brand`, icon: BookOpen, exact: false },
  ]

  const initials = (client?.name ?? '??').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
  const primaryColor = brand?.primary_color || '#4abd98'

  return (
    <ToastProvider>
      <RealtimeProvider>
        <div className="min-h-screen bg-bg-2 flex">
          {/* ── Sidebar ─────────────────────────────────────────── */}
          <aside
            className={`fixed inset-y-0 left-0 z-40 w-[260px] bg-white border-r border-ink-6 flex flex-col transform transition-transform lg:translate-x-0 ${
              sidebarOpen ? 'translate-x-0' : '-translate-x-full'
            }`}
          >
            {/* Client brand header */}
            <div className="h-16 px-5 flex items-center gap-3 border-b border-ink-6">
              {brand?.logo_url ? (
                <img src={brand.logo_url} alt={client?.name ?? ''} className="w-8 h-8 rounded-lg object-cover" />
              ) : (
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold"
                  style={{ backgroundColor: primaryColor }}
                >
                  {initials}
                </div>
              )}
              <div className="min-w-0">
                <div className="font-[family-name:var(--font-display)] text-base text-ink truncate">
                  {client?.name ?? 'Client'}
                </div>
                <div className="text-[10px] text-ink-4 uppercase tracking-wide">Portal</div>
              </div>
            </div>

            {/* Nav */}
            <nav className="flex-1 px-3 py-4 space-y-1">
              {navItems.map(item => {
                const isActive = item.exact
                  ? pathname === item.href
                  : pathname.startsWith(item.href)
                const Icon = item.icon
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-brand-tint/50 text-brand-dark'
                        : 'text-ink-2 hover:bg-bg-2'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </Link>
                )
              })}
            </nav>

            {/* User footer */}
            <div className="border-t border-ink-6 p-3">
              <div className="flex items-center gap-3 px-2 py-2">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                  style={{ backgroundColor: primaryColor }}
                >
                  {userName.slice(0, 1).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-ink truncate">{userName}</div>
                  <div className="text-[10px] text-ink-4">Client User</div>
                </div>
                <button
                  onClick={handleSignOut}
                  className="text-ink-4 hover:text-red-500 transition-colors"
                  title="Sign out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          </aside>

          {/* Mobile backdrop */}
          {sidebarOpen && (
            <div
              className="fixed inset-0 z-30 bg-black/30 lg:hidden"
              onClick={() => setSidebarOpen(false)}
            />
          )}

          {/* ── Main ─────────────────────────────────────────── */}
          <div className="flex-1 lg:ml-[260px]">
            {/* Top bar */}
            <header className="h-14 bg-white border-b border-ink-6 flex items-center gap-3 px-4 lg:px-6 sticky top-0 z-20">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden text-ink-3 hover:text-ink"
              >
                <Menu className="w-5 h-5" />
              </button>
              <div className="flex-1" />
              <Link
                href={`/client/${slug}/requests/new`}
                className="text-white text-sm font-medium rounded-lg px-4 py-2 transition-opacity hover:opacity-90"
                style={{ backgroundColor: primaryColor }}
              >
                + New Request
              </Link>
            </header>

            <main className="p-4 lg:p-6">
              {children}
            </main>
          </div>
        </div>
      </RealtimeProvider>
    </ToastProvider>
  )
}
