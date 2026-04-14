'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Check, X, Sparkles, Loader2, ChevronUp, ChevronDown,
  Clock, Target, Layers, Wand2,
  Camera, Globe, Video, MessageCircle,
  Clipboard, ClipboardCheck,
} from 'lucide-react'
import EditableField from './editable-field'
import EditableList from './editable-list'
import type { CalendarItemData } from './calendar-item-row'

// Extended item type with all brief fields
export interface ContentPlanItem extends CalendarItemData {
  concept_description: string | null
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
}

export type RoleFilter = 'full' | 'videographer' | 'editor' | 'designer' | 'copywriter'

const PLATFORM_ICONS: Record<string, typeof Camera> = {
  instagram: Camera, tiktok: Video, facebook: Globe, linkedin: MessageCircle,
}

const ALL_PLATFORMS = [
  { value: 'instagram', label: 'Instagram' }, { value: 'tiktok', label: 'TikTok' },
  { value: 'facebook', label: 'Facebook' }, { value: 'linkedin', label: 'LinkedIn' },
]

const TYPE_COLORS: Record<string, string> = {
  reel: 'bg-indigo-100 text-indigo-800', feed_post: 'bg-cyan-100 text-cyan-800',
  carousel: 'bg-pink-100 text-pink-800', story: 'bg-amber-100 text-amber-800',
}

interface UnifiedDetailPanelProps {
  item: ContentPlanItem
  allItems: ContentPlanItem[]
  roleFilter: RoleFilter
  onSave: (id: string, field: string, value: unknown) => Promise<void>
  onApprove: (id: string) => void
  onDelete: (id: string) => void
  onRefine: (id: string, field: string, direction: string) => Promise<void>
  onGenerateAlternativeHooks?: (id: string) => Promise<string[]>
  onNavigate: (id: string) => void
  onClose: () => void
}

export default function UnifiedDetailPanel({
  item, allItems, roleFilter, onSave, onApprove, onDelete, onRefine,
  onGenerateAlternativeHooks, onNavigate, onClose,
}: UnifiedDetailPanelProps) {
  const [refiningField, setRefiningField] = useState<string | null>(null)
  const [refineText, setRefineText] = useState('')
  const [refining, setRefining] = useState(false)
  const [altHooks, setAltHooks] = useState<string[]>([])
  const [loadingAlts, setLoadingAlts] = useState(false)

  // Local state for scheduling fields
  const [title, setTitle] = useState(item.concept_title)
  const [description, setDescription] = useState(item.concept_description ?? '')
  const [date, setDate] = useState(item.scheduled_date)
  const [time, setTime] = useState(item.scheduled_time ?? '')
  const [platform, setPlatform] = useState(item.platform)
  const [contentType, setContentType] = useState(item.content_type)
  const [goal, setGoal] = useState(item.strategic_goal ?? '')
  const [batch, setBatch] = useState(item.filming_batch ?? '')

  const isApproved = item.status === 'approved' || item.status === 'strategist_approved'
  const isVideo = ['reel', 'video', 'short_form_video'].includes(item.content_type)
  const PIcon = PLATFORM_ICONS[platform] ?? Globe
  const tc = TYPE_COLORS[contentType] ?? 'bg-ink-6 text-ink-3'
  const currentIdx = allItems.findIndex((i) => i.id === item.id)
  const hasBrief = !!(item.hook || item.script || item.caption)

  // Reset on item change
  useEffect(() => {
    setTitle(item.concept_title)
    setDescription(item.concept_description ?? '')
    setDate(item.scheduled_date)
    setTime(item.scheduled_time ?? '')
    setPlatform(item.platform)
    setContentType(item.content_type)
    setGoal(item.strategic_goal ?? '')
    setBatch(item.filming_batch ?? '')
    setRefiningField(null)
    setRefineText('')
    setAltHooks([])
  }, [item.id])

  // Keyboard nav
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return
      if (e.key === 'Escape') { onClose(); return }
      if ((e.key === 'ArrowUp' || e.key === 'k') && currentIdx > 0) { e.preventDefault(); onNavigate(allItems[currentIdx - 1].id) }
      if ((e.key === 'ArrowDown' || e.key === 'j') && currentIdx < allItems.length - 1) { e.preventDefault(); onNavigate(allItems[currentIdx + 1].id) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [item.id, allItems, currentIdx, onNavigate, onClose])

  const saveField = useCallback(async (field: string, value: unknown) => {
    await onSave(item.id, field, value)
  }, [item.id, onSave])

  const handleRefine = async () => {
    if (!refineText.trim() || !refiningField) return
    setRefining(true)
    await onRefine(item.id, refiningField, refineText)
    setRefining(false)
    setRefiningField(null)
    setRefineText('')
  }

  const handleGenerateAlts = async () => {
    if (!onGenerateAlternativeHooks) return
    setLoadingAlts(true)
    const alts = await onGenerateAlternativeHooks(item.id)
    setAltHooks(alts)
    setLoadingAlts(false)
  }

  // Visibility helpers based on role filter
  const show = (roles: RoleFilter[]): boolean => roles.includes('full') || roles.includes(roleFilter)
  const showScheduling = show(['full', 'videographer'])
  const showHook = show(['full', 'copywriter'])
  const showScript = show(['full', 'videographer', 'editor'])
  const showCaption = show(['full', 'copywriter', 'designer'])
  const showHashtags = show(['full', 'copywriter'])
  const showShotList = show(['full', 'videographer'])
  const showProps = show(['full', 'videographer'])
  const showLocation = show(['full', 'videographer'])
  const showMusic = show(['full', 'editor'])
  const showEditorNotes = show(['full', 'editor'])
  const showDuration = show(['full', 'editor', 'videographer'])

  return (
    <div className="h-full flex flex-col bg-white rounded-xl border border-ink-6 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-ink-6 bg-bg-2 flex-shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={() => currentIdx > 0 && onNavigate(allItems[currentIdx - 1].id)} disabled={currentIdx <= 0} className="p-1 text-ink-4 hover:text-ink disabled:opacity-30 rounded">
            <ChevronUp className="w-4 h-4" />
          </button>
          <button onClick={() => currentIdx < allItems.length - 1 && onNavigate(allItems[currentIdx + 1].id)} disabled={currentIdx >= allItems.length - 1} className="p-1 text-ink-4 hover:text-ink disabled:opacity-30 rounded">
            <ChevronDown className="w-4 h-4" />
          </button>
          <span className="text-[10px] text-ink-4">{currentIdx + 1} / {allItems.length}</span>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${tc}`}>{contentType.replace(/_/g, ' ')}</span>
          <PIcon className="w-3 h-3 text-ink-4" />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => onApprove(item.id)} className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${isApproved ? 'bg-brand/10 text-brand border border-brand/20' : 'bg-brand text-white hover:bg-brand-dark'}`}>
            <Check className="w-3 h-3" /> {isApproved ? 'Approved' : 'Approve'}
          </button>
          <button onClick={onClose} className="p-1 text-ink-4 hover:text-ink rounded" title="Close (Esc)">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Title + Description — always visible */}
        <div>
          <SectionLabel label="Title" onRefine={() => setRefiningField(refiningField === 'concept_title' ? null : 'concept_title')} refining={refiningField === 'concept_title'} />
          <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => title !== item.concept_title && saveField('concept_title', title)} className="w-full text-base font-semibold text-ink border border-ink-6 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand" />
        </div>
        <div>
          <SectionLabel label="Description" onRefine={() => setRefiningField(refiningField === 'concept_description' ? null : 'concept_description')} refining={refiningField === 'concept_description'} />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} onBlur={() => description !== (item.concept_description ?? '') && saveField('concept_description', description)} rows={2} className="w-full text-sm text-ink border border-ink-6 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand" placeholder="Describe the concept..." />
        </div>

        {/* Refine inline (shared) */}
        {refiningField && (
          <div className="bg-brand-tint border border-brand/20 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-brand-dark">
              <Sparkles className="w-3.5 h-3.5" /> Refine {refiningField.replace('_', ' ')}
            </div>
            <input value={refineText} onChange={(e) => setRefineText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleRefine()} placeholder={`How should the ${refiningField.replace('_', ' ')} change?`} className="w-full text-sm border border-brand/30 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand/30 bg-white" autoFocus />
            <div className="flex gap-2">
              <button onClick={handleRefine} disabled={refining || !refineText.trim()} className="px-3 py-1.5 bg-brand text-white text-xs font-semibold rounded-lg hover:bg-brand-dark disabled:opacity-50">{refining ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Refine'}</button>
              <button onClick={() => { setRefiningField(null); setRefineText('') }} className="px-3 py-1.5 text-xs text-ink-3">Cancel</button>
            </div>
          </div>
        )}

        {/* Scheduling — visible for full + videographer */}
        {showScheduling && (
          <div>
            <h3 className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider mb-2 flex items-center gap-1"><Clock className="w-3 h-3" /> Schedule</h3>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-[10px] text-ink-4 block mb-0.5">Date</label><input type="date" value={date} onChange={(e) => { setDate(e.target.value); saveField('scheduled_date', e.target.value) }} className="w-full text-sm border border-ink-6 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand/30" /></div>
              <div><label className="text-[10px] text-ink-4 block mb-0.5">Time</label><input type="time" value={time} onChange={(e) => { setTime(e.target.value); saveField('scheduled_time', e.target.value) }} className="w-full text-sm border border-ink-6 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand/30" /></div>
              <div><label className="text-[10px] text-ink-4 block mb-0.5">Platform</label><select value={platform} onChange={(e) => { setPlatform(e.target.value); saveField('platform', e.target.value) }} className="w-full text-sm border border-ink-6 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand/30"><option value="instagram">Instagram</option><option value="facebook">Facebook</option><option value="tiktok">TikTok</option><option value="linkedin">LinkedIn</option></select></div>
              <div><label className="text-[10px] text-ink-4 block mb-0.5">Type</label><select value={contentType} onChange={(e) => { setContentType(e.target.value); saveField('content_type', e.target.value) }} className="w-full text-sm border border-ink-6 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand/30"><option value="reel">Reel</option><option value="feed_post">Feed Post</option><option value="carousel">Carousel</option><option value="story">Story</option></select></div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div><label className="text-[10px] text-ink-4 block mb-0.5">Goal</label><select value={goal} onChange={(e) => { setGoal(e.target.value); saveField('strategic_goal', e.target.value) }} className="w-full text-sm border border-ink-6 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand/30"><option value="">None</option><option value="awareness">Awareness</option><option value="engagement">Engagement</option><option value="conversion">Conversion</option><option value="community">Community</option></select></div>
              <div><label className="text-[10px] text-ink-4 block mb-0.5">Filming Batch</label><input value={batch} onChange={(e) => setBatch(e.target.value)} onBlur={() => batch !== (item.filming_batch ?? '') && saveField('filming_batch', batch)} placeholder="A, B, C..." className="w-full text-sm border border-ink-6 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand/30" /></div>
            </div>
          </div>
        )}

        {/* Divider between scheduling and creative */}
        {hasBrief && <div className="border-t border-ink-6" />}

        {/* Hook */}
        {showHook && item.hook && (
          <div>
            <SectionLabel label="Hook" sublabel="First 3 seconds" onRefine={() => setRefiningField(refiningField === 'hook' ? null : 'hook')} refining={refiningField === 'hook'} copyable={item.hook} />
            <EditableField value={item.hook} onSave={(v) => saveField('hook', v)} type="textarea" displayClassName="text-sm text-ink font-medium leading-relaxed" rows={2} />
            {onGenerateAlternativeHooks && altHooks.length === 0 && (
              <button onClick={handleGenerateAlts} disabled={loadingAlts} className="flex items-center gap-1.5 text-[10px] font-medium text-brand hover:text-brand-dark mt-2">
                {loadingAlts ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />} Generate alternatives
              </button>
            )}
            {altHooks.length > 0 && (
              <div className="mt-2 space-y-1.5">
                <span className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider">Alternatives</span>
                {altHooks.map((alt, i) => (
                  <div key={i} className="flex items-start gap-2 bg-bg-2 rounded-lg p-2.5">
                    <p className="text-xs text-ink-2 flex-1">{alt}</p>
                    <button onClick={() => { saveField('hook', alt); setAltHooks([]) }} className="text-[10px] font-semibold text-brand hover:text-brand-dark whitespace-nowrap">Use this</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Script (video only) */}
        {showScript && isVideo && item.script && (
          <div>
            <SectionLabel label="Script" onRefine={() => setRefiningField(refiningField === 'script' ? null : 'script')} refining={refiningField === 'script'} copyable={item.script} />
            <EditableField value={item.script} onSave={(v) => saveField('script', v)} type="textarea" displayClassName="text-sm text-ink-2 whitespace-pre-wrap leading-relaxed" rows={8} />
          </div>
        )}

        {/* Caption */}
        {showCaption && item.caption && (
          <div>
            <SectionLabel label={`Caption (${item.caption.length} chars)`} onRefine={() => setRefiningField(refiningField === 'caption' ? null : 'caption')} refining={refiningField === 'caption'} copyable={item.caption} />
            <EditableField value={item.caption} onSave={(v) => saveField('caption', v)} type="textarea" displayClassName="text-sm text-ink-2 whitespace-pre-wrap leading-relaxed" rows={5} />
          </div>
        )}

        {/* Hashtags */}
        {showHashtags && item.hashtags && item.hashtags.length > 0 && (
          <div>
            <SectionLabel label={`Hashtags (${item.hashtags.length})`} copyable={item.hashtags.join(' ')} />
            <EditableList items={item.hashtags} onSave={(v) => saveField('hashtags', v)} variant="pills" addLabel="Add" />
          </div>
        )}

        {/* Production details (video) */}
        {isVideo && (showShotList || showProps || showLocation || showMusic || showEditorNotes || showDuration) && (
          <div className="border-t border-ink-6 pt-3">
            <h3 className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider mb-3">Production Details</h3>
            <div className="space-y-3">
              {showShotList && item.shot_list && item.shot_list.length > 0 && (
                <div><label className="text-[10px] text-ink-4 block mb-1">Shot List</label><EditableList items={item.shot_list.map((s) => s.description)} onSave={(v) => saveField('shot_list', v.map((d, i) => ({ shot_number: i + 1, description: d })))} variant="numbered" addLabel="Add shot" /></div>
              )}
              {showProps && item.props && item.props.length > 0 && (
                <div><label className="text-[10px] text-ink-4 block mb-1">Props</label><EditableList items={item.props} onSave={(v) => saveField('props', v)} variant="checkboxes" addLabel="Add prop" /></div>
              )}
              <div className="grid grid-cols-2 gap-3">
                {showLocation && item.location_notes && (
                  <div><label className="text-[10px] text-ink-4 block mb-0.5">Location</label><EditableField value={item.location_notes} onSave={(v) => saveField('location_notes', v)} displayClassName="text-xs text-ink-2" /></div>
                )}
                {showMusic && item.music_direction && (
                  <div><label className="text-[10px] text-ink-4 block mb-0.5">Music</label><EditableField value={item.music_direction} onSave={(v) => saveField('music_direction', v)} displayClassName="text-xs text-ink-2" /></div>
                )}
                {showDuration && item.estimated_duration && (
                  <div><label className="text-[10px] text-ink-4 block mb-0.5">Duration</label><EditableField value={item.estimated_duration} onSave={(v) => saveField('estimated_duration', v)} displayClassName="text-xs text-ink-2" /></div>
                )}
                {showEditorNotes && item.editor_notes && (
                  <div><label className="text-[10px] text-ink-4 block mb-0.5">Editor Notes</label><EditableField value={item.editor_notes} onSave={(v) => saveField('editor_notes', v)} type="textarea" displayClassName="text-xs text-ink-2" rows={2} /></div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* No brief yet */}
        {!hasBrief && (
          <div className="text-center py-6 text-sm text-ink-3 bg-bg-2 rounded-lg">
            Brief not generated yet. Generate from the Strategy tab.
          </div>
        )}

        {/* Meta */}
        <div className="flex items-center gap-3 text-[10px] text-ink-4 pt-2 border-t border-ink-6">
          <span>Source: {item.source}</span>
          <span>Status: {item.status.replace(/_/g, ' ')}</span>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-2.5 border-t border-ink-6 bg-bg-2 flex-shrink-0">
        <button onClick={() => onDelete(item.id)} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors">Delete</button>
        <button onClick={() => onApprove(item.id)} className={`inline-flex items-center gap-1 px-4 py-1.5 text-xs font-semibold rounded-lg transition-colors ${isApproved ? 'bg-brand/10 text-brand border border-brand/20' : 'bg-brand text-white hover:bg-brand-dark'}`}>
          <Check className="w-3 h-3" /> {isApproved ? 'Approved' : 'Approve'}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section label with optional AI refine + copy
// ---------------------------------------------------------------------------

function SectionLabel({ label, sublabel, onRefine, refining, copyable }: {
  label: string; sublabel?: string; onRefine?: () => void; refining?: boolean; copyable?: string
}) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => { if (!copyable) return; await navigator.clipboard.writeText(copyable); setCopied(true); setTimeout(() => setCopied(false), 1500) }

  return (
    <div className="flex items-center justify-between mb-1">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider">{label}</span>
        {sublabel && <span className="text-[10px] text-ink-4">{sublabel}</span>}
      </div>
      <div className="flex items-center gap-1">
        {copyable && (
          <button onClick={handleCopy} className="p-1 text-ink-5 hover:text-ink rounded transition-colors">
            {copied ? <ClipboardCheck className="w-3 h-3 text-brand" /> : <Clipboard className="w-3 h-3" />}
          </button>
        )}
        {onRefine && (
          <button onClick={onRefine} className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded transition-colors ${refining ? 'text-brand bg-brand-tint' : 'text-ink-4 hover:text-brand hover:bg-brand-tint'}`}>
            <Sparkles className="w-2.5 h-2.5" /> AI
          </button>
        )}
      </div>
    </div>
  )
}
