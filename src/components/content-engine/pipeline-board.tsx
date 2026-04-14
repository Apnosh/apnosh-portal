'use client'

import {
  Camera, Scissors, Palette, Pen, ShieldCheck,
  Globe, Video, MessageCircle,
} from 'lucide-react'

interface PipelineItem {
  id: string
  item_id: string
  concept_title: string
  content_type: string
  platform: string
  team_member_name: string | null
  status: string
  due_date: string | null
  filming_batch: string | null
}

interface PipelineBoardProps {
  filming: PipelineItem[]
  editing: PipelineItem[]
  design: PipelineItem[]
  copy: PipelineItem[]
  qa: PipelineItem[]
  onItemClick: (itemId: string) => void
}

const COLUMNS: Array<{
  key: string
  label: string
  icon: typeof Camera
  color: string
  bgColor: string
}> = [
  { key: 'filming', label: 'Filming', icon: Camera, color: 'text-indigo-600', bgColor: 'bg-indigo-50' },
  { key: 'editing', label: 'Editing', icon: Scissors, color: 'text-purple-600', bgColor: 'bg-purple-50' },
  { key: 'design', label: 'Design', icon: Palette, color: 'text-pink-600', bgColor: 'bg-pink-50' },
  { key: 'copy', label: 'Copy', icon: Pen, color: 'text-cyan-600', bgColor: 'bg-cyan-50' },
  { key: 'qa', label: 'QA', icon: ShieldCheck, color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
]

const STATUS_DOT: Record<string, string> = {
  queued: 'bg-ink-4',
  in_progress: 'bg-blue-400',
  completed: 'bg-brand',
  blocked: 'bg-red-400',
  revision: 'bg-amber-400',
}

const TYPE_COLORS: Record<string, string> = {
  reel: 'border-l-indigo-400', feed_post: 'border-l-cyan-400',
  carousel: 'border-l-pink-400', story: 'border-l-amber-400',
}

const PLATFORM_ICONS: Record<string, typeof Camera> = {
  instagram: Camera, tiktok: Video, facebook: Globe, linkedin: MessageCircle,
}

export default function PipelineBoard({
  filming, editing, design, copy, qa, onItemClick,
}: PipelineBoardProps) {
  const columns: Record<string, PipelineItem[]> = { filming, editing, design, copy, qa }

  return (
    <div className="grid grid-cols-5 gap-3 min-h-[300px]">
      {COLUMNS.map((col) => {
        const items = columns[col.key] ?? []
        const Icon = col.icon
        const activeCount = items.filter((i) => i.status === 'in_progress').length
        const totalCount = items.length

        return (
          <div key={col.key} className="flex flex-col">
            {/* Column header */}
            <div className={`flex items-center gap-2 px-3 py-2 rounded-t-xl ${col.bgColor}`}>
              <Icon className={`w-3.5 h-3.5 ${col.color}`} />
              <span className={`text-xs font-semibold ${col.color}`}>{col.label}</span>
              <span className="text-[10px] text-ink-3 ml-auto">
                {activeCount > 0 ? `${activeCount} active` : `${totalCount}`}
              </span>
            </div>

            {/* Items */}
            <div className="flex-1 bg-bg-2 rounded-b-xl p-2 space-y-1.5 border border-t-0 border-ink-6">
              {items.length === 0 ? (
                <div className="text-center py-6 text-[10px] text-ink-4">No items</div>
              ) : (
                items.map((item) => {
                  const PIcon = PLATFORM_ICONS[item.platform] ?? Globe
                  const isOverdue = item.due_date && new Date(item.due_date) < new Date() && item.status !== 'completed'

                  return (
                    <button
                      key={item.id}
                      onClick={() => onItemClick(item.item_id)}
                      className={`w-full text-left bg-white rounded-lg p-2.5 border-l-2 border border-ink-6 hover:shadow-sm transition-all ${
                        TYPE_COLORS[item.content_type] ?? 'border-l-ink-4'
                      }`}
                    >
                      {/* Status dot + title */}
                      <div className="flex items-start gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${STATUS_DOT[item.status] ?? 'bg-ink-4'}`} />
                        <span className="text-[11px] font-medium text-ink leading-tight line-clamp-2">{item.concept_title}</span>
                      </div>

                      {/* Meta row */}
                      <div className="flex items-center gap-1.5 mt-1.5 ml-3">
                        <PIcon className="w-2.5 h-2.5 text-ink-5" />
                        {item.team_member_name ? (
                          <span className="text-[9px] text-ink-3 truncate">{item.team_member_name}</span>
                        ) : (
                          <span className="text-[9px] text-amber-500 font-medium">Unassigned</span>
                        )}
                        {item.due_date && (
                          <span className={`text-[9px] ml-auto flex-shrink-0 ${isOverdue ? 'text-red-500 font-medium' : 'text-ink-4'}`}>
                            {new Date(item.due_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        )}
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
