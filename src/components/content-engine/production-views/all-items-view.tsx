'use client'

import { Check, Clock, AlertCircle, Minus } from 'lucide-react'

interface ContentItem { [key: string]: unknown }

const TYPE_COLORS: Record<string, string> = {
  reel: 'bg-indigo-100 text-indigo-800', feed_post: 'bg-cyan-100 text-cyan-800',
  carousel: 'bg-pink-100 text-pink-800', story: 'bg-amber-100 text-amber-800',
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'approved' || status === 'filmed' || status === 'draft_ready') return <Check className="w-3.5 h-3.5 text-brand" />
  if (status === 'not_applicable') return <Minus className="w-3.5 h-3.5 text-ink-5" />
  if (status === 'blocked') return <AlertCircle className="w-3.5 h-3.5 text-red-500" />
  if (status === 'not_started' || status === 'draft') return <Clock className="w-3.5 h-3.5 text-amber-400" />
  return <Clock className="w-3.5 h-3.5 text-blue-400" />
}

interface AllItemsViewProps {
  items: ContentItem[]
  onItemClick: (id: string) => void
}

export default function AllItemsView({ items, onItemClick }: AllItemsViewProps) {
  return (
    <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
      {/* Header row */}
      <div className="grid grid-cols-[1fr_80px_60px_60px_60px_60px_60px_80px] gap-2 px-4 py-2 bg-bg-2 border-b border-ink-6 text-[9px] font-semibold text-ink-3 uppercase tracking-wider">
        <span>Item</span>
        <span className="text-center">Concept</span>
        <span className="text-center">Script</span>
        <span className="text-center">Film</span>
        <span className="text-center">Edit</span>
        <span className="text-center">Design</span>
        <span className="text-center">Caption</span>
        <span className="text-center">Status</span>
      </div>

      {/* Items */}
      {items.map((item) => {
        const tc = TYPE_COLORS[item.content_type as string] ?? 'bg-ink-6 text-ink-3'
        const overallStatus = getOverallStatus(item)

        return (
          <button
            key={item.id as string}
            onClick={() => onItemClick(item.id as string)}
            className="w-full grid grid-cols-[1fr_80px_60px_60px_60px_60px_60px_80px] gap-2 px-4 py-3 border-b border-ink-6 last:border-0 hover:bg-bg-2 transition-colors text-left"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${tc}`}>
                {(item.content_type as string).replace(/_/g, ' ')}
              </span>
              <span className="text-xs font-medium text-ink truncate">{item.concept_title as string}</span>
            </div>
            <div className="flex justify-center"><StatusIcon status={item.concept_status as string ?? 'draft'} /></div>
            <div className="flex justify-center"><StatusIcon status={item.script_status as string ?? 'not_applicable'} /></div>
            <div className="flex justify-center"><StatusIcon status={item.filming_status as string ?? 'not_applicable'} /></div>
            <div className="flex justify-center"><StatusIcon status={item.editing_status as string ?? 'not_applicable'} /></div>
            <div className="flex justify-center"><StatusIcon status={item.design_status as string ?? 'not_applicable'} /></div>
            <div className="flex justify-center"><StatusIcon status={item.caption_status as string ?? 'not_started'} /></div>
            <div className="flex justify-center">
              <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full ${
                overallStatus === 'complete' ? 'bg-emerald-50 text-emerald-700' :
                overallStatus === 'blocked' ? 'bg-red-50 text-red-600' :
                'bg-amber-50 text-amber-700'
              }`}>
                {overallStatus === 'complete' ? 'Done' : overallStatus === 'blocked' ? 'Blocked' : 'In progress'}
              </span>
            </div>
          </button>
        )
      })}

      {items.length === 0 && (
        <div className="px-4 py-12 text-center text-sm text-ink-3">No content items for this month.</div>
      )}
    </div>
  )
}

function getOverallStatus(item: ContentItem): string {
  const stages = ['concept_status', 'script_status', 'filming_status', 'editing_status', 'design_status', 'caption_status']
  const applicable = stages.filter((s) => (item[s] as string) !== 'not_applicable')
  if (applicable.some((s) => (item[s] as string) === 'blocked')) return 'blocked'
  if (applicable.every((s) => ['approved', 'filmed', 'draft_ready'].includes(item[s] as string))) return 'complete'
  return 'in_progress'
}
