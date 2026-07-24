'use client'

/**
 * BookingsList — the creator's incoming bookings, in the mvp app look (matches the owner app's
 * card kit). Held ones need their yes (request mode); confirmed ones are on the calendar. Each
 * carries the level and the restaurant's intake answers, so the creator knows exactly what the
 * shoot is. Accept flips held → confirmed; Reschedule moves it to a new open slot; Cancel releases
 * it. Confirmed shoots deliver from the Work tab. Renders inside the creator shell (bottom nav).
 */

import { useState } from 'react'
import Link from 'next/link'
import { Check, Loader2, CalendarClock, CalendarCheck, Camera } from 'lucide-react'
import { acceptCreatorBooking, cancelCreatorBooking, setBookingQuote } from '@/lib/marketplace/creator-booking'
import type { IncomingBooking, QuoteRequest } from '@/lib/marketplace/creator-schedule-types'
import RescheduleSheet from './reschedule-sheet'

const C = {
  green: '#4abd98', greenDk: '#2e9a78', greenSoft: '#eaf7f3',
  ink: '#1d1d1f', mute: '#6e6e73', faint: '#aeaeb2', line: '#e6e6ea',
  coral: '#c0564f', coralSoft: '#fdeeee', coralLine: 'rgba(192,86,79,0.28)',
  bg: '#f5f5f7', amber: '#8a5a0c', amberBg: '#fbf3e4',
  violet: '#6d4bb3', violetBg: '#f1ecfb', chip: '#eef0ef',
}
const DISPLAY = "'Cal Sans','Inter',sans-serif"

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

const BTN_PRIMARY: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 15px', borderRadius: 12, border: 'none', background: C.green, color: '#fff', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }
const BTN_GHOST: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 15px', borderRadius: 12, border: `0.5px solid ${C.line}`, background: '#fff', color: C.ink, fontSize: 14, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }
const BTN_TEXT: React.CSSProperties = { padding: '9px 12px', borderRadius: 12, border: 'none', background: 'none', color: C.faint, fontSize: 14, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }

export default function BookingsList({ initialVendor, initialBookings, initialQuotes = [] }: {
  initialVendor: { name: string; slug: string } | null
  initialBookings: IncomingBooking[]
  initialQuotes?: QuoteRequest[]
}) {
  const [bookings, setBookings] = useState<IncomingBooking[]>(initialBookings)
  const [quotes, setQuotes] = useState<QuoteRequest[]>(initialQuotes)
  const [busy, setBusy] = useState<string | null>(null)
  const [rescheduleId, setRescheduleId] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function sendQuote(id: string, priceStr: string) {
    const dollars = parseFloat(priceStr)
    if (!(dollars > 0)) return
    setBusy(id); setErr(null)
    const res = await setBookingQuote({ bookingId: id, priceCents: Math.round(dollars * 100) })
    setBusy(null)
    if (res.ok) setQuotes((prev) => prev.filter((q) => q.id !== id))
    else setErr(res.error ?? 'Could not send the price. Try again.')
  }

  if (!initialVendor) {
    return (
      <div style={{ background: C.bg, minHeight: '100%', padding: '48px 22px', boxSizing: 'border-box' }}>
        <div style={{ maxWidth: 320, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontFamily: DISPLAY, fontSize: 18, fontWeight: 600, color: C.ink }}>You are not set up as a creator yet</div>
          <div style={{ fontSize: 13.5, color: C.mute, marginTop: 8, lineHeight: 1.5 }}>Once Apnosh links your account, bookings from restaurants show up here.</div>
        </div>
      </div>
    )
  }

  const held = bookings.filter((b) => b.status === 'held')
  const confirmed = bookings.filter((b) => b.status === 'confirmed')

  async function accept(id: string) {
    setBusy(id); setErr(null)
    const res = await acceptCreatorBooking(id)
    setBusy(null)
    if (res.ok) setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, status: 'confirmed' } : b)))
    else setErr(res.error ?? 'Could not accept that booking. Try again.')
  }
  async function cancel(id: string) {
    setBusy(id); setErr(null)
    const res = await cancelCreatorBooking(id)
    setBusy(null)
    if (res.ok) setBookings((prev) => prev.filter((b) => b.id !== id))
    else setErr(res.error ?? 'Could not cancel that booking. Try again.')
  }

  return (
    <div style={{ background: C.bg, minHeight: '100%', padding: '14px 14px 32px', boxSizing: 'border-box' }}>
      <h1 style={{ fontFamily: DISPLAY, fontSize: 23, fontWeight: 600, color: C.ink, lineHeight: 1.1, padding: '2px 2px 2px' }}>Your bookings</h1>
      <p style={{ fontSize: 13, color: C.mute, margin: '3px 2px 16px' }}>Requests to accept, and the shoots already on your calendar.</p>

      {err && (
        <div style={{ background: C.coralSoft, border: `0.5px solid ${C.coralLine}`, borderRadius: 14, padding: '12px 14px', fontSize: 13.5, color: C.coral, marginBottom: 12 }}>{err}</div>
      )}

      {bookings.length === 0 && quotes.length === 0 && (
        <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 18, padding: '32px 22px', textAlign: 'center' }}>
          <div style={{ width: 54, height: 54, borderRadius: 16, background: C.greenSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
            <Camera size={24} color={C.greenDk} />
          </div>
          <div style={{ fontFamily: DISPLAY, fontSize: 17, fontWeight: 600, color: C.ink }}>No shoots booked yet</div>
          <div style={{ fontSize: 13, color: C.mute, marginTop: 6, lineHeight: 1.5 }}>Set your hours and publish a package so restaurants can book you.</div>
          <div style={{ fontSize: 12.5, color: C.faint, marginTop: 10 }}>Design jobs, monthly plans, and custom quotes show up in <Link href="/creator/work" style={{ color: C.greenDk, fontWeight: 600, textDecoration: 'none' }}>your work</Link>.</div>
        </div>
      )}

      {quotes.length > 0 && (
        <section style={{ marginBottom: 22 }}>
          <SectionHead icon={<CalendarClock size={14} color={C.violet} />} label="Quote requests" count={quotes.length} tone={C.violet} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            {quotes.map((q) => <QuoteCard key={q.id} q={q} busy={busy === q.id} onSend={(price) => sendQuote(q.id, price)} />)}
          </div>
        </section>
      )}

      {held.length > 0 && (
        <section style={{ marginBottom: 22 }}>
          <SectionHead icon={<CalendarClock size={14} color={C.amber} />} label="Needs your yes" count={held.length} tone={C.amber} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            {held.map((b) => (
              <BookingCard key={b.id} b={b} accent="held" busy={busy === b.id}
                onAccept={() => accept(b.id)} onReschedule={() => setRescheduleId(b.id)} onCancel={() => cancel(b.id)} />
            ))}
          </div>
        </section>
      )}

      {confirmed.length > 0 && (
        <section>
          <SectionHead icon={<CalendarCheck size={14} color={C.greenDk} />} label="On your calendar" count={confirmed.length} tone={C.greenDk} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            {confirmed.map((b) => (
              <BookingCard key={b.id} b={b} accent="confirmed" busy={busy === b.id}
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

function SectionHead({ icon, label, count, tone }: { icon: React.ReactNode; label: string; count: number; tone: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 4px 9px' }}>
      {icon}
      <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{label}</span>
      <span style={{ minWidth: 18, height: 18, padding: '0 5px', borderRadius: 99, background: tone, color: '#fff', fontSize: 10.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{count}</span>
    </div>
  )
}

function BookingCard({ b, accent, busy, onAccept, onReschedule, onCancel }: {
  b: IncomingBooking; accent: 'held' | 'confirmed'; busy: boolean
  onAccept?: () => void; onReschedule: () => void; onCancel: () => void
}) {
  const intakeEntries = Object.entries(b.intake).filter(([, v]) => v)
  const stripe = accent === 'held' ? C.amber : C.green
  return (
    <div style={{ position: 'relative', background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,.04)', overflow: 'hidden' }}>
      <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: stripe }} />
      <div style={{ padding: '13px 15px 14px 17px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <span style={{ width: 42, height: 42, borderRadius: 12, background: C.greenSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Camera size={19} color={C.greenDk} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: DISPLAY, fontSize: 16, fontWeight: 600, color: C.ink, lineHeight: 1.2 }}>{b.listingTitle}{b.tierName ? <span style={{ color: C.faint, fontWeight: 400 }}> · {b.tierName}</span> : null}</div>
            <div style={{ fontSize: 12.5, color: C.ink, fontWeight: 600, marginTop: 4, display: 'flex', alignItems: 'center', gap: 5 }}><CalendarClock size={13} color={C.faint} />{slotLabel(b.date, b.start)}</div>
          </div>
          {accent === 'confirmed' && <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', borderRadius: 99, padding: '3px 9px', fontSize: 10.5, fontWeight: 700, letterSpacing: '.02em', textTransform: 'uppercase', background: C.greenSoft, color: C.greenDk }}>Confirmed</span>}
        </div>

        {intakeEntries.length > 0 && (
          <ul style={{ margin: '11px 0 0', padding: '11px 0 0', borderTop: `0.5px solid ${C.line}`, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 5 }}>
            {intakeEntries.map(([q, v], i) => (
              <li key={i} style={{ fontSize: 12.5, color: C.mute, display: 'flex', gap: 7 }}><span style={{ color: C.faint }}>•</span> <span><span style={{ color: C.ink, fontWeight: 600 }}>{q}</span> {v}</span></li>
            ))}
          </ul>
        )}

        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          {onAccept && (
            <button onClick={onAccept} disabled={busy} style={{ ...BTN_PRIMARY, opacity: busy ? 0.5 : 1 }}>
              {busy ? <Loader2 size={15} className="mvp-spin" /> : <Check size={15} />} Accept
            </button>
          )}
          <button onClick={onReschedule} disabled={busy} style={{ ...BTN_GHOST, opacity: busy ? 0.5 : 1 }}>Reschedule</button>
          <button onClick={onCancel} disabled={busy} style={{ ...BTN_TEXT, opacity: busy ? 0.5 : 1 }}>Cancel</button>
        </div>

        {/* A confirmed shoot delivers like any other job — the finished gallery goes up in the work list. */}
        {accent === 'confirmed' && (
          <Link href="/creator/work" style={{ display: 'inline-block', marginTop: 11, fontSize: 12.5, fontWeight: 600, color: C.greenDk, textDecoration: 'none' }}>Deliver in your work →</Link>
        )}
      </div>
    </div>
  )
}

function QuoteCard({ q, busy, onSend }: { q: QuoteRequest; busy: boolean; onSend: (price: string) => void }) {
  const [price, setPrice] = useState('')
  const intakeEntries = Object.entries(q.intake).filter(([, v]) => v)
  const valid = parseFloat(price) > 0
  return (
    <div style={{ position: 'relative', background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,.04)', overflow: 'hidden' }}>
      <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: C.violet }} />
      <div style={{ padding: '13px 15px 14px 17px' }}>
        <div style={{ fontFamily: DISPLAY, fontSize: 16, fontWeight: 600, color: C.ink, lineHeight: 1.2 }}>{q.listingTitle}{q.tierName ? <span style={{ color: C.faint, fontWeight: 400 }}> · {q.tierName}</span> : null}</div>
        <div style={{ fontSize: 12.5, color: C.mute, marginTop: 2 }}>A restaurant asked for a price.</div>
        {intakeEntries.length > 0 && (
          <ul style={{ margin: '9px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 5 }}>
            {intakeEntries.map(([q, v], i) => (
              <li key={i} style={{ fontSize: 12.5, color: C.mute, display: 'flex', gap: 7 }}><span style={{ color: C.faint }}>•</span> <span><span style={{ color: C.ink, fontWeight: 600 }}>{q}</span> {v}</span></li>
            ))}
          </ul>
        )}
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: C.faint }}>$</span>
            <input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder="Your price" className="mvp-input"
              style={{ width: 130, boxSizing: 'border-box', borderRadius: 12, border: `0.5px solid ${C.line}`, padding: '9px 11px 9px 22px', fontSize: 14, color: C.ink, fontFamily: 'inherit', outline: 'none' }} />
          </div>
          <button onClick={() => onSend(price)} disabled={busy || !valid} style={{ ...BTN_PRIMARY, background: C.ink, opacity: busy || !valid ? 0.4 : 1 }}>
            {busy ? <Loader2 size={15} className="mvp-spin" /> : null} Send price
          </button>
        </div>
      </div>
    </div>
  )
}
