'use client'

import { useState } from 'react'
import {
  X, ExternalLink, Check, Clock, AlertCircle, Minus,
  Camera, Video, Globe, MessageCircle, ChevronDown, ChevronUp,
  CalendarDays, Film, Palette, Pen, Scissors,
} from 'lucide-react'

interface ContentItem { id: string; [key: string]: unknown }

const s = (val: unknown): string => (val as string) ?? ''

const TYPE_COLORS: Record<string, string> = {
  reel: 'bg-indigo-100 text-indigo-800', feed_post: 'bg-cyan-100 text-cyan-800',
  carousel: 'bg-pink-100 text-pink-800', story: 'bg-amber-100 text-amber-800',
}

const PLATFORM_ICONS: Record<string, typeof Camera> = {
  instagram: Camera, tiktok: Video, facebook: Globe, linkedin: MessageCircle,
}

const STAGE_LABELS: Record<string, { label: string; icon: typeof Camera }> = {
  concept_status: { label: 'Concept', icon: Film },
  script_status: { label: 'Script', icon: Pen },
  filming_status: { label: 'Filming', icon: Camera },
  editing_status: { label: 'Editing', icon: Scissors },
  design_status: { label: 'Design', icon: Palette },
  caption_status: { label: 'Caption', icon: MessageCircle },
}

function StatusBadge({ status }: { status: string }) {
  if (['approved', 'filmed', 'draft_ready', 'published'].includes(status))
    return <span className="flex items-center gap-1 text-[10px] text-emerald-600"><Check className="w-3 h-3" /> Done</span>
  if (status === 'not_applicable')
    return <span className="flex items-center gap-1 text-[10px] text-ink-4"><Minus className="w-3 h-3" /> N/A</span>
  if (status === 'blocked')
    return <span className="flex items-center gap-1 text-[10px] text-red-500"><AlertCircle className="w-3 h-3" /> Blocked</span>
  if (['not_started', 'draft'].includes(status))
    return <span className="flex items-center gap-1 text-[10px] text-ink-4"><Clock className="w-3 h-3" /> Not started</span>
  return <span className="flex items-center gap-1 text-[10px] text-blue-500"><Clock className="w-3 h-3" /> {status.replace(/_/g, ' ')}</span>
}

function getOverallStatus(item: ContentItem): { label: string; color: string } {
  const stages = ['concept_status', 'script_status', 'filming_status', 'editing_status', 'design_status', 'caption_status']
  const applicable = stages.filter((st) => s(item[st]) !== 'not_applicable')
  if (applicable.length === 0) return { label: 'Not started', color: 'bg-ink-5 text-ink-3' }
  if (applicable.some((st) => s(item[st]) === 'blocked')) return { label: 'Blocked', color: 'bg-red-50 text-red-600' }
  if (applicable.every((st) => ['approved', 'filmed', 'draft_ready', 'published'].includes(s(item[st])))) return { label: 'Ready', color: 'bg-emerald-50 text-emerald-700' }
  if (applicable.some((st) => !['draft', 'not_started', 'not_applicable'].includes(s(item[st])))) return { label: 'In production', color: 'bg-amber-50 text-amber-700' }
  return { label: 'Not started', color: 'bg-ink-6 text-ink-3' }
}

interface CalendarDetailPanelProps {
  item: ContentItem
  onClose: () => void
  onSaveDate: (id: string, field: string, value: string) => void
  onMarkPublished: (id: string) => void
  turnaroundDays: { editing: number; clientReview: number; design: number }
}

export default function CalendarDetailPanel({
  item, onClose, onSaveDate, onMarkPublished, turnaroundDays,
}: CalendarDetailPanelProps) {
  const [showBrief, setShowBrief] = useState(false)
  const [editingDate, setEditingDate] = useState(false)
  const [editingFilmDate, setEditingFilmDate] = useState(false)
  const [dateVal, setDateVal] = useState(s(item.scheduled_date))
  const [timeVal, setTimeVal] = useState(s(item.scheduled_time))
  const [filmDateVal, setFilmDateVal] = useState(s(item.shoot_date))

  const overall = getOverallStatus(item)
  const PIcon = PLATFORM_ICONS[s(item.platform)] ?? Globe
  const tc = TYPE_COLORS[s(item.content_type)] ?? 'bg-ink-6 text-ink-3'
  const isVideo = ['reel', 'video', 'short_form_video'].includes(s(item.content_type))

  // Computed deadlines
  const publishDate = s(item.scheduled_date)
  const editingDeadline = publishDate ? subtractBusinessDays(publishDate, turnaroundDays.clientReview + 1) : null
  const reviewDeadline = publishDate ? subtractBusinessDays(publishDate, 1) : null

  const savePublishDate = () => {
    if (dateVal) onSaveDate(item.id, 'scheduled_date', dateVal)
    if (timeVal) onSaveDate(item.id, 'scheduled_time', timeVal)
    setEditingDate(false)
  }

  const saveFilmDate = () => {
    if (filmDateVal) onSaveDate(item.id, 'shoot_date', filmDateVal)
    setEditingFilmDate(false)
  }

  return (
    <div className="bg-white rounded-xl border border-ink-6 shadow-lg overflow-hidden flex flex-col h-full">
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-ink-6">
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-ink truncate">{s(item.concept_title)}</h2>
          <div className="flex items-center gap-2 mt-1.5">
            <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${tc}`}>
              {s(item.content_type).replace(/_/g, ' ')}
            </span>
            <PIcon className="w-3.5 h-3.5 text-ink-4" />
            {(item.additional_platforms as string[])?.map((p: string) => {
              const PI = PLATFORM_ICONS[p] ?? Globe
              return <PI key={p} className="w-3.5 h-3.5 text-ink-4" />
            })}
            <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full ${overall.color}`}>{overall.label}</span>
          </div>
        </div>
        <button onClick={onClose} className="p-1 text-ink-4 hover:text-ink rounded-lg hover:bg-bg-2 flex-shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Key dates */}
        <Section title="Key Dates">
          {/* Publish date */}
          <div className="flex items-center justify-between">
            <label className="text-[10px] text-ink-4">Publish date</label>
            {!editingDate ? (
              <button onClick={() => setEditingDate(true)} className="text-xs font-medium text-ink hover:text-brand">
                {publishDate
                  ? `${new Date(publishDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}${s(item.scheduled_time) ? ` at ${s(item.scheduled_time).slice(0, 5)}` : ''}`
                  : 'Set date'}
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <input type="date" value={dateVal} onChange={(e) => setDateVal(e.target.value)} className="text-xs border border-ink-6 rounded px-2 py-1" />
                <input type="time" value={timeVal} onChange={(e) => setTimeVal(e.target.value)} className="text-xs border border-ink-6 rounded px-2 py-1 w-24" />
                <button onClick={savePublishDate} className="text-[10px] font-semibold text-brand">Save</button>
                <button onClick={() => setEditingDate(false)} className="text-[10px] text-ink-4">Cancel</button>
              </div>
            )}
          </div>
          {/* Filming date */}
          {isVideo && (
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-ink-4">Filming date</label>
              {!editingFilmDate ? (
                <button onClick={() => setEditingFilmDate(true)} className="text-xs font-medium text-ink hover:text-brand">
                  {s(item.shoot_date)
                    ? `${new Date(s(item.shoot_date) + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}${item.shoot_flexible ? ' (flexible)' : ''}`
                    : 'Set date'}
                </button>
              ) : (
                <div className="flex items-center gap-1.5">
                  <input type="date" value={filmDateVal} onChange={(e) => setFilmDateVal(e.target.value)} className="text-xs border border-ink-6 rounded px-2 py-1" />
                  <button onClick={saveFilmDate} className="text-[10px] font-semibold text-brand">Save</button>
                  <button onClick={() => setEditingFilmDate(false)} className="text-[10px] text-ink-4">Cancel</button>
                </div>
              )}
            </div>
          )}
          {/* Computed deadlines */}
          {editingDeadline && (
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-ink-4">Editing deadline</label>
              <span className="text-xs text-ink-3">{formatDateShort(editingDeadline)}</span>
            </div>
          )}
          {reviewDeadline && (
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-ink-4">Review deadline</label>
              <span className="text-xs text-ink-3">{formatDateShort(reviewDeadline)}</span>
            </div>
          )}
        </Section>

        {/* Production status */}
        <Section title="Production Status">
          <div className="space-y-2">
            {Object.entries(STAGE_LABELS).map(([key, { label, icon: Icon }]) => {
              const val = s(item[key])
              if (val === 'not_applicable') return null
              return (
                <div key={key} className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs text-ink-2">
                    <Icon className="w-3 h-3 text-ink-4" /> {label}
                  </span>
                  <StatusBadge status={val || 'not_started'} />
                </div>
              )
            })}
          </div>
        </Section>

        {/* Content preview */}
        <Section title="Content Preview">
          {/* Hook or headline */}
          {!!(item.visual_hook || item.audio_hook || item.hook || item.headline_text) && (
            <div className="bg-brand-tint/30 rounded-lg p-3 border-l-[3px] border-l-brand">
              {!!item.headline_text && <p className="text-sm font-semibold text-ink">{s(item.headline_text)}</p>}
              {!!item.visual_hook && <p className="text-xs text-ink"><strong className="text-ink-3">Visual hook:</strong> {s(item.visual_hook)}</p>}
              {!!(item.audio_hook || item.hook) && <p className="text-xs text-ink"><strong className="text-ink-3">Audio hook:</strong> {s(item.audio_hook || item.hook)}</p>}
            </div>
          )}
          {/* Reel extras */}
          {isVideo && (
            <div className="flex items-center gap-2">
              {!!item.script_framework && <span className="text-[10px] bg-bg-2 text-ink-3 px-2 py-0.5 rounded capitalize">{s(item.script_framework).replace(/_/g, ' ')}</span>}
              {!!item.estimated_duration && <span className="text-[10px] text-ink-3">{s(item.estimated_duration)}</span>}
            </div>
          )}
          {/* Carousel slide count */}
          {s(item.content_type) === 'carousel' && !!item.carousel_slide_count && (
            <span className="text-[10px] text-ink-3">{item.carousel_slide_count as number} slides</span>
          )}
          {/* Caption */}
          {!!item.caption && (
            <div>
              <label className="text-[9px] text-ink-4 uppercase tracking-wider block mb-1">Caption</label>
              <p className="text-xs text-ink-2 line-clamp-3">{s(item.caption)}</p>
              {s(item.caption).length > 150 && <span className="text-[9px] text-ink-4">{s(item.caption).length} chars</span>}
            </div>
          )}
          {!!item.concept_description && (
            <p className="text-xs text-ink-3">{s(item.concept_description)}</p>
          )}
        </Section>

        {/* View brief (expandable) */}
        <button
          onClick={() => setShowBrief(!showBrief)}
          className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-ink-2 bg-bg-2 rounded-lg hover:bg-ink-6"
        >
          <span>{showBrief ? 'Hide brief' : 'View full brief'}</span>
          {showBrief ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {showBrief && (
          <div className="space-y-3 pl-1 border-l-2 border-ink-6 ml-2">
            {!!item.script && <BriefRow label="Script" value={s(item.script)} />}
            {!!item.visual_hook && <BriefRow label="Visual hook" value={s(item.visual_hook)} />}
            {!!item.audio_hook && <BriefRow label="Audio hook" value={s(item.audio_hook)} />}
            {!!item.hook && !item.audio_hook && <BriefRow label="Hook" value={s(item.hook)} />}
            {!!item.who_on_camera && <BriefRow label="On camera" value={s(item.who_on_camera)} />}
            {!!item.location_notes && <BriefRow label="Location" value={s(item.location_notes)} />}
            {!!item.wardrobe_notes && <BriefRow label="Wardrobe" value={s(item.wardrobe_notes)} />}
            {!!item.editing_style_value && <BriefRow label="Editing style" value={s(item.editing_style_value).replace(/_/g, ' ')} />}
            {!!item.music_feel_value && <BriefRow label="Music feel" value={s(item.music_feel_value)} />}
            {!!item.supporting_text && <BriefRow label="Supporting text" value={s(item.supporting_text)} />}
            {!!item.photo_direction && <BriefRow label="Photo direction" value={s(item.photo_direction)} />}
            {!!item.carousel_flow && <BriefRow label="Visual flow" value={s(item.carousel_flow)} />}
            {(item.hashtags as string[])?.length > 0 && <BriefRow label="Hashtags" value={(item.hashtags as string[]).join(' ')} />}
            {!!item.cta_text && <BriefRow label="CTA" value={s(item.cta_text)} />}
          </div>
        )}

        {/* Posting time suggestion */}
        {!!s(item.scheduled_date) && !s(item.scheduled_time) && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-[10px] text-blue-700 mb-2">
              Suggested: <strong>{getTimeSuggestion(s(item.platform))}</strong>
              <span className="text-blue-500 ml-1">(best for {s(item.platform) || 'this platform'})</span>
            </p>
            <button
              onClick={() => onSaveDate(item.id, 'scheduled_time', getTimeSuggestionRaw(s(item.platform)))}
              className="text-[10px] font-semibold text-blue-600 hover:text-blue-800"
            >
              Use suggestion
            </button>
          </div>
        )}

        {/* Overdue warning */}
        {isOverdue(item, turnaroundDays) && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
            <p className="text-[10px] text-red-600">A production milestone is overdue. Check the status above.</p>
          </div>
        )}
      </div>

      {/* Quick actions footer */}
      <div className="flex items-center gap-2 p-3 border-t border-ink-6 bg-bg-2">
        {!s(item.scheduled_date) && (
          <button onClick={() => setEditingDate(true)} className="flex-1 text-xs font-semibold text-brand bg-brand-tint px-3 py-2 rounded-lg hover:bg-brand/10">
            Set publish date
          </button>
        )}
        {!!s(item.scheduled_date) && (
          <button onClick={() => setEditingDate(true)} className="text-xs font-medium text-ink-3 px-3 py-2 rounded-lg hover:bg-ink-6">
            Reschedule
          </button>
        )}
        <button onClick={() => onMarkPublished(item.id)} className="text-xs font-medium text-ink-3 px-3 py-2 rounded-lg hover:bg-ink-6">
          Mark published
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[10px] font-bold text-ink-3 uppercase tracking-wider mb-2">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function BriefRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="pl-2">
      <label className="text-[9px] text-ink-4">{label}</label>
      <p className="text-xs text-ink-2 whitespace-pre-wrap">{value}</p>
    </div>
  )
}

const TIME_SUGGESTIONS: Record<string, { display: string; raw: string }> = {
  instagram: { display: '11:00 AM', raw: '11:00' },
  tiktok: { display: '7:00 PM', raw: '19:00' },
  facebook: { display: '10:00 AM', raw: '10:00' },
  linkedin: { display: '9:00 AM', raw: '09:00' },
}

function getTimeSuggestion(platform: string): string {
  return TIME_SUGGESTIONS[platform]?.display ?? '11:00 AM'
}

function getTimeSuggestionRaw(platform: string): string {
  return TIME_SUGGESTIONS[platform]?.raw ?? '11:00'
}

function isOverdue(item: ContentItem, turnaroundDays: { editing: number; clientReview: number; design: number }): boolean {
  const publishDate = s(item.scheduled_date)
  if (!publishDate) return false
  const today = new Date().toISOString().split('T')[0]
  if (publishDate < today && s(item.status) !== 'published') return true
  // Check if filming should be done by now
  const isVideo = ['reel', 'video', 'short_form_video'].includes(s(item.content_type))
  if (isVideo) {
    const editingDeadline = subtractBusinessDays(publishDate, turnaroundDays.clientReview + 1)
    const filmingDeadline = subtractBusinessDays(editingDeadline, turnaroundDays.editing)
    if (today > filmingDeadline && !['approved', 'filmed'].includes(s(item.filming_status))) return true
    if (today > editingDeadline && !['approved', 'draft_ready'].includes(s(item.editing_status))) return true
  }
  return false
}

function subtractBusinessDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  let remaining = days
  while (remaining > 0) {
    d.setDate(d.getDate() - 1)
    const dow = d.getDay()
    if (dow !== 0 && dow !== 6) remaining--
  }
  return d.toISOString().split('T')[0]
}

function formatDateShort(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}
