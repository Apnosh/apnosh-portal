'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { FormSection, Field, ChipSelect, ChipMulti } from './reel-form'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FRAMEWORKS = [
  { value: 'listicle', label: 'Listicle / Tips', desc: 'Each slide is one item — cover promises the count, build to the best last' },
  { value: 'guide', label: 'Guide / Tutorial', desc: 'Step-by-step — each slide is an actionable step' },
  { value: 'myth_reality', label: 'Myth vs Reality', desc: 'Alternating myth and reality slides — challenge assumptions' },
  { value: 'before_after', label: 'Before & After', desc: 'Transformation across slides — before, process, after' },
  { value: 'story', label: 'Story / Case study', desc: 'Narrative arc — situation, what happened, results' },
  { value: 'comparison', label: 'Comparison', desc: 'A vs B — break down differences across slides' },
  { value: 'hot_take', label: 'Hot take', desc: 'Bold statement on cover, evidence across slides' },
  { value: 'free_form', label: 'Free-form', desc: 'No template — define each slide manually' },
]

const CTAS = ['Order now', 'Visit us', 'DM to book', 'Link in bio', 'Learn more', 'Call us', 'Save this', 'No CTA']
const MOODS = ['Bold & energetic', 'Clean & minimal', 'Warm & inviting', 'Professional', 'Playful', 'Luxury', 'Festive']
const COLORS = ['Use brand colors', 'Light & airy', 'Dark & bold', 'Seasonal']
const SLIDE_COUNTS = [3, 4, 5, 6, 7, 8, 9, 10]

interface Slide {
  slide_number: number
  headline: string
  body_text?: string
  image_direction?: string
  swipe_hook?: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface CarouselFormProps {
  data: Record<string, unknown>
  onSave: (field: string, value: unknown) => void
  defaults?: Record<string, unknown>
}

export default function CarouselForm({ data, onSave, defaults }: CarouselFormProps) {
  const s = (field: string) => data[field] as string ?? ''
  const a = (field: string) => (data[field] as string[]) ?? []

  const slideCount = (data.carousel_slide_count as number) ?? 7
  const slides = (data.carousel_slides as Slide[]) ?? []
  const selectedFramework = FRAMEWORKS.find((f) => f.value === s('carousel_framework'))
  const getDefault = (field: string): string => (defaults?.[`default_${field}`] as string) ?? ''
  const isUsingDefault = (field: string): boolean => !s(field) && !!getDefault(field)

  // Content slides = everything between cover (slide 1) and CTA (last slide)
  const contentSlideCount = Math.max(0, slideCount - 2) // minus cover and CTA

  // Ensure slides array matches expected count
  const ensureSlides = (count: number): Slide[] => {
    const current = [...slides]
    while (current.length < count) current.push({ slide_number: current.length + 1, headline: '', body_text: '', image_direction: '', swipe_hook: '' })
    return current.slice(0, count)
  }

  const updateSlideCount = (newCount: number) => {
    onSave('carousel_slide_count', newCount)
    const contentCount = Math.max(0, newCount - 2)
    onSave('carousel_slides', ensureSlides(contentCount))
  }

  const updateSlide = (idx: number, field: keyof Slide, value: string) => {
    const updated = ensureSlides(contentSlideCount)
    updated[idx] = { ...updated[idx], [field]: value }
    onSave('carousel_slides', updated)
  }

  // Placeholder text based on framework
  const getHeadlinePlaceholder = (slideIdx: number): string => {
    const fw = s('carousel_framework')
    if (fw === 'listicle') return `Tip #${slideIdx + 1}: [the tip]`
    if (fw === 'myth_reality') return slideIdx % 2 === 0 ? 'Myth: [common belief]' : 'Reality: [the truth]'
    if (fw === 'guide') return `Step ${slideIdx + 1}: [action]`
    if (fw === 'story') return slideIdx === 0 ? 'The situation...' : slideIdx === contentSlideCount - 1 ? 'The results...' : 'What happened...'
    if (fw === 'before_after') return slideIdx === 0 ? 'Before...' : slideIdx === contentSlideCount - 1 ? 'After...' : 'The process...'
    if (fw === 'comparison') return slideIdx % 2 === 0 ? 'Option A: [detail]' : 'Option B: [detail]'
    return `Slide ${slideIdx + 2} headline`
  }

  return (
    <div className="space-y-6">
      {/* THE CONCEPT */}
      <FormSection title="The Concept">
        <Field label="Main message" value={s('concept_description')} onChange={(v) => onSave('concept_description', v)} placeholder="What is this carousel about? What value does it deliver?" multiline rows={3} />

        {/* Framework */}
        <div>
          <label className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider block mb-1.5">Carousel Framework</label>
          <div className="flex flex-wrap gap-1.5">
            {FRAMEWORKS.map((f) => (
              <button key={f.value} onClick={() => onSave('carousel_framework', f.value)} className={`text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors ${s('carousel_framework') === f.value ? 'bg-ink text-white border-ink' : 'border-ink-6 text-ink-3 hover:border-ink-5'}`}>{f.label}</button>
            ))}
          </div>
          {selectedFramework && <p className="text-[10px] text-ink-4 mt-1.5">{selectedFramework.desc}</p>}
        </div>

        {/* Slide count */}
        <div>
          <label className="text-[10px] text-ink-4 block mb-1.5">Total slides (including cover and CTA)</label>
          <div className="flex gap-1.5">
            {SLIDE_COUNTS.map((n) => (
              <button key={n} onClick={() => updateSlideCount(n)} className={`w-8 h-8 text-xs font-semibold rounded-lg border transition-colors ${slideCount === n ? 'bg-ink text-white border-ink' : 'border-ink-6 text-ink-3 hover:border-ink-5'}`}>{n}</button>
            ))}
          </div>
        </div>

        <ChipMulti label="Call to action" options={CTAS} value={a('call_to_action')} onChange={(v) => onSave('call_to_action', v)} />
      </FormSection>

      {/* THE COVER SLIDE */}
      <FormSection title="The Cover Slide" subtitle="This is the carousel's hook — what stops the scroll">
        <div>
          <label className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider block mb-1">Cover Headline — what stops the scroll</label>
          <input
            value={s('cover_headline')}
            onChange={(e) => onSave('cover_headline', e.target.value)}
            placeholder="e.g., The $0 strategy that got our client 47 new customers"
            className="w-full text-base font-medium text-ink border-l-[3px] border-l-brand border border-ink-6 rounded-lg px-4 py-3 bg-brand-tint/30 focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
        </div>
        <Field label="Subheadline (optional)" value={s('cover_subheadline')} onChange={(v) => onSave('cover_subheadline', v)} placeholder="e.g., Swipe to see how →" />
        {!s('cover_image_direction') ? (
          <button onClick={() => onSave('cover_image_direction', ' ')} className="text-xs text-brand font-medium hover:text-brand-dark">+ Add cover image direction</button>
        ) : (
          <Field label="Cover image / visual" value={s('cover_image_direction').trim()} onChange={(v) => onSave('cover_image_direction', v)} placeholder="e.g., flat lay of ingredients, person looking at phone" />
        )}
      </FormSection>

      {/* CONTENT SLIDES */}
      <FormSection title={`Content Slides (${contentSlideCount})`} subtitle="The slides between cover and CTA">
        <div className="space-y-3">
          {ensureSlides(contentSlideCount).map((slide, idx) => (
            <SlideEditor
              key={idx}
              slideNumber={idx + 2}
              slide={slide}
              onUpdate={(field, value) => updateSlide(idx, field as keyof Slide, value)}
              headlinePlaceholder={getHeadlinePlaceholder(idx)}
              showSwipeHook={idx < contentSlideCount - 1}
            />
          ))}
        </div>
      </FormSection>

      {/* CTA SLIDE */}
      <FormSection title={`CTA Slide (Slide ${slideCount})`} subtitle="The closing slide — convert attention into action">
        <Field label="CTA headline" value={s('cta_slide_headline') || s('cta_text')} onChange={(v) => onSave('cta_slide_headline', v)} placeholder="e.g., Save this for later. Follow @handle for more." />
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-xs text-ink-2 cursor-pointer">
            <input type="checkbox" checked={(data.cta_include_handle as boolean) ?? true} onChange={(e) => onSave('cta_include_handle', e.target.checked)} className="rounded border-ink-5 text-brand focus:ring-brand/30" /> Include handle
          </label>
          <label className="flex items-center gap-2 text-xs text-ink-2 cursor-pointer">
            <input type="checkbox" checked={(data.include_logo as boolean) ?? true} onChange={(e) => onSave('include_logo', e.target.checked)} className="rounded border-ink-5 text-brand focus:ring-brand/30" /> Include logo
          </label>
        </div>
        <Field label="CTA slide notes (optional)" value={s('cta_slide_notes')} onChange={(v) => onSave('cta_slide_notes', v)} placeholder="e.g., include website URL, add QR code" />
      </FormSection>

      {/* THE CAPTION */}
      <FormSection title="The Caption" subtitle="Published with the post">
        <Field label="Caption" value={s('caption')} onChange={(v) => onSave('caption', v)} placeholder="Caption for people who don't swipe — summarize the key message" multiline rows={4} charCount />
        <Field label="Hashtags" value={a('hashtags').join(' ')} onChange={(v) => onSave('hashtags', v.split(/\s+/).filter(Boolean))} placeholder="#seattlefood #restaurantmarketing" />
      </FormSection>

      {/* FOR THE DESIGNER */}
      <FormSection title="For the Designer" subtitle="Sent to design team">
        <div>
          <label className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider block mb-1">Visual flow — how slides connect</label>
          <textarea
            value={s('carousel_flow')}
            onChange={(e) => onSave('carousel_flow', e.target.value)}
            placeholder="How should slides feel as a set? e.g., consistent background with changing accent, numbered progression, alternating light/dark for myth vs reality"
            rows={2}
            className="w-full text-sm text-ink border-l-[3px] border-l-ink-4 border border-ink-6 rounded-lg px-4 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
        </div>

        {/* Aspect ratio */}
        <ChipSelect label="Format" options={['Square (1:1)', 'Portrait (4:5)']} value={s('carousel_aspect_ratio') === 'portrait_4x5' ? 'Portrait (4:5)' : 'Square (1:1)'} onChange={(v) => onSave('carousel_aspect_ratio', v.includes('4:5') ? 'portrait_4x5' : 'square_1x1')} />

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

        <Field label="Designer notes" value={s('editor_notes')} onChange={(v) => onSave('editor_notes', v)} placeholder="Anything else for the designer" multiline rows={2} />
        <Field label="Reference link" value={s('reference_link')} onChange={(v) => onSave('reference_link', v)} placeholder="Link to an inspiration carousel" />
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

// ---------------------------------------------------------------------------
// Slide Editor sub-component
// ---------------------------------------------------------------------------

function SlideEditor({ slideNumber, slide, onUpdate, headlinePlaceholder, showSwipeHook }: {
  slideNumber: number
  slide: Slide
  onUpdate: (field: string, value: string) => void
  headlinePlaceholder: string
  showSwipeHook: boolean
}) {
  const [showExtras, setShowExtras] = useState(!!(slide.image_direction || slide.swipe_hook))

  return (
    <div className="bg-bg-2 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold text-ink-3">Slide {slideNumber}</span>
        {!showExtras && (
          <button onClick={() => setShowExtras(true)} className="text-[9px] text-brand font-medium hover:text-brand-dark">+ Details</button>
        )}
      </div>

      {/* Headline — required */}
      <input
        value={slide.headline}
        onChange={(e) => onUpdate('headline', e.target.value)}
        placeholder={headlinePlaceholder}
        className="w-full text-sm font-medium text-ink border border-ink-6 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand/30 bg-white"
      />

      {/* Body text — optional */}
      <textarea
        value={slide.body_text ?? ''}
        onChange={(e) => onUpdate('body_text', e.target.value)}
        placeholder="Supporting detail (optional)"
        rows={2}
        className="w-full text-xs text-ink-2 border border-ink-6 rounded-lg px-3 py-1.5 resize-none focus:outline-none focus:ring-2 focus:ring-brand/30 bg-white"
      />

      {/* Extras (collapsed by default) */}
      {showExtras && (
        <div className="space-y-2 pt-1">
          <input
            value={slide.image_direction ?? ''}
            onChange={(e) => onUpdate('image_direction', e.target.value)}
            placeholder="Image direction (e.g., photo of finished dish)"
            className="w-full text-xs text-ink-2 border border-ink-6 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand/30 bg-white"
          />
          {showSwipeHook && (
            <input
              value={slide.swipe_hook ?? ''}
              onChange={(e) => onUpdate('swipe_hook', e.target.value)}
              placeholder="Swipe hook (e.g., 'But here's what most people miss →')"
              className="w-full text-xs text-ink-2 border border-ink-6 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand/30 bg-white"
            />
          )}
        </div>
      )}
    </div>
  )
}
