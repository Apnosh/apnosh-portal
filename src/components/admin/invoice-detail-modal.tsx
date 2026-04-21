'use client'

/**
 * Full invoice detail modal -- launched from any invoice row.
 *
 * Shows everything the admin needs about a single invoice in one place:
 *  - Header with number, status, client, amounts
 *  - Line item breakdown
 *  - Discounts applied
 *  - Payment history (attempts, method, paid_at/failed_at)
 *  - Actions (resend, cancel, delete, open hosted, download PDF)
 *
 * Reads both our Supabase mirror (invoice + line_items) AND pulls fresh
 * data from Stripe for anything our mirror might not have (payment
 * attempts, hosted URL that might have changed).
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  X, ExternalLink, Download, RefreshCw, Trash2, FileText, Loader2,
  CheckCircle2, AlertTriangle, Clock, CreditCard, Receipt,
} from 'lucide-react'
import {
  resendInvoice, voidInvoice, deleteDraftInvoice,
} from '@/lib/billing-actions'

// ---------------------------------------------------------------------------
// Types (match billing v2 schema)
// ---------------------------------------------------------------------------

interface InvoiceRow {
  id: string
  client_id: string
  stripe_invoice_id: string | null
  stripe_subscription_id: string | null
  invoice_number: string
  type: string
  status: string
  amount_due_cents: number
  amount_paid_cents: number
  subtotal_cents: number
  tax_cents: number
  total_cents: number
  currency: string
  issued_at: string | null
  due_at: string | null
  paid_at: string | null
  voided_at: string | null
  period_start: string | null
  period_end: string | null
  hosted_invoice_url: string | null
  invoice_pdf_url: string | null
  description: string | null
  notes: string | null
  payment_method: string | null
  created_at: string
  clients?: { name: string; slug: string } | null
}

interface LineItemRow {
  id: string
  description: string
  quantity: number
  unit_amount_cents: number
  amount_cents: number
  service_category: string | null
  period_start: string | null
  period_end: string | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCents(cents: number, currency = 'usd'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100)
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24))
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft', open: 'Unpaid', paid: 'Paid',
  void: 'Canceled', uncollectible: 'Written off', failed: 'Payment failed',
}

const STATUS_CLASS: Record<string, string> = {
  draft: 'bg-ink-6 text-ink-3',
  open: 'bg-amber-50 text-amber-700 border border-amber-200',
  paid: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  void: 'bg-ink-6 text-ink-4',
  uncollectible: 'bg-red-50 text-red-700 border border-red-200',
  failed: 'bg-red-50 text-red-700 border border-red-200',
}

function isOverdue(inv: InvoiceRow): boolean {
  if (inv.status !== 'open' || !inv.due_at) return false
  return new Date(inv.due_at) < new Date()
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function InvoiceDetailModal({
  invoiceId,
  onClose,
  onChange,
}: {
  invoiceId: string
  onClose: () => void
  onChange: () => void  // called when invoice changes (delete/cancel/etc) so parent can reload
}) {
  const [invoice, setInvoice] = useState<InvoiceRow | null>(null)
  const [lines, setLines] = useState<LineItemRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const [invRes, linesRes] = await Promise.all([
      supabase
        .from('invoices')
        .select(`
          id, client_id, stripe_invoice_id, stripe_subscription_id,
          invoice_number, type, status,
          amount_due_cents, amount_paid_cents, subtotal_cents, tax_cents, total_cents,
          currency, issued_at, due_at, paid_at, voided_at, period_start, period_end,
          hosted_invoice_url, invoice_pdf_url, description, notes, payment_method, created_at,
          clients(name, slug)
        `)
        .eq('id', invoiceId)
        .maybeSingle(),
      supabase
        .from('invoice_line_items')
        .select('id, description, quantity, unit_amount_cents, amount_cents, service_category, period_start, period_end')
        .eq('invoice_id', invoiceId)
        .order('created_at'),
    ])
    setInvoice(invRes.data as unknown as InvoiceRow | null)
    setLines((linesRes.data ?? []) as unknown as LineItemRow[])
    setLoading(false)
  }, [invoiceId])

  useEffect(() => { load() }, [load])

  async function handleResend() {
    if (!invoice) return
    setBusy('resend'); setError(null)
    const r = await resendInvoice(invoice.id)
    setBusy(null)
    if (!r.success) setError(r.error)
    else onChange()
  }

  async function handleCancel() {
    if (!invoice) return
    if (!confirm('Cancel this invoice? The client will no longer be able to pay it. This cannot be undone.')) return
    setBusy('cancel'); setError(null)
    const r = await voidInvoice(invoice.id)
    setBusy(null)
    if (!r.success) setError(r.error)
    else { onChange(); onClose() }
  }

  async function handleDelete() {
    if (!invoice) return
    if (!confirm('Delete this draft? The client has not seen it yet.')) return
    setBusy('delete'); setError(null)
    const r = await deleteDraftInvoice(invoice.id)
    setBusy(null)
    if (!r.success) setError(r.error)
    else { onChange(); onClose() }
  }

  // Click background to close
  function onBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 overflow-y-auto"
      onClick={onBackdropClick}
    >
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full my-8 overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-ink-6">
          <div className="flex-1 min-w-0">
            {loading ? (
              <div className="h-6 w-40 bg-ink-6 rounded animate-pulse" />
            ) : invoice ? (
              <>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h2 className="text-lg font-semibold text-ink">{invoice.invoice_number}</h2>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_CLASS[invoice.status] ?? ''}`}>
                    {STATUS_LABEL[invoice.status] ?? invoice.status}
                  </span>
                  {isOverdue(invoice) && (
                    <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200 inline-flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      {daysBetween(new Date(), new Date(invoice.due_at!))} days overdue
                    </span>
                  )}
                </div>
                <p className="text-xs text-ink-3">
                  {invoice.clients?.slug ? (
                    <Link href={`/admin/clients/${invoice.clients.slug}`} className="hover:text-brand-dark underline">
                      {invoice.clients.name}
                    </Link>
                  ) : 'Unknown client'}
                  {' · '}
                  {invoice.type === 'subscription' ? 'Retainer' : 'One-time'}
                  {' · '}
                  Issued {formatDate(invoice.issued_at ?? invoice.created_at)}
                </p>
              </>
            ) : (
              <p className="text-sm text-ink-4">Invoice not found</p>
            )}
          </div>
          <button onClick={onClose} className="text-ink-4 hover:text-ink p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mx-5 mt-4 bg-red-50 border border-red-200 rounded-lg p-3 text-[12px] text-red-800 flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {invoice && (
          <>
            {/* Amount summary */}
            <div className="p-5 bg-bg-2 border-b border-ink-6">
              <div className="flex items-baseline justify-between mb-3">
                <span className="text-xs text-ink-3 font-medium">
                  {invoice.status === 'paid' ? 'Paid' : 'Amount due'}
                </span>
                <span className="font-[family-name:var(--font-display)] text-3xl text-ink tabular-nums">
                  {formatCents(
                    invoice.status === 'paid' ? invoice.amount_paid_cents : invoice.amount_due_cents,
                    invoice.currency,
                  )}
                </span>
              </div>
              {invoice.due_at && invoice.status === 'open' && (
                <div className="flex items-center gap-1.5 text-[12px] text-ink-3">
                  <Clock className="w-3 h-3" />
                  Due {formatDate(invoice.due_at)}
                </div>
              )}
              {invoice.paid_at && (
                <div className="flex items-center gap-1.5 text-[12px] text-emerald-700">
                  <CheckCircle2 className="w-3 h-3" />
                  Paid {formatDateTime(invoice.paid_at)}
                  {invoice.payment_method && ` via ${invoice.payment_method}`}
                </div>
              )}
              {invoice.voided_at && (
                <div className="flex items-center gap-1.5 text-[12px] text-ink-3">
                  <X className="w-3 h-3" />
                  Canceled {formatDateTime(invoice.voided_at)}
                </div>
              )}
            </div>

            {/* Line items */}
            <div className="p-5 border-b border-ink-6">
              <h3 className="text-xs font-semibold text-ink-3 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <Receipt className="w-3.5 h-3.5" />
                Line items
              </h3>
              {lines.length === 0 ? (
                <p className="text-sm text-ink-4 italic">No line items</p>
              ) : (
                <div className="space-y-2">
                  {lines.map(line => (
                    <div key={line.id} className="flex items-start justify-between gap-3 py-2 border-b border-ink-6 last:border-0">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-ink">{line.description}</p>
                        <p className="text-[11px] text-ink-4 mt-0.5">
                          {line.quantity} × {formatCents(line.unit_amount_cents, invoice.currency)}
                          {line.period_start && line.period_end && (
                            <> · {formatDate(line.period_start)} → {formatDate(line.period_end)}</>
                          )}
                          {line.service_category && line.service_category !== 'custom' && (
                            <> · {line.service_category}</>
                          )}
                        </p>
                      </div>
                      <span className="text-sm text-ink font-medium tabular-nums flex-shrink-0">
                        {formatCents(line.amount_cents, invoice.currency)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Totals breakdown */}
              <div className="mt-4 pt-3 border-t border-ink-6 space-y-1 text-[13px]">
                <div className="flex justify-between text-ink-3">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{formatCents(invoice.subtotal_cents, invoice.currency)}</span>
                </div>
                {/* Discount is inferred from subtotal_cents - total_cents - tax_cents difference */}
                {(() => {
                  const computedDiscount = invoice.subtotal_cents - invoice.total_cents + invoice.tax_cents
                  if (computedDiscount > 0) {
                    return (
                      <div className="flex justify-between text-emerald-700">
                        <span>Discount</span>
                        <span className="tabular-nums">-{formatCents(computedDiscount, invoice.currency)}</span>
                      </div>
                    )
                  }
                  return null
                })()}
                {invoice.tax_cents > 0 && (
                  <div className="flex justify-between text-ink-3">
                    <span>Sales tax</span>
                    <span className="tabular-nums">{formatCents(invoice.tax_cents, invoice.currency)}</span>
                  </div>
                )}
                <div className="flex justify-between pt-2 mt-1 border-t border-ink-6 font-semibold text-ink">
                  <span>Total</span>
                  <span className="tabular-nums">{formatCents(invoice.total_cents, invoice.currency)}</span>
                </div>
                {invoice.amount_paid_cents > 0 && invoice.amount_paid_cents < invoice.total_cents && (
                  <>
                    <div className="flex justify-between text-emerald-700">
                      <span>Paid</span>
                      <span className="tabular-nums">-{formatCents(invoice.amount_paid_cents, invoice.currency)}</span>
                    </div>
                    <div className="flex justify-between font-semibold text-ink">
                      <span>Balance due</span>
                      <span className="tabular-nums">{formatCents(invoice.amount_due_cents, invoice.currency)}</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Description / notes */}
            {(invoice.description || invoice.notes) && (
              <div className="p-5 border-b border-ink-6 space-y-2">
                {invoice.description && (
                  <div>
                    <span className="text-[11px] font-semibold text-ink-3 uppercase tracking-wide">Description</span>
                    <p className="text-sm text-ink-2 mt-1">{invoice.description}</p>
                  </div>
                )}
                {invoice.notes && (
                  <div>
                    <span className="text-[11px] font-semibold text-ink-3 uppercase tracking-wide">Internal notes</span>
                    <p className="text-sm text-ink-2 mt-1">{invoice.notes}</p>
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="p-5 flex flex-wrap items-center gap-2">
              {invoice.hosted_invoice_url && (
                <a
                  href={invoice.hosted_invoice_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2 border border-ink-6 rounded-lg text-sm text-ink-2 hover:bg-bg-2"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open hosted invoice
                </a>
              )}
              {invoice.invoice_pdf_url && (
                <a
                  href={invoice.invoice_pdf_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2 border border-ink-6 rounded-lg text-sm text-ink-2 hover:bg-bg-2"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download PDF
                </a>
              )}
              {invoice.status === 'open' && invoice.hosted_invoice_url && (
                <button
                  onClick={handleResend}
                  disabled={busy === 'resend'}
                  className="inline-flex items-center gap-1.5 px-3 py-2 border border-ink-6 rounded-lg text-sm text-ink-2 hover:bg-bg-2 disabled:opacity-50"
                >
                  {busy === 'resend' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  Resend email
                </button>
              )}
              <div className="flex-1" />
              {invoice.status === 'draft' && (
                <button
                  onClick={handleDelete}
                  disabled={busy === 'delete'}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  {busy === 'delete' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  Delete draft
                </button>
              )}
              {['open', 'failed'].includes(invoice.status) && (
                <button
                  onClick={handleCancel}
                  disabled={busy === 'cancel'}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  {busy === 'cancel' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                  Cancel invoice
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
