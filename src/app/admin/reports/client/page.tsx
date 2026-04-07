'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Plus, Send, Eye, Pencil, Trash2, Loader2, FileBarChart,
  ChevronDown, Check, Calendar,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { generateMonthlyReport, publishReport, deleteReport } from '@/lib/actions'
import type { MonthlyReport } from '@/types/database'

// ── Helpers ──────────────────────────────────────────────────────────

function monthLabel(month: number, year: number): string {
  const date = new Date(year, month - 1)
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-600',
    published: 'bg-green-50 text-green-700',
  }
  return (
    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${colors[status] || 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  )
}

interface BusinessOption {
  id: string
  name: string
}

// ── Component ────────────────────────────────────────────────────────

export default function AdminClientReportsPage() {
  const supabase = createClient()

  const [reports, setReports] = useState<(MonthlyReport & { business?: { name: string } })[]>([])
  const [businesses, setBusinesses] = useState<BusinessOption[]>([])
  const [loading, setLoading] = useState(true)

  // Generate form state
  const [showGenerate, setShowGenerate] = useState(false)
  const [genBusinessId, setGenBusinessId] = useState('')
  const [genMonth, setGenMonth] = useState(new Date().getMonth()) // 0-indexed for select
  const [genYear, setGenYear] = useState(new Date().getFullYear())
  const [generating, setGenerating] = useState(false)

  // Actions
  const [publishingId, setPublishingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const fetchReports = useCallback(async () => {
    const { data, error } = await supabase
      .from('monthly_reports')
      .select('*, businesses(name)')
      .order('year', { ascending: false })
      .order('month', { ascending: false })

    if (!error && data) {
      setReports(data as (MonthlyReport & { business?: { name: string } })[])
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchReports()
  }, [fetchReports])

  useEffect(() => {
    async function loadBusinesses() {
      const { data } = await supabase
        .from('businesses')
        .select('id, name')
        .eq('onboarding_completed', true)
        .order('name')
      if (data) setBusinesses(data)
    }
    loadBusinesses()
  }, [supabase])

  async function handleGenerate() {
    if (!genBusinessId || generating) return
    setGenerating(true)

    const result = await generateMonthlyReport(genBusinessId, genMonth + 1, genYear)

    if (result.success) {
      setShowGenerate(false)
      setGenBusinessId('')
      await fetchReports()
    }

    setGenerating(false)
  }

  async function handlePublish(reportId: string) {
    setPublishingId(reportId)
    const result = await publishReport(reportId)
    if (result.success) {
      await fetchReports()
    }
    setPublishingId(null)
  }

  async function handleDelete(reportId: string) {
    setDeletingId(reportId)
    const result = await deleteReport(reportId)
    if (result.success) {
      setReports(prev => prev.filter(r => r.id !== reportId))
    }
    setDeletingId(null)
  }

  const months = Array.from({ length: 12 }, (_, i) => ({
    value: i,
    label: new Date(2024, i).toLocaleDateString('en-US', { month: 'long' }),
  }))

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin/reports" className="text-ink-4 hover:text-ink transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">Client Reports</h1>
            <p className="text-ink-3 text-sm mt-1">Generate and publish monthly reports for clients.</p>
          </div>
        </div>
        <button
          onClick={() => setShowGenerate(true)}
          className="bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-4 py-2 flex items-center gap-2 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Generate Report
        </button>
      </div>

      {/* Generate form */}
      {showGenerate && (
        <div className="bg-white rounded-xl border border-ink-6 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-ink">Generate Monthly Report</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">Client</label>
              <select
                value={genBusinessId}
                onChange={(e) => setGenBusinessId(e.target.value)}
                className="w-full border border-ink-6 rounded-lg px-3 py-2.5 text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
              >
                <option value="">Select client...</option>
                {businesses.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">Month</label>
              <select
                value={genMonth}
                onChange={(e) => setGenMonth(Number(e.target.value))}
                className="w-full border border-ink-6 rounded-lg px-3 py-2.5 text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
              >
                {months.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">Year</label>
              <select
                value={genYear}
                onChange={(e) => setGenYear(Number(e.target.value))}
                className="w-full border border-ink-6 rounded-lg px-3 py-2.5 text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
              >
                {[2024, 2025, 2026].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleGenerate}
              disabled={!genBusinessId || generating}
              className="bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-4 py-2 flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileBarChart className="w-4 h-4" />}
              Generate
            </button>
            <button
              onClick={() => setShowGenerate(false)}
              className="text-sm text-ink-3 hover:text-ink transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Reports list */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-ink-6 p-4 animate-pulse">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <div className="h-5 w-48 bg-ink-6 rounded" />
                  <div className="h-3 w-32 bg-ink-6 rounded" />
                </div>
                <div className="flex gap-2">
                  <div className="h-8 w-20 bg-ink-6 rounded" />
                  <div className="h-8 w-8 bg-ink-6 rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : reports.length === 0 ? (
        <div className="bg-white rounded-xl border border-ink-6 p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-bg-2 flex items-center justify-center mx-auto mb-4">
            <FileBarChart className="w-6 h-6 text-ink-4" />
          </div>
          <p className="text-sm font-medium text-ink-2">No client reports yet</p>
          <p className="text-xs text-ink-4 mt-1">Click &ldquo;Generate Report&rdquo; to create a monthly report for a client.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-[11px] text-ink-4 font-medium uppercase tracking-wide bg-bg-2 border-b border-ink-6 text-left">Client</th>
                  <th className="px-4 py-3 text-[11px] text-ink-4 font-medium uppercase tracking-wide bg-bg-2 border-b border-ink-6 text-left">Period</th>
                  <th className="px-4 py-3 text-[11px] text-ink-4 font-medium uppercase tracking-wide bg-bg-2 border-b border-ink-6 text-left">Status</th>
                  <th className="px-4 py-3 text-[11px] text-ink-4 font-medium uppercase tracking-wide bg-bg-2 border-b border-ink-6 text-left">Viewed</th>
                  <th className="px-4 py-3 text-[11px] text-ink-4 font-medium uppercase tracking-wide bg-bg-2 border-b border-ink-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {reports.map(report => {
                  const bizName = (report as { businesses?: { name: string } | null }).businesses?.name || 'Unknown'
                  return (
                    <tr key={report.id} className="border-b border-ink-6 last:border-0 hover:bg-bg-2 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-ink">{bizName}</td>
                      <td className="px-4 py-3 text-sm text-ink">{monthLabel(report.month, report.year)}</td>
                      <td className="px-4 py-3">{statusBadge(report.status)}</td>
                      <td className="px-4 py-3 text-sm text-ink-3">
                        {report.viewed_at
                          ? new Date(report.viewed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                          : '--'
                        }
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {report.status === 'draft' && (
                            <button
                              onClick={() => handlePublish(report.id)}
                              disabled={publishingId === report.id}
                              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-brand text-white hover:bg-brand-dark transition-colors disabled:opacity-50"
                            >
                              {publishingId === report.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Send className="w-3.5 h-3.5" />
                              )}
                              Publish
                            </button>
                          )}
                          {report.status === 'published' && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 font-medium">
                              <Check className="w-3.5 h-3.5" />
                              Published
                            </span>
                          )}
                          <button
                            onClick={() => handleDelete(report.id)}
                            disabled={deletingId === report.id}
                            className="w-8 h-8 rounded-lg border border-ink-6 flex items-center justify-center text-ink-4 hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors disabled:opacity-50"
                          >
                            {deletingId === report.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
