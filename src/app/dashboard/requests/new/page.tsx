'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Loader2, Send, Upload, X,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { submitContentRequest } from '@/lib/client-portal-actions'
import type { TemplateType, PostPlatform, PostSize } from '@/types/database'

const TEMPLATES: { value: TemplateType; label: string; description: string }[] = [
  { value: 'insight', label: 'Insight', description: 'Share an idea or observation' },
  { value: 'stat', label: 'Stat', description: 'Highlight a big number' },
  { value: 'tip', label: 'Tip', description: 'Share a how-to or tip' },
  { value: 'compare', label: 'Compare', description: 'Before/after or this vs that' },
  { value: 'result', label: 'Result', description: 'Share a client win' },
  { value: 'photo', label: 'Photo', description: 'Showcase a real photo' },
  { value: 'custom', label: 'Custom', description: 'Something different' },
]

const PLATFORMS: { value: PostPlatform; label: string }[] = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'linkedin', label: 'LinkedIn' },
]

const SIZES: { value: PostSize; label: string }[] = [
  { value: 'feed', label: 'Feed (1080x1350)' },
  { value: 'square', label: 'Square (1080x1080)' },
  { value: 'story', label: 'Story (1080x1920)' },
]

export default function NewDashboardRequestPage() {
  const router = useRouter()
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [description, setDescription] = useState('')
  const [templateType, setTemplateType] = useState<TemplateType | ''>('')
  const [platform, setPlatform] = useState<PostPlatform | ''>('')
  const [size, setSize] = useState<PostSize | ''>('')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    if (!description.trim()) {
      setError('Please describe what you need')
      return
    }

    setSubmitting(true)
    setError(null)

    // Upload photo if provided
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
      templateType: templateType || null,
      platform: platform || null,
      size: size || null,
      photoUrl,
    })

    setSubmitting(false)

    if (result.success) {
      router.push(`/dashboard/requests/${result.data?.requestId}`)
    } else {
      setError(result.error)
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/requests" className="text-ink-4 hover:text-ink transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">New Request</h1>
          <p className="text-ink-3 text-sm mt-0.5">Tell us what you want and we&apos;ll create it.</p>
        </div>
      </div>

      {/* Form */}
      <div className="bg-white rounded-xl border border-ink-6 p-5 lg:p-6 space-y-5">
        {/* Description */}
        <div>
          <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1.5 block">
            What do you need? <span className="text-red-500">*</span>
          </label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="E.g. A post announcing our new spring menu launch, or a tip about how local restaurants can get more Google reviews..."
            rows={5}
            className="w-full border border-ink-6 rounded-lg px-3 py-2.5 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand resize-none"
          />
          <p className="text-[10px] text-ink-4 mt-1">
            Write it like you&apos;re talking to us. No need to be formal.
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

        {/* Optional: Template */}
        <div>
          <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1.5 block">
            Post Type <span className="text-ink-4 font-normal">(optional)</span>
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {TEMPLATES.map(t => (
              <button
                key={t.value}
                onClick={() => setTemplateType(templateType === t.value ? '' : t.value)}
                className={`p-3 rounded-lg border text-left transition-colors ${
                  templateType === t.value
                    ? 'border-brand bg-brand-tint/50'
                    : 'border-ink-6 hover:border-ink-4'
                }`}
              >
                <div className="text-xs font-medium text-ink">{t.label}</div>
                <div className="text-[10px] text-ink-4 mt-0.5 line-clamp-1">{t.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Optional: Platform + Size */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">
              Platform <span className="text-ink-4 font-normal">(optional)</span>
            </label>
            <select
              value={platform}
              onChange={e => setPlatform(e.target.value as PostPlatform | '')}
              className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
            >
              <option value="">No preference</option>
              {PLATFORMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">
              Size <span className="text-ink-4 font-normal">(optional)</span>
            </label>
            <select
              value={size}
              onChange={e => setSize(e.target.value as PostSize | '')}
              className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
            >
              <option value="">No preference</option>
              {SIZES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        {/* Submit */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-ink-6">
          <Link
            href="/dashboard/requests"
            className="text-sm text-ink-3 hover:text-ink transition-colors"
          >
            Cancel
          </Link>
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
