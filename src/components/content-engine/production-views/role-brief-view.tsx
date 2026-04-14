'use client'

import { Camera, Film, Palette, Pen, Clock, MapPin } from 'lucide-react'

interface ContentItem { [key: string]: unknown }

// Helper to safely get string values from unknown
const s = (val: unknown): string => (val as string) ?? ''

const TYPE_COLORS: Record<string, string> = {
  reel: 'bg-indigo-100 text-indigo-800', feed_post: 'bg-cyan-100 text-cyan-800',
  carousel: 'bg-pink-100 text-pink-800', story: 'bg-amber-100 text-amber-800',
}

type RoleFilter = 'videographer' | 'editor' | 'designer' | 'copywriter'

interface RoleBriefViewProps {
  items: ContentItem[]
  role: RoleFilter
}

export default function RoleBriefView({ items, role }: RoleBriefViewProps) {
  // Filter items based on role
  const filtered = items.filter((item) => {
    const type = s(item.content_type)
    if (role === 'videographer') return ['reel', 'video', 'short_form_video'].includes(type) && !['client_provides', 'animation', 'stock'].includes(s(item.footage_source))
    if (role === 'editor') return ['reel', 'video', 'short_form_video'].includes(type)
    if (role === 'designer') return ['feed_post', 'static_post', 'carousel'].includes(type) || !!(item.cover_frame)
    if (role === 'copywriter') return true // all items need captions
    return true
  })

  if (filtered.length === 0) {
    return <div className="text-center py-12 text-sm text-ink-3">No items for this role in the current plan.</div>
  }

  // Videographer: group by shoot date / session
  if (role === 'videographer') {
    // Master prop list
    const allProps = new Set<string>()
    filtered.forEach((item) => {
      const props = (item.props as string[]) ?? []
      props.forEach((p) => allProps.add(p))
    })

    return (
      <div className="space-y-4">
        {/* Filming summary */}
        <div className="bg-white rounded-xl border border-ink-6 p-4">
          <h3 className="text-xs font-bold text-ink mb-2">{filtered.length} videos to film</h3>
          <p className="text-[10px] text-ink-3">Estimated shoot time: ~{Math.ceil(filtered.length * 0.6)} hours</p>
          {allProps.size > 0 && (
            <div className="mt-3">
              <label className="text-[9px] font-semibold text-ink-3 uppercase tracking-wider block mb-1">Master prop list</label>
              <div className="flex flex-wrap gap-1">{[...allProps].map((p) => (<span key={p} className="text-[10px] bg-bg-2 text-ink-2 px-2 py-0.5 rounded">{p}</span>))}</div>
            </div>
          )}
        </div>
        {filtered.map((item) => <VideographerBrief key={s(item.id)} item={item} />)}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {filtered.map((item) => (
        <div key={s(item.id)} className="bg-white rounded-xl border border-ink-6 p-4">
          {/* Common header */}
          <div className="flex items-center gap-2 mb-3">
            <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${TYPE_COLORS[s(item.content_type)] ?? 'bg-ink-6 text-ink-3'}`}>
              {s(item.content_type).replace(/_/g, ' ')}
            </span>
            <h3 className="text-sm font-semibold text-ink">{s(item.concept_title)}</h3>
          </div>
          {!!item.concept_description && <p className="text-xs text-ink-3 mb-3">{s(item.concept_description)}</p>}

          {/* Role-specific fields */}
          {role === 'editor' && <EditorFields item={item} />}
          {role === 'designer' && <DesignerFields item={item} />}
          {role === 'copywriter' && <CopywriterFields item={item} />}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Videographer Brief
// ---------------------------------------------------------------------------

function VideographerBrief({ item }: { item: ContentItem }) {
  const beats = (item.script_beats as Array<{ beat_number: number; visual: string; audio_text: string }>) ?? []

  return (
    <div className="bg-white rounded-xl border border-ink-6 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="bg-indigo-100 text-indigo-800 text-[9px] font-semibold px-1.5 py-0.5 rounded">Reel</span>
        <h3 className="text-sm font-semibold text-ink">{s(item.concept_title)}</h3>
        {!!item.estimated_duration && <span className="text-[10px] text-ink-3">({s(item.estimated_duration)})</span>}
      </div>
      {!!item.concept_description && <p className="text-xs text-ink-3">{s(item.concept_description)}</p>}
      {!!item.script_framework && <span className="text-[9px] font-medium text-ink-4 bg-bg-2 px-2 py-0.5 rounded capitalize">{s(item.script_framework).replace(/_/g, ' ')}</span>}

      {/* Hooks */}
      {!!(item.visual_hook || item.audio_hook || item.hook) && (
        <div className="bg-brand-tint/30 rounded-lg p-3 border-l-[3px] border-l-brand">
          {!!item.visual_hook && <p className="text-xs font-medium text-ink"><strong className="text-ink-3">Visual:</strong> {s(item.visual_hook)}</p>}
          {!!(item.audio_hook || item.hook) && <p className="text-xs font-medium text-ink"><strong className="text-ink-3">Audio:</strong> {s(item.audio_hook || item.hook)}</p>}
        </div>
      )}

      {/* Script beats — visual column prominent */}
      {beats.length > 0 && (
        <div>
          <label className="text-[9px] font-semibold text-ink-3 uppercase tracking-wider block mb-1">Script beats</label>
          <div className="space-y-1">
            {beats.map((b) => (
              <div key={b.beat_number} className="flex gap-2 text-xs">
                <span className="font-bold text-ink-3 w-4 text-right flex-shrink-0">#{b.beat_number}</span>
                <span className="font-medium text-ink flex-1">{b.visual}</span>
                <span className="text-ink-4 flex-1">{b.audio_text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filming details */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        {!!item.who_on_camera && <BriefField icon={<Camera className="w-3 h-3" />} label="On camera" value={s(item.who_on_camera)} />}
        {!!item.wardrobe_notes && <BriefField label="Wardrobe" value={s(item.wardrobe_notes)} />}
        {!!item.location_notes && <BriefField icon={<MapPin className="w-3 h-3" />} label="Location" value={s(item.location_notes)} />}
        {!!item.shoot_date && <BriefField icon={<Clock className="w-3 h-3" />} label="Shoot date" value={`${s(item.shoot_date)}${item.shoot_flexible ? ' (flexible)' : ''}`} />}
      </div>
      {(item.props as string[])?.length > 0 && <BriefField label="Props" value={(item.props as string[]).join(', ')} />}
      {(item.b_roll as Array<{description: string}>)?.length > 0 && (
        <div><label className="text-[9px] text-ink-4 block mb-0.5">B-roll</label>{(item.b_roll as Array<{description: string}>).map((b, i) => (<p key={i} className="text-xs text-ink-2">• {b.description}</p>))}</div>
      )}
      {!!item.equipment_notes && <BriefField label="Equipment" value={s(item.equipment_notes)} />}
      {!!item.reference_link && <BriefField label="Reference" value={s(item.reference_link)} />}
      {!!item.editing_style_value && <BriefField label="Editing style (context)" value={s(item.editing_style_value).replace(/_/g, ' ')} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Editor Fields
// ---------------------------------------------------------------------------

function EditorFields({ item }: { item: ContentItem }) {
  const beats = (item.script_beats as Array<{ beat_number: number; visual: string; audio_text: string; onscreen_text?: string; direction_note?: string }>) ?? []

  return (
    <div className="space-y-3">
      {!!(item.visual_hook || item.audio_hook || item.hook) && (
        <div className="bg-brand-tint/30 rounded-lg p-3 border-l-[3px] border-l-brand">
          {!!item.visual_hook && <p className="text-xs"><strong>Visual:</strong> {s(item.visual_hook)}</p>}
          {!!(item.audio_hook || item.hook) && <p className="text-xs"><strong>Audio:</strong> {s(item.audio_hook || item.hook)}</p>}
        </div>
      )}
      {beats.length > 0 && (
        <div>
          <label className="text-[9px] font-semibold text-ink-3 uppercase tracking-wider block mb-1">Script</label>
          {beats.map((b) => (
            <div key={b.beat_number} className="mb-2">
              <div className="flex gap-2 text-xs"><span className="font-bold text-ink-3 w-4">#{b.beat_number}</span><span className="text-ink flex-1">{b.visual}</span><span className="text-ink flex-1">{b.audio_text}</span></div>
              {b.onscreen_text && <p className="text-[10px] text-amber-700 ml-6 mt-0.5">Text: {b.onscreen_text}</p>}
              {b.direction_note && <p className="text-[10px] text-blue-600 ml-6 mt-0.5 italic">{b.direction_note}</p>}
            </div>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 text-xs">
        {!!item.editing_style_value && <BriefField label="Style" value={s(item.editing_style_value).replace(/_/g, ' ')} />}
        {!!item.transition_notes && <BriefField label="Transitions" value={s(item.transition_notes)} />}
        {!!item.music_owner && <BriefField label="Music" value={s(item.music_owner)} />}
        {!!item.music_feel_value && <BriefField label="Music feel" value={s(item.music_feel_value)} />}
        {!!item.music_search_terms && <BriefField label="Search terms" value={s(item.music_search_terms)} />}
        {!!item.subtitle_style && <BriefField label="Subtitles" value={s(item.subtitle_style)} />}
        {!!item.pacing_notes && <BriefField label="Pacing" value={s(item.pacing_notes)} />}
        {!!item.cover_frame && <BriefField label="Cover frame" value={s(item.cover_frame)} />}
        {!!item.estimated_duration && <BriefField label="Duration" value={s(item.estimated_duration)} />}
      </div>
      {!!item.editing_reference_link && <BriefField label="Reference" value={s(item.editing_reference_link)} />}
      {!!item.reference_search_editor && <BriefField label="Reference search" value={s(item.reference_search_editor)} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Designer Fields
// ---------------------------------------------------------------------------

function DesignerFields({ item }: { item: ContentItem }) {
  const slides = (item.carousel_slides as Array<{ slide_number: number; headline: string; body_text?: string }>) ?? []
  const isCarousel = item.content_type === 'carousel'

  return (
    <div className="space-y-3">
      {!!item.headline_text && (
        <div className="bg-brand-tint/30 rounded-lg p-3 border-l-[3px] border-l-brand">
          <p className="text-sm font-semibold text-ink">{s(item.headline_text)}</p>
          {!!item.supporting_text && <p className="text-xs text-ink-3 mt-1">{s(item.supporting_text)}</p>}
        </div>
      )}
      {isCarousel && !!item.cover_headline && (
        <div className="bg-brand-tint/30 rounded-lg p-3 border-l-[3px] border-l-brand">
          <p className="text-sm font-semibold text-ink">{s(item.cover_headline)}</p>
          {!!item.cover_subheadline && <p className="text-xs text-ink-3 mt-1">{s(item.cover_subheadline)}</p>}
        </div>
      )}
      {isCarousel && slides.length > 0 && (
        <div>
          <label className="text-[9px] font-semibold text-ink-3 uppercase tracking-wider block mb-1">Slides</label>
          {slides.map((sl) => (
            <div key={sl.slide_number} className="flex gap-2 text-xs mb-1">
              <span className="font-bold text-ink-3 w-4">{sl.slide_number}</span>
              <span className="text-ink">{sl.headline}</span>
              {sl.body_text && <span className="text-ink-3">&mdash; {sl.body_text}</span>}
            </div>
          ))}
        </div>
      )}
      {!!item.carousel_flow && <BriefField label="Visual flow" value={s(item.carousel_flow)} />}
      {!!item.photo_direction && <BriefField label="Photo direction" value={s(item.photo_direction)} />}
      <div className="grid grid-cols-2 gap-2 text-xs">
        {!!item.placement && <BriefField label="Placement" value={s(item.placement)} />}
        {(item.mood_tags as string[])?.length > 0 && <BriefField label="Mood" value={(item.mood_tags as string[])[0]} />}
        {!!item.color_preference && <BriefField label="Colors" value={s(item.color_preference)} />}
      </div>
      {!!item.editor_notes && <BriefField label="Designer notes" value={s(item.editor_notes)} />}
      {!!item.reference_link && <BriefField label="Reference" value={s(item.reference_link)} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Copywriter Fields
// ---------------------------------------------------------------------------

function CopywriterFields({ item }: { item: ContentItem }) {
  const captionStr = s(item.caption)
  return (
    <div className="space-y-3">
      {!!(item.hook || item.audio_hook) && <BriefField label="Hook (context)" value={s(item.audio_hook || item.hook)} />}
      {!!item.caption && (
        <div>
          <label className="text-[9px] font-semibold text-ink-3 uppercase tracking-wider block mb-1">Caption</label>
          <pre className="text-xs text-ink-2 whitespace-pre-wrap bg-bg-2 rounded-lg p-3">{captionStr}</pre>
          <span className="text-[9px] text-ink-4">{captionStr.length} chars</span>
        </div>
      )}
      {(item.hashtags as string[])?.length > 0 && <BriefField label="Hashtags" value={(item.hashtags as string[]).join(' ')} />}
      {!!item.cta_text && <BriefField label="CTA" value={s(item.cta_text)} />}
      {!item.caption && <p className="text-xs text-amber-600 italic">Caption not written yet</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

function BriefField({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div>
      <label className="text-[9px] text-ink-4 flex items-center gap-1">{icon}{label}</label>
      <p className="text-xs text-ink-2">{value}</p>
    </div>
  )
}
