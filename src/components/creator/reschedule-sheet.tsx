'use client'

/**
 * RescheduleSheet — a compact "pick a new time" modal, shared by the creator's bookings page and the
 * restaurant's. It reads the creator's live open slots and moves the booking to the chosen one. Both
 * sides pull from the same availability, so a reschedule is a tap, never a thread.
 */

import { useEffect, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { fetchCreatorSlots, rescheduleCreatorBooking } from '@/lib/marketplace/creator-booking'

interface Slot { date: string; start: string; end: string }

function fmtT(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm); if (!m) return hhmm
  const h = Number(m[1]); const ap = h < 12 ? 'AM' : 'PM'; const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${m[2]} ${ap}`
}
const dow = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })
const fmtDay = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })

export default function RescheduleSheet({ vendorSlug, bookingId, onRescheduled, onClose }: {
  vendorSlug: string; bookingId: string; onRescheduled: (r: { label: string; date: string; start: string }) => void; onClose: () => void
}) {
  const [state, setState] = useState<{ loading: boolean; slots: Slot[]; timezone: string | null; available: boolean }>({ loading: true, slots: [], timezone: null, available: false })
  const [selDate, setSelDate] = useState<string | null>(null)
  const [selSlot, setSelSlot] = useState<Slot | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetchCreatorSlots(vendorSlug).then((d) => {
      if (!alive) return
      const slots = (d?.slots ?? []) as Slot[]
      setState({ loading: false, slots, timezone: d?.timezone ?? null, available: !!d?.available })
      const dates = [...new Set(slots.map((s) => s.date))].sort()
      if (dates.length) setSelDate(dates[0])
    }).catch(() => { if (alive) setState({ loading: false, slots: [], timezone: null, available: false }) })
    return () => { alive = false }
  }, [vendorSlug])

  const byDate: Record<string, Slot[]> = {}
  for (const s of state.slots) (byDate[s.date] = byDate[s.date] || []).push(s)
  const dates = Object.keys(byDate).sort()

  async function confirm() {
    if (!selSlot) return
    setBusy(true); setErr(null)
    const r = await rescheduleCreatorBooking({ bookingId, date: selSlot.date, start: selSlot.start })
    setBusy(false)
    if (r.ok && selSlot) onRescheduled({ label: r.label ?? '', date: selSlot.date, start: selSlot.start })
    else setErr(r.error ?? 'Could not reschedule.')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onClose}>
      <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-neutral-100 px-5 py-3 flex items-center justify-between">
          <div className="text-sm font-bold text-neutral-900">Pick a new time</div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-neutral-100"><X className="w-4 h-4 text-neutral-500" /></button>
        </div>
        <div className="px-5 py-4">
          {state.loading ? (
            <div className="flex items-center gap-2 text-sm text-neutral-500 py-6 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Loading open times…</div>
          ) : !state.available || dates.length === 0 ? (
            <div className="text-sm text-neutral-500 py-4">No open times right now. Try again later, or reach out.</div>
          ) : (
            <>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400 mb-2">Day</div>
              <div className="flex gap-2 overflow-x-auto pb-1 mb-3">
                {dates.map((d) => {
                  const on = d === selDate
                  return (
                    <button key={d} onClick={() => { setSelDate(d); setSelSlot(null) }}
                      className={`flex-none w-14 rounded-xl py-2 text-center border ${on ? 'border-emerald-500 bg-emerald-50' : 'border-neutral-200'}`}>
                      <div className={`text-[10px] font-semibold uppercase ${on ? 'text-emerald-700' : 'text-neutral-400'}`}>{dow(d)}</div>
                      <div className="text-[15px] font-bold text-neutral-900 tabular-nums">{d.slice(8, 10)}</div>
                    </button>
                  )
                })}
              </div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400 mb-2">{selDate ? `Open times · ${fmtDay(selDate)}` : 'Open times'}</div>
              <div className="grid grid-cols-3 gap-2">
                {(selDate ? byDate[selDate] : []).map((s, i) => {
                  const on = !!selSlot && selSlot.date === s.date && selSlot.start === s.start
                  return (
                    <button key={i} onClick={() => setSelSlot(s)}
                      className={`rounded-lg py-2.5 text-[13px] font-semibold border ${on ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-neutral-200 text-neutral-900'}`}>{fmtT(s.start)}</button>
                  )
                })}
              </div>
              {state.timezone && <div className="text-[11px] text-neutral-400 mt-2">Times in {state.timezone.split('/').pop()?.replace('_', ' ')}</div>}
              {err && <div className="text-[12px] text-red-600 mt-3">{err}</div>}
              <button onClick={confirm} disabled={!selSlot || busy}
                className="w-full mt-4 h-11 rounded-xl bg-emerald-600 text-white text-sm font-semibold disabled:opacity-40 inline-flex items-center justify-center gap-2">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Confirm new time
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
