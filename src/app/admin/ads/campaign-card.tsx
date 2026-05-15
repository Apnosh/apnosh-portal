'use client'

/**
 * Card rendered inside each /admin/ads pipeline column. Has inline
 * controls to advance, pause, or cancel a campaign without leaving the
 * page -- the strategist workflow optimizer.
 *
 * Server actions in src/lib/admin/ad-campaign-actions enforce the
 * legal state transitions and trigger revalidatePath so the next
 * server render is fresh.
 */

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowRight, Pause, X, Loader2, CheckCircle2,
} from 'lucide-react'
import type { PipelineCampaign, CampaignStatus, CampaignType } from '@/lib/admin/get-ads-pipeline'
import { advanceCampaign, pauseCampaign, cancelCampaign } from '@/lib/admin/ad-campaign-actions'

const TYPE_LABELS: Record<CampaignType, string> = {
  post_boost: 'Post boost',
  reels_boost: 'Reel boost',
  foot_traffic: 'Foot traffic',
  reservations: 'Reservations',
  lead_gen: 'Lead gen',
  awareness: 'Awareness',
}

const TYPE_TINTS: Record<CampaignType, string> = {
  post_boost: 'bg-violet-50 text-violet-700 ring-violet-100',
  reels_boost: 'bg-rose-50 text-rose-700 ring-rose-100',
  foot_traffic: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  reservations: 'bg-amber-50 text-amber-700 ring-amber-100',
  lead_gen: 'bg-sky-50 text-sky-700 ring-sky-100',
  awareness: 'bg-indigo-50 text-indigo-700 ring-indigo-100',
}

const NEXT_ACTION_LABEL: Partial<Record<CampaignStatus, string>> = {
  pending:   'Pick up',
  launching: 'Mark live',
  active:    'End',
  paused:    'Resume',
}

function fmtMoney(n: number): string {
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

function fmtCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

function daysAgo(iso: string | null): string {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  const d = Math.floor(ms / 86_400_000)
  if (d === 0) return 'today'
  if (d === 1) return '1d ago'
  return `${d}d ago`
}

export default function CampaignCard({ campaign }: { campaign: PipelineCampaign }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [showLiveForm, setShowLiveForm] = useState(false)
  const [platformId, setPlatformId] = useState('')

  const typeTint = TYPE_TINTS[campaign.campaignType] ?? 'bg-ink-7 text-ink-2 ring-ink-6'
  const remaining = Math.max(0, campaign.budgetTotal - campaign.spend)
  const pctSpent = campaign.budgetTotal > 0
    ? Math.min(100, Math.round((campaign.spend / campaign.budgetTotal) * 100))
    : 0
  const nextLabel = NEXT_ACTION_LABEL[campaign.status]
  const canAdvance = !!nextLabel
  const canPause = campaign.status === 'active'
  const canCancel = campaign.status === 'pending' || campaign.status === 'launching' || campaign.status === 'active' || campaign.status === 'paused'

  function runAdvance(opts?: { platformId?: string }) {
    setError(null)
    startTransition(async () => {
      const r = await advanceCampaign({ campaignId: campaign.id, platformCampaignId: opts?.platformId })
      if (!r.success) setError(r.error)
      else { setShowLiveForm(false); setPlatformId(''); router.refresh() }
    })
  }

  function handleAdvanceClick() {
    /* Launching -> active needs a Meta campaign ID, ask inline. */
    if (campaign.status === 'launching' && !campaign.platformCampaignId) {
      setShowLiveForm(true)
      return
    }
    runAdvance()
  }

  function handlePause() {
    setError(null)
    startTransition(async () => {
      const r = await pauseCampaign(campaign.id)
      if (!r.success) setError(r.error)
      else router.refresh()
    })
  }

  function handleCancel() {
    const reason = window.prompt('Cancellation reason (optional)') ?? undefined
    if (reason === null) return  // user hit Cancel on the prompt
    setError(null)
    startTransition(async () => {
      const r = await cancelCampaign(campaign.id, reason)
      if (!r.success) setError(r.error)
      else router.refresh()
    })
  }

  return (
    <div className="bg-white rounded-xl border border-ink-6 hover:border-ink-4 hover:shadow-sm transition-all p-2.5 space-y-1.5">
      <div className="flex items-center justify-between gap-1">
        <span className={`inline-flex items-center text-[9.5px] font-semibold px-1.5 py-0.5 rounded ring-1 ${typeTint}`}>
          {TYPE_LABELS[campaign.campaignType]}
        </span>
        <span className="text-[9.5px] text-ink-4 tabular-nums">
          {fmtMoney(campaign.budgetTotal)} · {campaign.days}d
        </span>
      </div>

      <Link
        href={`/admin/clients/${campaign.clientSlug ?? campaign.clientId}?tab=performance&campaign=${campaign.id}`}
        className="block text-[12px] font-semibold text-ink truncate hover:text-brand-dark"
      >
        {campaign.clientName}
      </Link>

      {(campaign.status === 'active' || campaign.status === 'launching' || campaign.status === 'paused') && campaign.budgetTotal > 0 && (
        <div>
          <div className="h-1 bg-bg-3 rounded overflow-hidden">
            <div className="h-full bg-brand" style={{ width: `${pctSpent}%` }} />
          </div>
          <div className="flex items-center justify-between mt-1 text-[10px] text-ink-4 tabular-nums">
            <span>{fmtMoney(campaign.spend)} spent</span>
            <span>{fmtMoney(remaining)} left</span>
          </div>
        </div>
      )}

      {campaign.status === 'pending' && (
        <p className="text-[10px] text-ink-4">Requested {daysAgo(campaign.createdAt)}</p>
      )}

      {(campaign.status === 'active' || campaign.status === 'launching') && campaign.reach > 0 && (
        <p className="text-[10px] text-ink-3 tabular-nums">
          {fmtCompact(campaign.reach)} reach · {campaign.clicks} clicks
        </p>
      )}

      {/* Inline form for launching -> active transition */}
      {showLiveForm && (
        <div className="bg-bg-2 rounded p-2 space-y-1.5">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-ink-3">
            Meta campaign ID
          </label>
          <input
            type="text"
            autoFocus
            value={platformId}
            onChange={e => setPlatformId(e.target.value)}
            placeholder="120201234567890123"
            className="w-full text-[11px] bg-white ring-1 ring-ink-6 focus:ring-ink-3 focus:outline-none rounded px-2 py-1"
          />
          <div className="flex gap-1">
            <button
              disabled={pending || !platformId.trim()}
              onClick={() => runAdvance({ platformId: platformId.trim() })}
              className="flex-1 inline-flex items-center justify-center gap-1 text-[10.5px] font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 rounded px-2 py-1"
            >
              {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
              Go live
            </button>
            <button
              disabled={pending}
              onClick={() => setShowLiveForm(false)}
              className="text-[10.5px] font-medium text-ink-3 hover:text-ink px-2 py-1"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Action row */}
      {!showLiveForm && (canAdvance || canPause || canCancel) && (
        <div className="flex items-center gap-1 pt-1 border-t border-ink-7">
          {canAdvance && (
            <button
              disabled={pending}
              onClick={handleAdvanceClick}
              className="inline-flex items-center gap-1 text-[10.5px] font-medium text-white bg-brand hover:bg-brand-dark disabled:opacity-60 rounded px-2 py-1"
            >
              {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowRight className="w-3 h-3" />}
              {nextLabel}
            </button>
          )}
          {canPause && (
            <button
              disabled={pending}
              onClick={handlePause}
              className="inline-flex items-center gap-1 text-[10.5px] font-medium text-ink-3 hover:text-ink bg-bg-2 hover:bg-bg-3 rounded px-2 py-1"
            >
              <Pause className="w-3 h-3" /> Pause
            </button>
          )}
          {canCancel && (
            <button
              disabled={pending}
              onClick={handleCancel}
              className="ml-auto inline-flex items-center text-[10.5px] font-medium text-ink-4 hover:text-rose-600 px-2 py-1"
              title="Cancel campaign"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      {error && (
        <p className="text-[10px] text-rose-600 bg-rose-50 rounded px-1.5 py-1">{error}</p>
      )}
    </div>
  )
}
