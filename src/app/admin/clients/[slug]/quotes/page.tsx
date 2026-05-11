/**
 * /admin/clients/[slug]/quotes — strategist view of all quotes for a
 * client across the full lifecycle (draft / sent / approved / declined /
 * revising / expired).
 *
 * "New quote" CTA top-right routes to the builder.
 */

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, FileText, Plus, Inbox, CheckCircle2, XCircle, Clock, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ slug: string }>
}

const STATUS_TONE: Record<string, { label: string; bg: string; text: string; Icon: React.ComponentType<{ className?: string }>; spin?: boolean }> = {
  draft:     { label: 'Draft',          bg: 'bg-ink-7',     text: 'text-ink-3',      Icon: FileText },
  sent:      { label: 'Awaiting client', bg: 'bg-amber-50', text: 'text-amber-700',  Icon: Inbox },
  approved:  { label: 'Approved',       bg: 'bg-emerald-50', text: 'text-emerald-700', Icon: CheckCircle2 },
  declined:  { label: 'Declined',       bg: 'bg-rose-50',   text: 'text-rose-700',   Icon: XCircle },
  revising:  { label: 'Revising',       bg: 'bg-sky-50',    text: 'text-sky-700',    Icon: Loader2, spin: true },
  expired:   { label: 'Expired',        bg: 'bg-ink-7',     text: 'text-ink-3',      Icon: Clock },
}

export default async function ClientQuotesPage({ params }: PageProps) {
  const { slug } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  if ((profile?.role as string | null) !== 'admin') redirect('/dashboard')

  const admin = createAdminClient()
  const { data: client } = await admin
    .from('clients')
    .select('id, name, slug')
    .eq('slug', slug)
    .maybeSingle()
  if (!client) notFound()

  const { data: quotes } = await admin
    .from('content_quotes')
    .select('id, title, source_request_summary, total, status, sent_at, responded_at, created_at')
    .eq('client_id', client.id as string)
    .order('created_at', { ascending: false })
    .limit(50)

  return (
    <div className="px-6 py-8 max-w-4xl mx-auto">
      <Link
        href={`/admin/clients/${slug}`}
        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-3 hover:text-ink mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to {client.name as string}
      </Link>

      <header className="mb-7 flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-amber-50 text-amber-700 ring-1 ring-amber-100">
              <FileText className="w-4.5 h-4.5" />
            </div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-3 leading-none">
              Quotes · {client.name as string}
            </p>
          </div>
          <h1 className="text-[28px] font-bold text-ink tracking-tight leading-tight">
            All quotes
          </h1>
        </div>
        <Link
          href={`/admin/clients/${slug}/quotes/new`}
          className="inline-flex items-center gap-2 text-[13px] font-semibold bg-ink hover:bg-ink/90 text-white rounded-full px-4 py-2.5 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          New quote
        </Link>
      </header>

      {!quotes || quotes.length === 0 ? (
        <div
          className="rounded-2xl border-2 border-dashed p-10 text-center bg-white"
          style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
        >
          <p className="text-[14px] font-semibold text-ink leading-tight">No quotes yet</p>
          <p className="text-[12px] text-ink-3 max-w-md mx-auto mt-1.5 leading-relaxed">
            Create the first quote with the button above. The client sees it on their social hub
            the moment it&rsquo;s sent.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {quotes.map(q => {
            const tone = STATUS_TONE[q.status as string] ?? STATUS_TONE.draft
            const ToneIcon = tone.Icon
            return (
              <li key={q.id as string}>
                <Link
                  href={`/dashboard/social/quotes/${q.id}?clientId=${encodeURIComponent(client.id as string)}`}
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
                          {q.sent_at
                            ? `Sent ${rel(q.sent_at as string)}`
                            : `Created ${rel(q.created_at as string)}`}
                        </span>
                      </div>
                      <p className="text-[14px] font-semibold text-ink leading-snug truncate">
                        {q.title as string}
                      </p>
                      {q.source_request_summary && (
                        <p className="text-[12px] text-ink-3 mt-0.5 leading-snug line-clamp-1">
                          {q.source_request_summary as string}
                        </p>
                      )}
                    </div>
                    <p className="text-[18px] font-bold text-ink tabular-nums flex-shrink-0">
                      ${Number(q.total ?? 0).toFixed(0)}
                    </p>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
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
