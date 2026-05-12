/**
 * /work/quotes — cross-client quote pipeline for the strategist.
 *
 * Bucketed by status. Click a quote to land on the same-client quote
 * detail page (which the client owns at /dashboard/social/quotes/[id]).
 */

import Link from 'next/link'
import { FileText, ArrowRight, CheckCircle2, XCircle, Inbox, Clock, Loader2 } from 'lucide-react'
import { requireAnyCapability } from '@/lib/auth/require-any-capability'
import { getStrategistQuotes, type StrategistQuoteRow } from '@/lib/work/get-strategist-quotes'

export const dynamic = 'force-dynamic'

interface StatusTone { label: string; bg: string; text: string; Icon: React.ComponentType<{ className?: string }>; spin?: boolean }
const STATUS: Record<string, StatusTone> = {
  draft:    { label: 'Draft',          bg: 'bg-ink-7',      text: 'text-ink-3',       Icon: FileText },
  sent:     { label: 'Awaiting client', bg: 'bg-amber-50',  text: 'text-amber-700',   Icon: Inbox },
  approved: { label: 'Approved',       bg: 'bg-emerald-50', text: 'text-emerald-700', Icon: CheckCircle2 },
  declined: { label: 'Declined',       bg: 'bg-rose-50',    text: 'text-rose-700',    Icon: XCircle },
  revising: { label: 'Revising',       bg: 'bg-sky-50',     text: 'text-sky-700',     Icon: Loader2, spin: true },
  expired:  { label: 'Expired',        bg: 'bg-ink-7',      text: 'text-ink-3',       Icon: Clock },
}

const BUCKETS: Array<{ key: string; label: string; statuses: string[]; tone: 'amber' | 'sky' | 'emerald' | 'ink' }> = [
  { key: 'awaiting', label: 'Awaiting client', statuses: ['sent'],     tone: 'amber'   },
  { key: 'working',  label: 'In progress',     statuses: ['revising','draft'], tone: 'sky' },
  { key: 'won',      label: 'Approved',         statuses: ['approved'], tone: 'emerald' },
  { key: 'closed',   label: 'Closed',           statuses: ['declined','expired'], tone: 'ink' },
]

export default async function StrategistQuotesPage() {
  await requireAnyCapability(["strategist"])
  const quotes = await getStrategistQuotes()

  return (
    <div className="max-w-5xl mx-auto py-7 px-4 lg:px-6">
      <header className="mb-7">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-amber-50 text-amber-700 ring-1 ring-amber-100">
            <FileText className="w-4.5 h-4.5" />
          </div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-3 leading-none">
            Pipeline
          </p>
        </div>
        <h1 className="text-[26px] sm:text-[28px] leading-tight font-bold text-ink tracking-tight">
          Quotes across your book
        </h1>
        <p className="text-[13px] text-ink-2 mt-1.5 leading-relaxed max-w-2xl">
          Every quote you&rsquo;ve drafted, sent, won, or lost. Click in to view the line items or chase a slow approval.
        </p>
      </header>

      {quotes.length === 0 ? <EmptyState /> : (
        <div className="space-y-7">
          {BUCKETS.map(b => {
            const rows = quotes.filter(q => b.statuses.includes(q.status))
            if (rows.length === 0) return null
            return <Bucket key={b.key} label={b.label} tone={b.tone} rows={rows} />
          })}
        </div>
      )}
    </div>
  )
}

function Bucket({ label, tone, rows }: { label: string; tone: 'amber'|'sky'|'emerald'|'ink'; rows: StrategistQuoteRow[] }) {
  const total = rows.reduce((s, r) => s + r.total, 0)
  const toneText = tone === 'amber' ? 'text-amber-700'
    : tone === 'sky' ? 'text-sky-700'
    : tone === 'emerald' ? 'text-emerald-700'
    : 'text-ink-3'
  return (
    <section>
      <div className="flex items-baseline justify-between mb-2">
        <h2 className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${toneText}`}>
          {label} · {rows.length}
        </h2>
        <p className="text-[11px] text-ink-3 tabular-nums">${total.toFixed(0)} total</p>
      </div>
      <ul className="space-y-1.5">
        {rows.map(q => <QuoteRow key={q.id} q={q} />)}
      </ul>
    </section>
  )
}

function QuoteRow({ q }: { q: StrategistQuoteRow }) {
  const tone = STATUS[q.status] ?? STATUS.draft
  const ToneIcon = tone.Icon
  const detailHref = `/dashboard/social/quotes/${q.id}?clientId=${q.clientId}`
  return (
    <li>
      <Link
        href={detailHref}
        className="block rounded-xl border bg-white p-3.5 hover:shadow-sm transition-shadow"
        style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
      >
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-0.5">
              <span className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${tone.bg} ${tone.text}`}>
                <ToneIcon className={`w-2.5 h-2.5 ${tone.spin ? 'animate-spin' : ''}`} />
                {tone.label}
              </span>
              <span className="text-[11px] font-semibold text-ink-3 uppercase tracking-wider">
                {q.clientName ?? 'Client'}
              </span>
            </div>
            <p className="text-[13px] font-semibold text-ink leading-snug truncate">
              {q.title}
            </p>
            <p className="text-[11px] text-ink-4 mt-0.5 leading-tight">
              {q.sentAt ? `Sent ${rel(q.sentAt)}` : `Created ${rel(q.createdAt)}`}
              {q.respondedAt && ` · Responded ${rel(q.respondedAt)}`}
            </p>
          </div>
          <p className="text-[15px] font-bold text-ink tabular-nums flex-shrink-0">
            ${q.total.toFixed(0)}
          </p>
          <ArrowRight className="w-4 h-4 text-ink-4 flex-shrink-0 mt-1" />
        </div>
      </Link>
    </li>
  )
}

function EmptyState() {
  return (
    <div
      className="rounded-2xl border-2 border-dashed p-10 text-center bg-white"
      style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
    >
      <div className="w-12 h-12 mx-auto rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center mb-3 ring-1 ring-amber-100">
        <FileText className="w-5 h-5" />
      </div>
      <p className="text-[14px] font-semibold text-ink leading-tight">No quotes yet</p>
      <p className="text-[12px] text-ink-3 max-w-md mx-auto mt-1.5 leading-relaxed">
        When you send a client a quote for over-plan work, it lands here so you can chase or convert.
      </p>
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
