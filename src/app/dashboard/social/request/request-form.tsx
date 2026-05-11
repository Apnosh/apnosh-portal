'use client'

/**
 * Single-page content request form.
 *
 * Sections, top to bottom:
 *   1. Type picker      — 7 visual cards (new dish, event, BTS, feature,
 *                          review, promo, custom). Pick one. Optional.
 *   2. Tell us about it — open textarea. The only required field.
 *   3. Photos / videos  — paste links (Drive, Dropbox, IG). Multi-line.
 *   4. When             — quick presets + date picker.
 *   5. Where            — platform checkboxes (default: strategist picks).
 *   6. Submit           — calls /api/social/request.
 *
 * Submission writes to client_tasks so the strategist sees it in
 * their admin queue immediately. The body is structured markdown
 * so the strategist can paste-copy into a richer brief.
 */

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Sparkles, ArrowLeft, Send, Check, Loader2, ChefHat, Calendar as CalendarIcon,
  Camera, Users, MessageCircle, Tag, MoreHorizontal, Globe, Music, Mic, MicOff,
} from 'lucide-react'

type RequestType = 'new_dish' | 'event' | 'bts' | 'feature' | 'review' | 'promo' | 'other'

const TYPES: {
  id: RequestType
  label: string
  blurb: string
  example: string
  Icon: React.ComponentType<{ className?: string }>
  tint: string
}[] = [
  { id: 'new_dish', label: 'New menu item', blurb: 'New dish, drink, or special', example: 'e.g. We just added the kimchi burger.', Icon: ChefHat,   tint: 'bg-amber-50 text-amber-700 ring-amber-100' },
  { id: 'event',    label: 'Event or special', blurb: 'Live music, holiday, themed night', example: 'e.g. Trivia night every Wednesday in May.', Icon: CalendarIcon, tint: 'bg-rose-50 text-rose-700 ring-rose-100' },
  { id: 'bts',      label: 'Behind the scenes', blurb: 'Kitchen, prep, story', example: 'e.g. How we make our broth from scratch.', Icon: Camera,   tint: 'bg-sky-50 text-sky-700 ring-sky-100' },
  { id: 'feature',  label: 'Staff or customer', blurb: 'Spotlight a person', example: 'e.g. Meet Carlos, our head chef of 8 years.', Icon: Users,    tint: 'bg-violet-50 text-violet-700 ring-violet-100' },
  { id: 'review',   label: 'Customer review', blurb: 'Highlight a quote', example: 'e.g. A 5-star review we want to amplify.', Icon: MessageCircle, tint: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
  { id: 'promo',    label: 'Promo or deal', blurb: 'Discount, gift card, BOGO', example: 'e.g. 20% off all entrees this weekend.', Icon: Tag,       tint: 'bg-orange-50 text-orange-700 ring-orange-100' },
  { id: 'other',    label: 'Something else', blurb: 'Open-ended', example: 'Tell us what you have in mind.', Icon: MoreHorizontal, tint: 'bg-ink-7 text-ink-3 ring-ink-6' },
]

const QUICK_DATES: { label: string; offsetDays: number | null }[] = [
  { label: 'No rush', offsetDays: null },
  { label: 'This week', offsetDays: 5 },
  { label: 'Next week', offsetDays: 10 },
  { label: 'ASAP',     offsetDays: 1 },
]

const PLATFORMS: { id: string; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'instagram', label: 'Instagram', Icon: Camera },
  { id: 'facebook',  label: 'Facebook',  Icon: Globe },
  { id: 'tiktok',    label: 'TikTok',    Icon: Music },
]

// Web Speech API types — not in lib.dom.d.ts by default.
interface SpeechRecognitionAlternative { transcript: string }
interface SpeechRecognitionResult { isFinal: boolean; 0: SpeechRecognitionAlternative; length: number }
interface SpeechRecognitionResultList { length: number; item(i: number): SpeechRecognitionResult; [index: number]: SpeechRecognitionResult }
interface SpeechRecognitionEvent { resultIndex: number; results: SpeechRecognitionResultList }
interface SpeechRecognitionLike {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  onresult: ((e: SpeechRecognitionEvent) => void) | null
  onerror: ((e: Event) => void) | null
  onend: (() => void) | null
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
}

export default function RequestForm({ clientId }: { clientId: string }) {
  const router = useRouter()
  const [type, setType] = useState<RequestType | null>(null)
  const [description, setDescription] = useState('')
  const [assetLinks, setAssetLinks] = useState('')
  const [quickDate, setQuickDate] = useState<string>('No rush')
  const [customDate, setCustomDate] = useState<string>('')
  const [platforms, setPlatforms] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Voice input — Web Speech API, browser-native (no server cost).
  // Not supported in every browser; we hide the mic button when not available.
  const [voiceSupported, setVoiceSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const descriptionBaseRef = useRef<string>('')

  useEffect(() => {
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (Ctor) setVoiceSupported(true)
  }, [])

  function toggleVoice() {
    if (listening) {
      recognitionRef.current?.stop()
      return
    }
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!Ctor) return
    const r = new Ctor()
    r.continuous = true
    r.interimResults = true
    r.lang = 'en-US'
    descriptionBaseRef.current = description ? description + (description.endsWith(' ') ? '' : ' ') : ''
    r.onresult = (e) => {
      let finalText = ''
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i]
        if (result.isFinal) finalText += result[0].transcript
        else interim += result[0].transcript
      }
      setDescription(descriptionBaseRef.current + finalText + interim)
      if (finalText) descriptionBaseRef.current += finalText
    }
    r.onerror = () => { setListening(false) }
    r.onend = () => { setListening(false); recognitionRef.current = null }
    recognitionRef.current = r
    setListening(true)
    r.start()
  }

  useEffect(() => () => { recognitionRef.current?.stop() }, [])

  const canSubmit = description.trim().length >= 5 && !submitting

  function togglePlatform(id: string) {
    setPlatforms(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]))
  }

  async function submit() {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/social/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          type,
          description: description.trim(),
          assetLinks: assetLinks.trim() || null,
          quickDate,
          customDate: customDate || null,
          platforms,
        }),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `Server returned ${res.status}`)
      }
      setSubmitted(true)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not submit. Try again in a moment.')
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="max-w-3xl mx-auto py-12 px-4">
        <div className="rounded-3xl border bg-gradient-to-br from-emerald-50/60 via-white to-white p-10 text-center" style={{ borderColor: 'var(--db-border, #e8efe9)' }}>
          <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200 flex items-center justify-center mb-4">
            <Check className="w-6 h-6" strokeWidth={2.5} />
          </div>
          <h1 className="text-[24px] font-bold text-ink tracking-tight">
            Got it. Your strategist will respond within 24 hours.
          </h1>
          <p className="text-[14px] text-ink-2 mt-3 max-w-lg mx-auto leading-relaxed">
            One of two things happens next.
          </p>
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl mx-auto text-left">
            <div className="rounded-xl border bg-white px-4 py-3.5" style={{ borderColor: 'var(--db-border, #e5e5e5)' }}>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700 mb-1">
                If it&rsquo;s in your plan
              </p>
              <p className="text-[12px] text-ink-2 leading-snug">
                Your strategist drafts 1-3 versions within 48 hours. You approve in your Inbox.
                No extra charge.
              </p>
            </div>
            <div className="rounded-xl border bg-white px-4 py-3.5" style={{ borderColor: 'var(--db-border, #e5e5e5)' }}>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-700 mb-1">
                If it&rsquo;s a bigger lift
              </p>
              <p className="text-[12px] text-ink-2 leading-snug">
                You&rsquo;ll get a quote here (with line items + total). Approve, ask for changes, or decline.
                Nothing starts until you say yes.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 mt-7">
            <Link
              href="/dashboard/social"
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold bg-ink text-white rounded-full px-4 py-2 hover:bg-ink/90 transition-colors"
            >
              Back to social hub
            </Link>
            <button
              onClick={() => {
                setSubmitted(false); setType(null); setDescription(''); setAssetLinks('');
                setQuickDate('No rush'); setCustomDate(''); setPlatforms([])
              }}
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold border border-ink-6 text-ink-2 hover:text-ink rounded-full px-4 py-2 transition-colors"
            >
              Request another
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 lg:px-6">
      {/* Hero */}
      <header className="mb-7">
        <Link
          href="/dashboard/social"
          className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-3 hover:text-ink mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back
        </Link>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
            <Sparkles className="w-4.5 h-4.5" />
          </div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-3 leading-none">
            Request content
          </p>
        </div>
        <h1 className="text-[28px] sm:text-[30px] leading-tight font-bold text-ink tracking-tight">
          What should we post?
        </h1>
        <p className="text-[14px] text-ink-2 mt-2 leading-relaxed max-w-2xl">
          Tell us in plain English. Your strategist will turn it into 1-3 ready-to-go versions
          for your review.
        </p>
      </header>

      <section className="space-y-7">
        {/* 1. Type */}
        <Field
          label="Type"
          hint="Pick the closest match. Optional — skip if it doesn't fit."
        >
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {TYPES.map(t => {
              const selected = type === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => setType(selected ? null : t.id)}
                  className={`group text-left rounded-xl border bg-white p-3 transition-all ${
                    selected ? 'border-ink shadow-sm' : 'border-ink-6 hover:border-ink-4'
                  }`}
                >
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-2 ring-1 ${t.tint}`}>
                    <t.Icon className="w-4 h-4" />
                  </div>
                  <p className="text-[12px] font-semibold text-ink leading-tight">{t.label}</p>
                  <p className="text-[10px] text-ink-3 leading-tight mt-0.5">{t.blurb}</p>
                </button>
              )
            })}
          </div>
          {type && (
            <p className="text-[11px] text-ink-3 mt-2 italic">
              Example: {TYPES.find(t => t.id === type)?.example}
            </p>
          )}
        </Field>

        {/* 2. Description */}
        <Field
          label="Tell us about it"
          hint={voiceSupported ? 'Type or hit the mic to dictate.' : 'One paragraph is plenty. Voice notes, raw thoughts, or full caption ideas all work.'}
          required
        >
          <div className="relative">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              placeholder="We just rolled out a kimchi burger. Spicy, melty, perfect for late night. Already a regular favorite — want to show it off."
              className={`w-full rounded-xl border bg-white p-4 ${voiceSupported ? 'pr-14' : ''} text-[14px] text-ink leading-relaxed placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400 transition-all resize-none`}
              style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
            />
            {voiceSupported && (
              <button
                type="button"
                onClick={toggleVoice}
                aria-label={listening ? 'Stop recording' : 'Dictate with your voice'}
                className={`absolute top-3 right-3 inline-flex items-center justify-center w-10 h-10 rounded-full transition-all ${
                  listening
                    ? 'bg-rose-600 text-white shadow-lg scale-110 animate-pulse'
                    : 'bg-bg-2 text-ink-3 hover:bg-emerald-50 hover:text-emerald-700'
                }`}
                title={listening ? 'Tap to stop' : 'Tap to dictate'}
              >
                {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
            )}
          </div>
          <div className="flex items-center justify-between mt-1.5">
            <p className={`text-[11px] ${listening ? 'text-rose-700 font-medium' : 'text-ink-4'}`}>
              {listening
                ? 'Listening… speak when ready. Tap the mic to stop.'
                : description.length < 5
                ? 'A sentence or two is enough.'
                : description.length > 800
                ? 'Plenty for us to work with — keep going if you want.'
                : 'Looking good.'}
            </p>
            <p className="text-[11px] text-ink-4 tabular-nums">{description.length}</p>
          </div>
        </Field>

        {/* 3. Photos / videos */}
        <Field
          label="Photos or videos"
          hint="Paste links — Google Drive, Dropbox, iCloud, anything. One per line."
        >
          <textarea
            value={assetLinks}
            onChange={(e) => setAssetLinks(e.target.value)}
            rows={3}
            placeholder="https://photos.app.goo.gl/abc123&#10;https://www.dropbox.com/scl/fi/xyz"
            className="w-full rounded-xl border bg-white p-4 text-[13px] font-mono text-ink leading-relaxed placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400 transition-all resize-none"
            style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
          />
        </Field>

        {/* 4. When */}
        <Field
          label="When"
          hint="No date needed — your strategist picks the best spot in the calendar."
        >
          <div className="flex flex-wrap gap-2">
            {QUICK_DATES.map(q => {
              const selected = quickDate === q.label
              return (
                <button
                  key={q.label}
                  onClick={() => { setQuickDate(q.label); setCustomDate('') }}
                  className={`text-[12px] font-medium px-3 py-1.5 rounded-full transition-all ${
                    selected
                      ? 'bg-ink text-white'
                      : 'bg-white border border-ink-6 text-ink-2 hover:border-ink-4'
                  }`}
                >
                  {q.label}
                </button>
              )
            })}
            <input
              type="date"
              value={customDate}
              onChange={(e) => { setCustomDate(e.target.value); setQuickDate('Custom') }}
              className="text-[12px] font-medium px-3 py-1.5 rounded-full bg-white border border-ink-6 text-ink-2 focus:outline-none focus:border-ink-4"
            />
          </div>
        </Field>

        {/* 5. Where */}
        <Field
          label="Where should it go?"
          hint="Leave blank to let your strategist pick the right channels."
        >
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map(p => {
              const selected = platforms.includes(p.id)
              return (
                <button
                  key={p.id}
                  onClick={() => togglePlatform(p.id)}
                  className={`inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-full transition-all ${
                    selected
                      ? 'bg-ink text-white'
                      : 'bg-white border border-ink-6 text-ink-2 hover:border-ink-4'
                  }`}
                >
                  <p.Icon className="w-3 h-3" />
                  {p.label}
                </button>
              )
            })}
          </div>
        </Field>

        {error && (
          <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-[13px] text-rose-700">
            {error}
          </div>
        )}

        {/* Submit bar */}
        <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white border shadow-lg p-3 sm:p-4"
          style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
        >
          <p className="text-[12px] text-ink-3 px-2">
            {canSubmit
              ? 'Looks good — we\'ll draft within 24 hours.'
              : 'Add a sentence about what you want to post.'}
          </p>
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 text-[14px] font-semibold bg-emerald-600 hover:bg-emerald-700 disabled:bg-ink-6 disabled:cursor-not-allowed text-white rounded-full px-5 py-2.5 transition-colors"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            {submitting ? 'Sending…' : 'Send to strategist'}
          </button>
        </div>
      </section>
    </div>
  )
}

function Field({
  label, hint, required, children,
}: {
  label: string; hint?: string; required?: boolean; children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2 gap-2">
        <label className="text-[13px] font-semibold text-ink">
          {label}
          {required && <span className="text-rose-600 ml-1">*</span>}
        </label>
        {hint && (
          <p className="text-[11px] text-ink-4 leading-tight text-right">{hint}</p>
        )}
      </div>
      {children}
    </div>
  )
}
