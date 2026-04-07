'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Brain, TrendingUp, Users, Eye, Loader2, ChevronDown, RefreshCw,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { ClientIntelligence } from '@/types/database'

// ── Helpers ──────────────────────────────────────────────────────────

function weekLabel(dateStr: string): string {
  const d = new Date(dateStr)
  return `Week of ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
}

interface BusinessOption {
  id: string
  name: string
}

// ── Component ────────────────────────────────────────────────────────

export default function IntelligencePage() {
  const supabase = createClient()

  const [businesses, setBusinesses] = useState<BusinessOption[]>([])
  const [selectedBiz, setSelectedBiz] = useState('')
  const [briefs, setBriefs] = useState<ClientIntelligence[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    async function loadBusinesses() {
      const { data } = await supabase
        .from('businesses')
        .select('id, name')
        .eq('onboarding_completed', true)
        .order('name')
      if (data) {
        setBusinesses(data)
        if (data.length > 0) setSelectedBiz(data[0].id)
      }
      setLoading(false)
    }
    loadBusinesses()
  }, [supabase])

  const fetchBriefs = useCallback(async () => {
    if (!selectedBiz) return
    setLoading(true)

    const { data } = await supabase
      .from('client_intelligence')
      .select('*')
      .eq('business_id', selectedBiz)
      .order('week_start', { ascending: false })
      .limit(12)

    if (data) setBriefs(data as ClientIntelligence[])
    setLoading(false)
  }, [selectedBiz, supabase])

  useEffect(() => {
    fetchBriefs()
  }, [fetchBriefs])

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin/pipeline" className="text-ink-4 hover:text-ink transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">Client Intelligence</h1>
            <p className="text-ink-3 text-sm mt-1">Weekly intelligence briefs per client.</p>
          </div>
        </div>
      </div>

      {/* Client selector */}
      <div className="flex items-center gap-3">
        <select
          value={selectedBiz}
          onChange={(e) => setSelectedBiz(e.target.value)}
          className="border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
        >
          {businesses.map(b => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </div>

      {/* Intelligence briefs */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-ink-6 p-5 animate-pulse">
              <div className="h-5 w-48 bg-ink-6 rounded mb-3" />
              <div className="space-y-2">
                <div className="h-4 w-full bg-ink-6 rounded" />
                <div className="h-4 w-3/4 bg-ink-6 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : briefs.length === 0 ? (
        <div className="bg-white rounded-xl border border-ink-6 p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-bg-2 flex items-center justify-center mx-auto mb-4">
            <Brain className="w-6 h-6 text-ink-4" />
          </div>
          <p className="text-sm font-medium text-ink-2">No intelligence briefs yet</p>
          <p className="text-xs text-ink-4 mt-1">Intelligence briefs are generated weekly for active clients.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {briefs.map(brief => {
            const isExpanded = expandedId === brief.id
            return (
              <div key={brief.id} className="bg-white rounded-xl border border-ink-6 overflow-hidden">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : brief.id)}
                  className="w-full text-left px-5 py-4 flex items-center justify-between hover:bg-bg-2 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center">
                      <Brain className="w-4 h-4 text-purple-600" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-ink">{weekLabel(brief.week_start)}</div>
                      <div className="text-[10px] text-ink-4 mt-0.5">
                        {brief.trending_content.length} trends, {brief.competitor_activity.length} competitor updates, {brief.performance_insights.length} insights
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {brief.reviewed_at && (
                      <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Reviewed</span>
                    )}
                    <ChevronDown className={`w-4 h-4 text-ink-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-5 pb-5 space-y-4 border-t border-ink-6 pt-4">
                    {/* Trending Content */}
                    {brief.trending_content.length > 0 && (
                      <div>
                        <h3 className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-2 flex items-center gap-1.5">
                          <TrendingUp className="w-3.5 h-3.5" />
                          Trending Content
                        </h3>
                        <div className="space-y-2">
                          {brief.trending_content.map((item, i) => (
                            <div key={i} className="bg-bg-2 rounded-lg p-3">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-ink">{item.topic}</span>
                                <span className="text-[10px] text-ink-4 uppercase">{item.platform}</span>
                              </div>
                              <p className="text-xs text-ink-3 mt-1">{item.relevance}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Competitor Activity */}
                    {brief.competitor_activity.length > 0 && (
                      <div>
                        <h3 className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-2 flex items-center gap-1.5">
                          <Eye className="w-3.5 h-3.5" />
                          Competitor Activity
                        </h3>
                        <div className="space-y-2">
                          {brief.competitor_activity.map((item, i) => (
                            <div key={i} className="bg-bg-2 rounded-lg p-3">
                              <div className="text-sm font-medium text-ink">{item.competitor}</div>
                              <p className="text-xs text-ink-3 mt-1">{item.action}</p>
                              {item.notes && <p className="text-xs text-ink-4 mt-0.5">{item.notes}</p>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Performance Insights */}
                    {brief.performance_insights.length > 0 && (
                      <div>
                        <h3 className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-2 flex items-center gap-1.5">
                          <TrendingUp className="w-3.5 h-3.5" />
                          Performance Insights
                        </h3>
                        <div className="space-y-2">
                          {brief.performance_insights.map((item, i) => (
                            <div key={i} className="bg-bg-2 rounded-lg p-3">
                              <div className="text-sm font-medium text-ink">{item.metric}</div>
                              <p className="text-xs text-ink-3 mt-1">{item.observation}</p>
                              <p className="text-xs text-brand-dark mt-1 font-medium">{item.suggestion}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Audience Signals */}
                    {brief.audience_signals.length > 0 && (
                      <div>
                        <h3 className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-2 flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5" />
                          Audience Signals
                        </h3>
                        <div className="space-y-2">
                          {brief.audience_signals.map((item, i) => (
                            <div key={i} className="bg-bg-2 rounded-lg p-3">
                              <div className="text-sm font-medium text-ink">{item.signal}</div>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-[10px] text-ink-4 uppercase">{item.source}</span>
                                <span className="text-xs text-ink-3">{item.implication}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
