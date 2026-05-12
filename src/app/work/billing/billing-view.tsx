/**
 * Finance ops view. Top: $$ summary cards. Tabs: Overdue, Open, Paid.
 * Below: per-client usage table with an "AI tier fit" button per row
 * that drafts a renewal-conversation pitch grounded in usage + facts.
 */

'use client'

import { useState, useCallback } from 'react'
import {
  Receipt, AlertCircle, CheckCircle2, Clock, ExternalLink,
  Sparkles, Loader2, TrendingUp, TrendingDown, Minus,
} from 'lucide-react'
import type { BillingData, InvoiceRow, ClientUsageRow } from '@/lib/work/get-billing-queue'

interface Props { initialData: BillingData }

type Tab = 'overdue' | 'open' | 'paid'

export default function BillingView({ initialData }: Props) {
  const [data] = useState<BillingData>(initialData)
  const [tab, setTab] = useState<Tab>(initialData.invoices.overdue.length > 0 ? 'overdue' : 'open')

  const tabs: Array<{ key: Tab; label: string; count: number; tone: string }> = [
    { key: 'overdue', label: 'Overdue', count: data.invoices.overdue.length, tone: 'red' },
    { key: 'open',    label: 'Open',    count: data.invoices.open.length,    tone: 'amber' },
    { key: 'paid',    label: 'Paid 30d', count: data.invoices.paid.length,    tone: 'emerald' },
  ]

  const activeList = tab === 'overdue' ? data.invoices.overdue
    : tab === 'open' ? data.invoices.open
    : data.invoices.paid

  return (
    <div className="max-w-5xl mx-auto py-7 px-4 lg:px-6 space-y-6">
      <header>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
            <Receipt className="w-4.5 h-4.5" />
          </div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-3 leading-none">
            Finance
          </p>
        </div>
        <h1 className="text-[26px] sm:text-[28px] leading-tight font-bold text-ink tracking-tight">
          Billing
        </h1>
        <p className="text-[13px] text-ink-2 mt-1.5 leading-relaxed max-w-2xl">
          Overdue first. Per-client usage below shows whether they&rsquo;re paying for what they&rsquo;re using.
        </p>
      </header>

      {/* Summary cards */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard label="Overdue" amount={data.totals.overdueCents} count={data.totals.overdueCount} tone="red" />
        <SummaryCard label="Open" amount={data.totals.openCents} tone="amber" />
        <SummaryCard label="Paid 30d" amount={data.totals.paid30dCents} tone="emerald" />
        <SummaryCard label="Active clients" amount={null} customValue={String(data.clientUsage.length)} tone="ink" />
      </section>

      {/* Invoice tabs + list */}
      <section className="bg-white rounded-2xl ring-1 ring-ink-6/60 p-5">
        <div className="flex items-center gap-1 mb-4 border-b border-ink-6">
          {tabs.map(t => {
            const isActive = tab === t.key
            const activeBorder = t.tone === 'red' ? 'border-red-600' : t.tone === 'amber' ? 'border-amber-600' : 'border-emerald-600'
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`px-3 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors ${
                  isActive ? `${activeBorder} text-ink` : 'border-transparent text-ink-3 hover:text-ink'
                }`}>
                {t.label} <span className="ml-1 text-[11px] text-ink-4">{t.count}</span>
              </button>
            )
          })}
        </div>

        {activeList.length === 0 ? (
          <p className="text-[13px] text-ink-3 italic py-4 text-center">Nothing in this rail.</p>
        ) : (
          <ul className="divide-y divide-ink-6/40">
            {activeList.map(inv => <InvoiceRowEl key={inv.id} inv={inv} />)}
          </ul>
        )}
      </section>

      {/* Per-client usage */}
      <section className="bg-white rounded-2xl ring-1 ring-ink-6/60 p-5">
        <h2 className="text-[16px] font-bold text-ink leading-tight mb-1">Per-client usage — last 30 days</h2>
        <p className="text-[12px] text-ink-3 mb-3">
          What each client is actually using vs what they&rsquo;re paying. Hit <strong>Tier fit</strong> for an AI pitch.
        </p>
        {data.clientUsage.length === 0 ? (
          <p className="text-[13px] text-ink-3 italic py-3">No active clients.</p>
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-ink-3 border-b border-ink-6">
                  <th className="text-left font-semibold px-2 py-1.5">Client</th>
                  <th className="text-left font-semibold px-2 py-1.5">Tier</th>
                  <th className="text-right font-semibold px-2 py-1.5">Rate</th>
                  <th className="text-right font-semibold px-2 py-1.5">Drafts</th>
                  <th className="text-right font-semibold px-2 py-1.5">Pub</th>
                  <th className="text-right font-semibold px-2 py-1.5">Eng</th>
                  <th className="text-right font-semibold px-2 py-1.5">Replies</th>
                  <th className="text-right font-semibold px-2 py-1.5">Reviews</th>
                  <th className="text-right font-semibold px-2 py-1.5">Email</th>
                  <th className="text-right font-semibold px-2 py-1.5">Unpaid</th>
                  <th className="text-right font-semibold px-2 py-1.5"></th>
                </tr>
              </thead>
              <tbody>
                {data.clientUsage.map(c => <ClientUsageRowEl key={c.clientId} c={c} />)}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Bits
// ─────────────────────────────────────────────────────────────

function SummaryCard({ label, amount, count, tone, customValue }: { label: string; amount: number | null; count?: number; tone: 'red'|'amber'|'emerald'|'ink'; customValue?: string }) {
  const colorMap = {
    red: { bg: 'bg-red-50 text-red-800 ring-red-100', accent: 'text-red-700' },
    amber: { bg: 'bg-amber-50 text-amber-800 ring-amber-100', accent: 'text-amber-700' },
    emerald: { bg: 'bg-emerald-50 text-emerald-800 ring-emerald-100', accent: 'text-emerald-700' },
    ink: { bg: 'bg-ink-7 text-ink ring-ink-6', accent: 'text-ink' },
  }
  const m = colorMap[tone]
  const value = customValue ?? (amount !== null ? `$${(amount / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—')
  return (
    <div className="bg-white rounded-xl ring-1 ring-ink-6/60 p-3">
      <p className={`text-[10px] font-semibold uppercase tracking-wider ${m.accent} mb-0.5`}>{label}</p>
      <p className="text-[22px] font-bold text-ink leading-none">{value}</p>
      {count !== undefined && <p className="text-[11px] text-ink-4 mt-1">{count} invoice{count === 1 ? '' : 's'}</p>}
    </div>
  )
}

function InvoiceRowEl({ inv }: { inv: InvoiceRow }) {
  const due = inv.dueAt ? new Date(inv.dueAt) : null
  return (
    <li className="py-2.5 flex items-center gap-3 text-[12px]">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-semibold text-ink truncate">{inv.clientName ?? inv.clientId.slice(0, 6)}</span>
          {inv.invoiceNumber && <span className="text-ink-4 text-[10px]">{inv.invoiceNumber}</span>}
          {inv.isOverdue && inv.daysOverdue !== null && (
            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-50 text-red-800 ring-1 ring-red-100">
              {inv.daysOverdue}d overdue
            </span>
          )}
        </div>
        <p className="text-[11px] text-ink-3 truncate">
          {inv.description ?? `${inv.status} · due ${due ? due.toLocaleDateString() : '—'}`}
        </p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="font-semibold text-ink">${(inv.totalCents / 100).toLocaleString()}</p>
        {inv.status === 'paid' && inv.paidAt && (
          <p className="text-[10px] text-emerald-700 inline-flex items-center gap-0.5">
            <CheckCircle2 className="w-3 h-3" /> {new Date(inv.paidAt).toLocaleDateString()}
          </p>
        )}
        {inv.status !== 'paid' && (
          <p className="text-[10px] text-ink-4 inline-flex items-center gap-0.5">
            <Clock className="w-3 h-3" /> {due ? due.toLocaleDateString() : 'no due date'}
          </p>
        )}
      </div>
      {inv.hostedUrl && (
        <a href={inv.hostedUrl} target="_blank" rel="noopener noreferrer" className="text-ink-4 hover:text-ink-2 flex-shrink-0">
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      )}
    </li>
  )
}

interface TierFit {
  verdict: 'upsell' | 'downsell' | 'hold' | 'churn_risk'
  one_liner: string
  pitch: string
  why: string
}

function ClientUsageRowEl({ c }: { c: ClientUsageRow }) {
  const [fit, setFit] = useState<TierFit | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const analyze = useCallback(async () => {
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/work/billing/tier-fit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clientId: c.clientId }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? `HTTP ${res.status}`)
      }
      const j = await res.json()
      setFit(j.fit as TierFit)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }, [c.clientId])

  const verdictMap: Record<TierFit['verdict'], { Icon: React.ComponentType<{ className?: string }>; bg: string; label: string }> = {
    upsell:      { Icon: TrendingUp,   bg: 'bg-emerald-50 ring-emerald-100 text-emerald-900', label: 'UPSELL' },
    downsell:    { Icon: TrendingDown, bg: 'bg-amber-50 ring-amber-100 text-amber-900',         label: 'DOWNSELL' },
    hold:        { Icon: Minus,        bg: 'bg-ink-7 ring-ink-6 text-ink',                     label: 'HOLD' },
    churn_risk:  { Icon: AlertCircle,  bg: 'bg-red-50 ring-red-100 text-red-900',               label: 'CHURN RISK' },
  }

  return (
    <>
      <tr className="border-b border-ink-6/30">
        <td className="px-2 py-2 font-medium text-ink truncate max-w-[160px]">{c.clientName}</td>
        <td className="px-2 py-2 text-ink-2">{c.tier}</td>
        <td className="px-2 py-2 text-right text-ink-2">{c.monthlyRateCents !== null ? `$${(c.monthlyRateCents / 100).toLocaleString()}` : '—'}</td>
        <td className="px-2 py-2 text-right text-ink-2">{c.draftsCreated}</td>
        <td className="px-2 py-2 text-right text-ink-2">{c.postsPublished}</td>
        <td className="px-2 py-2 text-right text-ink-2">{fmt(c.totalEngagement)}</td>
        <td className="px-2 py-2 text-right text-ink-2">{c.repliesSent}</td>
        <td className="px-2 py-2 text-right text-ink-2">{c.reviewsAnswered}</td>
        <td className="px-2 py-2 text-right text-ink-2">{c.campaignsSent}</td>
        <td className={`px-2 py-2 text-right ${c.unpaidCents > 0 ? 'text-red-700 font-semibold' : 'text-ink-4'}`}>
          {c.unpaidCents > 0 ? `$${(c.unpaidCents / 100).toLocaleString()}` : '—'}
        </td>
        <td className="px-2 py-2 text-right">
          <button onClick={analyze} disabled={busy}
            className="text-[11px] font-medium px-2 py-1 rounded ring-1 ring-emerald-200 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 inline-flex items-center gap-1">
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            Tier fit
          </button>
        </td>
      </tr>
      {(fit || error) && (
        <tr>
          <td colSpan={11} className="px-2 pb-3">
            {error && (
              <div className="rounded-lg bg-red-50 ring-1 ring-red-100 p-3 text-[12px] text-red-700 inline-flex items-start gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
            {fit && (() => {
              const v = verdictMap[fit.verdict] ?? verdictMap.hold
              return (
                <div className={`rounded-lg ring-1 p-3 ${v.bg}`}>
                  <p className="text-[10px] font-bold uppercase tracking-wider mb-1 inline-flex items-center gap-1">
                    <v.Icon className="w-3 h-3" /> {v.label}
                  </p>
                  <p className="text-[13px] font-semibold mb-1 text-ink">{fit.one_liner}</p>
                  <p className="text-[12px] text-ink-2 leading-relaxed mb-1.5">{fit.pitch}</p>
                  <p className="text-[11px] italic opacity-75">{fit.why}</p>
                </div>
              )
            })()}
          </td>
        </tr>
      )}
    </>
  )
}

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k'
  return String(n)
}
