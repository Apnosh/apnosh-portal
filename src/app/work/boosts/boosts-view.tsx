/**
 * Paid media buyer's working surface. Three rails:
 *
 *   1) Pending — owner-approved boost specs. Buyer launches in Meta
 *      Ads (today, manually), stashes the platform_campaign_id, and
 *      the row flips to 'launching' → 'active'.
 *   2) Live — launching / active / paused campaigns. Buyer can pause,
 *      resume, complete (with final metrics), or cancel.
 *   3) Opportunities — top organic posts not yet boosted. AI suggests
 *      a budget + audience + rationale.
 */

'use client'

import { useState, useCallback, useMemo } from 'react'
import {
  Megaphone, Loader2, Play, Pause, CheckCircle2, XCircle, Sparkles, ExternalLink, AlertCircle, Heart, MessageCircle, Eye,
} from 'lucide-react'
import type { BoostQueue, BoostRow, OpportunityRow } from '@/lib/work/get-boost-queue'

interface Props { initialQueue: BoostQueue }

type Tab = 'pending' | 'live' | 'opportunities'

export default function BoostsView({ initialQueue }: Props) {
  const [queue, setQueue] = useState<BoostQueue>(initialQueue)
  const [tab, setTab] = useState<Tab>(initialQueue.pending.length > 0 ? 'pending' : 'opportunities')

  const tabs: Array<{ key: Tab; label: string; count: number }> = [
    { key: 'pending', label: 'Pending', count: queue.pending.length },
    { key: 'live', label: 'Live', count: queue.live.length },
    { key: 'opportunities', label: 'Opportunities', count: queue.opportunities.length },
  ]

  const updateCampaign = useCallback((id: string, patch: Partial<BoostRow>) => {
    setQueue(prev => {
      const move = (rows: BoostRow[]): BoostRow[] => rows.map(r => r.id === id ? { ...r, ...patch } : r)
      const next = {
        pending: move(prev.pending),
        live: move(prev.live),
        history: move(prev.history),
        opportunities: prev.opportunities,
      }
      // Re-bucket the touched row based on new status.
      const touched = [...next.pending, ...next.live, ...next.history].find(r => r.id === id)
      if (!touched) return next
      const isPending = touched.status === 'pending'
      const isLive = ['launching', 'active', 'paused'].includes(touched.status)
      const isHistory = ['completed', 'cancelled'].includes(touched.status)
      return {
        pending: isPending ? [touched, ...next.pending.filter(r => r.id !== id)] : next.pending.filter(r => r.id !== id),
        live: isLive ? [touched, ...next.live.filter(r => r.id !== id)] : next.live.filter(r => r.id !== id),
        history: isHistory ? [touched, ...next.history.filter(r => r.id !== id)] : next.history.filter(r => r.id !== id),
        opportunities: prev.opportunities,
      }
    })
  }, [])

  const onCampaignLaunched = useCallback((id: string, patch: Partial<BoostRow>) => updateCampaign(id, patch), [updateCampaign])

  return (
    <div className="max-w-5xl mx-auto py-7 px-4 lg:px-6">
      <header className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-violet-50 text-violet-700 ring-1 ring-violet-100">
            <Megaphone className="w-4.5 h-4.5" />
          </div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-3 leading-none">
            Paid media
          </p>
        </div>
        <h1 className="text-[26px] sm:text-[28px] leading-tight font-bold text-ink tracking-tight">
          Boost queue
        </h1>
        <p className="text-[13px] text-ink-2 mt-1.5 leading-relaxed max-w-2xl">
          Launch approved boosts, monitor live campaigns, and surface organic winners worth amplifying.
        </p>
      </header>

      <div className="flex items-center gap-1 mb-5 border-b border-ink-6">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? 'border-violet-600 text-ink'
                : 'border-transparent text-ink-3 hover:text-ink'
            }`}
          >
            {t.label}
            <span className="ml-1.5 text-[11px] text-ink-4">{t.count}</span>
          </button>
        ))}
      </div>

      {tab === 'pending' && (
        <PendingRail rows={queue.pending} onUpdate={onCampaignLaunched} />
      )}
      {tab === 'live' && (
        <LiveRail rows={queue.live} onUpdate={updateCampaign} />
      )}
      {tab === 'opportunities' && (
        <OpportunityRail rows={queue.opportunities} />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Pending
// ─────────────────────────────────────────────────────────────

function PendingRail({ rows, onUpdate }: { rows: BoostRow[]; onUpdate: (id: string, patch: Partial<BoostRow>) => void }) {
  if (rows.length === 0) {
    return <EmptyState text="No pending boosts. Owners approve specs from their portal; they land here." />
  }
  return (
    <div className="space-y-3">
      {rows.map(r => <PendingCard key={r.id} row={r} onLaunched={p => onUpdate(r.id, p)} />)}
    </div>
  )
}

function PendingCard({ row, onLaunched }: { row: BoostRow; onLaunched: (patch: Partial<BoostRow>) => void }) {
  const [platformId, setPlatformId] = useState('')
  const [launching, setLaunching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const launch = useCallback(async (markActive: boolean) => {
    setLaunching(true)
    setError(null)
    try {
      const res = await fetch(`/api/work/boosts/${row.id}/launch`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          platformCampaignId: platformId.trim() || null,
          markActive,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? `HTTP ${res.status}`)
      }
      const j = await res.json()
      onLaunched({
        status: markActive ? 'active' : 'launching',
        platformCampaignId: j.platformCampaignId ?? (platformId.trim() || null),
        launchedAt: markActive ? new Date().toISOString() : null,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to launch')
    } finally {
      setLaunching(false)
    }
  }, [row.id, platformId, onLaunched])

  return (
    <article className="bg-white rounded-2xl ring-1 ring-ink-6/60 p-5">
      <CardHeader row={row} accent="violet" badge="Pending" />
      <PostSnapshot row={row} />
      <SpecGrid row={row} />

      <div className="mt-4 pt-4 border-t border-ink-6/50">
        <label className="block text-[11px] font-semibold text-ink-2 uppercase tracking-wider mb-1.5">
          Meta campaign ID (optional)
        </label>
        <input
          value={platformId}
          onChange={e => setPlatformId(e.target.value)}
          placeholder="120201234567890123"
          className="w-full text-[13px] px-3 py-2 rounded-lg ring-1 ring-ink-6 focus:ring-violet-500 focus:outline-none"
        />
        {error && (
          <div className="mt-2 flex items-start gap-1.5 text-[12px] text-red-700">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
        <div className="mt-3 flex items-center gap-2">
          <button
            disabled={launching}
            onClick={() => launch(false)}
            className="text-[12px] font-medium px-3 py-1.5 rounded-lg ring-1 ring-ink-6 text-ink-2 hover:bg-ink-7 disabled:opacity-50"
          >
            Mark launching
          </button>
          <button
            disabled={launching}
            onClick={() => launch(true)}
            className="text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {launching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            Mark active
          </button>
        </div>
      </div>
    </article>
  )
}

// ─────────────────────────────────────────────────────────────
// Live
// ─────────────────────────────────────────────────────────────

function LiveRail({ rows, onUpdate }: { rows: BoostRow[]; onUpdate: (id: string, patch: Partial<BoostRow>) => void }) {
  if (rows.length === 0) {
    return <EmptyState text="No campaigns currently live." />
  }
  return (
    <div className="space-y-3">
      {rows.map(r => <LiveCard key={r.id} row={r} onUpdate={p => onUpdate(r.id, p)} />)}
    </div>
  )
}

function LiveCard({ row, onUpdate }: { row: BoostRow; onUpdate: (patch: Partial<BoostRow>) => void }) {
  const [busy, setBusy] = useState<null | 'pause' | 'resume' | 'complete' | 'cancel'>(null)
  const [error, setError] = useState<string | null>(null)
  const [finalSpend, setFinalSpend] = useState(String(row.spend ?? ''))
  const [finalReach, setFinalReach] = useState(String(row.reach ?? ''))
  const [finalClicks, setFinalClicks] = useState(String(row.clicks ?? ''))

  const act = useCallback(async (action: 'pause' | 'resume' | 'complete' | 'cancel') => {
    setBusy(action)
    setError(null)
    try {
      const body: Record<string, unknown> = { action }
      if (action === 'complete') {
        body.spend = Number(finalSpend) || 0
        body.reach = Number(finalReach) || 0
        body.clicks = Number(finalClicks) || 0
      }
      const res = await fetch(`/api/work/boosts/${row.id}/lifecycle`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? `HTTP ${res.status}`)
      }
      const map: Record<typeof action, BoostRow['status']> = {
        pause: 'paused', resume: 'active', complete: 'completed', cancel: 'cancelled',
      }
      onUpdate({
        status: map[action],
        ...(action === 'complete' ? {
          spend: Number(finalSpend) || 0,
          reach: Number(finalReach) || 0,
          clicks: Number(finalClicks) || 0,
          endedAt: new Date().toISOString(),
        } : {}),
        ...(action === 'cancel' ? { endedAt: new Date().toISOString() } : {}),
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(null)
    }
  }, [row.id, onUpdate, finalSpend, finalReach, finalClicks])

  return (
    <article className="bg-white rounded-2xl ring-1 ring-ink-6/60 p-5">
      <CardHeader row={row} accent="emerald" badge={row.status} />
      <PostSnapshot row={row} />
      <SpecGrid row={row} />
      <MetricsGrid row={row} />

      <div className="mt-4 pt-4 border-t border-ink-6/50 flex flex-wrap items-center gap-2">
        {row.status === 'active' && (
          <button onClick={() => act('pause')} disabled={busy !== null}
            className="text-[12px] font-medium px-3 py-1.5 rounded-lg ring-1 ring-ink-6 text-ink-2 hover:bg-ink-7 disabled:opacity-50 inline-flex items-center gap-1.5">
            {busy === 'pause' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pause className="w-3.5 h-3.5" />}
            Pause
          </button>
        )}
        {row.status === 'paused' && (
          <button onClick={() => act('resume')} disabled={busy !== null}
            className="text-[12px] font-medium px-3 py-1.5 rounded-lg ring-1 ring-ink-6 text-ink-2 hover:bg-ink-7 disabled:opacity-50 inline-flex items-center gap-1.5">
            {busy === 'resume' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            Resume
          </button>
        )}
        <button onClick={() => act('cancel')} disabled={busy !== null}
          className="text-[12px] font-medium px-3 py-1.5 rounded-lg ring-1 ring-ink-6 text-ink-2 hover:bg-ink-7 disabled:opacity-50 inline-flex items-center gap-1.5">
          {busy === 'cancel' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
          Cancel
        </button>
      </div>

      {/* Complete with metrics */}
      <div className="mt-3 pt-3 border-t border-ink-6/30">
        <p className="text-[11px] font-semibold text-ink-2 uppercase tracking-wider mb-2">Mark complete with final metrics</p>
        <div className="grid grid-cols-3 gap-2">
          <NumInput label="Spend" value={finalSpend} onChange={setFinalSpend} prefix="$" />
          <NumInput label="Reach" value={finalReach} onChange={setFinalReach} />
          <NumInput label="Clicks" value={finalClicks} onChange={setFinalClicks} />
        </div>
        <button onClick={() => act('complete')} disabled={busy !== null}
          className="mt-2 text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-1.5">
          {busy === 'complete' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
          Mark complete
        </button>
      </div>

      {error && (
        <div className="mt-3 flex items-start gap-1.5 text-[12px] text-red-700">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
    </article>
  )
}

// ─────────────────────────────────────────────────────────────
// Opportunities
// ─────────────────────────────────────────────────────────────

function OpportunityRail({ rows }: { rows: OpportunityRow[] }) {
  if (rows.length === 0) {
    return <EmptyState text="No standout organic posts in the last 60 days yet. As outcome data syncs, winners surface here." />
  }
  return (
    <div className="space-y-3">
      {rows.map(r => <OpportunityCard key={r.postId} row={r} />)}
    </div>
  )
}

interface AIBoostRec {
  budget: number
  days: number
  audience: 'locals' | 'foodies' | 'recent'
  audience_notes?: string
  why: string
}

function OpportunityCard({ row }: { row: OpportunityRow }) {
  const [rec, setRec] = useState<AIBoostRec | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const recommend = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/work/boosts/recommend', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ postId: row.postId }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? `HTTP ${res.status}`)
      }
      const j = await res.json()
      setRec(j.recommendation as AIBoostRec)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setLoading(false)
    }
  }, [row.postId])

  return (
    <article className="bg-white rounded-2xl ring-1 ring-ink-6/60 p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-semibold text-ink-2 truncate">{row.clientName ?? row.clientSlug ?? row.clientId}</span>
            <span className="text-[10px] uppercase tracking-wider text-ink-4">{row.platform}</span>
            {row.permalink && (
              <a href={row.permalink} target="_blank" rel="noopener noreferrer" className="text-ink-4 hover:text-ink-2">
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
          <p className="text-[13px] text-ink leading-relaxed line-clamp-3">{row.caption || <span className="italic text-ink-4">No caption</span>}</p>
        </div>
        {row.mediaUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={row.mediaUrl} alt="" className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />
        )}
      </div>

      <div className="flex items-center gap-4 text-[12px] text-ink-2">
        <span className="inline-flex items-center gap-1"><Eye className="w-3.5 h-3.5" /> {fmt(row.reach)} reach</span>
        <span className="inline-flex items-center gap-1"><Heart className="w-3.5 h-3.5" /> {fmt(row.likes)}</span>
        <span className="inline-flex items-center gap-1"><MessageCircle className="w-3.5 h-3.5" /> {fmt(row.comments)}</span>
        {row.engagementRate !== null && (
          <span className="ml-auto text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
            {(row.engagementRate * 100).toFixed(1)}% eng
          </span>
        )}
      </div>

      {rec && (
        <div className="mt-3 p-3 rounded-lg bg-violet-50 ring-1 ring-violet-100">
          <p className="text-[11px] font-semibold text-violet-900 uppercase tracking-wider mb-1.5">AI recommendation</p>
          <div className="flex items-center gap-3 text-[12px] text-ink mb-1.5">
            <span><strong>${rec.budget}</strong> × {rec.days}d</span>
            <span>·</span>
            <span className="capitalize">{rec.audience}</span>
          </div>
          <p className="text-[12px] text-ink-2 leading-relaxed">{rec.why}</p>
          {rec.audience_notes && (
            <p className="text-[11px] text-ink-3 mt-1.5">Notes: {rec.audience_notes}</p>
          )}
        </div>
      )}

      {error && (
        <div className="mt-2 flex items-start gap-1.5 text-[12px] text-red-700">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="mt-3 flex items-center justify-end">
        <button onClick={recommend} disabled={loading}
          className="text-[12px] font-medium px-3 py-1.5 rounded-lg ring-1 ring-violet-200 text-violet-700 hover:bg-violet-50 disabled:opacity-50 inline-flex items-center gap-1.5">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          {rec ? 'Regenerate' : 'Suggest boost'}
        </button>
      </div>
    </article>
  )
}

// ─────────────────────────────────────────────────────────────
// Shared bits
// ─────────────────────────────────────────────────────────────

function CardHeader({ row, accent, badge }: { row: BoostRow; accent: 'violet' | 'emerald'; badge: string }) {
  const accentClass = accent === 'violet'
    ? 'bg-violet-50 text-violet-800 ring-violet-100'
    : 'bg-emerald-50 text-emerald-800 ring-emerald-100'
  return (
    <div className="flex items-center justify-between gap-3 mb-3">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-[12px] font-semibold text-ink truncate">{row.clientName ?? row.clientSlug ?? row.clientId}</span>
        <span className="text-[10px] uppercase tracking-wider text-ink-4">{row.platform}</span>
      </div>
      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ring-1 ${accentClass}`}>
        {badge}
      </span>
    </div>
  )
}

function PostSnapshot({ row }: { row: BoostRow }) {
  return (
    <div className="flex items-start gap-3 mb-3 p-3 rounded-lg bg-ink-7/60">
      {row.sourceMediaUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={row.sourceMediaUrl} alt="" className="w-14 h-14 rounded-md object-cover flex-shrink-0" />
      )}
      <p className="text-[12px] text-ink-2 leading-relaxed line-clamp-3 flex-1">
        {row.sourceText || <span className="italic text-ink-4">No snapshot</span>}
      </p>
    </div>
  )
}

function SpecGrid({ row }: { row: BoostRow }) {
  return (
    <div className="grid grid-cols-3 gap-2 mb-1">
      <Stat label="Budget" value={`$${row.budgetTotal}`} />
      <Stat label="Duration" value={`${row.days}d`} />
      <Stat label="Audience" value={row.audiencePreset} />
    </div>
  )
}

function MetricsGrid({ row }: { row: BoostRow }) {
  const cpc = row.clicks > 0 ? row.spend / row.clicks : null
  return (
    <div className="mt-3 grid grid-cols-4 gap-2">
      <Stat label="Reach" value={fmt(row.reach)} />
      <Stat label="Clicks" value={fmt(row.clicks)} />
      <Stat label="Spend" value={`$${Number(row.spend).toFixed(0)}`} />
      <Stat label="CPC" value={cpc !== null ? `$${cpc.toFixed(2)}` : '—'} />
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-ink-7/50 px-2.5 py-1.5">
      <p className="text-[9px] font-semibold text-ink-3 uppercase tracking-wider">{label}</p>
      <p className="text-[13px] font-semibold text-ink capitalize">{value}</p>
    </div>
  )
}

function NumInput({ label, value, onChange, prefix }: { label: string; value: string; onChange: (v: string) => void; prefix?: string }) {
  return (
    <div>
      <label className="block text-[10px] font-semibold text-ink-3 uppercase tracking-wider mb-1">{label}</label>
      <div className="flex items-center rounded-md ring-1 ring-ink-6 focus-within:ring-violet-500">
        {prefix && <span className="px-2 text-[12px] text-ink-3">{prefix}</span>}
        <input
          type="number"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full text-[12px] py-1.5 pr-2 bg-transparent focus:outline-none"
        />
      </div>
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="bg-white rounded-2xl ring-1 ring-ink-6/60 px-6 py-10 text-center">
      <p className="text-[13px] text-ink-3 max-w-md mx-auto leading-relaxed">{text}</p>
    </div>
  )
}

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k'
  return String(n)
}
