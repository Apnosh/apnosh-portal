/**
 * Email specialist campaigns view. Three rails (Drafts, Scheduled,
 * Sent) + a "New campaign" composer that takes a brief and asks AI
 * to draft body_text. Manager edits, schedules, marks sent.
 */

'use client'

import { useState, useCallback } from 'react'
import {
  Mail, Loader2, Sparkles, AlertCircle, CheckCircle2, Plus, Calendar, Send, X, Eye, MousePointer,
} from 'lucide-react'
import type { EmailBuckets, EmailRow, ClientStub } from '@/lib/work/get-email-queue'

interface Props { initialQueue: EmailBuckets; clients: ClientStub[] }

type Tab = 'drafts' | 'scheduled' | 'sent'

export default function CampaignsView({ initialQueue, clients }: Props) {
  const [queue, setQueue] = useState<EmailBuckets>(initialQueue)
  const [tab, setTab] = useState<Tab>(initialQueue.drafts.length > 0 ? 'drafts' : 'scheduled')
  const [composing, setComposing] = useState(false)

  const tabs: Array<{ key: Tab; label: string; count: number }> = [
    { key: 'drafts', label: 'Drafts', count: queue.drafts.length },
    { key: 'scheduled', label: 'Scheduled', count: queue.scheduled.length },
    { key: 'sent', label: 'Sent', count: queue.sent.length },
  ]

  const insertDraft = useCallback((row: EmailRow) => {
    setQueue(prev => ({ ...prev, drafts: [row, ...prev.drafts] }))
    setComposing(false)
    setTab('drafts')
  }, [])

  const updateRow = useCallback((id: string, patch: Partial<EmailRow>) => {
    setQueue(prev => {
      const move = (rows: EmailRow[]) => rows.map(r => r.id === id ? { ...r, ...patch } : r)
      const next = {
        drafts: move(prev.drafts),
        scheduled: move(prev.scheduled),
        sent: move(prev.sent),
      }
      const updated = [...next.drafts, ...next.scheduled, ...next.sent].find(r => r.id === id)
      if (!updated) return next
      const isDraft = ['draft', 'in_review', 'approved'].includes(updated.status)
      const isSched = ['scheduled', 'sending'].includes(updated.status)
      const isSent = updated.status === 'sent'
      return {
        drafts: isDraft ? [updated, ...next.drafts.filter(r => r.id !== id)] : next.drafts.filter(r => r.id !== id),
        scheduled: isSched ? [updated, ...next.scheduled.filter(r => r.id !== id)] : next.scheduled.filter(r => r.id !== id),
        sent: isSent ? [updated, ...next.sent.filter(r => r.id !== id)] : next.sent.filter(r => r.id !== id),
      }
    })
  }, [])

  const activeList = tab === 'drafts' ? queue.drafts : tab === 'scheduled' ? queue.scheduled : queue.sent

  return (
    <div className="max-w-3xl mx-auto py-7 px-4 lg:px-6">
      <header className="mb-6 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-orange-50 text-orange-700 ring-1 ring-orange-100">
              <Mail className="w-4.5 h-4.5" />
            </div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-3 leading-none">
              Email
            </p>
          </div>
          <h1 className="text-[26px] sm:text-[28px] leading-tight font-bold text-ink tracking-tight">Campaigns</h1>
          <p className="text-[13px] text-ink-2 mt-1.5 leading-relaxed max-w-xl">
            Newsletters and email blasts across your book. AI drafts copy from a brief; you review, schedule, send.
          </p>
        </div>
        <button onClick={() => setComposing(true)}
          className="text-[12px] font-semibold px-3 py-2 rounded-lg bg-orange-600 text-white hover:bg-orange-700 inline-flex items-center gap-1.5 flex-shrink-0">
          <Plus className="w-3.5 h-3.5" /> New
        </button>
      </header>

      {composing && (
        <ComposerCard clients={clients} onCreated={insertDraft} onCancel={() => setComposing(false)} />
      )}

      <div className="flex items-center gap-1 mb-5 border-b border-ink-6">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key ? 'border-orange-600 text-ink' : 'border-transparent text-ink-3 hover:text-ink'
            }`}>
            {t.label}
            <span className="ml-1.5 text-[11px] text-ink-4">{t.count}</span>
          </button>
        ))}
      </div>

      {activeList.length === 0 ? (
        <EmptyState tab={tab} />
      ) : (
        <div className="space-y-3">
          {activeList.map(row => (
            <CampaignCard key={row.id} row={row} readOnly={tab === 'sent'} onUpdated={p => updateRow(row.id, p)} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Composer (new campaign)
// ─────────────────────────────────────────────────────────────

function ComposerCard({
  clients, onCreated, onCancel,
}: {
  clients: ClientStub[]
  onCreated: (row: EmailRow) => void
  onCancel: () => void
}) {
  const [clientId, setClientId] = useState(clients[0]?.id ?? '')
  const [name, setName] = useState('')
  const [theme, setTheme] = useState('')
  const [offer, setOffer] = useState('')
  const [cta, setCta] = useState('')
  const [audience, setAudience] = useState('all-subscribers')
  const [busy, setBusy] = useState<null | 'draft'>(null)
  const [error, setError] = useState<string | null>(null)

  const draft = useCallback(async () => {
    if (!clientId || !name.trim() || !theme.trim()) {
      setError('client, name, and theme are required')
      return
    }
    setBusy('draft')
    setError(null)
    try {
      const res = await fetch('/api/work/campaigns/draft', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clientId, name: name.trim(),
          brief: { theme: theme.trim(), offer: offer.trim() || null, cta: cta.trim() || null, audience },
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? `HTTP ${res.status}`)
      }
      const j = await res.json()
      onCreated(j.row as EmailRow)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(null)
    }
  }, [clientId, name, theme, offer, cta, audience, onCreated])

  return (
    <article className="bg-white rounded-2xl ring-1 ring-orange-200 p-5 mb-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[14px] font-bold text-ink inline-flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-orange-600" /> New campaign brief
        </h3>
        <button onClick={onCancel} className="text-ink-4 hover:text-ink"><X className="w-4 h-4" /></button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Client">
          <select value={clientId} onChange={e => setClientId(e.target.value)} className="w-full text-[13px] px-2 py-1.5 rounded-md ring-1 ring-ink-6 focus:ring-orange-500 focus:outline-none bg-white">
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Internal name">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Aug newsletter — back-to-school"
            className="w-full text-[13px] px-2 py-1.5 rounded-md ring-1 ring-ink-6 focus:ring-orange-500 focus:outline-none" />
        </Field>
      </div>

      <div className="mt-3">
        <Field label="Theme — what's this email about?">
          <textarea rows={2} value={theme} onChange={e => setTheme(e.target.value)}
            placeholder="Back-to-school lunch — pho is comforting and cheap, banh mi reheats well, family combo deals"
            className="w-full text-[13px] px-2 py-1.5 rounded-md ring-1 ring-ink-6 focus:ring-orange-500 focus:outline-none resize-y" />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-3">
        <Field label="Offer (optional)">
          <input value={offer} onChange={e => setOffer(e.target.value)} placeholder="$5 off family combo M-F"
            className="w-full text-[13px] px-2 py-1.5 rounded-md ring-1 ring-ink-6 focus:ring-orange-500 focus:outline-none" />
        </Field>
        <Field label="Call to action">
          <input value={cta} onChange={e => setCta(e.target.value)} placeholder="Order online"
            className="w-full text-[13px] px-2 py-1.5 rounded-md ring-1 ring-ink-6 focus:ring-orange-500 focus:outline-none" />
        </Field>
      </div>

      <div className="mt-3">
        <Field label="Audience">
          <select value={audience} onChange={e => setAudience(e.target.value)} className="w-full text-[13px] px-2 py-1.5 rounded-md ring-1 ring-ink-6 focus:ring-orange-500 focus:outline-none bg-white">
            <option value="all-subscribers">All subscribers</option>
            <option value="lapsed">Lapsed (no order in 60d)</option>
            <option value="loyalty">Loyalty members</option>
            <option value="new-local">New within 5mi (30d signup)</option>
          </select>
        </Field>
      </div>

      {error && (
        <div className="mt-3 flex items-start gap-1.5 text-[12px] text-red-700">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="mt-4 flex items-center gap-2">
        <button onClick={draft} disabled={busy !== null}
          className="text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50 inline-flex items-center gap-1.5">
          {busy === 'draft' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          Draft with AI
        </button>
        <button onClick={onCancel} className="text-[12px] text-ink-3 hover:text-ink px-2 py-1.5">Cancel</button>
      </div>
    </article>
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

// ─────────────────────────────────────────────────────────────
// Campaign card
// ─────────────────────────────────────────────────────────────

function CampaignCard({
  row, readOnly, onUpdated,
}: {
  row: EmailRow
  readOnly: boolean
  onUpdated: (patch: Partial<EmailRow>) => void
}) {
  const [subject, setSubject] = useState(row.subject)
  const [previewText, setPreviewText] = useState(row.previewText ?? '')
  const [body, setBody] = useState(row.bodyText ?? '')
  const [busy, setBusy] = useState<null | 'save' | 'schedule' | 'send' | 'cancel' | 'redraft'>(null)
  const [error, setError] = useState<string | null>(null)

  const save = useCallback(async () => {
    setBusy('save'); setError(null)
    try {
      const res = await fetch(`/api/work/campaigns/${row.id}/lifecycle`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'save', subject: subject.trim(), previewText: previewText.trim() || null, bodyText: body }),
      })
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error ?? `HTTP ${res.status}`) }
      onUpdated({ subject: subject.trim(), previewText: previewText.trim() || null, bodyText: body })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(null)
    }
  }, [row.id, subject, previewText, body, onUpdated])

  const schedule = useCallback(async () => {
    setBusy('schedule'); setError(null)
    try {
      const when = new Date(Date.now() + 30 * 60_000).toISOString()
      const res = await fetch(`/api/work/campaigns/${row.id}/lifecycle`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'schedule', scheduledFor: when }),
      })
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error ?? `HTTP ${res.status}`) }
      onUpdated({ status: 'scheduled', scheduledFor: when })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(null)
    }
  }, [row.id, onUpdated])

  const send = useCallback(async () => {
    setBusy('send'); setError(null)
    try {
      const res = await fetch(`/api/work/campaigns/${row.id}/lifecycle`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'send' }),
      })
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error ?? `HTTP ${res.status}`) }
      const j = await res.json()
      onUpdated({
        status: 'sent',
        sentAt: new Date().toISOString(),
        recipientCount: j.recipientCount ?? row.recipientCount,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(null)
    }
  }, [row.id, row.recipientCount, onUpdated])

  const redraft = useCallback(async () => {
    setBusy('redraft'); setError(null)
    try {
      const res = await fetch(`/api/work/campaigns/${row.id}/redraft`, { method: 'POST' })
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error ?? `HTTP ${res.status}`) }
      const j = await res.json()
      setSubject(j.subject as string)
      setPreviewText((j.previewText as string) ?? '')
      setBody(j.bodyText as string)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(null)
    }
  }, [row.id])

  const cancel = useCallback(async () => {
    setBusy('cancel'); setError(null)
    try {
      const res = await fetch(`/api/work/campaigns/${row.id}/lifecycle`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      })
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error ?? `HTTP ${res.status}`) }
      onUpdated({ status: 'cancelled' })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(null)
    }
  }, [row.id, onUpdated])

  const theme = (row.brief.theme as string | undefined) ?? ''
  const offer = (row.brief.offer as string | undefined) ?? ''

  return (
    <article className="bg-white rounded-2xl ring-1 ring-ink-6/60 p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-[12px] font-semibold text-ink truncate">{row.clientName ?? row.clientSlug ?? row.clientId}</span>
            <StatusBadge status={row.status} />
            {row.aiAssisted && (
              <span className="text-[10px] font-semibold uppercase tracking-wider text-orange-700 inline-flex items-center gap-0.5">
                <Sparkles className="w-3 h-3" /> AI
              </span>
            )}
          </div>
          <h3 className="text-[15px] font-bold text-ink leading-tight">{row.name}</h3>
          {theme && <p className="text-[11px] text-ink-3 mt-1 line-clamp-1">Theme: {theme}</p>}
        </div>
      </div>

      {readOnly ? (
        <ReadOnlyEmail row={row} />
      ) : (
        <>
          <Field label="Subject">
            <input value={subject} onChange={e => setSubject(e.target.value)}
              className="w-full text-[13px] px-2 py-1.5 rounded-md ring-1 ring-ink-6 focus:ring-orange-500 focus:outline-none" />
          </Field>
          <div className="mt-2">
            <Field label="Preview text">
              <input value={previewText} onChange={e => setPreviewText(e.target.value)}
                className="w-full text-[13px] px-2 py-1.5 rounded-md ring-1 ring-ink-6 focus:ring-orange-500 focus:outline-none" />
            </Field>
          </div>
          <div className="mt-2">
            <Field label="Body">
              <textarea rows={8} value={body} onChange={e => setBody(e.target.value)}
                className="w-full text-[13px] px-3 py-2 rounded-md ring-1 ring-ink-6 focus:ring-orange-500 focus:outline-none resize-y leading-relaxed" />
            </Field>
          </div>

          {offer && (
            <p className="text-[11px] text-ink-3 mt-2">Brief offer: {offer}</p>
          )}

          {error && (
            <div className="mt-2 flex items-start gap-1.5 text-[12px] text-red-700">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button onClick={save} disabled={busy !== null}
              className="text-[12px] font-medium px-3 py-1.5 rounded-lg ring-1 ring-ink-6 text-ink-2 hover:bg-ink-7 disabled:opacity-50 inline-flex items-center gap-1.5">
              {busy === 'save' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              Save
            </button>
            <button onClick={redraft} disabled={busy !== null}
              className="text-[12px] font-medium px-3 py-1.5 rounded-lg ring-1 ring-orange-200 text-orange-700 hover:bg-orange-50 disabled:opacity-50 inline-flex items-center gap-1.5">
              {busy === 'redraft' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              Re-draft
            </button>
            <div className="flex-1" />
            {row.status === 'draft' || row.status === 'in_review' || row.status === 'approved' ? (
              <>
                <button onClick={schedule} disabled={busy !== null}
                  className="text-[12px] font-medium px-3 py-1.5 rounded-lg ring-1 ring-ink-6 text-ink-2 hover:bg-ink-7 disabled:opacity-50 inline-flex items-center gap-1.5">
                  {busy === 'schedule' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Calendar className="w-3.5 h-3.5" />}
                  Schedule (+30m)
                </button>
                <button onClick={send} disabled={busy !== null}
                  className="text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50 inline-flex items-center gap-1.5">
                  {busy === 'send' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  Send now
                </button>
              </>
            ) : (row.status === 'scheduled' || row.status === 'sending') ? (
              <button onClick={cancel} disabled={busy !== null}
                className="text-[12px] font-medium px-3 py-1.5 rounded-lg ring-1 ring-ink-6 text-ink-3 hover:bg-ink-7 disabled:opacity-50 inline-flex items-center gap-1.5">
                <X className="w-3.5 h-3.5" /> Cancel send
              </button>
            ) : null}
          </div>
        </>
      )}
    </article>
  )
}

function ReadOnlyEmail({ row }: { row: EmailRow }) {
  const openRate = row.recipientCount > 0 ? (row.opens / row.recipientCount) : null
  const clickRate = row.opens > 0 ? (row.clicks / row.opens) : null
  return (
    <>
      <div className="rounded-lg bg-ink-7/50 p-3 mb-3">
        <p className="text-[11px] font-semibold text-ink-2 mb-0.5">Subject</p>
        <p className="text-[13px] text-ink mb-2">{row.subject}</p>
        {row.previewText && (
          <>
            <p className="text-[11px] font-semibold text-ink-2 mb-0.5">Preview</p>
            <p className="text-[12px] text-ink-3 italic mb-2">{row.previewText}</p>
          </>
        )}
        <p className="text-[11px] font-semibold text-ink-2 mb-0.5">Body</p>
        <p className="text-[12px] text-ink whitespace-pre-wrap leading-relaxed">{row.bodyText ?? ''}</p>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <Metric label="Recipients" value={fmt(row.recipientCount)} />
        <Metric label="Opens" value={fmt(row.opens)} sub={openRate !== null ? (openRate * 100).toFixed(1) + '%' : null} icon={Eye} />
        <Metric label="Clicks" value={fmt(row.clicks)} sub={clickRate !== null ? (clickRate * 100).toFixed(1) + '%' : null} icon={MousePointer} />
        <Metric label="Unsubs" value={fmt(row.unsubscribes)} />
      </div>
    </>
  )
}

function Metric({ label, value, sub, icon: Icon }: { label: string; value: string; sub?: string | null; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="rounded-lg bg-ink-7/50 px-2.5 py-1.5">
      <p className="text-[9px] font-semibold text-ink-3 uppercase tracking-wider inline-flex items-center gap-1">
        {Icon && <Icon className="w-3 h-3" />} {label}
      </p>
      <p className="text-[13px] font-semibold text-ink">{value}</p>
      {sub && <p className="text-[10px] text-ink-3">{sub}</p>}
    </div>
  )
}

function StatusBadge({ status }: { status: EmailRow['status'] }) {
  const map: Record<EmailRow['status'], { bg: string; label: string }> = {
    draft:     { bg: 'bg-ink-7 text-ink-2 ring-ink-6',                label: 'draft' },
    in_review: { bg: 'bg-amber-50 text-amber-800 ring-amber-100',     label: 'in review' },
    approved:  { bg: 'bg-emerald-50 text-emerald-800 ring-emerald-100', label: 'approved' },
    scheduled: { bg: 'bg-blue-50 text-blue-800 ring-blue-100',        label: 'scheduled' },
    sending:   { bg: 'bg-blue-50 text-blue-800 ring-blue-100',        label: 'sending' },
    sent:      { bg: 'bg-orange-50 text-orange-800 ring-orange-100',  label: 'sent' },
    cancelled: { bg: 'bg-red-50 text-red-700 ring-red-100',           label: 'cancelled' },
  }
  const m = map[status] ?? map.draft
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ring-1 ${m.bg}`}>
      {m.label}
    </span>
  )
}

function EmptyState({ tab }: { tab: Tab }) {
  const msg = tab === 'drafts' ? 'No drafts. Click New to start a campaign.'
    : tab === 'scheduled' ? 'Nothing scheduled.'
    : 'No sent campaigns yet.'
  return (
    <div className="bg-white rounded-2xl ring-1 ring-ink-6/60 px-6 py-12 text-center">
      <Mail className="w-8 h-8 text-ink-4 mx-auto mb-3" />
      <p className="text-[14px] text-ink-2 font-medium">{msg}</p>
    </div>
  )
}

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k'
  return String(n)
}
