'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Check, Flag, Camera, Globe, Video, MessageCircle } from 'lucide-react'

interface HookItem {
  id: string
  concept_title: string
  hook: string | null
  content_type: string
  platform: string
  status: string
}

const PLATFORM_ICONS: Record<string, typeof Camera> = {
  instagram: Camera, tiktok: Video, facebook: Globe, linkedin: MessageCircle,
}

const TYPE_DOT: Record<string, string> = {
  reel: 'bg-indigo-400', feed_post: 'bg-cyan-400', carousel: 'bg-pink-400', story: 'bg-amber-400',
}

interface HookGalleryProps {
  items: HookItem[]
  selectedId: string | null
  onSelect: (id: string) => void
  onApprove: (id: string) => void
  onFlag: (id: string) => void
}

export default function HookGallery({ items, selectedId, onSelect, onApprove, onFlag }: HookGalleryProps) {
  const [collapsed, setCollapsed] = useState(false)
  const hooksWithContent = items.filter((i) => i.hook)

  if (hooksWithContent.length === 0) return null

  return (
    <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-bg-2 transition-colors"
      >
        <span className="text-xs font-semibold text-ink">
          Hook Gallery ({hooksWithContent.length} hooks)
        </span>
        {collapsed ? <ChevronDown className="w-3.5 h-3.5 text-ink-4" /> : <ChevronUp className="w-3.5 h-3.5 text-ink-4" />}
      </button>

      {!collapsed && (
        <div className="px-3 pb-3 space-y-1">
          {hooksWithContent.map((item) => {
            const PIcon = PLATFORM_ICONS[item.platform] ?? Globe
            const isSelected = selectedId === item.id
            const isApproved = item.status === 'approved' || item.status === 'strategist_approved'

            return (
              <div
                key={item.id}
                onClick={() => onSelect(item.id)}
                className={`flex items-start gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                  isSelected ? 'bg-brand-tint ring-1 ring-brand/30' : 'hover:bg-bg-2'
                } ${isApproved ? 'opacity-60' : ''}`}
              >
                {/* Type dot */}
                <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${TYPE_DOT[item.content_type] ?? 'bg-ink-4'}`} />

                {/* Hook text */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-ink leading-relaxed line-clamp-2">
                    {item.hook}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <PIcon className="w-3 h-3 text-ink-4" />
                    <span className="text-[10px] text-ink-4 truncate">{item.concept_title}</span>
                  </div>
                </div>

                {/* Quick actions */}
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); onApprove(item.id) }}
                    className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${
                      isApproved ? 'bg-brand text-white' : 'text-ink-5 hover:text-brand hover:bg-brand-tint'
                    }`}
                    title="Approve"
                  >
                    <Check className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onFlag(item.id) }}
                    className="w-6 h-6 rounded flex items-center justify-center text-ink-5 hover:text-amber-500 hover:bg-amber-50 transition-colors"
                    title="Needs work"
                  >
                    <Flag className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
