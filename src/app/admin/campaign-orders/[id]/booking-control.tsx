'use client'
/**
 * AdminBookingControl — the operator's control over a campaign's shoot booking (Checkout Gates,
 * Phase 3). Confirmed/held → "Needs reschedule" (blocks the shoot work orders + tells the owner to
 * pick a new day). needs_reschedule/requested → "Assign a slot" (pick a real open time on the owner's
 * behalf; re-seeds + unblocks). Talks to POST /api/admin/bookings/[id]; refreshes on success.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Slot { date: string; start: string; end: string; timezone: string; remaining: number }
const fmtDay = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
const fmtTime = (hhmm: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm); if (!m) return hhmm
  const h = Number(m[1]); const ap = h < 12 ? 'AM' : 'PM'; const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${m[2]} ${ap}`
}

export default function AdminBookingControl({ bookingId, status, label }: { bookingId: string; status: string; label: string | null }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [picking, setPicking] = useState(false)
  const [slots, setSlots] = useState<Slot[] | null>(null)
  const [tz, setTz] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const post = async (body: Record<string, unknown>) => {
    setBusy(true); setErr(null)
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(j.error || 'Action failed'); return false }
      return true
    } catch { setErr('Action failed'); return false } finally { setBusy(false) }
  }

  const needsReschedule = async () => {
    const reason = window.prompt('Why does this shoot need a new date? (the owner sees this)') ?? ''
    if (reason === null) return
    if (await post({ action: 'needs_reschedule', reason })) router.refresh()
  }

  const openPicker = async () => {
    setPicking(true); setErr(null)
    try {
      const res = await fetch('/api/gates/availability?gateKind=shoot')
      const j = await res.json().catch(() => ({}))
      setSlots(Array.isArray(j.slots) ? j.slots : []); setTz(j.timezone ?? null)
    } catch { setSlots([]) }
  }

  const assign = async (s: Slot) => {
    if (await post({ action: 'assign', date: s.date, start: s.start })) { setPicking(false); router.refresh() }
    else await openPicker()
  }

  const canReschedule = status === 'confirmed' || status === 'held'
  const canAssign = status === 'needs_reschedule' || status === 'requested'

  const byDay = new Map<string, Slot[]>()
  for (const s of slots ?? []) { const a = byDay.get(s.date) ?? []; a.push(s); byDay.set(s.date, a) }

  return (
    <div className="rounded-xl border border-ink-6 p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[13px] font-semibold text-ink">Shoot booking</div>
          <div className="text-[12px] text-ink-3 mt-0.5">
            {status === 'confirmed' && `Confirmed · ${label}`}
            {status === 'needs_reschedule' && 'Needs a new date — assign one or wait for the owner to pick.'}
            {status === 'requested' && 'Requested (no availability was published) — reach out, then assign a slot.'}
            {status === 'held' && 'Held (awaiting checkout).'}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canReschedule && <button onClick={needsReschedule} disabled={busy} className="text-[12.5px] font-semibold rounded-lg px-3 py-1.5 border border-amber-500 text-amber-700 bg-white disabled:opacity-50">Needs reschedule</button>}
          {canAssign && !picking && <button onClick={openPicker} disabled={busy} className="text-[12.5px] font-semibold rounded-lg px-3 py-1.5 bg-ink text-white disabled:opacity-50">Assign a slot</button>}
        </div>
      </div>

      {err && <div className="mt-2 text-[12px] text-red-600">{err}</div>}

      {picking && (
        <div className="mt-3 border-t border-ink-6 pt-3">
          {(slots?.length ?? 0) === 0 && <div className="text-[12.5px] text-ink-3">No open times published. Add availability first, or reach out to the owner.</div>}
          {(slots?.length ?? 0) > 0 && (
            <div className="space-y-2.5 max-h-64 overflow-y-auto">
              {[...byDay.entries()].map(([day, ds]) => (
                <div key={day}>
                  <div className="text-[12px] font-semibold text-ink mb-1">{fmtDay(day)}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {ds.map((s) => (
                      <button key={`${s.date}T${s.start}`} onClick={() => assign(s)} disabled={busy} className="text-[12px] rounded-lg border border-ink-6 px-2.5 py-1 text-ink hover:bg-bg-2 disabled:opacity-50">{fmtTime(s.start)}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between mt-2">
            {tz ? <span className="text-[11px] text-ink-4">Times in {tz}.</span> : <span />}
            <button onClick={() => setPicking(false)} className="text-[12px] text-ink-3">Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
