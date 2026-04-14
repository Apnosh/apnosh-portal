'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Sparkles, Loader2, Trash2, RefreshCw, Check, Send,
  GripVertical, ChevronDown, ChevronUp,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { generateCalendar, refineCalendarItem } from '@/lib/content-engine/generate-calendar'
import type { ClientContext } from '@/lib/content-engine/context'

interface CalendarItem {
  id: string
  scheduled_date: string
  scheduled_time: string
  platform: string
  content_type: string
  concept_title: string
  concept_description: string | null
  strategic_goal: string | null
  filming_batch: string | null
  source: string
  status: string
  sort_order: number
}

const GOAL_COLORS: Record<string, string> = {
  awareness: 'bg-blue-50 text-blue-700',
  engagement: 'bg-purple-50 text-purple-700',
  conversion: 'bg-emerald-50 text-emerald-700',
  community: 'bg-amber-50 text-amber-700',
}

const BATCH_COLORS: Record<string, string> = {
  A: 'bg-blue-100 text-blue-800',
  B: 'bg-emerald-100 text-emerald-800',
  C: 'bg-orange-100 text-orange-800',
  D: 'bg-purple-100 text-purple-800',
}

const TYPE_LABELS: Record<string, string> = {
  reel: 'Reel',
  feed_post: 'Feed Post',
  carousel: 'Carousel',
  story: 'Story',
}

interface CalendarViewProps {
  clientId: string
  cycleId: string | null
  context: ClientContext | null
  strategyNotes: string
  onCycleCreated: (id: string) => void
  onStatusChange: (status: string) => void
}

export default function CalendarView({
  clientId,
  cycleId,
  context,
  strategyNotes,
  onCycleCreated,
  onStatusChange,
}: CalendarViewProps) {
  const supabase = createClient()
  const [items, setItems] = useState<CalendarItem[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refiningId, setRefiningId] = useState<string | null>(null)
  const [refineText, setRefineText] = useState('')
  const [approving, setApproving] = useState(false)

  const loadItems = useCallback(async () => {
    if (!cycleId) { setLoading(false); return }
    const { data } = await supabase
      .from('content_calendar_items')
      .select('*')
      .eq('cycle_id', cycleId)
      .order('sort_order')
    setItems((data ?? []) as CalendarItem[])
    setLoading(false)
  }, [cycleId, supabase])

  useEffect(() => { loadItems() }, [loadItems])

  const handleGenerate = async () => {
    if (!context) return
    setGenerating(true)
    setError(null)

    // Ensure cycle exists
    let cId = cycleId
    if (!cId) {
      const { data } = await supabase
        .from('content_cycles')
        .insert({
          client_id: clientId,
          month: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
          status: 'context_ready',
          deliverables: context.deliverables,
          context_snapshot: context,
          strategy_notes: strategyNotes || null,
        })
        .select()
        .single()
      if (data) {
        cId = data.id
        onCycleCreated(data.id)
      }
    }

    if (!cId) { setError('Failed to create cycle'); setGenerating(false); return }

    const result = await generateCalendar(cId, clientId, context, strategyNotes)
    if (result.success) {
      onStatusChange('calendar_draft')
      await loadItems()
    } else {
      setError(result.error ?? 'Generation failed')
    }
    setGenerating(false)
  }

  const handleRefine = async (itemId: string) => {
    if (!context || !refineText.trim()) return
    setRefiningId(itemId)
    const result = await refineCalendarItem(itemId, refineText, context)
    if (result.success) {
      await loadItems()
      setRefineText('')
      setRefiningId(null)
    }
    setRefiningId(null)
  }

  const handleDelete = async (itemId: string) => {
    await supabase.from('content_calendar_items').delete().eq('id', itemId)
    setItems((prev) => prev.filter((i) => i.id !== itemId))
  }

  const handleApproveAll = async () => {
    if (!cycleId) return
    setApproving(true)
    await supabase
      .from('content_calendar_items')
      .update({ status: 'strategist_approved', updated_at: new Date().toISOString() })
      .eq('cycle_id', cycleId)
      .eq('status', 'draft')

    await supabase
      .from('content_cycles')
      .update({
        status: 'calendar_approved',
        calendar_approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', cycleId)

    onStatusChange('calendar_approved')
    await loadItems()
    setApproving(false)
  }

  // Compute strategy summary from items
  const summary = computeSummary(items)

  // Empty state — no items yet
  if (!loading && items.length === 0) {
    return (
      <div className="text-center py-16">
        <Sparkles className="w-10 h-10 text-ink-4 mx-auto mb-4" />
        <h2 className="text-lg font-bold text-ink mb-2">Generate your content calendar</h2>
        <p className="text-sm text-ink-3 max-w-md mx-auto mb-6">
          The AI will create a full month of content based on the client's profile, performance data, and your strategy notes.
        </p>
        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="inline-flex items-center gap-2 px-6 py-3 bg-brand text-white text-sm font-semibold rounded-xl hover:bg-brand-dark transition-colors disabled:opacity-50"
        >
          {generating ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Creating calendar...</>
          ) : (
            <><Sparkles className="w-4 h-4" /> Generate Calendar</>
          )}
        </button>
      </div>
    )
  }

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-ink-4" /></div>
  }

  return (
    <div className="space-y-5">
      {/* Strategy Summary */}
      {summary && (
        <div className="bg-bg-2 rounded-xl p-4 text-sm text-ink-2">
          <strong>This month:</strong> {summary.typeBreakdown}.{' '}
          <strong>Batch filming:</strong> {summary.batchBreakdown}.{' '}
          <strong>Cadence:</strong> {summary.cadence}.
        </div>
      )}

      {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{error}</p>}

      {/* Calendar items */}
      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={item.id}
            className="bg-white rounded-xl border border-ink-6 p-4 hover:border-ink-5 transition-colors"
          >
            <div className="flex items-start gap-3">
              <GripVertical className="w-4 h-4 text-ink-4 mt-1 flex-shrink-0 cursor-grab" />
              <div className="flex-1 min-w-0">
                {/* Top row */}
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-xs text-ink-3 font-medium">
                    {item.scheduled_date} {item.scheduled_time}
                  </span>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded capitalize bg-ink-6 text-ink-3">
                    {item.platform}
                  </span>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-ink text-white">
                    {TYPE_LABELS[item.content_type] ?? item.content_type}
                  </span>
                  {item.strategic_goal && (
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded capitalize ${GOAL_COLORS[item.strategic_goal] ?? ''}`}>
                      {item.strategic_goal}
                    </span>
                  )}
                  {item.filming_batch && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${BATCH_COLORS[item.filming_batch] ?? 'bg-ink-6 text-ink-3'}`}>
                      Batch {item.filming_batch}
                    </span>
                  )}
                  <span className="text-[10px] text-ink-4 capitalize">{item.source}</span>
                </div>

                {/* Title & description */}
                <h3 className="text-sm font-semibold text-ink">{item.concept_title}</h3>
                {item.concept_description && (
                  <p className="text-xs text-ink-3 mt-1 line-clamp-2">{item.concept_description}</p>
                )}

                {/* Refine input */}
                {refiningId === item.id && (
                  <div className="flex gap-2 mt-3">
                    <input
                      value={refineText}
                      onChange={(e) => setRefineText(e.target.value)}
                      placeholder="Direction for AI refinement..."
                      className="flex-1 text-sm border border-ink-6 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand/30"
                      onKeyDown={(e) => e.key === 'Enter' && handleRefine(item.id)}
                    />
                    <button
                      onClick={() => handleRefine(item.id)}
                      className="px-3 py-1.5 bg-brand text-white text-xs font-medium rounded-lg"
                    >
                      Refine
                    </button>
                    <button
                      onClick={() => { setRefiningId(null); setRefineText('') }}
                      className="px-3 py-1.5 text-xs text-ink-3"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => setRefiningId(refiningId === item.id ? null : item.id)}
                  className="p-1.5 text-ink-4 hover:text-brand rounded-lg hover:bg-bg-2 transition-colors"
                  title="Refine with AI"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(item.id)}
                  className="p-1.5 text-ink-4 hover:text-red-500 rounded-lg hover:bg-bg-2 transition-colors"
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Approve */}
      <div className="flex items-center gap-3 pt-4 border-t border-ink-6">
        <button
          onClick={handleApproveAll}
          disabled={approving || items.length === 0}
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-brand text-white text-sm font-semibold rounded-xl hover:bg-brand-dark transition-colors disabled:opacity-50"
        >
          {approving ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Approving...</>
          ) : (
            <><Check className="w-4 h-4" /> Approve Calendar ({items.length} items)</>
          )}
        </button>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="inline-flex items-center gap-2 px-4 py-2.5 border border-ink-5 text-sm font-medium rounded-xl hover:bg-bg-2 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${generating ? 'animate-spin' : ''}`} />
          Regenerate all
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Summary computation
// ---------------------------------------------------------------------------

function computeSummary(items: CalendarItem[]) {
  if (items.length === 0) return null

  const types = new Map<string, number>()
  const batches = new Map<string, number>()
  for (const item of items) {
    types.set(item.content_type, (types.get(item.content_type) ?? 0) + 1)
    if (item.filming_batch) {
      batches.set(item.filming_batch, (batches.get(item.filming_batch) ?? 0) + 1)
    }
  }

  const typeBreakdown = [...types.entries()]
    .map(([t, c]) => `${c} ${TYPE_LABELS[t] ?? t}${c > 1 ? 's' : ''}`)
    .join(', ')

  const batchBreakdown = batches.size > 0
    ? `${batches.size} session${batches.size > 1 ? 's' : ''} (${[...batches.entries()].map(([b, c]) => `${b}: ${c} items`).join(', ')})`
    : 'No batches'

  // Compute weekly cadence
  const weeks = new Set(items.map((i) => {
    const d = new Date(i.scheduled_date + 'T12:00:00')
    const weekNum = Math.ceil(d.getDate() / 7)
    return weekNum
  }))
  const perWeek = Math.round(items.length / Math.max(weeks.size, 1))

  return {
    typeBreakdown,
    batchBreakdown,
    cadence: `~${perWeek}x/week`,
  }
}
