'use client'

/**
 * Quick content request — the "+" → Request content flow.
 *
 * Submits a REAL request via submitContentRequest() (writes to
 * content_queue as a client_request, AI-expands the brief), with a real
 * photo upload to the client-photos bucket. Chip-based UI to match the
 * planner and the action sheet.
 */

import { useState, useEffect, useMemo, useRef } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Plus, X, Upload, CheckCircle2, ArrowRight, Camera, Globe, Video, Mail, Zap, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { submitContentRequest } from '@/lib/request-actions'

type ContentType = '' | 'social' | 'video' | 'story' | 'email' | 'design' | 'other'
type Urgency = '' | 'asap' | 'this_week' | 'next_week' | 'specific'
type Platform = 'instagram' | 'facebook' | 'tiktok' | 'email'

const TYPES: { v: Exclude<ContentType, ''>; label: string }[] = [
  { v: 'social', label: 'Social post' },
  { v: 'video', label: 'Video / Reel' },
  { v: 'story', label: 'Story' },
  { v: 'email', label: 'Email' },
  { v: 'design', label: 'Graphic' },
  { v: 'other', label: 'Other' },
]
const WHEN: { v: Exclude<Urgency, ''>; label: string }[] = [
  { v: 'asap', label: 'ASAP' },
  { v: 'this_week', label: 'This week' },
  { v: 'next_week', label: 'Next week' },
  { v: 'specific', label: 'Pick a date' },
]
const PLATFORMS: { id: Platform; label: string; icon: typeof Camera }[] = [
  { id: 'instagram', label: 'Instagram', icon: Camera },
  { id: 'facebook', label: 'Facebook', icon: Globe },
  { id: 'tiktok', label: 'TikTok', icon: Video },
  { id: 'email', label: 'Email', icon: Mail },
]

export default function QuickRequest() {
  const supabase = useMemo(() => createClient(), [])
  const [open, setOpen] = useState(false)
  const [showPulse, setShowPulse] = useState(true)
  const [submitted, setSubmitted] = useState(false)
  const [requestId, setRequestId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const [contentType, setContentType] = useState<ContentType>('')
  const [description, setDescription] = useState('')
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>([])
  const [urgency, setUrgency] = useState<Urgency>('')
  const [specificDate, setSpecificDate] = useState('')
  const [priority, setPriority] = useState<'normal' | 'rush'>('normal')
  const [photo, setPhoto] = useState<{ url: string; name: string } | null>(null)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setShowPulse(false), 4000)
    return () => clearTimeout(t)
  }, [])

  /* Deep-link open from the action sheet's "Request content". */
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  useEffect(() => {
    if (searchParams?.get('request') === 'open') {
      setOpen(true)
      setShowPulse(false)
      const params = new URLSearchParams(searchParams.toString())
      params.delete('request')
      const next = params.toString()
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  useEffect(() => {
    if (!submitted) return
    const t = setTimeout(() => {
      setOpen(false)
      setTimeout(() => { setSubmitted(false); resetForm() }, 300)
    }, 3500)
    return () => clearTimeout(t)
  }, [submitted])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    if (open) document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  function resetForm() {
    setContentType(''); setDescription(''); setSelectedPlatforms([])
    setUrgency(''); setSpecificDate(''); setPriority('normal')
    setPhoto(null); setError('')
  }
  function togglePlatform(p: Platform) {
    setSelectedPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])
  }

  async function onPickPhoto(file: File) {
    setError(''); setUploading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setError('Please sign in to attach a photo.'); return }
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `${user.id}/content-requests/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      const { error: upErr } = await supabase.storage.from('client-photos').upload(path, file, { upsert: false })
      if (upErr) { setError(upErr.message || 'Upload failed'); return }
      const { data } = supabase.storage.from('client-photos').getPublicUrl(path)
      setPhoto({ url: data.publicUrl, name: file.name })
    } finally {
      setUploading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit || submitting) return
    setSubmitting(true); setError('')
    const res = await submitContentRequest({
      mode: 'quick',
      description: description.trim(),
      templateType: contentType || undefined,
      photoUrl: photo?.url,
      urgency: urgency || undefined,
      deadline: urgency === 'specific' && specificDate ? specificDate : undefined,
      platforms: selectedPlatforms,
      detail: { priority, contentType, platforms: selectedPlatforms },
    })
    setSubmitting(false)
    if (!res.success) { setError(res.error || 'Could not submit your request. Try again.'); return }
    setRequestId(res.requestId || '')
    setSubmitted(true)
  }

  const canSubmit = !!contentType && description.trim().length > 5 && !uploading

  const chip = (active: boolean) =>
    `inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-[13px] font-medium border transition-all ${
      active ? 'bg-brand-tint border-brand/30 text-brand-dark' : 'bg-white border-ink-6 text-ink-3 hover:border-ink-5 hover:text-ink-2'
    }`

  return (
    <>
      {/* Desktop floating button (mobile uses the tab bar "+") */}
      <div className="hidden lg:flex fixed bottom-6 right-6 z-50 group">
        <span className="absolute bottom-full right-0 mb-2 px-2.5 py-1 rounded-lg bg-ink text-white text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          Request content
        </span>
        {showPulse && <span className="absolute inset-0 rounded-full bg-brand-dark/30 animate-ping" />}
        <button
          onClick={() => { setOpen(true); setShowPulse(false) }}
          className="relative w-14 h-14 rounded-full bg-brand-dark text-white flex items-center justify-center shadow-lg hover:scale-110 hover:shadow-xl active:scale-95 transition-all duration-200 cursor-pointer"
          aria-label="Request content"
        >
          <Plus className="w-6 h-6" strokeWidth={2.5} />
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-[fadeIn_150ms_ease]" onClick={() => { if (!submitting) setOpen(false) }} />

          <div className="relative w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto animate-[slideUp_200ms_ease]">
            <div className="sticky top-0 bg-white/95 backdrop-blur-sm border-b border-ink-6 px-5 py-4 flex items-center justify-between rounded-t-2xl z-10">
              <h2 className="font-[family-name:var(--font-display)] text-lg text-ink">
                {submitted ? 'Request sent' : 'Request content'}
              </h2>
              <button onClick={() => setOpen(false)} className="w-8 h-8 rounded-lg hover:bg-bg-2 flex items-center justify-center text-ink-4 hover:text-ink transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {submitted ? (
              <div className="p-6 text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-brand-tint flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-8 h-8 text-brand-dark" />
                </div>
                <div>
                  <h3 className="font-[family-name:var(--font-display)] text-xl text-ink">Request submitted</h3>
                  {requestId && <p className="text-sm text-ink-3 mt-1">Reference <span className="font-mono font-medium text-ink-2">#{requestId.slice(0, 8)}</span></p>}
                </div>
                <p className="text-sm text-ink-3 leading-relaxed">Your team has it and will get started. You can track it under your requests.</p>
                <a href="/dashboard/social/requests" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-dark hover:underline">
                  View your requests <ArrowRight className="w-3.5 h-3.5" />
                </a>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="p-5 space-y-5">
                {error && <p className="text-[13px] font-medium text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>}

                {/* Type */}
                <div>
                  <label className="block text-sm font-medium text-ink mb-2">What do you need?</label>
                  <div className="flex flex-wrap gap-2">
                    {TYPES.map(t => (
                      <button key={t.v} type="button" onClick={() => setContentType(t.v)} className={chip(contentType === t.v)}>{t.label}</button>
                    ))}
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-ink mb-1.5">Tell us about it</label>
                  <textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="e.g., New lunch special launching Tuesday, want posts for Instagram and Facebook with our patio photos…"
                    rows={3}
                    className="w-full bg-bg-2 border border-ink-6 rounded-xl px-4 py-2.5 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand resize-none transition-colors"
                  />
                </div>

                {/* Platforms */}
                <div>
                  <label className="block text-sm font-medium text-ink mb-2">Which platforms?</label>
                  <div className="flex flex-wrap gap-2">
                    {PLATFORMS.map(p => (
                      <button key={p.id} type="button" onClick={() => togglePlatform(p.id)} className={chip(selectedPlatforms.includes(p.id))}>
                        <p.icon className="w-3.5 h-3.5" /> {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* When */}
                <div>
                  <label className="block text-sm font-medium text-ink mb-2">When do you need it?</label>
                  <div className="flex flex-wrap gap-2">
                    {WHEN.map(w => (
                      <button key={w.v} type="button" onClick={() => setUrgency(w.v)} className={chip(urgency === w.v)}>{w.label}</button>
                    ))}
                  </div>
                  {urgency === 'specific' && (
                    <input type="date" value={specificDate} onChange={e => setSpecificDate(e.target.value)}
                      className="mt-2 w-full bg-bg-2 border border-ink-6 rounded-xl px-4 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors" />
                  )}
                </div>

                {/* Rush */}
                <div>
                  <label className="block text-sm font-medium text-ink mb-2">Priority</label>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setPriority('normal')} className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all ${priority === 'normal' ? 'bg-brand-tint border-brand/30 text-brand-dark' : 'bg-white border-ink-6 text-ink-3 hover:border-ink-5'}`}>Normal</button>
                    <button type="button" onClick={() => setPriority('rush')} className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all flex items-center justify-center gap-1.5 ${priority === 'rush' ? 'bg-amber-50 border-amber-300 text-amber-700' : 'bg-white border-ink-6 text-ink-3 hover:border-ink-5'}`}>
                      <Zap className="w-3.5 h-3.5" /> Rush
                    </button>
                  </div>
                </div>

                {/* Photo (real upload) */}
                <div>
                  <label className="block text-sm font-medium text-ink mb-1.5">Add a photo (optional)</label>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onPickPhoto(f) }} />
                  {photo ? (
                    <div className="flex items-center gap-3 border border-ink-6 rounded-xl p-2.5">
                      <img src={photo.url} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                      <span className="flex-1 text-xs text-ink-2 truncate">{photo.name}</span>
                      <button type="button" onClick={() => setPhoto(null)} className="text-xs font-medium text-ink-4 hover:text-rose-600">Remove</button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                      className="w-full border-2 border-dashed border-ink-5 rounded-xl p-6 text-center hover:border-brand/40 hover:bg-brand-tint/30 transition-colors disabled:opacity-60">
                      {uploading ? <Loader2 className="w-5 h-5 text-ink-4 mx-auto mb-1.5 animate-spin" /> : <Upload className="w-5 h-5 text-ink-4 mx-auto mb-1.5" />}
                      <p className="text-xs text-ink-4">{uploading ? 'Uploading…' : 'Tap to upload a photo'}</p>
                    </button>
                  )}
                </div>

                <button type="submit" disabled={!canSubmit || submitting}
                  className="w-full py-3 rounded-xl bg-brand-dark text-white text-sm font-medium flex items-center justify-center gap-2 hover:bg-brand-dark/90 active:scale-[0.98] transition-all disabled:opacity-40 disabled:pointer-events-none">
                  {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</> : <>Submit request <ArrowRight className="w-4 h-4" /></>}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(40px) } to { opacity: 1; transform: translateY(0) } }
      `}</style>
    </>
  )
}
