'use client'

import { useState, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, ArrowRight, Loader2, Check, Upload, X, Sparkles, Edit3,
  Tag, ShoppingBag, PartyPopper, Snowflake, GraduationCap, Quote,
  Camera, Sun, MoreHorizontal, Film, Mic, Music, Video, Layers,
  MessageCircle, Palette, Calendar, AlertTriangle, FileText,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { submitVideoRequest, type VideoRequestPayload } from '@/lib/client-portal-actions'

/* ─── Types & content ──────────────────────────────────────── */

type ContentType =
  | 'promo' | 'product' | 'event' | 'seasonal'
  | 'educational' | 'testimonial' | 'bts' | 'brand' | 'other'

// Consolidated from 19 individual questions down to 9 logical groups.
type StepId =
  | 'content_type'      // 1. What's this reel about
  | 'format'            // 2. Single/series + length
  | 'message'           // 3. Main message + hook + CTA
  | 'script'            // 4. Script owner + style + VO tone
  | 'footage'           // 5. Source + shoot details
  | 'music'             // 6. Music owner + feel
  | 'look'              // 7. Vibe + editing + references
  | 'where_when'        // 8. Avoid + private note + platforms + timing
  | 'review'            // 9. Review + submit

interface FormState extends VideoRequestPayload {
  content_type: ContentType
}

const CONTENT_TYPES: { id: ContentType; label: string; icon: typeof Tag }[] = [
  { id: 'promo',        label: 'Promotion / offer',     icon: Tag },
  { id: 'product',      label: 'New product or item',   icon: ShoppingBag },
  { id: 'event',        label: 'Event or announcement', icon: PartyPopper },
  { id: 'seasonal',     label: 'Seasonal / holiday',    icon: Snowflake },
  { id: 'educational',  label: 'Educational / tip',     icon: GraduationCap },
  { id: 'testimonial',  label: 'Testimonial / review',  icon: Quote },
  { id: 'bts',          label: 'Behind the scenes',     icon: Camera },
  { id: 'brand',        label: 'Brand awareness',       icon: Sun },
  { id: 'other',        label: 'Something else',        icon: MoreHorizontal },
]

const CTA_OPTIONS = [
  'Order now', 'Visit us', 'DM us', 'Link in bio', 'Follow for more', 'No CTA needed',
]

const LENGTH_OPTIONS: { id: string; label: string; sub: string }[] = [
  { id: 'under_15',       label: 'Under 15s',     sub: 'Snackable' },
  { id: '15_30',          label: '15–30s',        sub: 'Quick hit' },
  { id: '30_60',          label: '30–60s',        sub: 'Standard reel' },
  { id: '60_90',          label: '60–90s',        sub: 'Story-driven' },
  { id: 'apnosh_decides', label: 'Apnosh decides', sub: "We'll pick" },
]

const SCRIPT_OWNER_OPTIONS = [
  { id: 'apnosh', label: 'Apnosh writes it',        sub: "We'll handle the script" },
  { id: 'client', label: "I'll write it",           sub: 'You provide the full script' },
  { id: 'collab', label: "I'll draft, Apnosh refines", sub: "Send us your draft" },
]

const SCRIPT_STYLE_OPTIONS = [
  { id: 'voiceover',      label: 'Voiceover',      icon: Mic },
  { id: 'on_screen',      label: 'On-screen text', icon: FileText },
  { id: 'both',           label: 'Both',           icon: Layers },
  { id: 'apnosh_decides', label: 'Apnosh decides', icon: Sparkles },
]

const VOICEOVER_TONES = [
  { id: 'energetic',      label: 'Energetic & hyped' },
  { id: 'calm',           label: 'Calm & conversational' },
  { id: 'professional',   label: 'Professional & authoritative' },
  { id: 'fun',            label: 'Fun & playful' },
  { id: 'apnosh_decides', label: 'Apnosh decides' },
]

const FOOTAGE_OPTIONS = [
  { id: 'client_clips', label: "I'll send clips",   sub: 'Upload your own footage' },
  { id: 'animated',     label: 'Animated graphics', sub: 'Motion design only' },
  { id: 'stock',        label: 'Stock footage',     sub: "We'll source it" },
  { id: 'apnosh_films', label: 'Apnosh films it',   sub: 'We come shoot on location' },
  { id: 'mix',          label: 'A mix',             sub: 'Combination of the above' },
]

const WHO_ON_CAMERA = [
  { id: 'just_me',        label: 'Just me' },
  { id: 'two_three',      label: '2–3 people' },
  { id: 'full_team',      label: 'The full team' },
  { id: 'no_people',      label: 'No people — product or space only' },
  { id: 'apnosh_decides', label: 'Apnosh decides' },
]

const MUSIC_OWNER_OPTIONS = [
  { id: 'apnosh', label: 'Apnosh picks',         sub: "We'll choose the track" },
  { id: 'client', label: "I'll suggest something", sub: 'Point us at a song or vibe' },
  { id: 'none',   label: 'No music',             sub: 'Voiceover or natural sound' },
]

const MUSIC_FEEL_OPTIONS = [
  { id: 'hype',           label: 'Hype / energetic' },
  { id: 'chill',          label: 'Chill / relaxed' },
  { id: 'emotional',      label: 'Emotional' },
  { id: 'trending',       label: 'Trending / viral sound' },
  { id: 'corporate',      label: 'Clean & corporate' },
  { id: 'apnosh_decides', label: 'Apnosh decides' },
]

const MOOD_OPTIONS = [
  'Bold & punchy', 'Clean & minimal', 'Warm & authentic',
  'Professional', 'Fun & playful', 'Luxury', 'Raw / unfiltered',
]

const EDITING_STYLES = [
  { id: 'cinematic',      label: 'Cinematic' },
  { id: 'trendy',         label: 'Trendy / viral' },
  { id: 'documentary',    label: 'Documentary' },
  { id: 'clean',          label: 'Clean & simple' },
  { id: 'ugc',            label: 'UGC style' },
  { id: 'motion',         label: 'Motion graphics' },
  { id: 'slideshow',      label: 'Photo slideshow' },
  { id: 'apnosh_decides', label: 'Apnosh decides' },
]

const PLATFORM_OPTIONS = [
  { id: 'instagram',      label: 'Instagram' },
  { id: 'tiktok',         label: 'TikTok' },
  { id: 'facebook',       label: 'Facebook' },
  { id: 'youtube_shorts', label: 'YouTube Shorts' },
  { id: 'linkedin',       label: 'LinkedIn' },
]

const URGENCY_OPTIONS = [
  { id: 'flexible', label: 'Flexible',  sub: 'No rush' },
  { id: 'standard', label: 'Standard',  sub: 'A few business days' },
  { id: 'urgent',   label: 'Urgent',    sub: 'Hard deadline' },
]

const STEPS: StepId[] = [
  'content_type', 'format', 'message', 'script',
  'footage', 'music', 'look', 'where_when', 'review',
]

const STEP_TITLES: Record<StepId, string> = {
  content_type: 'Content',
  format: 'Format',
  message: 'Message',
  script: 'Script',
  footage: 'Footage',
  music: 'Music',
  look: 'Look',
  where_when: 'Where & when',
  review: 'Review',
}

function emptyForm(): FormState {
  return {
    content_type: 'promo',
    is_series: false,
    call_to_action: [],
    mood_tags: [],
    platforms: [],
    reference_asset_urls: [],
  }
}

/* ─── Main page ───────────────────────────────────────────── */

export default function VideoRequestBuilderPage() {
  const router = useRouter()
  const supabase = createClient()
  const [form, setForm] = useState<FormState>(emptyForm())
  const [stepIdx, setStepIdx] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const currentStep = STEPS[stepIdx]
  const totalSteps = STEPS.length
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
    const idx = STEPS.indexOf(s)
    if (idx >= 0) setStepIdx(idx)
  }

  function canAdvance(): boolean {
    switch (currentStep) {
      case 'content_type': return !!form.content_type
      case 'format':
        if (!form.length_preference) return false
        if (form.is_series && !form.series_episode_count) return false
        return true
      case 'script':
        return !!form.script_owner && !!form.script_style
      case 'footage':
        if (!form.footage_source) return false
        if (form.footage_source === 'apnosh_films' && !form.shoot_subject?.trim()) return false
        return true
      case 'music':
        return !!form.music_owner
      case 'look':
        return !!form.editing_style
      case 'where_when':
        return (form.platforms?.length ?? 0) > 0 && !!form.publish_date && !!form.urgency
      default:
        return true
    }
  }

  // Returns urls + failures so the caller can surface upload errors
  // instead of silently dropping files the owner thought they uploaded.
  async function uploadFiles(files: FileList | File[]): Promise<{ urls: string[]; failures: Array<{ name: string; reason: string }> }> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { urls: [], failures: [{ name: '(auth)', reason: 'You need to be signed in to upload files.' }] }
    const urls: string[] = []
    const failures: Array<{ name: string; reason: string }> = []
    for (const file of Array.from(files)) {
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `${user.id}/video-references/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      const { error: uploadErr } = await supabase.storage
        .from('client-photos')
        .upload(path, file, { upsert: false })
      if (uploadErr) {
        failures.push({ name: file.name, reason: uploadErr.message || 'Upload failed' })
      } else {
        const { data } = supabase.storage.from('client-photos').getPublicUrl(path)
        urls.push(data.publicUrl)
      }
    }
    return { urls, failures }
  }

  async function handleSubmit() {
    setSubmitting(true)
    setError(null)
    const result = await submitVideoRequest(form)
    setSubmitting(false)
    if (result.success && result.data) {
      router.push(`/dashboard/social/requests/${result.data.requestId}`)
    } else if (!result.success) {
      setError(result.error || 'Failed to submit request')
    }
  }

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
              New Short-form Video Request
            </h1>
            <p className="text-[11px] text-ink-4 mt-0.5">
              Step {stepIdx + 1} of {totalSteps} · {STEP_TITLES[currentStep]}
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

      {/* ── Step body ── */}
      <div className="bg-white rounded-2xl border border-ink-6 p-6 lg:p-8 min-h-[300px]">
        {currentStep === 'content_type' && (
          <ContentTypeStep
            value={form.content_type}
            onChange={v => { update('content_type', v); setStepIdx(stepIdx + 1) }}
          />
        )}
        {currentStep === 'format' && <FormatStep form={form} update={update} />}
        {currentStep === 'message' && <MessageStep form={form} update={update} />}
        {currentStep === 'script' && <ScriptStep form={form} update={update} />}
        {currentStep === 'footage' && <FootageStep form={form} update={update} />}
        {currentStep === 'music' && <MusicStep form={form} update={update} />}
        {currentStep === 'look' && (
          <LookStep form={form} update={update} uploadFiles={uploadFiles} />
        )}
        {currentStep === 'where_when' && <WhereWhenStep form={form} update={update} />}
        {currentStep === 'review' && <ReviewStep form={form} jumpTo={jumpTo} />}
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

function SectionHeading({ label }: { label: string }) {
  return (
    <p className="text-[10px] font-bold text-ink-4 uppercase tracking-wider mb-2">{label}</p>
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
  label, value, onChange, placeholder, type = 'text', required, optional,
}: {
  label: string
  value: string | undefined | null
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  required?: boolean
  optional?: boolean
}) {
  return (
    <div>
      <FieldLabel>
        {label}
        {required && <span className="text-red-500"> *</span>}
        {optional && <OptionalTag />}
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
  label, value, onChange, placeholder, rows = 4, required, optional,
}: {
  label: string
  value: string | undefined | null
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
  required?: boolean
  optional?: boolean
}) {
  return (
    <div>
      <FieldLabel>
        {label}
        {required && <span className="text-red-500"> *</span>}
        {optional && <OptionalTag />}
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

function PickerCard<T extends string>({
  options, value, onChange, multi = false, columns = 2, compact = false,
}: {
  options: { id: T; label: string; sub?: string; icon?: typeof Tag }[]
  value: T | T[] | undefined | null
  onChange: (v: T | T[]) => void
  multi?: boolean
  columns?: 1 | 2 | 3
  compact?: boolean
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
  const colClass =
    columns === 1 ? 'grid-cols-1' :
    columns === 3 ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' :
    'grid-cols-1 sm:grid-cols-2'
  const padClass = compact ? 'p-3' : 'p-4'
  return (
    <div className={`grid ${colClass} gap-2.5`}>
      {options.map(o => {
        const active = isActive(o.id)
        const Icon = o.icon
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => toggle(o.id)}
            className={`text-left ${padClass} rounded-xl border transition-all ${
              active
                ? 'bg-brand-tint border-brand/40 ring-2 ring-brand/20'
                : 'bg-white border-ink-6 hover:border-brand/30 hover:shadow-sm'
            }`}
          >
            {Icon && (
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${
                active ? 'bg-white' : 'bg-bg-2'
              }`}>
                <Icon className={`w-4 h-4 ${active ? 'text-brand-dark' : 'text-ink-3'}`} />
              </div>
            )}
            <p className="text-sm font-medium text-ink">{o.label}</p>
            {o.sub && <p className="text-[11px] text-ink-4 mt-0.5">{o.sub}</p>}
          </button>
        )
      })}
    </div>
  )
}

function ChipSelect<T extends string>({
  options, value, onChange, multi = false,
}: {
  options: readonly T[] | T[]
  value: T | T[] | undefined | null
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

function OptionalTag() {
  return (
    <span className="text-[9px] font-semibold text-brand-dark bg-brand-tint px-1.5 py-0.5 rounded uppercase tracking-wider ml-1.5">
      Optional
    </span>
  )
}

/* ─── Step components ───────────────────────────────────── */

interface StepProps {
  form: FormState
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void
}

function ContentTypeStep({
  value, onChange,
}: { value: ContentType; onChange: (v: ContentType) => void }) {
  return (
    <>
      <StepHeading
        title="What is this reel about?"
        hint="Pick the one that fits — this helps us shape the right brief."
      />
      <PickerCard
        options={CONTENT_TYPES}
        value={value}
        onChange={v => onChange(v as ContentType)}
        columns={3}
        compact
      />
    </>
  )
}

/* Step 2 — Format & Length */
function FormatStep({ form, update }: StepProps) {
  return (
    <>
      <StepHeading title="Format & length" hint="How long and how many?" />
      <div className="space-y-6">
        <div>
          <SectionHeading label="Single video or series?" />
          <PickerCard
            options={[
              { id: 'one',    label: 'Just one video',   sub: 'A single reel' },
              { id: 'series', label: 'A series of reels', sub: 'Multiple episodes' },
            ]}
            value={form.is_series ? 'series' : 'one'}
            onChange={v => {
              update('is_series', v === 'series')
              if (v === 'one') update('series_episode_count', null)
            }}
          />
          {form.is_series && (
            <div className="mt-3 p-4 bg-bg-2 rounded-xl">
              <FieldLabel>How many episodes?</FieldLabel>
              <div className="flex flex-wrap gap-2">
                {[2, 3, 4, 5, 6].map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => update('series_episode_count', n)}
                    className={`w-10 h-10 rounded-lg text-sm font-medium border transition-colors ${
                      form.series_episode_count === n
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
        </div>

        <div>
          <SectionHeading label="How long?" />
          <PickerCard
            options={LENGTH_OPTIONS}
            value={form.length_preference || ''}
            onChange={v => update('length_preference', v as string)}
            columns={3}
            compact
          />
        </div>
      </div>
    </>
  )
}

/* Step 3 — Message */
function MessageStep({ form, update }: StepProps) {
  return (
    <>
      <StepHeading
        title="What's the message?"
        hint="The creative core — leave any blank and we'll handle it."
      />
      <div className="space-y-5">
        <TextareaField
          label="Main message"
          optional
          rows={3}
          value={form.main_message}
          onChange={v => update('main_message', v)}
          placeholder="What should the viewer take away?"
        />
        <TextareaField
          label="Hook — first 3 seconds"
          optional
          rows={2}
          value={form.hook}
          onChange={v => update('hook', v)}
          placeholder="The opening line that stops the scroll"
        />
        <div>
          <FieldLabel>
            Call to action <OptionalTag />
          </FieldLabel>
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

/* Step 4 — Script */
function ScriptStep({ form, update }: StepProps) {
  const showVoiceoverTone = form.script_style === 'voiceover' || form.script_style === 'both'
  return (
    <>
      <StepHeading title="Script" hint="Who writes it and how it's delivered." />
      <div className="space-y-6">
        <div>
          <SectionHeading label="Who handles the script?" />
          <PickerCard
            options={SCRIPT_OWNER_OPTIONS}
            value={form.script_owner || ''}
            onChange={v => update('script_owner', v as string)}
            columns={1}
            compact
          />
        </div>

        <div>
          <SectionHeading label="How does it come across?" />
          <PickerCard
            options={SCRIPT_STYLE_OPTIONS}
            value={form.script_style || ''}
            onChange={v => update('script_style', v as string)}
          />
        </div>

        {showVoiceoverTone && (
          <div>
            <SectionHeading label="Voiceover tone" />
            <PickerCard
              options={VOICEOVER_TONES}
              value={form.voiceover_tone || ''}
              onChange={v => update('voiceover_tone', v as string)}
              columns={3}
              compact
            />
          </div>
        )}
      </div>
    </>
  )
}

/* Step 5 — Footage */
function FootageStep({ form, update }: StepProps) {
  const showShoot = form.footage_source === 'apnosh_films'
  return (
    <>
      <StepHeading title="Footage" hint="Where the footage is coming from." />
      <div className="space-y-6">
        <div>
          <SectionHeading label="How are we getting the footage?" />
          <PickerCard
            options={FOOTAGE_OPTIONS}
            value={form.footage_source || ''}
            onChange={v => update('footage_source', v as string)}
          />
        </div>

        {showShoot && (
          <div className="p-4 bg-bg-2 rounded-xl space-y-4">
            <SectionHeading label="Shoot details" />
            <TextField
              label="Location"
              value={form.shoot_location}
              onChange={v => update('shoot_location', v)}
              placeholder="123 Main St — your business"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <TextField
                label="Preferred date"
                type="date"
                value={form.shoot_date}
                onChange={v => update('shoot_date', v)}
              />
              <div>
                <FieldLabel>Flexible on date?</FieldLabel>
                <div className="flex gap-2 pt-1">
                  {[{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }].map(o => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => update('shoot_flexible', o.id === 'yes')}
                      className={`px-4 py-2 rounded-lg text-xs font-medium border transition-colors ${
                        (form.shoot_flexible === true && o.id === 'yes') ||
                        (form.shoot_flexible === false && o.id === 'no')
                          ? 'bg-brand-tint text-brand-dark border-brand/30'
                          : 'bg-white text-ink-3 border-ink-6 hover:border-ink-5'
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <TextareaField
              label="What are we filming"
              required
              rows={2}
              value={form.shoot_subject}
              onChange={v => update('shoot_subject', v)}
              placeholder="e.g. dinner service, the new patio, our chef plating the special"
            />
            <div>
              <FieldLabel>Who&apos;s on camera</FieldLabel>
              <PickerCard
                options={WHO_ON_CAMERA}
                value={form.shoot_who_on_camera || ''}
                onChange={v => update('shoot_who_on_camera', v as string)}
                compact
              />
            </div>
          </div>
        )}
      </div>
    </>
  )
}

/* Step 6 — Music */
function MusicStep({ form, update }: StepProps) {
  const showFeel = form.music_owner && form.music_owner !== 'none'
  return (
    <>
      <StepHeading title="Music" hint="Who picks and what feel." />
      <div className="space-y-6">
        <div>
          <SectionHeading label="Who picks the music?" />
          <PickerCard
            options={MUSIC_OWNER_OPTIONS}
            value={form.music_owner || ''}
            onChange={v => {
              update('music_owner', v as string)
              if (v === 'none') update('music_feel', null)
            }}
            columns={1}
            compact
          />
        </div>

        {showFeel && (
          <div>
            <SectionHeading label="Music feel" />
            <PickerCard
              options={MUSIC_FEEL_OPTIONS}
              value={form.music_feel || ''}
              onChange={v => update('music_feel', v as string)}
              columns={3}
              compact
            />
          </div>
        )}
      </div>
    </>
  )
}

/* Step 7 — Look & feel */
function LookStep({
  form, update, uploadFiles,
}: StepProps & { uploadFiles: (files: FileList | File[]) => Promise<{ urls: string[]; failures: Array<{ name: string; reason: string }> }> }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadErr, setUploadErr] = useState<string | null>(null)

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    setUploadErr(null)
    const { urls, failures } = await uploadFiles(files)
    if (urls.length > 0) {
      update('reference_asset_urls', [...(form.reference_asset_urls || []), ...urls])
    }
    if (failures.length > 0) {
      setUploadErr(
        failures.length === 1
          ? `Couldn't upload "${failures[0].name}": ${failures[0].reason}. Try again?`
          : `Couldn't upload ${failures.length} files. Try again?`
      )
    }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  function removeAt(i: number) {
    const arr = [...(form.reference_asset_urls || [])]
    arr.splice(i, 1)
    update('reference_asset_urls', arr)
  }

  return (
    <>
      <StepHeading title="Look & feel" hint="The visual direction." />
      <div className="space-y-6">
        <div>
          <SectionHeading label="Overall vibe (pick any)" />
          <ChipSelect
            options={MOOD_OPTIONS}
            value={form.mood_tags || []}
            onChange={v => update('mood_tags', v as string[])}
            multi
          />
        </div>

        <div>
          <SectionHeading label="Editing style" />
          <PickerCard
            options={EDITING_STYLES}
            value={form.editing_style || ''}
            onChange={v => update('editing_style', v as string)}
            columns={3}
            compact
          />
        </div>

        <div>
          <SectionHeading label={`References (optional)`} />
          <div className="space-y-3">
            <TextField
              label="Reference link"
              value={form.reference_link}
              onChange={v => update('reference_link', v)}
              placeholder="https://instagram.com/reel/..."
            />
            <div>
              <FieldLabel>Reference images or short clips</FieldLabel>
              <div className="flex flex-wrap gap-3">
                {(form.reference_asset_urls || []).map((url, i) => (
                  <div key={url} className="relative">
                    <img src={url} alt="" className="w-20 h-20 rounded-lg object-cover border border-ink-6" />
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
                  className="w-20 h-20 rounded-lg border-2 border-dashed border-ink-5 hover:border-brand/50 hover:bg-brand-tint/30 flex flex-col items-center justify-center gap-1 text-ink-4 hover:text-brand-dark"
                >
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  <span className="text-[10px] font-medium">Upload</span>
                </button>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={e => handleFiles(e.target.files)}
              />
              {uploadErr && (
                <div className="mt-3 rounded-lg bg-red-50 border border-red-200 p-3 text-[12px] text-red-800">
                  {uploadErr}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

/* Step 8 — Where & when (incl. avoid + private note) */
function WhereWhenStep({ form, update }: StepProps) {
  return (
    <>
      <StepHeading title="Final details" hint="Platforms, timing, and anything else." />
      <div className="space-y-6">
        <div>
          <SectionHeading label="Anything to avoid? (optional)" />
          <TextareaField
            label="Avoid"
            rows={2}
            value={form.avoid_text}
            onChange={v => update('avoid_text', v)}
            placeholder="Leave blank if nothing comes to mind"
          />
        </div>

        <div className="p-4 bg-bg-2 rounded-xl border border-ink-6">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-3.5 h-3.5 text-ink-4" />
            <p className="text-[11px] font-semibold text-ink-3 uppercase tracking-wide">
              Private note to your account manager
            </p>
          </div>
          <p className="text-[11px] text-ink-4 mb-2">Not shown to the editor.</p>
          <textarea
            value={form.internal_note || ''}
            onChange={e => update('internal_note', e.target.value)}
            placeholder="Anything else just for our team..."
            rows={2}
            className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand resize-none bg-white"
          />
        </div>

        <div>
          <SectionHeading label="Where is this being posted?" />
          <PickerCard
            options={PLATFORM_OPTIONS}
            value={form.platforms || []}
            onChange={v => update('platforms', v as string[])}
            multi
            columns={3}
            compact
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <SectionHeading label="Publish date *" />
            <input
              type="date"
              value={form.publish_date || ''}
              onChange={e => update('publish_date', e.target.value)}
              className="w-full border border-ink-6 rounded-lg px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
            />
          </div>
          <div>
            <SectionHeading label="Urgency *" />
            <PickerCard
              options={URGENCY_OPTIONS}
              value={form.urgency || ''}
              onChange={v => update('urgency', v as string)}
              columns={1}
              compact
            />
          </div>
        </div>
      </div>
    </>
  )
}

/* Step 9 — Review */
function ReviewStep({
  form, jumpTo,
}: { form: FormState; jumpTo: (s: StepId) => void }) {
  const typeLabel = CONTENT_TYPES.find(c => c.id === form.content_type)?.label ?? form.content_type

  return (
    <>
      <StepHeading
        title="Review and submit"
        hint="Double-check the details below. Click any section to jump back and edit."
      />

      <ReviewSection title="Content & format" icon={Film} onEdit={() => jumpTo('content_type')}>
        <ReviewLine label="Content type" value={typeLabel} />
        <ReviewLine
          label="Format"
          value={
            form.is_series
              ? `Series (${form.series_episode_count ?? '?'} episodes)`
              : 'Single video'
          }
        />
        {form.length_preference && (
          <ReviewLine
            label="Length"
            value={LENGTH_OPTIONS.find(l => l.id === form.length_preference)?.label}
          />
        )}
      </ReviewSection>

      <ReviewSection title="Message & script" icon={MessageCircle} onEdit={() => jumpTo('message')}>
        <ReviewLine label="Main message" value={form.main_message || undefined} />
        <ReviewLine label="Hook" value={form.hook || undefined} />
        {form.call_to_action && form.call_to_action.length > 0 && (
          <ReviewLine label="CTA" value={form.call_to_action.join(' · ')} />
        )}
        {form.script_owner && (
          <ReviewLine
            label="Script by"
            value={SCRIPT_OWNER_OPTIONS.find(o => o.id === form.script_owner)?.label}
          />
        )}
        {form.script_style && (
          <ReviewLine
            label="Delivery"
            value={SCRIPT_STYLE_OPTIONS.find(o => o.id === form.script_style)?.label}
          />
        )}
        {form.voiceover_tone && (
          <ReviewLine
            label="VO tone"
            value={VOICEOVER_TONES.find(o => o.id === form.voiceover_tone)?.label}
          />
        )}
      </ReviewSection>

      <ReviewSection title="Footage" icon={Video} onEdit={() => jumpTo('footage')}>
        {form.footage_source && (
          <ReviewLine
            label="Source"
            value={FOOTAGE_OPTIONS.find(o => o.id === form.footage_source)?.label}
          />
        )}
        {form.footage_source === 'apnosh_films' && (
          <>
            <ReviewLine label="Location" value={form.shoot_location || undefined} />
            <ReviewLine label="Date" value={form.shoot_date || undefined} />
            <ReviewLine label="Subject" value={form.shoot_subject || undefined} />
            {form.shoot_who_on_camera && (
              <ReviewLine
                label="On camera"
                value={WHO_ON_CAMERA.find(o => o.id === form.shoot_who_on_camera)?.label}
              />
            )}
          </>
        )}
      </ReviewSection>

      <ReviewSection title="Music" icon={Music} onEdit={() => jumpTo('music')}>
        {form.music_owner && (
          <ReviewLine
            label="Music"
            value={MUSIC_OWNER_OPTIONS.find(o => o.id === form.music_owner)?.label}
          />
        )}
        {form.music_feel && (
          <ReviewLine
            label="Feel"
            value={MUSIC_FEEL_OPTIONS.find(o => o.id === form.music_feel)?.label}
          />
        )}
      </ReviewSection>

      <ReviewSection title="Look & feel" icon={Palette} onEdit={() => jumpTo('look')}>
        {form.mood_tags && form.mood_tags.length > 0 && (
          <ReviewLine label="Vibe" value={form.mood_tags.join(' · ')} />
        )}
        {form.editing_style && (
          <ReviewLine
            label="Editing"
            value={EDITING_STYLES.find(o => o.id === form.editing_style)?.label}
          />
        )}
        {form.reference_link && <ReviewLine label="Reference" value={form.reference_link} />}
      </ReviewSection>

      <ReviewSection title="Where & when" icon={Calendar} onEdit={() => jumpTo('where_when')}>
        {form.platforms && form.platforms.length > 0 && (
          <ReviewLine
            label="Platforms"
            value={form.platforms
              .map(p => PLATFORM_OPTIONS.find(o => o.id === p)?.label || p)
              .join(' · ')}
          />
        )}
        {form.publish_date && <ReviewLine label="Publish" value={form.publish_date} />}
        {form.urgency && (
          <ReviewLine
            label="Urgency"
            value={URGENCY_OPTIONS.find(o => o.id === form.urgency)?.label}
          />
        )}
        {form.avoid_text && <ReviewLine label="Avoid" value={form.avoid_text} />}
        {form.internal_note && (
          <div className="mt-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-[10px] font-semibold text-amber-800 uppercase tracking-wide mb-0.5">
              Private note
            </p>
            <p className="text-xs text-amber-900">{form.internal_note}</p>
          </div>
        )}
      </ReviewSection>

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
