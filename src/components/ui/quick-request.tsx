'use client'

/**
 * Request content — outcome-first, guided.
 *
 * Step 1: the owner picks what they want in plain language.
 * Step 2: a brief tailored to that outcome (config-driven).
 *
 * Scheduled outcomes ("Promote a special", "Announce an event") get a
 * structured run window (one day / range / recurring weekday / ongoing)
 * separate from the content deadline, optional time + link + goal, and a
 * one-submit "add to my calendar" that also creates the item in the
 * planner via createPlan. Everything submits for real via
 * submitContentRequest() (content_queue + AI brief expansion).
 *
 * Other outcomes keep the generic brief and are tailored one by one.
 */

import { useState, useEffect, useMemo, useRef } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import {
  Plus, X, ArrowLeft, ArrowRight, ChevronDown, Upload, Loader2, CheckCircle2,
  Camera, Globe, Video, Mail, Megaphone, CalendarDays, TrendingUp, Aperture, Printer, Sparkles,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { submitContentRequest } from '@/lib/request-actions'
import { createPlan } from '@/app/dashboard/analytics/plan-actions'

type Platform = 'instagram' | 'facebook' | 'tiktok' | 'email'

interface Outcome {
  key: string
  label: string
  hint: string
  icon: typeof Camera
  tint: string
  area: 'social' | 'website' | 'local_seo' | 'email_sms'
  tmpl: string
  platforms: boolean
  ask: string
  // tailored Step 2 config
  scheduled?: boolean          // run window + "add to calendar"
  ongoing?: boolean            // offer an "Ongoing" run type (promos)
  timed?: boolean              // offer a start-time (events)
  goal?: boolean               // offer goal chips (promos)
  linkLabel?: string           // optional link field
  planKind?: 'promotion' | 'event'
}

const OUTCOMES: Outcome[] = [
  { key: 'promo', label: 'Promote a special', hint: 'A deal, new dish, or featured item', icon: Megaphone, tint: 'bg-emerald-50 text-emerald-700', area: 'social', tmpl: 'promotion', platforms: true, ask: "What's the special? Name the dish or offer (and a price, if there is one).", scheduled: true, ongoing: true, goal: true, linkLabel: 'Reservations or order link', planKind: 'promotion' },
  { key: 'event', label: 'Announce an event', hint: 'Live music, trivia, holiday', icon: CalendarDays, tint: 'bg-blue-50 text-blue-700', area: 'social', tmpl: 'event', platforms: true, ask: "What's the event? Include anything guests should know.", scheduled: true, timed: true, linkLabel: 'RSVP or ticket link', planKind: 'event' },
  { key: 'photos', label: 'Post our photos', hint: 'Photos or video we took', icon: Camera, tint: 'bg-violet-50 text-violet-700', area: 'social', tmpl: 'photo', platforms: true, ask: 'What are these of? Add the photo or video below.' },
  { key: 'ad', label: 'Run an ad', hint: 'Boost a post, paid reach', icon: TrendingUp, tint: 'bg-amber-50 text-amber-700', area: 'social', tmpl: 'ad', platforms: true, ask: 'What do you want to promote, and your goal (orders, reach)?' },
  { key: 'email', label: 'Email or text', hint: 'Reach your customers', icon: Mail, tint: 'bg-rose-50 text-rose-700', area: 'email_sms', tmpl: 'email', platforms: false, ask: "What's the message and the offer?" },
  { key: 'shoot', label: 'Book a shoot', hint: 'Photo or video on-site', icon: Aperture, tint: 'bg-fuchsia-50 text-fuchsia-700', area: 'social', tmpl: 'shoot', platforms: false, ask: 'What do you want shot, and any preferred dates?' },
  { key: 'print', label: 'Print materials', hint: 'Menus, table tents, flyers', icon: Printer, tint: 'bg-orange-50 text-orange-700', area: 'social', tmpl: 'print', platforms: false, ask: 'What do you need printed, and how many?' },
  { key: 'web', label: 'Google or website', hint: 'Update your online info', icon: Globe, tint: 'bg-sky-50 text-sky-700', area: 'website', tmpl: 'web_update', platforms: false, ask: 'What needs updating on Google or your website?' },
  { key: 'other', label: 'Something else', hint: "We'll figure it out", icon: Sparkles, tint: 'bg-slate-100 text-slate-700', area: 'social', tmpl: 'general', platforms: false, ask: 'Tell us what you need.' },
]

const PLATFORMS: { id: Platform; label: string; icon: typeof Camera }[] = [
  { id: 'instagram', label: 'Instagram', icon: Camera },
  { id: 'facebook', label: 'Facebook', icon: Globe },
  { id: 'tiktok', label: 'TikTok', icon: Video },
  { id: 'email', label: 'Email', icon: Mail },
]
const WHEN: { v: string; label: string }[] = [
  { v: 'asap', label: 'ASAP' }, { v: 'this_week', label: 'This week' }, { v: 'next_week', label: 'Next week' }, { v: 'specific', label: 'Pick a date' },
]
const BASE_RUN: { v: string; label: string }[] = [
  { v: 'one_day', label: 'One day' }, { v: 'range', label: 'Date range' }, { v: 'recurring', label: 'Recurring' },
]
const ONGOING = { v: 'ongoing', label: 'Ongoing' }
const GOALS: { v: string; label: string }[] = [
  { v: 'launch', label: 'Launch something new' }, { v: 'slow', label: 'Fill a slow time' }, { v: 'holiday', label: 'Holiday or event' }, { v: 'visibility', label: 'Stay visible' },
]
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
function nextWeekday(dow: number): string { const d = new Date(); d.setDate(d.getDate() + ((dow - d.getDay() + 7) % 7)); return ymd(d) }
function fmtTime(t: string): string { const [h, m] = t.split(':').map(Number); const ap = h >= 12 ? 'PM' : 'AM'; const h12 = h % 12 === 0 ? 12 : h % 12; return `${h12}:${pad(m)} ${ap}` }

export default function QuickRequest() {
  const supabase = useMemo(() => createClient(), [])
  const [open, setOpen] = useState(false)
  const [showPulse, setShowPulse] = useState(true)
  const [step, setStep] = useState<1 | 2>(1)
  const [outcome, setOutcome] = useState<Outcome | null>(null)

  const [description, setDescription] = useState('')
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>([])
  const [urgency, setUrgency] = useState('')
  const [specificDate, setSpecificDate] = useState('')
  const [photo, setPhoto] = useState<{ url: string; name: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [requestId, setRequestId] = useState('')
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // Scheduled-outcome fields (promo + event)
  const [runType, setRunType] = useState('')
  const [runStart, setRunStart] = useState('')
  const [runEnd, setRunEnd] = useState('')
  const [recurDay, setRecurDay] = useState<number | null>(null)
  const [startTime, setStartTime] = useState('')
  const [goal, setGoal] = useState('')
  const [link, setLink] = useState('')
  const [addToCalendar, setAddToCalendar] = useState(true)
  const [showMore, setShowMore] = useState(false)

  useEffect(() => { const t = setTimeout(() => setShowPulse(false), 4000); return () => clearTimeout(t) }, [])

  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  useEffect(() => {
    if (searchParams?.get('request') === 'open') {
      setOpen(true); setShowPulse(false)
      const params = new URLSearchParams(searchParams.toString())
      params.delete('request')
      const next = params.toString()
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  useEffect(() => {
    if (!submitted) return
    const t = setTimeout(() => { setOpen(false); setTimeout(reset, 300) }, 3500)
    return () => clearTimeout(t)
  }, [submitted])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    if (open) document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  function reset() {
    setStep(1); setOutcome(null); setDescription(''); setSelectedPlatforms([])
    setUrgency(''); setSpecificDate(''); setPhoto(null); setError(''); setSubmitted(false)
    setRunType(''); setRunStart(''); setRunEnd(''); setRecurDay(null); setStartTime(''); setGoal(''); setLink(''); setAddToCalendar(true); setShowMore(false)
  }
  function pick(o: Outcome) { setOutcome(o); setStep(2); setError('') }
  function togglePlatform(p: Platform) { setSelectedPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]) }

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
    } finally { setUploading(false) }
  }

  function runStartDate(): string | null {
    if (runType === 'one_day' || runType === 'range') return runStart || null
    if (runType === 'recurring') return recurDay != null ? nextWeekday(recurDay) : null
    if (runType === 'ongoing') return ymd(new Date())
    return null
  }
  function runSummary(): string {
    if (runType === 'one_day' && runStart) return runStart
    if (runType === 'range' && runStart) return `${runStart}${runEnd ? ` to ${runEnd}` : ''}`
    if (runType === 'recurring' && recurDay != null) return `every ${WEEKDAYS[recurDay]}`
    if (runType === 'ongoing') return 'ongoing'
    return ''
  }

  const scheduled = !!outcome?.scheduled
  const isEvent = outcome?.key === 'event'
  const runTypes = outcome?.ongoing ? [...BASE_RUN, ONGOING] : BASE_RUN
  const canSubmit = !!outcome && description.trim().length > 5 && !uploading

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit || submitting || !outcome) return
    setSubmitting(true); setError('')

    if (scheduled && addToCalendar) {
      const start = runStartDate()
      if (start) {
        const title = description.trim().split('\n')[0].slice(0, 60) || outcome.label
        const timed = !!(outcome.timed && startTime)
        await createPlan({
          title, kind: outcome.planKind || 'event', notes: description.trim(),
          startDate: start, endDate: runType === 'range' ? (runEnd || null) : null,
          allDay: !timed, startTime: timed ? startTime : null, status: 'planned',
        }).catch(() => { /* non-fatal */ })
      }
    }

    const parts: string[] = []
    if (scheduled) {
      if (runSummary()) parts.push(`${isEvent ? 'On' : 'Runs'}: ${runSummary()}`)
      if (outcome.timed && startTime) parts.push(`Time: ${fmtTime(startTime)}`)
      if (outcome.goal && goal) parts.push(`Goal: ${GOALS.find(g => g.v === goal)?.label}`)
      if (outcome.linkLabel && link) parts.push(`Link: ${link}`)
    }
    const fullDescription = parts.length ? `${description.trim()}\n\n${parts.join('\n')}` : description.trim()

    const res = await submitContentRequest({
      mode: 'quick',
      description: fullDescription,
      serviceArea: outcome.area,
      templateType: outcome.tmpl,
      photoUrl: photo?.url,
      urgency: scheduled ? undefined : (urgency || undefined),
      deadline: scheduled ? (runStartDate() || undefined) : (urgency === 'specific' && specificDate ? specificDate : undefined),
      platforms: outcome.platforms ? selectedPlatforms : undefined,
      detail: { outcome: outcome.key, platforms: selectedPlatforms, runType, runStart, runEnd, recurDay, startTime, goal, link },
    })
    setSubmitting(false)
    if (!res.success) { setError(res.error || 'Could not submit. Please try again.'); return }
    setRequestId(res.requestId || ''); setSubmitted(true)
  }

  const chip = (active: boolean) =>
    `inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-[13px] font-medium border transition-all ${
      active ? 'bg-brand-tint border-brand/30 text-brand-dark' : 'bg-white border-ink-6 text-ink-3 hover:border-ink-5 hover:text-ink-2'
    }`

  return (
    <>
      <div className="hidden lg:flex fixed bottom-6 right-6 z-50 group">
        <span className="absolute bottom-full right-0 mb-2 px-2.5 py-1 rounded-lg bg-ink text-white text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">Request content</span>
        {showPulse && <span className="absolute inset-0 rounded-full bg-brand-dark/30 animate-ping" />}
        <button onClick={() => { setOpen(true); setShowPulse(false) }} className="relative w-14 h-14 rounded-full bg-brand-dark text-white flex items-center justify-center shadow-lg hover:scale-110 hover:shadow-xl active:scale-95 transition-all duration-200 cursor-pointer" aria-label="Request content">
          <Plus className="w-6 h-6" strokeWidth={2.5} />
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-[fadeIn_150ms_ease]" onClick={() => { if (!submitting) setOpen(false) }} />

          <div className="relative w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto animate-[slideUp_200ms_ease]">
            <div className="sm:hidden flex justify-center pt-2.5 pb-1"><div className="w-9 h-1 rounded-full bg-ink-6" /></div>
            <div className="sticky top-0 bg-white/95 backdrop-blur-sm border-b border-ink-6 px-5 py-3.5 flex items-center gap-2 z-10">
              {step === 2 && !submitted && (
                <button onClick={() => setStep(1)} className="w-8 h-8 -ml-1.5 rounded-lg hover:bg-bg-2 flex items-center justify-center text-ink-4 hover:text-ink transition-colors" aria-label="Back"><ArrowLeft className="w-4 h-4" /></button>
              )}
              <h2 className="font-[family-name:var(--font-display)] text-lg text-ink flex-1">{submitted ? 'Request sent' : step === 1 ? 'What do you need?' : outcome?.label}</h2>
              <button onClick={() => setOpen(false)} className="w-8 h-8 rounded-lg hover:bg-bg-2 flex items-center justify-center text-ink-4 hover:text-ink transition-colors" aria-label="Close"><X className="w-4 h-4" /></button>
            </div>

            {submitted ? (
              <div className="p-6 text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-brand-tint flex items-center justify-center mx-auto"><CheckCircle2 className="w-8 h-8 text-brand-dark" /></div>
                <div>
                  <h3 className="font-[family-name:var(--font-display)] text-xl text-ink">Request submitted</h3>
                  {requestId && <p className="text-sm text-ink-3 mt-1">Reference <span className="font-mono font-medium text-ink-2">#{requestId.slice(0, 8)}</span></p>}
                </div>
                <p className="text-sm text-ink-3 leading-relaxed">Your team has it and will get started.{scheduled && addToCalendar && runStartDate() ? ' It’s on your calendar too.' : ''} Track it under your requests.</p>
                <a href="/dashboard/insights/requests" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-dark hover:underline">View your requests <ArrowRight className="w-3.5 h-3.5" /></a>
              </div>
            ) : step === 1 ? (
              <div className="p-4 grid grid-cols-2 gap-2.5">
                {OUTCOMES.map(o => (
                  <button key={o.key} type="button" onClick={() => pick(o)} className="flex flex-col items-start gap-2 p-3.5 rounded-2xl border border-ink-6 bg-white hover:border-ink-5 hover:shadow-sm active:scale-[0.98] transition-all text-left">
                    <span className={`inline-flex items-center justify-center w-10 h-10 rounded-xl ${o.tint}`}><o.icon className="w-5 h-5" /></span>
                    <span className="text-[14px] font-semibold text-ink leading-tight">{o.label}</span>
                    <span className="text-[11.5px] text-ink-4 leading-tight">{o.hint}</span>
                  </button>
                ))}
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="p-5 space-y-4">
                {error && <p className="text-[13px] font-medium text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>}

                <div>
                  <label className="block text-sm font-medium text-ink mb-1.5">{outcome?.key === 'promo' ? "What's the special?" : isEvent ? "What's the event?" : 'Tell us about it'}</label>
                  <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder={outcome?.ask} rows={3}
                    className="w-full bg-bg-2 border border-ink-6 rounded-xl px-4 py-2.5 text-base text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand resize-none transition-colors" />
                </div>

                {scheduled && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-ink mb-2">{isEvent ? 'When is it?' : 'When does it run?'}</label>
                      <div className="flex flex-wrap gap-2">
                        {runTypes.map(r => <button key={r.v} type="button" onClick={() => setRunType(r.v)} className={chip(runType === r.v)}>{r.label}</button>)}
                      </div>
                      {runType === 'one_day' && <input type="date" value={runStart} onChange={e => setRunStart(e.target.value)} className="mt-2 w-full bg-bg-2 border border-ink-6 rounded-xl px-4 py-2.5 text-base text-ink focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand" />}
                      {runType === 'range' && (
                        <div className="mt-2 flex gap-2">
                          <input type="date" value={runStart} onChange={e => setRunStart(e.target.value)} className="flex-1 min-w-0 bg-bg-2 border border-ink-6 rounded-xl px-3 py-2.5 text-base text-ink focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand" />
                          <input type="date" value={runEnd} min={runStart} onChange={e => setRunEnd(e.target.value)} className="flex-1 min-w-0 bg-bg-2 border border-ink-6 rounded-xl px-3 py-2.5 text-base text-ink focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand" />
                        </div>
                      )}
                      {runType === 'recurring' && (
                        <div className="mt-2 flex flex-wrap gap-2">{WEEKDAYS.map((d, i) => <button key={d} type="button" onClick={() => setRecurDay(i)} className={chip(recurDay === i)}>{d}</button>)}</div>
                      )}
                    </div>

                    {outcome?.timed && runType && runType !== 'ongoing' && (
                      <div>
                        <label className="block text-sm font-medium text-ink mb-1.5">Start time <span className="text-ink-4 font-normal">(optional)</span></label>
                        <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="w-full bg-bg-2 border border-ink-6 rounded-xl px-4 py-2.5 text-base text-ink focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand" />
                      </div>
                    )}

                    {(outcome?.goal || outcome?.linkLabel) && (
                      <div>
                        <button type="button" onClick={() => setShowMore(v => !v)} className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand-dark">
                          {showMore ? 'Fewer details' : 'More details'} <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showMore ? 'rotate-180' : ''}`} />
                        </button>
                        {showMore && (
                          <div className="mt-3 space-y-4">
                            {outcome?.goal && (
                              <div>
                                <label className="block text-sm font-medium text-ink mb-2">Goal</label>
                                <div className="flex flex-wrap gap-2">{GOALS.map(g => <button key={g.v} type="button" onClick={() => setGoal(goal === g.v ? '' : g.v)} className={chip(goal === g.v)}>{g.label}</button>)}</div>
                              </div>
                            )}
                            {outcome?.linkLabel && (
                              <div>
                                <label className="block text-sm font-medium text-ink mb-1.5">{outcome.linkLabel}</label>
                                <input type="url" value={link} onChange={e => setLink(e.target.value)} placeholder="https://…" className="w-full bg-bg-2 border border-ink-6 rounded-xl px-4 py-2.5 text-base text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand" />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}

                {outcome?.platforms && (
                  <div>
                    <label className="block text-sm font-medium text-ink mb-2">Which platforms?</label>
                    <div className="flex flex-wrap gap-2">{PLATFORMS.map(p => <button key={p.id} type="button" onClick={() => togglePlatform(p.id)} className={chip(selectedPlatforms.includes(p.id))}><p.icon className="w-3.5 h-3.5" /> {p.label}</button>)}</div>
                  </div>
                )}

                {!scheduled && (
                  <div>
                    <label className="block text-sm font-medium text-ink mb-2">When do you need it?</label>
                    <div className="flex flex-wrap gap-2">{WHEN.map(w => <button key={w.v} type="button" onClick={() => setUrgency(w.v)} className={chip(urgency === w.v)}>{w.label}</button>)}</div>
                    {urgency === 'specific' && <input type="date" value={specificDate} onChange={e => setSpecificDate(e.target.value)} className="mt-2 w-full bg-bg-2 border border-ink-6 rounded-xl px-4 py-2.5 text-base text-ink focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand" />}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-ink mb-1.5">Add a photo {outcome?.key === 'photos' ? '' : '(optional)'}</label>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onPickPhoto(f) }} />
                  {photo ? (
                    <div className="flex items-center gap-3 border border-ink-6 rounded-xl p-2.5">
                      <img src={photo.url} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                      <span className="flex-1 text-xs text-ink-2 truncate">{photo.name}</span>
                      <button type="button" onClick={() => setPhoto(null)} className="text-xs font-medium text-ink-4 hover:text-rose-600">Remove</button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="w-full border-2 border-dashed border-ink-5 rounded-xl p-5 text-center hover:border-brand/40 hover:bg-brand-tint/30 transition-colors disabled:opacity-60">
                      {uploading ? <Loader2 className="w-5 h-5 text-ink-4 mx-auto mb-1.5 animate-spin" /> : <Upload className="w-5 h-5 text-ink-4 mx-auto mb-1.5" />}
                      <p className="text-xs text-ink-4">{uploading ? 'Uploading…' : 'Tap to upload a photo'}</p>
                    </button>
                  )}
                </div>

                {scheduled && (
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <button type="button" role="switch" aria-checked={addToCalendar} onClick={() => setAddToCalendar(v => !v)} className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${addToCalendar ? 'bg-brand' : 'bg-ink-6'}`}>
                      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${addToCalendar ? 'translate-x-5' : ''}`} />
                    </button>
                    <span className="text-sm text-ink-2">Also add this to my calendar</span>
                  </label>
                )}

                <button type="submit" disabled={!canSubmit || submitting} className="w-full py-3 rounded-xl bg-brand-dark text-white text-sm font-medium flex items-center justify-center gap-2 hover:bg-brand-dark/90 active:scale-[0.98] transition-all disabled:opacity-40 disabled:pointer-events-none">
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
