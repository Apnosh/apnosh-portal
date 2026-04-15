'use client'

import { useState, useEffect, use } from 'react'
import { Camera, Scissors, Palette, PenTool, Clock, CheckCircle, AlertCircle } from 'lucide-react'
import { getShareLinkData } from '@/lib/share-link-actions'

/* eslint-disable @typescript-eslint/no-explicit-any */

const ROLE_ICONS: Record<string, React.ElementType> = {
  videographer: Camera,
  editor: Scissors,
  designer: Palette,
  copywriter: PenTool,
  all: CheckCircle,
}

const ROLE_LABELS: Record<string, string> = {
  videographer: 'Videographer',
  editor: 'Editor',
  designer: 'Designer',
  copywriter: 'Copywriter',
  all: 'All Roles',
}

function filterItemsByRole(items: any[], role: string): any[] {
  if (role === 'all') return items
  return items.filter((item) => {
    const type = item.content_type || ''
    const footage = item.footage_source || ''
    switch (role) {
      case 'videographer':
        return (type === 'reel' || type === 'video') && !['client_provides', 'animation', 'stock_footage'].includes(footage)
      case 'editor':
        return type === 'reel' || type === 'video'
      case 'designer':
        return ['feed_post', 'static_post', 'carousel'].includes(type) || !!item.cover_frame
      case 'copywriter':
        return true
      default:
        return true
    }
  })
}

function statusColor(status: string) {
  switch (status) {
    case 'done': return 'text-emerald-600 bg-emerald-50'
    case 'in_progress': return 'text-amber-600 bg-amber-50'
    case 'blocked': return 'text-red-600 bg-red-50'
    default: return 'text-gray-500 bg-gray-50'
  }
}

export default function ProductionSharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const result = await getShareLinkData(token)
      if (result.error) {
        setError(result.error as string)
      } else {
        setData(result)
      }
      setLoading(false)
    }
    load()
  }, [token])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fafaf8] flex items-center justify-center">
        <div className="animate-pulse text-sm text-gray-400">Loading production brief...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#fafaf8] flex items-center justify-center p-4">
        <div className="bg-white rounded-xl border border-gray-200 p-8 max-w-md text-center shadow-sm">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h1 className="text-lg font-bold text-gray-900 mb-2">Link unavailable</h1>
          <p className="text-sm text-gray-500">{error}</p>
        </div>
      </div>
    )
  }

  const { clientName, month, roleFilter, items } = data
  const filtered = filterItemsByRole(items, roleFilter)
  const Icon = ROLE_ICONS[roleFilter] || CheckCircle
  const roleLabel = ROLE_LABELS[roleFilter] || 'Production'
  const monthLabel = month ? new Date(month + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : ''

  return (
    <div className="min-h-screen bg-[#fafaf8]">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div>
            <span
              className="text-xl font-semibold"
              style={{ fontFamily: 'Playfair Display, serif', color: '#2e9a78' }}
            >
              Apnosh
            </span>
            <span className="text-xs text-gray-400 ml-3">Production Brief</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Icon className="w-4 h-4" />
            <span>{roleLabel}</span>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">
        {/* Title */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Playfair Display, serif' }}>
            {clientName}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {monthLabel} &middot; {filtered.length} item{filtered.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Items */}
        {filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <p className="text-sm text-gray-500">No items to show for this role.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((item: any) => (
              <ItemCard key={item.id} item={item} role={roleFilter} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

function ItemCard({ item, role }: { item: any; role: string }) {
  const [expanded, setExpanded] = useState(false)
  const type = String(item.content_type || 'post').replace(/_/g, ' ')
  const stageKey = role === 'videographer' ? 'filming_status'
    : role === 'editor' ? 'editing_status'
    : role === 'designer' ? 'design_status'
    : role === 'copywriter' ? 'caption_status'
    : 'concept_status'
  const status = item[stageKey] || 'not_started'

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      {/* Header row */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-gray-50 transition-colors"
      >
        <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${
          type.includes('reel') ? 'bg-pink-50 text-pink-600'
          : type.includes('carousel') ? 'bg-amber-50 text-amber-600'
          : 'bg-blue-50 text-blue-600'
        }`}>
          {type}
        </span>
        <span className="flex-1 text-sm font-medium text-gray-900 truncate">
          {String(item.concept_title || 'Untitled')}
        </span>
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${statusColor(status)}`}>
          {status.replace(/_/g, ' ')}
        </span>
        {item.scheduled_date && (
          <span className="text-xs text-gray-400 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {new Date(item.scheduled_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        )}
      </button>

      {/* Expanded brief */}
      {expanded && (
        <div className="border-t border-gray-100 p-4 space-y-3 text-sm">
          {!!item.concept_description && (
            <BriefRow label="Concept" value={String(item.concept_description)} />
          )}
          {!!item.hook && <BriefRow label="Hook" value={String(item.hook)} />}
          {!!item.visual_hook && <BriefRow label="Visual hook" value={String(item.visual_hook)} />}
          {!!item.audio_hook && <BriefRow label="Audio hook" value={String(item.audio_hook)} />}

          {/* Videographer fields */}
          {(role === 'videographer' || role === 'all') && (
            <>
              {!!item.location_notes && <BriefRow label="Location" value={String(item.location_notes)} />}
              {!!item.who_on_camera && <BriefRow label="On camera" value={String(item.who_on_camera)} />}
              {!!item.props && <BriefRow label="Props" value={Array.isArray(item.props) ? item.props.join(', ') : String(item.props)} />}
              {!!item.shoot_date && <BriefRow label="Shoot date" value={String(item.shoot_date)} />}
              {!!item.equipment_notes && <BriefRow label="Equipment" value={String(item.equipment_notes)} />}
              {!!item.wardrobe_notes && <BriefRow label="Wardrobe" value={String(item.wardrobe_notes)} />}
            </>
          )}

          {/* Editor fields */}
          {(role === 'editor' || role === 'all') && (
            <>
              {!!item.editing_style_value && <BriefRow label="Editing style" value={String(item.editing_style_value)} />}
              {!!item.music_direction && <BriefRow label="Music" value={String(item.music_direction)} />}
              {!!item.music_feel_value && <BriefRow label="Music feel" value={String(item.music_feel_value)} />}
              {!!item.subtitle_style && <BriefRow label="Subtitles" value={String(item.subtitle_style)} />}
              {!!item.pacing_notes && <BriefRow label="Pacing" value={String(item.pacing_notes)} />}
              {!!item.cover_frame && <BriefRow label="Cover frame" value={String(item.cover_frame)} />}
            </>
          )}

          {/* Designer fields */}
          {(role === 'designer' || role === 'all') && (
            <>
              {!!item.headline_text && <BriefRow label="Headline" value={String(item.headline_text)} />}
              {!!item.supporting_text && <BriefRow label="Supporting text" value={String(item.supporting_text)} />}
              {!!item.photo_direction && <BriefRow label="Photo direction" value={String(item.photo_direction)} />}
              {!!item.mood_tags && <BriefRow label="Mood" value={Array.isArray(item.mood_tags) ? item.mood_tags.join(', ') : String(item.mood_tags)} />}
              {!!item.color_preference && <BriefRow label="Colors" value={String(item.color_preference)} />}
              {!!item.placement && <BriefRow label="Placement" value={String(item.placement)} />}
            </>
          )}

          {/* Copywriter fields */}
          {(role === 'copywriter' || role === 'all') && (
            <>
              {!!item.caption && <BriefRow label="Caption" value={String(item.caption)} />}
              {!!item.hashtags && <BriefRow label="Hashtags" value={Array.isArray(item.hashtags) ? item.hashtags.join(' ') : String(item.hashtags)} />}
            </>
          )}

          {!!item.reference_link && <BriefRow label="Reference" value={String(item.reference_link)} isLink />}
          {!!item.internal_note && <BriefRow label="Notes" value={String(item.internal_note)} />}
        </div>
      )}
    </div>
  )
}

function BriefRow({ label, value, isLink }: { label: string; value: string; isLink?: boolean }) {
  return (
    <div>
      <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">{label}</span>
      {isLink ? (
        <a href={value} target="_blank" rel="noopener noreferrer" className="block text-sm text-[#4abd98] underline mt-0.5">{value}</a>
      ) : (
        <p className="text-sm text-gray-700 mt-0.5 whitespace-pre-wrap">{value}</p>
      )}
    </div>
  )
}
