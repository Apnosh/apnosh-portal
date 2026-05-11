'use client'

/**
 * AdminClientPicker — used on any /dashboard route when an admin user
 * lands without an explicit ?clientId= in the URL. Fetches the list of
 * clients on mount and renders a grid of selectable cards.
 *
 * Picking a card sets ?clientId=<id> on the current path (preserves
 * other query params), so the calling page can re-render with the
 * selected client.
 */

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Calendar as CalendarIcon, ChevronRight, Shield, ArrowUpRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface ClientRow {
  id: string
  name: string
  slug?: string | null
}

interface AdminClientPickerProps {
  /** Headline for the picker. Defaults to "Pick a client". */
  title?: string
  /** Description below the headline. */
  description?: string
  /** Section eyebrow. Defaults to "Calendar · Admin view". */
  eyebrow?: string
}

export default function AdminClientPicker({
  title = 'Pick a client',
  description = 'You’re signed in as admin. Choose a client below to see their dashboard. The selection lives in the URL so you can bookmark or share the link.',
  eyebrow = 'Admin view',
}: AdminClientPickerProps) {
  const supabase = createClient()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [clients, setClients] = useState<ClientRow[] | null>(null)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('clients')
      .select('id, name, slug')
      .order('name')
      .then(({ data }) => {
        if (cancelled) return
        setClients((data ?? []) as ClientRow[])
      })
    return () => { cancelled = true }
  }, [supabase])

  function pick(id: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('clientId', id)
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="max-w-4xl mx-auto py-10 px-4">
      <header className="mb-7">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
              <CalendarIcon className="w-4.5 h-4.5" />
            </div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-3 leading-none">
              {eyebrow}
            </p>
          </div>
          <Link
            href="/admin"
            className="group inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-2 hover:text-ink bg-white border border-ink-6 hover:border-ink-4 hover:shadow-sm rounded-full px-3 py-1.5 transition-all"
          >
            <Shield className="w-3 h-3 text-emerald-600" />
            Apnosh admin console
            <ArrowUpRight className="w-3 h-3 text-ink-4 group-hover:text-ink-2 transition-colors" />
          </Link>
        </div>
        <h1 className="text-[28px] sm:text-[30px] leading-tight font-bold text-ink tracking-tight">
          {title}
        </h1>
        <p className="text-[14px] text-ink-2 mt-2 leading-relaxed max-w-2xl">
          {description}
        </p>
      </header>

      {clients === null ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[0, 1, 2, 3, 4, 5].map(i => (
            <div
              key={i}
              className="h-[68px] rounded-xl bg-bg-2/60 animate-pulse"
            />
          ))}
        </div>
      ) : clients.length === 0 ? (
        <div
          className="rounded-2xl border bg-white p-10 text-center"
          style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
        >
          <p className="text-sm text-ink-3">No clients yet.</p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {clients.map(c => (
            <li key={c.id}>
              <button
                onClick={() => pick(c.id)}
                className="group w-full text-left flex items-center gap-3 rounded-xl border bg-white px-4 py-3.5 hover:border-ink-4 hover:shadow-sm transition-all"
                style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
              >
                <div className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 flex items-center justify-center text-[12px] font-semibold flex-shrink-0">
                  {initials(c.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold text-ink leading-tight truncate">
                    {c.name}
                  </p>
                  {c.slug && (
                    <p className="text-[11px] text-ink-4 mt-0.5 leading-tight truncate font-mono">
                      {c.slug}
                    </p>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-ink-4 group-hover:text-ink-2 transition-colors flex-shrink-0" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map(p => p[0]?.toUpperCase() ?? '').join('') || '?'
}
