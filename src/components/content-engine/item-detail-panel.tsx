'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  X, ChevronUp, ChevronDown, Check, Trash2, Sparkles, Loader2,
  Camera, Globe, Video, MessageCircle, Clock, Target, Layers,
} from 'lucide-react'
import type { CalendarItemData } from './calendar-item-row'

const PLATFORM_ICONS: Record<string, typeof Camera> = {
  instagram: Camera, tiktok: Video, facebook: Globe, linkedin: MessageCircle,
}

const TYPE_COLORS: Record<string, string> = {
  reel: 'bg-indigo-100 text-indigo-800',
  feed_post: 'bg-cyan-100 text-cyan-800',
  carousel: 'bg-pink-100 text-pink-800',
  story: 'bg-amber-100 text-amber-800',
  static_post: 'bg-cyan-100 text-cyan-800',
  video: 'bg-indigo-100 text-indigo-800',
}

const ALL_PLATFORMS = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'linkedin', label: 'LinkedIn' },
]

interface ItemDetailPanelProps {
  item: CalendarItemData
  allItems: CalendarItemData[]
  onSave: (id: string, field: string, value: string) => Promise<void>
  onApprove: (id: string) => void
  onDelete: (id: string) => void
  onRefine: (id: string, direction: string) => Promise<void>
  onNavigate: (id: string) => void
  onClose: () => void
}

export default function ItemDetailPanel({
  item, allItems, onSave, onApprove, onDelete, onRefine, onNavigate, onClose,
}: ItemDetailPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [refineField, setRefineField] = useState<string | null>(null)
  const [refineText, setRefineText] = useState('')
  const [refining, setRefining] = useState(false)

  // Local draft state
  const [title, setTitle] = useState(item.concept_title)
  const [description, setDescription] = useState(item.concept_description ?? '')
  const [date, setDate] = useState(item.scheduled_date)
  const [time, setTime] = useState(item.scheduled_time ?? '')
  const [platform, setPlatform] = useState(item.platform)
  const [additionalPlatforms, setAdditionalPlatforms] = useState<string[]>(item.additional_platforms ?? [])
  const [contentType, setContentType] = useState(item.content_type)
  const [goal, setGoal] = useState(item.strategic_goal ?? '')
  const [batch, setBatch] = useState(item.filming_batch ?? '')

  // Reset when item changes
  useEffect(() => {
    setTitle(item.concept_title)
    setDescription(item.concept_description ?? '')
    setDate(item.scheduled_date)
    setTime(item.scheduled_time ?? '')
    setPlatform(item.platform)
    setAdditionalPlatforms(item.additional_platforms ?? [])
    setContentType(item.content_type)
    setGoal(item.strategic_goal ?? '')
    setBatch(item.filming_batch ?? '')
    setRefineField(null)
    setRefineText('')
  }, [item.id, item.concept_title, item.concept_description, item.scheduled_date, item.scheduled_time, item.platform, item.content_type, item.strategic_goal, item.filming_batch])

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return
      const idx = allItems.findIndex((i) => i.id === item.id)
      if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault()
        if (idx > 0) onNavigate(allItems[idx - 1].id)
      }
      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault()
        if (idx < allItems.length - 1) onNavigate(allItems[idx + 1].id)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [item.id, allItems, onNavigate, onClose])

  // Auto-save on blur for each field
  const saveField = useCallback(async (field: string, value: string) => {
    setSaving(field)
    await onSave(item.id, field, value)
    setSaving(null)
  }, [item.id, onSave])

  const handleRefine = async () => {
    if (!refineText.trim() || !refineField) return
    setRefining(true)
    await onRefine(item.id, refineText)
    setRefining(false)
    setRefineField(null)
    setRefineText('')
  }

  const isApproved = item.status === 'strategist_approved' || item.status === 'approved'
  const currentIdx = allItems.findIndex((i) => i.id === item.id)
  const hasPrev = currentIdx > 0
  const hasNext = currentIdx < allItems.length - 1
  const PlatformIcon = PLATFORM_ICONS[platform] ?? Globe
  const tc = TYPE_COLORS[contentType] ?? 'bg-ink-6 text-ink-3'

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/10" onClick={onClose} />

      {/* Panel */}
      <div
        ref={panelRef}
        className="fixed top-0 right-0 bottom-0 w-full max-w-[420px] z-50 bg-white border-l border-ink-6 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-ink-6 bg-bg-2 flex-shrink-0">
          <div className="flex items-center gap-2">
            {/* Nav arrows */}
            <button
              onClick={() => hasPrev && onNavigate(allItems[currentIdx - 1].id)}
              disabled={!hasPrev}
              className="p-1 text-ink-4 hover:text-ink disabled:opacity-30 rounded transition-colors"
              title="Previous (↑)"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
            <button
              onClick={() => hasNext && onNavigate(allItems[currentIdx + 1].id)}
              disabled={!hasNext}
              className="p-1 text-ink-4 hover:text-ink disabled:opacity-30 rounded transition-colors"
              title="Next (↓)"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
            <span className="text-[10px] text-ink-4 font-medium">{currentIdx + 1} of {allItems.length}</span>
          </div>
          <button onClick={onClose} className="p-1.5 text-ink-4 hover:text-ink hover:bg-ink-6 rounded-lg transition-colors" title="Close (Esc)">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {/* Type + Platform badges */}
          <div className="flex items-center gap-2">
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${tc}`}>
              {contentType.replace(/_/g, ' ')}
            </span>
            <span className="flex items-center gap-1 text-[11px] text-ink-3">
              <PlatformIcon className="w-3 h-3" />
              {platform}
            </span>
            {isApproved && (
              <span className="flex items-center gap-1 text-[11px] font-semibold text-brand">
                <Check className="w-3 h-3" /> Approved
              </span>
            )}
          </div>

          {/* Title */}
          <div>
            <label className="text-[10px] font-semibold text-ink-4 uppercase tracking-wider flex items-center justify-between mb-1.5">
              Title
              <RefineButton onClick={() => setRefineField(refineField === 'title' ? null : 'title')} active={refineField === 'title'} />
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => title !== item.concept_title && saveField('concept_title', title)}
              className="w-full text-base font-semibold text-ink border border-ink-6 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
              placeholder="What's this post about?"
            />
            {saving === 'concept_title' && <SavingIndicator />}
          </div>

          {/* Description */}
          <div>
            <label className="text-[10px] font-semibold text-ink-4 uppercase tracking-wider flex items-center justify-between mb-1.5">
              Description
              <RefineButton onClick={() => setRefineField(refineField === 'description' ? null : 'description')} active={refineField === 'description'} />
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => description !== (item.concept_description ?? '') && saveField('concept_description', description)}
              rows={3}
              className="w-full text-sm text-ink border border-ink-6 rounded-lg px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
              placeholder="Describe the concept and why it matters..."
            />
            {saving === 'concept_description' && <SavingIndicator />}
          </div>

          {/* AI Refine (inline, shows when field button clicked) */}
          {refineField && (
            <div className="bg-brand-tint border border-brand/20 rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-brand-dark">
                <Sparkles className="w-3.5 h-3.5" /> Refine {refineField}
              </div>
              <input
                value={refineText}
                onChange={(e) => setRefineText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleRefine()}
                placeholder={`How should the ${refineField} change?`}
                className="w-full text-sm border border-brand/30 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand/30 bg-white"
                autoFocus
              />
              <div className="flex gap-2">
                <button onClick={handleRefine} disabled={refining || !refineText.trim()} className="px-3 py-1.5 bg-brand text-white text-xs font-semibold rounded-lg hover:bg-brand-dark disabled:opacity-50 transition-colors">
                  {refining ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Refine'}
                </button>
                <button onClick={() => { setRefineField(null); setRefineText('') }} className="px-3 py-1.5 text-xs text-ink-3 hover:text-ink transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Scheduling */}
          <div>
            <label className="text-[10px] font-semibold text-ink-4 uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <Clock className="w-3 h-3" /> Schedule
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-ink-4 block mb-0.5">Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => { setDate(e.target.value); saveField('scheduled_date', e.target.value) }}
                  className="w-full text-sm border border-ink-6 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
              </div>
              <div>
                <label className="text-[10px] text-ink-4 block mb-0.5">Time</label>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => { setTime(e.target.value); saveField('scheduled_time', e.target.value) }}
                  className="w-full text-sm border border-ink-6 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
              </div>
            </div>
          </div>

          {/* Platforms (multi-select toggles) */}
          <div>
            <label className="text-[10px] font-semibold text-ink-4 uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <Layers className="w-3 h-3" /> Platforms
            </label>
            <div className="flex flex-wrap gap-2">
              {ALL_PLATFORMS.map((p) => {
                const Icon = PLATFORM_ICONS[p.value] ?? Globe
                const isPrimary = platform === p.value
                const isAdditional = additionalPlatforms.includes(p.value)
                const isActive = isPrimary || isAdditional
                return (
                  <button
                    key={p.value}
                    onClick={() => {
                      if (isPrimary) return // Can't deselect primary
                      if (isAdditional) {
                        const updated = additionalPlatforms.filter((x) => x !== p.value)
                        setAdditionalPlatforms(updated)
                        onSave(item.id, 'additional_platforms', JSON.stringify(updated))
                      } else {
                        const updated = [...additionalPlatforms, p.value]
                        setAdditionalPlatforms(updated)
                        onSave(item.id, 'additional_platforms', JSON.stringify(updated))
                      }
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                      isPrimary
                        ? 'bg-ink text-white border-ink'
                        : isActive
                          ? 'bg-brand-tint text-brand-dark border-brand/30'
                          : 'bg-white text-ink-3 border-ink-6 hover:border-ink-5'
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                    {p.label}
                    {isPrimary && <span className="text-[9px] opacity-70">primary</span>}
                  </button>
                )
              })}
            </div>
            <p className="text-[10px] text-ink-4 mt-1.5">Click to add platforms. Primary platform is set by the original generation.</p>
          </div>

          {/* Content Type */}
          <div>
            <label className="text-[10px] font-semibold text-ink-4 uppercase tracking-wider mb-1.5">Content Type</label>
            <select
              value={contentType}
              onChange={(e) => { setContentType(e.target.value); saveField('content_type', e.target.value) }}
              className="w-full text-sm border border-ink-6 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand/30"
            >
              <option value="reel">Reel</option>
              <option value="feed_post">Feed Post</option>
              <option value="carousel">Carousel</option>
              <option value="story">Story</option>
            </select>
          </div>

          {/* Goal + Batch */}
          <div>
            <label className="text-[10px] font-semibold text-ink-4 uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <Target className="w-3 h-3" /> Strategy
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-ink-4 block mb-0.5">Strategic Goal</label>
                <select
                  value={goal}
                  onChange={(e) => { setGoal(e.target.value); saveField('strategic_goal', e.target.value) }}
                  className="w-full text-sm border border-ink-6 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand/30"
                >
                  <option value="">None</option>
                  <option value="awareness">Awareness</option>
                  <option value="engagement">Engagement</option>
                  <option value="conversion">Conversion</option>
                  <option value="community">Community</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-ink-4 block mb-0.5">Filming Batch</label>
                <input
                  value={batch}
                  onChange={(e) => setBatch(e.target.value)}
                  onBlur={() => batch !== (item.filming_batch ?? '') && saveField('filming_batch', batch)}
                  placeholder="A, B, C..."
                  className="w-full text-sm border border-ink-6 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
              </div>
            </div>
          </div>

          {/* Meta */}
          <div className="flex items-center gap-3 text-[10px] text-ink-4 pt-2 border-t border-ink-6">
            <span className="capitalize">Source: {item.source}</span>
            <span>Status: {item.status.replace(/_/g, ' ')}</span>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-ink-6 bg-bg-2 flex-shrink-0">
          <button
            onClick={() => onDelete(item.id)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
          <button
            onClick={() => onApprove(item.id)}
            className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg transition-colors ${
              isApproved
                ? 'bg-brand/10 text-brand border border-brand/20'
                : 'bg-brand text-white hover:bg-brand-dark'
            }`}
          >
            <Check className="w-3.5 h-3.5" />
            {isApproved ? 'Approved' : 'Approve'}
          </button>
        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function RefineButton({ onClick, active }: { onClick: () => void; active: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded transition-colors ${
        active ? 'text-brand bg-brand-tint' : 'text-ink-4 hover:text-brand hover:bg-brand-tint'
      }`}
    >
      <Sparkles className="w-2.5 h-2.5" /> AI
    </button>
  )
}

function SavingIndicator() {
  return (
    <span className="text-[10px] text-brand flex items-center gap-1 mt-0.5">
      <Loader2 className="w-2.5 h-2.5 animate-spin" /> Saving...
    </span>
  )
}
