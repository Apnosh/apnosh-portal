'use client'

import { useState } from 'react'
import {
  MoreHorizontal, Sparkles, Trash2, Check,
  Camera, Globe, Video, MessageCircle,
} from 'lucide-react'
import EditableField from './editable-field'

export interface CalendarItemData {
  id: string
  scheduled_date: string
  scheduled_time: string
  platform: string
  content_type: string
  concept_title: string
  concept_description: string | null
  strategic_goal: string | null
  filming_batch: string | null
  source: string
  status: string
  sort_order: number
}

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  reel: { bg: 'bg-indigo-50', text: 'text-indigo-700' },
  feed_post: { bg: 'bg-cyan-50', text: 'text-cyan-700' },
  carousel: { bg: 'bg-pink-50', text: 'text-pink-700' },
  story: { bg: 'bg-amber-50', text: 'text-amber-700' },
  static_post: { bg: 'bg-cyan-50', text: 'text-cyan-700' },
  video: { bg: 'bg-indigo-50', text: 'text-indigo-700' },
  short_form_video: { bg: 'bg-indigo-50', text: 'text-indigo-700' },
  image: { bg: 'bg-cyan-50', text: 'text-cyan-700' },
}

const PLATFORM_ICONS: Record<string, typeof Camera> = {
  instagram: Camera,
  tiktok: Video,
  facebook: Globe,
  linkedin: MessageCircle,
}

const GOAL_DOTS: Record<string, string> = {
  awareness: 'bg-blue-400',
  engagement: 'bg-purple-400',
  conversion: 'bg-emerald-400',
  community: 'bg-amber-400',
}

const PLATFORM_OPTIONS = [
  { value: 'instagram', label: 'Instagram' }, { value: 'facebook', label: 'Facebook' },
  { value: 'tiktok', label: 'TikTok' }, { value: 'linkedin', label: 'LinkedIn' },
]

const TYPE_OPTIONS = [
  { value: 'reel', label: 'Reel' }, { value: 'feed_post', label: 'Feed Post' },
  { value: 'carousel', label: 'Carousel' }, { value: 'story', label: 'Story' },
]

const GOAL_OPTIONS = [
  { value: 'awareness', label: 'Awareness' }, { value: 'engagement', label: 'Engagement' },
  { value: 'conversion', label: 'Conversion' }, { value: 'community', label: 'Community' },
]

interface CalendarItemRowProps {
  item: CalendarItemData
  selected: boolean
  onSelect: (id: string, selected: boolean) => void
  onApprove: (id: string) => void
  onDelete: (id: string) => void
  onRefine: (id: string) => void
  onSave: (id: string, field: string, value: string) => Promise<void>
  expanded?: boolean
  onExpand?: (id: string) => void
  showDate?: boolean
  conflict?: boolean
}

export default function CalendarItemRow({
  item, selected, onSelect, onApprove, onDelete, onRefine, onSave,
  expanded, onExpand, showDate = true, conflict,
}: CalendarItemRowProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const tc = TYPE_COLORS[item.content_type] ?? { bg: 'bg-ink-6', text: 'text-ink-3' }
  const PlatformIcon = PLATFORM_ICONS[item.platform] ?? Globe
  const isApproved = item.status === 'strategist_approved' || item.status === 'approved'

  return (
    <div className={`group ${conflict ? 'ring-1 ring-red-300 rounded-lg' : ''}`}>
      {/* Compact row — 40px */}
      <div
        className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors cursor-pointer ${
          expanded ? 'bg-bg-2' : 'hover:bg-bg-2'
        } ${isApproved ? 'opacity-75' : ''}`}
        onClick={() => onExpand?.(item.id)}
      >
        {/* Checkbox */}
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => { e.stopPropagation(); onSelect(item.id, e.target.checked) }}
          className="rounded border-ink-5 text-brand focus:ring-brand/30 flex-shrink-0"
          onClick={(e) => e.stopPropagation()}
        />

        {/* Date + Time */}
        {showDate && (
          <span className="text-[11px] text-ink-3 font-medium w-16 flex-shrink-0 tabular-nums">
            {formatShortDate(item.scheduled_date)}
          </span>
        )}
        <span className="text-[11px] text-ink-3 w-11 flex-shrink-0 tabular-nums">
          {item.scheduled_time?.slice(0, 5) || '—'}
        </span>

        {/* Platform icon */}
        <PlatformIcon className="w-3.5 h-3.5 text-ink-4 flex-shrink-0" />

        {/* Type badge */}
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${tc.bg} ${tc.text}`}>
          {item.content_type.replace(/_/g, ' ')}
        </span>

        {/* Title — dominant element */}
        <span className="text-sm font-medium text-ink truncate flex-1 min-w-0">
          {item.concept_title}
        </span>

        {/* Goal dot */}
        {item.strategic_goal && (
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${GOAL_DOTS[item.strategic_goal] ?? 'bg-ink-4'}`} title={item.strategic_goal} />
        )}

        {/* Batch */}
        {item.filming_batch && (
          <span className="text-[9px] font-bold text-ink-4 flex-shrink-0">{item.filming_batch}</span>
        )}

        {/* Approve checkbox */}
        <button
          onClick={(e) => { e.stopPropagation(); onApprove(item.id) }}
          className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-colors ${
            isApproved
              ? 'bg-brand text-white'
              : 'border border-ink-5 text-transparent hover:border-brand hover:text-brand'
          }`}
          title={isApproved ? 'Approved' : 'Approve'}
        >
          <Check className="w-3 h-3" />
        </button>

        {/* Menu */}
        <div className="relative flex-shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen) }}
            className="p-1 text-ink-4 hover:text-ink rounded opacity-0 group-hover:opacity-100 transition-all"
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1 bg-white rounded-lg border border-ink-6 shadow-lg z-20 py-1 min-w-[140px]">
                <button onClick={() => { onRefine(item.id); setMenuOpen(false) }} className="w-full text-left px-3 py-1.5 text-xs text-ink-2 hover:bg-bg-2 flex items-center gap-2">
                  <Sparkles className="w-3 h-3 text-brand" /> AI Refine
                </button>
                <button onClick={() => { onDelete(item.id); setMenuOpen(false) }} className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2">
                  <Trash2 className="w-3 h-3" /> Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-3 py-3 ml-7 border-l-2 border-brand/20 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div>
              <label className="text-[10px] text-ink-4 block mb-0.5">Date</label>
              <EditableField value={item.scheduled_date} onSave={(v) => onSave(item.id, 'scheduled_date', v)} type="date" />
            </div>
            <div>
              <label className="text-[10px] text-ink-4 block mb-0.5">Time</label>
              <EditableField value={item.scheduled_time || ''} onSave={(v) => onSave(item.id, 'scheduled_time', v)} type="time" />
            </div>
            <div>
              <label className="text-[10px] text-ink-4 block mb-0.5">Platform</label>
              <EditableField value={item.platform} onSave={(v) => onSave(item.id, 'platform', v)} type="select" options={PLATFORM_OPTIONS} />
            </div>
            <div>
              <label className="text-[10px] text-ink-4 block mb-0.5">Type</label>
              <EditableField value={item.content_type} onSave={(v) => onSave(item.id, 'content_type', v)} type="select" options={TYPE_OPTIONS} />
            </div>
          </div>
          <div>
            <label className="text-[10px] text-ink-4 block mb-0.5">Title</label>
            <EditableField value={item.concept_title} onSave={(v) => onSave(item.id, 'concept_title', v)} displayClassName="text-sm font-semibold text-ink" />
          </div>
          <div>
            <label className="text-[10px] text-ink-4 block mb-0.5">Description</label>
            <EditableField value={item.concept_description ?? ''} onSave={(v) => onSave(item.id, 'concept_description', v)} type="textarea" displayClassName="text-xs text-ink-3" rows={2} placeholder="Add description..." />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-ink-4 block mb-0.5">Goal</label>
              <EditableField value={item.strategic_goal ?? ''} onSave={(v) => onSave(item.id, 'strategic_goal', v)} type="select" options={GOAL_OPTIONS} />
            </div>
            <div>
              <label className="text-[10px] text-ink-4 block mb-0.5">Filming Batch</label>
              <EditableField value={item.filming_batch ?? ''} onSave={(v) => onSave(item.id, 'filming_batch', v)} placeholder="A, B, C..." />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function formatShortDate(date: string): string {
  const d = new Date(date + 'T12:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
