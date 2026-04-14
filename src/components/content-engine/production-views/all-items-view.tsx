'use client'

import { Check, Clock, AlertCircle, Minus, Camera, Scissors, Palette, Pen } from 'lucide-react'

interface ContentItem { [key: string]: unknown }

const s = (val: unknown): string => (val as string) ?? ''

const TYPE_COLORS: Record<string, string> = {
  reel: 'bg-indigo-100 text-indigo-800', feed_post: 'bg-cyan-100 text-cyan-800',
  carousel: 'bg-pink-100 text-pink-800', story: 'bg-amber-100 text-amber-800',
}

function StatusIcon({ status }: { status: string }) {
  if (['approved', 'filmed', 'draft_ready'].includes(status)) return <Check className="w-3.5 h-3.5 text-brand" />
  if (status === 'not_applicable') return <Minus className="w-3.5 h-3.5 text-ink-5" />
  if (status === 'blocked') return <AlertCircle className="w-3.5 h-3.5 text-red-500" />
  if (['not_started', 'draft'].includes(status)) return <Clock className="w-3.5 h-3.5 text-amber-400" />
  return <Clock className="w-3.5 h-3.5 text-blue-400" />
}

function getOverallStatus(item: ContentItem): string {
  const stages = ['concept_status', 'script_status', 'filming_status', 'editing_status', 'design_status', 'caption_status']
  const applicable = stages.filter((st) => s(item[st]) !== 'not_applicable')
  if (applicable.some((st) => s(item[st]) === 'blocked')) return 'blocked'
  if (applicable.every((st) => ['approved', 'filmed', 'draft_ready'].includes(s(item[st])))) return 'complete'
  return 'in_progress'
}

interface AllItemsViewProps { items: ContentItem[]; onItemClick: (id: string) => void }

export default function AllItemsView({ items, onItemClick }: AllItemsViewProps) {
  // Production summary counts
  const countByStatus = (stage: string) => {
    const counts: Record<string, number> = {}
    items.forEach((i) => { const st = s(i[`${stage}_status`]) || 'not_applicable'; counts[st] = (counts[st] ?? 0) + 1 })
    return counts
  }

  const filming = countByStatus('filming')
  const editing = countByStatus('editing')
  const design = countByStatus('design')
  const caption = countByStatus('caption')

  const summaryRows = [
    { icon: Camera, label: 'Filming', counts: filming, stages: ['not_started', 'in_progress', 'filmed', 'not_applicable'] },
    { icon: Scissors, label: 'Editing', counts: editing, stages: ['not_started', 'in_progress', 'draft_ready', 'approved'] },
    { icon: Palette, label: 'Design', counts: design, stages: ['not_started', 'in_progress', 'draft_ready', 'approved'] },
    { icon: Pen, label: 'Captions', counts: caption, stages: ['not_started', 'draft_ready', 'approved'] },
  ]

  return (
    <div className="space-y-3">
      {/* Summary bar */}
      <div className="bg-white rounded-xl border border-ink-6 p-4">
        <h3 className="text-[10px] font-bold text-ink-3 uppercase tracking-wider mb-3">Production Summary</h3>
        <div className="space-y-2">
          {summaryRows.map(({ icon: Icon, label, counts }) => {
            const applicable = Object.entries(counts).filter(([k]) => k !== 'not_applicable')
            if (applicable.length === 0) return null
            return (
              <div key={label} className="flex items-center gap-2">
                <Icon className="w-3.5 h-3.5 text-ink-4 flex-shrink-0" />
                <span className="text-xs font-medium text-ink w-16 flex-shrink-0">{label}</span>
                <div className="flex items-center gap-3 text-[10px] text-ink-3">
                  {applicable.map(([status, count]) => (
                    <span key={status}>{count} {status.replace(/_/g, ' ')}</span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Status table */}
      <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
        <div className="grid grid-cols-[1fr_80px_60px_60px_60px_60px_60px_80px] gap-2 px-4 py-2 bg-bg-2 border-b border-ink-6 text-[9px] font-semibold text-ink-3 uppercase tracking-wider">
          <span>Item</span><span className="text-center">Concept</span><span className="text-center">Script</span>
          <span className="text-center">Film</span><span className="text-center">Edit</span>
          <span className="text-center">Design</span><span className="text-center">Caption</span><span className="text-center">Status</span>
        </div>
        {items.map((item) => {
          const tc = TYPE_COLORS[s(item.content_type)] ?? 'bg-ink-6 text-ink-3'
          const overall = getOverallStatus(item)
          return (
            <button key={s(item.id)} onClick={() => onItemClick(s(item.id))} className="w-full grid grid-cols-[1fr_80px_60px_60px_60px_60px_60px_80px] gap-2 px-4 py-3 border-b border-ink-6 last:border-0 hover:bg-bg-2 transition-colors text-left">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${tc}`}>{s(item.content_type).replace(/_/g, ' ')}</span>
                <span className="text-xs font-medium text-ink truncate">{s(item.concept_title)}</span>
              </div>
              <div className="flex justify-center"><StatusIcon status={s(item.concept_status) || 'draft'} /></div>
              <div className="flex justify-center"><StatusIcon status={s(item.script_status) || 'not_applicable'} /></div>
              <div className="flex justify-center"><StatusIcon status={s(item.filming_status) || 'not_applicable'} /></div>
              <div className="flex justify-center"><StatusIcon status={s(item.editing_status) || 'not_applicable'} /></div>
              <div className="flex justify-center"><StatusIcon status={s(item.design_status) || 'not_applicable'} /></div>
              <div className="flex justify-center"><StatusIcon status={s(item.caption_status) || 'not_started'} /></div>
              <div className="flex justify-center">
                <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full ${overall === 'complete' ? 'bg-emerald-50 text-emerald-700' : overall === 'blocked' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700'}`}>
                  {overall === 'complete' ? 'Done' : overall === 'blocked' ? 'Blocked' : 'In progress'}
                </span>
              </div>
            </button>
          )
        })}
        {items.length === 0 && <div className="px-4 py-12 text-center text-sm text-ink-3">No content items for this month.</div>}
      </div>
    </div>
  )
}
