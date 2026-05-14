'use client'

/**
 * New change request — restaurant-aware templates as first-class
 * citizens. Owners pick a preset workflow (Update menu price, Add
 * holiday banner, Replace hero photo, …) which surfaces structured
 * fields that compose into a precise request. Generic "describe
 * anything" types stay available as a fallback.
 *
 * Each template knows how to render its own fields and how to
 * compose them into the description text + content_format that
 * the existing content_queue pipeline expects. The strategist
 * receives a fully-specified request instead of an open-ended
 * "update my menu" message that requires a back-and-forth.
 */

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Loader2, Send, Upload, X, FileText, Bug, Zap, Pencil,
  DollarSign, CalendarDays, Image as ImageIcon, Clock, Tag, AlignLeft,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { submitContentRequest } from '@/lib/client-portal-actions'
import type { ContentFormat } from '@/types/database'

/* ── Template + generic type definitions ───────────────────────── */

type FieldType = 'text' | 'textarea' | 'date' | 'time' | 'url' | 'price'
interface TemplateField {
  key: string
  label: string
  type: FieldType
  placeholder?: string
  required?: boolean
}

interface Template {
  id: string
  label: string
  hint: string
  icon: React.ComponentType<{ className?: string }>
  contentFormat: ContentFormat
  fields: TemplateField[]
  compose: (values: Record<string, string>) => string
}

interface GenericType {
  value: ContentFormat
  label: string
  icon: React.ComponentType<{ className?: string }>
  description: string
  promptPlaceholder: string
}

const TEMPLATES: Template[] = [
  {
    id: 'menu_price',
    label: 'Update a menu price',
    hint: 'Item name + new price + when it should change.',
    icon: DollarSign,
    contentFormat: 'page_update',
    fields: [
      { key: 'item', label: 'Item name', type: 'text', placeholder: 'e.g. Pho Tai', required: true },
      { key: 'old_price', label: 'Current price', type: 'price', placeholder: '13.99' },
      { key: 'new_price', label: 'New price', type: 'price', placeholder: '14.99', required: true },
      { key: 'effective_date', label: 'When to apply', type: 'date' },
      { key: 'notes', label: 'Anything else?', type: 'textarea', placeholder: 'Optional context' },
    ],
    compose: v =>
      `Update menu price\n\nItem: ${v.item}\n${v.old_price ? `From: $${v.old_price}\n` : ''}To: $${v.new_price}${v.effective_date ? `\nEffective: ${v.effective_date}` : ''}${v.notes ? `\n\n${v.notes}` : ''}`,
  },
  {
    id: 'holiday_banner',
    label: 'Add a holiday banner',
    hint: 'Date + message customers see at the top of the site.',
    icon: CalendarDays,
    contentFormat: 'page_update',
    fields: [
      { key: 'start_date', label: 'Show from', type: 'date', required: true },
      { key: 'end_date', label: 'Hide after', type: 'date', required: true },
      { key: 'message', label: 'Banner message', type: 'text', placeholder: 'e.g. Closed Dec 25 for Christmas', required: true },
      { key: 'link', label: 'Link to (optional)', type: 'url', placeholder: 'https://...' },
    ],
    compose: v =>
      `Add holiday/announcement banner\n\nMessage: ${v.message}\nLive: ${v.start_date} – ${v.end_date}${v.link ? `\nLink: ${v.link}` : ''}`,
  },
  {
    id: 'hero_photo',
    label: 'Replace the hero photo',
    hint: 'New main image at the top of a page.',
    icon: ImageIcon,
    contentFormat: 'page_update',
    fields: [
      { key: 'page', label: 'Which page', type: 'text', placeholder: 'e.g. Homepage', required: true },
      { key: 'notes', label: 'Anything specific?', type: 'textarea', placeholder: 'Mood, what to highlight, anything to avoid…' },
    ],
    compose: v =>
      `Replace hero photo\n\nPage: ${v.page}${v.notes ? `\n\nNotes: ${v.notes}` : ''}\n\n(New photo attached.)`,
  },
  {
    id: 'website_hours',
    label: 'Update website hours',
    hint: 'Make sure the hours on your site match what\'s actually open.',
    icon: Clock,
    contentFormat: 'page_update',
    fields: [
      { key: 'new_hours', label: 'New hours', type: 'textarea', placeholder: 'e.g.\nMon-Fri: 11am - 9pm\nSat: 10am - 10pm\nSun: Closed', required: true },
      { key: 'effective_date', label: 'When to apply', type: 'date' },
    ],
    compose: v =>
      `Update website hours\n\n${v.new_hours}${v.effective_date ? `\n\nEffective: ${v.effective_date}` : ''}`,
  },
  {
    id: 'daily_special',
    label: 'Add a daily special',
    hint: 'A recurring or short-lived promo to feature on the homepage.',
    icon: Tag,
    contentFormat: 'page_update',
    fields: [
      { key: 'title', label: 'Special name', type: 'text', placeholder: 'e.g. Tuesday Pho Bowl Deal', required: true },
      { key: 'description', label: 'What\'s included', type: 'textarea', placeholder: 'e.g. Any large pho + Vietnamese coffee for $15', required: true },
      { key: 'price', label: 'Price', type: 'price', placeholder: '15.00' },
      { key: 'valid_from', label: 'Starts', type: 'date' },
      { key: 'valid_until', label: 'Ends', type: 'date' },
    ],
    compose: v =>
      `Add daily special: ${v.title}\n\n${v.description}${v.price ? `\nPrice: $${v.price}` : ''}${v.valid_from ? `\nFrom: ${v.valid_from}` : ''}${v.valid_until ? ` until: ${v.valid_until}` : ''}`,
  },
  {
    id: 'typo_fix',
    label: 'Fix a typo or wording',
    hint: 'Where it is + what it should say.',
    icon: AlignLeft,
    contentFormat: 'page_update',
    fields: [
      { key: 'page_url', label: 'Page URL', type: 'url', placeholder: 'https://yourrestaurant.com/about', required: true },
      { key: 'wrong_text', label: 'Current text', type: 'textarea', placeholder: 'Paste the text that needs to change', required: true },
      { key: 'correct_text', label: 'Should say', type: 'textarea', placeholder: 'New wording', required: true },
    ],
    compose: v =>
      `Fix wording on ${v.page_url}\n\nFrom: "${v.wrong_text}"\n\nTo: "${v.correct_text}"`,
  },
]

const GENERIC: GenericType[] = [
  { value: 'page_update', label: 'Update existing page',  icon: Pencil,   description: 'Change copy, images, or sections', promptPlaceholder: 'Describe what needs to change and where…' },
  { value: 'blog_post',   label: 'New blog post',          icon: FileText, description: 'Publish a new article',            promptPlaceholder: 'Topic, angle, audience…' },
  { value: 'bug_fix',     label: 'Bug / issue',            icon: Bug,      description: 'Something broken',                 promptPlaceholder: 'What did you try, what happened…' },
  { value: 'custom',      label: 'Other',                  icon: Zap,      description: 'Anything not covered above',       promptPlaceholder: 'Describe the change…' },
]

/* ── Page component ────────────────────────────────────────────── */

type Mode =
  | { kind: 'pick' }
  | { kind: 'template'; template: Template }
  | { kind: 'generic'; type: GenericType }

export default function NewWebsiteRequestPage() {
  const router = useRouter()
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [mode, setMode] = useState<Mode>({ kind: 'pick' })
  const [values, setValues] = useState<Record<string, string>>({})
  const [genericDescription, setGenericDescription] = useState('')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setMode({ kind: 'pick' })
    setValues({})
    setGenericDescription('')
    setPhotoFile(null)
    setPhotoPreview(null)
    setError(null)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    const reader = new FileReader()
    reader.onload = ev => setPhotoPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }
  function clearPhoto() {
    setPhotoFile(null)
    setPhotoPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleSubmit() {
    let description = ''
    let contentFormat: ContentFormat = 'custom'
    if (mode.kind === 'template') {
      contentFormat = mode.template.contentFormat
      const missing = mode.template.fields.find(f => f.required && !(values[f.key] ?? '').trim())
      if (missing) { setError(`Please fill in: ${missing.label}`); return }
      description = mode.template.compose(values)
    } else if (mode.kind === 'generic') {
      contentFormat = mode.type.value
      if (!genericDescription.trim()) { setError('Please describe what you need'); return }
      description = genericDescription
    } else {
      return
    }

    setSubmitting(true)
    setError(null)

    let photoUrl: string | null = null
    if (photoFile) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const ext = photoFile.name.split('.').pop()
        const path = `${user.id}/website/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
        const { error: uploadErr } = await supabase.storage
          .from('client-photos')
          .upload(path, photoFile, { upsert: false })
        if (!uploadErr) {
          const { data: urlData } = supabase.storage.from('client-photos').getPublicUrl(path)
          photoUrl = urlData.publicUrl
        }
      }
    }

    const result = await submitContentRequest({
      description,
      serviceArea: 'website',
      contentFormat,
      photoUrl,
    })

    setSubmitting(false)
    if (result.success) {
      router.push(`/dashboard/website/requests/${result.data?.requestId}`)
    } else {
      setError(result.error)
    }
  }

  /* ── Picker step ───────────────────────────────────────────── */
  if (mode.kind === 'pick') {
    return (
      <div className="max-w-4xl mx-auto px-4 lg:px-6 py-8 space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/website/requests" className="text-ink-4 hover:text-ink">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-ink">New request</h1>
            <p className="text-ink-3 text-sm mt-0.5">Pick the closest match — we&rsquo;ll fill in the rest after.</p>
          </div>
        </div>

        <section>
          <h2 className="text-[11px] uppercase tracking-wider font-semibold text-ink-3 mb-2">Common restaurant updates</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {TEMPLATES.map(t => {
              const Icon = t.icon
              return (
                <button
                  key={t.id}
                  onClick={() => setMode({ kind: 'template', template: t })}
                  className="bg-white rounded-xl border border-ink-6 hover:border-brand/50 hover:shadow-sm transition-all p-4 text-left group"
                >
                  <div className="w-9 h-9 rounded-lg bg-brand-tint flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
                    <Icon className="w-4 h-4 text-brand-dark" />
                  </div>
                  <h3 className="text-[14px] font-semibold text-ink">{t.label}</h3>
                  <p className="text-[11.5px] text-ink-3 mt-0.5 leading-relaxed">{t.hint}</p>
                </button>
              )
            })}
          </div>
        </section>

        <section>
          <h2 className="text-[11px] uppercase tracking-wider font-semibold text-ink-3 mb-2">Or describe anything</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {GENERIC.map(g => {
              const Icon = g.icon
              return (
                <button
                  key={g.value}
                  onClick={() => setMode({ kind: 'generic', type: g })}
                  className="bg-white rounded-xl border border-ink-6 hover:border-ink-4 hover:shadow-sm transition-all p-4 text-left"
                >
                  <Icon className="w-4 h-4 text-ink-3 mb-2" />
                  <h3 className="text-[13.5px] font-semibold text-ink">{g.label}</h3>
                  <p className="text-[11.5px] text-ink-3 mt-0.5">{g.description}</p>
                </button>
              )
            })}
          </div>
        </section>
      </div>
    )
  }

  /* ── Template form step ─────────────────────────────────────── */
  if (mode.kind === 'template') {
    const Icon = mode.template.icon
    return (
      <FormShell
        title={mode.template.label}
        hint={mode.template.hint}
        icon={Icon}
        onBack={reset}
        onSubmit={handleSubmit}
        submitting={submitting}
        error={error}
        photoPreview={photoPreview}
        onPickPhoto={() => fileInputRef.current?.click()}
        onClearPhoto={clearPhoto}
        fileInputRef={fileInputRef}
        onFileChange={handleFileChange}
      >
        {mode.template.fields.map(f => (
          <FieldInput
            key={f.key}
            field={f}
            value={values[f.key] ?? ''}
            onChange={v => setValues(s => ({ ...s, [f.key]: v }))}
          />
        ))}
      </FormShell>
    )
  }

  /* ── Generic form step ─────────────────────────────────────── */
  const Icon = mode.type.icon
  return (
    <FormShell
      title={mode.type.label}
      hint={mode.type.description}
      icon={Icon}
      onBack={reset}
      onSubmit={handleSubmit}
      submitting={submitting}
      error={error}
      photoPreview={photoPreview}
      onPickPhoto={() => fileInputRef.current?.click()}
      onClearPhoto={clearPhoto}
      fileInputRef={fileInputRef}
      onFileChange={handleFileChange}
    >
      <div>
        <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1.5 block">
          Describe the change <span className="text-rose-500">*</span>
        </label>
        <textarea
          value={genericDescription}
          onChange={e => setGenericDescription(e.target.value)}
          placeholder={mode.type.promptPlaceholder}
          rows={6}
          className="w-full border border-ink-6 rounded-lg px-3 py-2.5 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand resize-none"
        />
      </div>
    </FormShell>
  )
}

/* ── Shared shell + field component ────────────────────────────── */

function FormShell({
  title, hint, icon: Icon, onBack, onSubmit, submitting, error, children,
  photoPreview, onPickPhoto, onClearPhoto, fileInputRef, onFileChange,
}: {
  title: string
  hint: string
  icon: React.ComponentType<{ className?: string }>
  onBack: () => void
  onSubmit: () => void
  submitting: boolean
  error: string | null
  children: React.ReactNode
  photoPreview: string | null
  onPickPhoto: () => void
  onClearPhoto: () => void
  fileInputRef: React.RefObject<HTMLInputElement | null>
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
}) {
  return (
    <div className="max-w-3xl mx-auto px-4 lg:px-6 py-8 space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-ink-4 hover:text-ink">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-3 flex-1">
          <div className="w-10 h-10 rounded-lg bg-brand-tint flex items-center justify-center">
            <Icon className="w-5 h-5 text-brand-dark" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-ink">{title}</h1>
            <p className="text-ink-3 text-sm mt-0.5">{hint}</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-ink-6 p-5 lg:p-6 space-y-5">
        {children}

        <div>
          <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1.5 block">
            Screenshot or reference photo <span className="text-ink-4 font-normal">(optional)</span>
          </label>
          {photoPreview ? (
            <div className="relative inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoPreview} alt="Reference" className="w-40 h-40 object-cover rounded-lg border border-ink-6" />
              <button
                onClick={onClearPhoto}
                className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-ink text-white flex items-center justify-center hover:bg-rose-500"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={onPickPhoto}
              className="w-40 h-40 rounded-lg border-2 border-dashed border-ink-5 hover:border-brand/50 hover:bg-brand-tint/20 flex flex-col items-center justify-center gap-2 text-ink-4 hover:text-brand-dark"
            >
              <Upload className="w-5 h-5" />
              <span className="text-xs font-medium">Upload</span>
            </button>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
        </div>

        {error && (
          <div className="bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 text-xs text-rose-700">{error}</div>
        )}

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-ink-6">
          <button onClick={onBack} className="text-sm text-ink-3 hover:text-ink">Back</button>
          <button
            onClick={onSubmit}
            disabled={submitting}
            className="bg-brand hover:bg-brand-dark text-white text-sm font-semibold rounded-lg px-5 py-2.5 flex items-center gap-2 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Submit request
          </button>
        </div>
      </div>
    </div>
  )
}

function FieldInput({ field, value, onChange }: { field: TemplateField; value: string; onChange: (v: string) => void }) {
  const common = "w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
  return (
    <div>
      <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1.5 block">
        {field.label}{field.required && <span className="text-rose-500"> *</span>}
      </label>
      {field.type === 'textarea' ? (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={3}
          className={common + ' resize-none'}
        />
      ) : (
        <input
          type={field.type === 'price' ? 'text' : field.type}
          inputMode={field.type === 'price' ? 'decimal' : undefined}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder}
          className={common}
        />
      )}
    </div>
  )
}
