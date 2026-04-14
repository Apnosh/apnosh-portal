'use client'

import { useState } from 'react'
import {
  Camera, Scissors, Palette, Pen, Check, Clock, AlertCircle,
  Link2, MessageSquare, ChevronDown, ChevronRight, CalendarDays,
} from 'lucide-react'
import { advanceStage, submitDeliverable, addTaskNote } from '@/lib/content-engine/task-actions'

interface ContentItem { [key: string]: unknown }
const s = (val: unknown): string => (val as string) ?? ''

const TYPE_COLORS: Record<string, string> = {
  reel: 'bg-indigo-100 text-indigo-800', feed_post: 'bg-cyan-100 text-cyan-800',
  carousel: 'bg-pink-100 text-pink-800', story: 'bg-amber-100 text-amber-800',
}

type RoleFilter = 'videographer' | 'editor' | 'designer' | 'copywriter'

interface RoleBriefViewProps {
  items: ContentItem[]
  role: RoleFilter
  onItemUpdate?: (itemId: string, field: string, value: string) => void
}

export default function RoleBriefView({ items, role, onItemUpdate }: RoleBriefViewProps) {
  const filtered = items.filter((item) => {
    const type = s(item.content_type)
    if (role === 'videographer') return ['reel', 'video', 'short_form_video'].includes(type) && !['client_provides', 'animation', 'stock'].includes(s(item.footage_source))
    if (role === 'editor') return ['reel', 'video', 'short_form_video'].includes(type)
    if (role === 'designer') return ['feed_post', 'static_post', 'carousel'].includes(type) || !!(item.cover_frame)
    if (role === 'copywriter') return true
    return true
  })

  if (filtered.length === 0) return <div className="text-center py-12 text-sm text-ink-3">No items for this role.</div>

  if (role === 'videographer') return <VideographerView items={filtered} onItemUpdate={onItemUpdate} />
  if (role === 'editor') return <EditorView items={filtered} onItemUpdate={onItemUpdate} />
  if (role === 'designer') return <DesignerView items={filtered} onItemUpdate={onItemUpdate} />
  return <CopywriterView items={filtered} onItemUpdate={onItemUpdate} />
}

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

function StatusBadge({ status, label }: { status: string; label?: string }) {
  const colors: Record<string, string> = {
    not_started: 'bg-ink-6 text-ink-3', in_progress: 'bg-blue-50 text-blue-600',
    draft_ready: 'bg-amber-50 text-amber-700', filmed: 'bg-emerald-50 text-emerald-700',
    approved: 'bg-emerald-50 text-emerald-700', blocked: 'bg-red-50 text-red-600',
    revision_requested: 'bg-orange-50 text-orange-700',
  }
  return <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full ${colors[status] ?? colors.not_started}`}>{label ?? status.replace(/_/g, ' ')}</span>
}

function BriefField({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  if (!value) return null
  return <div><label className="text-[9px] text-ink-4 flex items-center gap-1">{icon}{label}</label><p className="text-xs text-ink-2">{value}</p></div>
}

function ActionBar({ itemId, stage, status, onUpdate }: { itemId: string; stage: string; status: string; onUpdate?: (id: string, f: string, v: string) => void }) {
  const [linkUrl, setLinkUrl] = useState('')
  const [noteText, setNoteText] = useState('')
  const [showLink, setShowLink] = useState(false)
  const [showNote, setShowNote] = useState(false)

  const handleAdvance = async (toStatus: string) => {
    await advanceStage(itemId, stage, toStatus)
    onUpdate?.(itemId, `${stage}_status`, toStatus)
  }
  const handleLink = async () => {
    if (!linkUrl.trim()) return
    await submitDeliverable({ contentItemId: itemId, stage, type: 'link', externalUrl: linkUrl.trim() })
    setLinkUrl(''); setShowLink(false)
  }
  const handleNote = async () => {
    if (!noteText.trim()) return
    await addTaskNote({ contentItemId: itemId, stage, noteText: noteText.trim() })
    setNoteText(''); setShowNote(false)
  }

  const isDone = ['approved', 'filmed', 'draft_ready'].includes(status)
  if (isDone) return null

  return (
    <div className="space-y-2 mt-3 pt-3 border-t border-ink-6/50">
      <div className="flex flex-wrap gap-2">
        {stage === 'filming' && <button onClick={() => handleAdvance('filmed')} className="text-[10px] font-semibold text-white bg-brand px-3 py-1.5 rounded-lg hover:bg-brand-dark">Mark as filmed</button>}
        {(stage === 'editing' || stage === 'design') && status !== 'draft_ready' && (
          <button onClick={() => handleAdvance('draft_ready')} className="text-[10px] font-semibold text-white bg-brand px-3 py-1.5 rounded-lg hover:bg-brand-dark">Submit for review</button>
        )}
        <button onClick={() => setShowLink(!showLink)} className="text-[10px] font-medium text-ink-3 border border-ink-6 px-2.5 py-1.5 rounded-lg hover:bg-bg-2"><Link2 className="w-3 h-3 inline mr-1" />Add link</button>
        <button onClick={() => setShowNote(!showNote)} className="text-[10px] font-medium text-ink-3 border border-ink-6 px-2.5 py-1.5 rounded-lg hover:bg-bg-2"><MessageSquare className="w-3 h-3 inline mr-1" />Note</button>
      </div>
      {showLink && (
        <div className="flex gap-2"><input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="Paste Drive, Dropbox, or Frame.io link" className="flex-1 text-xs border border-ink-6 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand/30" /><button onClick={handleLink} disabled={!linkUrl.trim()} className="text-[10px] font-semibold text-brand px-2.5 py-1.5 disabled:opacity-40">Save</button></div>
      )}
      {showNote && (
        <div className="flex gap-2"><input value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Add a note..." className="flex-1 text-xs border border-ink-6 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand/30" /><button onClick={handleNote} disabled={!noteText.trim()} className="text-[10px] font-semibold text-ink-3 px-2.5 py-1.5 disabled:opacity-40">Save</button></div>
      )}
    </div>
  )
}

function TaskCard({ item, children, stage, onUpdate }: { item: ContentItem; children: React.ReactNode; stage: string; onUpdate?: (id: string, f: string, v: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  const status = s(item[`${stage}_status`]) || 'not_started'
  const tc = TYPE_COLORS[s(item.content_type)] ?? 'bg-ink-6 text-ink-3'
  const isDone = ['approved', 'filmed', 'draft_ready'].includes(status)

  return (
    <div className={`rounded-xl border p-4 ${isDone ? 'border-emerald-200 bg-emerald-50/30 opacity-70' : 'border-ink-6 bg-white'}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <StatusBadge status={status} />
          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${tc}`}>{s(item.content_type).replace(/_/g, ' ')}</span>
          <h4 className="text-sm font-semibold text-ink truncate">{s(item.concept_title)}</h4>
        </div>
        <button onClick={() => setExpanded(!expanded)} className="text-ink-4 hover:text-ink p-1">
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>
      </div>
      {/* Key info always visible */}
      <div className="flex items-center gap-3 text-[10px] text-ink-3 mb-2">
        {!!s(item.scheduled_date) && <span>Publishes: {s(item.scheduled_date)}</span>}
        {!!s(item.shoot_date) && <span>Filming: {s(item.shoot_date)}</span>}
        {!!s(item.estimated_duration) && <span>{s(item.estimated_duration)}</span>}
      </div>
      {/* Expanded content */}
      {expanded && <div className="space-y-2 mb-2">{children}</div>}
      <ActionBar itemId={s(item.id)} stage={stage} status={status} onUpdate={onUpdate} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Videographer View
// ---------------------------------------------------------------------------

function VideographerView({ items, onItemUpdate }: { items: ContentItem[]; onItemUpdate?: (id: string, f: string, v: string) => void }) {
  const needsDate = items.filter((i) => !s(i.shoot_date) && s(i.filming_status) !== 'filmed')
  const scheduled = items.filter((i) => !!s(i.shoot_date) && s(i.filming_status) !== 'filmed')
  const filmed = items.filter((i) => s(i.filming_status) === 'filmed')

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 text-[10px]">
        <Camera className="w-4 h-4 text-ink-3" />
        <span className="text-sm font-bold text-ink">Videographer</span>
        {needsDate.length > 0 && <span className="text-red-600 font-semibold">{needsDate.length} needs date</span>}
        {scheduled.length > 0 && <span className="text-blue-600 font-semibold">{scheduled.length} scheduled</span>}
        {filmed.length > 0 && <span className="text-emerald-600 font-semibold">{filmed.length} filmed</span>}
      </div>
      {needsDate.length > 0 && <StatusGroup label="Needs Filming Date" color="red" items={needsDate} stage="filming" onUpdate={onItemUpdate} renderExtra={(item) => <BriefField label="Suggested film by" value={s(item.scheduled_date) ? `Film by ${subtractBizDays(s(item.scheduled_date), 5)}` : 'Set publish date first'} />} />}
      {scheduled.length > 0 && <StatusGroup label="Scheduled" color="blue" items={scheduled} stage="filming" onUpdate={onItemUpdate} renderExtra={(item) => (
        <div className="space-y-2">
          {!!(item.visual_hook || item.audio_hook) && <div className="bg-brand-tint/30 rounded-lg p-2 border-l-[3px] border-l-brand text-xs">{!!item.visual_hook && <p><strong>Visual:</strong> {s(item.visual_hook)}</p>}{!!(item.audio_hook || item.hook) && <p><strong>Audio:</strong> {s(item.audio_hook || item.hook)}</p>}</div>}
          <BriefField label="Location" value={s(item.location_notes)} /><BriefField label="On camera" value={s(item.who_on_camera)} /><BriefField label="Props" value={(item.props as string[])?.join(', ') ?? ''} />
        </div>
      )} />}
      {filmed.length > 0 && <StatusGroup label="Filmed" color="green" items={filmed} stage="filming" onUpdate={onItemUpdate} collapsed />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Editor View
// ---------------------------------------------------------------------------

function EditorView({ items, onItemUpdate }: { items: ContentItem[]; onItemUpdate?: (id: string, f: string, v: string) => void }) {
  const waiting = items.filter((i) => s(i.filming_status) !== 'filmed' && s(i.editing_status) !== 'approved' && s(i.editing_status) !== 'draft_ready')
  const ready = items.filter((i) => s(i.filming_status) === 'filmed' && s(i.editing_status) === 'not_started')
  const inProgress = items.filter((i) => s(i.editing_status) === 'in_progress')
  const submitted = items.filter((i) => s(i.editing_status) === 'draft_ready')
  const done = items.filter((i) => s(i.editing_status) === 'approved')

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 text-[10px]">
        <Scissors className="w-4 h-4 text-ink-3" /><span className="text-sm font-bold text-ink">Editor</span>
        {ready.length > 0 && <span className="text-blue-600 font-semibold">{ready.length} ready</span>}
        {inProgress.length > 0 && <span className="text-amber-600 font-semibold">{inProgress.length} in progress</span>}
        {submitted.length > 0 && <span className="text-purple-600 font-semibold">{submitted.length} submitted</span>}
      </div>
      {ready.length > 0 && <StatusGroup label="Ready to Edit" color="blue" items={ready} stage="editing" onUpdate={onItemUpdate} renderExtra={(item) => (
        <div className="space-y-2">
          <BriefField label="Style" value={s(item.editing_style_value).replace(/_/g, ' ')} />
          <BriefField label="Music" value={`${s(item.music_feel_value)} ${s(item.music_search_terms) ? '- ' + s(item.music_search_terms) : ''}`} />
          <BriefField label="Subtitles" value={s(item.subtitle_style)} />
        </div>
      )} />}
      {inProgress.length > 0 && <StatusGroup label="In Progress" color="amber" items={inProgress} stage="editing" onUpdate={onItemUpdate} />}
      {submitted.length > 0 && <StatusGroup label="Submitted for Review" color="purple" items={submitted} stage="editing" onUpdate={onItemUpdate} />}
      {waiting.length > 0 && <StatusGroup label="Waiting for Footage" color="gray" items={waiting} stage="editing" onUpdate={onItemUpdate} collapsed />}
      {done.length > 0 && <StatusGroup label="Done" color="green" items={done} stage="editing" onUpdate={onItemUpdate} collapsed />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Designer View
// ---------------------------------------------------------------------------

function DesignerView({ items, onItemUpdate }: { items: ContentItem[]; onItemUpdate?: (id: string, f: string, v: string) => void }) {
  const notStarted = items.filter((i) => s(i.design_status) === 'not_started')
  const inProgress = items.filter((i) => s(i.design_status) === 'in_progress')
  const submitted = items.filter((i) => s(i.design_status) === 'draft_ready')
  const done = items.filter((i) => s(i.design_status) === 'approved')

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 text-[10px]">
        <Palette className="w-4 h-4 text-ink-3" /><span className="text-sm font-bold text-ink">Designer</span>
        {notStarted.length > 0 && <span className="text-ink-3 font-semibold">{notStarted.length} not started</span>}
        {inProgress.length > 0 && <span className="text-amber-600 font-semibold">{inProgress.length} in progress</span>}
      </div>
      {notStarted.length > 0 && <StatusGroup label="Not Started" color="gray" items={notStarted} stage="design" onUpdate={onItemUpdate} renderExtra={(item) => (
        <div className="space-y-2">
          {!!item.headline_text && <div className="bg-brand-tint/30 rounded-lg p-2 border-l-[3px] border-l-brand"><p className="text-sm font-semibold text-ink">{s(item.headline_text)}</p>{!!item.supporting_text && <p className="text-xs text-ink-3 mt-1">{s(item.supporting_text)}</p>}</div>}
          {!!item.cover_headline && <div className="bg-brand-tint/30 rounded-lg p-2 border-l-[3px] border-l-brand"><p className="text-sm font-semibold text-ink">{s(item.cover_headline)}</p></div>}
          <BriefField label="Mood" value={(item.mood_tags as string[])?.[0] ?? ''} /><BriefField label="Colors" value={s(item.color_preference)} /><BriefField label="Photo direction" value={s(item.photo_direction)} />
        </div>
      )} />}
      {inProgress.length > 0 && <StatusGroup label="In Progress" color="amber" items={inProgress} stage="design" onUpdate={onItemUpdate} />}
      {submitted.length > 0 && <StatusGroup label="Submitted" color="purple" items={submitted} stage="design" onUpdate={onItemUpdate} />}
      {done.length > 0 && <StatusGroup label="Done" color="green" items={done} stage="design" onUpdate={onItemUpdate} collapsed />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Copywriter View
// ---------------------------------------------------------------------------

function CopywriterView({ items, onItemUpdate }: { items: ContentItem[]; onItemUpdate?: (id: string, f: string, v: string) => void }) {
  const needsCaption = items.filter((i) => !s(i.caption))
  const drafted = items.filter((i) => !!s(i.caption) && s(i.caption_status) !== 'approved')
  const approved = items.filter((i) => s(i.caption_status) === 'approved')

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 text-[10px]">
        <Pen className="w-4 h-4 text-ink-3" /><span className="text-sm font-bold text-ink">Copywriter</span>
        {needsCaption.length > 0 && <span className="text-red-600 font-semibold">{needsCaption.length} needs caption</span>}
        {drafted.length > 0 && <span className="text-amber-600 font-semibold">{drafted.length} drafted</span>}
        {approved.length > 0 && <span className="text-emerald-600 font-semibold">{approved.length} approved</span>}
      </div>
      {needsCaption.length > 0 && <StatusGroup label="Needs Caption" color="red" items={needsCaption} stage="caption" onUpdate={onItemUpdate} renderExtra={(item) => (
        <div className="space-y-2">
          <BriefField label="Concept" value={s(item.concept_description)} />
          {!!(item.hook || item.audio_hook) && <BriefField label="Hook (context)" value={s(item.audio_hook || item.hook)} />}
          <BriefField label="CTA" value={s(item.cta_text)} />
          <p className="text-xs text-amber-600 italic">Caption not written yet</p>
        </div>
      )} />}
      {drafted.length > 0 && <StatusGroup label="Drafted" color="amber" items={drafted} stage="caption" onUpdate={onItemUpdate} renderExtra={(item) => (
        <div><pre className="text-xs text-ink-2 whitespace-pre-wrap bg-bg-2 rounded-lg p-2">{s(item.caption)}</pre><span className="text-[9px] text-ink-4">{s(item.caption).length} chars</span></div>
      )} />}
      {approved.length > 0 && <StatusGroup label="Approved" color="green" items={approved} stage="caption" onUpdate={onItemUpdate} collapsed />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Status Group
// ---------------------------------------------------------------------------

function StatusGroup({ label, color, items, stage, onUpdate, renderExtra, collapsed: defaultCollapsed }: {
  label: string; color: string; items: ContentItem[]; stage: string
  onUpdate?: (id: string, f: string, v: string) => void
  renderExtra?: (item: ContentItem) => React.ReactNode; collapsed?: boolean
}) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed ?? false)
  const borderColors: Record<string, string> = { red: 'border-l-red-400', blue: 'border-l-blue-400', amber: 'border-l-amber-400', purple: 'border-l-purple-400', green: 'border-l-emerald-400', gray: 'border-l-ink-5' }

  return (
    <div className={`border-l-[3px] ${borderColors[color] ?? borderColors.gray} pl-3`}>
      <button onClick={() => setIsCollapsed(!isCollapsed)} className="flex items-center gap-2 mb-2 w-full text-left">
        {isCollapsed ? <ChevronRight className="w-3 h-3 text-ink-4" /> : <ChevronDown className="w-3 h-3 text-ink-4" />}
        <span className="text-[10px] font-bold text-ink-3 uppercase tracking-wider">{label} — {items.length}</span>
      </button>
      {!isCollapsed && (
        <div className="space-y-3">
          {items.map((item) => (
            <TaskCard key={s(item.id)} item={item} stage={stage} onUpdate={onUpdate}>
              {renderExtra?.(item)}
            </TaskCard>
          ))}
        </div>
      )}
    </div>
  )
}

function subtractBizDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00'); let r = days
  while (r > 0) { d.setDate(d.getDate() - 1); if (d.getDay() !== 0 && d.getDay() !== 6) r-- }
  return d.toISOString().split('T')[0]
}
