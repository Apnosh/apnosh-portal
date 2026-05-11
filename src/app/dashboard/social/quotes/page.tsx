/**
 * /dashboard/social/quotes — list of every quote for the client.
 *
 * Pending quotes on top, history below. Each row is a thin card with
 * title, status badge, total, and a chevron into the detail view.
 */

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, FileText, Inbox, CheckCircle2, XCircle, Clock, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getPendingQuotes, getRecentQuotes, type ContentQuote, type QuoteStatus } from '@/lib/dashboard/get-quotes'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ clientId?: string }>
}

export default async function QuotesIndexPage({ searchParams }: PageProps) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const sp = await searchParams
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  const isAdmin = (profile?.role as string | null) === 'admin'

  let clientId: string | null = null
  if (isAdmin) {
    clientId = sp.clientId ?? null
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
        Sign in as a client to see your quotes.
      </div>
    )
  }

  const [pending, recent] = await Promise.all([
    getPendingQuotes(clientId),
    getRecentQuotes(clientId, 20),
  ])

  const pendingIds = new Set(pending.map(p => p.id))
  const history = recent.filter(r => !pendingIds.has(r.id))

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 lg:px-6">
      <Link
        href="/dashboard/social"
        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-3 hover:text-ink mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to social
      </Link>

      <header className="mb-7">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-amber-50 text-amber-700 ring-1 ring-amber-100">
            <FileText className="w-4.5 h-4.5" />
          </div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-3 leading-none">
            Quotes
          </p>
        </div>
        <h1 className="text-[28px] sm:text-[30px] leading-tight font-bold text-ink tracking-tight">
          Your quotes
        </h1>
        <p className="text-[14px] text-ink-2 mt-2 leading-relaxed max-w-2xl">
          Anything bigger than your monthly plan gets quoted here. Approve, ask for changes,
          or decline. Nothing starts until you say yes.
        </p>
      </header>

      {pending.length > 0 && (
        <section className="mb-8">
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.18em] text-amber-700 mb-3">
            Waiting on you
          </h2>
          <ul className="space-y-2">
            {pending.map(q => <QuoteRow key={q.id} quote={q} />)}
          </ul>
        </section>
      )}

      {history.length > 0 && (
        <section>
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.18em] text-ink-3 mb-3">
            History
          </h2>
          <ul className="space-y-2">
            {history.map(q => <QuoteRow key={q.id} quote={q} />)}
          </ul>
        </section>
      )}

      {pending.length === 0 && history.length === 0 && (
        <div
          className="rounded-2xl border-2 border-dashed p-10 text-center bg-white"
          style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
        >
          <div className="w-12 h-12 mx-auto rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center mb-3 ring-1 ring-amber-100">
            <FileText className="w-5 h-5" />
          </div>
          <p className="text-[14px] font-semibold text-ink leading-tight">No quotes yet</p>
          <p className="text-[12px] text-ink-3 max-w-md mx-auto mt-1.5 leading-relaxed">
            When you ask for something bigger than your plan, your strategist sends a quote here.
            You approve, ask for changes, or decline before any work starts.
          </p>
        </div>
      )}
    </div>
  )
}

const STATUS_TONE: Record<QuoteStatus, { label: string; bg: string; text: string; Icon: React.ComponentType<{ className?: string }>; spin?: boolean }> = {
  draft:     { label: 'Draft',          bg: 'bg-ink-7',     text: 'text-ink-3',      Icon: FileText },
  sent:      { label: 'Awaiting you',   bg: 'bg-amber-50',  text: 'text-amber-700',  Icon: Inbox },
  approved:  { label: 'Approved',       bg: 'bg-emerald-50', text: 'text-emerald-700', Icon: CheckCircle2 },
  declined:  { label: 'Declined',       bg: 'bg-rose-50',   text: 'text-rose-700',   Icon: XCircle },
  revising:  { label: 'Strategist revising', bg: 'bg-sky-50', text: 'text-sky-700', Icon: Loader2, spin: true },
  expired:   { label: 'Expired',        bg: 'bg-ink-7',     text: 'text-ink-3',      Icon: Clock },
}

function QuoteRow({ quote }: { quote: ContentQuote }) {
  const tone = STATUS_TONE[quote.status]
  const ToneIcon = tone.Icon
  return (
    <li>
      <Link
        href={`/dashboard/social/quotes/${quote.id}`}
        className="block rounded-xl border bg-white p-4 hover:shadow-sm transition-shadow"
        style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
      >
        <div className="flex items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${tone.bg} ${tone.text}`}>
                <ToneIcon className={`w-2.5 h-2.5 ${tone.spin ? 'animate-spin' : ''}`} />
                {tone.label}
              </span>
              <span className="text-[11px] text-ink-4">
                {quote.sentAt ? `Sent ${rel(quote.sentAt)}` : `Created ${rel(quote.createdAt)}`}
              </span>
            </div>
            <p className="text-[14px] font-semibold text-ink leading-snug truncate">
              {quote.title}
            </p>
            {quote.sourceRequestSummary && (
              <p className="text-[12px] text-ink-3 mt-0.5 leading-snug truncate">
                {quote.sourceRequestSummary}
              </p>
            )}
          </div>
          <p className="text-[18px] font-bold text-ink tabular-nums flex-shrink-0">
            ${quote.total.toFixed(0)}
          </p>
        </div>
      </Link>
    </li>
  )
}

function rel(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const h = Math.round(ms / 3_600_000)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 30) return `${d}d ago`
  return new Date(iso).toLocaleDateString()
}
