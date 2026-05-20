'use client'

/**
 * Business info hub — everything a restaurant owner updates, organized
 * by how they think about it.
 *
 * Editable sections (expand inline, saved together by the sticky bar):
 *   - Contact & basics  (name, phone, website, description)
 *   - Regular hours      (weekly)
 *   - Special hours      (holidays, one-off closures)
 *
 * Quick links (navigate to the dedicated editors for richer systems):
 *   - Menu, Photos, Cuisine & amenities
 *
 * Everything in the editable sections fans out to Google + website +
 * our DB in one save (see actions.ts).
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Loader2, CheckCircle2, AlertCircle, ChevronDown, ChevronRight,
  Building2, Clock, CalendarDays, UtensilsCrossed, ImageIcon, Tag,
  Plus, X, Sparkles, Globe, MapPin,
} from 'lucide-react'
import { saveBusinessInfo, type BusinessInfo } from './actions'
import type { WeeklyHours, DayKey, SpecialHours } from '@/lib/gbp-listing'

const DAYS: { key: DayKey; short: string; label: string }[] = [
  { key: 'mon', short: 'Mon', label: 'Monday' },
  { key: 'tue', short: 'Tue', label: 'Tuesday' },
  { key: 'wed', short: 'Wed', label: 'Wednesday' },
  { key: 'thu', short: 'Thu', label: 'Thursday' },
  { key: 'fri', short: 'Fri', label: 'Friday' },
  { key: 'sat', short: 'Sat', label: 'Saturday' },
  { key: 'sun', short: 'Sun', label: 'Sunday' },
]

const EMPTY_HOURS: WeeklyHours = { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] }

interface Props {
  initial: BusinessInfo | null
  gbpConnected: boolean
  hasWebsite: boolean
  loadError: string | null
}

type SectionKey = 'contact' | 'hours' | 'special'

export default function BusinessInfoEditor({ initial, gbpConnected, hasWebsite, loadError }: Props) {
  const router = useRouter()
  const [name, setName] = useState(initial?.name ?? '')
  const [phone, setPhone] = useState(initial?.phone ?? '')
  const [website, setWebsite] = useState(initial?.website ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [hours, setHours] = useState<WeeklyHours>(initial?.hours ?? EMPTY_HOURS)
  const [specialHours, setSpecialHours] = useState<SpecialHours>(initial?.specialHours ?? [])
  const [open, setOpen] = useState<Set<SectionKey>>(() => new Set<SectionKey>(['contact']))
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<Awaited<ReturnType<typeof saveBusinessInfo>> | null>(null)

  const toggleSection = (k: SectionKey) =>
    setOpen(prev => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })

  /* Hours helpers (one range per day). */
  const dayIsOpen = (d: DayKey) => (hours[d]?.length ?? 0) > 0
  const dayOpen = (d: DayKey) => hours[d]?.[0]?.open ?? '09:00'
  const dayClose = (d: DayKey) => hours[d]?.[0]?.close ?? '17:00'
  const toggleDay = (d: DayKey) =>
    setHours(prev => ({ ...prev, [d]: dayIsOpen(d) ? [] : [{ open: '09:00', close: '17:00' }] }))
  const setDayTime = (d: DayKey, field: 'open' | 'close', value: string) =>
    setHours(prev => {
      const existing = prev[d]?.[0] ?? { open: '09:00', close: '17:00' }
      return { ...prev, [d]: [{ ...existing, [field]: value }] }
    })
  const copyMonToWeekdays = () => {
    const mon = hours.mon?.[0]
    if (!mon) return
    setHours(prev => ({ ...prev, tue: [{ ...mon }], wed: [{ ...mon }], thu: [{ ...mon }], fri: [{ ...mon }] }))
  }

  /* Special hours helpers. */
  const addSpecial = () => {
    const today = new Date().toISOString().slice(0, 10)
    setSpecialHours(prev => [...prev, { date: today, closed: true }])
  }
  const updateSpecial = (i: number, patch: Partial<SpecialHours[number]>) =>
    setSpecialHours(prev => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s))
  const removeSpecial = (i: number) =>
    setSpecialHours(prev => prev.filter((_, idx) => idx !== i))

  const onSave = () => {
    setResult(null)
    setSaving(true)
    saveBusinessInfo({ name, phone, website, description, hours, specialHours })
      .then(setResult)
      .finally(() => setSaving(false))
  }

  /* ── Success screen ── */
  if (result?.synced.saved) {
    return (
      <div className="max-w-lg mx-auto px-4 pt-10 pb-20 text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-50 mx-auto mb-4 flex items-center justify-center">
          <CheckCircle2 className="w-8 h-8 text-emerald-600" />
        </div>
        <h1 className="text-[22px] font-semibold text-ink mb-1">Business info updated</h1>
        <p className="text-[13px] text-ink-3 mb-6">Here&apos;s where your changes went:</p>
        <div className="bg-white border border-ink-6 rounded-2xl divide-y divide-ink-7 text-left overflow-hidden">
          <SyncRow ok label="Your Apnosh records" detail="Saved" />
          <SyncRow
            ok={result.synced.google === 'ok'}
            warn={result.synced.google === 'failed'}
            skipped={result.synced.google === 'skipped'}
            label="Google Business Profile"
            detail={result.synced.google === 'ok' ? 'Synced live'
              : result.synced.google === 'failed' ? (result.googleError ?? 'Sync failed')
              : 'Not connected'}
          />
          <SyncRow
            ok={result.synced.website === 'queued'}
            skipped={result.synced.website === 'skipped'}
            label="Your website"
            detail={result.synced.website === 'queued' ? 'Updating shortly' : 'No Apnosh site'}
          />
        </div>
        <div className="flex gap-2 mt-6">
          <button onClick={() => setResult(null)} className="flex-1 bg-white border border-ink-6 rounded-full py-3 text-[14px] font-semibold text-ink-2 active:bg-ink-7">Edit again</button>
          <button onClick={() => router.push('/dashboard')} className="flex-1 bg-ink text-white rounded-full py-3 text-[14px] font-semibold active:bg-ink-2">Done</button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto pb-tabbar lg:pb-8 -mx-4 lg:mx-0 -mt-4 lg:mt-0 bg-bg-2 min-h-screen">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 bg-white border-b border-ink-6">
        <button onClick={() => router.back()} className="inline-flex items-center gap-1 text-[12px] text-ink-3 active:text-ink mb-2">
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>
        <h1 className="text-[24px] font-semibold text-ink leading-tight">Business info</h1>
        <p className="text-[12.5px] text-ink-3 mt-0.5">
          {gbpConnected || hasWebsite
            ? <>Edits sync to {[gbpConnected && 'Google', hasWebsite && 'your website'].filter(Boolean).join(' + ')} automatically.</>
            : 'Saved to your Apnosh records.'}
        </p>
      </div>

      {loadError && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-[12.5px] text-amber-900">{loadError}</p>
        </div>
      )}

      <div className="px-4 py-4 space-y-3">
        {/* ── Contact & basics ── */}
        <Section
          icon={Building2}
          title="Contact & basics"
          summary={[name, phone].filter(Boolean).join(' · ') || 'Name, phone, website'}
          open={open.has('contact')}
          onToggle={() => toggleSection('contact')}
          tint="bg-blue-50 text-blue-700"
        >
          <LabeledInput label="Restaurant name" value={name} onChange={setName} placeholder="Your restaurant name" />
          <LabeledInput label="Phone" type="tel" value={phone} onChange={setPhone} placeholder="(206) 555-0123" />
          <LabeledInput label="Website" type="url" value={website} onChange={setWebsite} placeholder="https://yourrestaurant.com" />
          <div>
            <label className="block text-[12px] font-semibold text-ink-2 mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={4}
              placeholder="What makes your place special..."
              className="w-full bg-white border border-ink-6 rounded-xl px-3.5 py-3 text-[15px] focus:outline-none focus:border-brand resize-none touch-input"
            />
            <p className="text-[11px] text-ink-4 mt-1">{description.length} characters</p>
          </div>
        </Section>

        {/* ── Regular hours ── */}
        <Section
          icon={Clock}
          title="Regular hours"
          summary={hoursSummary(hours)}
          open={open.has('hours')}
          onToggle={() => toggleSection('hours')}
          tint="bg-emerald-50 text-emerald-700"
        >
          <div className="bg-white border border-ink-6 rounded-2xl divide-y divide-ink-7 overflow-hidden">
            {DAYS.map(d => {
              const isOpen = dayIsOpen(d.key)
              return (
                <div key={d.key} className="flex items-center gap-2 px-3.5 py-2.5 min-h-[52px]">
                  <span className="w-9 text-[13px] font-semibold text-ink">{d.short}</span>
                  <Toggle on={isOpen} onClick={() => toggleDay(d.key)} label={`${d.label} ${isOpen ? 'open' : 'closed'}`} />
                  {isOpen ? (
                    <div className="flex items-center gap-1.5 flex-1 justify-end">
                      <input type="time" value={dayOpen(d.key)} onChange={e => setDayTime(d.key, 'open', e.target.value)} className="bg-bg-2 border border-ink-6 rounded-lg px-2 py-1.5 text-[13px] focus:outline-none focus:border-brand" />
                      <span className="text-ink-4 text-[12px]">to</span>
                      <input type="time" value={dayClose(d.key)} onChange={e => setDayTime(d.key, 'close', e.target.value)} className="bg-bg-2 border border-ink-6 rounded-lg px-2 py-1.5 text-[13px] focus:outline-none focus:border-brand" />
                    </div>
                  ) : (
                    <span className="flex-1 text-right text-[13px] text-ink-4">Closed</span>
                  )}
                </div>
              )
            })}
          </div>
          {dayIsOpen('mon') && (
            <button onClick={copyMonToWeekdays} className="text-[12px] font-semibold text-brand-dark active:text-brand mt-2">
              Copy Monday to all weekdays
            </button>
          )}
        </Section>

        {/* ── Special hours ── */}
        <Section
          icon={CalendarDays}
          title="Special & holiday hours"
          summary={specialHours.length > 0 ? `${specialHours.length} date${specialHours.length > 1 ? 's' : ''} set` : 'Holidays, one-off closures'}
          open={open.has('special')}
          onToggle={() => toggleSection('special')}
          tint="bg-rose-50 text-rose-700"
        >
          {!gbpConnected && (
            <p className="text-[12px] text-ink-3 mb-3">Connect Google Business Profile to publish special hours.</p>
          )}
          <div className="space-y-2.5">
            {specialHours.map((s, i) => (
              <div key={i} className="bg-white border border-ink-6 rounded-2xl p-3">
                <div className="flex items-center gap-2 mb-2.5">
                  <input
                    type="date"
                    value={s.date}
                    onChange={e => updateSpecial(i, { date: e.target.value })}
                    className="flex-1 bg-bg-2 border border-ink-6 rounded-lg px-2.5 py-1.5 text-[13px] focus:outline-none focus:border-brand"
                  />
                  <button onClick={() => removeSpecial(i)} className="w-8 h-8 rounded-full bg-ink-7 text-ink-3 flex items-center justify-center active:bg-ink-6" aria-label="Remove">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <Toggle on={!s.closed} onClick={() => updateSpecial(i, { closed: !s.closed })} label={s.closed ? 'Closed' : 'Open'} />
                  {s.closed ? (
                    <span className="flex-1 text-[13px] text-ink-4">Closed all day</span>
                  ) : (
                    <div className="flex items-center gap-1.5 flex-1 justify-end">
                      <input type="time" value={s.open ?? '09:00'} onChange={e => updateSpecial(i, { open: e.target.value })} className="bg-bg-2 border border-ink-6 rounded-lg px-2 py-1.5 text-[13px] focus:outline-none focus:border-brand" />
                      <span className="text-ink-4 text-[12px]">to</span>
                      <input type="time" value={s.close ?? '17:00'} onChange={e => updateSpecial(i, { close: e.target.value })} className="bg-bg-2 border border-ink-6 rounded-lg px-2 py-1.5 text-[13px] focus:outline-none focus:border-brand" />
                    </div>
                  )}
                </div>
              </div>
            ))}
            <button onClick={addSpecial} className="w-full inline-flex items-center justify-center gap-1.5 bg-white border border-dashed border-ink-5 rounded-2xl py-3 text-[13px] font-semibold text-ink-2 active:bg-ink-7">
              <Plus className="w-4 h-4" /> Add a special date
            </button>
          </div>
        </Section>

        {/* ── Quick links to richer editors ── */}
        <div className="pt-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-3 px-1 mb-2">More to manage</p>
          <div className="bg-white border border-ink-6 rounded-2xl divide-y divide-ink-7 overflow-hidden">
            <LinkRow icon={UtensilsCrossed} tint="bg-amber-50 text-amber-700" label="Menu" sub="Items, prices, sections" href="/dashboard/local-seo/menu" />
            <LinkRow icon={ImageIcon} tint="bg-purple-50 text-purple-700" label="Photos" sub="Logo, cover, food gallery" href="/dashboard/assets" />
            <LinkRow icon={Tag} tint="bg-cyan-50 text-cyan-700" label="Cuisine & amenities" sub="Categories, dining options, parking" href="/dashboard/local-seo/listing" />
          </div>
        </div>

        {/* Where it syncs */}
        <div className="bg-brand-tint/40 border border-brand/20 rounded-2xl p-4 mt-1">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-brand-dark" />
            <p className="text-[12.5px] font-semibold text-ink">Saving updates:</p>
          </div>
          <ul className="space-y-1.5 text-[12.5px] text-ink-2">
            <li className="flex items-center gap-2"><MapPin className="w-3.5 h-3.5 text-brand-dark" /> Your Apnosh records</li>
            <li className="flex items-center gap-2"><Globe className="w-3.5 h-3.5 text-brand-dark" /> Google Business Profile {gbpConnected ? '' : <span className="text-ink-4">(connect to enable)</span>}</li>
            {hasWebsite && <li className="flex items-center gap-2"><Globe className="w-3.5 h-3.5 text-brand-dark" /> Your website</li>}
          </ul>
        </div>

        {result?.error && !result.synced.saved && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
            <p className="text-[12.5px] text-rose-800">{result.error}</p>
          </div>
        )}
      </div>

      {/* Sticky save */}
      <div className="sticky bottom-0 bg-white border-t border-ink-6 px-4 py-3 safe-bottom">
        <button onClick={onSave} disabled={saving} className="w-full bg-brand text-white rounded-full py-3.5 text-[15px] font-semibold active:bg-brand-dark disabled:opacity-60 inline-flex items-center justify-center gap-2 min-h-[52px]">
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving & syncing...</> : <>Save &amp; sync everywhere</>}
        </button>
      </div>
    </div>
  )
}

/* ── Reusable bits ── */

function Section({ icon: Icon, title, summary, open, onToggle, tint, children }: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  summary: string
  open: boolean
  onToggle: () => void
  tint: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-2xl border border-ink-6 overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center gap-3 p-4 active:bg-ink-7 transition-colors text-left" aria-expanded={open}>
        <span className={`inline-flex items-center justify-center w-10 h-10 rounded-xl flex-shrink-0 ${tint}`}>
          <Icon className="w-5 h-5" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-semibold text-ink leading-tight">{title}</p>
          {!open && <p className="text-[12px] text-ink-3 mt-0.5 truncate">{summary}</p>}
        </div>
        <ChevronDown className={`w-5 h-5 text-ink-4 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="px-4 pb-4 pt-1 border-t border-ink-7 space-y-3"><div className="pt-3 space-y-3">{children}</div></div>}
    </div>
  )
}

function LabeledInput({ label, value, onChange, type = 'text', placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string
}) {
  return (
    <div>
      <label className="block text-[12px] font-semibold text-ink-2 mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-white border border-ink-6 rounded-xl px-3.5 py-3 text-[15px] focus:outline-none focus:border-brand touch-input"
      />
    </div>
  )
}

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={['relative w-11 h-6 rounded-full transition-colors flex-shrink-0', on ? 'bg-brand' : 'bg-ink-6'].join(' ')}
      aria-pressed={on}
      aria-label={label}
    >
      <span className={['absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform', on ? 'translate-x-5' : 'translate-x-0'].join(' ')} />
    </button>
  )
}

function LinkRow({ icon: Icon, tint, label, sub, href }: {
  icon: React.ComponentType<{ className?: string }>; tint: string; label: string; sub: string; href: string
}) {
  return (
    <Link href={href} className="flex items-center gap-3 px-4 py-3 min-h-[60px] active:bg-ink-7 transition-colors">
      <span className={`inline-flex items-center justify-center w-9 h-9 rounded-xl flex-shrink-0 ${tint}`}>
        <Icon className="w-[18px] h-[18px]" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[14.5px] font-semibold text-ink leading-tight">{label}</p>
        <p className="text-[11.5px] text-ink-3 mt-0.5">{sub}</p>
      </div>
      <ChevronRight className="w-4 h-4 text-ink-4 flex-shrink-0" />
    </Link>
  )
}

function SyncRow({ ok, warn, skipped, label, detail }: { ok?: boolean; warn?: boolean; skipped?: boolean; label: string; detail: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      {warn ? <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />
        : skipped ? <span className="w-5 h-5 rounded-full bg-ink-7 flex-shrink-0" />
        : <CheckCircle2 className={`w-5 h-5 flex-shrink-0 ${ok ? 'text-emerald-600' : 'text-ink-4'}`} />}
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-semibold text-ink">{label}</p>
        <p className={`text-[12px] ${warn ? 'text-amber-700' : 'text-ink-3'}`}>{detail}</p>
      </div>
    </div>
  )
}

function hoursSummary(hours: WeeklyHours): string {
  const openDays = DAYS.filter(d => (hours[d.key]?.length ?? 0) > 0)
  if (openDays.length === 0) return 'Set your weekly hours'
  if (openDays.length === 7) return 'Open every day'
  return `Open ${openDays.length} days a week`
}
