'use client'

/**
 * BookingsList — the creator's incoming bookings. Held ones need their yes (request mode); confirmed
 * ones are on the calendar. Each carries the level and the restaurant's intake answers, so the
 * creator knows exactly what the shoot is. Accept flips held → confirmed; Reschedule moves it to a
 * new open slot (from their own hours); Cancel releases it. Both sides see the change.
 */

import { useState } from 'react'
import { Check, Loader2, CalendarClock, CalendarCheck } from 'lucide-react'
import { acceptCreatorBooking, cancelCreatorBooking } from '@/lib/marketplace/creator-booking'
import type { IncomingBooking } from '@/lib/marketplace/creator-schedule-types'
import RescheduleSheet from './reschedule-sheet'

function fmtTime(hhmm: string | null): string {
  if (!hhmm) return ''
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm)
  if (!m) return hhmm
  const h = Number(m[1]); const ap = h < 12 ? 'AM' : 'PM'; const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${m[2]} ${ap}`
}
function slotLabel(date: string | null, start: string | null): string {
  if (!date) return 'Time to be set'
  const d = new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
  return start ? `${d} · ${fmtTime(start)}` : d
}

export default function BookingsList({ initialVendor, initialBookings }: {
  initialVendor: { name: string; slug: string } | null
  initialBookings: IncomingBooking[]
}) {
  const [bookings, setBookings] = useState<IncomingBooking[]>(initialBookings)
  const [busy, setBusy] = useState<string | null>(null)
  const [rescheduleId, setRescheduleId] = useState<string | null>(null)

  if (!initialVendor) {
    return (
      <div className="max-w-md mx-auto text-center pt-24 px-6">
        <h1 className="text-lg font-semibold text-neutral-900">You are not set up as a creator yet</h1>
        <p className="text-sm text-neutral-500 mt-2 leading-relaxed">Once Apnosh links your account, bookings from restaurants show up here.</p>
      </div>
    )
  }

  const held = bookings.filter((b) => b.status === 'held')
  const confirmed = bookings.filter((b) => b.status === 'confirmed')

  async function accept(id: string) {
    setBusy(id)
    const res = await acceptCreatorBooking(id)
    setBusy(null)
    if (res.ok) setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, status: 'confirmed' } : b)))
  }
  async function cancel(id: string) {
    setBusy(id)
    const res = await cancelCreatorBooking(id)
    setBusy(null)
    if (res.ok) setBookings((prev) => prev.filter((b) => b.id !== id))
  }

  return (
    <div className="max-w-2xl mx-auto px-5 py-8">
      <h1 className="text-xl font-bold text-neutral-900">Your bookings</h1>
      <p className="text-sm text-neutral-500 mt-1 mb-6">Requests to accept, and the shoots already on your calendar.</p>

      {bookings.length === 0 && (
        <div className="border border-dashed border-neutral-200 rounded-2xl p-8 text-center text-sm text-neutral-500">
          No bookings yet. Set your hours and publish a package so restaurants can book you.
        </div>
      )}

      {held.length > 0 && (
        <section className="mb-7">
          <div className="flex items-center gap-2 mb-3">
            <CalendarClock className="w-4 h-4 text-amber-600" />
            <h2 className="text-sm font-bold text-neutral-900">Needs your yes</h2>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-600 bg-amber-50 rounded-full px-2 py-0.5">{held.length}</span>
          </div>
          <div className="space-y-3">
            {held.map((b) => (
              <BookingCard key={b.id} b={b} accent="amber"
                busy={busy === b.id}
                onAccept={() => accept(b.id)} onReschedule={() => setRescheduleId(b.id)} onCancel={() => cancel(b.id)} />
            ))}
          </div>
        </section>
      )}

      {confirmed.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <CalendarCheck className="w-4 h-4 text-emerald-600" />
            <h2 className="text-sm font-bold text-neutral-900">On your calendar</h2>
          </div>
          <div className="space-y-3">
            {confirmed.map((b) => (
              <BookingCard key={b.id} b={b} accent="emerald"
                busy={busy === b.id}
                onReschedule={() => setRescheduleId(b.id)} onCancel={() => cancel(b.id)} />
            ))}
          </div>
        </section>
      )}

      {rescheduleId && (
        <RescheduleSheet
          vendorSlug={initialVendor.slug} bookingId={rescheduleId}
          onClose={() => setRescheduleId(null)}
          onRescheduled={(r) => {
            setBookings((prev) => prev.map((b) => (b.id === rescheduleId ? { ...b, status: 'confirmed', date: r.date, start: r.start } : b)))
            setRescheduleId(null)
          }}
        />
      )}
    </div>
  )
}

function BookingCard({ b, accent, busy, onAccept, onReschedule, onCancel }: {
  b: IncomingBooking; accent: 'amber' | 'emerald'; busy: boolean
  onAccept?: () => void; onReschedule: () => void; onCancel: () => void
}) {
  const intakeEntries = Object.values(b.intake).filter(Boolean)
  return (
    <div className={`rounded-2xl border p-4 ${accent === 'amber' ? 'border-amber-200 bg-amber-50/40' : 'border-neutral-200'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-neutral-900">{b.listingTitle}{b.tierName ? <span className="text-neutral-400 font-normal"> · {b.tierName}</span> : null}</div>
          <div className="text-sm text-neutral-700 mt-0.5 font-medium">{slotLabel(b.date, b.start)}</div>
        </div>
        {accent === 'emerald' && <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 bg-emerald-50 rounded-full px-2.5 py-1 flex-shrink-0">Confirmed</span>}
      </div>
      {intakeEntries.length > 0 && (
        <ul className="mt-3 pt-3 border-t border-neutral-100 space-y-1">
          {intakeEntries.map((v, i) => (
            <li key={i} className="text-xs text-neutral-600 flex gap-2"><span className="text-neutral-300">•</span> {v}</li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex items-center gap-2">
        {onAccept && (
          <button onClick={onAccept} disabled={busy}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Accept
          </button>
        )}
        <button onClick={onReschedule} disabled={busy} className="px-3.5 py-2 rounded-xl border border-neutral-200 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50">Reschedule</button>
        <button onClick={onCancel} disabled={busy} className="px-3.5 py-2 rounded-xl text-sm font-medium text-neutral-400 hover:text-red-600">Cancel</button>
      </div>
    </div>
  )
}
