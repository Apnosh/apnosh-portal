'use client'

import { useState } from 'react'
import { FormSection, Field, ChipSelect, ChipMulti } from './shared'

// Re-export shared components for backward compat with other forms
export { FormSection, Field, ChipSelect, ChipMulti } from './shared'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

interface ReelFormProps {
  data: Record<string, unknown>
  onSave: (field: string, value: unknown) => void
  defaults?: Record<string, unknown>
}

const FRAMEWORKS = [
  { value: 'behind_the_scenes', label: 'Behind the scenes', desc: 'Show the process, reveal what most people never see' },
  { value: 'myth_buster', label: 'Myth buster', desc: 'Challenge a common belief, show why it\'s wrong' },
  { value: 'listicle', label: 'Listicle / Tips', desc: 'X things about a topic — high save rate format' },
  { value: 'transformation', label: 'Transformation', desc: 'Before → process → after' },
  { value: 'story', label: 'Story', desc: 'Narrative arc — moment, buildup, emotional takeaway' },
  { value: 'hot_take', label: 'Hot take', desc: 'Surprising opinion, back it up, invite debate' },
  { value: 'tutorial', label: 'Tutorial', desc: 'How to do something step by step' },
  { value: 'free_form', label: 'Free-form', desc: 'No template — write from scratch' },
]
const LENGTHS = ['15-30s', '30-45s', '45-60s', '60-90s']
const CTAS = ['Order now', 'Visit us', 'DM to book', 'Link in bio', 'Learn more', 'Call us', 'No CTA']
const CTA_PH: Record<string, string> = { 'Order now': 'e.g., Order at [website] — link in bio', 'Visit us': 'e.g., Come by this weekend', 'DM to book': 'e.g., DM us \'BOOK\'', 'Link in bio': 'e.g., Full recipe at the link in our bio', 'Learn more': 'e.g., Follow for more tips', 'Call us': 'e.g., Call [phone]' }
const FOOTAGE = [{ v: 'apnosh_films', l: 'We film it' }, { v: 'client_provides', l: 'Client provides' }, { v: 'ugc_style', l: 'UGC style' }, { v: 'animation', l: 'Animation' }, { v: 'stock', l: 'Stock footage' }]
const EDIT_STYLES = [
  { v: 'fast_cuts', l: 'Fast cuts', d: 'Quick transitions, high energy' }, { v: 'cinematic', l: 'Cinematic', d: 'Smooth movements, polished' },
  { v: 'raw', l: 'Raw / authentic', d: 'Minimal editing, natural feel' }, { v: 'text_driven', l: 'Text-driven', d: 'Heavy text overlays carry the story' },
  { v: 'montage', l: 'Montage', d: 'Clips assembled to music' }, { v: 'custom', l: 'Custom', d: '' },
]
const MUSIC_FEELS = ['Upbeat & energetic', 'Chill & relaxed', 'Trending audio', 'Cinematic / epic', 'Acoustic / warm', 'Electronic / modern', 'Custom']
const MUSIC_OWNERS = ['We pick', 'Client provides', 'No music']
const SUBS = ['Bold centered', 'Bottom-third', 'Animated word-by-word', 'No subtitles', 'Custom']
const ADAPT = [{ v: 'feed_4x5', l: 'Feed (4:5)' }, { v: 'square_1x1', l: 'Square (1:1)' }, { v: 'none', l: 'No adaptation' }]

type Beat = { beat_number: number; visual: string; audio_text: string; onscreen_text?: string; direction_note?: string }

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ReelForm({ data, onSave, defaults }: ReelFormProps) {
  const s = (f: string) => data[f] as string ?? ''
  const a = (f: string) => (data[f] as string[]) ?? []
  const [showBRoll, setShowBRoll] = useState(((data.b_roll as unknown[]) ?? []).length > 0)
  const [showEquip, setShowEquip] = useState(!!data.equipment_notes)
  const [showPersist, setShowPersist] = useState(!!data.persistent_screen_elements)

  const filming = !['client_provides', 'animation', 'stock'].includes(s('footage_source'))
  const fw = FRAMEWORKS.find((f) => f.value === s('script_framework'))
  const freeForm = s('script_framework') === 'free_form'
  const editStyle = EDIT_STYLES.find((e) => e.v === s('editing_style_value'))
  const cta = a('call_to_action')[0] ?? ''
  const beats = (data.script_beats as Beat[]) ?? []
  const bRoll = (data.b_roll as Array<{ description: string }>) ?? []
  const gd = (f: string): string => (defaults?.[`default_${f}`] as string) ?? ''

  return (
    <div className="space-y-6">
      {/* THE CONCEPT */}
      <FormSection title="The Concept">
        <Field label="Main message" value={s('concept_description')} onChange={(v) => onSave('concept_description', v)} placeholder="What is this reel about and why does it matter?" multiline rows={3} />
        <div>
          <label className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider block mb-1.5">Script Framework</label>
          <div className="flex flex-wrap gap-1.5">{FRAMEWORKS.map((f) => (<button key={f.value} onClick={() => onSave('script_framework', f.value)} className={`text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors ${s('script_framework') === f.value ? 'bg-ink text-white border-ink' : 'border-ink-6 text-ink-3 hover:border-ink-5'}`}>{f.label}</button>))}</div>
          {fw && <p className="text-[10px] text-ink-4 mt-1.5">{fw.desc}</p>}
        </div>
        <div className="space-y-2">
          <p className="text-[9px] text-ink-4 font-medium">The hook must land within the first 2 seconds.</p>
          <div><label className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider block mb-1">Visual Hook — what they see first</label><input value={s('visual_hook')} onChange={(e) => onSave('visual_hook', e.target.value)} placeholder="e.g., Close-up of sizzling pan, steam rising" className="w-full text-base font-medium text-ink border-l-[3px] border-l-brand border border-ink-6 rounded-lg px-4 py-3 bg-brand-tint/30 focus:outline-none focus:ring-2 focus:ring-brand/30" /></div>
          <div><label className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider block mb-1">Text/Audio Hook — what they hear or read</label><input value={s('audio_hook') || s('hook')} onChange={(e) => onSave('audio_hook', e.target.value)} placeholder="e.g., This is what 4am looks like at our restaurant" className="w-full text-base font-medium text-ink border-l-[3px] border-l-brand border border-ink-6 rounded-lg px-4 py-3 bg-brand-tint/30 focus:outline-none focus:ring-2 focus:ring-brand/30" /></div>
        </div>
        <ChipSelect label="Video length" options={LENGTHS} value={s('estimated_duration')} onChange={(v) => onSave('estimated_duration', v)} />
        <div className="space-y-2">
          <ChipMulti label="Call to action" options={CTAS} value={a('call_to_action')} onChange={(v) => onSave('call_to_action', v)} />
          {cta && cta !== 'No CTA' && <Field label="CTA as it appears" value={s('cta_text')} onChange={(v) => onSave('cta_text', v)} placeholder={CTA_PH[cta] ?? 'Specific wording'} />}
        </div>
      </FormSection>

      {/* CREATIVE DIRECTION */}
      <FormSection title="Creative Direction" subtitle="The emotional and strategic intent">
        <Field label="How should the viewer feel after watching?" value={s('emotional_target')} onChange={(v) => onSave('emotional_target', v)} placeholder="The gut reaction — e.g., 'I need to try this before summer's over'" multiline rows={2} />
        <Field label="Who is this video specifically for?" value={s('target_audience_specific')} onChange={(v) => onSave('target_audience_specific', v)} placeholder="Narrow the audience — e.g., Boba lovers 18-30 in Seattle" />
        <Field label="Why does this video matter?" value={s('strategic_context')} onChange={(v) => onSave('strategic_context', v)} placeholder="The business reason — e.g., Positions them as a drink destination" multiline rows={2} />
      </FormSection>

      {/* THE SCRIPT — enhanced beats */}
      <FormSection title="The Script" subtitle="Video narrative">
        {freeForm || !s('script_framework') ? (
          <Field label="Script (free-form)" value={s('script')} onChange={(v) => onSave('script', v)} placeholder={"[HOOK]\nOpening\n\n[BODY]\nMain content\n\n[CTA]\nWhat they do next"} multiline rows={10} />
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-[9px] font-semibold text-ink-4 uppercase tracking-wider px-7"><span>Visual</span><span>Audio / Text</span></div>
            {beats.map((beat, i) => (<BeatEditor key={i} beat={beat} idx={i} beats={beats} onSave={onSave} />))}
            <button onClick={() => onSave('script_beats', [...beats, { beat_number: beats.length + 1, visual: '', audio_text: '', onscreen_text: '', direction_note: '' }])} className="text-xs font-medium text-brand hover:text-brand-dark ml-7">+ Add beat</button>
          </div>
        )}
      </FormSection>

      {/* THE CAPTION */}
      <FormSection title="The Caption" subtitle="Published with the post">
        <Field label="Caption" value={s('caption')} onChange={(v) => onSave('caption', v)} placeholder="Caption under the reel" multiline rows={4} charCount />
        <Field label="Hashtags" value={a('hashtags').join(' ')} onChange={(v) => onSave('hashtags', v.split(/\s+/).filter(Boolean))} placeholder="#seattlefood #restaurantmarketing" />
      </FormSection>

      {/* FOR THE VIDEOGRAPHER */}
      <FormSection title="For the Videographer" subtitle="Sent to filming team">
        <ChipSelect label="Footage source" options={FOOTAGE.map((f) => f.l)} value={FOOTAGE.find((f) => f.v === (s('footage_source') || gd('footage_source')))?.l ?? ''} onChange={(v) => onSave('footage_source', FOOTAGE.find((f) => f.l === v)?.v ?? v)} />
        {filming && (<>
          <Field label="Props & products" value={s('props') ? (data.props as string[]).join(', ') : ''} onChange={(v) => onSave('props', v.split(',').map((x) => x.trim()).filter(Boolean))} placeholder="Items needed on set" />
          <Field label="Location" value={s('location_notes')} onChange={(v) => onSave('location_notes', v)} placeholder="Where to film" />
          <Field label="Who's on camera?" value={s('who_on_camera')} onChange={(v) => onSave('who_on_camera', v)} placeholder="Names or roles" />
          {s('who_on_camera') && <Field label="Wardrobe / appearance" value={s('wardrobe_notes')} onChange={(v) => onSave('wardrobe_notes', v)} placeholder="What should they wear?" />}
          <div className="grid grid-cols-2 gap-3"><Field label="Shoot date" value={s('shoot_date')} onChange={(v) => onSave('shoot_date', v)} type="date" /><div className="flex items-center gap-2 pt-5"><input type="checkbox" checked={data.shoot_flexible as boolean ?? true} onChange={(e) => onSave('shoot_flexible', e.target.checked)} className="rounded border-ink-5 text-brand focus:ring-brand/30" /><span className="text-xs text-ink-2">Flexible</span></div></div>
          <Field label="Reference link" value={s('reference_link')} onChange={(v) => onSave('reference_link', v)} placeholder="Link to inspiration video" />
          <Field label="Reference search" value={s('reference_search_videographer')} onChange={(v) => onSave('reference_search_videographer', v)} placeholder="Search TikTok: '[term]' — study how they [aspect]" multiline rows={2} />
          {!showBRoll ? <button onClick={() => setShowBRoll(true)} className="text-xs text-brand font-medium">+ Add B-roll ideas</button> : (
            <div><label className="text-[10px] text-ink-4 block mb-1">B-roll & additional shots</label><div className="space-y-1.5">{bRoll.map((item, i) => (<div key={i} className="flex items-center gap-2 group"><input value={item.description} onChange={(e) => { const u = [...bRoll]; u[i] = { description: e.target.value }; onSave('b_roll', u) }} placeholder="Extra footage" className="flex-1 text-sm border border-ink-6 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand/30" /><button onClick={() => onSave('b_roll', bRoll.filter((_, j) => j !== i))} className="text-ink-4 hover:text-red-500 opacity-0 group-hover:opacity-100">✕</button></div>))}<button onClick={() => onSave('b_roll', [...bRoll, { description: '' }])} className="text-xs text-brand">+ Add</button></div></div>
          )}
          {!showEquip ? <button onClick={() => setShowEquip(true)} className="text-xs text-brand font-medium">+ Equipment notes</button> : <Field label="Equipment / setup notes" value={s('equipment_notes')} onChange={(v) => onSave('equipment_notes', v)} placeholder="Special equipment?" />}
        </>)}
      </FormSection>

      {/* FOR THE EDITOR */}
      <FormSection title="For the Editor" subtitle="Sent to post-production">
        <div><label className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider block mb-1.5">Editing style</label><div className="flex flex-wrap gap-1.5">{EDIT_STYLES.map((e) => (<button key={e.v} onClick={() => onSave('editing_style_value', e.v)} className={`text-[11px] font-medium px-3 py-1.5 rounded-lg border transition-colors ${(s('editing_style_value') || gd('editing_style')) === e.v ? 'bg-ink text-white border-ink' : 'border-ink-6 text-ink-3 hover:border-ink-5'}`}>{e.l}</button>))}</div>{editStyle?.d && <p className="text-[10px] text-ink-4 mt-1.5">{editStyle.d}</p>}{s('editing_style_value') === 'custom' && <Field label="" value={s('editing_style_custom')} onChange={(v) => onSave('editing_style_custom', v)} placeholder="Describe style..." />}</div>
        <Field label="Transitions" value={s('transition_notes')} onChange={(v) => onSave('transition_notes', v)} placeholder="e.g., Clean cuts throughout, soft dissolve between hook and beauty shot" />
        <div>
          <ChipSelect label="Music" options={MUSIC_OWNERS} value={s('music_owner') || 'We pick'} onChange={(v) => onSave('music_owner', v)} />
          {s('music_owner') !== 'No music' && s('music_owner') !== 'Client provides' && (<>
            <div className="mt-3"><ChipSelect label="Music feel" options={MUSIC_FEELS} value={s('music_feel_value') || gd('music_feel')} onChange={(v) => onSave('music_feel_value', v)} /></div>
            <div className="mt-2"><Field label="Music search terms" value={s('music_search_terms')} onChange={(v) => onSave('music_search_terms', v)} placeholder="CapCut/Epidemic Sound terms — e.g., 'warm summer lo-fi'" /></div>
          </>)}
        </div>
        <ChipSelect label="Subtitles" options={SUBS} value={s('subtitle_style') || 'Bold centered'} onChange={(v) => onSave('subtitle_style', v)} />
        <div><label className="text-[10px] text-ink-4 block mb-1.5">Also adapt for</label><div className="flex flex-wrap gap-1.5">{ADAPT.map((f) => (<button key={f.v} onClick={() => { const c = a('adapt_formats'); onSave('adapt_formats', c.includes(f.v) ? c.filter((x) => x !== f.v) : [...c, f.v]) }} className={`text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors ${a('adapt_formats').includes(f.v) ? 'bg-brand-tint border-brand/30 text-brand-dark' : 'border-ink-6 text-ink-3 hover:border-ink-5'}`}>{f.l}</button>))}</div></div>
        {!showPersist ? <button onClick={() => setShowPersist(true)} className="text-xs text-brand font-medium">+ Persistent on-screen elements</button> : <Field label="Always on screen" value={s('persistent_screen_elements')} onChange={(v) => onSave('persistent_screen_elements', v)} placeholder="e.g., @handle watermark, 'Limited time' banner" />}
        <Field label="Pacing notes (optional)" value={s('pacing_notes')} onChange={(v) => onSave('pacing_notes', v)} placeholder="e.g., slow reveal on product, quick cuts during prep" multiline rows={2} />
        <Field label="Cover frame" value={s('cover_frame')} onChange={(v) => onSave('cover_frame', v)} placeholder="What frame for the grid thumbnail?" />
        <Field label="Editing reference link" value={s('editing_reference_link')} onChange={(v) => onSave('editing_reference_link', v)} placeholder="Link to a video with the style you want" />
        <Field label="Reference search (editor)" value={s('reference_search_editor')} onChange={(v) => onSave('reference_search_editor', v)} placeholder="Search TikTok: '[term]' — study how they [pacing/style]" multiline rows={2} />
      </FormSection>

      {/* METADATA */}
      <FormSection title="Metadata" subtitle="Organizational">
        <ChipSelect label="Category" options={['Promotion', 'Product', 'Event', 'Seasonal', 'Educational', 'Testimonial', 'Behind the Scenes', 'Brand', 'Other']} value={s('content_category')} onChange={(v) => onSave('content_category', v)} />
      </FormSection>

      {/* SCHEDULING */}
      <FormSection title="Scheduling & Notes" subtitle="Internal">
        <div className="grid grid-cols-2 gap-3"><Field label="Publish date" value={s('scheduled_date')} onChange={(v) => onSave('scheduled_date', v)} type="date" /><ChipSelect label="Urgency" options={['Flexible', 'Standard', 'Urgent']} value={s('urgency') || 'Standard'} onChange={(v) => onSave('urgency', v.toLowerCase())} /></div>
        <Field label="Internal notes" value={s('internal_note')} onChange={(v) => onSave('internal_note', v)} placeholder="Notes for the team" multiline rows={2} />
        <Field label="What to avoid" value={s('avoid_text')} onChange={(v) => onSave('avoid_text', v)} placeholder="Topics, styles, or references to avoid" multiline rows={2} />
      </FormSection>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Beat Editor — enhanced with on-screen text + creative direction note
// ---------------------------------------------------------------------------

function BeatEditor({ beat, idx, beats, onSave }: { beat: Beat; idx: number; beats: Beat[]; onSave: (f: string, v: unknown) => void }) {
  const [showExtras, setShowExtras] = useState(!!(beat.onscreen_text || beat.direction_note))
  const upd = (field: string, value: string) => { const u = [...beats]; u[idx] = { ...u[idx], [field]: value }; onSave('script_beats', u) }

  return (
    <div className="group">
      <div className="flex items-start gap-2">
        <span className="text-[10px] font-bold text-ink-3 w-5 pt-2 text-right flex-shrink-0">#{beat.beat_number}</span>
        <input value={beat.visual} onChange={(e) => upd('visual', e.target.value)} placeholder="What the viewer sees" className="flex-1 text-sm border border-ink-6 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand/30" />
        <input value={beat.audio_text} onChange={(e) => upd('audio_text', e.target.value)} placeholder="Voiceover, dialogue, or text" className="flex-1 text-sm border border-ink-6 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand/30" />
        <button onClick={() => onSave('script_beats', beats.filter((_, j) => j !== idx).map((b, j) => ({ ...b, beat_number: j + 1 })))} className="text-ink-4 hover:text-red-500 pt-2 opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
      </div>
      {!showExtras ? (
        <div className="flex gap-2 ml-7 mt-1">
          <button onClick={() => setShowExtras(true)} className="text-[9px] text-brand font-medium">+ Text overlay</button>
          <button onClick={() => setShowExtras(true)} className="text-[9px] text-brand font-medium">+ Creative note</button>
        </div>
      ) : (
        <div className="ml-7 mt-1.5 space-y-1.5">
          <input value={beat.onscreen_text ?? ''} onChange={(e) => upd('onscreen_text', e.target.value)} placeholder="On-screen text for this beat" className="w-full text-xs border border-ink-6 rounded px-2.5 py-1 bg-amber-50/50 focus:outline-none focus:ring-1 focus:ring-brand/30" />
          <textarea value={beat.direction_note ?? ''} onChange={(e) => upd('direction_note', e.target.value)} placeholder="Creative direction — why this beat matters, quality standards" rows={2} className="w-full text-xs border border-ink-6 rounded px-2.5 py-1 bg-blue-50/50 resize-none focus:outline-none focus:ring-1 focus:ring-brand/30" />
        </div>
      )}
    </div>
  )
}

// Legacy export for backward compat
export function DynamicList({ label, items, onChange, placeholder }: {
  label: string; items: Array<{ shot_number: number; description: string }>; onChange: (v: Array<{ shot_number: number; description: string }>) => void; placeholder?: string
}) {
  return (
    <div>
      <label className="text-[10px] text-ink-4 block mb-1.5">{label}</label>
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="text-xs font-bold text-ink-3 w-5 pt-2 text-right flex-shrink-0">#{item.shot_number}</span>
            <input value={item.description} onChange={(e) => { const u = [...items]; u[i] = { ...u[i], description: e.target.value }; onChange(u) }} placeholder={placeholder} className="flex-1 text-sm border border-ink-6 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand/30" />
            <button onClick={() => onChange(items.filter((_, j) => j !== i).map((s, j) => ({ ...s, shot_number: j + 1 })))} className="text-ink-4 hover:text-red-500 pt-2 text-xs">✕</button>
          </div>
        ))}
        <button onClick={() => onChange([...items, { shot_number: items.length + 1, description: '' }])} className="text-xs font-medium text-brand hover:text-brand-dark">+ Add</button>
      </div>
    </div>
  )
}
