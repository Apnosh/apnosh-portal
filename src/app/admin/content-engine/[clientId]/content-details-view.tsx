'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Loader2, Check, Sparkles, ChevronUp, ChevronDown,
  Camera, Globe, Video, MessageCircle, Image as ImageIcon, Film,
  Layers, Pen,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { updateCalendarItem } from '@/lib/content-engine/actions'
import { generateBriefs, refineBriefField } from '@/lib/content-engine/generate-briefs'
import type { ClientContext } from '@/lib/content-engine/context'
import type { ContentPlanItem } from '@/components/content-engine/unified-detail-panel'
import ProductionBriefForm from '@/components/content-engine/production-brief-form'
import EditableField from '@/components/content-engine/editable-field'
import EditableList from '@/components/content-engine/editable-list'
import { useToast } from '@/components/ui/toast'

type EditMode = 'builder' | 'quick-edit'

const PLATFORM_ICONS: Record<string, typeof Camera> = {
  instagram: Camera, tiktok: Video, facebook: Globe, linkedin: MessageCircle,
}

const TYPE_COLORS: Record<string, string> = {
  reel: 'bg-indigo-100 text-indigo-800', feed_post: 'bg-cyan-100 text-cyan-800',
  carousel: 'bg-pink-100 text-pink-800', story: 'bg-amber-100 text-amber-800',
  static_post: 'bg-cyan-100 text-cyan-800', video: 'bg-indigo-100 text-indigo-800',
}

const COMPLETENESS_COLORS: Record<string, string> = {
  complete: 'bg-brand', partial: 'bg-amber-400', empty: 'bg-ink-5',
}

interface ContentDetailsViewProps {
  cycleId: string
  clientId: string
  context: ClientContext | null
}

export default function ContentDetailsView({ cycleId, clientId, context }: ContentDetailsViewProps) {
  const supabase = createClient()
  const { toast } = useToast()
  const [items, setItems] = useState<ContentPlanItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editMode, setEditMode] = useState<EditMode>('quick-edit')
  const [generatingBriefs, setGeneratingBriefs] = useState(false)

  const loadItems = useCallback(async () => {
    const { data } = await supabase
      .from('content_calendar_items')
      .select('*')
      .eq('cycle_id', cycleId)
      .order('scheduled_date').order('scheduled_time')
    const loaded = (data ?? []) as ContentPlanItem[]
    setItems(loaded)
    if (loaded.length > 0 && !selectedId) setSelectedId(loaded[0].id)
    setLoading(false)
  }, [cycleId, supabase, selectedId])

  useEffect(() => { loadItems() }, [loadItems])

  const selectedItem = items.find((i) => i.id === selectedId) ?? null
  const currentIdx = selectedItem ? items.findIndex((i) => i.id === selectedItem.id) : -1
  const isVideo = selectedItem ? ['reel', 'video', 'short_form_video'].includes(selectedItem.content_type) : false

  // Completeness
  const getCompleteness = (item: ContentPlanItem): string => {
    const video = ['reel', 'video', 'short_form_video'].includes(item.content_type)
    const fields = [item.hook, item.caption, item.concept_description]
    if (video) fields.push(item.script)
    const filled = fields.filter(Boolean).length
    if (filled === fields.length) return 'complete'
    if (filled > 0) return 'partial'
    return 'empty'
  }

  // Save
  const saveField = async (id: string, field: string, value: unknown) => {
    let parsed = value
    if (typeof value === 'string' && value.startsWith('[')) { try { parsed = JSON.parse(value) } catch { /* keep */ } }
    await updateCalendarItem(id, { [field]: parsed })
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, [field]: parsed } : i))
  }

  // Approve
  const handleApprove = async (id: string) => {
    const item = items.find((i) => i.id === id)
    if (!item) return
    const newStatus = (item.status === 'approved' || item.status === 'strategist_approved') ? 'draft' : 'approved'
    await updateCalendarItem(id, { status: newStatus })
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, status: newStatus } : i))
  }

  // Navigate
  const goNext = () => { if (currentIdx < items.length - 1) setSelectedId(items[currentIdx + 1].id) }
  const goPrev = () => { if (currentIdx > 0) setSelectedId(items[currentIdx - 1].id) }

  // Keyboard nav
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return
      if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); goPrev() }
      if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); goNext() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

  // AI generate briefs for all items
  const handleGenerateBriefs = async () => {
    if (!context) return
    setGeneratingBriefs(true)
    // Auto-approve items first
    await supabase.from('content_calendar_items').update({ status: 'strategist_approved' }).eq('cycle_id', cycleId).eq('status', 'draft')
    const result = await generateBriefs(cycleId, clientId, context)
    if (result.success) {
      await loadItems()
      toast(`Briefs generated for ${result.count} items`, 'success')
    } else {
      toast(result.error ?? 'Failed', 'error')
    }
    setGeneratingBriefs(false)
  }

  // Stats
  const approvedCount = items.filter((i) => i.status === 'approved' || i.status === 'strategist_approved').length
  const hasBriefs = items.some((i) => i.hook || i.caption || i.script)

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-ink-4" /></div>

  if (items.length === 0) {
    return (
      <div className="text-center py-16 text-sm text-ink-3">
        No content items yet. Go to the Brainstorm tab to generate ideas first.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-ink">{items.length} content items</span>
          <div className="w-20 h-1.5 bg-ink-6 rounded-full overflow-hidden">
            <div className="h-full bg-brand rounded-full transition-all" style={{ width: `${items.length > 0 ? Math.round((approvedCount / items.length) * 100) : 0}%` }} />
          </div>
          <span className="text-[10px] text-ink-3">{approvedCount}/{items.length} approved</span>
        </div>
        <div className="flex items-center gap-2">
          {/* AI Fill All */}
          <button onClick={handleGenerateBriefs} disabled={generatingBriefs} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-brand bg-brand-tint rounded-lg hover:bg-brand/10 transition-colors disabled:opacity-50">
            {generatingBriefs ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            AI Fill All
          </button>
          {/* Mode toggle */}
          <div className="flex rounded-lg border border-ink-6 overflow-hidden">
            <button onClick={() => setEditMode('quick-edit')} className={`flex items-center gap-1 px-3 py-1.5 text-[11px] font-medium transition-colors ${editMode === 'quick-edit' ? 'bg-ink text-white' : 'text-ink-3 hover:bg-bg-2'}`}>
              <Pen className="w-3 h-3" /> Quick Edit
            </button>
            <button onClick={() => setEditMode('builder')} className={`flex items-center gap-1 px-3 py-1.5 text-[11px] font-medium transition-colors ${editMode === 'builder' ? 'bg-ink text-white' : 'text-ink-3 hover:bg-bg-2'}`}>
              <Layers className="w-3 h-3" /> Builder
            </button>
          </div>
        </div>
      </div>

      {/* Guidance */}
      {!hasBriefs && (
        <div className="flex items-center gap-2 text-xs text-ink-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5">
          <Sparkles className="w-4 h-4 text-blue-500 flex-shrink-0" />
          <span>Click <strong>AI Fill All</strong> to auto-generate details for every item based on your brainstorm ideas. Or fill each item manually using Quick Edit or Builder mode.</span>
        </div>
      )}

      {/* Two-panel layout */}
      <div className="flex gap-4" style={{ minHeight: '600px' }}>
        {/* Left: Item list */}
        <div className="w-[280px] flex-shrink-0 bg-white rounded-xl border border-ink-6 overflow-hidden flex flex-col">
          <div className="px-3 py-2 border-b border-ink-6 bg-bg-2 flex items-center justify-between">
            <span className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider">Items</span>
            <span className="text-[10px] text-ink-4">{approvedCount}/{items.length} approved</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {items.map((item) => {
              const PIcon = PLATFORM_ICONS[item.platform] ?? Globe
              const comp = getCompleteness(item)
              const isSelected = selectedId === item.id
              const isApproved = item.status === 'approved' || item.status === 'strategist_approved'
              const tc = TYPE_COLORS[item.content_type] ?? 'bg-ink-6 text-ink-3'

              return (
                <button
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  className={`w-full text-left px-3 py-2.5 border-b border-ink-6 last:border-0 transition-colors ${
                    isSelected ? 'bg-brand-tint' : 'hover:bg-bg-2'
                  } ${isApproved ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${COMPLETENESS_COLORS[comp]}`} />
                    <PIcon className="w-3 h-3 text-ink-4 flex-shrink-0" />
                    <span className={`text-[9px] font-semibold px-1 py-0.5 rounded ${tc}`}>
                      {item.content_type.replace(/_/g, ' ')}
                    </span>
                    {isApproved && <Check className="w-3 h-3 text-brand ml-auto flex-shrink-0" />}
                  </div>
                  <p className="text-xs font-medium text-ink truncate">{item.concept_title}</p>
                  <p className="text-[10px] text-ink-4 mt-0.5">
                    {item.scheduled_date ? new Date(item.scheduled_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'No date'}
                  </p>
                </button>
              )
            })}
          </div>
        </div>

        {/* Right: Editor */}
        <div className="flex-1 bg-white rounded-xl border border-ink-6 overflow-hidden flex flex-col">
          {selectedItem ? (
            <>
              {/* Item header with nav + AI fill + approve */}
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-ink-6 bg-bg-2 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <button onClick={goPrev} disabled={currentIdx <= 0} className="p-1 text-ink-4 hover:text-ink disabled:opacity-30 rounded"><ChevronUp className="w-4 h-4" /></button>
                  <button onClick={goNext} disabled={currentIdx >= items.length - 1} className="p-1 text-ink-4 hover:text-ink disabled:opacity-30 rounded"><ChevronDown className="w-4 h-4" /></button>
                  <span className="text-[10px] text-ink-4">{currentIdx + 1} / {items.length}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={async () => {
                      if (!context) return
                      toast('Generating details for this item...', 'info')
                      // Auto-approve so brief generation works
                      await saveField(selectedItem.id, 'status', 'strategist_approved')
                      const result = await generateBriefs(cycleId, clientId, context)
                      if (result.success) { await loadItems(); toast('Details filled', 'success') }
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold text-brand bg-brand-tint rounded-lg hover:bg-brand/10 transition-colors"
                  >
                    <Sparkles className="w-3 h-3" /> AI Fill
                  </button>
                  <button onClick={() => handleApprove(selectedItem.id)} className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
                    (selectedItem.status === 'approved' || selectedItem.status === 'strategist_approved')
                      ? 'bg-brand/10 text-brand border border-brand/20'
                      : 'bg-brand text-white hover:bg-brand-dark'
                  }`}>
                    <Check className="w-3 h-3" /> {(selectedItem.status === 'approved' || selectedItem.status === 'strategist_approved') ? 'Approved' : 'Approve'}
                  </button>
                </div>
              </div>

              {/* Form — same component, different layout */}
              <ProductionBriefForm
                key={`${selectedItem.id}-${editMode}`}
                isVideo={isVideo}
                layout={editMode === 'builder' ? 'tabbed' : 'scroll'}
                conceptTitle={selectedItem.concept_title}
                initialData={{
                  main_message: selectedItem.concept_description ?? '',
                  hook: selectedItem.hook ?? '',
                  post_caption: selectedItem.caption ?? '',
                  publish_date: selectedItem.scheduled_date ?? '',
                  mood_tags: [],
                }}
                onSave={async (data) => {
                  const id = selectedItem.id
                  if (data.main_message) await saveField(id, 'concept_description', data.main_message)
                  if (data.hook) await saveField(id, 'hook', data.hook)
                  if (data.post_caption) await saveField(id, 'caption', data.post_caption)
                  if (data.headline_text) await saveField(id, 'concept_title', data.headline_text)
                  if (data.publish_date) await saveField(id, 'scheduled_date', data.publish_date)
                  if (data.shoot_location) await saveField(id, 'location_notes', data.shoot_location)
                  if (data.music_feel) await saveField(id, 'music_direction', data.music_feel)
                  if (data.editing_style) await saveField(id, 'editor_notes', data.editing_style)
                  if (data.designer_notes) await saveField(id, 'editor_notes', data.designer_notes)
                  toast('Saved', 'success')
                }}
              />
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-ink-3">
              Select an item to edit
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Section wrapper for Quick Edit
function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-ink-6 pb-4 last:border-0 last:pb-0">
      <h4 className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider mb-3">{label}</h4>
      {children}
    </div>
  )
}
