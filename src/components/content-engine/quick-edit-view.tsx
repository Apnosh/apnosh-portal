'use client'

import { useState } from 'react'
import { Check, Flag, X, ChevronDown, ChevronUp } from 'lucide-react'

interface ContentItem { id: string; [key: string]: unknown }

const s = (val: unknown): string => (val as string) ?? ''

const TYPE_COLORS: Record<string, string> = {
  reel: 'bg-indigo-100 text-indigo-800', feed_post: 'bg-cyan-100 text-cyan-800',
  carousel: 'bg-pink-100 text-pink-800', story: 'bg-amber-100 text-amber-800',
}

function getHookField(item: ContentItem): { field: string; label: string } {
  const type = s(item.content_type)
  if (['reel', 'video', 'short_form_video'].includes(type)) {
    if (item.visual_hook) return { field: 'visual_hook', label: 'Visual hook' }
    if (item.audio_hook) return { field: 'audio_hook', label: 'Audio hook' }
    return { field: 'hook', label: 'Hook' }
  }
  if (type === 'carousel') return { field: 'cover_headline', label: 'Cover headline' }
  return { field: 'headline_text', label: 'Headline' }
}

interface QuickEditViewProps {
  items: ContentItem[]
  onSave: (id: string, field: string, value: string) => void
  onApprove: (id: string) => void
  onFlag: (id: string) => void
  onExit: () => void
}

export default function QuickEditView({ items, onSave, onApprove, onFlag, onExit }: QuickEditViewProps) {
  const approved = items.filter((i) => i.status === 'approved' || i.status === 'strategist_approved').length
  const flagged = items.filter((i) => i.status === 'flagged').length
  const notReviewed = items.length - approved - flagged

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-bold text-ink">Quick Edit</h2>
          <div className="flex items-center gap-3 text-[10px]">
            <span className="text-emerald-600 font-semibold">{approved}/{items.length} approved</span>
            {flagged > 0 && <span className="text-amber-600 font-semibold">{flagged} flagged</span>}
            {notReviewed > 0 && <span className="text-ink-3">{notReviewed} not reviewed</span>}
          </div>
          {/* Progress bar */}
          <div className="w-24 h-1.5 bg-ink-6 rounded-full overflow-hidden">
            <div className="h-full bg-brand rounded-full transition-all" style={{ width: `${items.length > 0 ? Math.round((approved / items.length) * 100) : 0}%` }} />
          </div>
        </div>
        <button onClick={onExit} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-ink-3 border border-ink-6 rounded-lg hover:bg-bg-2">
          <X className="w-3 h-3" /> Exit Quick Edit
        </button>
      </div>

      {/* Items */}
      <div className="space-y-3">
        {items.map((item) => (
          <QuickEditRow
            key={item.id}
            item={item}
            onSave={onSave}
            onApprove={onApprove}
            onFlag={onFlag}
          />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Quick Edit Row
// ---------------------------------------------------------------------------

function QuickEditRow({ item, onSave, onApprove, onFlag }: {
  item: ContentItem
  onSave: (id: string, field: string, value: string) => void
  onApprove: (id: string) => void
  onFlag: (id: string) => void
}) {
  const [captionExpanded, setCaptionExpanded] = useState(false)
  const hookInfo = getHookField(item)
  const hookVal = s(item[hookInfo.field])
  const captionVal = s(item.caption)
  const isApproved = item.status === 'approved' || item.status === 'strategist_approved'
  const isFlagged = item.status === 'flagged'
  const tc = TYPE_COLORS[s(item.content_type)] ?? 'bg-ink-6 text-ink-3'

  return (
    <div className={`bg-white rounded-xl border p-4 transition-colors ${
      isApproved ? 'border-emerald-200 bg-emerald-50/30' : isFlagged ? 'border-amber-300 bg-amber-50/30' : 'border-ink-6'
    }`}>
      {/* Title row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${tc}`}>
            {s(item.content_type).replace(/_/g, ' ')}
          </span>
          <h3 className="text-sm font-semibold text-ink truncate">{s(item.concept_title)}</h3>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={() => onApprove(item.id)}
            className={`inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold rounded-lg transition-colors ${
              isApproved ? 'bg-emerald-100 text-emerald-700' : 'bg-bg-2 text-ink-3 hover:bg-emerald-50 hover:text-emerald-600'
            }`}
          >
            <Check className="w-3 h-3" /> {isApproved ? 'Approved' : 'Approve'}
          </button>
          <button
            onClick={() => onFlag(item.id)}
            className={`inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold rounded-lg transition-colors ${
              isFlagged ? 'bg-amber-100 text-amber-700' : 'bg-bg-2 text-ink-3 hover:bg-amber-50 hover:text-amber-600'
            }`}
          >
            <Flag className="w-3 h-3" /> {isFlagged ? 'Flagged' : 'Flag'}
          </button>
        </div>
      </div>

      {/* Hook/headline field */}
      <div className="mb-3">
        <label className="text-[9px] text-ink-4 block mb-1">{hookInfo.label}</label>
        <input
          type="text"
          value={hookVal}
          onChange={(e) => onSave(item.id, hookInfo.field, e.target.value)}
          placeholder={`Enter ${hookInfo.label.toLowerCase()}...`}
          className="w-full text-sm text-ink border-l-[3px] border-l-emerald-400 border border-ink-6 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
      </div>

      {/* Caption */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[9px] text-ink-4">Caption</label>
          {captionVal.length > 120 && (
            <button onClick={() => setCaptionExpanded(!captionExpanded)} className="text-[9px] text-brand flex items-center gap-0.5">
              {captionExpanded ? <><ChevronUp className="w-2.5 h-2.5" /> Less</> : <><ChevronDown className="w-2.5 h-2.5" /> More</>}
            </button>
          )}
        </div>
        {captionExpanded ? (
          <textarea
            value={captionVal}
            onChange={(e) => onSave(item.id, 'caption', e.target.value)}
            rows={6}
            className="w-full text-xs text-ink-2 border border-ink-6 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
        ) : (
          <p
            onClick={() => captionVal && setCaptionExpanded(true)}
            className={`text-xs text-ink-2 line-clamp-3 ${captionVal ? 'cursor-pointer hover:text-ink' : 'text-ink-4 italic'}`}
          >
            {captionVal || 'No caption yet'}
          </p>
        )}
        {captionVal && <span className="text-[9px] text-ink-4">{captionVal.length} chars</span>}
      </div>
    </div>
  )
}
