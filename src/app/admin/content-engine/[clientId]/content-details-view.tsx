'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Loader2, Check, Sparkles, ChevronUp, ChevronDown, Flag, Zap,
  Camera, Globe, Video, MessageCircle, ListChecks,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { updateCalendarItem } from '@/lib/content-engine/actions'
import { generateBriefs } from '@/lib/content-engine/generate-briefs'
import type { ClientContext } from '@/lib/content-engine/context'
import ReelForm from '@/components/content-engine/forms/reel-form'
import FeedPostForm from '@/components/content-engine/forms/feed-post-form'
import CarouselForm from '@/components/content-engine/forms/carousel-form'
import StoryForm from '@/components/content-engine/forms/story-form'
import QuickEditView from '@/components/content-engine/quick-edit-view'
import { useToast } from '@/components/ui/toast'

interface ContentItem { id: string; [key: string]: unknown }

const PLATFORM_ICONS: Record<string, typeof Camera> = {
  instagram: Camera, tiktok: Video, facebook: Globe, linkedin: MessageCircle,
}

const TYPE_COLORS: Record<string, string> = {
  reel: 'bg-indigo-100 text-indigo-800', feed_post: 'bg-cyan-100 text-cyan-800',
  carousel: 'bg-pink-100 text-pink-800', story: 'bg-amber-100 text-amber-800',
  static_post: 'bg-cyan-100 text-cyan-800', video: 'bg-indigo-100 text-indigo-800',
}

interface ContentDetailsViewProps {
  cycleId: string
  clientId: string
  context: ClientContext | null
  onGoToProduction?: () => void
}

export default function ContentDetailsView({ cycleId, clientId, context, onGoToProduction }: ContentDetailsViewProps) {
  const supabase = createClient()
  const { toast } = useToast()
  const [items, setItems] = useState<ContentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [generatingBriefs, setGeneratingBriefs] = useState(false)
  const [quickEditMode, setQuickEditMode] = useState(false)

  const loadItems = useCallback(async () => {
    const { data } = await supabase
      .from('content_calendar_items')
      .select('*')
      .eq('cycle_id', cycleId)
      .order('scheduled_date').order('scheduled_time')
    const loaded = (data ?? []) as ContentItem[]
    setItems(loaded)
    if (loaded.length > 0 && !selectedId) setSelectedId(loaded[0].id)
    setLoading(false)
  }, [cycleId, supabase, selectedId])

  useEffect(() => { loadItems() }, [loadItems])

  const selectedItem = items.find((i) => i.id === selectedId) ?? null
  const currentIdx = selectedItem ? items.findIndex((i) => i.id === selectedItem.id) : -1

  // Status logic
  const getItemStatus = (item: ContentItem): 'approved' | 'flagged' | 'partial' | 'empty' => {
    if (item.status === 'approved' || item.status === 'strategist_approved') return 'approved'
    if (item.status === 'flagged') return 'flagged'
    const fields = [item.hook ?? item.headline_text, item.concept_description, item.caption]
    if (fields.some(Boolean)) return 'partial'
    return 'empty'
  }

  // Save field
  const saveField = async (field: string, value: unknown) => {
    if (!selectedItem) return
    let parsed = value
    if (typeof value === 'string' && value.startsWith('[')) { try { parsed = JSON.parse(value) } catch { /* keep */ } }
    await updateCalendarItem(selectedItem.id, { [field]: parsed })
    setItems((prev) => prev.map((i) => i.id === selectedItem.id ? { ...i, [field]: parsed } : i))
  }

  // Quick Edit save (takes id)
  const saveFieldById = async (id: string, field: string, value: string) => {
    await updateCalendarItem(id, { [field]: value })
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, [field]: value } : i))
  }

  // Approve
  const handleApprove = async (id: string) => {
    const item = items.find((i) => i.id === id)
    if (!item) return
    const newStatus = (item.status === 'approved' || item.status === 'strategist_approved') ? 'draft' : 'approved'
    await updateCalendarItem(id, { status: newStatus })
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, status: newStatus } : i))
  }

  // Flag
  const handleFlag = async (id: string) => {
    const item = items.find((i) => i.id === id)
    if (!item) return
    const newStatus = item.status === 'flagged' ? 'draft' : 'flagged'
    await updateCalendarItem(id, { status: newStatus })
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, status: newStatus } : i))
  }

  // Navigate
  const goNext = () => { if (currentIdx < items.length - 1) setSelectedId(items[currentIdx + 1].id) }
  const goPrev = () => { if (currentIdx > 0) setSelectedId(items[currentIdx - 1].id) }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return
      if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); goPrev() }
      if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); goNext() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

  // AI generate briefs
  const handleGenerateBriefs = async () => {
    if (!context) return
    setGeneratingBriefs(true)
    await supabase.from('content_calendar_items').update({ status: 'strategist_approved' }).eq('cycle_id', cycleId).eq('status', 'draft')
    const result = await generateBriefs(cycleId, clientId, context)
    if (result.success) { await loadItems(); toast(`Briefs generated for ${result.count} items`, 'success') }
    else toast(result.error ?? 'Failed', 'error')
    setGeneratingBriefs(false)
  }

  const approvedCount = items.filter((i) => i.status === 'approved' || i.status === 'strategist_approved').length
  const flaggedCount = items.filter((i) => i.status === 'flagged').length

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-ink-4" /></div>
  if (items.length === 0) return <div className="text-center py-16 text-sm text-ink-3">No content items yet. Go to the Brainstorm tab first.</div>

  const contentDefaults = (context?.contentDefaults ?? {}) as Record<string, unknown>

  const renderForm = (item: ContentItem) => {
    const type = item.content_type as string
    const data = item as Record<string, unknown>
    if (['reel', 'video', 'short_form_video'].includes(type)) return <ReelForm data={data} onSave={saveField} />
    if (type === 'carousel') return <CarouselForm data={data} onSave={saveField} defaults={contentDefaults} />
    if (type === 'story') return <StoryForm data={data} onSave={saveField} />
    return <FeedPostForm data={data} onSave={saveField} defaults={contentDefaults} />
  }

  // Quick Edit mode
  if (quickEditMode) {
    return <QuickEditView items={items} onSave={saveFieldById} onApprove={handleApprove} onFlag={handleFlag} onExit={() => setQuickEditMode(false)} />
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-ink">{items.length} items</span>
          <div className="w-20 h-1.5 bg-ink-6 rounded-full overflow-hidden">
            <div className="h-full bg-brand rounded-full transition-all" style={{ width: `${items.length > 0 ? Math.round((approvedCount / items.length) * 100) : 0}%` }} />
          </div>
          <span className="text-[10px] text-ink-3">{approvedCount}/{items.length} approved</span>
          {flaggedCount > 0 && <span className="text-[10px] text-amber-600">{flaggedCount} flagged</span>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setQuickEditMode(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-ink-2 border border-ink-6 rounded-lg hover:bg-bg-2 transition-colors">
            <ListChecks className="w-3 h-3" /> Quick Edit
          </button>
          <button onClick={handleGenerateBriefs} disabled={generatingBriefs} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-brand bg-brand-tint rounded-lg hover:bg-brand/10 transition-colors disabled:opacity-50">
            {generatingBriefs ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />} AI Fill All
          </button>
        </div>
      </div>

      {/* Two-panel layout */}
      <div className="flex gap-4" style={{ minHeight: '600px' }}>
        {/* Left: Item list */}
        <div className="w-[280px] flex-shrink-0 bg-white rounded-xl border border-ink-6 overflow-hidden flex flex-col">
          <div className="px-3 py-2 border-b border-ink-6 bg-bg-2 flex items-center justify-between">
            <span className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider">Items</span>
            <div className="flex items-center gap-2 text-[8px] text-ink-4">
              <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-brand" /> Approved</span>
              <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> Review</span>
              <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-ink-5" /> Empty</span>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {items.map((item) => {
              const PIcon = PLATFORM_ICONS[item.platform as string] ?? Globe
              const status = getItemStatus(item)
              const isSelected = selectedId === item.id
              const tc = TYPE_COLORS[item.content_type as string] ?? 'bg-ink-6 text-ink-3'

              return (
                <button
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  className={`w-full text-left px-3 py-2.5 border-b border-ink-6 last:border-0 transition-colors ${
                    isSelected ? 'bg-brand-tint' : 'hover:bg-bg-2'
                  } ${status === 'approved' ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {status === 'approved' && <span className="w-1.5 h-1.5 rounded-full bg-brand flex-shrink-0" />}
                    {status === 'flagged' && <Flag className="w-3 h-3 text-amber-500 flex-shrink-0" />}
                    {status === 'partial' && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />}
                    {status === 'empty' && <span className="w-1.5 h-1.5 rounded-full bg-ink-5 flex-shrink-0" />}
                    <PIcon className="w-3 h-3 text-ink-4 flex-shrink-0" />
                    <span className={`text-[9px] font-semibold px-1 py-0.5 rounded ${tc}`}>{(item.content_type as string).replace(/_/g, ' ')}</span>
                    {status === 'approved' && <Check className="w-3 h-3 text-brand ml-auto flex-shrink-0" />}
                  </div>
                  <p className="text-xs font-medium text-ink truncate">{item.concept_title as string}</p>
                </button>
              )
            })}
          </div>
        </div>

        {/* Right: Adaptive form */}
        <div className="flex-1 bg-white rounded-xl border border-ink-6 overflow-hidden flex flex-col">
          {selectedItem ? (
            <>
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-ink-6 bg-bg-2 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <button onClick={goPrev} disabled={currentIdx <= 0} className="p-1 text-ink-4 hover:text-ink disabled:opacity-30 rounded"><ChevronUp className="w-4 h-4" /></button>
                  <button onClick={goNext} disabled={currentIdx >= items.length - 1} className="p-1 text-ink-4 hover:text-ink disabled:opacity-30 rounded"><ChevronDown className="w-4 h-4" /></button>
                  <span className="text-[10px] text-ink-4">{currentIdx + 1} / {items.length}</span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${TYPE_COLORS[selectedItem.content_type as string] ?? ''}`}>
                    {(selectedItem.content_type as string).replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={async () => {
                      if (!context) return
                      toast('Generating...', 'info')
                      await supabase.from('content_calendar_items').update({ status: 'strategist_approved' }).eq('id', selectedItem.id)
                      await generateBriefs(cycleId, clientId, context)
                      await loadItems()
                      toast('Details filled', 'success')
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
              <div className="flex-1 overflow-y-auto px-4 py-4">
                {renderForm(selectedItem)}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-ink-3">Select an item to edit</div>
          )}
        </div>
      </div>

      {/* Transition CTA */}
      {approvedCount > 0 && onGoToProduction && (
        <div className={`rounded-xl p-4 flex items-center justify-between ${
          approvedCount === items.length ? 'bg-emerald-50 border border-emerald-200' : 'bg-amber-50 border border-amber-200'
        }`}>
          <div className="flex items-center gap-2 text-xs">
            {approvedCount === items.length
              ? <><Check className="w-4 h-4 text-emerald-600" /><span className="text-emerald-700 font-medium">All {items.length} items approved</span></>
              : <span className="text-amber-700">{approvedCount}/{items.length} items approved — approve all before moving to production</span>
            }
          </div>
          <button
            onClick={onGoToProduction}
            className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg transition-colors ${
              approvedCount === items.length
                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
            }`}
          >
            <Zap className="w-3.5 h-3.5" /> Team & Production
          </button>
        </div>
      )}
    </div>
  )
}
