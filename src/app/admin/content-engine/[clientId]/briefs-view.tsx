'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Sparkles, Loader2, Check, RefreshCw, ChevronDown, ChevronUp,
  Play, Image, BookOpen,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { generateBriefs, refineBriefField } from '@/lib/content-engine/generate-briefs'
import type { ClientContext } from '@/lib/content-engine/context'

interface BriefItem {
  id: string
  concept_title: string
  content_type: string
  platform: string
  strategic_goal: string | null
  hook: string | null
  script: string | null
  caption: string | null
  hashtags: string[] | null
  shot_list: Array<{ shot_number: number; description: string; setup_notes: string; angle: string }> | null
  props: string[] | null
  location_notes: string | null
  music_direction: string | null
  estimated_duration: string | null
  editor_notes: string | null
  status: string
}

type ReviewPhase = 'hooks' | 'scripts' | 'captions' | 'production'

interface BriefsViewProps {
  cycleId: string
  clientId: string
  context: ClientContext | null
  onStatusChange: (status: string) => void
}

export default function BriefsView({ cycleId, clientId, context, onStatusChange }: BriefsViewProps) {
  const supabase = createClient()
  const [items, setItems] = useState<BriefItem[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [error, setError] = useState<string | null>(null)
  const [phase, setPhase] = useState<ReviewPhase>('hooks')
  const [approving, setApproving] = useState(false)
  const [refiningId, setRefiningId] = useState<string | null>(null)
  const [refineField, setRefineField] = useState('')
  const [refineText, setRefineText] = useState('')

  const loadItems = useCallback(async () => {
    const { data } = await supabase
      .from('content_calendar_items')
      .select('id, concept_title, content_type, platform, strategic_goal, hook, script, caption, hashtags, shot_list, props, location_notes, music_direction, estimated_duration, editor_notes, status')
      .eq('cycle_id', cycleId)
      .order('sort_order')
    setItems((data ?? []) as BriefItem[])
    setLoading(false)
  }, [cycleId, supabase])

  useEffect(() => { loadItems() }, [loadItems])

  const handleGenerate = async () => {
    if (!context) return
    setGenerating(true)
    setError(null)
    const result = await generateBriefs(cycleId, clientId, context)
    if (result.success) {
      onStatusChange('briefs_draft')
      await loadItems()
    } else {
      setError(result.error ?? 'Generation failed')
    }
    setGenerating(false)
  }

  const handleRefine = async (itemId: string) => {
    if (!context || !refineText.trim()) return
    setRefiningId(itemId)
    const result = await refineBriefField(itemId, refineField, refineText, context)
    if (result.success) {
      await loadItems()
      setRefineText('')
      setRefiningId(null)
      setRefineField('')
    }
    setRefiningId(null)
  }

  const handleApproveAll = async () => {
    setApproving(true)
    await supabase
      .from('content_calendar_items')
      .update({ status: 'approved', updated_at: new Date().toISOString() })
      .eq('cycle_id', cycleId)

    await supabase
      .from('content_cycles')
      .update({
        status: 'briefs_approved',
        briefs_approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', cycleId)

    onStatusChange('briefs_approved')
    await loadItems()
    setApproving(false)
  }

  const hasBriefs = items.some((i) => i.hook || i.caption || i.script)
  const videoItems = items.filter((i) => i.content_type === 'reel')
  const allItems = items

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-ink-4" /></div>
  }

  // No briefs generated yet
  if (!hasBriefs) {
    return (
      <div className="text-center py-16">
        <BookOpen className="w-10 h-10 text-ink-4 mx-auto mb-4" />
        <h2 className="text-lg font-bold text-ink mb-2">Generate production briefs</h2>
        <p className="text-sm text-ink-3 max-w-md mx-auto mb-6">
          AI will create scripts, captions, shot lists, and production details for all {items.length} calendar items.
        </p>
        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="inline-flex items-center gap-2 px-6 py-3 bg-brand text-white text-sm font-semibold rounded-xl hover:bg-brand-dark transition-colors disabled:opacity-50"
        >
          {generating ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Generating briefs ({progress.current}/{progress.total || items.length})...</>
          ) : (
            <><Sparkles className="w-4 h-4" /> Generate All Briefs</>
          )}
        </button>
      </div>
    )
  }

  // Review phases
  const phases: Array<{ key: ReviewPhase; label: string; icon: typeof Play; count: number }> = [
    { key: 'hooks', label: 'Hooks', icon: Play, count: items.filter((i) => i.hook).length },
    { key: 'scripts', label: 'Scripts', icon: BookOpen, count: videoItems.filter((i) => i.script).length },
    { key: 'captions', label: 'Captions', icon: Image, count: items.filter((i) => i.caption).length },
    { key: 'production', label: 'Production Details', icon: Sparkles, count: videoItems.filter((i) => i.shot_list).length },
  ]

  return (
    <div className="space-y-5">
      {/* Phase selector */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {phases.map((p) => (
          <button
            key={p.key}
            onClick={() => setPhase(p.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
              phase === p.key ? 'bg-ink text-white' : 'bg-bg-2 text-ink-3 hover:bg-ink-6'
            }`}
          >
            <p.icon className="w-3.5 h-3.5" />
            {p.label} ({p.count})
          </button>
        ))}
      </div>

      {/* Hooks review */}
      {phase === 'hooks' && (
        <div className="space-y-2">
          {allItems.filter((i) => i.hook).map((item) => (
            <BriefCard
              key={item.id}
              item={item}
              field="hook"
              label={item.concept_title}
              content={item.hook!}
              refiningId={refiningId}
              refineText={refineText}
              onRefineStart={(id) => { setRefiningId(id); setRefineField('hook') }}
              onRefineChange={setRefineText}
              onRefineSubmit={() => handleRefine(item.id)}
              onRefineCancel={() => { setRefiningId(null); setRefineText('') }}
            />
          ))}
        </div>
      )}

      {/* Scripts review */}
      {phase === 'scripts' && (
        <div className="space-y-3">
          {videoItems.filter((i) => i.script).map((item) => (
            <BriefCard
              key={item.id}
              item={item}
              field="script"
              label={item.concept_title}
              content={item.script!}
              refiningId={refiningId}
              refineText={refineText}
              onRefineStart={(id) => { setRefiningId(id); setRefineField('script') }}
              onRefineChange={setRefineText}
              onRefineSubmit={() => handleRefine(item.id)}
              onRefineCancel={() => { setRefiningId(null); setRefineText('') }}
              expandable
            />
          ))}
        </div>
      )}

      {/* Captions review */}
      {phase === 'captions' && (
        <div className="space-y-2">
          {allItems.filter((i) => i.caption).map((item) => (
            <BriefCard
              key={item.id}
              item={item}
              field="caption"
              label={item.concept_title}
              content={item.caption!}
              refiningId={refiningId}
              refineText={refineText}
              onRefineStart={(id) => { setRefiningId(id); setRefineField('caption') }}
              onRefineChange={setRefineText}
              onRefineSubmit={() => handleRefine(item.id)}
              onRefineCancel={() => { setRefiningId(null); setRefineText('') }}
              expandable
            />
          ))}
        </div>
      )}

      {/* Production details */}
      {phase === 'production' && (
        <div className="space-y-3">
          {videoItems.map((item) => (
            <div key={item.id} className="bg-white rounded-xl border border-ink-6 p-4">
              <h3 className="text-sm font-semibold text-ink mb-3">{item.concept_title}</h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs text-ink-2">
                {item.props && item.props.length > 0 && (
                  <div>
                    <span className="font-semibold text-ink-3 uppercase tracking-wider text-[10px]">Props</span>
                    <ul className="mt-1 space-y-0.5">{item.props.map((p, i) => <li key={i}>• {p}</li>)}</ul>
                  </div>
                )}
                {item.location_notes && (
                  <div>
                    <span className="font-semibold text-ink-3 uppercase tracking-wider text-[10px]">Location</span>
                    <p className="mt-1">{item.location_notes}</p>
                  </div>
                )}
                {item.music_direction && (
                  <div>
                    <span className="font-semibold text-ink-3 uppercase tracking-wider text-[10px]">Music</span>
                    <p className="mt-1">{item.music_direction}</p>
                  </div>
                )}
                {item.editor_notes && (
                  <div>
                    <span className="font-semibold text-ink-3 uppercase tracking-wider text-[10px]">Editor Notes</span>
                    <p className="mt-1">{item.editor_notes}</p>
                  </div>
                )}
                {item.shot_list && item.shot_list.length > 0 && (
                  <div className="lg:col-span-2">
                    <span className="font-semibold text-ink-3 uppercase tracking-wider text-[10px]">Shot List</span>
                    <div className="mt-1 space-y-1">
                      {item.shot_list.map((s, i) => (
                        <div key={i} className="flex gap-2">
                          <span className="font-bold text-ink-3 w-6">#{s.shot_number}</span>
                          <span>{s.description}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Approve */}
      <div className="flex items-center gap-3 pt-4 border-t border-ink-6">
        <button
          onClick={handleApproveAll}
          disabled={approving}
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-brand text-white text-sm font-semibold rounded-xl hover:bg-brand-dark transition-colors disabled:opacity-50"
        >
          {approving ? <><Loader2 className="w-4 h-4 animate-spin" /> Approving...</> : <><Check className="w-4 h-4" /> Approve All Briefs</>}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Brief Card Component
// ---------------------------------------------------------------------------

function BriefCard({
  item,
  field,
  label,
  content,
  refiningId,
  refineText,
  onRefineStart,
  onRefineChange,
  onRefineSubmit,
  onRefineCancel,
  expandable,
}: {
  item: BriefItem
  field: string
  label: string
  content: string
  refiningId: string | null
  refineText: string
  onRefineStart: (id: string) => void
  onRefineChange: (text: string) => void
  onRefineSubmit: () => void
  onRefineCancel: () => void
  expandable?: boolean
}) {
  const [expanded, setExpanded] = useState(!expandable)
  const isRefining = refiningId === item.id

  return (
    <div className="bg-white rounded-xl border border-ink-6 p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-ink text-white capitalize">
            {item.content_type.replace('_', ' ')}
          </span>
          <span className="text-sm font-semibold text-ink">{label}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onRefineStart(item.id)}
            className="p-1.5 text-ink-4 hover:text-brand rounded-lg hover:bg-bg-2 text-xs"
            title="Refine"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          {expandable && (
            <button onClick={() => setExpanded(!expanded)} className="p-1.5 text-ink-4">
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <pre className="text-sm text-ink-2 whitespace-pre-wrap leading-relaxed">{content}</pre>
      )}

      {isRefining && (
        <div className="flex gap-2 mt-3">
          <input
            value={refineText}
            onChange={(e) => onRefineChange(e.target.value)}
            placeholder={`How to improve this ${field}...`}
            className="flex-1 text-sm border border-ink-6 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand/30"
            onKeyDown={(e) => e.key === 'Enter' && onRefineSubmit()}
          />
          <button onClick={onRefineSubmit} className="px-3 py-1.5 bg-brand text-white text-xs font-medium rounded-lg">
            Refine
          </button>
          <button onClick={onRefineCancel} className="px-3 py-1.5 text-xs text-ink-3">Cancel</button>
        </div>
      )}
    </div>
  )
}
