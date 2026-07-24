'use client'

/**
 * AvailabilityEditor — "When you shoot". A creator sets the hours a restaurant can book, once, and
 * the shared slot engine does the rest (offers only real openings, hides a slot the moment it is
 * taken). Confirm mode is the creator's call: accept each request, or let them book instantly.
 *
 * Writes a vendor-scoped availability rule through saveMyAvailability. No money moves here; this
 * only decides which times show up on the creator's product pages.
 */

import { useState } from 'react'
import { Check, Loader2, Clock, CalendarCheck } from 'lucide-react'
import { saveMyAvailability } from '@/lib/marketplace/creator-availability'
import type { CreatorAvailabilityForm, ConfirmMode } from '@/lib/marketplace/creator-schedule-types'

const DAYS: { k: string; label: string }[] = [
  { k: '1', label: 'Mon' }, { k: '2', label: 'Tue' }, { k: '3', label: 'Wed' },
  { k: '4', label: 'Thu' }, { k: '5', label: 'Fri' }, { k: '6', label: 'Sat' }, { k: '0', label: 'Sun' },
]
const SLOT_OPTIONS: { v: number; label: string }[] = [
  { v: 60, label: '1 hour' }, { v: 90, label: '1.5 hours' }, { v: 120, label: '2 hours' },
  { v: 180, label: '3 hours' }, { v: 240, label: 'Half day' },
]

type DayState = { on: boolean; start: string; end: string }

function daysFromForm(form: CreatorAvailabilityForm): Record<string, DayState> {
  const out: Record<string, DayState> = {}
  for (const d of DAYS) {
    const wins = form.weekly[d.k]
    out[d.k] = wins && wins.length ? { on: true, start: wins[0].start, end: wins[0].end } : { on: false, start: '09:00', end: '17:00' }
  }
  return out
}

export default function AvailabilityEditor({ initialVendor, initialForm }: {
  initialVendor: { id: string; name: string; slug: string } | null
  initialForm: CreatorAvailabilityForm
}) {
  const [days, setDays] = useState<Record<string, DayState>>(() => daysFromForm(initialForm))
  const [slotMinutes, setSlotMinutes] = useState(initialForm.slotMinutes)
  const [leadTimeDays, setLeadTimeDays] = useState(initialForm.leadTimeDays)
  const [horizonDays, setHorizonDays] = useState(initialForm.horizonDays)
  const [capacity, setCapacity] = useState(initialForm.capacity)
  const [confirmMode, setConfirmMode] = useState<ConfirmMode>(initialForm.confirmMode)
  const [active, setActive] = useState(initialForm.active)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  if (!initialVendor) {
    return (
      <div className="max-w-md mx-auto text-center pt-24 px-6">
        <h1 className="text-lg font-semibold text-neutral-900">You are not set up as a creator yet</h1>
        <p className="text-sm text-neutral-500 mt-2 leading-relaxed">Once Apnosh links your account, this is where you set the hours restaurants can book you.</p>
      </div>
    )
  }

  const setDay = (k: string, patch: Partial<DayState>) => setDays((cur) => ({ ...cur, [k]: { ...cur[k], ...patch } }))
  const anyOn = DAYS.some((d) => days[d.k].on)

  async function save() {
    const weekly: Record<string, { start: string; end: string }[]> = {}
    for (const d of DAYS) {
      const s = days[d.k]
      if (s.on && s.start < s.end) weekly[d.k] = [{ start: s.start, end: s.end }]
    }
    setSaving(true); setMsg(null)
    const res = await saveMyAvailability({ weekly, slotMinutes, capacity, leadTimeDays, horizonDays, timezone: initialForm.timezone, confirmMode, active })
    setSaving(false)
    setMsg(res.ok ? { ok: true, text: active ? 'Saved. Your calendar is on.' : 'Saved as a draft. Turn it on when you are ready.' } : { ok: false, text: res.error || 'That did not save.' })
  }

  return (
    <div className="max-w-2xl mx-auto px-5 py-8">
      <h1 className="text-xl font-bold text-neutral-900">When you shoot</h1>
      <p className="text-sm text-neutral-500 mt-1 mb-4">Set your hours once. Restaurants only ever see times you are actually free, and a booked slot disappears on its own.</p>

      {/* Hours govern ON-SITE shoots only. Remote work (editing, design, web, writing) is booked by
          turnaround, not a time slot, so a multi-skill creator is never on set intervals for it. */}
      <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 px-4 py-3 mb-6 text-[13px] leading-relaxed text-emerald-900">
        These hours are just for <span className="font-semibold">on-site shoots</span>. Editing, design, and other remote work is booked by how fast you deliver, not a time slot, so it never uses these hours.
      </div>

      {/* Weekly hours */}
      <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-2">Weekly hours</div>
      <div className="border border-neutral-200 rounded-2xl divide-y divide-neutral-100">
        {DAYS.map((d) => {
          const s = days[d.k]
          return (
            <div key={d.k} className="flex items-center gap-3 px-4 py-2.5">
              <button
                onClick={() => setDay(d.k, { on: !s.on })}
                className={`relative w-9 h-5 rounded-full flex-shrink-0 transition ${s.on ? 'bg-emerald-500' : 'bg-neutral-200'}`}
                aria-label={`${d.label} ${s.on ? 'on' : 'off'}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${s.on ? 'right-0.5' : 'left-0.5'}`} />
              </button>
              <span className="w-10 text-sm font-semibold text-neutral-700">{d.label}</span>
              {s.on ? (
                <div className="flex items-center gap-2 text-sm">
                  <input type="time" value={s.start} onChange={(e) => setDay(d.k, { start: e.target.value })} className="rounded-lg border border-neutral-200 px-2 py-1 text-neutral-900" />
                  <span className="text-neutral-400">to</span>
                  <input type="time" value={s.end} onChange={(e) => setDay(d.k, { end: e.target.value })} className="rounded-lg border border-neutral-200 px-2 py-1 text-neutral-900" />
                </div>
              ) : (
                <span className="text-sm text-neutral-400">Closed</span>
              )}
            </div>
          )
        })}
      </div>

      {/* Dials */}
      <div className="grid grid-cols-2 gap-3 mt-5">
        <Field label="Each visit takes">
          <select value={slotMinutes} onChange={(e) => setSlotMinutes(Number(e.target.value))} className={inputCls}>
            {SLOT_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
          </select>
        </Field>
        <Field label="Book me by (days ahead)">
          <input type="number" min={0} max={30} value={leadTimeDays} onChange={(e) => setLeadTimeDays(Number(e.target.value))} className={inputCls} />
        </Field>
        <Field label="Booked out to (days)">
          <input type="number" min={7} max={120} value={horizonDays} onChange={(e) => setHorizonDays(Number(e.target.value))} className={inputCls} />
        </Field>
        <Field label="Visits per day">
          <input type="number" min={1} max={10} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} className={inputCls} />
        </Field>
      </div>

      {/* Confirm mode */}
      <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mt-6 mb-2">When someone books you</div>
      <div className="grid grid-cols-1 gap-2.5">
        <ModeCard
          on={confirmMode === 'request'} onClick={() => setConfirmMode('request')}
          icon={<CalendarCheck className="w-4 h-4" />} title="I accept each request"
          desc="The time holds for a day while you say yes. Best while you are getting started."
        />
        <ModeCard
          on={confirmMode === 'instant'} onClick={() => setConfirmMode('instant')}
          icon={<Clock className="w-4 h-4" />} title="Book me instantly"
          desc="A restaurant picks a time and it is confirmed on the spot. Best feel, keep your hours honest."
        />
      </div>

      {/* On/off */}
      <div className="mt-6 flex items-center gap-3 rounded-2xl border border-neutral-200 p-4">
        <button
          onClick={() => setActive((a) => !a)}
          className={`relative w-11 h-6 rounded-full flex-shrink-0 transition ${active ? 'bg-emerald-500' : 'bg-neutral-200'}`}
          aria-label="Calendar on"
        >
          <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${active ? 'right-0.5' : 'left-0.5'}`} />
        </button>
        <div>
          <div className="text-sm font-semibold text-neutral-900">{active ? 'Your calendar is on' : 'Your calendar is off'}</div>
          <div className="text-xs text-neutral-500">{active ? 'Restaurants can pick from your open times.' : 'Turn it on to let restaurants book. Until then they can only request.'}</div>
        </div>
      </div>
      {active && !anyOn && <p className="text-xs text-amber-600 mt-2">Add at least one day before turning your calendar on.</p>}

      {msg && (
        <div className={`mt-5 rounded-xl p-3 text-sm ${msg.ok ? 'bg-emerald-50 border border-emerald-100 text-emerald-800' : 'bg-red-50 border border-red-100 text-red-700'}`}>{msg.text}</div>
      )}

      <div className="mt-6">
        <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Save hours
        </button>
      </div>
    </div>
  )
}

function ModeCard({ on, onClick, icon, title, desc }: { on: boolean; onClick: () => void; icon: React.ReactNode; title: string; desc: string }) {
  return (
    <button onClick={onClick} className={`text-left rounded-2xl border p-4 transition ${on ? 'border-emerald-500 bg-emerald-50/60' : 'border-neutral-200 hover:border-neutral-300'}`}>
      <div className="flex items-center gap-2">
        <span className={on ? 'text-emerald-700' : 'text-neutral-400'}>{icon}</span>
        <span className="text-sm font-semibold text-neutral-900">{title}</span>
        {on && <Check className="w-4 h-4 text-emerald-600 ml-auto" />}
      </div>
      <div className="text-xs text-neutral-500 mt-1.5 leading-relaxed">{desc}</div>
    </button>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-1.5">{label}</span>
      {children}
    </label>
  )
}

const inputCls = 'w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:border-neutral-400'
