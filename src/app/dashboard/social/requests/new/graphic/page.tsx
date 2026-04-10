'use client'

import { useState, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, ArrowRight, Loader2, Check, Upload, X, Sparkles, Edit3,
  Image as ImageIcon, Tag, Palette, AlertTriangle, FileText,
  ShoppingBag, PartyPopper, Snowflake, GraduationCap, Quote,
  Camera, Sun, MoreHorizontal,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  submitGraphicRequest, type GraphicRequestPayload,
} from '@/lib/client-portal-actions'

/* ─── Types & content ──────────────────────────────────────── */

type ContentType =
  | 'promo' | 'product' | 'event' | 'seasonal'
  | 'educational' | 'testimonial' | 'bts' | 'brand' | 'other'

type StepId =
  | 'content_type'
  | 'promo_details' | 'product_details' | 'event_details'
  | 'seasonal_details' | 'edu_details' | 'testimonial_details'
  | 'placement' | 'timing'
  | 'main_message' | 'visuals' | 'style' | 'avoid'
  | 'review'

interface FormState extends GraphicRequestPayload {
  content_type: ContentType
}

const CONTENT_TYPES: { id: ContentType; label: string; icon: typeof Tag; detail: StepId | null }[] = [
  { id: 'promo',        label: 'Promotion / offer',  icon: Tag,            detail: 'promo_details' },
  { id: 'product',      label: 'New product or item', icon: ShoppingBag,    detail: 'product_details' },
  { id: 'event',        label: 'Event or announcement', icon: PartyPopper, detail: 'event_details' },
  { id: 'seasonal',     label: 'Seasonal / holiday',  icon: Snowflake,      detail: 'seasonal_details' },
  { id: 'educational',  label: 'Educational / tip',   icon: GraduationCap,  detail: 'edu_details' },
  { id: 'testimonial',  label: 'Testimonial / review', icon: Quote,         detail: 'testimonial_details' },
  { id: 'bts',          label: 'Behind the scenes',    icon: Camera,         detail: null },
  { id: 'brand',        label: 'Brand awareness',      icon: Sun,            detail: null },
  { id: 'other',        label: 'Something else',       icon: MoreHorizontal, detail: null },
]

const PLACEMENTS: { id: string; label: string; sub: string }[] = [
  { id: 'feed',       label: 'Instagram feed',  sub: '1080 × 1350 px' },
  { id: 'story',      label: 'Story',           sub: '1080 × 1920 px' },
  { id: 'reel-cover', label: 'Reel cover',      sub: '1080 × 1920 px' },
  { id: 'carousel',   label: 'Carousel',        sub: 'Multiple slides' },
  { id: 'banner',     label: 'Profile banner',  sub: '820 × 312 px' },
  { id: 'custom',     label: 'Custom size',     sub: 'You choose' },
]

const PRESET_RATIOS = [
  { id: '1:1',  w: 1, h: 1 },
  { id: '4:5',  w: 4, h: 5 },
  { id: '9:16', w: 9, h: 16 },
  { id: '16:9', w: 16, h: 9 },
  { id: '4:3',  w: 4, h: 3 },
  { id: '3:2',  w: 3, h: 2 },
  { id: '2:3',  w: 2, h: 3 },
]

const URGENCY_OPTIONS: { id: 'flexible' | 'standard' | 'urgent'; label: string; sub: string }[] = [
  { id: 'flexible', label: 'Flexible',  sub: "We'll fit it into the schedule" },
  { id: 'standard', label: 'Standard',  sub: '2–3 business days' },
  { id: 'urgent',   label: 'Urgent',    sub: 'Hard deadline — let us know' },
]

const CTA_OPTIONS = [
  'Order now', 'Visit us', 'DM to book', 'Link in bio', 'Learn more', 'No CTA',
]

const MOOD_OPTIONS = [
  'Bold & energetic', 'Clean & minimal', 'Warm & inviting',
  'Professional', 'Playful', 'Luxury', 'Festive',
]

const COLOR_OPTIONS = [
  'Use brand colors', 'Light & airy', 'Dark & bold', 'Seasonal',
]

const TESTIMONIAL_SOURCES = ['Google', 'Yelp', 'Direct', 'Social']
const PRODUCT_STATUSES = ['Brand new', 'Coming soon', 'Already available']

/* ─── Helpers ──────────────────────────────────────────────── */

const OPTIONAL_STEPS: StepId[] = ['main_message', 'visuals', 'style', 'avoid']

const SKIP_LABELS: Record<string, string> = {
  main_message: "Skip — we'll write the copy",
  visuals: "Skip — we'll source a photo",
  style: "Skip — use your judgment",
  avoid: "Skip — nothing to add",
}

const OPTIONAL_BANNER_TEXT: Record<string, string> = {
  main_message: "This step is optional. Leave anything blank and our copywriter will handle it for you.",
  visuals: "This step is optional. If you don't have photos, we'll source a great one for you.",
  style: "This step is optional. We'll match your brand if you skip it.",
  avoid: "This step is optional. Helps us steer clear of anything you don't love.",
}

function emptyForm(): FormState {
  return {
    content_type: 'promo',
    uploaded_asset_urls: [],
    reference_asset_urls: [],
    mood_tags: [],
    call_to_action: [],
    source_stock_photo: false,
    include_logo: true,
  }
}

/* ─── Main page ───────────────────────────────────────────── */

export default function GraphicRequestBuilderPage() {
  const router = useRouter()
  const supabase = createClient()
  const [form, setForm] = useState<FormState>(emptyForm())
  const [stepIdx, setStepIdx] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Build step list dynamically based on chosen content type
  const steps: StepId[] = useMemo(() => {
    const detailStep = CONTENT_TYPES.find(c => c.id === form.content_type)?.detail ?? null
    return [
      'content_type',
      ...(detailStep ? [detailStep] : []),
      'placement',
      'timing',
      'main_message',
      'visuals',
      'style',
      'avoid',
      'review',
    ] as StepId[]
  }, [form.content_type])

  const currentStep = steps[stepIdx]
  const totalSteps = steps.length
  const progress = ((stepIdx + 1) / totalSteps) * 100

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function next() {
    setError(null)
    if (stepIdx < totalSteps - 1) setStepIdx(stepIdx + 1)
  }
  function back() {
    setError(null)
    if (stepIdx > 0) setStepIdx(stepIdx - 1)
  }
  function jumpTo(s: StepId) {
    const idx = steps.indexOf(s)
    if (idx >= 0) setStepIdx(idx)
  }

  // ── Validation per step ──
  function canAdvance(): boolean {
    switch (currentStep) {
      case 'content_type': return !!form.content_type
      case 'promo_details': return !!form.offer_text?.trim()
      case 'product_details': return !!form.product_name?.trim()
      case 'event_details': return !!form.event_name?.trim() && !!form.event_date?.trim()
      case 'seasonal_details': return !!form.season_name?.trim()
      case 'edu_details': return !!form.edu_topic?.trim()
      case 'testimonial_details': return !!form.testimonial_quote?.trim()
      case 'placement':
        if (!form.placement) return false
        if (form.placement === 'carousel' && !form.carousel_slide_count) return false
        return true
      case 'timing': return !!form.publish_date && !!form.urgency
      default: return true
    }
  }

  // ── File upload helper ──
  async function uploadFiles(files: FileList | File[]): Promise<string[]> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []
    const urls: string[] = []
    for (const file of Array.from(files)) {
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `${user.id}/graphic-requests/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      const { error: uploadErr } = await supabase.storage
        .from('client-photos')
        .upload(path, file, { upsert: false })
      if (!uploadErr) {
        const { data } = supabase.storage.from('client-photos').getPublicUrl(path)
        urls.push(data.publicUrl)
      }
    }
    return urls
  }

  // ── Submit ──
  async function handleSubmit() {
    setSubmitting(true)
    setError(null)
    const result = await submitGraphicRequest(form)
    setSubmitting(false)
    if (result.success && result.data) {
      router.push(`/dashboard/social/requests/${result.data.requestId}`)
    } else if (!result.success) {
      setError(result.error || 'Failed to submit request')
    }
  }

  const isOptional = OPTIONAL_STEPS.includes(currentStep)

  return (
    <div className="max-w-3xl mx-auto">
      {/* ── Header w/ progress ── */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-4">
          <Link
            href="/dashboard/social/requests/new"
            className="text-ink-4 hover:text-ink transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1">
            <h1 className="font-[family-name:var(--font-display)] text-xl text-ink">
              New Graphic Request
            </h1>
            <p className="text-[11px] text-ink-4 mt-0.5">
              Step {stepIdx + 1} of {totalSteps}
            </p>
          </div>
        </div>
        <div className="h-1.5 bg-bg-2 rounded-full overflow-hidden">
          <div
            className="h-full bg-brand transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* ── Optional banner ── */}
      {isOptional && (
        <div className="mb-5 bg-brand-tint/60 border border-brand/20 rounded-xl p-3.5 flex items-start gap-3">
          <div className="w-7 h-7 rounded-lg bg-white flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-3.5 h-3.5 text-brand-dark" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold text-brand-dark uppercase tracking-wide">Optional step</p>
            <p className="text-xs text-ink-2 mt-0.5">{OPTIONAL_BANNER_TEXT[currentStep]}</p>
          </div>
          <button
            onClick={next}
            className="text-xs font-medium text-brand-dark hover:underline whitespace-nowrap self-center"
          >
            {SKIP_LABELS[currentStep]} →
          </button>
        </div>
      )}

      {/* ── Step body ── */}
      <div className="bg-white rounded-2xl border border-ink-6 p-6 lg:p-8 min-h-[300px]">
        {currentStep === 'content_type' && (
          <ContentTypeStep
            value={form.content_type}
            onChange={v => { update('content_type', v); setStepIdx(stepIdx + 1) }}
          />
        )}

        {currentStep === 'promo_details' && (
          <PromoStep form={form} update={update} />
        )}
        {currentStep === 'product_details' && (
          <ProductStep form={form} update={update} />
        )}
        {currentStep === 'event_details' && (
          <EventStep form={form} update={update} />
        )}
        {currentStep === 'seasonal_details' && (
          <SeasonalStep form={form} update={update} />
        )}
        {currentStep === 'edu_details' && (
          <EduStep form={form} update={update} />
        )}
        {currentStep === 'testimonial_details' && (
          <TestimonialStep form={form} update={update} />
        )}

        {currentStep === 'placement' && (
          <PlacementStep form={form} update={update} />
        )}
        {currentStep === 'timing' && (
          <TimingStep form={form} update={update} />
        )}
        {currentStep === 'main_message' && (
          <MainMessageStep form={form} update={update} />
        )}
        {currentStep === 'visuals' && (
          <VisualsStep
            form={form}
            update={update}
            uploadFiles={uploadFiles}
          />
        )}
        {currentStep === 'style' && (
          <StyleStep
            form={form}
            update={update}
            uploadFiles={uploadFiles}
          />
        )}
        {currentStep === 'avoid' && (
          <AvoidStep form={form} update={update} />
        )}
        {currentStep === 'review' && (
          <ReviewStep form={form} jumpTo={jumpTo} />
        )}
      </div>

      {error && (
        <div className="mt-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* ── Footer nav ── */}
      <div className="mt-5 flex items-center justify-between">
        <button
          onClick={back}
          disabled={stepIdx === 0}
          className="text-sm text-ink-3 hover:text-ink transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        {currentStep === 'review' ? (
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="bg-brand hover:bg-brand-dark text-white text-sm font-semibold rounded-lg px-6 py-2.5 flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Submit request
          </button>
        ) : currentStep !== 'content_type' && (
          <button
            onClick={next}
            disabled={!canAdvance()}
            className="bg-brand hover:bg-brand-dark text-white text-sm font-semibold rounded-lg px-5 py-2.5 flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Continue
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  )
}

/* ─── Reusable building blocks ───────────────────────────── */

function StepHeading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-5">
      <h2 className="font-[family-name:var(--font-display)] text-xl text-ink">{title}</h2>
      {hint && <p className="text-xs text-ink-4 mt-1">{hint}</p>}
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1.5 block">
      {children}
    </label>
  )
}

function TextField({
  label, value, onChange, placeholder, type = 'text', required,
}: {
  label: string
  value: string | undefined
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  required?: boolean
}) {
  return (
    <div>
      <FieldLabel>
        {label} {required && <span className="text-red-500">*</span>}
      </FieldLabel>
      <input
        type={type}
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-ink-6 rounded-lg px-3 py-2.5 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
      />
    </div>
  )
}

function TextareaField({
  label, value, onChange, placeholder, rows = 4, required,
}: {
  label: string
  value: string | undefined
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
  required?: boolean
}) {
  return (
    <div>
      <FieldLabel>
        {label} {required && <span className="text-red-500">*</span>}
      </FieldLabel>
      <textarea
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full border border-ink-6 rounded-lg px-3 py-2.5 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand resize-none"
      />
    </div>
  )
}

function ChipSelect<T extends string>({
  options, value, onChange, multi = false,
}: {
  options: readonly T[] | T[]
  value: T | T[] | undefined
  onChange: (v: T | T[]) => void
  multi?: boolean
}) {
  function isActive(o: T) {
    if (multi) return Array.isArray(value) && value.includes(o)
    return value === o
  }
  function toggle(o: T) {
    if (multi) {
      const arr = (Array.isArray(value) ? value : []) as T[]
      onChange(arr.includes(o) ? arr.filter(v => v !== o) : [...arr, o])
    } else {
      onChange(o)
    }
  }
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(o => (
        <button
          key={o}
          type="button"
          onClick={() => toggle(o)}
          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
            isActive(o)
              ? 'bg-brand-tint text-brand-dark border-brand/30'
              : 'bg-white text-ink-3 border-ink-6 hover:text-ink-2 hover:border-ink-5'
          }`}
        >
          {isActive(o) && <Check className="w-3 h-3 inline mr-1" />}
          {o}
        </button>
      ))}
    </div>
  )
}

/* ─── Step components ───────────────────────────────────── */

function ContentTypeStep({
  value, onChange,
}: {
  value: ContentType
  onChange: (v: ContentType) => void
}) {
  return (
    <>
      <StepHeading
        title="What do you need a graphic for?"
        hint="Pick the one that fits best — this helps us ask the right questions."
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {CONTENT_TYPES.map(t => {
          const Icon = t.icon
          const active = value === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onChange(t.id)}
              className={`text-left p-4 rounded-xl border transition-all ${
                active
                  ? 'bg-brand-tint border-brand/40 ring-2 ring-brand/20'
                  : 'bg-white border-ink-6 hover:border-brand/30 hover:shadow-sm'
              }`}
            >
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-2 ${
                active ? 'bg-white' : 'bg-bg-2'
              }`}>
                <Icon className={`w-4 h-4 ${active ? 'text-brand-dark' : 'text-ink-3'}`} />
              </div>
              <p className="text-sm font-medium text-ink">{t.label}</p>
            </button>
          )
        })}
      </div>
    </>
  )
}

interface StepProps {
  form: FormState
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void
}

function PromoStep({ form, update }: StepProps) {
  return (
    <>
      <StepHeading title="Tell us about the promotion" />
      <div className="space-y-4">
        <TextField
          label="Offer or discount"
          required
          value={form.offer_text || ''}
          onChange={v => update('offer_text', v)}
          placeholder="20% off all entrees"
        />
        <TextField
          label="Promo code — leave blank if none"
          value={form.promo_code || ''}
          onChange={v => update('promo_code', v)}
          placeholder="WEEKEND20"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextField
            label="Offer expiry — leave blank if ongoing"
            value={form.offer_expiry || ''}
            onChange={v => update('offer_expiry', v)}
            placeholder="Until April 30"
          />
          <TextField
            label="Price to display — leave blank to hide"
            value={form.price_display || ''}
            onChange={v => update('price_display', v)}
            placeholder="$24.99"
          />
        </div>
      </div>
    </>
  )
}

function ProductStep({ form, update }: StepProps) {
  return (
    <>
      <StepHeading title="Tell us about the product" />
      <div className="space-y-4">
        <TextField
          label="Product or item name"
          required
          value={form.product_name || ''}
          onChange={v => update('product_name', v)}
          placeholder="Truffle Burger"
        />
        <TextareaField
          label="Short description — leave blank and we'll write it"
          rows={3}
          value={form.product_desc || ''}
          onChange={v => update('product_desc', v)}
          placeholder="Leave blank — we'll write it"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextField
            label="Price — leave blank to hide"
            value={form.product_price || ''}
            onChange={v => update('product_price', v)}
            placeholder="$18"
          />
          <div>
            <FieldLabel>Status</FieldLabel>
            <ChipSelect
              options={PRODUCT_STATUSES}
              value={form.product_status || ''}
              onChange={v => update('product_status', v as string)}
            />
          </div>
        </div>
      </div>
    </>
  )
}

function EventStep({ form, update }: StepProps) {
  return (
    <>
      <StepHeading title="Tell us about the event" />
      <div className="space-y-4">
        <TextField
          label="Event name"
          required
          value={form.event_name || ''}
          onChange={v => update('event_name', v)}
          placeholder="Spring Tasting Menu Launch"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextField
            label="Date"
            required
            type="date"
            value={form.event_date || ''}
            onChange={v => update('event_date', v)}
          />
          <TextField
            label="Time"
            value={form.event_time || ''}
            onChange={v => update('event_time', v)}
            placeholder="6:00 PM"
          />
        </div>
        <TextField
          label="Location — leave blank if same as your business"
          value={form.event_location || ''}
          onChange={v => update('event_location', v)}
          placeholder="Leave blank if at your business"
        />
        <TextField
          label="Ticket / RSVP info — leave blank if not applicable"
          value={form.event_ticket_info || ''}
          onChange={v => update('event_ticket_info', v)}
          placeholder="Free with reservation"
        />
      </div>
    </>
  )
}

function SeasonalStep({ form, update }: StepProps) {
  return (
    <>
      <StepHeading title="Tell us about the occasion" />
      <div className="space-y-4">
        <TextField
          label="Holiday or occasion"
          required
          value={form.season_name || ''}
          onChange={v => update('season_name', v)}
          placeholder="Mother's Day"
        />
        <TextareaField
          label="Message or sentiment — leave blank and we'll craft something"
          rows={3}
          value={form.season_message || ''}
          onChange={v => update('season_message', v)}
          placeholder="Leave blank — we'll craft something"
        />
        <TextField
          label="Seasonal offer — leave blank if no offer"
          value={form.season_offer || ''}
          onChange={v => update('season_offer', v)}
          placeholder="Free dessert for moms"
        />
      </div>
    </>
  )
}

function EduStep({ form, update }: StepProps) {
  return (
    <>
      <StepHeading title="Tell us about the tip" />
      <div className="space-y-4">
        <TextField
          label="Topic or tip"
          required
          value={form.edu_topic || ''}
          onChange={v => update('edu_topic', v)}
          placeholder="3 reasons to choose grass-fed beef"
        />
        <TextareaField
          label="Key points to cover — leave blank and we'll decide"
          rows={4}
          value={form.edu_key_points || ''}
          onChange={v => update('edu_key_points', v)}
          placeholder="Leave blank — we'll decide"
        />
      </div>
    </>
  )
}

function TestimonialStep({ form, update }: StepProps) {
  return (
    <>
      <StepHeading title="Tell us about the testimonial" />
      <div className="space-y-4">
        <TextareaField
          label="Quote text"
          required
          rows={4}
          value={form.testimonial_quote || ''}
          onChange={v => update('testimonial_quote', v)}
          placeholder="Best brunch in town. The eggs benedict is unreal."
        />
        <TextField
          label="Customer name — leave blank for anonymous"
          value={form.testimonial_name || ''}
          onChange={v => update('testimonial_name', v)}
          placeholder="Sarah K."
        />
        <div>
          <FieldLabel>Source</FieldLabel>
          <ChipSelect
            options={TESTIMONIAL_SOURCES}
            value={form.testimonial_source || ''}
            onChange={v => update('testimonial_source', v as string)}
          />
        </div>
      </div>
    </>
  )
}

function PlacementStep({ form, update }: StepProps) {
  return (
    <>
      <StepHeading
        title="Where is this graphic going?"
        hint="We'll set the right size automatically — or you can customize."
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {PLACEMENTS.map(p => {
          const active = form.placement === p.id
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => update('placement', p.id)}
              className={`text-left p-4 rounded-xl border transition-all ${
                active
                  ? 'bg-brand-tint border-brand/40 ring-2 ring-brand/20'
                  : 'bg-white border-ink-6 hover:border-brand/30'
              }`}
            >
              <p className="text-sm font-medium text-ink">{p.label}</p>
              <p className="text-[11px] text-ink-4 mt-0.5">{p.sub}</p>
            </button>
          )
        })}
      </div>

      {/* Carousel slide picker */}
      {form.placement === 'carousel' && (
        <div className="mt-5 p-4 bg-bg-2 rounded-xl">
          <FieldLabel>How many slides?</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {[2, 3, 4, 5, 6].map(n => (
              <button
                key={n}
                type="button"
                onClick={() => update('carousel_slide_count', n)}
                className={`w-10 h-10 rounded-lg text-sm font-medium border transition-colors ${
                  form.carousel_slide_count === n
                    ? 'bg-brand-tint text-brand-dark border-brand/30'
                    : 'bg-white text-ink-3 border-ink-6 hover:border-ink-5'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Custom size sub-UI */}
      {form.placement === 'custom' && <CustomSizePicker form={form} update={update} />}
    </>
  )
}

function CustomSizePicker({ form, update }: StepProps) {
  const mode = form.custom_dim_mode || 'ratio'
  const setMode = (m: 'ratio' | 'px' | 'in' | 'cm') => update('custom_dim_mode', m)

  // Convert in/cm → px preview
  const dpi = form.custom_dpi || 150
  const pxFromIn = (v: number) => Math.round(v * dpi)
  const pxFromCm = (v: number) => Math.round((v / 2.54) * dpi)

  return (
    <div className="mt-5 p-4 bg-bg-2 rounded-xl space-y-4">
      <div className="flex gap-1 bg-white rounded-lg p-1 border border-ink-6 w-fit">
        {(['ratio', 'px', 'in', 'cm'] as const).map(m => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              mode === m ? 'bg-brand-tint text-brand-dark' : 'text-ink-3 hover:text-ink'
            }`}
          >
            {m === 'ratio' ? 'Ratio' : m === 'px' ? 'Pixels' : m === 'in' ? 'Inches' : 'Centimeters'}
          </button>
        ))}
      </div>

      {mode === 'ratio' && (
        <div>
          <FieldLabel>Pick a ratio</FieldLabel>
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
            {PRESET_RATIOS.map(r => {
              const active = form.custom_ratio === r.id
              const w = 38
              const h = (r.h / r.w) * w
              const cap = h > 50 ? 50 : h
              const adjW = h > 50 ? (w * 50) / h : w
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => update('custom_ratio', r.id)}
                  className={`p-2 rounded-lg border flex flex-col items-center gap-1.5 ${
                    active ? 'border-brand/40 bg-brand-tint' : 'border-ink-6 hover:border-ink-5 bg-white'
                  }`}
                >
                  <div
                    className={`${active ? 'bg-brand-dark' : 'bg-ink-5'} rounded`}
                    style={{ width: `${adjW}px`, height: `${cap}px` }}
                  />
                  <span className="text-[10px] font-medium text-ink-3">{r.id}</span>
                </button>
              )
            })}
            <button
              type="button"
              onClick={() => update('custom_ratio', 'custom')}
              className={`p-2 rounded-lg border flex flex-col items-center justify-center ${
                form.custom_ratio === 'custom' ? 'border-brand/40 bg-brand-tint' : 'border-ink-6 hover:border-ink-5 bg-white'
              }`}
            >
              <span className="text-[10px] font-medium text-ink-3">Custom</span>
            </button>
          </div>
          {form.custom_ratio === 'custom' && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <TextField
                label="Width"
                type="number"
                value={form.custom_width?.toString() || ''}
                onChange={v => update('custom_width', Number(v) || null)}
                placeholder="16"
              />
              <TextField
                label="Height"
                type="number"
                value={form.custom_height?.toString() || ''}
                onChange={v => update('custom_height', Number(v) || null)}
                placeholder="9"
              />
            </div>
          )}
        </div>
      )}

      {mode === 'px' && (
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Width (px)"
            type="number"
            value={form.custom_width?.toString() || ''}
            onChange={v => { update('custom_width', Number(v) || null); update('custom_unit', 'px') }}
            placeholder="1080"
          />
          <TextField
            label="Height (px)"
            type="number"
            value={form.custom_height?.toString() || ''}
            onChange={v => { update('custom_height', Number(v) || null); update('custom_unit', 'px') }}
            placeholder="1080"
          />
        </div>
      )}

      {(mode === 'in' || mode === 'cm') && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <TextField
              label={`Width (${mode})`}
              type="number"
              value={form.custom_width?.toString() || ''}
              onChange={v => { update('custom_width', Number(v) || null); update('custom_unit', mode) }}
              placeholder={mode === 'in' ? '8.5' : '21'}
            />
            <TextField
              label={`Height (${mode})`}
              type="number"
              value={form.custom_height?.toString() || ''}
              onChange={v => { update('custom_height', Number(v) || null); update('custom_unit', mode) }}
              placeholder={mode === 'in' ? '11' : '29.7'}
            />
          </div>
          <div>
            <FieldLabel>DPI</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {[
                { v: 72, label: '72 — Web' },
                { v: 150, label: '150 — Standard print' },
                { v: 300, label: '300 — High quality' },
              ].map(o => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => update('custom_dpi', o.v)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
                    (form.custom_dpi || 150) === o.v
                      ? 'bg-brand-tint text-brand-dark border-brand/30'
                      : 'bg-white text-ink-3 border-ink-6 hover:border-ink-5'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          {form.custom_width && form.custom_height && (
            <p className="text-[11px] text-ink-4">
              ≈ {mode === 'in' ? pxFromIn(form.custom_width) : pxFromCm(form.custom_width)} ×{' '}
              {mode === 'in' ? pxFromIn(form.custom_height) : pxFromCm(form.custom_height)} px
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function TimingStep({ form, update }: StepProps) {
  return (
    <>
      <StepHeading title="When do you need this?" />
      <div className="space-y-5">
        <TextField
          label="Publish date"
          type="date"
          required
          value={form.publish_date || ''}
          onChange={v => update('publish_date', v)}
        />
        <div>
          <FieldLabel>Urgency *</FieldLabel>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {URGENCY_OPTIONS.map(o => {
              const active = form.urgency === o.id
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => update('urgency', o.id)}
                  className={`text-left p-3 rounded-xl border transition-all ${
                    active
                      ? 'bg-brand-tint border-brand/40 ring-2 ring-brand/20'
                      : 'bg-white border-ink-6 hover:border-brand/30'
                  }`}
                >
                  <p className="text-sm font-medium text-ink">{o.label}</p>
                  <p className="text-[11px] text-ink-4 mt-0.5">{o.sub}</p>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}

function MainMessageStep({ form, update }: StepProps) {
  return (
    <>
      <StepHeading title="What should the graphic say?" />
      <div className="space-y-4">
        <TextareaField
          label="Main message — what should someone take away?"
          rows={3}
          value={form.main_message || ''}
          onChange={v => update('main_message', v)}
          placeholder="Leave blank — we'll write it"
        />
        <TextField
          label="Headline on the graphic — leave blank and we'll write it"
          value={form.headline_text || ''}
          onChange={v => update('headline_text', v)}
          placeholder="Leave blank — we'll write it"
        />
        <div>
          <FieldLabel>Call to action — pick any that apply</FieldLabel>
          <ChipSelect
            options={CTA_OPTIONS}
            value={form.call_to_action || []}
            onChange={v => update('call_to_action', v as string[])}
            multi
          />
        </div>
      </div>
    </>
  )
}

function VisualsStep({
  form, update, uploadFiles,
}: StepProps & { uploadFiles: (files: FileList | File[]) => Promise<string[]> }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    const urls = await uploadFiles(files)
    update('uploaded_asset_urls', [...(form.uploaded_asset_urls || []), ...urls])
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  function removeAt(i: number) {
    const arr = [...(form.uploaded_asset_urls || [])]
    arr.splice(i, 1)
    update('uploaded_asset_urls', arr)
  }

  return (
    <>
      <StepHeading title="Do you have photos to use?" />
      <div className="space-y-5">
        <div>
          <FieldLabel>Upload photos — leave blank and we'll source one</FieldLabel>
          <div className="flex flex-wrap gap-3">
            {(form.uploaded_asset_urls || []).map((url, i) => (
              <div key={url} className="relative">
                <img src={url} alt="" className="w-24 h-24 rounded-lg object-cover border border-ink-6" />
                <button
                  type="button"
                  onClick={() => removeAt(i)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-ink text-white flex items-center justify-center hover:bg-red-500"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-24 h-24 rounded-lg border-2 border-dashed border-ink-5 hover:border-brand/50 hover:bg-brand-tint/30 flex flex-col items-center justify-center gap-1 text-ink-4 hover:text-brand-dark transition-colors"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              <span className="text-[10px] font-medium">Upload</span>
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/heic,image/webp"
            multiple
            className="hidden"
            onChange={e => handleFiles(e.target.files)}
          />
          <p className="text-[10px] text-ink-4 mt-2">JPG, PNG, or HEIC. Multiple files OK.</p>
        </div>

        <ToggleRow
          label="We should source a stock photo"
          sub="Apnosh will find a fitting image for you"
          value={form.source_stock_photo || false}
          onChange={v => update('source_stock_photo', v)}
        />
        <ToggleRow
          label="Include our logo"
          sub="Uses the logo we have on file"
          value={form.include_logo ?? true}
          onChange={v => update('include_logo', v)}
        />
      </div>
    </>
  )
}

function ToggleRow({
  label, sub, value, onChange,
}: { label: string; sub: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="w-full flex items-center justify-between gap-3 p-3 rounded-xl border border-ink-6 hover:border-ink-5 transition-colors bg-white text-left"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ink">{label}</p>
        <p className="text-[11px] text-ink-4 mt-0.5">{sub}</p>
      </div>
      <div className={`w-10 h-6 rounded-full flex items-center transition-colors flex-shrink-0 ${
        value ? 'bg-brand justify-end' : 'bg-ink-6 justify-start'
      }`}>
        <div className="w-5 h-5 rounded-full bg-white shadow-sm mx-0.5" />
      </div>
    </button>
  )
}

function StyleStep({
  form, update, uploadFiles,
}: StepProps & { uploadFiles: (files: FileList | File[]) => Promise<string[]> }) {
  const refRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  async function handleRefFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    const urls = await uploadFiles(files)
    update('reference_asset_urls', [...(form.reference_asset_urls || []), ...urls])
    setUploading(false)
    if (refRef.current) refRef.current.value = ''
  }

  function removeRefAt(i: number) {
    const arr = [...(form.reference_asset_urls || [])]
    arr.splice(i, 1)
    update('reference_asset_urls', arr)
  }

  return (
    <>
      <StepHeading title="What should it feel like?" />
      <div className="space-y-5">
        <div>
          <FieldLabel>Overall vibe — pick any that apply</FieldLabel>
          <ChipSelect
            options={MOOD_OPTIONS}
            value={form.mood_tags || []}
            onChange={v => update('mood_tags', v as string[])}
            multi
          />
        </div>
        <div>
          <FieldLabel>Colors</FieldLabel>
          <ChipSelect
            options={COLOR_OPTIONS}
            value={form.color_preference || ''}
            onChange={v => update('color_preference', v as string)}
          />
        </div>
        <TextField
          label="Reference link — leave blank if none"
          value={form.reference_link || ''}
          onChange={v => update('reference_link', v)}
          placeholder="https://..."
        />
        <div>
          <FieldLabel>Reference image upload — optional</FieldLabel>
          <div className="flex flex-wrap gap-3">
            {(form.reference_asset_urls || []).map((url, i) => (
              <div key={url} className="relative">
                <img src={url} alt="" className="w-20 h-20 rounded-lg object-cover border border-ink-6" />
                <button
                  type="button"
                  onClick={() => removeRefAt(i)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-ink text-white flex items-center justify-center hover:bg-red-500"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => refRef.current?.click()}
              className="w-20 h-20 rounded-lg border-2 border-dashed border-ink-5 hover:border-brand/50 hover:bg-brand-tint/30 flex flex-col items-center justify-center gap-1 text-ink-4 hover:text-brand-dark"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            </button>
          </div>
          <input
            ref={refRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={e => handleRefFiles(e.target.files)}
          />
        </div>
      </div>
    </>
  )
}

function AvoidStep({ form, update }: StepProps) {
  return (
    <>
      <StepHeading title="Anything we should avoid?" />
      <div className="space-y-4">
        <TextField
          label="Colors to avoid — leave blank if you're not sure"
          value={form.avoid_colors || ''}
          onChange={v => update('avoid_colors', v)}
          placeholder="Leave blank if you're not sure"
        />
        <TextField
          label="Styles or elements to avoid — leave blank if you're not sure"
          value={form.avoid_styles || ''}
          onChange={v => update('avoid_styles', v)}
          placeholder="Leave blank if you're not sure"
        />
        <TextareaField
          label="Notes for the designer — leave blank if nothing else"
          rows={3}
          value={form.designer_notes || ''}
          onChange={v => update('designer_notes', v)}
          placeholder="Leave blank if nothing else"
        />

        {/* Visually distinct internal note */}
        <div className="mt-4 p-4 bg-bg-2 rounded-xl border border-ink-6">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-3.5 h-3.5 text-ink-4" />
            <p className="text-[11px] font-semibold text-ink-3 uppercase tracking-wide">
              Private note to your account manager
            </p>
          </div>
          <p className="text-[11px] text-ink-4 mb-2">Not shown to the designer.</p>
          <textarea
            value={form.internal_note || ''}
            onChange={e => update('internal_note', e.target.value)}
            placeholder="Anything else just for our team..."
            rows={3}
            className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand resize-none bg-white"
          />
        </div>
      </div>
    </>
  )
}

function ReviewStep({
  form, jumpTo,
}: { form: FormState; jumpTo: (s: StepId) => void }) {
  const typeLabel = CONTENT_TYPES.find(c => c.id === form.content_type)?.label ?? form.content_type
  const placementLabel = PLACEMENTS.find(p => p.id === form.placement)?.label ?? form.placement
  const placementSub = PLACEMENTS.find(p => p.id === form.placement)?.sub ?? ''

  return (
    <>
      <StepHeading
        title="Review and submit"
        hint="Double-check the details below. Click any section to jump back and edit."
      />

      {/* What & where */}
      <ReviewSection
        title="What & where"
        icon={ImageIcon}
        onEdit={() => jumpTo('content_type')}
      >
        <ReviewLine label="Content type" value={typeLabel} />
        {form.placement && (
          <ReviewLine label="Placement" value={`${placementLabel} · ${placementSub}`} />
        )}
        {form.placement === 'carousel' && form.carousel_slide_count && (
          <ReviewLine label="Slides" value={`${form.carousel_slide_count} slides`} />
        )}
        {form.publish_date && (
          <ReviewLine label="Publish date" value={form.publish_date} />
        )}
        {form.urgency && (
          <ReviewLine label="Urgency" value={URGENCY_OPTIONS.find(u => u.id === form.urgency)?.label || form.urgency} />
        )}
      </ReviewSection>

      {/* Content details */}
      <ReviewSection
        title="Content details"
        icon={FileText}
        onEdit={() => {
          const detail = CONTENT_TYPES.find(c => c.id === form.content_type)?.detail
          if (detail) jumpTo(detail)
          else jumpTo('main_message')
        }}
      >
        <DetailLines form={form} />
        {form.main_message && <ReviewLine label="Main message" value={form.main_message} />}
        {form.headline_text && <ReviewLine label="Headline" value={form.headline_text} />}
        {form.call_to_action && form.call_to_action.length > 0 && (
          <ReviewLine label="CTA" value={form.call_to_action.join(' · ')} />
        )}
        {!form.main_message && !form.headline_text && (!form.call_to_action || form.call_to_action.length === 0) && (
          <SkippedLine label="Message" />
        )}
      </ReviewSection>

      {/* Visuals */}
      <ReviewSection title="Visuals" icon={Camera} onEdit={() => jumpTo('visuals')}>
        {form.uploaded_asset_urls && form.uploaded_asset_urls.length > 0 ? (
          <div className="flex flex-wrap gap-2 mt-2">
            {form.uploaded_asset_urls.map(url => (
              <img key={url} src={url} alt="" className="w-16 h-16 rounded-lg object-cover border border-ink-6" />
            ))}
          </div>
        ) : form.source_stock_photo ? (
          <p className="text-xs text-ink-3">We&apos;ll source a stock photo</p>
        ) : (
          <SkippedLine label="Visuals" />
        )}
        <ReviewLine label="Include logo" value={form.include_logo ? 'Yes' : 'No'} />
      </ReviewSection>

      {/* Style */}
      <ReviewSection title="Look & feel" icon={Palette} onEdit={() => jumpTo('style')}>
        {form.mood_tags && form.mood_tags.length > 0 ? (
          <ReviewLine label="Vibe" value={form.mood_tags.join(' · ')} />
        ) : (
          <SkippedLine label="Style" />
        )}
        {form.color_preference && <ReviewLine label="Colors" value={form.color_preference} />}
        {form.reference_link && <ReviewLine label="Reference" value={form.reference_link} />}
      </ReviewSection>

      {/* Avoid */}
      {(form.avoid_colors || form.avoid_styles || form.designer_notes || form.internal_note) && (
        <ReviewSection title="Avoid & notes" icon={AlertTriangle} onEdit={() => jumpTo('avoid')}>
          {form.avoid_colors && <ReviewLine label="Avoid colors" value={form.avoid_colors} />}
          {form.avoid_styles && <ReviewLine label="Avoid styles" value={form.avoid_styles} />}
          {form.designer_notes && <ReviewLine label="Designer notes" value={form.designer_notes} />}
          {form.internal_note && (
            <div className="mt-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-[10px] font-semibold text-amber-800 uppercase tracking-wide mb-0.5">Private note</p>
              <p className="text-xs text-amber-900">{form.internal_note}</p>
            </div>
          )}
        </ReviewSection>
      )}

      <p className="text-[11px] text-ink-4 text-center mt-5">
        Once submitted, you&apos;ll hear from us when your draft is ready to review.
      </p>
    </>
  )
}

function ReviewSection({
  title, icon: Icon, onEdit, children,
}: {
  title: string
  icon: typeof FileText
  onEdit: () => void
  children: React.ReactNode
}) {
  return (
    <div className="mb-4 border border-ink-6 rounded-xl p-4 bg-white">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-bg-2 flex items-center justify-center">
            <Icon className="w-3.5 h-3.5 text-ink-3" />
          </div>
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
        </div>
        <button
          onClick={onEdit}
          className="text-[11px] text-brand hover:text-brand-dark font-medium flex items-center gap-1"
        >
          <Edit3 className="w-3 h-3" /> Edit
        </button>
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function ReviewLine({ label, value }: { label: string; value: string | number | undefined }) {
  if (!value && value !== 0) return null
  return (
    <div className="flex items-start gap-3 text-xs">
      <span className="text-ink-4 font-medium w-24 flex-shrink-0">{label}</span>
      <span className="text-ink-2 flex-1">{value}</span>
    </div>
  )
}

function SkippedLine({ label }: { label: string }) {
  return (
    <p className="text-xs text-ink-4 italic">{label} — skipped, we&apos;ll use our judgment</p>
  )
}

function DetailLines({ form }: { form: FormState }) {
  switch (form.content_type) {
    case 'promo':
      return (
        <>
          <ReviewLine label="Offer" value={form.offer_text || undefined} />
          <ReviewLine label="Promo code" value={form.promo_code || undefined} />
          <ReviewLine label="Expires" value={form.offer_expiry || undefined} />
          <ReviewLine label="Price" value={form.price_display || undefined} />
        </>
      )
    case 'product':
      return (
        <>
          <ReviewLine label="Product" value={form.product_name || undefined} />
          <ReviewLine label="Description" value={form.product_desc || undefined} />
          <ReviewLine label="Price" value={form.product_price || undefined} />
          <ReviewLine label="Status" value={form.product_status || undefined} />
        </>
      )
    case 'event':
      return (
        <>
          <ReviewLine label="Event" value={form.event_name || undefined} />
          <ReviewLine label="Date" value={form.event_date || undefined} />
          <ReviewLine label="Time" value={form.event_time || undefined} />
          <ReviewLine label="Location" value={form.event_location || undefined} />
          <ReviewLine label="Tickets" value={form.event_ticket_info || undefined} />
        </>
      )
    case 'seasonal':
      return (
        <>
          <ReviewLine label="Occasion" value={form.season_name || undefined} />
          <ReviewLine label="Message" value={form.season_message || undefined} />
          <ReviewLine label="Offer" value={form.season_offer || undefined} />
        </>
      )
    case 'educational':
      return (
        <>
          <ReviewLine label="Topic" value={form.edu_topic || undefined} />
          <ReviewLine label="Key points" value={form.edu_key_points || undefined} />
        </>
      )
    case 'testimonial':
      return (
        <>
          <ReviewLine label="Quote" value={form.testimonial_quote || undefined} />
          <ReviewLine label="Customer" value={form.testimonial_name || undefined} />
          <ReviewLine label="Source" value={form.testimonial_source || undefined} />
        </>
      )
    default:
      return null
  }
}
