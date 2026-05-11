'use client'

/**
 * Quote detail view. Three actions:
 *   - Approve → strategist starts work
 *   - Ask for changes → opens a textarea, sends a 'revising' message
 *   - Decline → confirms, sends decline
 *
 * Status badges drive the UI. After a response is sent, the view
 * locks (no more buttons) and shows the result.
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, FileText, Check, X, MessageSquare, Loader2, Clock,
  CheckCircle2, XCircle, Inbox,
} from 'lucide-react'
import type { ContentQuote, QuoteStatus } from '@/lib/dashboard/get-quotes'

const STATUS_TONE: Record<QuoteStatus, { label: string; bg: string; text: string; Icon: React.ComponentType<{ className?: string }> }> = {
  draft:     { label: 'Draft',          bg: 'bg-ink-7',     text: 'text-ink-3',      Icon: FileText },
  sent:      { label: 'Awaiting you',   bg: 'bg-amber-50',  text: 'text-amber-700',  Icon: Inbox },
  approved:  { label: 'Approved',       bg: 'bg-emerald-50', text: 'text-emerald-700', Icon: CheckCircle2 },
  declined:  { label: 'Declined',       bg: 'bg-rose-50',   text: 'text-rose-700',   Icon: XCircle },
  revising:  { label: 'Strategist revising', bg: 'bg-sky-50', text: 'text-sky-700',  Icon: Loader2 },
  expired:   { label: 'Expired',        bg: 'bg-ink-7',     text: 'text-ink-3',      Icon: Clock },
}

export default function QuoteView({ quote: initialQuote }: { quote: ContentQuote }) {
  const router = useRouter()
  const [quote, setQuote] = useState(initialQuote)
  const [mode, setMode] = useState<'idle' | 'approving' | 'changing' | 'declining'>('idle')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canRespond = quote.status === 'sent' || quote.status === 'revising'

  async function respond(action: 'approve' | 'decline' | 'revise') {
    if (action === 'revise' && message.trim().length < 5) {
      setError('Tell your strategist what to change.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/social/quote/${quote.id}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, message: message.trim() || null }),
      })
      if (!res.ok) {
        const t = await res.text()
        throw new Error(t || `Server returned ${res.status}`)
      }
      const data: { quote: ContentQuote } = await res.json()
      setQuote(data.quote)
      setMode('idle')
      setMessage('')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not send response. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const tone = STATUS_TONE[quote.status]
  const ToneIcon = tone.Icon

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 lg:px-6">
      <Link
        href="/dashboard/social"
        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-3 hover:text-ink mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to social
      </Link>

      <header className="mb-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-amber-50 text-amber-700 ring-1 ring-amber-100">
            <FileText className="w-4.5 h-4.5" />
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-3 leading-none">
              Quote
            </p>
            <p className="text-[11px] text-ink-4 mt-1 leading-none">
              {quote.sentAt ? `Sent ${relativeShort(quote.sentAt)}` : `Created ${relativeShort(quote.createdAt)}`}
            </p>
          </div>
          <span className={`ml-auto inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full ${tone.bg} ${tone.text}`}>
            <ToneIcon className={`w-3 h-3 ${quote.status === 'revising' ? 'animate-spin' : ''}`} />
            {tone.label}
          </span>
        </div>
        <h1 className="text-[28px] sm:text-[30px] leading-tight font-bold text-ink tracking-tight">
          {quote.title}
        </h1>
        {quote.sourceRequestSummary && (
          <p className="text-[14px] text-ink-2 mt-2 leading-relaxed">
            For: <span className="italic">{quote.sourceRequestSummary}</span>
          </p>
        )}
      </header>

      {quote.strategistMessage && (
        <section className="mb-6 rounded-2xl border bg-bg-2/40 p-4" style={{ borderColor: 'var(--db-border, #e5e5e5)' }}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-3 mb-1.5">
            From your strategist
          </p>
          <p className="text-[14px] text-ink leading-relaxed whitespace-pre-wrap">
            {quote.strategistMessage}
          </p>
        </section>
      )}

      {/* Line items */}
      <section className="rounded-2xl border bg-white overflow-hidden" style={{ borderColor: 'var(--db-border, #e5e5e5)' }}>
        <div className="px-5 py-3 border-b bg-bg-2/40" style={{ borderColor: 'var(--db-border, #e5e5e5)' }}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-3">
            Line items
          </p>
        </div>
        <ul className="divide-y" style={{ borderColor: 'var(--db-border, #e5e5e5)' }}>
          {quote.lineItems.length === 0 ? (
            <li className="px-5 py-4 text-[13px] text-ink-3">Single-line quote.</li>
          ) : (
            quote.lineItems.map((it, i) => (
              <li key={i} className="px-5 py-3.5 flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-medium text-ink leading-snug">{it.label}</p>
                  {it.notes && (
                    <p className="text-[12px] text-ink-3 mt-1 leading-snug">{it.notes}</p>
                  )}
                </div>
                <p className="text-[12px] text-ink-3 w-16 text-right tabular-nums">
                  {it.qty} × ${it.unit_price.toFixed(0)}
                </p>
                <p className="text-[14px] font-semibold text-ink w-20 text-right tabular-nums">
                  ${it.total.toFixed(0)}
                </p>
              </li>
            ))
          )}
        </ul>
        <div className="px-5 py-3 border-t bg-bg-2/20 space-y-1.5" style={{ borderColor: 'var(--db-border, #e5e5e5)' }}>
          {quote.subtotal !== null && quote.subtotal !== quote.total && (
            <div className="flex items-center justify-between text-[12px] text-ink-3">
              <span>Subtotal</span>
              <span className="tabular-nums">${quote.subtotal.toFixed(2)}</span>
            </div>
          )}
          {quote.discount > 0 && (
            <div className="flex items-center justify-between text-[12px] text-emerald-700">
              <span>Discount</span>
              <span className="tabular-nums">−${quote.discount.toFixed(2)}</span>
            </div>
          )}
          <div className="flex items-baseline justify-between pt-1">
            <span className="text-[13px] font-semibold text-ink">Total</span>
            <span className="text-[24px] font-bold text-ink tabular-nums leading-none">
              ${quote.total.toFixed(0)}
            </span>
          </div>
          {quote.estimatedTurnaroundDays !== null && (
            <p className="text-[11px] text-ink-3 pt-1">
              Estimated turnaround: {quote.estimatedTurnaroundDays} days after approval.
            </p>
          )}
        </div>
      </section>

      {quote.clientMessage && (
        <section className="mt-5 rounded-2xl border bg-sky-50/40 p-4" style={{ borderColor: 'var(--db-border, #cfe2f0)' }}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-700 mb-1.5">
            Your message
          </p>
          <p className="text-[14px] text-ink leading-relaxed whitespace-pre-wrap">
            {quote.clientMessage}
          </p>
        </section>
      )}

      {error && (
        <div className="mt-5 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-[13px] text-rose-700">
          {error}
        </div>
      )}

      {/* Actions */}
      {canRespond && mode === 'idle' && (
        <div className="mt-6 flex flex-wrap gap-2">
          <button
            onClick={() => setMode('approving')}
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-full px-4 py-2.5 transition-colors"
          >
            <Check className="w-3.5 h-3.5" />
            Approve quote
          </button>
          <button
            onClick={() => setMode('changing')}
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold bg-white border border-ink-6 hover:border-ink-4 text-ink-2 hover:text-ink rounded-full px-4 py-2.5 transition-colors"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Ask for changes
          </button>
          <button
            onClick={() => setMode('declining')}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-3 hover:text-rose-700 rounded-full px-3 py-2 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            Decline
          </button>
        </div>
      )}

      {mode === 'approving' && (
        <Confirm
          tone="emerald"
          title="Approve this quote?"
          body={`Your strategist starts work right away. Estimated ${quote.estimatedTurnaroundDays ?? '3-5'} days to delivery.`}
          confirmLabel={`Approve · $${quote.total.toFixed(0)}`}
          submitting={submitting}
          onConfirm={() => respond('approve')}
          onCancel={() => setMode('idle')}
        />
      )}

      {mode === 'changing' && (
        <RespondForm
          tone="sky"
          title="What should we change?"
          placeholder="Could you do this without the on-site filming? Or split it into two smaller posts instead..."
          confirmLabel="Send back to strategist"
          message={message}
          setMessage={setMessage}
          submitting={submitting}
          onConfirm={() => respond('revise')}
          onCancel={() => setMode('idle')}
        />
      )}

      {mode === 'declining' && (
        <Confirm
          tone="rose"
          title="Decline this quote?"
          body="Your strategist will close the request. You can request something different anytime."
          confirmLabel="Decline"
          submitting={submitting}
          onConfirm={() => respond('decline')}
          onCancel={() => setMode('idle')}
          optionalMessage={{ value: message, set: setMessage, placeholder: 'Optional: tell us why (helps us scope better next time).' }}
        />
      )}

      {!canRespond && (
        <div className="mt-6 rounded-xl border bg-bg-2/40 px-4 py-3 text-[13px] text-ink-3 leading-relaxed" style={{ borderColor: 'var(--db-border, #e5e5e5)' }}>
          {quote.status === 'approved' && 'You approved this quote. Work is in progress.'}
          {quote.status === 'declined' && 'You declined this quote.'}
          {quote.status === 'expired' && 'This quote expired without a response.'}
        </div>
      )}
    </div>
  )
}

function Confirm({
  tone, title, body, confirmLabel, submitting, onConfirm, onCancel, optionalMessage,
}: {
  tone: 'emerald' | 'rose' | 'sky'
  title: string; body: string; confirmLabel: string
  submitting: boolean
  onConfirm: () => void; onCancel: () => void
  optionalMessage?: { value: string; set: (s: string) => void; placeholder: string }
}) {
  const bg = tone === 'emerald' ? 'from-emerald-50/60 via-white to-white border-emerald-100' :
             tone === 'rose'    ? 'from-rose-50/60 via-white to-white border-rose-100' :
                                  'from-sky-50/60 via-white to-white border-sky-100'
  const btn = tone === 'emerald' ? 'bg-emerald-600 hover:bg-emerald-700' :
              tone === 'rose'    ? 'bg-rose-600 hover:bg-rose-700' :
                                   'bg-sky-600 hover:bg-sky-700'
  return (
    <div className={`mt-6 rounded-2xl bg-gradient-to-br border ${bg} p-5`}>
      <p className="text-[15px] font-semibold text-ink leading-snug">{title}</p>
      <p className="text-[13px] text-ink-2 mt-1 leading-relaxed">{body}</p>
      {optionalMessage && (
        <textarea
          value={optionalMessage.value}
          onChange={(e) => optionalMessage.set(e.target.value)}
          rows={3}
          placeholder={optionalMessage.placeholder}
          className="w-full mt-3 rounded-xl border bg-white p-3 text-[13px] text-ink leading-relaxed placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-rose-400 resize-none"
          style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
        />
      )}
      <div className="flex flex-wrap items-center gap-2 mt-4">
        <button
          onClick={onConfirm}
          disabled={submitting}
          className={`inline-flex items-center gap-1.5 text-[13px] font-semibold ${btn} disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-full px-4 py-2 transition-colors`}
        >
          {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
          {confirmLabel}
        </button>
        <button
          onClick={onCancel}
          disabled={submitting}
          className="text-[13px] font-medium text-ink-3 hover:text-ink rounded-full px-3 py-2"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function RespondForm({
  tone, title, placeholder, confirmLabel, message, setMessage, submitting, onConfirm, onCancel,
}: {
  tone: 'sky' | 'emerald'
  title: string; placeholder: string; confirmLabel: string
  message: string; setMessage: (s: string) => void
  submitting: boolean
  onConfirm: () => void; onCancel: () => void
}) {
  const bg = tone === 'emerald' ? 'from-emerald-50/60 via-white to-white border-emerald-100' :
                                  'from-sky-50/60 via-white to-white border-sky-100'
  const btn = tone === 'emerald' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-sky-600 hover:bg-sky-700'
  return (
    <div className={`mt-6 rounded-2xl bg-gradient-to-br border ${bg} p-5`}>
      <p className="text-[15px] font-semibold text-ink leading-snug">{title}</p>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={4}
        placeholder={placeholder}
        autoFocus
        className="w-full mt-3 rounded-xl border bg-white p-3 text-[14px] text-ink leading-relaxed placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-sky-400 resize-none"
        style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
      />
      <div className="flex flex-wrap items-center gap-2 mt-4">
        <button
          onClick={onConfirm}
          disabled={submitting}
          className={`inline-flex items-center gap-1.5 text-[13px] font-semibold ${btn} disabled:opacity-50 text-white rounded-full px-4 py-2 transition-colors`}
        >
          {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
          {confirmLabel}
        </button>
        <button
          onClick={onCancel}
          disabled={submitting}
          className="text-[13px] font-medium text-ink-3 hover:text-ink rounded-full px-3 py-2"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function relativeShort(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.round(ms / 60000)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 30) return `${d}d ago`
  return new Date(iso).toLocaleDateString()
}
