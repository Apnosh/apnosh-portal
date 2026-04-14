'use client'

import { useState } from 'react'
import {
  Trash2, MoreHorizontal, RefreshCw, Copy, Sparkles, Loader2,
  Image, Film, Camera as CameraIcon,
} from 'lucide-react'

export interface IdeaCard {
  id: string
  concept_title: string
  concept_description: string | null
  content_type: string
  content_category: string | null
  platform: string
  additional_platforms: string[] | null
  scheduled_date: string
  strategic_goal: string | null
  filming_batch: string | null
  source: string
  status: string
  sort_order: number
  week_number: number | null
}

const FORMAT_OPTIONS = [
  { value: 'feed_post', label: 'Static', icon: Image, color: 'bg-cyan-50 text-cyan-700' },
  { value: 'reel', label: 'Reel', icon: Film, color: 'bg-indigo-50 text-indigo-700' },
  { value: 'carousel', label: 'Carousel', icon: CameraIcon, color: 'bg-pink-50 text-pink-700' },
]

const GOAL_OPTIONS = [
  { value: 'awareness', label: 'Awareness', color: 'bg-blue-100 text-blue-700' },
  { value: 'engagement', label: 'Engage', color: 'bg-purple-100 text-purple-700' },
  { value: 'conversion', label: 'Convert', color: 'bg-emerald-100 text-emerald-700' },
  { value: 'community', label: 'Community', color: 'bg-orange-100 text-orange-700' },
  { value: 'education', label: 'Educate', color: 'bg-teal-100 text-teal-700' },
]

const THEME_OPTIONS = [
  'Behind the scenes', 'Product highlight', 'Educational tip', 'Promo/Offer',
  'Customer story', 'Team spotlight', 'Seasonal', 'Community', 'Trending', 'Brand story',
]

const BATCH_COLORS: Record<string, string> = {
  A: 'bg-blue-500', B: 'bg-emerald-500', C: 'bg-orange-500', D: 'bg-purple-500', E: 'bg-pink-500',
}

const SOURCE_BADGES: Record<string, { label: string; color: string }> = {
  ai: { label: 'AI', color: 'bg-ink-6 text-ink-3' },
  strategist: { label: 'Manual', color: 'bg-ink-6 text-ink-3' },
  client_request: { label: 'Client', color: 'bg-amber-100 text-amber-700' },
}

const WEEK_OPTIONS = [
  { value: 1, label: 'Week 1' }, { value: 2, label: 'Week 2' },
  { value: 3, label: 'Week 3' }, { value: 4, label: 'Week 4' }, { value: 5, label: 'Week 5' },
]

interface BrainstormCardProps {
  idea: IdeaCard
  onUpdateField: (id: string, field: string, value: unknown) => void
  onUpdateTitle: (id: string, title: string) => void
  onDelete: (id: string) => void
  onRefine: (id: string, direction: string) => Promise<void>
  onReplace: (id: string) => Promise<void>
  onDuplicate: (id: string) => void
  setLocalTitle: (id: string, title: string) => void
  setLocalDesc: (id: string, desc: string) => void
}

export default function BrainstormCard({
  idea, onUpdateField, onUpdateTitle, onDelete, onRefine, onReplace, onDuplicate,
  setLocalTitle, setLocalDesc,
}: BrainstormCardProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [refining, setRefining] = useState(false)
  const [refineText, setRefineText] = useState('')
  const [replacing, setReplacing] = useState(false)

  const fmt = FORMAT_OPTIONS.find((f) => f.value === idea.content_type || (f.value === 'feed_post' && idea.content_type === 'static_post'))
  const goalInfo = GOAL_OPTIONS.find((g) => g.value === idea.strategic_goal)
  const sourceInfo = SOURCE_BADGES[idea.source] ?? SOURCE_BADGES.ai
  const batchColor = idea.filming_batch ? BATCH_COLORS[idea.filming_batch] ?? 'bg-ink-4' : null

  const handleRefine = async () => {
    if (!refineText.trim()) return
    setRefining(true)
    await onRefine(idea.id, refineText)
    setRefineText('')
    setRefining(false)
  }

  const handleReplace = async () => {
    setReplacing(true)
    await onReplace(idea.id)
    setReplacing(false)
    setMenuOpen(false)
  }

  return (
    <div className={`bg-white rounded-xl border p-4 hover:shadow-sm transition-all group relative ${
      batchColor ? 'border-l-4' : 'border'
    } ${batchColor ? '' : 'border-ink-6'}`}
      style={batchColor ? { borderLeftColor: `var(--tw-${batchColor.replace('bg-', '')})` } : undefined}
    >
      {/* Source badge + menu — top right */}
      <div className="absolute top-3 right-3 flex items-center gap-1">
        <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${sourceInfo.color}`}>{sourceInfo.label}</span>
        <div className="relative">
          <button onClick={() => setMenuOpen(!menuOpen)} className="p-1 text-ink-5 hover:text-ink opacity-0 group-hover:opacity-100 transition-all">
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1 bg-white rounded-lg border border-ink-6 shadow-lg z-20 py-1 min-w-[140px]">
                <button onClick={() => { setMenuOpen(false); setRefineText('') }} className="w-full text-left px-3 py-1.5 text-xs text-ink-2 hover:bg-bg-2 flex items-center gap-2"><Sparkles className="w-3 h-3 text-brand" /> Refine</button>
                <button onClick={handleReplace} disabled={replacing} className="w-full text-left px-3 py-1.5 text-xs text-ink-2 hover:bg-bg-2 flex items-center gap-2">
                  {replacing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Replace
                </button>
                <button onClick={() => { onDuplicate(idea.id); setMenuOpen(false) }} className="w-full text-left px-3 py-1.5 text-xs text-ink-2 hover:bg-bg-2 flex items-center gap-2"><Copy className="w-3 h-3" /> Duplicate</button>
                <div className="border-t border-ink-6 my-1" />
                <button onClick={() => { onDelete(idea.id); setMenuOpen(false) }} className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2"><Trash2 className="w-3 h-3" /> Delete</button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Content type toggle */}
      <div className="flex gap-1 mb-2 pr-14">
        {FORMAT_OPTIONS.map((f) => {
          const FIcon = f.icon
          const isActive = idea.content_type === f.value || (f.value === 'feed_post' && idea.content_type === 'static_post')
          return (
            <button key={f.value} onClick={() => onUpdateField(idea.id, 'content_type', f.value)} className={`flex items-center gap-1 px-2 py-1 text-[9px] font-semibold rounded-md transition-colors ${isActive ? f.color : 'text-ink-4 hover:text-ink-3'}`}>
              <FIcon className="w-3 h-3" /> {f.label}
            </button>
          )
        })}
      </div>

      {/* Theme + Goal + Platform row */}
      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
        <select value={idea.content_category ?? ''} onChange={(e) => onUpdateField(idea.id, 'content_category', e.target.value || null)} className="text-[10px] text-ink-3 bg-bg-2 border border-ink-6 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-brand/30">
          <option value="">Theme</option>
          {THEME_OPTIONS.map((t) => (<option key={t} value={t.toLowerCase().replace(/[^a-z]/g, '_')}>{t}</option>))}
        </select>
        <select value={idea.strategic_goal ?? ''} onChange={(e) => onUpdateField(idea.id, 'strategic_goal', e.target.value || null)} className={`text-[10px] font-semibold rounded px-1.5 py-0.5 border focus:outline-none focus:ring-1 focus:ring-brand/30 ${goalInfo ? goalInfo.color + ' border-transparent' : 'text-ink-3 bg-bg-2 border-ink-6'}`}>
          <option value="">Goal</option>
          {GOAL_OPTIONS.map((g) => (<option key={g.value} value={g.value}>{g.label}</option>))}
        </select>
        <select value={idea.platform} onChange={(e) => onUpdateField(idea.id, 'platform', e.target.value)} className="text-[10px] text-ink-3 bg-bg-2 border border-ink-6 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-brand/30">
          <option value="instagram">IG</option>
          <option value="tiktok">TT</option>
          <option value="facebook">FB</option>
          <option value="linkedin">LI</option>
        </select>
      </div>

      {/* Title */}
      <input
        value={idea.concept_title}
        onChange={(e) => setLocalTitle(idea.id, e.target.value)}
        onBlur={(e) => onUpdateTitle(idea.id, e.target.value)}
        className="text-sm font-medium text-ink w-full bg-transparent border-none focus:outline-none focus:ring-0 p-0 mb-1"
        placeholder="What's this post about?"
      />

      {/* Description */}
      <textarea
        value={idea.concept_description ?? ''}
        onChange={(e) => setLocalDesc(idea.id, e.target.value)}
        onBlur={(e) => onUpdateField(idea.id, 'concept_description', e.target.value)}
        className="text-xs text-ink-3 w-full bg-transparent border-none focus:outline-none focus:ring-0 p-0 mb-2 resize-none"
        rows={2}
        placeholder="Brief description..."
      />

      {/* Bottom row: week + batch */}
      <div className="flex items-center gap-2">
        <select value={idea.week_number ?? ''} onChange={(e) => onUpdateField(idea.id, 'week_number', e.target.value ? parseInt(e.target.value) : null)} className="text-[10px] text-ink-3 bg-bg-2 border border-ink-6 rounded px-1.5 py-0.5 focus:outline-none">
          <option value="">Week</option>
          {WEEK_OPTIONS.map((w) => (<option key={w.value} value={w.value}>{w.label}</option>))}
        </select>
        {idea.filming_batch && (
          <span className={`text-[9px] font-bold text-white px-1.5 py-0.5 rounded ${BATCH_COLORS[idea.filming_batch] ?? 'bg-ink-4'}`}>
            Batch {idea.filming_batch}
          </span>
        )}
      </div>

      {/* Inline refine */}
      {refineText !== '' && (
        <div className="mt-2 flex gap-1.5">
          <input value={refineText} onChange={(e) => setRefineText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleRefine()} placeholder="How to refine..." className="flex-1 text-xs border border-ink-6 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-brand/30" autoFocus />
          <button onClick={handleRefine} disabled={refining} className="px-2 py-1 bg-brand text-white text-[10px] font-semibold rounded disabled:opacity-50">
            {refining ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Go'}
          </button>
          <button onClick={() => setRefineText('')} className="text-[10px] text-ink-4">✕</button>
        </div>
      )}
    </div>
  )
}
