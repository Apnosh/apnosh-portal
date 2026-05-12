'use client'

/**
 * Boost view: pick a post, pick a budget, send for strategist approval.
 *
 * "Send for approval" POSTs /api/social/boost which writes a row to
 * ad_campaigns (status='pending'). The strategist sees it in
 * /work/boosts and launches it in Meta Ads Manager; direct Meta Ads
 * API launch can replace that step later.
 */

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Zap, Calendar as CalendarIcon, Users, BarChart3, Info,
  Image as ImageIcon, Check, Loader2, TrendingUp, Clock, Play, Pause,
  MousePointer2, Eye,
} from 'lucide-react'
import type { SocialPostCard, TopPerformer } from '@/lib/dashboard/get-social-hub'
import type { CampaignRow, CampaignStatus } from '@/lib/dashboard/get-campaigns'

interface Props {
  clientId: string
  preselectedPostId: string | null
  candidates: SocialPostCard[]
  topPerformer: TopPerformer | null
  activeCampaigns: CampaignRow[]
  pastCampaigns: CampaignRow[]
}

const BUDGET_PRESETS = [
  { value: 25,  label: '$25',  est: '~1,000 reach',   tone: 'subtle' },
  { value: 50,  label: '$50',  est: '~2,500 reach',   tone: 'subtle' },
  { value: 100, label: '$100', est: '~5,500 reach',   tone: 'popular' },
  { value: 200, label: '$200', est: '~12,000 reach',  tone: 'subtle' },
]

const DURATION_PRESETS = [
  { value: 3,  label: '3 days'  },
  { value: 7,  label: '7 days',  popular: true },
  { value: 14, label: '14 days' },
]

const AUDIENCE_PRESETS = [
  { value: 'locals',  label: 'Locals',         sub: 'Within 5 miles of your restaurant' },
  { value: 'foodies', label: 'Food enthusiasts', sub: 'Locals who follow food / dining accounts' },
  { value: 'recent',  label: 'Recent visitors', sub: 'People who interacted with you in the last 90 days' },
]

export default function BoostView({
  clientId, preselectedPostId, candidates, topPerformer,
  activeCampaigns, pastCampaigns,
}: Props) {
  const router = useRouter()
  const initialPostId =
    preselectedPostId ??
    topPerformer?.postId ??
    candidates[0]?.id ??
    null

  const [postId, setPostId] = useState<string | null>(initialPostId)
  const [budget, setBudget] = useState<number>(100)
  const [days, setDays] = useState<number>(7)
  const [audience, setAudience] = useState<string>('locals')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedPost = useMemo(
    () => candidates.find(c => c.id === postId) ?? null,
    [candidates, postId],
  )

  const dailySpend = budget / days
  const estReach = Math.round(budget * 55) // ~55 reach/$1 baseline

  async function submit() {
    if (!postId) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/social/boost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, postId, budget, days, audience }),
      })
      if (!res.ok) throw new Error(await res.text() || `Server returned ${res.status}`)
      setSubmitted(true)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not submit. Try again in a moment.')
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="max-w-3xl mx-auto py-12 px-4">
        <div className="rounded-3xl border bg-gradient-to-br from-emerald-50/60 via-white to-white p-10 text-center" style={{ borderColor: 'var(--db-border, #e8efe9)' }}>
          <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200 flex items-center justify-center mb-4">
            <Check className="w-6 h-6" strokeWidth={2.5} />
          </div>
          <h1 className="text-[24px] font-bold text-ink tracking-tight">
            Boost request sent
          </h1>
          <p className="text-[14px] text-ink-2 mt-2 max-w-md mx-auto leading-relaxed">
            Your strategist confirms targeting and launches today.
            You&rsquo;ll see daily reach in <span className="font-semibold">/dashboard/social/boost</span> once it&rsquo;s live.
          </p>
          <div className="flex justify-center gap-2 mt-6">
            <Link
              href="/dashboard/social"
              className="inline-flex items-center text-[13px] font-semibold bg-ink text-white rounded-full px-4 py-2 hover:bg-ink/90"
            >
              Back to social hub
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 lg:px-6">
      <header className="mb-7">
        <Link
          href="/dashboard/social"
          className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-3 hover:text-ink mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back
        </Link>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
            <Zap className="w-4.5 h-4.5" />
          </div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-3 leading-none">
            Boost a post
          </p>
        </div>
        <h1 className="text-[28px] sm:text-[30px] leading-tight font-bold text-ink tracking-tight">
          Push paid reach behind a winner
        </h1>
        <p className="text-[14px] text-ink-2 mt-2 leading-relaxed max-w-2xl">
          Boosting puts ad dollars behind a post that&rsquo;s already working. Your strategist
          confirms the targeting and launches in Meta Ads Manager within a few hours.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-7">
        {/* Left: post selection + targeting */}
        <section className="space-y-7">
          {/* Pick a post */}
          <div>
            <p className="text-[13px] font-semibold text-ink mb-2">Pick a post</p>
            {candidates.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed p-8 text-center bg-white" style={{ borderColor: 'var(--db-border, #e5e5e5)' }}>
                <p className="text-[13px] text-ink-3">
                  No published posts yet. Boosting unlocks once your first batch is live.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {candidates.map(p => (
                  <PostThumb
                    key={p.id}
                    post={p}
                    selected={p.id === postId}
                    isTop={topPerformer?.postId === p.id}
                    onClick={() => setPostId(p.id)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Budget */}
          <div>
            <p className="text-[13px] font-semibold text-ink mb-2">Total budget</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {BUDGET_PRESETS.map(b => {
                const selected = budget === b.value
                return (
                  <button
                    key={b.value}
                    onClick={() => setBudget(b.value)}
                    className={`relative rounded-xl border bg-white p-3 text-left transition-all ${
                      selected ? 'border-ink shadow-sm' : 'border-ink-6 hover:border-ink-4'
                    }`}
                  >
                    {b.tone === 'popular' && (
                      <span className="absolute -top-2 left-3 text-[9px] font-semibold uppercase tracking-wider bg-emerald-600 text-white px-1.5 py-0.5 rounded">
                        Popular
                      </span>
                    )}
                    <p className="text-[18px] font-bold text-ink tabular-nums">{b.label}</p>
                    <p className="text-[11px] text-ink-3 mt-0.5">{b.est}</p>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Duration */}
          <div>
            <p className="text-[13px] font-semibold text-ink mb-2">How long</p>
            <div className="flex flex-wrap gap-2">
              {DURATION_PRESETS.map(d => {
                const selected = days === d.value
                return (
                  <button
                    key={d.value}
                    onClick={() => setDays(d.value)}
                    className={`inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-full transition-all ${
                      selected
                        ? 'bg-ink text-white'
                        : 'bg-white border border-ink-6 text-ink-2 hover:border-ink-4'
                    }`}
                  >
                    {d.label}
                    {d.popular && !selected && (
                      <span className="text-[9px] font-semibold uppercase text-emerald-700">popular</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Audience */}
          <div>
            <p className="text-[13px] font-semibold text-ink mb-2">Who should see it</p>
            <div className="space-y-2">
              {AUDIENCE_PRESETS.map(a => {
                const selected = audience === a.value
                return (
                  <button
                    key={a.value}
                    onClick={() => setAudience(a.value)}
                    className={`w-full flex items-start gap-3 rounded-xl border bg-white p-3 text-left transition-all ${
                      selected ? 'border-ink shadow-sm' : 'border-ink-6 hover:border-ink-4'
                    }`}
                  >
                    <span className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                      selected ? 'border-ink' : 'border-ink-5'
                    }`}>
                      {selected && <span className="w-2 h-2 rounded-full bg-ink" />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-ink leading-tight">{a.label}</p>
                      <p className="text-[11px] text-ink-3 mt-0.5 leading-tight">{a.sub}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </section>

        {/* Right: summary card */}
        <aside>
          <div className="sticky top-6 rounded-2xl border bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.08)]"
            style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-3 mb-3">
              Summary
            </p>

            {selectedPost ? (
              <div className="flex items-start gap-3 mb-4 pb-4 border-b" style={{ borderColor: 'var(--db-border, #e5e5e5)' }}>
                {selectedPost.mediaUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={selectedPost.mediaUrl} alt="" className="w-14 h-14 rounded-md object-cover flex-shrink-0" />
                ) : (
                  <div className="w-14 h-14 rounded-md bg-bg-2 flex items-center justify-center flex-shrink-0">
                    <ImageIcon className="w-5 h-5 text-ink-4" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">
                    Boosting
                  </p>
                  <p className="text-[12px] text-ink-2 mt-0.5 line-clamp-2 leading-snug">
                    {selectedPost.text || 'Selected post'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="rounded-md bg-bg-2 p-3 mb-4 text-[12px] text-ink-3 leading-snug">
                Pick a post on the left to continue.
              </div>
            )}

            <SummaryRow icon={<BarChart3 className="w-3.5 h-3.5" />} label="Total budget" value={`$${budget}`} />
            <SummaryRow icon={<CalendarIcon className="w-3.5 h-3.5" />} label="Runs for" value={`${days} days`} />
            <SummaryRow icon={<TrendingUp className="w-3.5 h-3.5" />} label="Daily spend" value={`~$${dailySpend.toFixed(2)}/day`} />
            <SummaryRow icon={<Users className="w-3.5 h-3.5" />} label="Audience" value={AUDIENCE_PRESETS.find(a => a.value === audience)?.label ?? '—'} />

            <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--db-border, #e5e5e5)' }}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-700 mb-1">
                Estimated reach
              </p>
              <p className="text-[24px] font-bold text-ink tabular-nums leading-none">
                {formatCompact(estReach)} <span className="text-[14px] font-medium text-ink-3">people</span>
              </p>
              <p className="text-[10px] text-ink-4 mt-1.5 leading-snug">
                Estimates use Meta&rsquo;s average reach-per-dollar for local food businesses. Actual results vary.
              </p>
            </div>

            {error && (
              <div className="mt-4 rounded-md bg-rose-50 border border-rose-200 px-3 py-2 text-[12px] text-rose-700">
                {error}
              </div>
            )}

            <button
              onClick={submit}
              disabled={!postId || submitting}
              className="mt-4 w-full inline-flex items-center justify-center gap-2 text-[13px] font-semibold bg-emerald-600 hover:bg-emerald-700 disabled:bg-ink-6 disabled:cursor-not-allowed text-white rounded-full px-4 py-2.5 transition-colors"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
              {submitting ? 'Sending…' : `Send for approval · $${budget}`}
            </button>
            <p className="text-[10px] text-ink-4 mt-2 leading-snug text-center px-2">
              Your strategist confirms targeting and launches today. You can pause anytime.
            </p>
          </div>

          {activeCampaigns.length === 0 && pastCampaigns.length === 0 && (
            <div className="mt-4 rounded-xl border bg-bg-2/60 p-3 flex items-start gap-2" style={{ borderColor: 'var(--db-border, #e5e5e5)' }}>
              <Info className="w-3.5 h-3.5 text-ink-4 mt-0.5 flex-shrink-0" />
              <p className="text-[11px] text-ink-3 leading-snug">
                Active campaigns and historical results show up here once your first boost has launched.
              </p>
            </div>
          )}
        </aside>
      </div>

      {/* Active campaigns rail */}
      {activeCampaigns.length > 0 && (
        <section className="mt-10">
          <h2 className="text-[16px] font-bold text-ink tracking-tight mb-3">
            Active campaigns
          </h2>
          <ul className="space-y-2">
            {activeCampaigns.map(c => <CampaignRowCard key={c.id} campaign={c} variant="active" />)}
          </ul>
        </section>
      )}

      {/* Past campaigns rail */}
      {pastCampaigns.length > 0 && (
        <section className="mt-8">
          <h2 className="text-[16px] font-bold text-ink tracking-tight mb-3">
            Past campaigns
          </h2>
          <ul className="space-y-2">
            {pastCampaigns.map(c => <CampaignRowCard key={c.id} campaign={c} variant="past" />)}
          </ul>
        </section>
      )}
    </div>
  )
}

/* ───────────────────────────── Campaign row ───────────────────────────── */

const STATUS_TONE: Record<CampaignStatus, { label: string; bg: string; text: string; Icon: React.ComponentType<{ className?: string }> }> = {
  pending:    { label: 'Awaiting launch',     bg: 'bg-amber-50',  text: 'text-amber-700',  Icon: Clock },
  launching:  { label: 'Launching',           bg: 'bg-sky-50',    text: 'text-sky-700',    Icon: Loader2 },
  active:     { label: 'Active',              bg: 'bg-emerald-50', text: 'text-emerald-700', Icon: Play },
  paused:     { label: 'Paused',              bg: 'bg-ink-7',     text: 'text-ink-3',      Icon: Pause },
  completed:  { label: 'Completed',           bg: 'bg-ink-7',     text: 'text-ink-3',      Icon: Check },
  cancelled:  { label: 'Cancelled',           bg: 'bg-rose-50',   text: 'text-rose-700',   Icon: Info },
}

const AUDIENCE_SHORT: Record<string, string> = {
  locals: 'Locals',
  foodies: 'Food enthusiasts',
  recent: 'Recent visitors',
}

function CampaignRowCard({ campaign, variant }: { campaign: CampaignRow; variant: 'active' | 'past' }) {
  const tone = STATUS_TONE[campaign.status]
  const ToneIcon = tone.Icon
  const days = campaign.days
  const startedDays = campaign.launchedAt
    ? Math.floor((Date.now() - new Date(campaign.launchedAt).getTime()) / 86_400_000)
    : null
  const cpm = campaign.reach > 0 ? (campaign.spend / campaign.reach) * 1000 : null
  return (
    <li>
      <div
        className="rounded-xl border bg-white p-4 flex items-start gap-4"
        style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
      >
        {campaign.sourceMediaUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={campaign.sourceMediaUrl} alt="" className="w-14 h-14 sm:w-16 sm:h-16 rounded-md object-cover flex-shrink-0" />
        ) : (
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-md bg-bg-2 flex items-center justify-center flex-shrink-0">
            <ImageIcon className="w-5 h-5 text-ink-4" />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${tone.bg} ${tone.text}`}>
              <ToneIcon className={`w-2.5 h-2.5 ${campaign.status === 'launching' ? 'animate-spin' : ''}`} />
              {tone.label}
            </span>
            <span className="text-[11px] text-ink-4">
              {AUDIENCE_SHORT[campaign.audiencePreset] ?? campaign.audiencePreset} ·{' '}
              ${Number(campaign.budgetTotal).toFixed(0)} × {days}d
            </span>
          </div>
          <p className="text-[13px] font-medium text-ink leading-snug line-clamp-2">
            {campaign.sourceText || 'Boosted post'}
          </p>
          {variant === 'active' && campaign.status === 'active' && startedDays !== null && (
            <p className="text-[11px] text-ink-3 mt-1.5">
              Day {Math.min(startedDays + 1, days)} of {days} · ~${(campaign.spend).toFixed(0)} spent
            </p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-4 sm:gap-6 flex-shrink-0 text-right">
          <Metric icon={<Eye className="w-3 h-3" />} label="Reach" value={formatCompact(campaign.reach)} />
          <Metric icon={<MousePointer2 className="w-3 h-3" />} label="Clicks" value={formatCompact(campaign.clicks)} />
          <Metric icon={<TrendingUp className="w-3 h-3" />} label={cpm ? 'CPM' : 'Spend'} value={cpm ? `$${cpm.toFixed(2)}` : `$${campaign.spend.toFixed(0)}`} />
        </div>
      </div>
    </li>
  )
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-4 mb-1 flex items-center justify-end gap-1">
        {icon}
        {label}
      </p>
      <p className="text-[14px] font-bold text-ink tabular-nums leading-none">{value}</p>
    </div>
  )
}

function PostThumb({
  post, selected, isTop, onClick,
}: {
  post: SocialPostCard; selected: boolean; isTop: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`group relative aspect-square rounded-xl overflow-hidden bg-bg-2 border-2 transition-all ${
        selected ? 'border-ink shadow-sm' : 'border-transparent hover:border-ink-5'
      }`}
    >
      {post.mediaUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={post.mediaUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-3 text-center">
          <ImageIcon className="w-5 h-5 text-ink-4 mb-1.5" />
          <p className="text-[10px] text-ink-3 leading-snug line-clamp-3">{post.text || 'Untitled post'}</p>
        </div>
      )}
      {isTop && (
        <span className="absolute top-1.5 left-1.5 text-[9px] font-semibold uppercase tracking-wider bg-emerald-600 text-white px-1.5 py-0.5 rounded">
          Top
        </span>
      )}
      {selected && (
        <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-ink text-white flex items-center justify-center">
          <Check className="w-3 h-3" strokeWidth={3} />
        </span>
      )}
    </button>
  )
}

function SummaryRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-3">
        <span className="text-ink-4">{icon}</span>
        {label}
      </span>
      <span className="text-[12px] font-semibold text-ink tabular-nums">{value}</span>
    </div>
  )
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return `${n}`
}
