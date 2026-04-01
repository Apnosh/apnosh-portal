'use client'

import { useState, useEffect, useRef } from 'react'
import { Plus, X, ChevronDown, Upload, CheckCircle2, ArrowRight, Camera, Globe, Video, Mail, Zap } from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────

type ContentType = '' | 'social' | 'video' | 'story' | 'email' | 'design' | 'other'
type Urgency = '' | 'asap' | 'this_week' | 'next_week' | 'specific'
type Platform = 'instagram' | 'facebook' | 'tiktok' | 'email'

const contentTypes: { value: ContentType; label: string }[] = [
  { value: '', label: 'Select type...' },
  { value: 'social', label: 'Social Media Post' },
  { value: 'video', label: 'Video / Reel' },
  { value: 'story', label: 'Story Graphics' },
  { value: 'email', label: 'Email Campaign' },
  { value: 'design', label: 'Design / Graphic' },
  { value: 'other', label: 'Other' },
]

const urgencyOptions: { value: Urgency; label: string }[] = [
  { value: '', label: 'Select timeline...' },
  { value: 'asap', label: 'ASAP' },
  { value: 'this_week', label: 'This week' },
  { value: 'next_week', label: 'Next week' },
  { value: 'specific', label: 'Specific date' },
]

const platforms: { id: Platform; label: string; icon: typeof Camera }[] = [
  { id: 'instagram', label: 'Instagram', icon: Camera },
  { id: 'facebook', label: 'Facebook', icon: Globe },
  { id: 'tiktok', label: 'TikTok', icon: Video },
  { id: 'email', label: 'Email', icon: Mail },
]

// ── Component ────────────────────────────────────────────────────────

export default function QuickRequest() {
  const [open, setOpen] = useState(false)
  const [showPulse, setShowPulse] = useState(true)
  const [submitted, setSubmitted] = useState(false)
  const [orderNumber, setOrderNumber] = useState('')
  const modalRef = useRef<HTMLDivElement>(null)

  // Form state
  const [contentType, setContentType] = useState<ContentType>('')
  const [description, setDescription] = useState('')
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>([])
  const [urgency, setUrgency] = useState<Urgency>('')
  const [specificDate, setSpecificDate] = useState('')
  const [priority, setPriority] = useState<'normal' | 'rush'>('normal')

  // Stop pulse after 4 seconds
  useEffect(() => {
    const t = setTimeout(() => setShowPulse(false), 4000)
    return () => clearTimeout(t)
  }, [])

  // Auto-close success after 3 seconds
  useEffect(() => {
    if (!submitted) return
    const t = setTimeout(() => {
      setOpen(false)
      // Reset after close animation
      setTimeout(() => {
        setSubmitted(false)
        resetForm()
      }, 300)
    }, 3000)
    return () => clearTimeout(t)
  }, [submitted])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    if (open) document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  function resetForm() {
    setContentType('')
    setDescription('')
    setSelectedPlatforms([])
    setUrgency('')
    setSpecificDate('')
    setPriority('normal')
  }

  function togglePlatform(p: Platform) {
    setSelectedPlatforms(prev =>
      prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]
    )
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const num = Math.floor(Math.random() * 900) + 100
    setOrderNumber(`APR-2026-${num}`)
    setSubmitted(true)
  }

  const canSubmit = contentType && description.trim().length > 5

  return (
    <>
      {/* ── FAB ─────────────────────────────────────────────────── */}
      <div className="fixed bottom-6 right-6 z-50 group">
        {/* Tooltip */}
        <span className="absolute bottom-full right-0 mb-2 px-2.5 py-1 rounded-lg bg-ink text-white text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          Request Content
        </span>

        {/* Pulse ring */}
        {showPulse && (
          <span className="absolute inset-0 rounded-full bg-brand-dark/30 animate-ping" />
        )}

        <button
          onClick={() => { setOpen(true); setShowPulse(false) }}
          className="relative w-14 h-14 rounded-full bg-brand-dark text-white flex items-center justify-center shadow-lg hover:scale-110 hover:shadow-xl active:scale-95 transition-all duration-200 cursor-pointer"
          aria-label="Request Content"
        >
          <Plus className="w-6 h-6" strokeWidth={2.5} />
        </button>
      </div>

      {/* ── Modal ────────────────────────────────────────────────── */}
      {open && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-[fadeIn_150ms_ease]"
            onClick={() => { if (!submitted) setOpen(false) }}
          />

          {/* Panel */}
          <div
            ref={modalRef}
            className="relative w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto animate-[slideUp_200ms_ease]"
          >
            {/* Header */}
            <div className="sticky top-0 bg-white/95 backdrop-blur-sm border-b border-ink-6 px-5 py-4 flex items-center justify-between rounded-t-2xl z-10">
              <h2 className="font-[family-name:var(--font-display)] text-lg text-ink">
                {submitted ? 'Request Sent' : 'Quick Content Request'}
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="w-8 h-8 rounded-lg hover:bg-bg-2 flex items-center justify-center text-ink-4 hover:text-ink transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {submitted ? (
              /* ── Success State ──────────────────────────────────── */
              <div className="p-6 text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-brand-tint flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-8 h-8 text-brand-dark" />
                </div>
                <div>
                  <h3 className="font-[family-name:var(--font-display)] text-xl text-ink">
                    Request Submitted!
                  </h3>
                  <p className="text-sm text-ink-3 mt-1">
                    Order <span className="font-mono font-medium text-ink-2">#{orderNumber}</span>
                  </p>
                </div>
                <p className="text-sm text-ink-3 leading-relaxed">
                  Our team will review this within 2 hours and start working on it.
                </p>
                <a
                  href="/dashboard/orders"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-dark hover:underline"
                >
                  View in Orders <ArrowRight className="w-3.5 h-3.5" />
                </a>
              </div>
            ) : (
              /* ── Form ───────────────────────────────────────────── */
              <form onSubmit={handleSubmit} className="p-5 space-y-5">
                {/* Content type */}
                <div>
                  <label className="block text-sm font-medium text-ink mb-1.5">
                    What do you need?
                  </label>
                  <div className="relative">
                    <select
                      value={contentType}
                      onChange={e => setContentType(e.target.value as ContentType)}
                      className="w-full appearance-none bg-bg-2 border border-ink-6 rounded-xl px-4 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors"
                    >
                      {contentTypes.map(ct => (
                        <option key={ct.value} value={ct.value} disabled={!ct.value}>
                          {ct.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-4 pointer-events-none" />
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-ink mb-1.5">
                    Tell us about it
                  </label>
                  <textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="e.g., We're launching a new lunch special next Tuesday and need posts across Instagram and Facebook..."
                    rows={3}
                    className="w-full bg-bg-2 border border-ink-6 rounded-xl px-4 py-2.5 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand resize-none transition-colors"
                  />
                </div>

                {/* Platforms */}
                <div>
                  <label className="block text-sm font-medium text-ink mb-1.5">
                    Which platforms?
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {platforms.map(p => {
                      const active = selectedPlatforms.includes(p.id)
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => togglePlatform(p.id)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                            active
                              ? 'bg-brand-tint border-brand/30 text-brand-dark'
                              : 'bg-white border-ink-6 text-ink-3 hover:border-ink-5 hover:text-ink-2'
                          }`}
                        >
                          <p.icon className="w-3.5 h-3.5" />
                          {p.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Urgency */}
                <div>
                  <label className="block text-sm font-medium text-ink mb-1.5">
                    When do you need it?
                  </label>
                  <div className="relative">
                    <select
                      value={urgency}
                      onChange={e => setUrgency(e.target.value as Urgency)}
                      className="w-full appearance-none bg-bg-2 border border-ink-6 rounded-xl px-4 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors"
                    >
                      {urgencyOptions.map(u => (
                        <option key={u.value} value={u.value} disabled={!u.value}>
                          {u.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-4 pointer-events-none" />
                  </div>
                  {urgency === 'specific' && (
                    <input
                      type="date"
                      value={specificDate}
                      onChange={e => setSpecificDate(e.target.value)}
                      className="mt-2 w-full bg-bg-2 border border-ink-6 rounded-xl px-4 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors"
                    />
                  )}
                </div>

                {/* Priority */}
                <div>
                  <label className="block text-sm font-medium text-ink mb-1.5">
                    Priority
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setPriority('normal')}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                        priority === 'normal'
                          ? 'bg-brand-tint border-brand/30 text-brand-dark'
                          : 'bg-white border-ink-6 text-ink-3 hover:border-ink-5'
                      }`}
                    >
                      Normal
                    </button>
                    <button
                      type="button"
                      onClick={() => setPriority('rush')}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all flex items-center justify-center gap-1.5 ${
                        priority === 'rush'
                          ? 'bg-amber-50 border-amber-300 text-amber-700'
                          : 'bg-white border-ink-6 text-ink-3 hover:border-ink-5'
                      }`}
                    >
                      <Zap className="w-3.5 h-3.5" />
                      Rush
                      <span className="text-[10px] opacity-70">(+50%)</span>
                    </button>
                  </div>
                </div>

                {/* Upload area */}
                <div>
                  <label className="block text-sm font-medium text-ink mb-1.5">
                    Attach references
                  </label>
                  <div className="border-2 border-dashed border-ink-5 rounded-xl p-6 text-center hover:border-brand/40 hover:bg-brand-tint/30 transition-colors cursor-pointer">
                    <Upload className="w-5 h-5 text-ink-4 mx-auto mb-1.5" />
                    <p className="text-xs text-ink-4">Drag files or click to upload</p>
                  </div>
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="w-full py-3 rounded-xl bg-brand-dark text-white text-sm font-medium flex items-center justify-center gap-2 hover:bg-brand-dark/90 active:scale-[0.98] transition-all disabled:opacity-40 disabled:pointer-events-none"
                >
                  Submit Request <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ── Keyframe styles ────────────────────────────────────── */}
      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0 }
          to { opacity: 1 }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(40px) }
          to { opacity: 1; transform: translateY(0) }
        }
      `}</style>
    </>
  )
}
