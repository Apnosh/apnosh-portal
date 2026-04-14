'use client'

import { useState } from 'react'
import { FormSection, Field, ChipSelect, ChipMulti } from './reel-form'

const CTAS = ['Order now', 'Visit us', 'DM to book', 'Link in bio', 'Learn more', 'Call us', 'No CTA']
const PLACEMENTS = ['Feed (1080×1350)', 'Reel Cover (1080×1920)', 'Carousel', 'Banner (820×312)']
const MOODS = ['Bold & energetic', 'Clean & minimal', 'Warm & inviting', 'Professional', 'Playful', 'Luxury', 'Festive']
const COLORS = ['Use brand colors', 'Light & airy', 'Dark & bold', 'Seasonal']

interface FeedPostFormProps {
  data: Record<string, unknown>
  onSave: (field: string, value: unknown) => void
  defaults?: Record<string, unknown>
}

export default function FeedPostForm({ data, onSave, defaults }: FeedPostFormProps) {
  const s = (field: string) => data[field] as string ?? ''
  const a = (field: string) => (data[field] as string[]) ?? []
  const [showPhotoDir, setShowPhotoDir] = useState(!!(data.photo_direction))

  const getDefault = (field: string): string => (defaults?.[`default_${field}`] as string) ?? ''
  const valueOrDefault = (field: string): string => s(field) || getDefault(field)
  const isUsingDefault = (field: string): boolean => !s(field) && !!getDefault(field)

  return (
    <div className="space-y-6">
      {/* THE CONCEPT */}
      <FormSection title="The Concept">
        <Field label="Main message" value={s('concept_description')} onChange={(v) => onSave('concept_description', v)} placeholder="What is this post about and why does it matter?" multiline rows={3} />
        <div>
          <label className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider block mb-1.5">Headline — the first thing they read</label>
          <input value={s('headline_text')} onChange={(e) => onSave('headline_text', e.target.value)} placeholder="Primary text on the graphic" className="w-full text-base font-medium text-ink border-l-[3px] border-l-brand border border-ink-6 rounded-lg px-4 py-3 bg-brand-tint/30 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand" />
        </div>
        <ChipMulti label="Call to action" options={CTAS} value={a('call_to_action')} onChange={(v) => onSave('call_to_action', v)} />
      </FormSection>

      {/* THE CAPTION */}
      <FormSection title="The Caption" subtitle="Published with the post">
        <Field label="Caption" value={s('caption')} onChange={(v) => onSave('caption', v)} placeholder="The caption that appears under the post" multiline rows={4} charCount />
        <Field label="Hashtags" value={a('hashtags').join(' ')} onChange={(v) => onSave('hashtags', v.split(/\s+/).filter(Boolean))} placeholder="#seattlefood #restaurantmarketing" />
      </FormSection>

      {/* FOR THE DESIGNER */}
      <FormSection title="For the Designer" subtitle="Sent to design team">
        {/* What goes on the graphic */}
        <div className="space-y-3 pb-3 border-b border-ink-6">
          <label className="text-[9px] font-semibold text-ink-4 uppercase tracking-wider">What goes on the graphic</label>
          <Field label="Supporting text (optional)" value={s('supporting_text')} onChange={(v) => onSave('supporting_text', v)} placeholder="Subtitle, stat, or secondary line" />
          {!showPhotoDir ? (
            <button onClick={() => setShowPhotoDir(true)} className="text-xs text-brand font-medium hover:text-brand-dark">+ Add photo direction</button>
          ) : (
            <Field label="Photo direction" value={s('photo_direction')} onChange={(v) => onSave('photo_direction', v)} placeholder="What should the photo show?" />
          )}
        </div>

        {/* Visual direction */}
        <div className="space-y-3">
          <label className="text-[9px] font-semibold text-ink-4 uppercase tracking-wider">Visual direction</label>
          <ChipSelect label="Placement" options={PLACEMENTS} value={s('placement') || getDefault('placement')} onChange={(v) => onSave('placement', v)} />
          <div>
            <div className="flex items-center gap-1 mb-1.5">
              <label className="text-[10px] text-ink-4">Mood</label>
              {isUsingDefault('mood') && <span className="text-[8px] text-ink-4 bg-ink-6 px-1 py-0.5 rounded">Default</span>}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {MOODS.map((m) => (
                <button key={m} onClick={() => onSave('mood_tags', [m])} className={`text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors ${(a('mood_tags')[0] || getDefault('mood')) === m ? 'bg-ink text-white border-ink' : 'border-ink-6 text-ink-3 hover:border-ink-5'}`}>{m}</button>
              ))}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-1 mb-1.5">
              <label className="text-[10px] text-ink-4">Color preference</label>
              {isUsingDefault('color_preference') && <span className="text-[8px] text-ink-4 bg-ink-6 px-1 py-0.5 rounded">Default</span>}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {COLORS.map((c) => (
                <button key={c} onClick={() => onSave('color_preference', c)} className={`text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors ${(s('color_preference') || getDefault('color_preference')) === c ? 'bg-ink text-white border-ink' : 'border-ink-6 text-ink-3 hover:border-ink-5'}`}>{c}</button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <label className="flex items-center gap-2 text-xs text-ink-2 cursor-pointer">
              <input type="checkbox" checked={(data.include_logo as boolean) ?? (defaults?.default_include_logo as boolean) ?? true} onChange={(e) => onSave('include_logo', e.target.checked)} className="rounded border-ink-5 text-brand focus:ring-brand/30" /> Include logo
            </label>
            {data.include_logo === undefined && defaults?.default_include_logo !== undefined && <span className="text-[8px] text-ink-4 bg-ink-6 px-1 py-0.5 rounded">Default</span>}
          </div>
          <Field label="Reference link" value={s('reference_link')} onChange={(v) => onSave('reference_link', v)} placeholder="Link to inspiration" />
        </div>

        <Field label="Designer notes" value={s('editor_notes')} onChange={(v) => onSave('editor_notes', v)} placeholder="Anything else for the designer" multiline rows={2} />
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
      </FormSection>
    </div>
  )
}
