/**
 * /marketplace layout — influencer / UGC creator surface.
 *
 * Same top frame as /work but the brand is "Apnosh Creators". Distinct
 * naming because the marketplace experience is content-first (browse
 * gigs), not workday-first (manage your queue).
 */

'use client'

import Link from 'next/link'
import { signOut } from '@/lib/supabase/hooks'
import WorkspaceSwitcher from '@/components/dashboard/workspace-switcher'
import { ToastProvider } from '@/components/ui/toast'

export default function MarketplaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <div className="min-h-screen bg-bg-1">
        <header className="h-14 bg-white border-b border-ink-6 flex items-center justify-between px-4 lg:px-6 sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <Link href="/marketplace" className="text-[13px] font-bold tracking-tight text-ink">
              Apnosh Creators
            </Link>
            <span className="text-ink-5">/</span>
            <WorkspaceSwitcher />
          </div>
          <button onClick={signOut} className="text-[12px] text-ink-3 hover:text-red-600">
            Sign out
          </button>
        </header>
        <main>{children}</main>
      </div>
    </ToastProvider>
  )
}
