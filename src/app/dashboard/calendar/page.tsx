/**
 * /dashboard/calendar — the unified calendar.
 *
 * Resolution rules:
 *   - If the user is a regular client: auto-resolve clientId via
 *     businesses.owner_id then client_users.auth_user_id.
 *   - If the user is an admin: do NOT auto-resolve. Admins must
 *     explicitly pick a client via ?clientId=<id>; otherwise we
 *     render a picker. This avoids the bug where an admin who also
 *     happens to have a row in businesses or client_users (eg. for
 *     testing) silently gets locked to that client's calendar.
 */

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Calendar as CalendarIcon, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getCalendar } from '@/lib/dashboard/get-calendar'
import { signClientId } from '@/lib/calendar/feed-token'
import CalendarView from './calendar-view'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ clientId?: string }>
}

export default async function CalendarPage({ searchParams }: PageProps) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Detect admin role.
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  const isAdmin = (profile?.role as string | null) === 'admin'

  const params = await searchParams
  let clientId: string | null = null
  let viewingAs: { id: string; name: string } | null = null

  if (isAdmin) {
    clientId = params.clientId ?? null
    if (!clientId) {
      const { data: clients } = await supabase
        .from('clients')
        .select('id, name, slug')
        .order('name')
      return <ClientPicker clients={(clients ?? []) as Array<{ id: string; name: string; slug?: string | null }>} />
    }
    const { data: c } = await supabase
      .from('clients')
      .select('name')
      .eq('id', clientId)
      .maybeSingle()
    viewingAs = { id: clientId, name: (c?.name as string | null) ?? 'Client' }
  } else {
    const { data: business } = await supabase
      .from('businesses')
      .select('client_id')
      .eq('owner_id', user.id)
      .maybeSingle()
    clientId = (business?.client_id as string | null) ?? null
    if (!clientId) {
      const { data: cu } = await supabase
        .from('client_users')
        .select('client_id')
        .eq('auth_user_id', user.id)
        .maybeSingle()
      clientId = (cu?.client_id as string | null) ?? null
    }
  }

  if (!clientId) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center text-ink-3">
        Sign in as a client to see your calendar.
      </div>
    )
  }

  const [events, clientRow] = await Promise.all([
    getCalendar(clientId),
    supabase.from('clients').select('created_at').eq('id', clientId).maybeSingle(),
  ])

  const clientCreatedAt = (clientRow.data?.created_at as string | null) ?? null
  const token = signClientId(clientId)
  const subscribeUrl = `/api/calendar/feed?c=${encodeURIComponent(clientId)}&t=${token}`

  return (
    <CalendarView
      events={events}
      clientCreatedAt={clientCreatedAt}
      subscribePath={subscribeUrl}
      viewingAs={viewingAs}
    />
  )
}

/* ────────────────────────────── Client picker ─────────────────────────── */

function ClientPicker({
  clients,
}: {
  clients: Array<{ id: string; name: string; slug?: string | null }>
}) {
  return (
    <div className="max-w-4xl mx-auto py-10 px-4">
      <header className="mb-7">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
            <CalendarIcon className="w-4.5 h-4.5" />
          </div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-3 leading-none">
            Calendar · Admin view
          </p>
        </div>
        <h1 className="text-[28px] sm:text-[30px] leading-tight font-bold text-ink tracking-tight">
          Pick a client
        </h1>
        <p className="text-[14px] text-ink-2 mt-2 leading-relaxed max-w-2xl">
          You&rsquo;re signed in as admin. Choose a client below to see their calendar.
          The selection lives in the URL so you can bookmark or share the link.
        </p>
      </header>

      {clients.length === 0 ? (
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
              <Link
                href={`/dashboard/calendar?clientId=${encodeURIComponent(c.id)}`}
                className="group flex items-center gap-3 rounded-xl border bg-white px-4 py-3.5 hover:border-ink-4 hover:shadow-sm transition-all"
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
              </Link>
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
