'use client'

/**
 * Business info editor — mobile-first, deliberately simple.
 *
 * Five things owners actually change: name, phone, website,
 * description, and weekly hours. One save button that fans the change
 * out everywhere (Google, website, our records) and shows exactly
 * what synced.
 *
 * Hours use one open–close range per day with a per-day open/closed
 * toggle (covers the vast majority of restaurants). Split shifts stay
 * in the advanced listing editor.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Loader2, CheckCircle2, AlertCircle, Building2,
  Phone, Globe, FileText, Clock, MapPin, Sparkles,
} from 'lucide-react'
import { saveBusinessInfo, type BusinessInfo } from './actions'
import type { WeeklyHours, DayKey } from '@/lib/gbp-listing'

const DAYS: { key: DayKey; label: string; short: string }[] = [
  { key: 'mon', label: 'Monday', short: 'Mon' },
  { key: 'tue', label: 'Tuesday', short: 'Tue' },
  { key: 'wed', label: 'Wednesday', short: 'Wed' },
  { key: 'thu', label: 'Thursday', short: 'Thu' },
  { key: 'fri', label: 'Friday', short: 'Fri' },
  { key: 'sat', label: 'Saturday', short: 'Sat' },
  { key: 'sun', label: 'Sunday', short: 'Sun' },
]

const EMPTY_HOURS: WeeklyHours = { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] }

interface Props {
  initial: BusinessInfo | null
  gbpConnected: boolean
  hasWebsite: boolean
  loadError: string | null
}

export default function BusinessInfoEditor({ initial, gbpConnected, hasWebsite, loadError }: Props) {
  const router = useRouter()
  const [name, setName] = useState(initial?.name ?? '')
  const [phone, setPhone] = useState(initial?.phone ?? '')
  const [website, setWebsite] = useState(initial?.website ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [hours, setHours] = useState<WeeklyHours>(initial?.hours ?? EMPTY_HOURS)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<Awaited<ReturnType<typeof saveBusinessInfo>> | null>(null)

  /* Per-day helpers — one range per day for simplicity. */
  const dayIsOpen = (d: DayKey) => (hours[d]?.length ?? 0) > 0
  const dayOpen = (d: DayKey) => hours[d]?.[0]?.open ?? '09:00'
  const dayClose = (d: DayKey) => hours[d]?.[0]?.close ?? '17:00'

  const toggleDay = (d: DayKey) => {
    setHours(prev => ({
      ...prev,
      [d]: dayIsOpen(d) ? [] : [{ open: '09:00', close: '17:00' }],
    }))
  }
  const setDayTime = (d: DayKey, field: 'open' | 'close', value: string) => {
    setHours(prev => {
      const existing = prev[d]?.[0] ?? { open: '09:00', close: '17:00' }
      return { ...prev, [d]: [{ ...existing, [field]: value }] }
    })
  }
  /* Apply Mon's hours to all weekdays as a quick shortcut. */
  const copyMonToWeekdays = () => {
    const mon = hours.mon?.[0]
    if (!mon) return
    setHours(prev => ({
      ...prev,
      tue: [{ ...mon }], wed: [{ ...mon }], thu: [{ ...mon }], fri: [{ ...mon }],
    }))
  }

  const onSave = () => {
    setResult(null)
    setSaving(true)
    saveBusinessInfo({ name, phone, website, description, hours })
      .then(r => setResult(r))
      .finally(() => setSaving(false))
  }

  /* Success screen. */
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
            detail={
              result.synced.google === 'ok' ? 'Synced live'
                : result.synced.google === 'failed' ? (result.googleError ?? 'Sync failed')
                : 'Not connected'
            }
          />
          <SyncRow
            ok={result.synced.website === 'queued'}
            skipped={result.synced.website === 'skipped'}
            label="Your website"
            detail={result.synced.website === 'queued' ? 'Updating shortly' : 'No Apnosh site'}
          />
        </div>

        <div className="flex gap-2 mt-6">
          <button
            onClick={() => { setResult(null) }}
            className="flex-1 bg-white border border-ink-6 rounded-full py-3 text-[14px] font-semibold text-ink-2 active:bg-ink-7"
          >
            Edit again
          </button>
          <button
            onClick={() => router.push('/dashboard')}
            className="flex-1 bg-ink text-white rounded-full py-3 text-[14px] font-semibold active:bg-ink-2"
          >
            Done
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto pb-tabbar lg:pb-8 -mx-4 lg:mx-0 -mt-4 lg:mt-0 bg-bg-2 min-h-screen">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 bg-white border-b border-ink-6">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1 text-[12px] text-ink-3 active:text-ink mb-2"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>
        <h1 className="text-[24px] font-semibold text-ink leading-tight">Update business info</h1>
        <p className="text-[12.5px] text-ink-3 mt-0.5">
          {gbpConnected || hasWebsite
            ? <>Changes sync to {[gbpConnected && 'Google', hasWebsite && 'your website'].filter(Boolean).join(' + ')} automatically.</>
            : 'Saved to your Apnosh records.'}
        </p>
      </div>

      {loadError && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-[12.5px] text-amber-900">{loadError}</p>
        </div>
      )}

      <div className="px-4 py-5 space-y-5">
        {/* Basics */}
        <Field icon={Building2} label="Restaurant name">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Your restaurant name"
            className="w-full bg-white border border-ink-6 rounded-xl px-3.5 py-3 text-[15px] focus:outline-none focus:border-brand touch-input"
          />
        </Field>

        <Field icon={Phone} label="Phone">
          <input
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="(206) 555-0123"
            className="w-full bg-white border border-ink-6 rounded-xl px-3.5 py-3 text-[15px] focus:outline-none focus:border-brand touch-input"
          />
        </Field>

        <Field icon={Globe} label="Website">
          <input
            type="url"
            value={website}
            onChange={e => setWebsite(e.target.value)}
            placeholder="https://yourrestaurant.com"
            className="w-full bg-white border border-ink-6 rounded-xl px-3.5 py-3 text-[15px] focus:outline-none focus:border-brand touch-input"
          />
        </Field>

        <Field icon={FileText} label="Description">
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={4}
            placeholder="Tell customers what makes your place special..."
            className="w-full bg-white border border-ink-6 rounded-xl px-3.5 py-3 text-[15px] focus:outline-none focus:border-brand resize-none touch-input"
          />
          <p className="text-[11px] text-ink-4 mt-1">{description.length} characters</p>
        </Field>

        {/* Hours */}
        <div>
          <div className="flex items-center gap-2 mb-2.5">
            <Clock className="w-4 h-4 text-ink-3" />
            <span className="text-[13px] font-semibold text-ink">Weekly hours</span>
          </div>
          <div className="bg-white border border-ink-6 rounded-2xl divide-y divide-ink-7 overflow-hidden">
            {DAYS.map(d => {
              const open = dayIsOpen(d.key)
              return (
                <div key={d.key} className="flex items-center gap-2 px-3.5 py-2.5 min-h-[52px]">
                  <span className="w-10 text-[13px] font-semibold text-ink">{d.short}</span>
                  <button
                    onClick={() => toggleDay(d.key)}
                    className={[
                      'relative w-11 h-6 rounded-full transition-colors flex-shrink-0',
                      open ? 'bg-brand' : 'bg-ink-6',
                    ].join(' ')}
                    aria-pressed={open}
                    aria-label={`${d.label} ${open ? 'open' : 'closed'}`}
                  >
                    <span className={[
                      'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform',
                      open ? 'translate-x-5' : 'translate-x-0',
                    ].join(' ')} />
                  </button>
                  {open ? (
                    <div className="flex items-center gap-1.5 flex-1 justify-end">
                      <input
                        type="time"
                        value={dayOpen(d.key)}
                        onChange={e => setDayTime(d.key, 'open', e.target.value)}
                        className="bg-bg-2 border border-ink-6 rounded-lg px-2 py-1.5 text-[13px] focus:outline-none focus:border-brand"
                      />
                      <span className="text-ink-4 text-[12px]">to</span>
                      <input
                        type="time"
                        value={dayClose(d.key)}
                        onChange={e => setDayTime(d.key, 'close', e.target.value)}
                        className="bg-bg-2 border border-ink-6 rounded-lg px-2 py-1.5 text-[13px] focus:outline-none focus:border-brand"
                      />
                    </div>
                  ) : (
                    <span className="flex-1 text-right text-[13px] text-ink-4">Closed</span>
                  )}
                </div>
              )
            })}
          </div>
          {dayIsOpen('mon') && (
            <button
              onClick={copyMonToWeekdays}
              className="text-[12px] font-semibold text-brand-dark active:text-brand mt-2"
            >
              Copy Monday to all weekdays
            </button>
          )}
        </div>

        {/* Where it syncs */}
        <div className="bg-brand-tint/40 border border-brand/20 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-brand-dark" />
            <p className="text-[12.5px] font-semibold text-ink">When you save, we update:</p>
          </div>
          <ul className="space-y-1.5 text-[12.5px] text-ink-2">
            <li className="flex items-center gap-2"><MapPin className="w-3.5 h-3.5 text-brand-dark" /> Your Apnosh records</li>
            <li className="flex items-center gap-2">
              <Globe className="w-3.5 h-3.5 text-brand-dark" />
              Google Business Profile {gbpConnected ? '' : <span className="text-ink-4">(connect to enable)</span>}
            </li>
            {hasWebsite && (
              <li className="flex items-center gap-2"><Globe className="w-3.5 h-3.5 text-brand-dark" /> Your website</li>
            )}
          </ul>
        </div>

        {result?.error && !result.synced.saved && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
            <p className="text-[12.5px] text-rose-800">{result.error}</p>
          </div>
        )}
      </div>

      {/* Sticky save bar */}
      <div className="sticky bottom-0 bg-white border-t border-ink-6 px-4 py-3 safe-bottom">
        <button
          onClick={onSave}
          disabled={saving}
          className="w-full bg-brand text-white rounded-full py-3.5 text-[15px] font-semibold active:bg-brand-dark disabled:opacity-60 inline-flex items-center justify-center gap-2 min-h-[52px]"
        >
          {saving ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Saving & syncing...</>
          ) : (
            <>Save &amp; sync everywhere</>
          )}
        </button>
      </div>
    </div>
  )
}

function Field({ icon: Icon, label, children }: { icon: React.ComponentType<{ className?: string }>; label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-ink-3" />
        <span className="text-[13px] font-semibold text-ink">{label}</span>
      </div>
      {children}
    </div>
  )
}

function SyncRow({ ok, warn, skipped, label, detail }: { ok?: boolean; warn?: boolean; skipped?: boolean; label: string; detail: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      {warn ? (
        <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />
      ) : skipped ? (
        <span className="w-5 h-5 rounded-full bg-ink-7 flex-shrink-0" />
      ) : (
        <CheckCircle2 className={`w-5 h-5 flex-shrink-0 ${ok ? 'text-emerald-600' : 'text-ink-4'}`} />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-semibold text-ink">{label}</p>
        <p className={`text-[12px] ${warn ? 'text-amber-700' : 'text-ink-3'}`}>{detail}</p>
      </div>
    </div>
  )
}
