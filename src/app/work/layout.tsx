/**
 * /work/* layout — shared shell for operator & field roles.
 *
 * Minimal frame: top bar with workspace switcher + sign-out, full-bleed
 * main. Sidebar comes per-role inside each page (different roles want
 * different navigation, and field roles want no sidebar at all).
 */

'use client'

import Link from 'next/link'
import { signOut } from '@/lib/supabase/hooks'
import WorkspaceSwitcher from '@/components/dashboard/workspace-switcher'
import { ToastProvider } from '@/components/ui/toast'

export default function WorkLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <div className="min-h-screen bg-bg-1">
        <header className="h-14 bg-white border-b border-ink-6 flex items-center justify-between px-4 lg:px-6 sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <Link href="/work" className="text-[13px] font-bold tracking-tight text-ink">
              Apnosh
            </Link>
            <span className="text-ink-5">/</span>
            <WorkspaceSwitcher />
          </div>
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-[12px] text-ink-3 hover:text-ink">
              Client view
            </Link>
            <button
              onClick={signOut}
              className="text-[12px] text-ink-3 hover:text-red-600"
            >
              Sign out
            </button>
          </div>
        </header>
        <main>{children}</main>
      </div>
    </ToastProvider>
  )
}
