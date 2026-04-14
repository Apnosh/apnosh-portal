'use client'

import { FormSection, Field, ChipSelect, ChipMulti } from './reel-form'

const CATEGORIES = ['Promotion', 'Product', 'Event', 'Seasonal', 'Educational', 'Testimonial', 'Behind the Scenes', 'Brand', 'Other']
const CTAS = ['Order now', 'Visit us', 'DM to book', 'Link in bio', 'Learn more', 'Call us', 'No CTA']
const MOODS = ['Bold & energetic', 'Clean & minimal', 'Warm & inviting', 'Professional', 'Playful', 'Luxury', 'Festive']
const INTERACTIVE = ['Poll', 'Question', 'Slider', 'Quiz', 'Link', 'Countdown', 'None']
const FOOTAGE_SOURCES = ['We film it', 'Client provides', 'UGC style', 'Stock footage']

interface StoryFormProps {
  data: Record<string, unknown>
  onSave: (field: string, value: unknown) => void
}

export default function StoryForm({ data, onSave }: StoryFormProps) {
  const s = (field: string) => data[field] as string ?? ''
  const a = (field: string) => (data[field] as string[]) ?? []

  return (
    <div className="space-y-6">
      {/* THE CONCEPT */}
      <FormSection title="The Concept">
        <ChipSelect label="Category" options={CATEGORIES} value={s('content_category')} onChange={(v) => onSave('content_category', v)} />
        <Field label="Main message" value={s('concept_description')} onChange={(v) => onSave('concept_description', v)} placeholder="What is this story about?" multiline rows={2} />
        <ChipMulti label="Call to action" options={CTAS} value={a('call_to_action')} onChange={(v) => onSave('call_to_action', v)} />
      </FormSection>

      {/* THE CAPTION (text overlay for stories) */}
      <FormSection title="The Caption" subtitle="Text on screen">
        <div>
          <label className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider block mb-1.5">Text overlay</label>
          <input
            value={s('text_overlays')}
            onChange={(e) => onSave('text_overlays', e.target.value)}
            placeholder="Text that appears on the story"
            className="w-full text-base font-medium text-ink border-l-[3px] border-l-brand border border-ink-6 rounded-lg px-4 py-3 bg-brand-tint/30 focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
        </div>
      </FormSection>

      {/* THE VISUAL */}
      <FormSection title="The Visual" subtitle="Visual direction">
        <ChipSelect label="Interactive element" options={INTERACTIVE} value={s('story_interactive_element')} onChange={(v) => onSave('story_interactive_element', v)} />
        <ChipSelect label="Mood" options={MOODS} value={(data.mood_tags as string[])?.[0] ?? ''} onChange={(v) => onSave('mood_tags', [v])} />
        <ChipSelect label="Footage source" options={FOOTAGE_SOURCES} value={s('footage_source')} onChange={(v) => onSave('footage_source', v)} />
        {(s('footage_source') === 'We film it' || s('footage_source') === 'UGC style') && (
          <>
            <Field label="Who's on camera?" value={s('who_on_camera')} onChange={(v) => onSave('who_on_camera', v)} placeholder="Names or roles" />
            <Field label="Shoot date" value={s('shoot_date')} onChange={(v) => onSave('shoot_date', v)} type="date" />
          </>
        )}
        <Field label="Reference link" value={s('reference_link')} onChange={(v) => onSave('reference_link', v)} placeholder="Link to inspiration" />
      </FormSection>

      {/* SCHEDULING */}
      <FormSection title="Scheduling & Notes" subtitle="Internal">
        <Field label="Publish date" value={s('scheduled_date')} onChange={(v) => onSave('scheduled_date', v)} type="date" />
        <Field label="Internal notes" value={s('internal_note')} onChange={(v) => onSave('internal_note', v)} placeholder="Notes for the team" multiline rows={2} />
      </FormSection>
    </div>
  )
}
