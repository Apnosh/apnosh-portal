/**
 * /admin/ads -- cross-client ad campaign pipeline.
 *
 * Portfolio-level view for Apnosh admins. Shows every campaign across
 * every client, grouped by status, with summary cards on the right.
 * Required at 10K-restaurant scale because /work/boosts is per-buyer
 * and can't surface portfolio-wide signals (stuck campaigns, spend
 * concentration, AM overload).
 */

import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  Megaphone, AlertCircle, Clock, Activity, CheckCircle2, XCircle, Pause,
  TrendingUp,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getAdsPipeline, type PipelineCampaign, type CampaignStatus, type CampaignType } from '@/lib/admin/get-ads-pipeline'

export const dynamic = 'force-dynamic'

const STATUS_COLUMNS: { status: CampaignStatus; label: string; tint: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { status: 'pending',    label: 'Requested',  tint: 'bg-amber-50 text-amber-800 ring-amber-100',   Icon: Clock },
  { status: 'launching',  label: 'Launching',  tint: 'bg-sky-50 text-sky-700 ring-sky-100',         Icon: Activity },
  { status: 'active',     label: 'Live',       tint: 'bg-emerald-50 text-emerald-700 ring-emerald-100', Icon: Activity },
  { status: 'paused',     label: 'Paused',     tint: 'bg-zinc-100 text-zinc-700 ring-zinc-200',     Icon: Pause },
  { status: 'completed',  label: 'Ended',      tint: 'bg-ink-7 text-ink-3 ring-ink-6',              Icon: CheckCircle2 },
  { status: 'cancelled',  label: 'Cancelled',  tint: 'bg-rose-50 text-rose-700 ring-rose-100',      Icon: XCircle },
]

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

export default async function AdsPipelinePage() {
  // Auth gate
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'admin' && profile?.role !== 'super_admin') redirect('/dashboard')

  const { campaigns, summary } = await getAdsPipeline()

  // Group campaigns by status for the pipeline columns.
  const byStatus = new Map<CampaignStatus, PipelineCampaign[]>()
  for (const c of campaigns) {
    if (!byStatus.has(c.status)) byStatus.set(c.status, [])
    byStatus.get(c.status)!.push(c)
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 lg:px-6 pt-6 pb-20 space-y-6">
      {/* Header */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">Admin</p>
        <h1 className="text-[26px] font-semibold text-ink leading-tight mt-1 flex items-center gap-2">
          <Megaphone className="w-6 h-6 text-ink-4" />
          Ads pipeline
        </h1>
        <p className="text-ink-3 text-sm mt-0.5">
          Every paid campaign across every client. {campaigns.length} total · {summary.byStatus.active + summary.byStatus.launching + summary.byStatus.paused} active.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard
          icon={<TrendingUp className="w-4 h-4" />}
          label="Spend, last 30 days"
          value={fmtMoney(summary.spendLast30d)}
          sub="across launched campaigns"
        />
        <SummaryCard
          icon={<Activity className="w-4 h-4" />}
          label="Active budget"
          value={fmtMoney(summary.budgetActive)}
          sub={`${summary.byStatus.active + summary.byStatus.launching + summary.byStatus.paused} campaigns running`}
        />
        <SummaryCard
          icon={<Clock className="w-4 h-4" />}
          label="Requests"
          value={String(summary.byStatus.pending)}
          sub={summary.stuckPendingCount > 0
            ? `${summary.stuckPendingCount} stuck > 3 days`
            : 'all moving'}
          tone={summary.stuckPendingCount > 0 ? 'alert' : 'normal'}
        />
        <SummaryCard
          icon={<AlertCircle className="w-4 h-4" />}
          label="Last metrics sync"
          value={summary.lastMetricsSyncAt ? daysAgo(summary.lastMetricsSyncAt) : 'never'}
          sub="auto-pull from Meta API"
        />
      </div>

      {/* Pipeline columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {STATUS_COLUMNS.map(col => {
          const items = byStatus.get(col.status) ?? []
          const ColIcon = col.Icon
          return (
            <div key={col.status} className="bg-bg-2/60 rounded-2xl p-3 min-h-[120px]">
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-1.5">
                  <span className={`inline-flex items-center justify-center w-6 h-6 rounded-md ring-1 ${col.tint}`}>
                    <ColIcon className="w-3 h-3" />
                  </span>
                  <span className="text-[12.5px] font-semibold text-ink">{col.label}</span>
                </div>
                <span className="text-[11px] font-medium text-ink-3 tabular-nums">{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.slice(0, 30).map(c => <CampaignCard key={c.id} campaign={c} />)}
                {items.length === 0 && (
                  <p className="text-[11px] text-ink-4 px-1 py-2">No campaigns.</p>
                )}
                {items.length > 30 && (
                  <p className="text-[11px] text-ink-4 px-1">+{items.length - 30} more</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SummaryCard({
  icon, label, value, sub, tone = 'normal',
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub: string
  tone?: 'normal' | 'alert'
}) {
  const ring = tone === 'alert' ? 'ring-1 ring-rose-200 bg-rose-50/60' : 'border border-ink-6 bg-white'
  return (
    <div className={`rounded-2xl ${ring} p-4`}>
      <div className="flex items-center gap-1.5 mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-3">
        <span className="text-ink-4">{icon}</span>
        {label}
      </div>
      <p className={`text-[24px] font-bold leading-none tabular-nums ${tone === 'alert' ? 'text-rose-700' : 'text-ink'}`}>
        {value}
      </p>
      <p className="text-[11.5px] text-ink-4 mt-1.5">{sub}</p>
    </div>
  )
}

function CampaignCard({ campaign }: { campaign: PipelineCampaign }) {
  const typeTint = TYPE_TINTS[campaign.campaignType] ?? 'bg-ink-7 text-ink-2 ring-ink-6'
  const remaining = Math.max(0, campaign.budgetTotal - campaign.spend)
  const pctSpent = campaign.budgetTotal > 0
    ? Math.min(100, Math.round((campaign.spend / campaign.budgetTotal) * 100))
    : 0

  return (
    <Link
      href={`/admin/clients/${campaign.clientSlug ?? campaign.clientId}?tab=performance&campaign=${campaign.id}`}
      className="block bg-white rounded-xl border border-ink-6 hover:border-ink-4 hover:shadow-sm transition-all p-2.5 group"
    >
      <div className="flex items-center justify-between gap-1 mb-1.5">
        <span className={`inline-flex items-center text-[9.5px] font-semibold px-1.5 py-0.5 rounded ring-1 ${typeTint}`}>
          {TYPE_LABELS[campaign.campaignType]}
        </span>
        <span className="text-[9.5px] text-ink-4 tabular-nums">
          {fmtMoney(campaign.budgetTotal)} · {campaign.days}d
        </span>
      </div>
      <p className="text-[12px] font-semibold text-ink truncate group-hover:text-brand-dark">
        {campaign.clientName}
      </p>
      {(campaign.status === 'active' || campaign.status === 'launching' || campaign.status === 'paused') && campaign.budgetTotal > 0 && (
        <>
          <div className="mt-2 h-1 bg-bg-3 rounded overflow-hidden">
            <div className="h-full bg-brand" style={{ width: `${pctSpent}%` }} />
          </div>
          <div className="flex items-center justify-between mt-1 text-[10px] text-ink-4 tabular-nums">
            <span>{fmtMoney(campaign.spend)} spent</span>
            <span>{fmtMoney(remaining)} left</span>
          </div>
        </>
      )}
      {campaign.status === 'pending' && (
        <p className="text-[10px] text-ink-4 mt-1">Requested {daysAgo(campaign.createdAt)}</p>
      )}
      {(campaign.status === 'active' || campaign.status === 'launching') && campaign.reach > 0 && (
        <p className="text-[10px] text-ink-3 mt-1.5 tabular-nums">
          {fmtCompact(campaign.reach)} reach · {campaign.clicks} clicks
        </p>
      )}
    </Link>
  )
}
