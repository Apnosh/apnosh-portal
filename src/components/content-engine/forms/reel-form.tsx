'use client'

import { Sparkles } from 'lucide-react'

interface ReelFormProps {
  data: Record<string, unknown>
  onSave: (field: string, value: unknown) => void
}

const CATEGORIES = ['Promotion', 'Product', 'Event', 'Seasonal', 'Educational', 'Testimonial', 'Behind the Scenes', 'Brand', 'Other']
const LENGTHS = ['15-30s', '30-45s', '45-60s', '60-90s']
const CTAS = ['Order now', 'Visit us', 'DM to book', 'Link in bio', 'Learn more', 'Call us', 'No CTA']
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
  { value: 'upbeat', label: 'Upbeat & energetic' },
  { value: 'chill', label: 'Chill & relaxed' },
  { value: 'trending', label: 'Trending audio' },
  { value: 'cinematic', label: 'Cinematic / epic' },
  { value: 'acoustic', label: 'Acoustic / warm' },
  { value: 'electronic', label: 'Electronic / modern' },
  { value: 'custom', label: 'Custom' },
]
const MUSIC_OWNERS = ['We pick', 'Client provides', 'No music']

export default function ReelForm({ data, onSave }: ReelFormProps) {
  const s = (field: string) => data[field] as string ?? ''
  const a = (field: string) => (data[field] as string[]) ?? []
  const showFilming = !['client_provides', 'animation', 'stock'].includes(s('footage_source'))
  const selectedEditStyle = EDITING_STYLES.find((e) => e.value === s('editing_style_value'))

  return (
    <div className="space-y-6">
      {/* THE CONCEPT */}
      <FormSection title="The Concept">
        <ChipSelect label="Category" options={CATEGORIES} value={s('content_category')} onChange={(v) => onSave('content_category', v)} />
        <Field label="Main message" value={s('concept_description')} onChange={(v) => onSave('concept_description', v)} placeholder="What is this reel about and why does it matter?" multiline rows={3} />
        {/* Hook — prominent */}
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <label className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider">Hook — first 3 seconds</label>
            <span className="text-[9px] text-ink-4" title="This is what stops the scroll. Make it count.">ⓘ</span>
          </div>
          <input
            value={s('hook')}
            onChange={(e) => onSave('hook', e.target.value)}
            placeholder="The opening line or visual that stops the scroll"
            className="w-full text-base font-medium text-ink border-l-[3px] border-l-brand border border-ink-6 rounded-lg px-4 py-3 bg-brand-tint/30 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
          />
        </div>
        <ChipSelect label="Video length" options={LENGTHS} value={s('estimated_duration')} onChange={(v) => onSave('estimated_duration', v)} />
        <ChipMulti label="Call to action" options={CTAS} value={a('call_to_action')} onChange={(v) => onSave('call_to_action', v)} />
      </FormSection>

      {/* THE CAPTION */}
      <FormSection title="The Caption" subtitle="Published with the post">
        <Field label="Caption" value={s('caption')} onChange={(v) => onSave('caption', v)} placeholder="The caption that appears under the reel" multiline rows={4} charCount />
        <Field label="Hashtags" value={(a('hashtags')).join(' ')} onChange={(v) => onSave('hashtags', v.split(/\s+/).filter(Boolean))} placeholder="#seattlefood #restaurantmarketing" />
      </FormSection>

      {/* FOR THE VIDEOGRAPHER */}
      <FormSection title="For the Videographer" subtitle="Sent to filming team">
        <ChipSelect label="Footage source" options={FOOTAGE_SOURCES.map((f) => f.label)} value={FOOTAGE_SOURCES.find((f) => f.value === s('footage_source'))?.label ?? ''} onChange={(v) => onSave('footage_source', FOOTAGE_SOURCES.find((f) => f.label === v)?.value ?? v)} />

        {showFilming && (
          <>
            <div>
              <label className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider block mb-1.5">Script</label>
              <textarea
                value={s('script')}
                onChange={(e) => onSave('script', e.target.value)}
                placeholder={"[HOOK]\nYour opening — what stops the scroll\n\n[BODY]\nThe main content — your key message\n\n[CTA]\nWhat you want the viewer to do next"}
                rows={8}
                className="w-full text-sm text-ink border border-ink-6 rounded-lg px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-brand/30 font-mono"
              />
            </div>
            <DynamicList label="Shot list" items={(data.shot_list as Array<{shot_number: number; description: string}>) ?? []} onChange={(v) => onSave('shot_list', v)} placeholder="e.g., Wide angle of kitchen, chef prepping ingredients" />
            <Field label="Props & products" value={s('props') ? (data.props as string[]).join(', ') : ''} onChange={(v) => onSave('props', v.split(',').map((s) => s.trim()).filter(Boolean))} placeholder="Items needed on set" />
            <Field label="Location" value={s('location_notes')} onChange={(v) => onSave('location_notes', v)} placeholder="Where to film" />
            <Field label="Who's on camera?" value={s('who_on_camera')} onChange={(v) => onSave('who_on_camera', v)} placeholder="Names or roles" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Shoot date" value={s('shoot_date')} onChange={(v) => onSave('shoot_date', v)} type="date" />
              <div className="flex items-center gap-2 pt-5">
                <input type="checkbox" checked={data.shoot_flexible as boolean ?? true} onChange={(e) => onSave('shoot_flexible', e.target.checked)} className="rounded border-ink-5 text-brand focus:ring-brand/30" />
                <span className="text-xs text-ink-2">Date is flexible</span>
              </div>
            </div>
            <Field label="Reference link" value={s('reference_link')} onChange={(v) => onSave('reference_link', v)} placeholder="Link to inspiration video" />
          </>
        )}
      </FormSection>

      {/* FOR THE EDITOR */}
      <FormSection title="For the Editor" subtitle="Sent to post-production">
        <div>
          <label className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider block mb-1.5">Editing style</label>
          <div className="flex flex-wrap gap-1.5">
            {EDITING_STYLES.map((e) => (
              <button key={e.value} onClick={() => onSave('editing_style_value', e.value)} className={`text-[11px] font-medium px-3 py-1.5 rounded-lg border transition-colors ${s('editing_style_value') === e.value ? 'bg-ink text-white border-ink' : 'border-ink-6 text-ink-3 hover:border-ink-5'}`}>
                {e.label}
              </button>
            ))}
          </div>
          {selectedEditStyle?.desc && <p className="text-[10px] text-ink-4 mt-1.5">{selectedEditStyle.desc}</p>}
          {s('editing_style_value') === 'custom' && <Field label="" value={s('editing_style_custom')} onChange={(v) => onSave('editing_style_custom', v)} placeholder="Describe the editing style..." />}
        </div>

        <div>
          <ChipSelect label="Music" options={MUSIC_OWNERS} value={s('music_owner') || 'We pick'} onChange={(v) => onSave('music_owner', v)} />
          {s('music_owner') !== 'No music' && s('music_owner') !== 'Client provides' && (
            <div className="mt-3">
              <label className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider block mb-1.5">Music feel</label>
              <div className="flex flex-wrap gap-1.5">
                {MUSIC_FEELS.map((m) => (
                  <button key={m.value} onClick={() => onSave('music_feel_value', m.value)} className={`text-[11px] font-medium px-3 py-1.5 rounded-lg border transition-colors ${s('music_feel_value') === m.value ? 'bg-ink text-white border-ink' : 'border-ink-6 text-ink-3 hover:border-ink-5'}`}>
                    {m.label}
                  </button>
                ))}
              </div>
              {s('music_feel_value') === 'custom' && <Field label="" value={s('music_feel_custom')} onChange={(v) => onSave('music_feel_custom', v)} placeholder="Describe the music feel..." />}
            </div>
          )}
        </div>

        <Field label="Text overlays" value={s('text_overlays')} onChange={(v) => onSave('text_overlays', v)} placeholder="Any text that appears on screen" multiline rows={2} />
        <Field label="Pacing notes (optional)" value={s('pacing_notes')} onChange={(v) => onSave('pacing_notes', v)} placeholder="e.g., slow reveal on product shot, quick cuts during prep" multiline rows={2} />
      </FormSection>

      {/* SCHEDULING & NOTES */}
      <FormSection title="Scheduling & Notes" subtitle="Internal">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Publish date" value={s('scheduled_date')} onChange={(v) => onSave('scheduled_date', v)} type="date" />
          <div>
            <ChipSelect label="Urgency" options={['Flexible', 'Standard', 'Urgent']} value={s('urgency') || 'Standard'} onChange={(v) => onSave('urgency', v.toLowerCase())} />
          </div>
        </div>
        <Field label="Internal notes (not visible to client)" value={s('internal_note')} onChange={(v) => onSave('internal_note', v)} placeholder="Notes for the team" multiline rows={2} />
        <Field label="What to avoid" value={s('avoid_text')} onChange={(v) => onSave('avoid_text', v)} placeholder="Topics, styles, or references to avoid" multiline rows={2} />
      </FormSection>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared sub-components
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
