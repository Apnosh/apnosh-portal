'use client'

/**
 * Strategist-facing quote builder.
 *
 * - Title (free text)
 * - Source summary (auto-filled from the request task)
 * - Line items: add/remove rows; each row label + qty + unit_price.
 *   Row total + subtotal + total compute automatically.
 * - Optional discount + estimated turnaround days
 * - Strategist message (the pitch to the client)
 * - "Save draft" or "Send to client" CTA
 */

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, Trash2, Loader2, Send, FileText, Check, Sparkles, Wand2,
  AlertTriangle, CheckCircle2,
} from 'lucide-react'

interface LineItem {
  id: string
  label: string
  qty: number
  unitPrice: number
  notes: string
}

export interface PricingPreset {
  label: string
  qty: number
  unitPrice: number
  category?: string
}

interface AiAnalysisShape {
  recommendedAction?: 'in_plan' | 'quote' | 'escalate'
  confidence?: number
  reasoning?: string
  suggestedQuote?: {
    title?: string
    lineItems?: Array<{ label: string; qty: number; unitPrice: number; total: number; notes?: string }>
    strategistMessage?: string
    estimatedTurnaroundDays?: number
  }
}

interface Props {
  clientId: string
  clientSlug: string
  sourceRequestId: string | null
  prefilledTitle: string
  prefilledSourceSummary: string
  /** Pulled from the active pricing_rubric on the server. */
  presets: PricingPreset[]
  /** Optional AI-generated suggestion from the request submission. */
  aiAnalysis: Record<string, unknown> | null
}

export default function QuoteBuilder({
  clientId, clientSlug, sourceRequestId, prefilledTitle, prefilledSourceSummary, presets, aiAnalysis,
}: Props) {
  const ai = aiAnalysis as AiAnalysisShape | null
  const hasAiQuote = ai?.recommendedAction === 'quote' && (ai.suggestedQuote?.lineItems?.length ?? 0) > 0
  const router = useRouter()
  const [title, setTitle] = useState(prefilledTitle || '')
  const [sourceSummary, setSourceSummary] = useState(prefilledSourceSummary || '')
  const [items, setItems] = useState<LineItem[]>([
    { id: rnd(), label: '', qty: 1, unitPrice: 0, notes: '' },
  ])
  const [discount, setDiscount] = useState<string>('')
  const [turnaround, setTurnaround] = useState<string>('5')
  const [strategistMessage, setStrategistMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { subtotal, total, validItemCount } = useMemo(() => {
    let sub = 0
    let n = 0
    for (const it of items) {
      const lineTotal = (it.qty || 0) * (it.unitPrice || 0)
      if (it.label.trim() && lineTotal > 0) {
        n++
        sub += lineTotal
      }
    }
    const d = discount ? Number(discount) : 0
    return { subtotal: sub, total: Math.max(0, sub - d), validItemCount: n }
  }, [items, discount])

  const canSend = title.trim().length >= 2 && validItemCount >= 1 && total > 0 && !submitting

  function addItem(preset?: { label: string; qty: number; unitPrice: number }) {
    setItems(p => [...p, {
      id: rnd(),
      label: preset?.label ?? '',
      qty: preset?.qty ?? 1,
      unitPrice: preset?.unitPrice ?? 0,
      notes: '',
    }])
  }

  function updateItem(id: string, patch: Partial<LineItem>) {
    setItems(p => p.map(it => it.id === id ? { ...it, ...patch } : it))
  }

  function removeItem(id: string) {
    setItems(p => p.length > 1 ? p.filter(it => it.id !== id) : p)
  }

  async function send(asDraft: boolean) {
    if (!asDraft && !canSend) return
    setSubmitting(true)
    setError(null)
    try {
      const lineItems = items
        .filter(it => it.label.trim() && (it.qty * it.unitPrice) > 0)
        .map(it => ({
          label: it.label.trim(),
          qty: it.qty,
          unit_price: it.unitPrice,
          total: it.qty * it.unitPrice,
          ...(it.notes.trim() ? { notes: it.notes.trim() } : {}),
        }))

      const res = await fetch('/api/admin/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          sourceRequestId,
          sourceRequestSummary: sourceSummary.trim() || null,
          title: title.trim(),
          lineItems,
          subtotal,
          discount: discount ? Number(discount) : 0,
          total,
          estimatedTurnaroundDays: turnaround ? Number(turnaround) : null,
          strategistMessage: strategistMessage.trim() || null,
          status: asDraft ? 'draft' : 'sent',
        }),
      })
      if (!res.ok) {
        const t = await res.text()
        throw new Error(t || `Server returned ${res.status}`)
      }
      const data: { id: string } = await res.json()
      setSubmitted(true)
      // Brief success state then bounce to the admin client page.
      setTimeout(() => {
        router.push(`/admin/clients/${clientSlug}/quotes`)
      }, 1500)
      void data
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not send. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="rounded-3xl border bg-gradient-to-br from-emerald-50/60 via-white to-white p-10 text-center" style={{ borderColor: 'var(--db-border, #e8efe9)' }}>
        <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200 flex items-center justify-center mb-4">
          <Check className="w-6 h-6" strokeWidth={2.5} />
        </div>
        <h2 className="text-[20px] font-bold text-ink">Quote sent</h2>
        <p className="text-[13px] text-ink-2 mt-2">Redirecting…</p>
      </div>
    )
  }

  function applyAiSuggestion() {
    if (!ai?.suggestedQuote) return
    const sq = ai.suggestedQuote
    if (sq.title) setTitle(sq.title)
    if (sq.strategistMessage) setStrategistMessage(sq.strategistMessage)
    if (sq.estimatedTurnaroundDays) setTurnaround(String(sq.estimatedTurnaroundDays))
    if (sq.lineItems && sq.lineItems.length > 0) {
      setItems(sq.lineItems.map(it => ({
        id: rnd(),
        label: it.label ?? '',
        qty: it.qty ?? 1,
        unitPrice: it.unitPrice ?? 0,
        notes: it.notes ?? '',
      })))
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
      {/* Form */}
      <section className="space-y-6">
        {/* AI suggestion banner */}
        {ai && (
          <AiBanner
            analysis={ai}
            hasQuote={!!hasAiQuote}
            onApply={applyAiSuggestion}
          />
        )}
        <Field label="Title" hint="Short headline the client sees on the hub.">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Kimchi burger reel"
            className="w-full rounded-xl border bg-white px-4 py-2.5 text-[14px] text-ink focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400"
            style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
          />
        </Field>

        <Field label="What's being scoped" hint="What did the client ask for? They'll see this on the quote.">
          <textarea
            value={sourceSummary}
            onChange={(e) => setSourceSummary(e.target.value)}
            rows={3}
            placeholder="Owner wants a 30s reel of the new kimchi burger — kitchen prep + final shot."
            className="w-full rounded-xl border bg-white px-4 py-2.5 text-[13px] text-ink leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400 resize-none"
            style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
          />
        </Field>

        {/* Line items */}
        <div>
          <div className="flex items-baseline justify-between mb-2">
            <label className="text-[13px] font-semibold text-ink">Line items</label>
            <p className="text-[11px] text-ink-4">Qty × unit price · click presets below to add quickly</p>
          </div>
          <div className="space-y-2 mb-3">
            {items.map(it => {
              const lineTotal = it.qty * it.unitPrice
              return (
                <div
                  key={it.id}
                  className="rounded-xl border bg-white p-3"
                  style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
                >
                  <div className="flex items-start gap-2">
                    <input
                      type="text"
                      value={it.label}
                      onChange={(e) => updateItem(it.id, { label: e.target.value })}
                      placeholder="Line item label"
                      className="flex-1 min-w-0 text-[14px] text-ink bg-transparent focus:outline-none placeholder:text-ink-4"
                    />
                    <input
                      type="number"
                      min={1}
                      value={it.qty || ''}
                      onChange={(e) => updateItem(it.id, { qty: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                      className="w-14 text-right text-[13px] text-ink tabular-nums bg-bg-2/40 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ink-5"
                    />
                    <span className="text-[12px] text-ink-4 self-center">×</span>
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-4 text-[12px]">$</span>
                      <input
                        type="number"
                        min={0}
                        value={it.unitPrice || ''}
                        onChange={(e) => updateItem(it.id, { unitPrice: Math.max(0, Number(e.target.value)) })}
                        className="w-24 pl-5 text-right text-[13px] text-ink tabular-nums bg-bg-2/40 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ink-5"
                      />
                    </div>
                    <span className="text-[14px] font-bold text-ink tabular-nums w-20 text-right tabular-nums">
                      ${lineTotal.toFixed(0)}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeItem(it.id)}
                      disabled={items.length === 1}
                      className="p-1 text-ink-4 hover:text-rose-700 disabled:opacity-30"
                      aria-label="Remove line item"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <input
                    type="text"
                    value={it.notes}
                    onChange={(e) => updateItem(it.id, { notes: e.target.value })}
                    placeholder="Optional note (e.g. 'includes color grading')"
                    className="w-full mt-2 text-[11px] text-ink-3 bg-transparent focus:outline-none placeholder:text-ink-4"
                  />
                </div>
              )
            })}
          </div>

          <button
            type="button"
            onClick={() => addItem()}
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-2 hover:text-ink border border-dashed border-ink-5 hover:border-ink-3 rounded-full px-3 py-1.5 transition-colors"
          >
            <Plus className="w-3 h-3" />
            Add line item
          </button>

          {/* Quick-add presets */}
          <div className="mt-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-4 mb-1.5 inline-flex items-center gap-1">
              <Sparkles className="w-2.5 h-2.5" />
              Quick presets
            </p>
            <div className="flex flex-wrap gap-1.5">
              {presets.map(p => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => addItem(p)}
                  className="text-[11px] bg-bg-2/60 hover:bg-bg-2 text-ink-2 hover:text-ink rounded-full px-2.5 py-1 transition-colors"
                >
                  {p.label} · ${p.unitPrice}
                </button>
              ))}
            </div>
          </div>
        </div>

        <Field label="Strategist message (optional)" hint="Pitch the work. The client sees this above the line items.">
          <textarea
            value={strategistMessage}
            onChange={(e) => setStrategistMessage(e.target.value)}
            rows={3}
            placeholder="This will need a half-day shoot to get the kitchen prep B-roll plus the final hero shot. I'm pricing the edit at 5 days because the color match between locations takes time."
            className="w-full rounded-xl border bg-white px-4 py-2.5 text-[13px] text-ink leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400 resize-none"
            style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Discount" hint="Subtracted from subtotal.">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3 text-[14px]">$</span>
              <input
                type="number"
                min={0}
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                placeholder="0"
                className="w-full rounded-xl border bg-white pl-7 pr-3 py-2 text-[14px] text-ink tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400"
                style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
              />
            </div>
          </Field>
          <Field label="Turnaround" hint="Days after approval.">
            <div className="relative">
              <input
                type="number"
                min={1}
                value={turnaround}
                onChange={(e) => setTurnaround(e.target.value)}
                placeholder="5"
                className="w-full rounded-xl border bg-white pl-3 pr-12 py-2 text-[14px] text-ink tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400"
                style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-4 text-[11px]">days</span>
            </div>
          </Field>
        </div>

        {error && (
          <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-[13px] text-rose-700">
            {error}
          </div>
        )}
      </section>

      {/* Sticky summary */}
      <aside>
        <div
          className="sticky top-6 rounded-2xl border bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.08)]"
          style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
        >
          <div className="flex items-center gap-2 mb-3">
            <FileText className="w-4 h-4 text-amber-700" />
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-3">
              Quote summary
            </p>
          </div>

          <div className="space-y-1.5 text-[12px] text-ink-3 mb-3">
            <Row label="Items" value={`${validItemCount}`} />
            <Row label="Subtotal" value={`$${subtotal.toFixed(0)}`} />
            {Number(discount) > 0 && <Row label="Discount" value={`−$${Number(discount).toFixed(0)}`} tone="emerald" />}
          </div>

          <div className="pt-3 border-t mb-4" style={{ borderColor: 'var(--db-border, #e5e5e5)' }}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-3 mb-1">Total</p>
            <p className="text-[28px] font-bold text-ink tabular-nums leading-none">
              ${total.toFixed(0)}
            </p>
          </div>

          <button
            onClick={() => send(false)}
            disabled={!canSend}
            className="w-full inline-flex items-center justify-center gap-2 text-[13px] font-semibold bg-emerald-600 hover:bg-emerald-700 disabled:bg-ink-6 disabled:cursor-not-allowed text-white rounded-full px-4 py-2.5 transition-colors"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Send to client
          </button>
          <button
            onClick={() => send(true)}
            disabled={!title.trim() || submitting}
            className="w-full mt-2 inline-flex items-center justify-center text-[12px] font-medium text-ink-3 hover:text-ink py-2 transition-colors disabled:opacity-50"
          >
            Save as draft
          </button>
          <p className="text-[10px] text-ink-4 mt-2 text-center leading-snug">
            Client sees this on their social hub and can approve, ask for changes, or decline.
          </p>
        </div>
      </aside>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2 gap-2">
        <label className="text-[13px] font-semibold text-ink">{label}</label>
        {hint && <p className="text-[11px] text-ink-4 text-right max-w-md">{hint}</p>}
      </div>
      {children}
    </div>
  )
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'emerald' }) {
  return (
    <div className="flex items-center justify-between">
      <span>{label}</span>
      <span className={`tabular-nums ${tone === 'emerald' ? 'text-emerald-700' : 'text-ink-2'}`}>{value}</span>
    </div>
  )
}

function rnd(): string {
  return Math.random().toString(36).slice(2, 9)
}

function AiBanner({
  analysis, hasQuote, onApply,
}: {
  analysis: AiAnalysisShape
  hasQuote: boolean
  onApply: () => void
}) {
  const conf = Math.round((analysis.confidence ?? 0) * 100)
  const action = analysis.recommendedAction ?? 'quote'

  if (action === 'in_plan') {
    return (
      <div className="rounded-2xl border bg-gradient-to-br from-emerald-50/60 via-white to-white p-4" style={{ borderColor: 'var(--db-border, #d3e6db)' }}>
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200/60 flex-shrink-0">
            <CheckCircle2 className="w-4.5 h-4.5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-700 leading-none">
                AI says: in-plan
              </p>
              <span className="text-[10px] text-emerald-700/70 tabular-nums">{conf}% confidence</span>
            </div>
            <p className="text-[13px] text-ink mt-1.5 leading-snug">
              {analysis.reasoning || 'Standard request that fits the monthly plan.'}
            </p>
            <p className="text-[11px] text-ink-3 mt-2 leading-snug">
              If you agree, you can skip this quote, mark the task as doing on /admin/today,
              and start producing. Or build a quote anyway if you want to scope it.
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (action === 'escalate') {
    return (
      <div className="rounded-2xl border bg-gradient-to-br from-rose-50/60 via-white to-white p-4" style={{ borderColor: 'var(--db-border, #f0d3d3)' }}>
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-rose-100 text-rose-700 ring-1 ring-rose-200/60 flex-shrink-0">
            <AlertTriangle className="w-4.5 h-4.5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-rose-700 leading-none">
                AI says: needs your eyes
              </p>
              <span className="text-[10px] text-rose-700/70 tabular-nums">{conf}% confidence</span>
            </div>
            <p className="text-[13px] text-ink mt-1.5 leading-snug">
              {analysis.reasoning || 'This one doesn\'t fit a standard pattern.'}
            </p>
            <p className="text-[11px] text-ink-3 mt-2 leading-snug">
              No suggested quote — read the request, scope it manually, and price it.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // 'quote'
  const sq = analysis.suggestedQuote
  const total = sq?.lineItems?.reduce((s, i) => s + (i.total || 0), 0) ?? 0
  return (
    <div className="rounded-2xl border bg-gradient-to-br from-amber-50/60 via-white to-white p-4" style={{ borderColor: 'var(--db-border, #f0e6d6)' }}>
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-amber-100 text-amber-700 ring-1 ring-amber-200/60 flex-shrink-0">
          <Sparkles className="w-4.5 h-4.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-700 leading-none">
              AI-drafted quote
            </p>
            <span className="text-[10px] text-amber-700/70 tabular-nums">{conf}% confidence</span>
            {hasQuote && (
              <span className="text-[13px] font-bold text-ink tabular-nums">
                ${total.toFixed(0)}
              </span>
            )}
          </div>
          <p className="text-[13px] text-ink mt-1.5 leading-snug">
            {analysis.reasoning || 'Quote suggestion drafted from the request.'}
          </p>
          {sq?.lineItems && sq.lineItems.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {sq.lineItems.map((it, i) => (
                <li key={i} className="text-[11px] text-ink-3 flex items-center justify-between gap-3">
                  <span className="truncate">{it.label}</span>
                  <span className="tabular-nums flex-shrink-0">
                    {it.qty} × ${it.unitPrice} = ${it.total}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {hasQuote && (
            <button
              type="button"
              onClick={onApply}
              className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-full px-3 py-1.5 transition-colors"
            >
              <Wand2 className="w-3 h-3" />
              Apply AI suggestion
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
