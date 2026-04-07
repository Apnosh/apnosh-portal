'use client'

import { useState, useEffect } from 'react'
import {
  FileBarChart, ChevronRight, TrendingUp, TrendingDown, Minus,
  FileText, CheckCircle, Loader2, Calendar,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type {
  MonthlyReport, GBPHighlight, ContentStats,
  TopPerformingContent, ReportRecommendation,
} from '@/types/database'

// ── Helpers ──────────────────────────────────────────────────────────

function monthLabel(month: number, year: number): string {
  const date = new Date(year, month - 1)
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return n.toLocaleString()
}

function changeIcon(pct: number) {
  if (pct > 0) return <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
  if (pct < 0) return <TrendingDown className="w-3.5 h-3.5 text-red-500" />
  return <Minus className="w-3.5 h-3.5 text-ink-4" />
}

function changeColor(pct: number): string {
  if (pct > 0) return 'text-emerald-600'
  if (pct < 0) return 'text-red-500'
  return 'text-ink-4'
}

function priorityBadge(p: string) {
  const colors: Record<string, string> = {
    high: 'bg-red-50 text-red-700 border-red-200',
    medium: 'bg-amber-50 text-amber-700 border-amber-200',
    low: 'bg-blue-50 text-blue-700 border-blue-200',
  }
  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${colors[p] || 'bg-gray-100 text-gray-600'}`}>
      {p}
    </span>
  )
}

// ── Skeleton ─────────────────────────────────────────────────────────

function ReportListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl border border-ink-6 p-4 animate-pulse">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <div className="h-5 w-40 bg-ink-6 rounded" />
              <div className="h-3 w-24 bg-ink-6 rounded" />
            </div>
            <div className="h-4 w-4 bg-ink-6 rounded" />
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Component ────────────────────────────────────────────────────────

export default function ClientReportsPage() {
  const supabase = createClient()

  const [reports, setReports] = useState<MonthlyReport[]>([])
  const [selectedReport, setSelectedReport] = useState<MonthlyReport | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      const { data: business } = await supabase
        .from('businesses')
        .select('id')
        .eq('owner_id', user.id)
        .single()

      if (!business) { setLoading(false); return }

      const { data, error } = await supabase
        .from('monthly_reports')
        .select('*')
        .eq('business_id', business.id)
        .eq('status', 'published')
        .order('year', { ascending: false })
        .order('month', { ascending: false })

      if (!error && data) {
        setReports(data as MonthlyReport[])

        // Auto-select the most recent report
        if (data.length > 0) {
          setSelectedReport(data[0] as MonthlyReport)

          // Mark as viewed if not yet viewed
          const report = data[0] as MonthlyReport
          if (!report.viewed_at) {
            await supabase
              .from('monthly_reports')
              .update({ viewed_at: new Date().toISOString() })
              .eq('id', report.id)
          }
        }
      }

      setLoading(false)
    }

    load()
  }, [supabase])

  async function selectReport(report: MonthlyReport) {
    setSelectedReport(report)

    // Mark as viewed
    if (!report.viewed_at) {
      await supabase
        .from('monthly_reports')
        .update({ viewed_at: new Date().toISOString() })
        .eq('id', report.id)

      setReports(prev =>
        prev.map(r => r.id === report.id ? { ...r, viewed_at: new Date().toISOString() } : r)
      )
    }
  }

  const highlights = (selectedReport?.gbp_highlights ?? []) as GBPHighlight[]
  const contentStats = (selectedReport?.content_stats ?? {}) as ContentStats
  const topPerforming = (selectedReport?.top_performing ?? []) as TopPerformingContent[]
  const recommendations = (selectedReport?.recommendations ?? []) as ReportRecommendation[]

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">Monthly Reports</h1>
        <p className="text-ink-3 text-sm mt-1">Performance summaries prepared by your Apnosh team.</p>
      </div>

      {loading ? (
        <ReportListSkeleton />
      ) : reports.length === 0 ? (
        <div className="bg-white rounded-xl border border-ink-6 p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-bg-2 flex items-center justify-center mx-auto mb-4">
            <FileBarChart className="w-6 h-6 text-ink-4" />
          </div>
          <p className="text-sm font-medium text-ink-2">No reports yet</p>
          <p className="text-xs text-ink-4 mt-1">Your first monthly report will appear here once published.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Report list sidebar */}
          <div className="lg:col-span-1 space-y-2">
            <h2 className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-2">All Reports</h2>
            {reports.map(report => (
              <button
                key={report.id}
                onClick={() => selectReport(report)}
                className={`w-full text-left rounded-xl border p-3 transition-colors ${
                  selectedReport?.id === report.id
                    ? 'border-brand bg-brand-tint/30'
                    : 'border-ink-6 bg-white hover:bg-bg-2'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-ink">
                      {monthLabel(report.month, report.year)}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Calendar className="w-3 h-3 text-ink-4" />
                      <span className="text-[10px] text-ink-4">
                        {new Date(report.published_at || report.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                      {!report.viewed_at && (
                        <span className="w-1.5 h-1.5 rounded-full bg-brand" />
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-ink-4" />
                </div>
              </button>
            ))}
          </div>

          {/* Report detail */}
          <div className="lg:col-span-3 space-y-5">
            {selectedReport ? (
              <>
                {/* Title */}
                <div className="bg-white rounded-xl border border-ink-6 p-5">
                  <h2 className="font-[family-name:var(--font-display)] text-xl text-ink">
                    {selectedReport.title || monthLabel(selectedReport.month, selectedReport.year)}
                  </h2>
                  {selectedReport.summary && (
                    <p className="text-sm text-ink-2 mt-2 leading-relaxed">{selectedReport.summary}</p>
                  )}
                </div>

                {/* GBP Highlights */}
                {highlights.length > 0 && (
                  <div>
                    <h3 className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-3">Performance Highlights</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {highlights.map((h, i) => (
                        <div key={i} className="bg-white rounded-xl border border-ink-6 p-4">
                          <div className="text-[10px] text-ink-4 uppercase tracking-wide font-medium">{h.metric}</div>
                          <div className="font-[family-name:var(--font-display)] text-2xl text-ink mt-1">
                            {formatNumber(h.current)}
                          </div>
                          <div className="flex items-center gap-1.5 mt-1">
                            {changeIcon(h.change_pct)}
                            <span className={`text-xs font-medium ${changeColor(h.change_pct)}`}>
                              {h.change_pct > 0 ? '+' : ''}{h.change_pct.toFixed(1)}%
                            </span>
                            <span className="text-[10px] text-ink-4">vs last month</span>
                          </div>
                          {h.insight && (
                            <p className="text-xs text-ink-3 mt-2">{h.insight}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Content Delivery Stats */}
                {contentStats.delivered != null && (
                  <div>
                    <h3 className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-3">Content Delivery</h3>
                    <div className="bg-white rounded-xl border border-ink-6 p-5">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div>
                          <div className="text-2xl font-[family-name:var(--font-display)] text-ink">{contentStats.delivered}</div>
                          <div className="text-xs text-ink-3 mt-0.5">Pieces delivered</div>
                        </div>
                        <div>
                          <div className="text-2xl font-[family-name:var(--font-display)] text-ink">{contentStats.approved}</div>
                          <div className="text-xs text-ink-3 mt-0.5">Approved</div>
                        </div>
                        <div>
                          <div className="text-2xl font-[family-name:var(--font-display)] text-ink">{contentStats.published}</div>
                          <div className="text-xs text-ink-3 mt-0.5">Published</div>
                        </div>
                        <div>
                          <div className="text-2xl font-[family-name:var(--font-display)] text-ink">
                            {contentStats.avg_turnaround_days ? `${contentStats.avg_turnaround_days}d` : '--'}
                          </div>
                          <div className="text-xs text-ink-3 mt-0.5">Avg turnaround</div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Top Performing Content */}
                {topPerforming.length > 0 && (
                  <div>
                    <h3 className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-3">Top Performing Content</h3>
                    <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
                      {topPerforming.map((item, i) => (
                        <div key={i} className={`px-5 py-3.5 flex items-center justify-between ${i > 0 ? 'border-t border-ink-6' : ''}`}>
                          <div className="flex items-center gap-3">
                            <div className="w-7 h-7 rounded-lg bg-brand-tint flex items-center justify-center text-brand-dark text-xs font-bold">
                              {i + 1}
                            </div>
                            <div>
                              <div className="text-sm font-medium text-ink">{item.title}</div>
                              <div className="text-[10px] text-ink-4 uppercase tracking-wide">{item.platform}</div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-semibold text-ink">{formatNumber(item.metric_value)}</div>
                            <div className="text-[10px] text-ink-4">{item.metric_label}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recommendations */}
                {recommendations.length > 0 && (
                  <div>
                    <h3 className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-3">What We Recommend Next</h3>
                    <div className="space-y-3">
                      {recommendations.map((rec, i) => (
                        <div key={i} className="bg-white rounded-xl border border-ink-6 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm font-medium text-ink">{rec.title}</span>
                                {priorityBadge(rec.priority)}
                              </div>
                              <p className="text-xs text-ink-3 leading-relaxed">{rec.description}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Admin Notes */}
                {selectedReport.custom_notes && (
                  <div>
                    <h3 className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-3">Notes From Your Team</h3>
                    <div className="bg-white rounded-xl border border-ink-6 p-5">
                      <p className="text-sm text-ink-2 leading-relaxed whitespace-pre-line">{selectedReport.custom_notes}</p>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="bg-white rounded-xl border border-ink-6 p-12 text-center">
                <FileText className="w-6 h-6 text-ink-4 mx-auto mb-3" />
                <p className="text-sm text-ink-3">Select a report to view details.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
