'use client'

import { useState, useEffect, useCallback, use } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  ArrowLeft, Users, Eye, TrendingUp, TrendingDown, Minus, Search, Target,
  MessageCircle, Newspaper,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useClient } from '@/lib/client-context'

interface BriefHighlight {
  label: string
  value: string
  insight: string | null
}

interface Brief {
  id: string
  week_starting: string
  week_ending: string
  unique_visitors: number | null
  visitor_trend_pct: number | null
  sessions: number | null
  sessions_trend_pct: number | null
  page_views: number | null
  bounce_rate: number | null
  avg_session_duration: number | null
  search_impressions: number | null
  search_clicks: number | null
  search_trend_pct: number | null
  top_search_query: string | null
  conversion_total: number | null
  conversion_trend_pct: number | null
  headline: string | null
  narrative: string | null
  highlights: BriefHighlight[] | null
  top_sources: string[] | null
  next_week_preview: string | null
  viewed_at: string | null
  published_at: string | null
}

function formatRange(start: string, end: string): string {
  const s = new Date(start + 'T00:00:00Z')
  const e = new Date(end + 'T00:00:00Z')
  return `${s.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' })} – ${e.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}`
}

export default function BriefDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const supabase = createClient()
  const { client } = useClient()
  const [brief, setBrief] = useState<Brief | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFoundState, setNotFoundState] = useState(false)

  const load = useCallback(async () => {
    if (!client?.id) { setLoading(false); return }
    const { data } = await supabase
      .from('weekly_briefs')
      .select('*')
      .eq('id', id)
      .eq('client_id', client.id)
      .maybeSingle()

    if (!data) {
      setNotFoundState(true)
      setLoading(false)
      return
    }
    setBrief(data as Brief)
    setLoading(false)

    // Mark as viewed
    if (!data.viewed_at) {
      await supabase
        .from('weekly_briefs')
        .update({
          viewed_at: new Date().toISOString(),
          view_count: (data.view_count ?? 0) + 1,
          status: 'viewed',
        })
        .eq('id', id)
    } else {
      await supabase
        .from('weekly_briefs')
        .update({ view_count: (data.view_count ?? 0) + 1 })
        .eq('id', id)
    }
  }, [client?.id, id, supabase])

  useEffect(() => { load() }, [load])

  if (notFoundState) notFound()
  if (loading || !brief) {
    return (
      <div className="max-w-3xl mx-auto space-y-4 animate-pulse">
        <div className="h-6 w-32 bg-ink-6 rounded" />
        <div className="h-10 w-3/4 bg-ink-6 rounded" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-ink-6 h-24" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <Link href="/dashboard/briefs" className="inline-flex items-center gap-1.5 text-xs text-ink-4 hover:text-ink transition-colors mb-4">
          <ArrowLeft className="w-3.5 h-3.5" />
          All briefs
        </Link>
        <div className="flex items-center gap-2 text-xs text-ink-3 mb-2">
          <Newspaper className="w-3.5 h-3.5" />
          <span>Weekly Brief · {formatRange(brief.week_starting, brief.week_ending)}</span>
        </div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl text-ink leading-tight">
          {brief.headline}
        </h1>
      </div>

      {/* Highlights grid */}
      {brief.highlights && brief.highlights.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {brief.highlights.map((h, i) => (
            <div key={i} className="bg-white rounded-xl border border-ink-6 p-4">
              <div className="text-[10px] text-ink-3 uppercase tracking-wide mb-2">{h.label}</div>
              <div className="font-[family-name:var(--font-display)] text-2xl text-ink">{h.value}</div>
              {h.insight && (
                <div className="text-[11px] text-ink-3 mt-1">{h.insight}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Narrative */}
      {brief.narrative && (
        <div className="bg-white rounded-xl border border-ink-6 p-6">
          <p className="text-[15px] text-ink-2 leading-relaxed whitespace-pre-wrap">
            {brief.narrative}
          </p>
        </div>
      )}

      {/* Detail grid */}
      <div className="grid grid-cols-2 gap-4">
        <MetricBlock
          icon={Users}
          label="Visitors"
          value={brief.unique_visitors}
          trend={brief.visitor_trend_pct}
        />
        <MetricBlock
          icon={Eye}
          label="Pageviews"
          value={brief.page_views}
          trend={null}
        />
        <MetricBlock
          icon={TrendingUp}
          label="Sessions"
          value={brief.sessions}
          trend={brief.sessions_trend_pct}
        />
        <MetricBlock
          icon={Target}
          label="Conversions"
          value={brief.conversion_total}
          trend={brief.conversion_trend_pct}
        />
      </div>

      {/* Search */}
      {brief.search_impressions != null && brief.search_impressions > 0 && (
        <div className="bg-white rounded-xl border border-ink-6 p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink mb-3">
            <Search className="w-4 h-4 text-ink-4" />
            Search performance
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-[10px] text-ink-3 uppercase tracking-wide">Impressions</div>
              <div className="font-[family-name:var(--font-display)] text-xl text-ink mt-1">
                {brief.search_impressions.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-ink-3 uppercase tracking-wide">Clicks</div>
              <div className="font-[family-name:var(--font-display)] text-xl text-ink mt-1">
                {brief.search_clicks?.toLocaleString() ?? 0}
              </div>
            </div>
            {brief.top_search_query && (
              <div className="col-span-1">
                <div className="text-[10px] text-ink-3 uppercase tracking-wide">Top Query</div>
                <div className="text-sm text-ink mt-1 truncate">&ldquo;{brief.top_search_query}&rdquo;</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Next week */}
      {brief.next_week_preview && (
        <div className="bg-brand-tint/30 rounded-xl border border-brand-tint p-5">
          <div className="text-xs font-semibold text-brand-dark uppercase tracking-wide mb-2">Looking ahead</div>
          <p className="text-sm text-ink-2 leading-relaxed">{brief.next_week_preview}</p>
        </div>
      )}

      {/* Footer: contact AM */}
      <div className="border-t border-ink-6 pt-6 text-center">
        <p className="text-xs text-ink-4 mb-2">Questions about this brief?</p>
        <Link
          href="/dashboard/messages"
          className="inline-flex items-center gap-1.5 text-sm text-brand-dark hover:underline"
        >
          <MessageCircle className="w-3.5 h-3.5" />
          Message your account manager
        </Link>
      </div>
    </div>
  )
}

function MetricBlock({
  icon: Icon, label, value, trend,
}: {
  icon: typeof Users
  label: string
  value: number | null
  trend: number | null
}) {
  const TrendIcon = trend == null ? Minus : trend > 0 ? TrendingUp : trend < 0 ? TrendingDown : Minus
  const trendColor = trend == null ? 'text-ink-4' : trend > 0 ? 'text-emerald-600' : trend < 0 ? 'text-red-500' : 'text-ink-4'
  return (
    <div className="bg-white rounded-xl border border-ink-6 p-4">
      <div className="flex items-center justify-between mb-2">
        <Icon className="w-4 h-4 text-ink-3" />
        {trend != null && (
          <span className={`text-[10px] font-medium flex items-center gap-0.5 ${trendColor}`}>
            <TrendIcon className="w-3 h-3" />
            {trend > 0 ? '+' : ''}{trend}%
          </span>
        )}
      </div>
      <div className="font-[family-name:var(--font-display)] text-xl text-ink">
        {value?.toLocaleString() ?? '—'}
      </div>
      <div className="text-[10px] text-ink-3 uppercase tracking-wide mt-0.5">{label}</div>
    </div>
  )
}
