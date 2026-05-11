'use client'

/**
 * Three compact rails surfaced above the task buckets on /admin/today:
 *
 *   1. Quotes approved — start work. Count + the 5 most recently
 *      approved. Closes the loop between "sent" and "delivered".
 *   2. Sent quotes awaiting client response — count + the 5 oldest.
 *      So the strategist can chase clients who haven't decided yet.
 *   3. Pending boost requests — count + the 5 oldest.
 *      So the strategist sees ad work to launch in Meta Ads Manager.
 *
 * Each rail hides when empty.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { FileText, Zap, ArrowRight, Clock, CheckCircle2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface SentQuote {
  id: string
  client_id: string
  title: string
  total: number
  sent_at: string
  client: { name: string; slug: string } | null
}

interface ApprovedQuote {
  id: string
  client_id: string
  title: string
  total: number
  responded_at: string
  client: { name: string; slug: string } | null
}

interface PendingBoost {
  id: string
  client_id: string
  budget_total: number
  days: number
  audience_preset: string
  created_at: string
  source_post_snapshot: { text?: string } | null
  client: { name: string; slug: string } | null
}

export default function StrategistRails() {
  const [quotes, setQuotes] = useState<SentQuote[] | null>(null)
  const [approved, setApproved] = useState<ApprovedQuote[] | null>(null)
  const [boosts, setBoosts] = useState<PendingBoost[] | null>(null)

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false

    void supabase
      .from('content_quotes')
      .select('id, client_id, title, total, sent_at, client:clients(name, slug)')
      .in('status', ['sent', 'revising'])
      .order('sent_at', { ascending: true, nullsFirst: false })
      .limit(20)
      .then(({ data }) => {
        if (cancelled) return
        setQuotes((data ?? []) as unknown as SentQuote[])
      })

    void supabase
      .from('content_quotes')
      .select('id, client_id, title, total, responded_at, client:clients(name, slug)')
      .eq('status', 'approved')
      .order('responded_at', { ascending: false, nullsFirst: false })
      .limit(20)
      .then(({ data }) => {
        if (cancelled) return
        setApproved((data ?? []) as unknown as ApprovedQuote[])
      })

    void supabase
      .from('ad_campaigns')
      .select('id, client_id, budget_total, days, audience_preset, created_at, source_post_snapshot, client:clients(name, slug)')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(20)
      .then(({ data }) => {
        if (cancelled) return
        setBoosts((data ?? []) as unknown as PendingBoost[])
      })

    return () => { cancelled = true }
  }, [])

  const hasApproved = (approved?.length ?? 0) > 0
  const hasQuotes = (quotes?.length ?? 0) > 0
  const hasBoosts = (boosts?.length ?? 0) > 0

  if (!hasApproved && !hasQuotes && !hasBoosts) return null

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
      {hasApproved && approved && <ApprovedRail approved={approved} />}
      {hasQuotes && quotes && <QuotesRail quotes={quotes} />}
      {hasBoosts && boosts && <BoostsRail boosts={boosts} />}
    </div>
  )
}

function ApprovedRail({ approved }: { approved: ApprovedQuote[] }) {
  const totalApproved = approved.reduce((s, q) => s + Number(q.total ?? 0), 0)
  return (
    <div
      className="rounded-2xl border bg-gradient-to-br from-emerald-50/60 via-white to-white p-4"
      style={{ borderColor: 'var(--db-border, #d3e6db)' }}
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200/60 flex-shrink-0">
            <CheckCircle2 className="w-4.5 h-4.5" />
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-700 leading-none">
              Approved &mdash; start work
            </p>
            <p className="text-[15px] font-semibold text-ink mt-1 leading-none">
              {approved.length} ready &middot; ${totalApproved.toFixed(0)} earned
            </p>
          </div>
        </div>
      </div>
      <ul className="space-y-1.5">
        {approved.slice(0, 5).map(q => (
          <li key={q.id}>
            <Link
              href={`/admin/clients/${q.client?.slug ?? ''}`}
              className="flex items-center gap-3 rounded-xl border bg-white px-3 py-2 hover:shadow-sm transition-shadow"
              style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
            >
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold text-ink leading-tight truncate">
                  {q.title}
                </p>
                <p className="text-[10px] text-ink-3 leading-tight mt-0.5 inline-flex items-center gap-1.5">
                  {q.client?.name ?? 'Client'}
                  <span className="text-ink-5">&middot;</span>
                  <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                  {q.responded_at ? rel(q.responded_at) : 'just approved'}
                </p>
              </div>
              <span className="text-[12px] font-bold text-emerald-700 tabular-nums flex-shrink-0">
                ${Number(q.total ?? 0).toFixed(0)}
              </span>
              <ArrowRight className="w-3 h-3 text-ink-4 flex-shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
      {approved.length > 5 && (
        <p className="text-[11px] text-ink-3 mt-2">
          + {approved.length - 5} more
        </p>
      )}
    </div>
  )
}

function QuotesRail({ quotes }: { quotes: SentQuote[] }) {
  const totalDue = quotes.reduce((s, q) => s + Number(q.total ?? 0), 0)
  return (
    <div
      className="rounded-2xl border bg-gradient-to-br from-amber-50/60 via-white to-white p-4"
      style={{ borderColor: 'var(--db-border, #f0e6d6)' }}
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-amber-100 text-amber-700 ring-1 ring-amber-200/60 flex-shrink-0">
            <FileText className="w-4.5 h-4.5" />
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-700 leading-none">
              Quotes awaiting client
            </p>
            <p className="text-[15px] font-semibold text-ink mt-1 leading-none">
              {quotes.length} sent · ${totalDue.toFixed(0)} pending
            </p>
          </div>
        </div>
      </div>
      <ul className="space-y-1.5">
        {quotes.slice(0, 5).map(q => (
          <li key={q.id}>
            <Link
              href={q.client ? `/dashboard/social/quotes/${q.id}?clientId=${q.client_id}` : `/dashboard/social/quotes/${q.id}`}
              className="flex items-center gap-3 rounded-xl border bg-white px-3 py-2 hover:shadow-sm transition-shadow"
              style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
            >
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold text-ink leading-tight truncate">
                  {q.title}
                </p>
                <p className="text-[10px] text-ink-3 leading-tight mt-0.5 inline-flex items-center gap-1.5">
                  {q.client?.name ?? 'Client'}
                  <span className="text-ink-5">·</span>
                  <Clock className="w-2.5 h-2.5" />
                  {q.sent_at ? rel(q.sent_at) : 'just sent'}
                </p>
              </div>
              <span className="text-[12px] font-bold text-ink tabular-nums flex-shrink-0">
                ${Number(q.total ?? 0).toFixed(0)}
              </span>
              <ArrowRight className="w-3 h-3 text-ink-4 flex-shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
      {quotes.length > 5 && (
        <p className="text-[11px] text-ink-3 mt-2">
          + {quotes.length - 5} older
        </p>
      )}
    </div>
  )
}

function BoostsRail({ boosts }: { boosts: PendingBoost[] }) {
  const totalBudget = boosts.reduce((s, b) => s + Number(b.budget_total ?? 0), 0)
  return (
    <div
      className="rounded-2xl border bg-gradient-to-br from-emerald-50/60 via-white to-white p-4"
      style={{ borderColor: 'var(--db-border, #d3e6db)' }}
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200/60 flex-shrink-0">
            <Zap className="w-4.5 h-4.5" />
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-700 leading-none">
              Boosts to launch
            </p>
            <p className="text-[15px] font-semibold text-ink mt-1 leading-none">
              {boosts.length} approved · ${totalBudget.toFixed(0)} budget
            </p>
          </div>
        </div>
      </div>
      <ul className="space-y-1.5">
        {boosts.slice(0, 5).map(b => (
          <li key={b.id}>
            <Link
              href={b.client ? `/admin/clients/${b.client.slug}` : '#'}
              className="flex items-center gap-3 rounded-xl border bg-white px-3 py-2 hover:shadow-sm transition-shadow"
              style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
            >
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold text-ink leading-tight truncate">
                  {b.source_post_snapshot?.text?.slice(0, 60) || 'Boost selected post'}
                </p>
                <p className="text-[10px] text-ink-3 leading-tight mt-0.5">
                  {b.client?.name ?? 'Client'}
                  <span className="text-ink-5 mx-1.5">·</span>
                  ${Number(b.budget_total).toFixed(0)} × {b.days}d · {b.audience_preset}
                </p>
              </div>
              <ArrowRight className="w-3 h-3 text-ink-4 flex-shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
      {boosts.length > 5 && (
        <p className="text-[11px] text-ink-3 mt-2">
          + {boosts.length - 5} older
        </p>
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
