'use client'
/**
 * BookingCard — the shoot booking on the campaign detail (Checkout Gates, Phase 3). Renders the real
 * state honestly:
 *   confirmed        → "Shoot day · <date>, confirmed at checkout" (+ Reschedule while >3 business days out)
 *   needs_reschedule → "Pick a new shoot day" with a live slot picker (the team moved/cancelled it)
 *   requested        → "Your team will reach out to schedule" (request-mode; no date is ever invented)
 * The picker draws from the SAME /api/gates/availability the checkout used, so a client can only pick a
 * slot that actually exists; inside the 3-business-day window the move routes to staff (honest note).
 */
import { useState } from 'react'
import { CalendarDays, Loader2 } from 'lucide-react'
import { C, SHADOW_CARD } from '@/components/campaigns/ui'

export interface CampaignBooking {
  id: string
  status: 'requested' | 'held' | 'confirmed' | 'needs_reschedule'
  date: string | null
  start: string | null
  end: string | null
  timezone: string | null
  label: string | null
  canSelfReschedule: boolean
}

interface Slot { date: string; start: string; end: string; timezone: string; remaining: number }

const fmtDay = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
const fmtTime = (hhmm: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm); if (!m) return hhmm
  const h = Number(m[1]); const ap = h < 12 ? 'AM' : 'PM'; const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${m[2]} ${ap}`
}

export default function BookingCard({ clientId, booking, onReload }: {
  clientId: string
  booking: CampaignBooking
  onReload: () => void | Promise<void>
}) {
  const [picking, setPicking] = useState(false)
  const [slots, setSlots] = useState<Slot[] | null>(null)
  const [tz, setTz] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ text: string; kind: 'info' | 'err' } | null>(null)

  const openPicker = async () => {
    setPicking(true); setMsg(null); setLoading(true)
    try {
      const res = await fetch('/api/gates/availability?gateKind=shoot')
      const j = await res.json().catch(() => ({}))
      setSlots(Array.isArray(j.slots) ? j.slots : [])
      setTz(j.timezone ?? null)
    } catch { setSlots([]) } finally { setLoading(false) }
  }

  const pick = async (s: Slot) => {
    setBusy(`${s.date}T${s.start}`); setMsg(null)
    try {
      const res = await fetch('/api/gates/reschedule', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, bookingId: booking.id, date: s.date, start: s.start }),
      })
      const j = await res.json().catch(() => ({}))
      if (j.ok) { setPicking(false); await onReload(); return }
      if (j.needsStaff) { setMsg({ text: j.message || 'Your team will handle this change.', kind: 'info' }); setPicking(false); return }
      setMsg({ text: j.error || 'Could not reschedule. Try another time.', kind: 'err' })
      if (j.code === 'slot_taken') await openPicker()
    } catch {
      setMsg({ text: 'Could not reschedule. Try again.', kind: 'err' })
    } finally { setBusy(null) }
  }

  const needsReschedule = booking.status === 'needs_reschedule'
  const requested = booking.status === 'requested'
  const border = needsReschedule ? '#e0a13a' : C.line

  const byDay = new Map<string, Slot[]>()
  for (const s of slots ?? []) { const a = byDay.get(s.date) ?? []; a.push(s); byDay.set(s.date, a) }

  return (
    <div style={{ background: '#fff', border: `1px solid ${border}`, borderRadius: 14, padding: '12px 14px', boxShadow: SHADOW_CARD }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <CalendarDays size={17} color={needsReschedule ? '#b9760f' : C.greenDk} />
        <div style={{ flex: 1, minWidth: 0 }}>
          {booking.status === 'confirmed' && (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>Shoot day · {booking.label}</div>
              <div style={{ fontSize: 11.5, color: C.mute }}>Confirmed at checkout. Your team comes then.</div>
            </>
          )}
          {needsReschedule && (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#8a5a08' }}>Pick a new shoot day</div>
              <div style={{ fontSize: 11.5, color: C.mute }}>Your team needs to move the shoot. Choose a time that works.</div>
            </>
          )}
          {requested && (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>Shoot to be scheduled</div>
              <div style={{ fontSize: 11.5, color: C.mute }}>Your team will reach out to set a date. Nothing to do yet.</div>
            </>
          )}
        </div>
        {/* Confirmed + still self-reschedulable, or needs_reschedule → offer the picker. */}
        {!picking && !requested && (booking.canSelfReschedule || needsReschedule) && (
          <button onClick={openPicker} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: C.greenDk, padding: 0 }}>
            {needsReschedule ? 'Choose' : 'Reschedule'}
          </button>
        )}
      </div>

      {msg && <div style={{ marginTop: 8, fontSize: 12, color: msg.kind === 'err' ? C.red : C.greenDk }}>{msg.text}</div>}

      {picking && (
        <div style={{ marginTop: 10, borderTop: `1px solid ${C.line}`, paddingTop: 10 }}>
          {loading && <div style={{ fontSize: 12.5, color: C.mute, display: 'flex', alignItems: 'center', gap: 6 }}><Loader2 size={13} className="animate-spin" /> Loading open times…</div>}
          {!loading && (slots?.length ?? 0) === 0 && <div style={{ fontSize: 12.5, color: C.mute }}>No open times posted right now. Your team will reach out to set a date.</div>}
          {!loading && (slots?.length ?? 0) > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 240, overflowY: 'auto' }}>
              {[...byDay.entries()].map(([day, daySlots]) => (
                <div key={day}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.ink, marginBottom: 6 }}>{fmtDay(day)}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                    {daySlots.map((s) => {
                      const key = `${s.date}T${s.start}`
                      return (
                        <button key={key} onClick={() => pick(s)} disabled={!!busy} style={{ fontSize: 12.5, fontWeight: 600, color: C.ink, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 10, padding: '7px 11px', cursor: busy ? 'default' : 'pointer', opacity: busy && busy !== key ? 0.5 : 1 }}>
                          {busy === key ? 'Booking…' : fmtTime(s.start)}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            {tz ? <span style={{ fontSize: 11, color: C.faint }}>Times in {tz}.</span> : <span />}
            <button onClick={() => { setPicking(false); setMsg(null) }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: C.mute, padding: 0 }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
