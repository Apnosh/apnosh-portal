/**
 * Web team's surface. Two sections:
 *   1. Site health snapshot (uptime + pagespeed + SSL) per client
 *   2. Page drafts — in flight + shipped, with a composer that calls
 *      AI to draft on-voice copy for a chosen page kind.
 */

'use client'

import { useState, useCallback } from 'react'
import {
  Globe, Sparkles, Loader2, AlertCircle, CheckCircle2, Plus, X, ShieldCheck, ShieldAlert, Gauge, Activity,
} from 'lucide-react'
import type { WebData, SiteHealthRow, PageDraftRow } from '@/lib/work/get-web-data'

interface Props { initialData: WebData }

const PAGE_KINDS: Array<{ key: string; label: string }> = [
  { key: 'home_hero', label: 'Home hero' },
  { key: 'about', label: 'About' },
  { key: 'menu_intro', label: 'Menu intro' },
  { key: 'reservation_cta', label: 'Reservation CTA' },
  { key: 'catering', label: 'Catering' },
  { key: 'contact', label: 'Contact' },
  { key: 'press', label: 'Press' },
  { key: 'careers', label: 'Careers' },
  { key: 'other', label: 'Other' },
]

type Tab = 'in_flight' | 'shipped'

export default function WebView({ initialData }: Props) {
  const [data, setData] = useState<WebData>(initialData)
  const [tab, setTab] = useState<Tab>(initialData.drafts.inFlight.length > 0 ? 'in_flight' : 'shipped')
  const [composing, setComposing] = useState(false)

  const onCreated = useCallback((row: PageDraftRow) => {
    setData(prev => ({ ...prev, drafts: { ...prev.drafts, inFlight: [row, ...prev.drafts.inFlight] } }))
    setComposing(false)
    setTab('in_flight')
  }, [])

  const activeList = tab === 'in_flight' ? data.drafts.inFlight : data.drafts.shipped

  return (
    <div className="max-w-5xl mx-auto py-7 px-4 lg:px-6 space-y-6">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-sky-50 text-sky-700 ring-1 ring-sky-100">
              <Globe className="w-4.5 h-4.5" />
            </div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-3 leading-none">
              Web
            </p>
          </div>
          <h1 className="text-[26px] sm:text-[28px] leading-tight font-bold text-ink tracking-tight">
            Site health &amp; page drafts
          </h1>
          <p className="text-[13px] text-ink-2 mt-1.5 leading-relaxed max-w-2xl">
            Per-client uptime + page speed at a glance. AI drafts new page copy in each client&rsquo;s voice.
          </p>
        </div>
        <button onClick={() => setComposing(true)}
          className="text-[12px] font-semibold px-3 py-2 rounded-lg bg-sky-600 text-white hover:bg-sky-700 inline-flex items-center gap-1.5 flex-shrink-0">
          <Plus className="w-3.5 h-3.5" /> New page
        </button>
      </header>

      {/* Health rail */}
      <section className="bg-white rounded-2xl ring-1 ring-ink-6/60 p-5">
        <h2 className="text-[14px] font-bold text-ink mb-3">Site health</h2>
        {data.health.length === 0 ? (
          <p className="text-[13px] text-ink-3 italic py-2">No health data synced yet. Run a check from /admin/web-tools to populate.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.health.map(h => <HealthCard key={h.clientId} row={h} />)}
          </div>
        )}
      </section>

      {composing && (
        <ComposerCard clients={data.clients} onCreated={onCreated} onCancel={() => setComposing(false)} />
      )}

      {/* Drafts */}
      <section className="bg-white rounded-2xl ring-1 ring-ink-6/60 p-5">
        <div className="flex items-center gap-1 mb-4 border-b border-ink-6">
          {[
            { key: 'in_flight' as Tab, label: 'In flight', count: data.drafts.inFlight.length },
            { key: 'shipped' as Tab, label: 'Shipped', count: data.drafts.shipped.length },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-3 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors ${
                tab === t.key ? 'border-sky-600 text-ink' : 'border-transparent text-ink-3 hover:text-ink'
              }`}>
              {t.label}<span className="ml-1.5 text-[11px] text-ink-4">{t.count}</span>
            </button>
          ))}
        </div>

        {activeList.length === 0 ? (
          <p className="text-[13px] text-ink-3 italic py-4 text-center">
            {tab === 'in_flight' ? 'Nothing in flight. Click New page to start.' : 'No shipped pages yet.'}
          </p>
        ) : (
          <ul className="space-y-3">
            {activeList.map(d => <DraftRowEl key={d.id} d={d} />)}
          </ul>
        )}
      </section>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Health card
// ─────────────────────────────────────────────────────────────

function HealthCard({ row }: { row: SiteHealthRow }) {
  const uptimeColor = row.uptimeStatus === 'green' ? 'bg-emerald-500'
    : row.uptimeStatus === 'yellow' ? 'bg-amber-500'
    : row.uptimeStatus === 'red' ? 'bg-red-500'
    : 'bg-ink-5'
  const scoreColor = (score: number | null): string => {
    if (score === null) return 'text-ink-4'
    if (score >= 90) return 'text-emerald-700'
    if (score >= 70) return 'text-amber-700'
    return 'text-red-700'
  }
  return (
    <div className="rounded-xl ring-1 ring-ink-6/60 p-3 bg-white">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[12px] font-semibold text-ink truncate">{row.clientName ?? row.clientId.slice(0, 6)}</p>
        <span className={`w-2 h-2 rounded-full ${uptimeColor}`} title={row.uptimeStatus} />
      </div>
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <Stat icon={Activity} label="Uptime 30d" value={row.uptimePct30d !== null ? `${row.uptimePct30d.toFixed(1)}%` : '—'} valueClass={scoreColor(row.uptimePct30d)} />
        <Stat icon={Gauge} label="PS mobile" value={row.pagespeedMobile !== null ? String(Math.round(row.pagespeedMobile)) : '—'} valueClass={scoreColor(row.pagespeedMobile)} />
        <Stat icon={Gauge} label="PS desktop" value={row.pagespeedDesktop !== null ? String(Math.round(row.pagespeedDesktop)) : '—'} valueClass={scoreColor(row.pagespeedDesktop)} />
        <Stat icon={row.sslValid ? ShieldCheck : ShieldAlert} label="SSL" value={row.sslValid === null ? '—' : row.sslValid ? 'valid' : 'INVALID'} valueClass={row.sslValid === false ? 'text-red-700' : 'text-emerald-700'} />
      </div>
    </div>
  )
}

function Stat({ icon: Icon, label, value, valueClass }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; valueClass: string }) {
  return (
    <div className="rounded-md bg-ink-7/50 px-2 py-1.5">
      <p className="text-[9px] font-semibold uppercase tracking-wider text-ink-3 inline-flex items-center gap-1">
        <Icon className="w-2.5 h-2.5" /> {label}
      </p>
      <p className={`text-[13px] font-semibold ${valueClass}`}>{value}</p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Composer
// ─────────────────────────────────────────────────────────────

function ComposerCard({ clients, onCreated, onCancel }: {
  clients: WebData['clients']
  onCreated: (row: PageDraftRow) => void
  onCancel: () => void
}) {
  const [clientId, setClientId] = useState(clients[0]?.id ?? '')
  const [pageKind, setPageKind] = useState('about')
  const [angle, setAngle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const draft = useCallback(async () => {
    if (!clientId) { setError('client required'); return }
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/work/web/draft', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clientId, pageKind, angle: angle.trim() || null }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? `HTTP ${res.status}`)
      }
      const j = await res.json()
      onCreated(j.row as PageDraftRow)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }, [clientId, pageKind, angle, onCreated])

  return (
    <section className="bg-white rounded-2xl ring-1 ring-sky-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[14px] font-bold text-ink inline-flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-sky-600" /> New page brief
        </h3>
        <button onClick={onCancel} className="text-ink-4 hover:text-ink"><X className="w-4 h-4" /></button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Client">
          <select value={clientId} onChange={e => setClientId(e.target.value)} className={INPUT_CLS + ' bg-white'}>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Page kind">
          <select value={pageKind} onChange={e => setPageKind(e.target.value)} className={INPUT_CLS + ' bg-white'}>
            {PAGE_KINDS.map(k => <option key={k.key} value={k.key}>{k.label}</option>)}
          </select>
        </Field>
      </div>
      <div className="mt-2">
        <Field label="Angle (optional)">
          <input value={angle} onChange={e => setAngle(e.target.value)}
            placeholder="e.g. push family combo for back-to-school; emphasize the 8hr broth"
            className={INPUT_CLS} />
        </Field>
      </div>

      {error && (
        <div className="mt-2 flex items-start gap-1.5 text-[12px] text-red-700">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button onClick={draft} disabled={busy}
          className="text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50 inline-flex items-center gap-1.5">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          Draft with AI
        </button>
        <button onClick={onCancel} className="text-[12px] text-ink-3 hover:text-ink px-2 py-1.5">Cancel</button>
      </div>
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-semibold text-ink-3 uppercase tracking-wider mb-1">{label}</label>
      {children}
    </div>
  )
}

const INPUT_CLS = 'w-full text-[13px] px-2 py-1.5 rounded-md ring-1 ring-ink-6 focus:ring-sky-500 focus:outline-none'

// ─────────────────────────────────────────────────────────────
// Draft row
// ─────────────────────────────────────────────────────────────

function DraftRowEl({ d }: { d: PageDraftRow }) {
  const [expanded, setExpanded] = useState(false)
  const kindLabel = PAGE_KINDS.find(k => k.key === d.pageKind)?.label ?? d.pageKind
  return (
    <li className="rounded-xl ring-1 ring-ink-6/60 p-3 bg-white">
      <button onClick={() => setExpanded(e => !e)} className="w-full text-left">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="text-[12px] font-semibold text-ink truncate">{d.clientName ?? d.clientId.slice(0, 6)}</span>
          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-sky-50 text-sky-800 ring-1 ring-sky-100">
            {kindLabel}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-3">{d.status.replace('_', ' ')}</span>
          {d.aiAssisted && (
            <span className="text-[10px] font-semibold text-sky-700 inline-flex items-center gap-0.5">
              <Sparkles className="w-3 h-3" /> AI
            </span>
          )}
        </div>
        {d.headline && <p className="text-[14px] font-bold text-ink leading-snug">{d.headline}</p>}
        {!expanded && d.subhead && (
          <p className="text-[12px] text-ink-3 line-clamp-1 mt-0.5">{d.subhead}</p>
        )}
      </button>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-ink-6/40 space-y-2">
          {d.subhead && <p className="text-[13px] text-ink-2 italic">{d.subhead}</p>}
          <div className="text-[13px] text-ink leading-relaxed whitespace-pre-wrap">{d.bodyMd}</div>
          {d.ctaText && (
            <p className="text-[12px] text-sky-800 inline-flex items-center gap-1 mt-2">
              <CheckCircle2 className="w-3 h-3" /> CTA: <strong>{d.ctaText}</strong>
              {d.ctaUrl && <span className="text-ink-4">→ {d.ctaUrl}</span>}
            </p>
          )}
        </div>
      )}
    </li>
  )
}
