/**
 * Analyst view. Three sections:
 *   1. System counts — this week vs last week, delta arrows.
 *   2. Top posts — winners over the last 60 days.
 *   3. Per-client activity — who's getting served well, who's not.
 *
 * AI synthesis button rolls all three plus retrieval into a short
 * "what to brief upstream" memo. Useful for Monday strategy review.
 */

'use client'

import { useState, useCallback } from 'react'
import {
  BarChart3, TrendingUp, TrendingDown, Minus, Sparkles, Loader2, AlertCircle,
  FileText, CheckSquare, Send, Star, Bot, Megaphone, MessageCircle, Heart, ExternalLink,
} from 'lucide-react'
import type { PerformanceData, CountPair, TopPostRow, ClientActivityRow } from '@/lib/work/get-performance-data'

interface Insight { headline: string; detail: string; tag: 'opportunity' | 'risk' | 'signal' }

interface Props { initialData: PerformanceData }

export default function PerformanceView({ initialData }: Props) {
  const [insights, setInsights] = useState<Insight[] | null>(null)
  const [insightWhy, setInsightWhy] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const analyze = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/work/performance/analyze', { method: 'POST' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? `HTTP ${res.status}`)
      }
      const j = await res.json()
      setInsights(j.insights as Insight[])
      setInsightWhy(j.why ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setLoading(false)
    }
  }, [])

  return (
    <div className="max-w-5xl mx-auto py-7 px-4 lg:px-6 space-y-6">
      <header className="mb-2">
        <div className="flex items-center gap-3 mb-1.5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-blue-50 text-blue-700 ring-1 ring-blue-100 flex-shrink-0">
            <BarChart3 className="w-4 h-4" />
          </div>
          <h1 className="text-[22px] sm:text-[24px] leading-tight font-bold text-ink tracking-tight">
            This week across the book
          </h1>
        </div>
        <p className="text-[13px] text-ink-2 leading-relaxed max-w-2xl ml-10">
          The compounding loop in numbers. {initialData.bookSize} client{initialData.bookSize === 1 ? '' : 's'} in your book.
        </p>
      </header>

      {/* System counts grid */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <CountCard label="Drafts created"    icon={FileText}      pair={initialData.counts.draftsCreated} />
        <CountCard label="Approved"          icon={CheckSquare}   pair={initialData.counts.draftsApproved} />
        <CountCard label="Published"         icon={Send}          pair={initialData.counts.draftsPublished} />
        <CountCard label="Judgments"         icon={Star}          pair={initialData.counts.judgments} />
        <CountCard label="DM/comment replies" icon={MessageCircle} pair={initialData.counts.replies} />
        <CountCard label="Review replies"    icon={Star}          pair={initialData.counts.reviewReplies} />
        <CountCard label="Boosts launched"   icon={Megaphone}     pair={initialData.counts.boostsLaunched} />
        <CountCard label="AI generations"    icon={Bot}           pair={initialData.counts.aiGenerations} />
      </section>

      {/* AI synthesis */}
      <section className="bg-white rounded-2xl ring-1 ring-ink-6/60 p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h2 className="text-[16px] font-bold text-ink leading-tight">AI synthesis</h2>
            <p className="text-[12px] text-ink-3 mt-0.5">
              Patterns to brief upstream. Grounded in the data above + each client&rsquo;s retrieval context.
            </p>
          </div>
          <button onClick={analyze} disabled={loading}
            className="text-[12px] font-semibold px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-1.5 flex-shrink-0">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {insights ? 'Re-analyze' : 'Analyze book'}
          </button>
        </div>

        {error && (
          <div className="mb-3 flex items-start gap-1.5 text-[12px] text-red-700">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {!insights && !loading && (
          <p className="text-[13px] text-ink-3 italic py-2">
            Click <strong>Analyze book</strong> to get a 3-5 bullet brief on what&rsquo;s working, what&rsquo;s drifting, and what to push next.
          </p>
        )}

        {insights && (
          <div className="space-y-3">
            {insights.map((ins, i) => (
              <InsightCard key={i} insight={ins} />
            ))}
            {insightWhy && (
              <p className="text-[11px] text-ink-3 italic pt-1.5 border-t border-ink-6/40">
                {insightWhy}
              </p>
            )}
          </div>
        )}
      </section>

      {/* Top posts */}
      <section className="bg-white rounded-2xl ring-1 ring-ink-6/60 p-5">
        <h2 className="text-[16px] font-bold text-ink leading-tight mb-3">Top posts — last 60 days</h2>
        {initialData.topPosts.length === 0 ? (
          <p className="text-[13px] text-ink-3 italic py-2">No posts with outcome data yet. Sync Instagram to see winners here.</p>
        ) : (
          <div className="space-y-2.5">
            {initialData.topPosts.map(post => <TopPostRowEl key={post.postId} post={post} />)}
          </div>
        )}
      </section>

      {/* Per-client activity */}
      <section className="bg-white rounded-2xl ring-1 ring-ink-6/60 p-5">
        <h2 className="text-[16px] font-bold text-ink leading-tight mb-3">Client activity — this week</h2>
        {initialData.clientActivity.length === 0 ? (
          <p className="text-[13px] text-ink-3 italic py-2">No activity recorded yet this week.</p>
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-ink-3 border-b border-ink-6">
                  <th className="text-left font-semibold px-2 py-1.5">Client</th>
                  <th className="text-right font-semibold px-2 py-1.5">Drafts</th>
                  <th className="text-right font-semibold px-2 py-1.5">Published</th>
                  <th className="text-right font-semibold px-2 py-1.5">Engagement</th>
                  <th className="text-right font-semibold px-2 py-1.5">Replies</th>
                  <th className="text-right font-semibold px-2 py-1.5">Reviews</th>
                </tr>
              </thead>
              <tbody>
                {initialData.clientActivity.map(c => <ClientActivityRowEl key={c.clientId} row={c} />)}
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

function CountCard({ label, icon: Icon, pair }: { label: string; icon: React.ComponentType<{ className?: string }>; pair: CountPair }) {
  const delta = pair.thisWeek - pair.lastWeek
  const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
  const Trend = direction === 'up' ? TrendingUp : direction === 'down' ? TrendingDown : Minus
  const trendColor = direction === 'up' ? 'text-emerald-700' : direction === 'down' ? 'text-amber-700' : 'text-ink-4'
  return (
    <div className="bg-white rounded-xl ring-1 ring-ink-6/60 p-3">
      <div className="flex items-center justify-between mb-1.5">
        <Icon className="w-3.5 h-3.5 text-ink-3" />
        <span className={`text-[10px] font-semibold inline-flex items-center gap-0.5 ${trendColor}`}>
          <Trend className="w-3 h-3" />
          {Math.abs(delta)}
        </span>
      </div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-3 mb-0.5">{label}</p>
      <p className="text-[20px] font-bold text-ink leading-none">{pair.thisWeek}</p>
      <p className="text-[10px] text-ink-4 mt-1">last week: {pair.lastWeek}</p>
    </div>
  )
}

function TopPostRowEl({ post }: { post: TopPostRow }) {
  return (
    <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-ink-7/30">
      {post.mediaUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={post.mediaUrl} alt="" className="w-10 h-10 rounded-md object-cover flex-shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-[11px] font-semibold text-ink truncate">{post.clientName ?? '—'}</span>
          <span className="text-[10px] uppercase text-ink-4">{post.platform}</span>
          {post.permalink && (
            <a href={post.permalink} target="_blank" rel="noopener noreferrer" className="text-ink-4 hover:text-ink-2">
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
        <p className="text-[12px] text-ink-2 truncate">{post.caption || <span className="italic text-ink-4">No caption</span>}</p>
      </div>
      <div className="flex items-center gap-2 text-[11px] text-ink-2 flex-shrink-0">
        <span className="inline-flex items-center gap-1">
          <Heart className="w-3 h-3" /> {fmt(post.totalInteractions)}
        </span>
        {post.engagementRate !== null && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
            {(post.engagementRate * 100).toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  )
}

function ClientActivityRowEl({ row }: { row: ClientActivityRow }) {
  return (
    <tr className="border-b border-ink-6/30 hover:bg-ink-7/30">
      <td className="px-2 py-2 font-medium text-ink truncate max-w-[160px]">{row.clientName ?? row.clientId.slice(0, 6)}</td>
      <td className="px-2 py-2 text-right text-ink-2">{row.draftCount}</td>
      <td className="px-2 py-2 text-right text-ink-2">{row.publishedCount}</td>
      <td className="px-2 py-2 text-right text-ink-2">{fmt(row.totalEngagement)}</td>
      <td className="px-2 py-2 text-right text-ink-2">{row.repliesSent}</td>
      <td className="px-2 py-2 text-right text-ink-2">{row.reviewsAnswered}</td>
    </tr>
  )
}

function InsightCard({ insight }: { insight: Insight }) {
  const map = {
    opportunity: { bg: 'bg-emerald-50 ring-emerald-100', label: 'OPPORTUNITY', labelClass: 'text-emerald-800' },
    risk:        { bg: 'bg-amber-50 ring-amber-100',     label: 'RISK',        labelClass: 'text-amber-800' },
    signal:      { bg: 'bg-blue-50 ring-blue-100',       label: 'SIGNAL',      labelClass: 'text-blue-800' },
  } as const
  const tag = map[insight.tag] ?? map.signal
  return (
    <div className={`rounded-lg ring-1 p-3 ${tag.bg}`}>
      <p className={`text-[10px] font-bold tracking-wider mb-1 ${tag.labelClass}`}>{tag.label}</p>
      <p className="text-[13px] font-semibold text-ink leading-tight mb-1">{insight.headline}</p>
      <p className="text-[12px] text-ink-2 leading-relaxed">{insight.detail}</p>
    </div>
  )
}

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k'
  return String(n)
}
