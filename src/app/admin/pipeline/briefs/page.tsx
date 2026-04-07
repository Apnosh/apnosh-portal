'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, FileText, Plus, Loader2, ChevronDown, User, Calendar,
  CheckCircle, Clock, Play,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { ContentBrief, BriefPipelineStatus } from '@/types/database'

// ── Helpers ──────────────────────────────────────────────────────────

const statusConfig: Record<BriefPipelineStatus, { label: string; color: string; icon: typeof FileText }> = {
  draft: { label: 'Draft', color: 'bg-gray-100 text-gray-600', icon: FileText },
  approved: { label: 'Approved', color: 'bg-brand-tint text-brand-dark', icon: CheckCircle },
  in_production: { label: 'In Production', color: 'bg-blue-50 text-blue-700', icon: Play },
  completed: { label: 'Completed', color: 'bg-green-50 text-green-700', icon: CheckCircle },
}

interface BusinessOption {
  id: string
  name: string
}

// ── Component ────────────────────────────────────────────────────────

export default function BriefsPage() {
  const supabase = createClient()

  const [businesses, setBusinesses] = useState<BusinessOption[]>([])
  const [selectedBiz, setSelectedBiz] = useState('')
  const [briefs, setBriefs] = useState<ContentBrief[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<BriefPipelineStatus | 'all'>('all')

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
      .from('content_briefs')
      .select('*')
      .eq('business_id', selectedBiz)
      .order('created_at', { ascending: false })

    if (data) setBriefs(data as ContentBrief[])
    setLoading(false)
  }, [selectedBiz, supabase])

  useEffect(() => {
    fetchBriefs()
  }, [fetchBriefs])

  async function updateBriefStatus(briefId: string, newStatus: BriefPipelineStatus) {
    await supabase
      .from('content_briefs')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', briefId)

    setBriefs(prev =>
      prev.map(b => b.id === briefId ? { ...b, status: newStatus } : b)
    )
  }

  const filtered = briefs.filter(b =>
    statusFilter === 'all' || b.status === statusFilter
  )

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin/pipeline" className="text-ink-4 hover:text-ink transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">Content Briefs</h1>
            <p className="text-ink-3 text-sm mt-1">Structured briefs for each content piece.</p>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={selectedBiz}
          onChange={(e) => setSelectedBiz(e.target.value)}
          className="border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
        >
          {businesses.map(b => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>

        <div className="flex gap-1 border border-ink-6 rounded-lg p-0.5">
          {(['all', 'draft', 'approved', 'in_production', 'completed'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                statusFilter === s
                  ? 'bg-brand-tint text-brand-dark'
                  : 'text-ink-3 hover:text-ink'
              }`}
            >
              {s === 'all' ? 'All' : statusConfig[s].label}
            </button>
          ))}
        </div>
      </div>

      {/* Briefs list */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-ink-6 p-5 animate-pulse space-y-3">
              <div className="h-5 w-48 bg-ink-6 rounded" />
              <div className="h-4 w-full bg-ink-6 rounded" />
              <div className="h-4 w-3/4 bg-ink-6 rounded" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-ink-6 p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-bg-2 flex items-center justify-center mx-auto mb-4">
            <FileText className="w-6 h-6 text-ink-4" />
          </div>
          <p className="text-sm font-medium text-ink-2">No briefs yet</p>
          <p className="text-xs text-ink-4 mt-1">Briefs are created from selected concepts.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(brief => {
            const isExpanded = expandedId === brief.id
            const status = statusConfig[brief.status]
            const StatusIcon = status.icon

            return (
              <div key={brief.id} className="bg-white rounded-xl border border-ink-6 overflow-hidden">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : brief.id)}
                  className="w-full text-left px-5 py-4 flex items-center justify-between hover:bg-bg-2 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${status.color}`}>
                      <StatusIcon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-ink truncate">{brief.title}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-ink-4 uppercase tracking-wide">{brief.content_type.replace(/_/g, ' ')}</span>
                        {brief.due_date && (
                          <>
                            <span className="text-ink-6">|</span>
                            <span className="text-[10px] text-ink-4 flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {new Date(brief.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${status.color}`}>
                      {status.label}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-ink-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-5 pb-5 space-y-4 border-t border-ink-6 pt-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {brief.objective && (
                        <div>
                          <div className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1">Objective</div>
                          <p className="text-sm text-ink-2">{brief.objective}</p>
                        </div>
                      )}
                      {brief.target_audience && (
                        <div>
                          <div className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1">Target Audience</div>
                          <p className="text-sm text-ink-2">{brief.target_audience}</p>
                        </div>
                      )}
                      {brief.key_message && (
                        <div>
                          <div className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1">Key Message</div>
                          <p className="text-sm text-ink-2">{brief.key_message}</p>
                        </div>
                      )}
                      {brief.hook && (
                        <div>
                          <div className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1">Hook</div>
                          <p className="text-sm text-ink-2">{brief.hook}</p>
                        </div>
                      )}
                      {brief.call_to_action && (
                        <div>
                          <div className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1">Call to Action</div>
                          <p className="text-sm text-ink-2">{brief.call_to_action}</p>
                        </div>
                      )}
                      {brief.visual_direction && (
                        <div>
                          <div className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1">Visual Direction</div>
                          <p className="text-sm text-ink-2">{brief.visual_direction}</p>
                        </div>
                      )}
                      {brief.copy_direction && (
                        <div className="sm:col-span-2">
                          <div className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1">Copy Direction</div>
                          <p className="text-sm text-ink-2">{brief.copy_direction}</p>
                        </div>
                      )}
                    </div>

                    {brief.hashtags.length > 0 && (
                      <div>
                        <div className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1">Hashtags</div>
                        <div className="flex flex-wrap gap-1.5">
                          {brief.hashtags.map((tag, i) => (
                            <span key={i} className="text-xs bg-bg-2 text-ink-3 px-2 py-0.5 rounded-full">{tag}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Status actions */}
                    <div className="flex items-center gap-2 pt-2 border-t border-ink-6">
                      {brief.status === 'draft' && (
                        <button
                          onClick={() => updateBriefStatus(brief.id, 'approved')}
                          className="text-xs font-medium text-brand hover:text-brand-dark transition-colors flex items-center gap-1"
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                          Approve Brief
                        </button>
                      )}
                      {brief.status === 'approved' && (
                        <button
                          onClick={() => updateBriefStatus(brief.id, 'in_production')}
                          className="text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors flex items-center gap-1"
                        >
                          <Play className="w-3.5 h-3.5" />
                          Start Production
                        </button>
                      )}
                      {brief.status === 'in_production' && (
                        <button
                          onClick={() => updateBriefStatus(brief.id, 'completed')}
                          className="text-xs font-medium text-emerald-600 hover:text-emerald-700 transition-colors flex items-center gap-1"
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                          Mark Complete
                        </button>
                      )}
                    </div>
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
