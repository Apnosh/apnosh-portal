'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Newspaper, ChevronRight, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeRefresh } from '@/lib/realtime'
import { useClient } from '@/lib/client-context'

interface BriefSummary {
  id: string
  week_starting: string
  week_ending: string
  headline: string
  unique_visitors: number | null
  visitor_trend_pct: number | null
  sessions: number | null
  conversion_total: number | null
  viewed_at: string | null
}

function formatRange(start: string, end: string): string {
  const s = new Date(start + 'T00:00:00Z')
  const e = new Date(end + 'T00:00:00Z')
  return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })} – ${e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`
}

export default function BriefsIndexPage() {
  const supabase = createClient()
  const { client, loading: clientLoading } = useClient()
  const [briefs, setBriefs] = useState<BriefSummary[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!client?.id) { setLoading(false); return }
    const { data } = await supabase
      .from('weekly_briefs')
      .select('id, week_starting, week_ending, headline, unique_visitors, visitor_trend_pct, sessions, conversion_total, viewed_at')
      .eq('client_id', client.id)
      .order('week_starting', { ascending: false })
    setBriefs((data ?? []) as BriefSummary[])
    setLoading(false)
  }, [client?.id, supabase])

  useEffect(() => { load() }, [load])
  useRealtimeRefresh(['weekly_briefs'], load)

  if (clientLoading || loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-4 animate-pulse">
        <div className="h-8 w-48 bg-ink-6 rounded" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-ink-6 h-24" />
        ))}
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-xl bg-brand-tint flex items-center justify-center flex-shrink-0">
          <Newspaper className="w-5 h-5 text-brand-dark" />
        </div>
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">Weekly Briefs</h1>
          <p className="text-ink-3 text-sm mt-0.5">A short summary of your website and search every Monday.</p>
        </div>
      </div>

      {briefs.length === 0 ? (
        <div className="bg-white rounded-xl border border-ink-6 p-12 text-center">
          <Newspaper className="w-6 h-6 text-ink-4 mx-auto mb-3" />
          <p className="text-sm font-medium text-ink-2">No briefs yet</p>
          <p className="text-xs text-ink-4 mt-1 max-w-xs mx-auto">
            Your first weekly brief will land next Monday. We&apos;ll summarize your traffic, search performance, and conversions.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {briefs.map(b => (
            <Link
              key={b.id}
              href={`/dashboard/briefs/${b.id}`}
              className="block bg-white rounded-xl border border-ink-6 p-5 hover:shadow-sm transition-shadow group"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-xs text-ink-4 mb-1">
                    <span>Week of {formatRange(b.week_starting, b.week_ending)}</span>
                    {!b.viewed_at && (
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-brand" title="New" />
                    )}
                  </div>
                  <h2 className="text-base font-semibold text-ink group-hover:text-brand-dark transition-colors">
                    {b.headline}
                  </h2>
                  <div className="flex items-center gap-4 mt-2 text-[11px] text-ink-3">
                    {b.unique_visitors != null && (
                      <TrendPill label={`${b.unique_visitors.toLocaleString()} visitors`} change={b.visitor_trend_pct} />
                    )}
                    {b.sessions != null && b.sessions > 0 && (
                      <span>{b.sessions.toLocaleString()} sessions</span>
                    )}
                    {b.conversion_total != null && b.conversion_total > 0 && (
                      <span>{b.conversion_total} conversions</span>
                    )}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-ink-4 flex-shrink-0 mt-1 group-hover:text-brand-dark transition-colors" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function TrendPill({ label, change }: { label: string; change: number | null }) {
  const Icon = change == null ? Minus : change > 0 ? TrendingUp : change < 0 ? TrendingDown : Minus
  const color = change == null ? 'text-ink-4' : change > 0 ? 'text-emerald-600' : change < 0 ? 'text-red-500' : 'text-ink-4'
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-ink-2">{label}</span>
      {change != null && (
        <span className={`inline-flex items-center gap-0.5 ${color}`}>
          <Icon className="w-3 h-3" />
          {change > 0 ? '+' : ''}{change}%
        </span>
      )}
    </span>
  )
}
