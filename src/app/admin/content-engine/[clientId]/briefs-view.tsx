'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Sparkles, Loader2, Check, RefreshCw, ChevronDown, ChevronUp,
  Play, Image, BookOpen, Clipboard, ClipboardCheck,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { generateBriefs, refineBriefField } from '@/lib/content-engine/generate-briefs'
import { updateBriefField, approveAllBriefs } from '@/lib/content-engine/actions'
import type { ClientContext } from '@/lib/content-engine/context'
import EditableField from '@/components/content-engine/editable-field'
import EditableList from '@/components/content-engine/editable-list'
import ConfirmModal from '@/components/content-engine/confirm-modal'
import { BriefGenerationProgress } from '@/components/content-engine/generation-progress'
import { useToast } from '@/components/ui/toast'

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
  shot_list: Array<{ shot_number: number; description: string }> | null
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
  const { toast } = useToast()
  const [items, setItems] = useState<BriefItem[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [genProgress, setGenProgress] = useState({ current: 0, total: 0, title: '' })
  const [error, setError] = useState<string | null>(null)
  const [phase, setPhase] = useState<ReviewPhase>('hooks')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [confirmApprove, setConfirmApprove] = useState(false)
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

  // Inline save
  const saveField = async (itemId: string, field: string, value: unknown) => {
    await updateBriefField(itemId, field, value)
    setItems((prev) => prev.map((i) => i.id === itemId ? { ...i, [field]: value } : i))
  }

  // Generate
  const handleGenerate = async () => {
    if (!context) return
    setGenerating(true)
    setError(null)
    setGenProgress({ current: 0, total: items.length, title: '' })
    const result = await generateBriefs(cycleId, clientId, context)
    if (result.success) {
      onStatusChange('briefs_draft')
      await loadItems()
      toast(`${result.count} briefs generated`, 'success')
    } else {
      setError(result.error ?? 'Generation failed')
    }
    setGenerating(false)
  }

  // AI Refine
  const handleRefine = async (itemId: string) => {
    if (!context || !refineText.trim()) return
    setRefiningId(itemId)
    const result = await refineBriefField(itemId, refineField, refineText, context)
    if (result.success) {
      await loadItems()
      setRefineText('')
      setRefiningId(null)
      setRefineField('')
      toast('Field refined', 'success')
    } else {
      toast(result.error ?? 'Refine failed', 'error')
    }
    setRefiningId(null)
  }

  // Approve all
  const handleApprove = async () => {
    setApproving(true)
    setConfirmApprove(false)
    const result = await approveAllBriefs(cycleId, clientId)
    if (result.success) {
      onStatusChange('briefs_approved')
      await loadItems()
      toast('All briefs approved and sent to client', 'success')
    } else {
      toast(result.error ?? 'Approval failed', 'error')
    }
    setApproving(false)
  }

  const hasBriefs = items.some((i) => i.hook || i.caption || i.script)
  const videoItems = items.filter((i) => i.content_type === 'reel' || i.content_type === 'video' || i.content_type === 'short_form_video')

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-ink-4" /></div>

  if (generating) {
    return <BriefGenerationProgress total={genProgress.total || items.length} current={genProgress.current} currentTitle={genProgress.title} />
  }

  // No briefs yet
  if (!hasBriefs) {
    return (
      <div className="text-center py-16">
        <BookOpen className="w-10 h-10 text-ink-4 mx-auto mb-4" />
        <h2 className="text-lg font-bold text-ink mb-2">Generate production briefs</h2>
        <p className="text-sm text-ink-3 max-w-md mx-auto mb-6">
          AI will create scripts, captions, shot lists, and production details for all {items.length} items.
        </p>
        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
        <button onClick={handleGenerate} disabled={generating} className="inline-flex items-center gap-2 px-6 py-3 bg-brand text-white text-sm font-semibold rounded-xl hover:bg-brand-dark transition-colors disabled:opacity-50">
          <Sparkles className="w-4 h-4" /> Generate All Briefs
        </button>
      </div>
    )
  }

  // Phase tabs
  const phases: Array<{ key: ReviewPhase; label: string; icon: typeof Play; count: number }> = [
    { key: 'hooks', label: 'Hooks', icon: Play, count: items.filter((i) => i.hook).length },
    { key: 'scripts', label: 'Scripts', icon: BookOpen, count: videoItems.filter((i) => i.script).length },
    { key: 'captions', label: 'Captions', icon: Image, count: items.filter((i) => i.caption).length },
    { key: 'production', label: 'Details', icon: Sparkles, count: videoItems.filter((i) => i.shot_list).length },
  ]

  return (
    <div className="space-y-4">
      {/* Phase tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {phases.map((p) => (
          <button key={p.key} onClick={() => setPhase(p.key)} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${phase === p.key ? 'bg-ink text-white' : 'bg-bg-2 text-ink-3 hover:bg-ink-6'}`}>
            <p.icon className="w-3.5 h-3.5" /> {p.label} ({p.count})
          </button>
        ))}
      </div>

      {/* Hooks */}
      {phase === 'hooks' && (
        <div className="space-y-2">
          {items.filter((i) => i.hook).map((item) => (
            <BriefFieldCard key={item.id} item={item} field="hook" value={item.hook!} onSave={(v) => saveField(item.id, 'hook', v)} onRefineStart={() => { setRefiningId(item.id); setRefineField('hook') }} refiningId={refiningId} refineText={refineText} onRefineChange={setRefineText} onRefineSubmit={() => handleRefine(item.id)} onRefineCancel={() => { setRefiningId(null); setRefineText('') }} />
          ))}
        </div>
      )}

      {/* Scripts */}
      {phase === 'scripts' && (
        <div className="space-y-3">
          {videoItems.filter((i) => i.script).map((item) => (
            <BriefFieldCard key={item.id} item={item} field="script" value={item.script!} onSave={(v) => saveField(item.id, 'script', v)} onRefineStart={() => { setRefiningId(item.id); setRefineField('script') }} refiningId={refiningId} refineText={refineText} onRefineChange={setRefineText} onRefineSubmit={() => handleRefine(item.id)} onRefineCancel={() => { setRefiningId(null); setRefineText('') }} expandable />
          ))}
        </div>
      )}

      {/* Captions */}
      {phase === 'captions' && (
        <div className="space-y-2">
          {items.filter((i) => i.caption).map((item) => (
            <BriefFieldCard key={item.id} item={item} field="caption" value={item.caption!} onSave={(v) => saveField(item.id, 'caption', v)} onRefineStart={() => { setRefiningId(item.id); setRefineField('caption') }} refiningId={refiningId} refineText={refineText} onRefineChange={setRefineText} onRefineSubmit={() => handleRefine(item.id)} onRefineCancel={() => { setRefiningId(null); setRefineText('') }} expandable />
          ))}
        </div>
      )}

      {/* Production details */}
      {phase === 'production' && (
        <div className="space-y-3">
          {videoItems.map((item) => (
            <div key={item.id} className="bg-white rounded-xl border border-ink-6 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-ink">{item.concept_title}</h3>
                <button onClick={() => setExpandedId(expandedId === item.id ? null : item.id)} className="p-1 text-ink-4">
                  {expandedId === item.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>
              {(expandedId === item.id || true) && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {item.props && (
                    <div>
                      <label className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider block mb-1">Props</label>
                      <EditableList items={item.props} onSave={(v) => saveField(item.id, 'props', v)} variant="checkboxes" addLabel="Add prop" />
                    </div>
                  )}
                  <div>
                    <label className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider block mb-1">Location</label>
                    <EditableField value={item.location_notes ?? ''} onSave={(v) => saveField(item.id, 'location_notes', v)} type="textarea" placeholder="Where to film..." rows={2} />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider block mb-1">Music</label>
                    <EditableField value={item.music_direction ?? ''} onSave={(v) => saveField(item.id, 'music_direction', v)} placeholder="Mood, style, tempo..." />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider block mb-1">Editor Notes</label>
                    <EditableField value={item.editor_notes ?? ''} onSave={(v) => saveField(item.id, 'editor_notes', v)} type="textarea" placeholder="Pacing, overlays, transitions..." rows={2} />
                  </div>
                  {item.shot_list && item.shot_list.length > 0 && (
                    <div className="lg:col-span-2">
                      <label className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider block mb-1">Shot List</label>
                      <EditableList items={item.shot_list.map((s) => `${s.description}`)} onSave={(v) => saveField(item.id, 'shot_list', v.map((d, i) => ({ shot_number: i + 1, description: d })))} variant="numbered" addLabel="Add shot" />
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Approve bar */}
      <div className="flex items-center gap-3 pt-4 border-t border-ink-6">
        <button onClick={() => setConfirmApprove(true)} disabled={approving} className="inline-flex items-center gap-2 px-6 py-2.5 bg-brand text-white text-sm font-semibold rounded-xl hover:bg-brand-dark transition-colors disabled:opacity-50">
          {approving ? <><Loader2 className="w-4 h-4 animate-spin" /> Approving...</> : <><Check className="w-4 h-4" /> Approve All Briefs</>}
        </button>
      </div>

      <ConfirmModal open={confirmApprove} onConfirm={handleApprove} onCancel={() => setConfirmApprove(false)} title="Approve all briefs?" description={`${items.length} items will be approved and sent to the client for review via their content queue.`} confirmLabel="Approve & Send" variant="primary" loading={approving} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Brief Field Card — inline editable + AI refine
// ---------------------------------------------------------------------------

function BriefFieldCard({ item, field, value, onSave, onRefineStart, refiningId, refineText, onRefineChange, onRefineSubmit, onRefineCancel, expandable }: {
  item: BriefItem; field: string; value: string; onSave: (v: string) => Promise<void>
  onRefineStart: () => void; refiningId: string | null; refineText: string
  onRefineChange: (t: string) => void; onRefineSubmit: () => void; onRefineCancel: () => void
  expandable?: boolean
}) {
  const [expanded, setExpanded] = useState(!expandable)
  const [copied, setCopied] = useState(false)
  const isRefining = refiningId === item.id

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="bg-white rounded-xl border border-ink-6 p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-ink text-white capitalize">{item.content_type.replace('_', ' ')}</span>
          <span className="text-sm font-semibold text-ink">{item.concept_title}</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={handleCopy} className="p-1.5 text-ink-4 hover:text-ink rounded-lg hover:bg-bg-2 transition-colors" title="Copy">
            {copied ? <ClipboardCheck className="w-3.5 h-3.5 text-brand" /> : <Clipboard className="w-3.5 h-3.5" />}
          </button>
          <button onClick={onRefineStart} className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-brand hover:bg-brand-tint rounded transition-colors">
            <Sparkles className="w-3 h-3" /> AI
          </button>
          {expandable && (
            <button onClick={() => setExpanded(!expanded)} className="p-1.5 text-ink-4">
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <EditableField value={value} onSave={onSave} type="textarea" displayClassName="text-sm text-ink-2 whitespace-pre-wrap leading-relaxed" rows={field === 'script' ? 8 : 4} />
      )}

      {isRefining && (
        <div className="flex gap-2 mt-3">
          <input value={refineText} onChange={(e) => onRefineChange(e.target.value)} placeholder={`How to improve this ${field}...`} className="flex-1 text-sm border border-ink-6 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand/30" onKeyDown={(e) => e.key === 'Enter' && onRefineSubmit()} />
          <button onClick={onRefineSubmit} className="px-3 py-1.5 bg-brand text-white text-xs font-medium rounded-lg">Refine</button>
          <button onClick={onRefineCancel} className="px-3 py-1.5 text-xs text-ink-3">Cancel</button>
        </div>
      )}
    </div>
  )
}
