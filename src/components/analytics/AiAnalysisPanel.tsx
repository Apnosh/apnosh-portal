'use client'

import { useState } from 'react'
import { Sparkles, RefreshCw, TrendingUp, AlertTriangle, ArrowRight, Search } from 'lucide-react'
import type { AiAnalysis } from '@/types/database'

interface AiAnalysisPanelProps {
  analysis: AiAnalysis | null
  loading?: boolean
  onRefresh?: () => void
}

export function AiAnalysisPanel({ analysis, loading, onRefresh }: AiAnalysisPanelProps) {
  const [expanded, setExpanded] = useState<string | null>(null)

  if (loading) {
    return (
      <div className="rounded-2xl bg-white/55 backdrop-blur-xl border border-white/70 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-brand-tint flex items-center justify-center">
            <Sparkles className="w-4.5 h-4.5 text-brand-dark animate-pulse" />
          </div>
          <div>
            <h3 className="font-[family-name:var(--font-display)] text-base text-ink">AI Analysis</h3>
            <p className="text-xs text-ink-4">Generating insights...</p>
          </div>
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-4 bg-ink-6 rounded animate-pulse" style={{ width: `${90 - i * 15}%` }} />
          ))}
        </div>
      </div>
    )
  }

  if (!analysis) {
    return (
      <div className="rounded-2xl bg-white/55 backdrop-blur-xl border border-white/70 p-6 text-center">
        <Sparkles className="w-8 h-8 text-ink-5 mx-auto mb-3" />
        <p className="text-sm text-ink-4">Not enough data for AI analysis yet.</p>
        <p className="text-xs text-ink-5 mt-1">Import at least 2 months of data to unlock insights.</p>
      </div>
    )
  }

  const sections = [
    {
      id: 'working',
      icon: TrendingUp,
      title: "What's working",
      color: 'text-emerald-600 bg-emerald-50',
      items: analysis.whatsWorking?.map(w => ({
        title: w.metric,
        body: w.insight,
        action: w.action,
      })) || [],
    },
    {
      id: 'concerns',
      icon: AlertTriangle,
      title: 'Areas to watch',
      color: 'text-amber-600 bg-amber-50',
      items: analysis.areasOfConcern?.map(c => ({
        title: c.metric,
        body: c.observation,
        action: c.action,
      })) || [],
    },
    {
      id: 'next',
      icon: ArrowRight,
      title: 'Next steps',
      color: 'text-blue-600 bg-blue-50',
      items: analysis.nextSteps?.map(s => ({
        title: `[${s.priority}] ${s.action}`,
        body: s.why,
        action: s.expectedImpact,
      })) || [],
    },
    {
      id: 'seo',
      icon: Search,
      title: 'SEO recommendations',
      color: 'text-purple-600 bg-purple-50',
      items: analysis.seoRecommendations?.items?.map(r => ({
        title: r.title,
        body: r.description,
        action: `Priority: ${r.priority}`,
      })) || [],
    },
  ]

  return (
    <div className="rounded-2xl bg-white/55 backdrop-blur-xl border border-white/70 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand-tint flex items-center justify-center">
            <Sparkles className="w-4.5 h-4.5 text-brand-dark" />
          </div>
          <div>
            <h3 className="font-[family-name:var(--font-display)] text-base text-ink">AI Analysis</h3>
            <p className="text-xs text-ink-4">Powered by Claude</p>
          </div>
        </div>
        {onRefresh && (
          <button onClick={onRefresh} className="p-2 rounded-lg hover:bg-ink-6 transition-colors" title="Refresh analysis">
            <RefreshCw className="w-4 h-4 text-ink-4" />
          </button>
        )}
      </div>

      {/* Summary */}
      <div className="bg-brand-tint/40 rounded-xl p-4 mb-4">
        <p className="text-sm text-ink-2 leading-relaxed">{analysis.summary}</p>
      </div>

      {/* Sections */}
      <div className="space-y-2">
        {sections.filter(s => s.items.length > 0).map(section => (
          <div key={section.id} className="rounded-xl border border-ink-6 overflow-hidden">
            <button
              onClick={() => setExpanded(expanded === section.id ? null : section.id)}
              className="w-full flex items-center gap-3 p-3 text-left hover:bg-white/40 transition-colors"
            >
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${section.color}`}>
                <section.icon className="w-3.5 h-3.5" />
              </div>
              <span className="text-sm font-medium text-ink flex-1">{section.title}</span>
              <span className="text-xs text-ink-4 bg-ink-6 px-2 py-0.5 rounded-full">{section.items.length}</span>
            </button>
            {expanded === section.id && (
              <div className="px-3 pb-3 space-y-2">
                {section.items.map((item, i) => (
                  <div key={i} className="bg-white/50 rounded-lg p-3">
                    <div className="text-sm font-medium text-ink mb-1">{item.title}</div>
                    <div className="text-xs text-ink-3 leading-relaxed">{item.body}</div>
                    {item.action && (
                      <div className="text-xs text-brand-dark font-medium mt-2">{item.action}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
