'use client'

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
  ai: 'AI', strategist: '✎', client_request: 'Client',
}

const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram', tiktok: 'TikTok', facebook: 'Facebook', linkedin: 'LinkedIn',
}

interface BrainstormCardProps {
  idea: IdeaCard
  onClick: (id: string) => void
}

export default function BrainstormCard({ idea, onClick }: BrainstormCardProps) {
  const typeBadge = TYPE_BADGES[idea.content_type] ?? TYPE_BADGES.feed_post
  const goalInfo = idea.strategic_goal ? GOAL_DOTS[idea.strategic_goal] : null
  const sourceLabel = SOURCE_LABELS[idea.source] ?? 'AI'
  const platformLabel = PLATFORM_LABELS[idea.platform] ?? idea.platform

  // Check if tied to a specific event date (scheduled_date differs from the cycle month start)
  const hasEventDate = idea.scheduled_date && !idea.scheduled_date.endsWith('-01')
  const eventDateLabel = hasEventDate
    ? new Date(idea.scheduled_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null

  return (
    <div
      onClick={() => onClick(idea.id)}
      className="bg-white rounded-xl border border-ink-6 p-4 hover:shadow-md hover:border-ink-5 transition-all cursor-pointer"
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

      {/* Bottom: platform + optional event date */}
      <div className="text-[10px] text-ink-4">
        <span>{platformLabel}</span>
        {eventDateLabel && (
          <span className="ml-2 text-amber-600 font-medium">📌 {eventDateLabel}</span>
        )}
      </div>
    </div>
  )
}
