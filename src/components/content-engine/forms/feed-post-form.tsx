'use client'

import { FormSection, Field, ChipSelect, ChipMulti } from './reel-form'

const CATEGORIES = ['Promotion', 'Product', 'Event', 'Seasonal', 'Educational', 'Testimonial', 'Behind the Scenes', 'Brand', 'Other']
const CTAS = ['Order now', 'Visit us', 'DM to book', 'Link in bio', 'Learn more', 'Call us', 'No CTA']
const PLACEMENTS = ['Feed (1080×1350)', 'Reel Cover (1080×1920)', 'Carousel', 'Banner (820×312)']
const MOODS = ['Bold & energetic', 'Clean & minimal', 'Warm & inviting', 'Professional', 'Playful', 'Luxury', 'Festive']
const COLORS = ['Use brand colors', 'Light & airy', 'Dark & bold', 'Seasonal']

interface FeedPostFormProps {
  data: Record<string, unknown>
  onSave: (field: string, value: unknown) => void
}

export default function FeedPostForm({ data, onSave }: FeedPostFormProps) {
  const s = (field: string) => data[field] as string ?? ''
  const a = (field: string) => (data[field] as string[]) ?? []

  return (
    <div className="space-y-6">
      {/* THE CONCEPT */}
      <FormSection title="The Concept">
        <ChipSelect label="Category" options={CATEGORIES} value={s('content_category')} onChange={(v) => onSave('content_category', v)} />
        <Field label="Main message" value={s('concept_description')} onChange={(v) => onSave('concept_description', v)} placeholder="What is this post about and why does it matter?" multiline rows={3} />
        {/* Headline — prominent */}
        <div>
          <label className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider block mb-1.5">Headline — the first thing they read</label>
          <input
            value={s('headline_text')}
            onChange={(e) => onSave('headline_text', e.target.value)}
            placeholder="Primary text on the graphic"
            className="w-full text-base font-medium text-ink border-l-[3px] border-l-brand border border-ink-6 rounded-lg px-4 py-3 bg-brand-tint/30 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
          />
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
        <ChipSelect label="Placement" options={PLACEMENTS} value={s('placement')} onChange={(v) => onSave('placement', v)} />
        <ChipSelect label="Mood" options={MOODS} value={s('mood_tags') ? (data.mood_tags as string[])?.[0] ?? '' : ''} onChange={(v) => onSave('mood_tags', [v])} />
        <ChipSelect label="Color preference" options={COLORS} value={s('color_preference')} onChange={(v) => onSave('color_preference', v)} />
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-xs text-ink-2 cursor-pointer">
            <input type="checkbox" checked={data.include_logo as boolean ?? true} onChange={(e) => onSave('include_logo', e.target.checked)} className="rounded border-ink-5 text-brand focus:ring-brand/30" /> Include logo
          </label>
          <label className="flex items-center gap-2 text-xs text-ink-2 cursor-pointer">
            <input type="checkbox" checked={data.source_stock_photo as boolean ?? false} onChange={(e) => onSave('source_stock_photo', e.target.checked)} className="rounded border-ink-5 text-brand focus:ring-brand/30" /> Use stock photo
          </label>
        </div>
        <Field label="Colors to avoid" value={s('avoid_colors')} onChange={(v) => onSave('avoid_colors', v)} placeholder="e.g., neon green, red" />
        <Field label="Styles to avoid" value={s('avoid_styles')} onChange={(v) => onSave('avoid_styles', v)} placeholder="e.g., clip art, cartoon" />
        <Field label="Designer notes" value={s('editor_notes')} onChange={(v) => onSave('editor_notes', v)} placeholder="Anything else for the designer" multiline rows={2} />
        <Field label="Reference link" value={s('reference_link')} onChange={(v) => onSave('reference_link', v)} placeholder="Link to inspiration image or design" />
      </FormSection>

      {/* SCHEDULING & NOTES */}
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
