'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Loader2, Send, Upload, X, Image as ImageIcon, Film, Layers, Clock,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { submitContentRequest } from '@/lib/client-portal-actions'
import type { ContentFormat, PostPlatform } from '@/types/database'

const CONTENT_TYPES: {
  value: ContentFormat
  label: string
  icon: typeof ImageIcon
  description: string
  promptPlaceholder: string
  defaultSize: 'feed' | 'square' | 'story'
}[] = [
  {
    value: 'feed_post',
    label: 'Feed Post',
    icon: ImageIcon,
    description: 'A single image or graphic for the feed. Good for stats, quotes, tips.',
    promptPlaceholder: 'E.g. A stat post showing that we had 312% more bookings last month after launching the new menu',
    defaultSize: 'feed',
  },
  {
    value: 'reel',
    label: 'Reel',
    icon: Film,
    description: 'A short vertical video (15-90s). Great for tutorials, BTS, storytelling.',
    promptPlaceholder: 'E.g. A 30-second behind-the-scenes reel showing our chef preparing the signature dish',
    defaultSize: 'story',
  },
  {
    value: 'carousel',
    label: 'Carousel',
    icon: Layers,
    description: 'Multi-slide post (2-10 slides). Perfect for how-tos, lists, before/after.',
    promptPlaceholder: 'E.g. A 5-slide carousel: "5 ways to get more Google reviews for your local business"',
    defaultSize: 'square',
  },
  {
    value: 'story',
    label: 'Story',
    icon: Clock,
    description: 'A 24-hour story. Timely updates, polls, quick announcements.',
    promptPlaceholder: 'E.g. A story announcing our weekend brunch special with a "swipe up to book" CTA',
    defaultSize: 'story',
  },
]

const PLATFORMS: { value: PostPlatform; label: string }[] = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'linkedin', label: 'LinkedIn' },
]

export default function NewSocialRequestPage() {
  const router = useRouter()
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Step: type picker or form
  const [selectedType, setSelectedType] = useState<ContentFormat | null>(null)

  // Form state
  const [description, setDescription] = useState('')
  const [platform, setPlatform] = useState<PostPlatform | ''>('')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const typeConfig = CONTENT_TYPES.find(t => t.value === selectedType)

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
    if (!selectedType || !typeConfig) return
    if (!description.trim()) {
      setError('Please describe what you want')
      return
    }

    setSubmitting(true)
    setError(null)

    let photoUrl: string | null = null
    if (photoFile) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const ext = photoFile.name.split('.').pop()
        const path = `${user.id}/requests/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
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
      serviceArea: 'social',
      contentFormat: selectedType,
      platform: platform || null,
      size: typeConfig.defaultSize,
      photoUrl,
    })

    setSubmitting(false)

    if (result.success) {
      router.push(`/dashboard/social/requests/${result.data?.requestId}`)
    } else {
      setError(result.error)
    }
  }

  // ── Step 1: Pick content type ────────────────────────────────
  if (!selectedType) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/social/requests" className="text-ink-4 hover:text-ink transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">New Social Request</h1>
            <p className="text-ink-3 text-sm mt-0.5">What kind of content do you need?</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {CONTENT_TYPES.map(type => {
            const Icon = type.icon
            return (
              <button
                key={type.value}
                onClick={() => setSelectedType(type.value)}
                className="bg-white rounded-xl border border-ink-6 hover:border-brand/50 hover:shadow-sm transition-all p-5 text-left group"
              >
                <div className="w-11 h-11 rounded-xl bg-brand-tint flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                  <Icon className="w-5 h-5 text-brand-dark" />
                </div>
                <h3 className="font-[family-name:var(--font-display)] text-lg text-ink">{type.label}</h3>
                <p className="text-xs text-ink-3 mt-1 leading-relaxed">{type.description}</p>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Step 2: Fill out form ────────────────────────────────────
  const Icon = typeConfig!.icon

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => { setSelectedType(null); setDescription(''); setPlatform('') }}
          className="text-ink-4 hover:text-ink transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-3 flex-1">
          <div className="w-10 h-10 rounded-lg bg-brand-tint flex items-center justify-center">
            <Icon className="w-5 h-5 text-brand-dark" />
          </div>
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">New {typeConfig!.label}</h1>
            <p className="text-ink-3 text-sm mt-0.5">{typeConfig!.description}</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-ink-6 p-5 lg:p-6 space-y-5">
        {/* Description */}
        <div>
          <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1.5 block">
            What do you want? <span className="text-red-500">*</span>
          </label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder={typeConfig!.promptPlaceholder}
            rows={5}
            className="w-full border border-ink-6 rounded-lg px-3 py-2.5 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand resize-none"
          />
          <p className="text-[10px] text-ink-4 mt-1">
            Tell us the vibe, the message, the key points. More detail is better.
          </p>
        </div>

        {/* Reference photo */}
        <div>
          <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1.5 block">
            Reference Photo <span className="text-ink-4 font-normal">(optional)</span>
          </label>
          {photoPreview ? (
            <div className="relative inline-block">
              <img src={photoPreview} alt="Reference" className="w-40 h-40 object-cover rounded-lg border border-ink-6" />
              <button
                onClick={clearPhoto}
                className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-ink text-white flex items-center justify-center hover:bg-red-500 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-40 h-40 rounded-lg border-2 border-dashed border-ink-5 hover:border-brand/50 hover:bg-brand-tint/20 flex flex-col items-center justify-center gap-2 text-ink-4 hover:text-brand-dark transition-colors"
            >
              <Upload className="w-5 h-5" />
              <span className="text-xs font-medium">Upload photo</span>
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {/* Platform */}
        <div>
          <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">
            Platform <span className="text-ink-4 font-normal">(optional)</span>
          </label>
          <div className="flex gap-2">
            {PLATFORMS.map(p => (
              <button
                key={p.value}
                onClick={() => setPlatform(platform === p.value ? '' : p.value)}
                className={`px-4 py-2 rounded-lg text-xs font-medium border transition-colors ${
                  platform === p.value
                    ? 'bg-brand-tint text-brand-dark border-brand/30'
                    : 'bg-white text-ink-4 border-ink-6 hover:text-ink-2'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-ink-6">
          <button
            onClick={() => setSelectedType(null)}
            className="text-sm text-ink-3 hover:text-ink transition-colors"
          >
            Back
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !description.trim()}
            className="bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-5 py-2.5 flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Submit Request
          </button>
        </div>
      </div>
    </div>
  )
}
