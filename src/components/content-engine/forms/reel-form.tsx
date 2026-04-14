'use client'

import { useState } from 'react'

// ---------------------------------------------------------------------------
// Types + constants
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
  { value: 'transformation', label: 'Transformation', desc: 'Before → process → after — let the visual tell the story' },
  { value: 'story', label: 'Story', desc: 'Start with a moment, build a narrative, land an emotional takeaway' },
  { value: 'hot_take', label: 'Hot take', desc: 'Lead with a surprising opinion, back it up, invite debate' },
  { value: 'tutorial', label: 'Tutorial', desc: 'How to do something step by step' },
  { value: 'free_form', label: 'Free-form', desc: 'No template — write the script from scratch' },
]

const LENGTHS = ['15-30s', '30-45s', '45-60s', '60-90s']
const CTAS = ['Order now', 'Visit us', 'DM to book', 'Link in bio', 'Learn more', 'Call us', 'No CTA']
const CTA_PLACEHOLDERS: Record<string, string> = {
  'Order now': 'e.g., Order at [website] — link in bio',
  'Visit us': 'e.g., Come by this weekend — we\'re at [address]',
  'DM to book': 'e.g., DM us \'BOOK\' to reserve your table',
  'Link in bio': 'e.g., Full recipe at the link in our bio',
  'Learn more': 'e.g., Follow for more tips like this every week',
  'Call us': 'e.g., Call [phone] to order — we deliver',
}
const FOOTAGE_SOURCES = [
  { value: 'apnosh_films', label: 'We film it' },
  { value: 'client_provides', label: 'Client provides' },
  { value: 'ugc_style', label: 'UGC style' },
  { value: 'animation', label: 'Animation' },
  { value: 'stock', label: 'Stock footage' },
]
const EDITING_STYLES = [
  { value: 'fast_cuts', label: 'Fast cuts', desc: 'Quick transitions, high energy' },
  { value: 'cinematic', label: 'Cinematic', desc: 'Smooth movements, polished feel' },
  { value: 'raw', label: 'Raw / authentic', desc: 'Minimal editing, natural feel' },
  { value: 'text_driven', label: 'Text-driven', desc: 'Heavy text overlays, text carries the story' },
  { value: 'montage', label: 'Montage', desc: 'Clips assembled to music' },
  { value: 'custom', label: 'Custom', desc: '' },
]
const MUSIC_FEELS = [
  'Upbeat & energetic', 'Chill & relaxed', 'Trending audio',
  'Cinematic / epic', 'Acoustic / warm', 'Electronic / modern', 'Custom',
]
const MUSIC_OWNERS = ['We pick', 'Client provides', 'No music']
const SUBTITLE_STYLES = ['Bold centered', 'Bottom-third', 'Animated word-by-word', 'No subtitles', 'Custom']
const ADAPT_FORMATS = [
  { value: 'feed_4x5', label: 'Feed crop (4:5)' },
  { value: 'square_1x1', label: 'Square (1:1)' },
  { value: 'none', label: 'No adaptation' },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ReelForm({ data, onSave, defaults }: ReelFormProps) {
  const s = (field: string) => data[field] as string ?? ''
  const a = (field: string) => (data[field] as string[]) ?? []
  const [showBRoll, setShowBRoll] = useState(((data.b_roll as unknown[]) ?? []).length > 0)
  const [showEquipment, setShowEquipment] = useState(!!data.equipment_notes)

  const showFilming = !['client_provides', 'animation', 'stock'].includes(s('footage_source'))
  const selectedFramework = FRAMEWORKS.find((f) => f.value === s('script_framework'))
  const isFreeForm = s('script_framework') === 'free_form'
  const selectedEditStyle = EDITING_STYLES.find((e) => e.value === s('editing_style_value'))
  const selectedCta = a('call_to_action')[0] ?? ''
  const beats = (data.script_beats as Array<{ beat_number: number; visual: string; audio_text: string }>) ?? []
  const bRoll = (data.b_roll as Array<{ description: string }>) ?? []

  const getDefault = (field: string): string => (defaults?.[`default_${field}`] as string) ?? ''

  return (
    <div className="space-y-6">
      {/* THE CONCEPT */}
      <FormSection title="The Concept">
        <Field label="Main message" value={s('concept_description')} onChange={(v) => onSave('concept_description', v)} placeholder="What is this reel about and why does it matter?" multiline rows={3} />

        {/* Framework selector */}
        <div>
          <label className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider block mb-1.5">Script Framework</label>
          <div className="flex flex-wrap gap-1.5">
            {FRAMEWORKS.map((f) => (
              <button key={f.value} onClick={() => onSave('script_framework', f.value)} className={`text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors ${s('script_framework') === f.value ? 'bg-ink text-white border-ink' : 'border-ink-6 text-ink-3 hover:border-ink-5'}`}>{f.label}</button>
            ))}
          </div>
          {selectedFramework && <p className="text-[10px] text-ink-4 mt-1.5">{selectedFramework.desc}</p>}
        </div>

        {/* Two-part hook */}
        <div className="space-y-2">
          <p className="text-[9px] text-ink-4 font-medium">The hook must land within the first 2 seconds. This is what stops the scroll.</p>
          <div>
            <label className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider block mb-1">Visual Hook — what they see first</label>
            <input value={s('visual_hook')} onChange={(e) => onSave('visual_hook', e.target.value)} placeholder="e.g., Close-up of sizzling pan, steam rising" className="w-full text-base font-medium text-ink border-l-[3px] border-l-brand border border-ink-6 rounded-lg px-4 py-3 bg-brand-tint/30 focus:outline-none focus:ring-2 focus:ring-brand/30" />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider block mb-1">Text/Audio Hook — what they hear or read</label>
            <input value={s('audio_hook') || s('hook')} onChange={(e) => onSave('audio_hook', e.target.value)} placeholder="e.g., This is what 4am looks like at our restaurant" className="w-full text-base font-medium text-ink border-l-[3px] border-l-brand border border-ink-6 rounded-lg px-4 py-3 bg-brand-tint/30 focus:outline-none focus:ring-2 focus:ring-brand/30" />
          </div>
        </div>

        <ChipSelect label="Video length" options={LENGTHS} value={s('estimated_duration')} onChange={(v) => onSave('estimated_duration', v)} />

        {/* CTA with contextual text */}
        <div className="space-y-2">
          <ChipMulti label="Call to action" options={CTAS} value={a('call_to_action')} onChange={(v) => onSave('call_to_action', v)} />
          {selectedCta && selectedCta !== 'No CTA' && (
            <Field label="CTA as it appears in the reel" value={s('cta_text')} onChange={(v) => onSave('cta_text', v)} placeholder={CTA_PLACEHOLDERS[selectedCta] ?? 'The specific CTA wording'} />
          )}
        </div>
      </FormSection>

      {/* THE SCRIPT */}
      <FormSection title="The Script" subtitle="Video narrative">
        {isFreeForm || !s('script_framework') ? (
          <Field label="Script (free-form)" value={s('script')} onChange={(v) => onSave('script', v)} placeholder={"[HOOK]\nYour opening\n\n[BODY]\nMain content\n\n[CTA]\nWhat you want them to do"} multiline rows={10} />
        ) : (
          <div className="space-y-2">
            <label className="text-[10px] text-ink-4 block">Each beat = what the viewer sees + what they hear/read</label>
            {beats.map((beat, i) => (
              <div key={i} className="flex items-start gap-2 group">
                <span className="text-[10px] font-bold text-ink-3 w-5 pt-2 text-right flex-shrink-0">#{beat.beat_number}</span>
                <input value={beat.visual} onChange={(e) => { const u = [...beats]; u[i] = { ...u[i], visual: e.target.value }; onSave('script_beats', u) }} placeholder="What the viewer sees" className="flex-1 text-sm border border-ink-6 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand/30" />
                <input value={beat.audio_text} onChange={(e) => { const u = [...beats]; u[i] = { ...u[i], audio_text: e.target.value }; onSave('script_beats', u) }} placeholder="Voiceover, dialogue, or text" className="flex-1 text-sm border border-ink-6 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand/30" />
                <button onClick={() => onSave('script_beats', beats.filter((_, j) => j !== i).map((b, j) => ({ ...b, beat_number: j + 1 })))} className="text-ink-4 hover:text-red-500 pt-2 opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
              </div>
            ))}
            <button onClick={() => onSave('script_beats', [...beats, { beat_number: beats.length + 1, visual: '', audio_text: '' }])} className="text-xs font-medium text-brand hover:text-brand-dark">+ Add beat</button>
          </div>
        )}
      </FormSection>

      {/* THE CAPTION */}
      <FormSection title="The Caption" subtitle="Published with the post">
        <Field label="Caption" value={s('caption')} onChange={(v) => onSave('caption', v)} placeholder="The caption under the reel" multiline rows={4} charCount />
        <Field label="Hashtags" value={a('hashtags').join(' ')} onChange={(v) => onSave('hashtags', v.split(/\s+/).filter(Boolean))} placeholder="#seattlefood #restaurantmarketing" />
      </FormSection>

      {/* FOR THE VIDEOGRAPHER */}
      <FormSection title="For the Videographer" subtitle="Sent to filming team">
        <ChipSelect label="Footage source" options={FOOTAGE_SOURCES.map((f) => f.label)} value={FOOTAGE_SOURCES.find((f) => f.value === (s('footage_source') || getDefault('footage_source')))?.label ?? ''} onChange={(v) => onSave('footage_source', FOOTAGE_SOURCES.find((f) => f.label === v)?.value ?? v)} />

        {showFilming && (
          <>
            <Field label="Props & products" value={s('props') ? (data.props as string[]).join(', ') : ''} onChange={(v) => onSave('props', v.split(',').map((x) => x.trim()).filter(Boolean))} placeholder="Items needed on set" />
            <Field label="Location" value={s('location_notes')} onChange={(v) => onSave('location_notes', v)} placeholder="Where to film" />
            <Field label="Who's on camera?" value={s('who_on_camera')} onChange={(v) => onSave('who_on_camera', v)} placeholder="Names or roles" />
            {s('who_on_camera') && (
              <Field label="Wardrobe / appearance" value={s('wardrobe_notes')} onChange={(v) => onSave('wardrobe_notes', v)} placeholder="What should they wear?" />
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Shoot date" value={s('shoot_date')} onChange={(v) => onSave('shoot_date', v)} type="date" />
              <div className="flex items-center gap-2 pt-5">
                <input type="checkbox" checked={data.shoot_flexible as boolean ?? true} onChange={(e) => onSave('shoot_flexible', e.target.checked)} className="rounded border-ink-5 text-brand focus:ring-brand/30" />
                <span className="text-xs text-ink-2">Flexible</span>
              </div>
            </div>
            <Field label="Reference link" value={s('reference_link')} onChange={(v) => onSave('reference_link', v)} placeholder="Link to inspiration video" />

            {/* B-roll */}
            {!showBRoll ? (
              <button onClick={() => setShowBRoll(true)} className="text-xs text-brand font-medium hover:text-brand-dark">+ Add B-roll ideas</button>
            ) : (
              <div>
                <label className="text-[10px] text-ink-4 block mb-1">B-roll & additional shots</label>
                <div className="space-y-1.5">
                  {bRoll.map((item, i) => (
                    <div key={i} className="flex items-center gap-2 group">
                      <input value={item.description} onChange={(e) => { const u = [...bRoll]; u[i] = { description: e.target.value }; onSave('b_roll', u) }} placeholder="Extra footage to capture" className="flex-1 text-sm border border-ink-6 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand/30" />
                      <button onClick={() => onSave('b_roll', bRoll.filter((_, j) => j !== i))} className="text-ink-4 hover:text-red-500 opacity-0 group-hover:opacity-100">✕</button>
                    </div>
                  ))}
                  <button onClick={() => onSave('b_roll', [...bRoll, { description: '' }])} className="text-xs font-medium text-brand hover:text-brand-dark">+ Add</button>
                </div>
              </div>
            )}

            {/* Equipment notes */}
            {!showEquipment ? (
              <button onClick={() => setShowEquipment(true)} className="text-xs text-brand font-medium hover:text-brand-dark">+ Add equipment notes</button>
            ) : (
              <Field label="Equipment / setup notes" value={s('equipment_notes')} onChange={(v) => onSave('equipment_notes', v)} placeholder="Special equipment needed?" />
            )}
          </>
        )}
      </FormSection>

      {/* FOR THE EDITOR */}
      <FormSection title="For the Editor" subtitle="Sent to post-production">
        <div>
          <label className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider block mb-1.5">Editing style</label>
          <div className="flex flex-wrap gap-1.5">
            {EDITING_STYLES.map((e) => (
              <button key={e.value} onClick={() => onSave('editing_style_value', e.value)} className={`text-[11px] font-medium px-3 py-1.5 rounded-lg border transition-colors ${(s('editing_style_value') || getDefault('editing_style')) === e.value ? 'bg-ink text-white border-ink' : 'border-ink-6 text-ink-3 hover:border-ink-5'}`}>{e.label}</button>
            ))}
          </div>
          {selectedEditStyle?.desc && <p className="text-[10px] text-ink-4 mt-1.5">{selectedEditStyle.desc}</p>}
          {s('editing_style_value') === 'custom' && <Field label="" value={s('editing_style_custom')} onChange={(v) => onSave('editing_style_custom', v)} placeholder="Describe the style..." />}
        </div>

        <div>
          <ChipSelect label="Music" options={MUSIC_OWNERS} value={s('music_owner') || 'We pick'} onChange={(v) => onSave('music_owner', v)} />
          {s('music_owner') !== 'No music' && s('music_owner') !== 'Client provides' && (
            <div className="mt-3">
              <ChipSelect label="Music feel" options={MUSIC_FEELS} value={s('music_feel_value') || getDefault('music_feel')} onChange={(v) => onSave('music_feel_value', v)} />
              {s('music_feel_value') === 'Custom' && <Field label="" value={s('music_feel_custom')} onChange={(v) => onSave('music_feel_custom', v)} placeholder="Describe music feel..." />}
            </div>
          )}
        </div>

        <ChipSelect label="Subtitles" options={SUBTITLE_STYLES} value={s('subtitle_style') || 'Bold centered'} onChange={(v) => onSave('subtitle_style', v)} />

        <div>
          <label className="text-[10px] text-ink-4 block mb-1.5">Also adapt for</label>
          <div className="flex flex-wrap gap-1.5">
            {ADAPT_FORMATS.map((f) => (
              <button key={f.value} onClick={() => {
                const current = a('adapt_formats')
                onSave('adapt_formats', current.includes(f.value) ? current.filter((v) => v !== f.value) : [...current, f.value])
              }} className={`text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors ${a('adapt_formats').includes(f.value) ? 'bg-brand-tint border-brand/30 text-brand-dark' : 'border-ink-6 text-ink-3 hover:border-ink-5'}`}>{f.label}</button>
            ))}
          </div>
          <p className="text-[9px] text-ink-4 mt-1">Editor will frame key moments with cropping in mind</p>
        </div>

        <Field label="Text overlays" value={s('text_overlays')} onChange={(v) => onSave('text_overlays', v)} placeholder="Text that appears on screen" multiline rows={2} />
        <Field label="Pacing notes (optional)" value={s('pacing_notes')} onChange={(v) => onSave('pacing_notes', v)} placeholder="e.g., slow reveal on product, quick cuts during prep" multiline rows={2} />
        <Field label="Cover frame" value={s('cover_frame')} onChange={(v) => onSave('cover_frame', v)} placeholder="What frame for the grid thumbnail?" />
        <Field label="Editing reference" value={s('editing_reference_link')} onChange={(v) => onSave('editing_reference_link', v)} placeholder="Link to a video with the editing style you want" />
      </FormSection>

      {/* METADATA */}
      <FormSection title="Metadata" subtitle="Organizational">
        <ChipSelect label="Category" options={['Promotion', 'Product', 'Event', 'Seasonal', 'Educational', 'Testimonial', 'Behind the Scenes', 'Brand', 'Other']} value={s('content_category')} onChange={(v) => onSave('content_category', v)} />
      </FormSection>

      {/* SCHEDULING */}
      <FormSection title="Scheduling & Notes" subtitle="Internal">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Publish date" value={s('scheduled_date')} onChange={(v) => onSave('scheduled_date', v)} type="date" />
          <ChipSelect label="Urgency" options={['Flexible', 'Standard', 'Urgent']} value={s('urgency') || 'Standard'} onChange={(v) => onSave('urgency', v.toLowerCase())} />
        </div>
        <Field label="Internal notes" value={s('internal_note')} onChange={(v) => onSave('internal_note', v)} placeholder="Notes for the team" multiline rows={2} />
        <Field label="What to avoid" value={s('avoid_text')} onChange={(v) => onSave('avoid_text', v)} placeholder="Topics, styles, or references to avoid" multiline rows={2} />
      </FormSection>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared sub-components (exported for other forms)
// ---------------------------------------------------------------------------

export function FormSection({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-ink-6 pb-5 last:border-0 last:pb-0">
      <div className="mb-3">
        <h3 className="text-[11px] font-bold text-ink uppercase tracking-wider">{title}</h3>
        {subtitle && <p className="text-[9px] text-ink-4 mt-0.5">{subtitle}</p>}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

export function Field({ label, value, onChange, placeholder, type, multiline, rows, charCount }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; multiline?: boolean; rows?: number; charCount?: boolean
}) {
  return (
    <div>
      {label && <label className="text-[10px] text-ink-4 block mb-1">{label}</label>}
      {multiline ? (
        <div>
          <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows ?? 3} className="w-full text-sm text-ink border border-ink-6 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-brand/30" />
          {charCount && value && <span className="text-[9px] text-ink-4">{value.length} chars</span>}
        </div>
      ) : (
        <input type={type ?? 'text'} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full text-sm text-ink border border-ink-6 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand/30" />
      )}
    </div>
  )
}

export function ChipSelect({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      {label && <label className="text-[10px] text-ink-4 block mb-1.5">{label}</label>}
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button key={o} onClick={() => onChange(o)} className={`text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors ${value === o ? 'bg-ink text-white border-ink' : 'border-ink-6 text-ink-3 hover:border-ink-5'}`}>{o}</button>
        ))}
      </div>
    </div>
  )
}

export function ChipMulti({ label, options, value, onChange }: { label: string; options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div>
      {label && <label className="text-[10px] text-ink-4 block mb-1.5">{label}</label>}
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button key={o} onClick={() => onChange(value.includes(o) ? value.filter((v) => v !== o) : [...value, o])} className={`text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors ${value.includes(o) ? 'bg-brand-tint border-brand/30 text-brand-dark' : 'border-ink-6 text-ink-3 hover:border-ink-5'}`}>{o}</button>
        ))}
      </div>
    </div>
  )
}

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
        <button onClick={() => onChange([...items, { shot_number: items.length + 1, description: '' }])} className="text-xs font-medium text-brand hover:text-brand-dark">+ Add shot</button>
      </div>
    </div>
  )
}
