'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Check, Sparkles, Loader2, ChevronUp, ChevronDown,
  Clipboard, ClipboardCheck, Wand2,
  Camera, Globe, Video, MessageCircle,
} from 'lucide-react'
import EditableField from './editable-field'
import EditableList from './editable-list'

interface BriefItem {
  id: string
  concept_title: string
  concept_description: string | null
  content_type: string
  platform: string
  strategic_goal: string | null
  filming_batch: string | null
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

const PLATFORM_ICONS: Record<string, typeof Camera> = {
  instagram: Camera, tiktok: Video, facebook: Globe, linkedin: MessageCircle,
}

const TYPE_COLORS: Record<string, string> = {
  reel: 'bg-indigo-100 text-indigo-800', feed_post: 'bg-cyan-100 text-cyan-800',
  carousel: 'bg-pink-100 text-pink-800', story: 'bg-amber-100 text-amber-800',
}

interface BriefDetailPanelProps {
  item: BriefItem
  allItems: BriefItem[]
  onSave: (id: string, field: string, value: unknown) => Promise<void>
  onApprove: (id: string) => void
  onRefine: (id: string, field: string, direction: string) => Promise<void>
  onGenerateAlternativeHooks: (id: string) => Promise<string[]>
  onNavigate: (id: string) => void
}

export default function BriefDetailPanel({
  item, allItems, onSave, onApprove, onRefine, onGenerateAlternativeHooks, onNavigate,
}: BriefDetailPanelProps) {
  const [refiningField, setRefiningField] = useState<string | null>(null)
  const [refineText, setRefineText] = useState('')
  const [refining, setRefining] = useState(false)
  const [altHooks, setAltHooks] = useState<string[]>([])
  const [loadingAlts, setLoadingAlts] = useState(false)

  const isApproved = item.status === 'approved' || item.status === 'strategist_approved'
  const isVideo = ['reel', 'video', 'short_form_video'].includes(item.content_type)
  const PIcon = PLATFORM_ICONS[item.platform] ?? Globe
  const tc = TYPE_COLORS[item.content_type] ?? 'bg-ink-6 text-ink-3'
  const currentIdx = allItems.findIndex((i) => i.id === item.id)

  // Reset when item changes
  useEffect(() => {
    setRefiningField(null)
    setRefineText('')
    setAltHooks([])
  }, [item.id])

  // Keyboard nav
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault()
        if (currentIdx > 0) onNavigate(allItems[currentIdx - 1].id)
      }
      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault()
        if (currentIdx < allItems.length - 1) onNavigate(allItems[currentIdx + 1].id)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [item.id, allItems, currentIdx, onNavigate])

  const handleRefine = async () => {
    if (!refineText.trim() || !refiningField) return
    setRefining(true)
    await onRefine(item.id, refiningField, refineText)
    setRefining(false)
    setRefiningField(null)
    setRefineText('')
  }

  const handleGenerateAlts = async () => {
    setLoadingAlts(true)
    const alts = await onGenerateAlternativeHooks(item.id)
    setAltHooks(alts)
    setLoadingAlts(false)
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-ink-6 flex-shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={() => currentIdx > 0 && onNavigate(allItems[currentIdx - 1].id)}
            disabled={currentIdx <= 0}
            className="p-1 text-ink-4 hover:text-ink disabled:opacity-30 rounded"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
          <button
            onClick={() => currentIdx < allItems.length - 1 && onNavigate(allItems[currentIdx + 1].id)}
            disabled={currentIdx >= allItems.length - 1}
            className="p-1 text-ink-4 hover:text-ink disabled:opacity-30 rounded"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
          <span className="text-[10px] text-ink-4">{currentIdx + 1} of {allItems.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${tc}`}>{item.content_type.replace(/_/g, ' ')}</span>
          <PIcon className="w-3.5 h-3.5 text-ink-4" />
          <button
            onClick={() => onApprove(item.id)}
            className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
              isApproved ? 'bg-brand/10 text-brand border border-brand/20' : 'bg-brand text-white hover:bg-brand-dark'
            }`}
          >
            <Check className="w-3 h-3" /> {isApproved ? 'Approved' : 'Approve'}
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {/* Title */}
        <div>
          <h2 className="text-base font-bold text-ink">{item.concept_title}</h2>
          {item.concept_description && (
            <p className="text-xs text-ink-3 mt-1">{item.concept_description}</p>
          )}
          {item.strategic_goal && (
            <span className="inline-block text-[10px] font-medium text-ink-3 bg-bg-2 px-2 py-0.5 rounded mt-2 capitalize">{item.strategic_goal}</span>
          )}
        </div>

        {/* Hook */}
        {item.hook && (
          <BriefSection
            label="Hook"
            sublabel="First 3 seconds / opening line"
            onRefineStart={() => setRefiningField(refiningField === 'hook' ? null : 'hook')}
            refining={refiningField === 'hook'}
          >
            <EditableField
              value={item.hook}
              onSave={(v) => onSave(item.id, 'hook', v)}
              type="textarea"
              displayClassName="text-sm text-ink font-medium leading-relaxed"
              rows={2}
            />
            {/* Alternative hooks */}
            {altHooks.length === 0 && (
              <button
                onClick={handleGenerateAlts}
                disabled={loadingAlts}
                className="flex items-center gap-1.5 text-[10px] font-medium text-brand hover:text-brand-dark mt-2 transition-colors"
              >
                {loadingAlts ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                Generate alternative hooks
              </button>
            )}
            {altHooks.length > 0 && (
              <div className="mt-3 space-y-1.5">
                <span className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider">Alternatives</span>
                {altHooks.map((alt, i) => (
                  <div key={i} className="flex items-start gap-2 bg-bg-2 rounded-lg p-2.5">
                    <p className="text-xs text-ink-2 flex-1">{alt}</p>
                    <button
                      onClick={() => { onSave(item.id, 'hook', alt); setAltHooks([]) }}
                      className="text-[10px] font-semibold text-brand hover:text-brand-dark whitespace-nowrap"
                    >
                      Use this
                    </button>
                  </div>
                ))}
              </div>
            )}
          </BriefSection>
        )}

        {/* Script (video only) */}
        {isVideo && item.script && (
          <BriefSection
            label="Script"
            sublabel="Full video script"
            onRefineStart={() => setRefiningField(refiningField === 'script' ? null : 'script')}
            refining={refiningField === 'script'}
          >
            <EditableField
              value={item.script}
              onSave={(v) => onSave(item.id, 'script', v)}
              type="textarea"
              displayClassName="text-sm text-ink-2 whitespace-pre-wrap leading-relaxed"
              rows={8}
            />
          </BriefSection>
        )}

        {/* Caption */}
        {item.caption && (
          <BriefSection
            label="Caption"
            sublabel={`${item.caption.length} / 2,200 chars`}
            onRefineStart={() => setRefiningField(refiningField === 'caption' ? null : 'caption')}
            refining={refiningField === 'caption'}
            copyable={item.caption}
          >
            <EditableField
              value={item.caption}
              onSave={(v) => onSave(item.id, 'caption', v)}
              type="textarea"
              displayClassName="text-sm text-ink-2 whitespace-pre-wrap leading-relaxed"
              rows={5}
            />
          </BriefSection>
        )}

        {/* Hashtags */}
        {item.hashtags && item.hashtags.length > 0 && (
          <BriefSection label="Hashtags" copyable={item.hashtags.join(' ')}>
            <EditableList
              items={item.hashtags}
              onSave={(v) => onSave(item.id, 'hashtags', v)}
              variant="pills"
              addLabel="Add hashtag"
            />
          </BriefSection>
        )}

        {/* Production Details (video only) */}
        {isVideo && (
          <div className="border-t border-ink-6 pt-4">
            <h3 className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider mb-3">Production Details</h3>
            <div className="space-y-4">
              {item.shot_list && item.shot_list.length > 0 && (
                <div>
                  <label className="text-[10px] text-ink-4 block mb-1">Shot List</label>
                  <EditableList
                    items={item.shot_list.map((s) => s.description)}
                    onSave={(v) => onSave(item.id, 'shot_list', v.map((d, i) => ({ shot_number: i + 1, description: d })))}
                    variant="numbered"
                    addLabel="Add shot"
                  />
                </div>
              )}
              {item.props && item.props.length > 0 && (
                <div>
                  <label className="text-[10px] text-ink-4 block mb-1">Props</label>
                  <EditableList
                    items={item.props}
                    onSave={(v) => onSave(item.id, 'props', v)}
                    variant="checkboxes"
                    addLabel="Add prop"
                  />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                {item.location_notes && (
                  <div>
                    <label className="text-[10px] text-ink-4 block mb-1">Location</label>
                    <EditableField value={item.location_notes} onSave={(v) => onSave(item.id, 'location_notes', v)} displayClassName="text-xs text-ink-2" />
                  </div>
                )}
                {item.music_direction && (
                  <div>
                    <label className="text-[10px] text-ink-4 block mb-1">Music</label>
                    <EditableField value={item.music_direction} onSave={(v) => onSave(item.id, 'music_direction', v)} displayClassName="text-xs text-ink-2" />
                  </div>
                )}
                {item.estimated_duration && (
                  <div>
                    <label className="text-[10px] text-ink-4 block mb-1">Duration</label>
                    <EditableField value={item.estimated_duration} onSave={(v) => onSave(item.id, 'estimated_duration', v)} displayClassName="text-xs text-ink-2" />
                  </div>
                )}
                {item.editor_notes && (
                  <div>
                    <label className="text-[10px] text-ink-4 block mb-1">Editor Notes</label>
                    <EditableField value={item.editor_notes} onSave={(v) => onSave(item.id, 'editor_notes', v)} type="textarea" displayClassName="text-xs text-ink-2" rows={2} />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Refine inline */}
        {refiningField && (
          <div className="bg-brand-tint border border-brand/20 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-brand-dark">
              <Sparkles className="w-3.5 h-3.5" /> Refine {refiningField}
            </div>
            <input
              value={refineText}
              onChange={(e) => setRefineText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleRefine()}
              placeholder={`How should the ${refiningField} change?`}
              className="w-full text-sm border border-brand/30 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand/30 bg-white"
              autoFocus
            />
            <div className="flex gap-2">
              <button onClick={handleRefine} disabled={refining || !refineText.trim()} className="px-3 py-1.5 bg-brand text-white text-xs font-semibold rounded-lg hover:bg-brand-dark disabled:opacity-50">
                {refining ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Refine'}
              </button>
              <button onClick={() => { setRefiningField(null); setRefineText('') }} className="px-3 py-1.5 text-xs text-ink-3">Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Brief Section wrapper
// ---------------------------------------------------------------------------

function BriefSection({ label, sublabel, children, onRefineStart, refining, copyable }: {
  label: string; sublabel?: string; children: React.ReactNode
  onRefineStart?: () => void; refining?: boolean; copyable?: string
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    if (!copyable) return
    await navigator.clipboard.writeText(copyable)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider">{label}</span>
          {sublabel && <span className="text-[10px] text-ink-4">{sublabel}</span>}
        </div>
        <div className="flex items-center gap-1">
          {copyable && (
            <button onClick={handleCopy} className="p-1 text-ink-5 hover:text-ink rounded transition-colors" title="Copy">
              {copied ? <ClipboardCheck className="w-3 h-3 text-brand" /> : <Clipboard className="w-3 h-3" />}
            </button>
          )}
          {onRefineStart && (
            <button
              onClick={onRefineStart}
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded transition-colors ${
                refining ? 'text-brand bg-brand-tint' : 'text-ink-4 hover:text-brand hover:bg-brand-tint'
              }`}
            >
              <Sparkles className="w-2.5 h-2.5" /> AI
            </button>
          )}
        </div>
      </div>
      {children}
    </div>
  )
}
