'use client'

import { useState, useMemo, useCallback } from 'react'
import { BarChart3 } from 'lucide-react'
import { useBusiness } from '@/lib/supabase/hooks'
import { useClientGBPData } from '@/hooks/useGBPData'
import { fetchAiAnalysis } from '@/lib/ai-analysis'
import MobileAnalytics from './mobile-analytics'
import {
  GBPMetricCard, METRIC_CARD_CONFIGS, METRIC_ICONS,
  GBPChart, DEFAULT_METRICS, VIEWS_METRICS,
  PeriodSelector, AiAnalysisPanel,
} from '@/components/analytics'
import type { Period } from '@/components/analytics'
import type { GBPMonthlyData, AiAnalysis } from '@/types/database'

function periodToMonths(p: Period): number | undefined {
  if (p === '1') return 1
  if (p === '3') return 3
  if (p === '6') return 6
  return undefined
}

function getLatestRow(data: GBPMonthlyData[]): GBPMonthlyData | null {
  if (!data.length) return null
  return [...data].sort((a, b) => b.year === a.year ? b.month - a.month : b.year - a.year)[0]
}

function getPreviousRow(data: GBPMonthlyData[], latest: GBPMonthlyData): GBPMonthlyData | null {
  const prevMonth = latest.month === 1 ? 12 : latest.month - 1
  const prevYear = latest.month === 1 ? latest.year - 1 : latest.year
  return data.find(d => d.month === prevMonth && d.year === prevYear) || null
}

function getYearAgoRow(data: GBPMonthlyData[], latest: GBPMonthlyData): GBPMonthlyData | null {
  return data.find(d => d.month === latest.month && d.year === latest.year - 1) || null
}

export default function ClientAnalyticsPage() {
  const [period, setPeriod] = useState<Period>('6')
  const [aiAnalysis, setAiAnalysis] = useState<AiAnalysis | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const months = periodToMonths(period)

  const { data: business, loading: bizLoading } = useBusiness()
  const businessId = business?.id || ''
  const { data, loading: dataLoading } = useClientGBPData(businessId, months)

  const loading = bizLoading || dataLoading

  const latest = useMemo(() => getLatestRow(data), [data])
  const previous = useMemo(() => latest ? getPreviousRow(data, latest) : null, [data, latest])
  const yearAgo = useMemo(() => latest ? getYearAgoRow(data, latest) : null, [data, latest])

  const sortedAsc = useMemo(() =>
    [...data].sort((a, b) => a.year === b.year ? a.month - b.month : a.year - b.year),
    [data]
  )

  const runAiAnalysis = useCallback(async () => {
    if (sortedAsc.length < 2 || !business?.name) return
    setAiLoading(true)
    try {
      const result = await fetchAiAnalysis({
        businessId,
        businessName: business.name,
        agencyName: 'Apnosh',
        period,
        sortedAsc,
      })
      setAiAnalysis(result)
    } catch (e) {
      console.error('AI analysis error:', e)
    } finally {
      setAiLoading(false)
    }
  }, [businessId, business?.name, period, sortedAsc])

  const visibleMetrics = useMemo(() => {
    if (!latest) return []
    return METRIC_CARD_CONFIGS.filter(cfg => cfg.compute(latest) > 0)
  }, [latest])

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="h-8 w-48 bg-ink-6 rounded animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-32 bg-ink-6 rounded-xl animate-pulse" />)}
        </div>
        <div className="grid lg:grid-cols-2 gap-4">
          {[1, 2].map(i => <div key={i} className="h-80 bg-ink-6 rounded-xl animate-pulse" />)}
        </div>
      </div>
    )
  }

  if (!data.length) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">Analytics</h1>
          <p className="text-ink-3 text-sm mt-1">Your Google Business Profile performance.</p>
        </div>
        <div className="rounded-2xl bg-white/55 backdrop-blur-xl border border-white/70 p-12 text-center">
          <BarChart3 className="w-10 h-10 text-ink-4 mx-auto mb-3" />
          <h2 className="text-lg font-[family-name:var(--font-display)] text-ink mb-1">No data yet</h2>
          <p className="text-ink-3 text-sm max-w-md mx-auto">
            Your analytics dashboard will show up here once we start tracking your Google Business Profile performance.
          </p>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* ─── MOBILE ANALYTICS ─────────────────────────────────────
          Visually-rich operator dashboard for phone. Same data
          source as the desktop view, presented as a hero metric +
          channel breakdown + action tiles + reviews + social +
          AI insights. Built mobile-first; desktop falls through to
          the original chart-heavy layout below. */}
      <div className="lg:hidden">
        <MobileAnalytics />
      </div>

      <div className="hidden lg:block max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">Analytics</h1>
          <p className="text-ink-3 text-sm mt-1">Your Google Business Profile performance.</p>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {visibleMetrics.map(cfg => {
          const Icon = METRIC_ICONS[cfg.key] || METRIC_ICONS.total_interactions
          return (
            <GBPMetricCard
              key={cfg.key}
              label={cfg.label}
              note={cfg.note}
              icon={Icon}
              value={latest ? cfg.compute(latest) : 0}
              previousValue={previous ? cfg.compute(previous) : null}
              yearAgoValue={yearAgo ? cfg.compute(yearAgo) : null}
            />
          )
        })}
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-4">
        <GBPChart data={data} metrics={DEFAULT_METRICS} title="Interactions" />
        <GBPChart data={data} metrics={VIEWS_METRICS} title="Profile Views" />
      </div>

      {/* AI Analysis */}
      {!aiAnalysis && !aiLoading && sortedAsc.length >= 2 && (
        <button
          onClick={runAiAnalysis}
          className="px-4 py-2 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-dark transition-colors"
        >
          Generate AI Analysis
        </button>
      )}
      <AiAnalysisPanel analysis={aiAnalysis} loading={aiLoading} onRefresh={runAiAnalysis} />
      </div>
    </>
  )
}
