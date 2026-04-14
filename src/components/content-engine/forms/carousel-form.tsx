'use client'

import { FormSection, Field, ChipSelect, ChipMulti } from './reel-form'

const CATEGORIES = ['Promotion', 'Product', 'Event', 'Seasonal', 'Educational', 'Testimonial', 'Behind the Scenes', 'Brand', 'Other']
const CTAS = ['Order now', 'Visit us', 'DM to book', 'Link in bio', 'Learn more', 'Call us', 'No CTA']
const MOODS = ['Bold & energetic', 'Clean & minimal', 'Warm & inviting', 'Professional', 'Playful', 'Luxury', 'Festive']
const COLORS = ['Use brand colors', 'Light & airy', 'Dark & bold', 'Seasonal']

interface CarouselFormProps {
  data: Record<string, unknown>
  onSave: (field: string, value: unknown) => void
}

export default function CarouselForm({ data, onSave }: CarouselFormProps) {
  const s = (field: string) => data[field] as string ?? ''
  const a = (field: string) => (data[field] as string[]) ?? []
  const slideCount = (data.carousel_slide_count as number) ?? 5
  const slides = (data.carousel_slides as Array<{ slide_number: number; headline: string }>) ?? []

  // Sync slides array with count
  const ensureSlides = (count: number) => {
    const current = [...slides]
    while (current.length < count) current.push({ slide_number: current.length + 1, headline: '' })
    return current.slice(0, count)
  }

  return (
    <div className="space-y-6">
      {/* THE CONCEPT */}
      <FormSection title="The Concept">
        <ChipSelect label="Category" options={CATEGORIES} value={s('content_category')} onChange={(v) => onSave('content_category', v)} />
        <Field label="Main message" value={s('concept_description')} onChange={(v) => onSave('concept_description', v)} placeholder="What is this carousel about?" multiline rows={3} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] text-ink-4 block mb-1">Number of slides</label>
            <input type="number" min={2} max={10} value={slideCount} onChange={(e) => {
              const c = parseInt(e.target.value) || 5
              onSave('carousel_slide_count', c)
              onSave('carousel_slides', ensureSlides(c))
            }} className="w-full text-sm border border-ink-6 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand/30" />
          </div>
          <Field label="Slide narrative" value={s('carousel_flow')} onChange={(v) => onSave('carousel_flow', v)} placeholder="How slides connect (e.g., problem → solution)" />
        </div>
        <ChipMulti label="Call to action" options={CTAS} value={a('call_to_action')} onChange={(v) => onSave('call_to_action', v)} />
      </FormSection>

      {/* THE CAPTION */}
      <FormSection title="The Caption" subtitle="Published with the post">
        <Field label="Caption" value={s('caption')} onChange={(v) => onSave('caption', v)} placeholder="The caption under the carousel" multiline rows={4} charCount />
        <Field label="Hashtags" value={a('hashtags').join(' ')} onChange={(v) => onSave('hashtags', v.split(/\s+/).filter(Boolean))} placeholder="#seattlefood #restaurantmarketing" />
      </FormSection>

      {/* FOR THE DESIGNER */}
      <FormSection title="For the Designer" subtitle="Sent to design team">
        {/* Cover slide — prominent */}
        <div>
          <label className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider block mb-1.5">Cover slide headline</label>
          <input
            value={slides[0]?.headline ?? ''}
            onChange={(e) => {
              const updated = ensureSlides(slideCount)
              updated[0] = { ...updated[0], headline: e.target.value }
              onSave('carousel_slides', updated)
            }}
            placeholder="Cover slide — the first thing they see"
            className="w-full text-base font-medium text-ink border-l-[3px] border-l-brand border border-ink-6 rounded-lg px-4 py-3 bg-brand-tint/30 focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
        </div>

        {/* Remaining slides */}
        <div className="space-y-1.5">
          <label className="text-[10px] text-ink-4 block">Slide content</label>
          {ensureSlides(slideCount).slice(1).map((slide, i) => (
            <div key={i + 1} className="flex items-center gap-2">
              <span className="text-xs font-bold text-ink-3 w-5 text-right flex-shrink-0">{i + 2}</span>
              <input
                value={slide.headline}
                onChange={(e) => {
                  const updated = ensureSlides(slideCount)
                  updated[i + 1] = { ...updated[i + 1], headline: e.target.value }
                  onSave('carousel_slides', updated)
                }}
                placeholder={`Slide ${i + 2} content`}
                className="flex-1 text-sm border border-ink-6 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
            </div>
          ))}
        </div>

        <ChipSelect label="Mood" options={MOODS} value={(data.mood_tags as string[])?.[0] ?? ''} onChange={(v) => onSave('mood_tags', [v])} />
        <ChipSelect label="Color preference" options={COLORS} value={s('color_preference')} onChange={(v) => onSave('color_preference', v)} />
        <Field label="Designer notes" value={s('editor_notes')} onChange={(v) => onSave('editor_notes', v)} placeholder="Anything specific for the designer" multiline rows={2} />
        <Field label="Reference link" value={s('reference_link')} onChange={(v) => onSave('reference_link', v)} placeholder="Link to inspiration" />
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
