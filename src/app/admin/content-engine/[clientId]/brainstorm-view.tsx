'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Sparkles, Loader2, Plus, Trash2, Check, X,
  Camera, Video, Image, Film,
  ChevronLeft, ChevronRight,
  Globe, MessageCircle,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { generateCalendar } from '@/lib/content-engine/generate-calendar'
import { updateCalendarItem, deleteCalendarItem } from '@/lib/content-engine/actions'
import type { ClientContext } from '@/lib/content-engine/context'
import ConfirmModal from '@/components/content-engine/confirm-modal'
import { useToast } from '@/components/ui/toast'

interface IdeaCard {
  id: string
  concept_title: string
  content_type: string // 'graphic' | 'reel' | 'carousel' | 'story'
  content_category: string | null // promo | product | event | educational | testimonial | bts | brand | seasonal | other
  platform: string
  additional_platforms: string[] | null
  concept_description: string | null
  scheduled_date: string
  strategic_goal: string | null
  status: string
  sort_order: number
}

const FORMAT_OPTIONS = [
  { value: 'graphic', label: 'Static Post', icon: Image, color: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  { value: 'reel', label: 'Reel / Video', icon: Film, color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  { value: 'carousel', label: 'Carousel', icon: Camera, color: 'bg-pink-50 text-pink-700 border-pink-200' },
]

const CATEGORY_OPTIONS = [
  { value: 'promo', label: 'Promo / Offer' },
  { value: 'product', label: 'Product / Service' },
  { value: 'event', label: 'Event' },
  { value: 'educational', label: 'Educational / Tips' },
  { value: 'testimonial', label: 'Testimonial' },
  { value: 'bts', label: 'Behind the Scenes' },
  { value: 'brand', label: 'Brand Awareness' },
  { value: 'seasonal', label: 'Seasonal / Holiday' },
  { value: 'other', label: 'Other' },
]

const PLATFORM_OPTIONS = [
  { value: 'instagram', label: 'IG', icon: Camera },
  { value: 'tiktok', label: 'TT', icon: Video },
  { value: 'facebook', label: 'FB', icon: Globe },
  { value: 'linkedin', label: 'LI', icon: MessageCircle },
]

interface BrainstormViewProps {
  clientId: string
  cycleId: string | null
  context: ClientContext | null
  strategyNotes: string
  targetMonth: string
  onMonthChange: (month: string) => void
  onCycleCreated: (id: string) => void
  onStatusChange: (status: string) => void
  onGoToContentPlan: () => void
}

export default function BrainstormView({
  clientId, cycleId, context, strategyNotes, targetMonth,
  onMonthChange, onCycleCreated, onStatusChange, onGoToContentPlan,
}: BrainstormViewProps) {
  const supabase = createClient()
  const { toast } = useToast()
  const [ideas, setIdeas] = useState<IdeaCard[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [addingNew, setAddingNew] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

  // New idea form state
  const [newTitle, setNewTitle] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newFormat, setNewFormat] = useState('graphic')
  const [newCategory, setNewCategory] = useState('')
  const [newPlatform, setNewPlatform] = useState('instagram')
  const [newDate, setNewDate] = useState('')

  const targetMonthLabel = new Date(targetMonth + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  const loadIdeas = useCallback(async () => {
    if (!cycleId) { setLoading(false); return }
    const { data } = await supabase
      .from('content_calendar_items')
      .select('id, concept_title, concept_description, content_type, platform, additional_platforms, scheduled_date, strategic_goal, status, sort_order')
      .eq('cycle_id', cycleId)
      .order('scheduled_date').order('sort_order')
    setIdeas((data ?? []) as IdeaCard[])
    setLoading(false)
  }, [cycleId, supabase])

  useEffect(() => { loadIdeas() }, [loadIdeas])

  // AI generate ideas
  const handleGenerate = async () => {
    if (!context) return
    setGenerating(true)

    let cId = cycleId
    if (!cId) {
      const { data } = await supabase.from('content_cycles').insert({
        client_id: clientId, month: targetMonth, status: 'context_ready',
        deliverables: context.deliverables, context_snapshot: context, strategy_notes: strategyNotes || null,
      }).select().single()
      if (data) { cId = data.id; onCycleCreated(data.id) }
    }
    if (!cId) { setGenerating(false); return }

    const result = await generateCalendar(cId, clientId, context, strategyNotes, targetMonth)
    if (result.success) {
      onStatusChange('calendar_draft')
      await loadIdeas()
      toast(`${result.count} content ideas generated`, 'success')
    } else {
      toast(result.error ?? 'Generation failed', 'error')
    }
    setGenerating(false)
  }

  // Add single idea
  const handleAddIdea = async () => {
    if (!newTitle.trim()) return
    let cId = cycleId
    if (!cId) {
      const { data } = await supabase.from('content_cycles').insert({
        client_id: clientId, month: targetMonth, status: 'context_ready',
        deliverables: context?.deliverables ?? {}, context_snapshot: context, strategy_notes: strategyNotes || null,
      }).select().single()
      if (data) { cId = data.id; onCycleCreated(data.id) }
    }
    if (!cId) return

    const contentType = newFormat === 'graphic' ? 'feed_post' : newFormat
    const { data } = await supabase.from('content_calendar_items').insert({
      cycle_id: cId, client_id: clientId,
      concept_title: newTitle.trim(),
      concept_description: newDescription.trim() || null,
      content_type: contentType,
      platform: newPlatform,
      scheduled_date: newDate || targetMonth,
      source: 'strategist', status: 'draft', sort_order: ideas.length,
    }).select().single()

    if (data) {
      setIdeas((prev) => [...prev, data as IdeaCard])
      setNewTitle(''); setNewDescription(''); setNewFormat('graphic'); setNewCategory(''); setNewDate('')
      setAddingNew(false)
      toast('Idea added', 'success')
    }
  }

  // Quick edit
  const handleUpdateTitle = async (id: string, title: string) => {
    await updateCalendarItem(id, { concept_title: title })
    setIdeas((prev) => prev.map((i) => i.id === id ? { ...i, concept_title: title } : i))
  }

  const handleUpdateField = async (id: string, field: string, value: unknown) => {
    await updateCalendarItem(id, { [field]: value })
    setIdeas((prev) => prev.map((i) => i.id === id ? { ...i, [field]: value } : i))
  }

  const handleDelete = async (id: string) => {
    await deleteCalendarItem(id)
    setIdeas((prev) => prev.filter((i) => i.id !== id))
  }

  const handleClearAll = async () => {
    if (!cycleId) return
    setConfirmClear(false)
    await supabase.from('content_calendar_items').delete().eq('cycle_id', cycleId)
    setIdeas([])
    toast('All ideas cleared', 'info')
  }

  const prevMonth = () => { const d = new Date(targetMonth + 'T12:00:00'); d.setMonth(d.getMonth() - 1); onMonthChange(d.toISOString().split('T')[0]) }
  const nextMonth = () => { const d = new Date(targetMonth + 'T12:00:00'); d.setMonth(d.getMonth() + 1); onMonthChange(d.toISOString().split('T')[0]) }

  // Count by format
  const formatCounts = FORMAT_OPTIONS.map((f) => ({
    ...f,
    count: ideas.filter((i) => {
      if (f.value === 'graphic') return i.content_type === 'feed_post' || i.content_type === 'static_post'
      return i.content_type === f.value
    }).length,
  }))

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-ink-4" /></div>

  return (
    <div className="space-y-5">
      {/* Month selector */}
      <div className="flex items-center justify-center gap-3">
        <button onClick={prevMonth} className="p-1 text-ink-4 hover:text-ink rounded"><ChevronLeft className="w-5 h-5" /></button>
        <h2 className="text-base font-bold text-ink min-w-[160px] text-center">{targetMonthLabel}</h2>
        <button onClick={nextMonth} className="p-1 text-ink-4 hover:text-ink rounded"><ChevronRight className="w-5 h-5" /></button>
      </div>

      {/* Quick stats */}
      {ideas.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-bold text-ink">{ideas.length} ideas</span>
          {formatCounts.filter((f) => f.count > 0).map((f) => (
            <span key={f.value} className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${f.color}`}>
              {f.count} {f.label}{f.count !== 1 ? 's' : ''}
            </span>
          ))}
          <div className="flex-1" />
          <button onClick={() => setConfirmClear(true)} className="text-[10px] text-ink-4 hover:text-red-500 transition-colors">Clear all</button>
        </div>
      )}

      {/* Empty state */}
      {ideas.length === 0 && !generating && (
        <div className="text-center py-12">
          <Sparkles className="w-10 h-10 text-ink-4 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-ink mb-2">Brainstorm {targetMonthLabel}</h2>
          <p className="text-sm text-ink-3 max-w-md mx-auto mb-6">
            Start with a batch of AI-generated ideas based on the strategy, or add your own one by one.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button onClick={handleGenerate} disabled={generating} className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand text-white text-sm font-semibold rounded-xl hover:bg-brand-dark transition-colors">
              <Sparkles className="w-4 h-4" /> Generate Ideas
            </button>
            <button onClick={() => setAddingNew(true)} className="inline-flex items-center gap-2 px-5 py-2.5 border border-ink-5 text-sm font-medium rounded-xl hover:bg-bg-2 transition-colors">
              <Plus className="w-4 h-4" /> Add Manually
            </button>
          </div>
        </div>
      )}

      {/* Generating */}
      {generating && (
        <div className="text-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-brand mx-auto mb-4" />
          <h3 className="text-sm font-bold text-ink">Generating content ideas...</h3>
          <p className="text-xs text-ink-3 mt-1">Based on your strategy, goals, and performance data</p>
        </div>
      )}

      {/* Idea cards */}
      {ideas.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {ideas.map((idea) => {
            const fmt = FORMAT_OPTIONS.find((f) => f.value === idea.content_type || (f.value === 'graphic' && (idea.content_type === 'feed_post' || idea.content_type === 'static_post')))
            const FmtIcon = fmt?.icon ?? Image

            return (
              <div key={idea.id} className={`bg-white rounded-xl border p-4 hover:shadow-sm transition-all group ${fmt?.color.split(' ').find((c) => c.startsWith('border-')) ?? 'border-ink-6'}`}>
                {/* Header: format + platform + delete */}
                {/* Content Type — prominent toggle */}
                <div className="flex gap-1 mb-2">
                  {FORMAT_OPTIONS.map((f) => {
                    const FIcon = f.icon
                    const isActive = idea.content_type === (f.value === 'graphic' ? 'feed_post' : f.value) || (f.value === 'graphic' && idea.content_type === 'static_post')
                    return (
                      <button
                        key={f.value}
                        onClick={() => handleUpdateField(idea.id, 'content_type', f.value === 'graphic' ? 'feed_post' : f.value)}
                        className={`flex items-center gap-1 px-2 py-1 text-[9px] font-semibold rounded-md transition-colors ${
                          isActive ? f.color : 'text-ink-4 hover:text-ink-3'
                        }`}
                      >
                        <FIcon className="w-3 h-3" />
                        {f.label}
                      </button>
                    )
                  })}
                  <div className="flex-1" />
                  <button onClick={() => handleDelete(idea.id)} className="p-1 text-ink-5 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>

                {/* Category + Platform row */}
                <div className="flex items-center gap-2 mb-2">
                  <select
                    defaultValue=""
                    className="text-[10px] text-ink-3 bg-bg-2 border border-ink-6 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-brand/30"
                  >
                    <option value="">Category</option>
                    {CATEGORY_OPTIONS.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                  <select
                    value={idea.platform}
                    onChange={(e) => handleUpdateField(idea.id, 'platform', e.target.value)}
                    className="text-[10px] text-ink-3 bg-bg-2 border border-ink-6 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-brand/30"
                  >
                    {PLATFORM_OPTIONS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>

                {/* Title — editable */}
                <input
                  value={idea.concept_title}
                  onChange={(e) => setIdeas((prev) => prev.map((i) => i.id === idea.id ? { ...i, concept_title: e.target.value } : i))}
                  onBlur={(e) => handleUpdateTitle(idea.id, e.target.value)}
                  className="text-sm font-medium text-ink w-full bg-transparent border-none focus:outline-none focus:ring-0 p-0 mb-1"
                  placeholder="What's this post about?"
                />

                {/* Description — editable */}
                <textarea
                  value={idea.concept_description ?? ''}
                  onChange={(e) => setIdeas((prev) => prev.map((i) => i.id === idea.id ? { ...i, concept_description: e.target.value } : i))}
                  onBlur={(e) => handleUpdateField(idea.id, 'concept_description', e.target.value)}
                  className="text-xs text-ink-3 w-full bg-transparent border-none focus:outline-none focus:ring-0 p-0 mb-2 resize-none"
                  rows={2}
                  placeholder="Brief description — what should this post communicate?"
                />

                {/* Date */}
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={idea.scheduled_date}
                    onChange={(e) => handleUpdateField(idea.id, 'scheduled_date', e.target.value)}
                    className="text-[10px] text-ink-3 bg-transparent border-none focus:outline-none cursor-pointer"
                  />
                </div>
              </div>
            )
          })}

          {/* Add card */}
          <button
            onClick={() => setAddingNew(true)}
            className="border-2 border-dashed border-ink-5 rounded-xl p-4 flex flex-col items-center justify-center gap-2 text-ink-4 hover:text-ink hover:border-ink-4 transition-colors min-h-[120px]"
          >
            <Plus className="w-5 h-5" />
            <span className="text-xs font-medium">Add idea</span>
          </button>
        </div>
      )}

      {/* New idea form (inline) */}
      {addingNew && (
        <div className="bg-white rounded-xl border border-brand/30 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-ink">New Content Idea</h3>
            <button onClick={() => setAddingNew(false)} className="p-1 text-ink-4 hover:text-ink"><X className="w-4 h-4" /></button>
          </div>

          {/* Content type — prominent toggle first */}
          <div>
            <label className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider block mb-2">What type of content?</label>
            <div className="flex gap-2">
              {FORMAT_OPTIONS.map((f) => {
                const FIcon = f.icon
                const active = newFormat === f.value
                return (
                  <button key={f.value} onClick={() => setNewFormat(f.value)} className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border transition-colors ${active ? f.color : 'border-ink-6 text-ink-3 hover:border-ink-5'}`}>
                    <FIcon className="w-3.5 h-3.5" /> {f.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider block mb-2">What's it about?</label>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORY_OPTIONS.map((c) => (
                <button key={c.value} onClick={() => setNewCategory(c.value)} className={`text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors ${newCategory === c.value ? 'bg-brand-tint border-brand/30 text-brand-dark' : 'border-ink-6 text-ink-3 hover:border-ink-5'}`}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Title + Description */}
          <div>
            <label className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider block mb-1">Idea</label>
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="What's this post about?"
              className="w-full text-sm border border-ink-6 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand mb-2"
              autoFocus
            />
            <textarea
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Brief description — what should this post communicate? What details matter?"
              rows={2}
              className="w-full text-sm border border-ink-6 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
            />
          </div>

          {/* Platform + Date */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-ink-4 block mb-0.5">Platform</label>
              <select value={newPlatform} onChange={(e) => setNewPlatform(e.target.value)} className="w-full text-xs border border-ink-6 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand/30">
                {PLATFORM_OPTIONS.map((p) => (<option key={p.value} value={p.value}>{p.label}</option>))}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-ink-4 block mb-0.5">Target Date</label>
              <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="w-full text-xs border border-ink-6 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand/30" />
            </div>
          </div>
          <button onClick={handleAddIdea} disabled={!newTitle.trim()} className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 bg-brand text-white text-sm font-semibold rounded-lg hover:bg-brand-dark transition-colors disabled:opacity-50">
            <Plus className="w-4 h-4" /> Add Idea
          </button>
        </div>
      )}

      {/* Next step CTA */}
      {ideas.length > 0 && !generating && (
        <div className="bg-white rounded-xl border border-ink-6 p-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-ink">Ready to flesh out the details?</h3>
            <p className="text-xs text-ink-3 mt-0.5">{ideas.length} ideas ready. Add briefs, scripts, and production details for each piece.</p>
          </div>
          <button onClick={onGoToContentPlan} className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand text-white text-sm font-semibold rounded-xl hover:bg-brand-dark transition-colors">
            Continue to Content Details →
          </button>
        </div>
      )}

      {/* Add more ideas (when ideas exist) */}
      {ideas.length > 0 && !addingNew && (
        <div className="flex items-center gap-3">
          <button onClick={handleGenerate} disabled={generating} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-ink-5 rounded-lg hover:bg-bg-2 transition-colors">
            <Sparkles className="w-3 h-3" /> Generate more ideas
          </button>
        </div>
      )}

      <ConfirmModal open={confirmClear} onConfirm={handleClearAll} onCancel={() => setConfirmClear(false)} title="Clear all ideas?" description={`This will remove all ${ideas.length} ideas for ${targetMonthLabel}.`} confirmLabel="Clear all" variant="danger" />
    </div>
  )
}
