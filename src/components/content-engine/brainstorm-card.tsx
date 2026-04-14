'use client'

import { useState } from 'react'
import {
  Trash2, RefreshCw, Sparkles, Loader2, X,
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

const TYPE_BADGES: Record<string, { label: string; color: string }> = {
  feed_post: { label: 'Static', color: 'bg-cyan-100 text-cyan-800' },
  static_post: { label: 'Static', color: 'bg-cyan-100 text-cyan-800' },
  reel: { label: 'Reel', color: 'bg-indigo-100 text-indigo-800' },
  video: { label: 'Reel', color: 'bg-indigo-100 text-indigo-800' },
  carousel: { label: 'Carousel', color: 'bg-pink-100 text-pink-800' },
}

const GOAL_DOTS: Record<string, { label: string; dot: string; text: string }> = {
  awareness: { label: 'Awareness', dot: 'bg-blue-400', text: 'text-blue-600' },
  engagement: { label: 'Engage', dot: 'bg-purple-400', text: 'text-purple-600' },
  conversion: { label: 'Convert', dot: 'bg-emerald-400', text: 'text-emerald-600' },
  community: { label: 'Community', dot: 'bg-orange-400', text: 'text-orange-600' },
  education: { label: 'Educate', dot: 'bg-teal-400', text: 'text-teal-600' },
}

const SOURCE_LABELS: Record<string, string> = {
  ai: 'AI',
  strategist: '✎',
  client_request: 'Client',
}

const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
}

interface BrainstormCardProps {
  idea: IdeaCard
  onClick: (id: string) => void
  onDelete: (id: string) => void
  onRefine: (id: string, direction: string) => Promise<void>
  onReplace: (id: string) => Promise<void>
}

export default function BrainstormCard({
  idea, onClick, onDelete, onRefine, onReplace,
}: BrainstormCardProps) {
  const [showRefine, setShowRefine] = useState(false)
  const [refineText, setRefineText] = useState('')
  const [refining, setRefining] = useState(false)
  const [replacing, setReplacing] = useState(false)

  const typeBadge = TYPE_BADGES[idea.content_type] ?? TYPE_BADGES.feed_post
  const goalInfo = idea.strategic_goal ? GOAL_DOTS[idea.strategic_goal] : null
  const sourceLabel = SOURCE_LABELS[idea.source] ?? 'AI'
  const platformLabel = PLATFORM_LABELS[idea.platform] ?? idea.platform
  const weekLabel = idea.week_number ? `Week ${idea.week_number}` : null

  const handleRefine = async () => {
    if (!refineText.trim()) return
    setRefining(true)
    await onRefine(idea.id, refineText)
    setRefineText('')
    setRefining(false)
    setShowRefine(false)
  }

  const handleReplace = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setReplacing(true)
    await onReplace(idea.id)
    setReplacing(false)
  }

  return (
    <div
      onClick={() => !showRefine && onClick(idea.id)}
      className="bg-white rounded-xl border border-ink-6 p-4 hover:shadow-md hover:border-ink-5 transition-all cursor-pointer group relative"
    >
      {/* Top row: type badge + goal + source */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${typeBadge.color}`}>
            {typeBadge.label}
          </span>
          {goalInfo && (
            <span className={`flex items-center gap-1 text-[10px] font-medium ${goalInfo.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${goalInfo.dot}`} />
              {goalInfo.label}
            </span>
          )}
        </div>
        <span className="text-[8px] font-medium text-ink-4 bg-ink-6 px-1.5 py-0.5 rounded">
          {sourceLabel}
        </span>
      </div>

      {/* Title */}
      <h3 className="text-sm font-semibold text-ink leading-snug mb-1">
        {idea.concept_title || 'Untitled idea'}
      </h3>

      {/* Description */}
      {idea.concept_description && (
        <p className="text-xs text-ink-3 leading-relaxed line-clamp-3 mb-3">
          {idea.concept_description}
        </p>
      )}

      {/* Bottom: week + platform */}
      <div className="text-[10px] text-ink-4">
        {weekLabel && <span>{weekLabel}</span>}
        {weekLabel && platformLabel && <span> · </span>}
        <span>{platformLabel}</span>
      </div>

      {/* Hover actions */}
      <div className="absolute bottom-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => { e.stopPropagation(); setShowRefine(true) }}
          className="px-2 py-1 text-[10px] font-medium text-brand hover:bg-brand-tint rounded transition-colors"
        >
          Refine
        </button>
        <button
          onClick={handleReplace}
          disabled={replacing}
          className="px-2 py-1 text-[10px] font-medium text-ink-3 hover:bg-bg-2 rounded transition-colors"
        >
          {replacing ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Replace'}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(idea.id) }}
          className="px-1.5 py-1 text-ink-4 hover:text-red-500 rounded transition-colors"
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      {/* Inline refine */}
      {showRefine && (
        <div className="mt-3 border-t border-ink-6 pt-3" onClick={(e) => e.stopPropagation()}>
          <div className="flex gap-1.5">
            <input
              value={refineText}
              onChange={(e) => setRefineText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleRefine()}
              placeholder="How should this change?"
              className="flex-1 text-xs border border-ink-6 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand/30"
              autoFocus
            />
            <button onClick={handleRefine} disabled={refining || !refineText.trim()} className="px-2.5 py-1.5 bg-brand text-white text-[10px] font-semibold rounded-lg disabled:opacity-50">
              {refining ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Go'}
            </button>
            <button onClick={() => { setShowRefine(false); setRefineText('') }} className="px-2 py-1.5 text-[10px] text-ink-4 hover:text-ink">✕</button>
          </div>
        </div>
      )}
    </div>
  )
}
