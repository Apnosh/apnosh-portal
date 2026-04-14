'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Sparkles, Loader2, Plus, X, ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  Camera, Globe, Video, MessageCircle, Image, Film,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { generateCalendar, refineCalendarItem } from '@/lib/content-engine/generate-calendar'
import { updateCalendarItem, deleteCalendarItem } from '@/lib/content-engine/actions'
import type { ClientContext } from '@/lib/content-engine/context'
import BrainstormCard, { type IdeaCard } from '@/components/content-engine/brainstorm-card'
import BrainstormEditPanel from '@/components/content-engine/brainstorm-edit-panel'
import ConfirmModal from '@/components/content-engine/confirm-modal'
import { useToast } from '@/components/ui/toast'

const CATEGORY_OPTIONS = [
  'Behind the scenes', 'Product highlight', 'Educational tip', 'Promo/Offer',
  'Customer story', 'Team spotlight', 'Seasonal', 'Community', 'Trending', 'Brand story',
]

const PLATFORM_OPTIONS = [
  { value: 'instagram', label: 'IG' }, { value: 'tiktok', label: 'TT' },
  { value: 'facebook', label: 'FB' }, { value: 'linkedin', label: 'LI' },
]

const FORMAT_OPTIONS = [
  { value: 'feed_post', label: 'Static Post', icon: Image, color: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  { value: 'reel', label: 'Reel / Video', icon: Film, color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  { value: 'carousel', label: 'Carousel', icon: Camera, color: 'bg-pink-50 text-pink-700 border-pink-200' },
]

const GOAL_COLORS: Record<string, string> = {
  awareness: 'text-blue-700', engagement: 'text-purple-700', conversion: 'text-emerald-700',
  community: 'text-orange-700', education: 'text-teal-700',
}

interface BrainstormViewProps {
  clientId: string
  cycleId: string | null
  context: ClientContext | null
  strategyNotes: string
  onStrategyNotesChange: (notes: string) => void
  onSaveStrategyNotes: () => Promise<void>
  targetMonth: string
  onMonthChange: (month: string) => void
  onCycleCreated: (id: string) => void
  onStatusChange: (status: string) => void
  onGoToContentPlan: () => void
}

export default function BrainstormView({
  clientId, cycleId, context, strategyNotes, onStrategyNotesChange, onSaveStrategyNotes,
  targetMonth, onMonthChange, onCycleCreated, onStatusChange, onGoToContentPlan,
}: BrainstormViewProps) {
  const supabase = createClient()
  const { toast } = useToast()
  const [ideas, setIdeas] = useState<IdeaCard[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [addingNew, setAddingNew] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [contextExpanded, setContextExpanded] = useState(false)
  const [editingStrategy, setEditingStrategy] = useState(false)
  const [editPanelId, setEditPanelId] = useState<string | null>(null)
  const [showNewPanel, setShowNewPanel] = useState(false)

  // New idea form
  const [newTitle, setNewTitle] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newFormat, setNewFormat] = useState('feed_post')
  const [newCategory, setNewCategory] = useState('')
  const [newGoal, setNewGoal] = useState('')
  const [newPlatform, setNewPlatform] = useState('instagram')
  const [newWeek, setNewWeek] = useState(1)

  const targetMonthLabel = new Date(targetMonth + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  const loadIdeas = useCallback(async () => {
    if (!cycleId) { setLoading(false); return }
    const { data } = await supabase
      .from('content_calendar_items')
      .select('id, concept_title, concept_description, content_type, content_category, platform, additional_platforms, scheduled_date, strategic_goal, filming_batch, source, status, sort_order, week_number')
      .eq('cycle_id', cycleId)
      .order('week_number', { ascending: true, nullsFirst: false })
      .order('sort_order')
    setIdeas((data ?? []) as IdeaCard[])
    setLoading(false)
  }, [cycleId, supabase])

  useEffect(() => { loadIdeas() }, [loadIdeas])

  // Deliverables targets
  const deliverables = context?.deliverables ?? { reels: 0, feed_posts: 0, carousels: 0, stories: 0, platforms: [] }
  const targets: Record<string, number> = {
    feed_post: deliverables.feed_posts + deliverables.carousels,
    reel: deliverables.reels,
    carousel: 0, // counted in feed_post target
  }
  const counts: Record<string, number> = { feed_post: 0, reel: 0, carousel: 0 }
  for (const idea of ideas) {
    const type = idea.content_type === 'static_post' ? 'feed_post' : idea.content_type
    if (type in counts) counts[type]++
  }

  // Goal distribution
  const goalCounts: Record<string, number> = {}
  for (const idea of ideas) {
    if (idea.strategic_goal) goalCounts[idea.strategic_goal] = (goalCounts[idea.strategic_goal] ?? 0) + 1
  }

  // Generate more state
  const [showGenerateMore, setShowGenerateMore] = useState(false)
  const [genCount, setGenCount] = useState(3)
  const [genDirection, setGenDirection] = useState('')

  // Handlers
  const handleUpdateField = async (id: string, field: string, value: unknown) => {
    await updateCalendarItem(id, { [field]: value })
    setIdeas((prev) => prev.map((i) => i.id === id ? { ...i, [field]: value } : i))
  }

  const handleUpdateTitle = async (id: string, title: string) => {
    await updateCalendarItem(id, { concept_title: title })
  }

  const handleDelete = async (id: string) => {
    await deleteCalendarItem(id)
    setIdeas((prev) => prev.filter((i) => i.id !== id))
  }

  const handleRefine = async (id: string, direction: string) => {
    if (!context) return
    await refineCalendarItem(id, direction, context)
    await loadIdeas()
    toast('Refined', 'success')
  }

  const handleReplace = async (id: string) => {
    if (!context) return
    await refineCalendarItem(id, 'Generate a completely different concept for the same slot. Make it fresh and creative.', context)
    await loadIdeas()
    toast('Replaced', 'success')
  }

  const handleDuplicate = async (id: string) => {
    const idea = ideas.find((i) => i.id === id)
    if (!idea || !cycleId) return
    const { data } = await supabase.from('content_calendar_items').insert({
      cycle_id: cycleId, client_id: clientId,
      concept_title: idea.concept_title + ' (copy)',
      concept_description: idea.concept_description,
      content_type: idea.content_type, platform: idea.platform,
      scheduled_date: idea.scheduled_date, strategic_goal: idea.strategic_goal,
      filming_batch: idea.filming_batch, week_number: idea.week_number,
      source: 'strategist', status: 'draft', sort_order: ideas.length,
    }).select().single()
    if (data) { setIdeas((prev) => [...prev, data as IdeaCard]); toast('Duplicated', 'success') }
  }

  // AI generate
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
    if (result.success) { onStatusChange('calendar_draft'); await loadIdeas(); toast(`${result.count} ideas generated`, 'success') }
    else { toast(result.error ?? 'Failed', 'error') }
    setGenerating(false)
  }

  // Add idea
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
    const { data } = await supabase.from('content_calendar_items').insert({
      cycle_id: cId, client_id: clientId, concept_title: newTitle.trim(),
      concept_description: newDescription.trim() || null, content_type: newFormat,
      content_category: newCategory || null, strategic_goal: newGoal || null,
      platform: newPlatform, week_number: newWeek,
      scheduled_date: targetMonth, source: 'strategist', status: 'draft', sort_order: ideas.length,
    }).select().single()
    if (data) {
      setIdeas((prev) => [...prev, data as IdeaCard])
      setNewTitle(''); setNewDescription(''); setNewFormat('feed_post'); setNewCategory(''); setNewGoal(''); setNewWeek(1)
      setAddingNew(false); toast('Added', 'success')
    }
  }

  const handleClearAll = async () => {
    if (!cycleId) return; setConfirmClear(false)
    await supabase.from('content_calendar_items').delete().eq('cycle_id', cycleId)
    setIdeas([]); toast('Cleared', 'info')
  }

  const prevMonth = () => { const d = new Date(targetMonth + 'T12:00:00'); d.setMonth(d.getMonth() - 1); onMonthChange(d.toISOString().split('T')[0]) }
  const nextMonth = () => { const d = new Date(targetMonth + 'T12:00:00'); d.setMonth(d.getMonth() + 1); onMonthChange(d.toISOString().split('T')[0]) }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-ink-4" /></div>

  return (
    <div className="space-y-4">
      {/* Strategy direction — editable */}
      <div className="bg-bg-2 rounded-xl border border-ink-6 overflow-hidden">
        {editingStrategy ? (
          <div className="p-4 space-y-2">
            <label className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider">Strategy Direction</label>
            <textarea
              value={strategyNotes}
              onChange={(e) => onStrategyNotesChange(e.target.value)}
              placeholder="What's the editorial direction this month? What should the content focus on?"
              rows={4}
              className="w-full text-sm text-ink border border-ink-6 rounded-lg px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
              autoFocus
            />
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-ink-4">This guides every AI generation</span>
              <button
                onClick={async () => { await onSaveStrategyNotes(); setEditingStrategy(false); toast('Strategy saved', 'success') }}
                className="px-3 py-1.5 bg-ink text-white text-xs font-semibold rounded-lg hover:bg-ink-2 transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setEditingStrategy(true)} className="w-full text-left px-4 py-3 hover:bg-ink-6/50 transition-colors group">
            {strategyNotes ? (
              <div className="flex items-start gap-2">
                <p className="text-xs text-ink-2 flex-1 leading-relaxed">{strategyNotes}</p>
                <span className="text-[10px] text-ink-4 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5">Edit</span>
              </div>
            ) : (
              <p className="text-xs text-ink-4 italic">Click to set this month's strategy direction...</p>
            )}
          </button>
        )}

        {/* Reference data — always visible below */}
        <div className="px-4 pb-2.5 flex items-center gap-3 flex-wrap text-[10px] text-ink-4 border-t border-ink-6 pt-2">
          {context?.performance && <span>{context.performance.reachTrend} · Best: {context.performance.bestDays.join(', ')}</span>}
          {context?.upcomingEvents && context.upcomingEvents.length > 0 && <span>Events: {context.upcomingEvents.slice(0, 2).join(', ')}</span>}
          <span>{deliverables.reels} reels, {deliverables.feed_posts} posts, {deliverables.carousels} carousels</span>
        </div>
      </div>

      {/* Month selector */}
      <div className="flex items-center justify-center gap-3">
        <button onClick={prevMonth} className="p-1 text-ink-4 hover:text-ink rounded"><ChevronLeft className="w-5 h-5" /></button>
        <h2 className="text-base font-bold text-ink min-w-[160px] text-center">{targetMonthLabel}</h2>
        <button onClick={nextMonth} className="p-1 text-ink-4 hover:text-ink rounded"><ChevronRight className="w-5 h-5" /></button>
      </div>

      {/* Change 2: Deliverables counter + Change 3: Goal summary + Change 5: Batch summary */}
      {ideas.length > 0 && (
        <div className="space-y-2">
          {/* Deliverables */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-ink">{ideas.length} ideas</span>
            {[
              { key: 'feed_post', label: 'Static/Carousel', target: targets.feed_post, count: counts.feed_post + counts.carousel },
              { key: 'reel', label: 'Reels', target: targets.reel, count: counts.reel },
            ].map((d) => {
              const fulfilled = d.count >= d.target && d.target > 0
              const over = d.count > d.target && d.target > 0
              const short = d.count < d.target && d.target > 0
              return (
                <span key={d.key} className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                  fulfilled ? (over ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200')
                  : short ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : 'bg-ink-6 text-ink-3 border-ink-5'
                }`}>
                  {d.count}/{d.target} {d.label} {fulfilled && !over ? '✓' : over ? `(+${d.count - d.target})` : ''}
                </span>
              )
            })}
            <div className="flex-1" />
            <button onClick={() => setConfirmClear(true)} className="text-[10px] text-ink-4 hover:text-red-500">Clear all</button>
          </div>

          {/* Goal + batch summary */}
          <div className="flex items-center gap-3 flex-wrap text-[10px] text-ink-3">
            {Object.entries(goalCounts).length > 0 && (
              <span>{Object.entries(goalCounts).map(([g, c]) => <span key={g} className={`${GOAL_COLORS[g] ?? ''} font-medium`}>{c} {g}</span>).reduce((prev, curr, i) => i === 0 ? [curr] : [...prev, <span key={`sep-${i}`}> · </span>, curr], [] as React.ReactNode[])}</span>
            )}
          </div>
        </div>
      )}

      {/* Empty state */}
      {ideas.length === 0 && !generating && (
        <div className="text-center py-12">
          <Sparkles className="w-10 h-10 text-ink-4 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-ink mb-2">Brainstorm {targetMonthLabel}</h2>
          <p className="text-sm text-ink-3 max-w-md mx-auto mb-6">Generate AI ideas based on the strategy, or add your own.</p>
          <div className="flex items-center justify-center gap-3">
            <button onClick={handleGenerate} className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand text-white text-sm font-semibold rounded-xl hover:bg-brand-dark transition-colors">
              <Sparkles className="w-4 h-4" /> Generate Ideas
            </button>
            <button onClick={() => setShowNewPanel(true)} className="inline-flex items-center gap-2 px-5 py-2.5 border border-ink-5 text-sm font-medium rounded-xl hover:bg-bg-2 transition-colors">
              <Plus className="w-4 h-4" /> Add Manually
            </button>
          </div>
        </div>
      )}

      {generating && (
        <div className="text-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-brand mx-auto mb-4" />
          <h3 className="text-sm font-bold text-ink">Generating content ideas...</h3>
          <p className="text-xs text-ink-3 mt-1">Based on strategy, goals, and performance data</p>
        </div>
      )}

      {/* Flat card grid */}
      {ideas.length > 0 && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {ideas.map((idea) => (
              <BrainstormCard
                key={idea.id}
                idea={idea}
                onClick={(id) => setEditPanelId(id)}
              />
            ))}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3">
            <button onClick={() => setShowGenerateMore(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-brand bg-brand-tint rounded-lg hover:bg-brand/10 transition-colors">
              <Sparkles className="w-3 h-3" /> Generate ideas
            </button>
            <button onClick={() => setShowNewPanel(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-ink-5 rounded-lg hover:bg-bg-2 transition-colors">
              <Plus className="w-3 h-3" /> Add manually
            </button>
          </div>

          {/* Generate More panel */}
          {showGenerateMore && (
            <div className="bg-white rounded-xl border border-brand/30 p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-ink">Generate more ideas</h3>
                <button onClick={() => setShowGenerateMore(false)} className="p-1 text-ink-4 hover:text-ink"><X className="w-4 h-4" /></button>
              </div>
              {/* Count selector */}
              <div>
                <label className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider block mb-1.5">How many?</label>
                <div className="flex gap-2">
                  {[1, 3, 5].map((n) => (
                    <button key={n} onClick={() => setGenCount(n)} className={`w-10 h-10 text-sm font-semibold rounded-lg border transition-colors ${genCount === n ? 'bg-ink text-white border-ink' : 'border-ink-6 text-ink-3 hover:border-ink-5'}`}>
                      {n}
                    </button>
                  ))}
                  <input type="number" min={1} max={20} value={genCount} onChange={(e) => setGenCount(parseInt(e.target.value) || 3)} className="w-16 text-sm text-center border border-ink-6 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/30" />
                </div>
              </div>
              {/* Direction */}
              <div>
                <label className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider block mb-1.5">Any specific direction? <span className="font-normal text-ink-4">(optional)</span></label>
                <input value={genDirection} onChange={(e) => setGenDirection(e.target.value)} placeholder="e.g., more educational content, something about our new menu" className="w-full text-sm border border-ink-6 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand/30" />
              </div>
              {/* Deliverables note */}
              {counts.feed_post + counts.carousel >= targets.feed_post && counts.reel >= targets.reel && (
                <p className="text-[10px] text-ink-4">All deliverables met — generating extra ideas for alternatives.</p>
              )}
              <button
                onClick={async () => {
                  setShowGenerateMore(false)
                  // Use existing generate with strategy notes + direction appended
                  const augmentedNotes = genDirection ? `${strategyNotes}\n\nAdditional direction: ${genDirection}` : strategyNotes
                  setGenerating(true)
                  let cId = cycleId
                  if (!cId) {
                    const { data } = await supabase.from('content_cycles').insert({
                      client_id: clientId, month: targetMonth, status: 'context_ready',
                      deliverables: context?.deliverables ?? {}, context_snapshot: context, strategy_notes: augmentedNotes || null,
                    }).select().single()
                    if (data) { cId = data.id; onCycleCreated(data.id) }
                  }
                  if (cId && context) {
                    const result = await generateCalendar(cId, clientId, context, augmentedNotes, targetMonth)
                    if (result.success) { onStatusChange('calendar_draft'); await loadIdeas(); toast(`${result.count} ideas generated`, 'success') }
                    else toast(result.error ?? 'Failed', 'error')
                  }
                  setGenerating(false)
                  setGenDirection('')
                }}
                disabled={generating}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-brand text-white text-sm font-semibold rounded-lg hover:bg-brand-dark transition-colors disabled:opacity-50"
              >
                {generating ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</> : <><Sparkles className="w-4 h-4" /> Generate {genCount} ideas</>}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Old inline form removed — use slide-over panel instead */}
      {false && addingNew && (
        <div className="hidden">
          <div>
            <h3 className="text-sm font-bold text-ink">New Content Idea</h3>
            <button onClick={() => setAddingNew(false)} className="p-1 text-ink-4 hover:text-ink"><X className="w-4 h-4" /></button>
          </div>
          {/* Format */}
          <div>
            <label className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider block mb-2">Format</label>
            <div className="flex gap-2">
              {FORMAT_OPTIONS.map((f) => {
                const FIcon = f.icon
                return (<button key={f.value} onClick={() => setNewFormat(f.value)} className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border transition-colors ${newFormat === f.value ? f.color : 'border-ink-6 text-ink-3 hover:border-ink-5'}`}><FIcon className="w-3.5 h-3.5" /> {f.label}</button>)
              })}
            </div>
          </div>
          {/* Theme + Goal */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-ink-4 block mb-0.5">Theme</label>
              <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className="w-full text-xs border border-ink-6 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand/30">
                <option value="">Select</option>
                {CATEGORY_OPTIONS.map((c) => (<option key={c} value={c.toLowerCase().replace(/[^a-z]/g, '_')}>{c}</option>))}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-ink-4 block mb-0.5">Goal</label>
              <select value={newGoal} onChange={(e) => setNewGoal(e.target.value)} className="w-full text-xs border border-ink-6 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand/30">
                <option value="">Select</option>
                <option value="awareness">Awareness</option>
                <option value="engagement">Engagement</option>
                <option value="conversion">Conversion</option>
                <option value="community">Community</option>
                <option value="education">Education</option>
              </select>
            </div>
          </div>
          {/* Idea */}
          <div>
            <label className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider block mb-1">Idea</label>
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="What's this post about?" className="w-full text-sm border border-ink-6 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand/30 mb-2" autoFocus />
            <textarea value={newDescription} onChange={(e) => setNewDescription(e.target.value)} placeholder="What should this communicate?" rows={2} className="w-full text-sm border border-ink-6 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-brand/30" />
          </div>
          {/* Platform + Week */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-ink-4 block mb-0.5">Platform</label>
              <select value={newPlatform} onChange={(e) => setNewPlatform(e.target.value)} className="w-full text-xs border border-ink-6 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand/30">
                {PLATFORM_OPTIONS.map((p) => (<option key={p.value} value={p.value}>{p.label}</option>))}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-ink-4 block mb-0.5">Week</label>
              <select value={newWeek} onChange={(e) => setNewWeek(parseInt(e.target.value))} className="w-full text-xs border border-ink-6 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand/30">
                <option value={1}>Week 1</option><option value={2}>Week 2</option>
                <option value={3}>Week 3</option><option value={4}>Week 4</option>
              </select>
            </div>
          </div>
          <button onClick={handleAddIdea} disabled={!newTitle.trim()} className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 bg-brand text-white text-sm font-semibold rounded-lg hover:bg-brand-dark transition-colors disabled:opacity-50">
            <Plus className="w-4 h-4" /> Add Idea
          </button>
        </div>
      )}

      {/* Next step */}
      {ideas.length > 0 && !generating && (
        <div className="bg-white rounded-xl border border-ink-6 p-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-ink">Ready for details?</h3>
            <p className="text-xs text-ink-3 mt-0.5">{ideas.length} ideas. Add briefs, scripts, and production details.</p>
          </div>
          <button onClick={onGoToContentPlan} className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand text-white text-sm font-semibold rounded-xl hover:bg-brand-dark transition-colors">
            Content Details →
          </button>
        </div>
      )}

      {/* Edit panel */}
      {(editPanelId || showNewPanel) && (
        <BrainstormEditPanel
          item={editPanelId ? ideas.find((i) => i.id === editPanelId) ?? null : null}
          isNew={showNewPanel}
          onSave={handleUpdateField}
          onRefine={async (id, dir) => { await handleRefine(id, dir); /* reload to get updated data */ await loadIdeas() }}
          onReplace={async (id) => { await handleReplace(id); await loadIdeas() }}
          onDelete={(id) => { handleDelete(id); setEditPanelId(null) }}
          onClose={() => { setEditPanelId(null); setShowNewPanel(false) }}
          onCreateNew={async (data) => {
            let cId = cycleId
            if (!cId) {
              const { data: cycleData } = await supabase.from('content_cycles').insert({
                client_id: clientId, month: targetMonth, status: 'context_ready',
                deliverables: context?.deliverables ?? {}, context_snapshot: context, strategy_notes: strategyNotes || null,
              }).select().single()
              if (cycleData) { cId = cycleData.id; onCycleCreated(cycleData.id) }
            }
            if (!cId) return
            const { data: row } = await supabase.from('content_calendar_items').insert({
              cycle_id: cId, client_id: clientId,
              concept_title: data.concept_title, concept_description: data.concept_description,
              content_type: data.content_type ?? 'feed_post', content_category: data.content_category,
              strategic_goal: data.strategic_goal, platform: data.platform ?? 'instagram',
              week_number: data.week_number, scheduled_date: targetMonth,
              source: 'strategist', status: 'draft', sort_order: ideas.length,
            }).select().single()
            if (row) { setIdeas((prev) => [...prev, row as IdeaCard]); toast('Idea added', 'success') }
          }}
        />
      )}

      <ConfirmModal open={confirmClear} onConfirm={handleClearAll} onCancel={() => setConfirmClear(false)} title="Clear all?" description={`Remove all ${ideas.length} ideas for ${targetMonthLabel}.`} confirmLabel="Clear" variant="danger" />
    </div>
  )
}
