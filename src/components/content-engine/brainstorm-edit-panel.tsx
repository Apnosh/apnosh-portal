'use client'

import { useState, useEffect } from 'react'
import {
  X, Sparkles, RefreshCw, Loader2, Trash2, AlertTriangle,
  Image, Film, Camera as CameraIcon,
} from 'lucide-react'
import type { IdeaCard } from './brainstorm-card'

const FORMAT_CHIPS = [
  { value: 'feed_post', label: 'Static Post', color: 'bg-cyan-100 text-cyan-800 border-cyan-200' },
  { value: 'reel', label: 'Reel / Video', color: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  { value: 'carousel', label: 'Carousel', color: 'bg-pink-100 text-pink-800 border-pink-200' },
]

const GOAL_CHIPS = [
  { value: 'awareness', label: 'Awareness', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  { value: 'engagement', label: 'Engagement', color: 'bg-purple-100 text-purple-700 border-purple-200' },
  { value: 'conversion', label: 'Conversion', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  { value: 'community', label: 'Community', color: 'bg-orange-100 text-orange-700 border-orange-200' },
  { value: 'education', label: 'Education', color: 'bg-teal-100 text-teal-700 border-teal-200' },
]

const THEME_OPTIONS = [
  'Promotion', 'Product', 'Event', 'Seasonal', 'Educational',
  'Testimonial', 'Behind the Scenes', 'Brand', 'Other',
]

const PLATFORM_OPTIONS = [
  { value: 'instagram', label: 'Instagram' }, { value: 'tiktok', label: 'TikTok' },
  { value: 'facebook', label: 'Facebook' }, { value: 'linkedin', label: 'LinkedIn' },
]

const WEEK_OPTIONS = [
  { value: 0, label: 'Unassigned' },
  { value: 1, label: 'Week 1' }, { value: 2, label: 'Week 2' },
  { value: 3, label: 'Week 3' }, { value: 4, label: 'Week 4' }, { value: 5, label: 'Week 5' },
]

const SOURCE_LABELS: Record<string, string> = {
  ai: 'AI generated', strategist: 'Manually added', client_request: 'Client request',
}

interface BrainstormEditPanelProps {
  item: IdeaCard | null
  isNew?: boolean
  onSave: (id: string, field: string, value: unknown) => Promise<void>
  onRefine: (id: string, direction: string) => Promise<void>
  onReplace: (id: string) => Promise<void>
  onDelete: (id: string) => void
  onClose: () => void
  onCreateNew?: (data: Partial<IdeaCard>) => Promise<void>
}

export default function BrainstormEditPanel({
  item, isNew, onSave, onRefine, onReplace, onDelete, onClose, onCreateNew,
}: BrainstormEditPanelProps) {
  // Local draft state
  const [title, setTitle] = useState(item?.concept_title ?? '')
  const [description, setDescription] = useState(item?.concept_description ?? '')
  const [contentType, setContentType] = useState(item?.content_type ?? 'feed_post')
  const [goal, setGoal] = useState(item?.strategic_goal ?? '')
  const [theme, setTheme] = useState(item?.content_category ?? '')
  const [platform, setPlatform] = useState(item?.platform ?? 'instagram')
  const [week, setWeek] = useState(item?.week_number ?? 0)
  const [refineText, setRefineText] = useState('')
  const [refining, setRefining] = useState(false)
  const [replacing, setReplacing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Reset on item change
  useEffect(() => {
    setTitle(item?.concept_title ?? '')
    setDescription(item?.concept_description ?? '')
    setContentType(item?.content_type ?? 'feed_post')
    setGoal(item?.strategic_goal ?? '')
    setTheme(item?.content_category ?? '')
    setPlatform(item?.platform ?? 'instagram')
    setWeek(item?.week_number ?? 0)
    setRefineText('')
    setConfirmDelete(false)
  }, [item?.id])

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Auto-save field on blur
  const saveField = async (field: string, value: unknown) => {
    if (!item || isNew) return
    await onSave(item.id, field, value)
  }

  const handleRefine = async () => {
    if (!item || !refineText.trim()) return
    setRefining(true)
    await onRefine(item.id, refineText)
    setRefineText('')
    setRefining(false)
  }

  const handleReplace = async () => {
    if (!item) return
    setReplacing(true)
    await onReplace(item.id)
    setReplacing(false)
  }

  const handleCreateNew = async () => {
    if (!onCreateNew || !title.trim()) return
    await onCreateNew({
      concept_title: title.trim(),
      concept_description: description.trim() || null,
      content_type: contentType,
      content_category: theme || null,
      strategic_goal: goal || null,
      platform,
      week_number: week || null,
    })
    onClose()
  }

  if (!item && !isNew) return null

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/10" onClick={onClose} />

      {/* Panel */}
      <div className="fixed top-0 right-0 bottom-0 w-full max-w-[450px] z-50 bg-white border-l border-ink-6 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-ink-6 bg-bg-2 flex-shrink-0">
          <h2 className="text-sm font-bold text-ink">{isNew ? 'New Idea' : 'Edit Idea'}</h2>
          <button onClick={onClose} className="p-1.5 text-ink-4 hover:text-ink hover:bg-ink-6 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {/* Title */}
          <div>
            <label className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider block mb-1.5">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => saveField('concept_title', title)}
              placeholder="What's this post about?"
              className="w-full text-base font-semibold text-ink border border-ink-6 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
              autoFocus={isNew}
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider block mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => saveField('concept_description', description)}
              placeholder="What should this post communicate? What details matter?"
              rows={3}
              className="w-full text-sm text-ink border border-ink-6 rounded-lg px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
            />
          </div>

          {/* Content Type */}
          <div>
            <label className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider block mb-1.5">Content Type</label>
            <div className="flex gap-2">
              {FORMAT_CHIPS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => { setContentType(f.value); saveField('content_type', f.value) }}
                  className={`flex-1 text-xs font-semibold py-2 rounded-lg border transition-colors text-center ${
                    contentType === f.value || (f.value === 'feed_post' && contentType === 'static_post')
                      ? f.color : 'border-ink-6 text-ink-3 hover:border-ink-5'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Strategic Goal */}
          <div>
            <label className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider block mb-1.5">Strategic Goal</label>
            <div className="flex flex-wrap gap-1.5">
              {GOAL_CHIPS.map((g) => (
                <button
                  key={g.value}
                  onClick={() => { setGoal(g.value); saveField('strategic_goal', g.value) }}
                  className={`text-[11px] font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                    goal === g.value ? g.color : 'border-ink-6 text-ink-3 hover:border-ink-5'
                  }`}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>

          {/* Theme */}
          <div>
            <label className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider block mb-1.5">Theme</label>
            <select
              value={theme}
              onChange={(e) => { setTheme(e.target.value); saveField('content_category', e.target.value || null) }}
              className="w-full text-sm border border-ink-6 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand/30"
            >
              <option value="">Select theme</option>
              {THEME_OPTIONS.map((t) => (<option key={t} value={t.toLowerCase().replace(/[^a-z]/g, '_')}>{t}</option>))}
            </select>
          </div>

          {/* Platform */}
          <div>
            <label className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider block mb-1.5">Platform</label>
            <select
              value={platform}
              onChange={(e) => { setPlatform(e.target.value); saveField('platform', e.target.value) }}
              className="w-full text-sm border border-ink-6 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand/30"
            >
              {PLATFORM_OPTIONS.map((p) => (<option key={p.value} value={p.value}>{p.label}</option>))}
            </select>
          </div>

          {/* Source (read-only) */}
          {item && !isNew && (
            <div className="text-[10px] text-ink-4 pt-2 border-t border-ink-6">
              Source: {SOURCE_LABELS[item.source] ?? item.source}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-5 py-3 border-t border-ink-6 bg-bg-2 flex-shrink-0 space-y-3">
          {isNew ? (
            <button onClick={handleCreateNew} disabled={!title.trim()} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-brand text-white text-sm font-semibold rounded-lg hover:bg-brand-dark transition-colors disabled:opacity-50">
              Add Idea
            </button>
          ) : (
            <>
              {/* Refine */}
              <div className="flex gap-1.5">
                <input
                  value={refineText}
                  onChange={(e) => setRefineText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleRefine()}
                  placeholder="Refine direction (e.g., make more personal)..."
                  className="flex-1 text-xs border border-ink-6 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
                <button onClick={handleRefine} disabled={refining || !refineText.trim()} className="px-3 py-2 bg-brand text-white text-xs font-semibold rounded-lg hover:bg-brand-dark disabled:opacity-50 transition-colors">
                  {refining ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Sparkles className="w-3 h-3" /></>}
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button onClick={handleReplace} disabled={replacing} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium border border-ink-5 rounded-lg hover:bg-bg-2 transition-colors disabled:opacity-50">
                  {replacing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Replace with new idea
                </button>
                <button onClick={() => setConfirmDelete(true)} className="px-3 py-2 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>

              {/* Delete confirmation */}
              {confirmDelete && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                  <span className="text-xs text-red-700 flex-1">Remove this idea?</span>
                  <button onClick={() => { onDelete(item!.id); onClose() }} className="text-xs font-semibold text-red-700 hover:text-red-800">Remove</button>
                  <button onClick={() => setConfirmDelete(false)} className="text-xs text-ink-3">Cancel</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}
