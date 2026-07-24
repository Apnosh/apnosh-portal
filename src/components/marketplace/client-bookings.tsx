'use client'

/**
 * ClientBookings — the restaurant's side of a creator booking, in the mvp app look (MvpShell +
 * the owner card kit). Each booking shows its live phase: waiting on the creator, on the calendar,
 * in progress, ready to review, or approved. Once the creator delivers, the same Approve /
 * Ask-for-changes the campaign world has appears right here — approving fires the owner charge +
 * the creator payout through the shared work-order path. Reschedule and cancel stay available
 * until the work is delivered.
 */

import { useState } from 'react'
import Link from 'next/link'
import { CalendarClock, Check, Loader2, ExternalLink, Camera, Repeat, FileText, Sparkles } from 'lucide-react'
import { cancelCreatorBooking, acceptBookingQuote, updateBookingIntake } from '@/lib/marketplace/creator-booking'
import type { ClientBooking, BookingDeliverable } from '@/lib/marketplace/creator-schedule-types'
import MvpShell from '@/components/mvp/mvp-shell'
import { MvpDetailHeader } from '@/components/mvp/mvp-detail'
import RescheduleSheet from '@/components/creator/reschedule-sheet'

const C = {
  green: '#4abd98', greenDk: '#2e9a78', greenSoft: '#eaf7f3', greenLine: 'rgba(74,189,152,0.32)',
  ink: '#1d1d1f', mute: '#6e6e73', faint: '#aeaeb2', line: '#e6e6ea',
  coral: '#c0564f', coralSoft: '#fdeeee', coralLine: 'rgba(192,86,79,0.28)',
  bg: '#f5f5f7', amber: '#8a5a0c', amberBg: '#fbf3e4',
  violet: '#6d4bb3', violetBg: '#f1ecfb', blue: '#3a6ea5', blueBg: '#eef3fb', chip: '#eef0ef',
}
const DISPLAY = "'Cal Sans','Inter',sans-serif"

function fmtTime(hhmm: string | null): string {
  if (!hhmm) return ''
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm); if (!m) return hhmm
  const h = Number(m[1]); const ap = h < 12 ? 'AM' : 'PM'; const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${m[2]} ${ap}`
}
function slotLabel(date: string | null, start: string | null): string {
  if (!date) return 'Time to be set'
  const d = new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
  return start ? `${d} · ${fmtTime(start)}` : d
}
function money(cents: number | null | undefined): string | null {
  if (cents == null || cents <= 0) return null
  const d = cents / 100
  return d % 1 === 0 ? `$${d.toLocaleString('en-US')}` : `$${d.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
}
/** Only render a delivered link if it is a real http(s) URL. */
function safeLink(url: string | null | undefined): string | null {
  if (!url) return null
  try { const u = new URL(url.trim()); return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null } catch { return null }
}
function shapeIcon(shape: string | null | undefined) {
  if (shape === 'recurring') return Repeat
  if (shape === 'quote') return FileText
  if (shape === 'async') return Sparkles
  return Camera
}

/** The one phase pill each booking shows — delivery state wins over the raw booking status, so the
 *  row always tells the true story (in progress → ready to review → approved). */
function phaseOf(b: ClientBooking): { key: string; label: string } {
  const w = b.workStatus
  if (!w && b.shape === 'quote') {
    if (b.quoteStatus === 'quoted' && b.quotedCents) return { key: 'quote_ready', label: 'Quote ready' }
    return { key: 'quote_req', label: 'Quote requested' }
  }
  if (w === 'delivered') return { key: 'delivered', label: 'Ready to review' }
  if (w === 'approved') return { key: 'approved', label: 'Approved' }
  if (w === 'revision') return { key: 'revision', label: 'Changes sent' }
  if (w === 'accepted' || w === 'in_progress') return { key: 'working', label: 'In progress' }
  if (b.status === 'held') return { key: 'held', label: 'Waiting on the creator' }
  if (b.status === 'needs_reschedule') return { key: 'needs', label: 'Needs a new time' }
  return { key: 'confirmed', label: 'Confirmed' }
}
function toneFor(key: string): { fg: string; bg: string; stripe: string } {
  switch (key) {
    case 'delivered': return { fg: C.violet, bg: C.violetBg, stripe: C.violet }
    case 'quote_ready': return { fg: C.violet, bg: C.violetBg, stripe: C.violet }
    case 'approved': return { fg: C.greenDk, bg: C.greenSoft, stripe: C.green }
    case 'confirmed': return { fg: C.greenDk, bg: C.greenSoft, stripe: C.green }
    case 'working': return { fg: C.blue, bg: C.blueBg, stripe: C.blue }
    case 'revision': return { fg: C.blue, bg: C.blueBg, stripe: C.blue }
    case 'needs': return { fg: C.amber, bg: C.amberBg, stripe: C.amber }
    default: return { fg: C.mute, bg: C.chip, stripe: C.faint } // held, quote_req
  }
}

const BTN_PRIMARY: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 15px', borderRadius: 12, border: 'none', background: C.green, color: '#fff', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }
const BTN_GHOST: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 15px', borderRadius: 12, border: `0.5px solid ${C.line}`, background: '#fff', color: C.ink, fontSize: 14, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }
const BTN_TEXT: React.CSSProperties = { padding: '9px 12px', borderRadius: 12, border: 'none', background: 'none', color: C.faint, fontSize: 14, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }

export default function ClientBookings({ initialBookings }: { initialBookings: ClientBooking[] }) {
  const [bookings, setBookings] = useState<ClientBooking[]>(initialBookings)
  const [busy, setBusy] = useState<string | null>(null)
  const [reschedule, setReschedule] = useState<{ id: string; vendorSlug: string } | null>(null)
  const [changesFor, setChangesFor] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [err, setErr] = useState<string | null>(null)

  async function cancel(id: string) {
    setBusy(id); setErr(null)
    const res = await cancelCreatorBooking(id)
    setBusy(null)
    if (res.ok) setBookings((prev) => prev.filter((b) => b.id !== id))
    else setErr(res.error ?? 'Could not cancel that booking. Try again.')
  }

  // Approve the delivery, or send it back for changes. Both go through the creator-work route, which
  // authorizes the restaurant owner (client access) and, on approve, accrues the charge + payout.
  async function review(b: ClientBooking, decision: 'approved' | 'revision', changeNote?: string) {
    if (!b.orderId) return
    setBusy(b.id); setErr(null)
    try {
      const res = await fetch('/api/creator/work', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: b.orderId, status: decision, ...(changeNote ? { note: changeNote } : {}) }),
      })
      if (res.ok) {
        setBookings((prev) => prev.map((x) => (x.id === b.id ? { ...x, workStatus: decision } : x)))
        setChangesFor(null); setNote('')
      } else {
        const j = await res.json().catch(() => ({}))
        setErr(typeof j.error === 'string' ? j.error : 'That did not go through. Try again.')
      }
    } catch {
      setErr('Something went wrong. Check your connection and try again.')
    } finally {
      setBusy(null)
    }
  }

  // Per-delivery approve / changes for a multi-delivery booking. Same PATCH path as review(), but
  // targets one deliverable's order and updates just that piece in state.
  async function reviewOrder(bookingId: string, orderId: string, decision: 'approved' | 'revision', changeNote?: string) {
    setBusy(orderId); setErr(null)
    try {
      const res = await fetch('/api/creator/work', {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: orderId, status: decision, ...(changeNote ? { note: changeNote } : {}) }),
      })
      if (res.ok) {
        setBookings((prev) => prev.map((x) => (x.id === bookingId ? { ...x, deliverables: x.deliverables.map((d) => (d.orderId === orderId ? { ...d, status: decision } : d)) } : x)))
      } else {
        const j = await res.json().catch(() => ({}))
        setErr(typeof j.error === 'string' ? j.error : 'That did not go through. Try again.')
      }
    } catch {
      setErr('Something went wrong. Check your connection and try again.')
    } finally {
      setBusy(null)
    }
  }

  // Accept a creator's quote → it mints the work order at the quoted price and starts the loop.
  async function acceptQuote(b: ClientBooking) {
    setBusy(b.id); setErr(null)
    try {
      const res = await acceptBookingQuote(b.id)
      if (res.ok) setBookings((prev) => prev.map((x) => (x.id === b.id ? { ...x, workStatus: 'accepted', quoteStatus: null, amountCents: b.quotedCents ?? x.amountCents } : x)))
      else setErr(res.error ?? 'Could not accept the quote. Try again.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <MvpShell active="more" header={<MvpDetailHeader title="Your bookings" subtitle="The creators you booked and their work to approve" backHref="/dashboard/more" backLabel="More" />}>
      <div style={{ background: C.bg, minHeight: '100%', padding: '14px 14px 32px', boxSizing: 'border-box' }}>
        {err && (
          <div style={{ background: C.coralSoft, border: `0.5px solid ${C.coralLine}`, borderRadius: 14, padding: '12px 14px', fontSize: 13.5, color: C.coral, marginBottom: 12 }}>{err}</div>
        )}

        {bookings.length === 0 ? (
          <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 20, padding: '40px 26px 30px', textAlign: 'center', marginTop: 6 }}>
            <div style={{ width: 60, height: 60, borderRadius: 18, background: C.greenSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Camera size={26} color={C.greenDk} />
            </div>
            <div style={{ fontFamily: DISPLAY, fontSize: 19, fontWeight: 600, color: C.ink }}>No bookings yet</div>
            <div style={{ fontSize: 13.5, color: C.mute, marginTop: 7, lineHeight: 1.5, maxWidth: 260, marginInline: 'auto' }}>
              Book a photographer, videographer, or creator to shoot and make content for you.
            </div>
            <Link href="/dashboard/campaigns/new" className="mvp-press" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 20, padding: '12px 22px', borderRadius: 14, background: C.green, color: '#fff', fontSize: 14.5, fontWeight: 600, textDecoration: 'none', boxShadow: '0 6px 16px rgba(74,189,152,0.4)' }}>
              Find a creator
            </Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            {bookings.map((b) => {
              const phase = phaseOf(b)
              const tone = toneFor(phase.key)
              const isBusy = busy === b.id
              const link = safeLink(b.deliveredUrl)
              const editable = phase.key === 'held' || phase.key === 'needs' || phase.key === 'confirmed' || phase.key === 'working'
              const canReschedule = editable && (!b.shape || b.shape === 'scheduled')
              const canCancel = editable || phase.key === 'quote_req'
              const isRecurring = b.shape === 'recurring'
              const Icon = shapeIcon(b.shape)
              return (
                <div key={b.id} className="mvp-press" style={{ position: 'relative', background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,.04)', overflow: 'hidden' }}>
                  <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: tone.stripe }} />
                  <div style={{ padding: '13px 15px 14px 17px' }}>
                    {/* header row: icon + title/vendor + phase pill */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                      <span style={{ width: 42, height: 42, borderRadius: 12, background: C.greenSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon size={19} color={C.greenDk} /></span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: DISPLAY, fontSize: 16, fontWeight: 600, color: C.ink, lineHeight: 1.2 }}>{b.listingTitle}{b.tierName ? <span style={{ color: C.faint, fontWeight: 400 }}> · {b.tierName}</span> : null}</div>
                        <div style={{ fontSize: 12.5, color: C.mute, marginTop: 1 }}>by {b.vendorName}</div>
                        {b.date && <div style={{ fontSize: 12.5, color: C.ink, fontWeight: 600, marginTop: 5, display: 'flex', alignItems: 'center', gap: 5 }}><CalendarClock size={13} color={C.faint} />{slotLabel(b.date, b.start)}</div>}
                      </div>
                      <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', borderRadius: 99, padding: '3px 9px', fontSize: 10.5, fontWeight: 700, letterSpacing: '.02em', textTransform: 'uppercase', background: tone.bg, color: tone.fg }}>{phase.label}</span>
                    </div>

                    {/* Requirements — every offer question, fillable any time (answered or skipped). */}
                    <ClientIntake bookingId={b.id} intake={b.intake} questions={b.questions} />

                    {/* Delivered → the review panel: see the work, approve, or ask for changes. */}
                    {phase.key === 'delivered' && b.deliverables.length <= 1 && (
                      <div style={{ marginTop: 12, borderRadius: 13, border: '0.5px solid rgba(109,75,179,0.22)', background: 'rgba(241,236,251,0.6)', padding: '12px 13px' }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>The finished work is ready.</div>
                        {money(b.amountCents) && <div style={{ fontSize: 12, color: C.mute, marginTop: 1 }}>Approving bills you {money(b.amountCents)}.</div>}
                        <div style={{ marginTop: 11, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                          {link && (
                            <a href={link} target="_blank" rel="noreferrer" style={{ ...BTN_GHOST, textDecoration: 'none' }}>
                              <ExternalLink size={14} /> View work
                            </a>
                          )}
                          <button onClick={() => review(b, 'approved')} disabled={isBusy} style={{ ...BTN_PRIMARY, opacity: isBusy ? 0.5 : 1 }}>
                            {isBusy ? <Loader2 size={15} className="mvp-spin" /> : <Check size={15} />} Approve
                          </button>
                          <button onClick={() => { setChangesFor(changesFor === b.id ? null : b.id); setNote('') }} disabled={isBusy} style={{ ...BTN_GHOST, opacity: isBusy ? 0.5 : 1 }}>
                            Ask for changes
                          </button>
                        </div>
                        {changesFor === b.id && (
                          <div style={{ marginTop: 10 }}>
                            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
                              placeholder="What should the creator change?" className="mvp-input"
                              style={{ width: '100%', boxSizing: 'border-box', borderRadius: 11, border: `0.5px solid ${C.line}`, padding: '9px 11px', fontSize: 13, color: C.ink, fontFamily: 'inherit', outline: 'none', resize: 'vertical' }} />
                            <button onClick={() => review(b, 'revision', note.trim() || undefined)} disabled={isBusy || !note.trim()}
                              style={{ marginTop: 8, padding: '9px 15px', borderRadius: 12, border: 'none', background: C.ink, color: '#fff', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', opacity: isBusy || !note.trim() ? 0.4 : 1 }}>Send changes</button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Approved → done, with a link to the work and what it billed. */}
                    {phase.key === 'approved' && b.deliverables.length <= 1 && (
                      <div style={{ marginTop: 11, display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, color: C.greenDk }}>
                        <span style={{ fontWeight: 600 }}>Approved{money(b.amountCents) ? ` · ${money(b.amountCents)}` : ''}</span>
                        {link && <a href={link} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: C.mute, textDecoration: 'none' }}><ExternalLink size={13} /> View work</a>}
                      </div>
                    )}

                    {/* Changes sent → waiting on the creator to redo it. */}
                    {phase.key === 'revision' && b.deliverables.length <= 1 && (
                      <div style={{ marginTop: 10, fontSize: 12.5, color: C.blue }}>Changes sent. Waiting on the creator to redo it.</div>
                    )}

                    {/* In progress → the creator is on it. */}
                    {phase.key === 'working' && b.deliverables.length <= 1 && (
                      <div style={{ marginTop: 9, fontSize: 12, color: C.mute }}>The creator is working on this.</div>
                    )}

                    {/* MULTIPLE deliveries → each piece, delivered and approved (and billed) on its own. */}
                    {b.deliverables.length > 1 && (
                      <div style={{ marginTop: 4 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: C.faint, marginTop: 8 }}>
                          Deliveries · {b.deliverables.filter((d) => d.status === 'approved').length} of {b.deliverables.length} done
                        </div>
                        {b.deliverables.map((d) => (
                          <DeliverableRow key={d.orderId} d={d} busy={busy === d.orderId}
                            onApprove={() => reviewOrder(b.id, d.orderId, 'approved')}
                            onChanges={(changeNote) => reviewOrder(b.id, d.orderId, 'revision', changeNote || undefined)} />
                        ))}
                      </div>
                    )}

                    {/* Quote ready → their price; accept to start, or decline. */}
                    {phase.key === 'quote_ready' && (
                      <div style={{ marginTop: 12, borderRadius: 13, border: '0.5px solid rgba(109,75,179,0.22)', background: 'rgba(241,236,251,0.6)', padding: '12px 13px' }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>{b.vendorName} quoted {money(b.quotedCents) ?? 'a price'}.</div>
                        <div style={{ fontSize: 12, color: C.mute, marginTop: 1 }}>Accept to start. You&apos;re billed only after you approve the finished work.</div>
                        <div style={{ marginTop: 11, display: 'flex', alignItems: 'center', gap: 8 }}>
                          <button onClick={() => acceptQuote(b)} disabled={isBusy} style={{ ...BTN_PRIMARY, opacity: isBusy ? 0.5 : 1 }}>
                            {isBusy ? <Loader2 size={15} className="mvp-spin" /> : <Check size={15} />} Accept quote
                          </button>
                          <button onClick={() => cancel(b.id)} disabled={isBusy} style={{ ...BTN_TEXT, opacity: isBusy ? 0.5 : 1 }}>Decline</button>
                        </div>
                      </div>
                    )}

                    {/* Quote requested → waiting on the creator's price. */}
                    {phase.key === 'quote_req' && (
                      <div style={{ marginTop: 9, fontSize: 12, color: C.mute }}>Waiting on {b.vendorName} to send a price.</div>
                    )}

                    {isRecurring && (phase.key === 'working' || phase.key === 'confirmed') && (
                      <div style={{ marginTop: 7, fontSize: 11, fontWeight: 500, color: C.faint }}>Monthly plan · billed each month after you approve that month&apos;s work.</div>
                    )}

                    {/* Reschedule (scheduled shoots only) + Cancel — until the work is delivered. */}
                    {(canReschedule || canCancel) && phase.key !== 'quote_ready' && (
                      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                        {canReschedule && (
                          <button onClick={() => setReschedule({ id: b.id, vendorSlug: b.vendorSlug })} disabled={isBusy} style={{ ...BTN_GHOST, opacity: isBusy ? 0.5 : 1 }}>Reschedule</button>
                        )}
                        {canCancel && (
                          <button onClick={() => cancel(b.id)} disabled={isBusy} style={{ ...BTN_TEXT, opacity: isBusy ? 0.5 : 1 }}>Cancel</button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {reschedule && (
        <RescheduleSheet
          vendorSlug={reschedule.vendorSlug} bookingId={reschedule.id}
          onClose={() => setReschedule(null)}
          onRescheduled={(r) => {
            const id = reschedule.id
            setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, status: 'confirmed', date: r.date, start: r.start } : b)))
            setReschedule(null)
          }}
        />
      )}
    </MvpShell>
  )
}

/** The label + tone for one deliverable's work status. */
function workLabel(status: string): { label: string; fg: string; bg: string } {
  switch (status) {
    case 'delivered': return { label: 'Ready to review', fg: C.violet, bg: C.violetBg }
    case 'approved': return { label: 'Approved', fg: C.greenDk, bg: C.greenSoft }
    case 'revision': return { label: 'Changes sent', fg: C.blue, bg: C.blueBg }
    case 'declined': return { label: 'Cancelled', fg: C.mute, bg: C.chip }
    default: return { label: 'In progress', fg: C.blue, bg: C.blueBg } // accepted, in_progress
  }
}

/** One deliverable row in a multi-delivery booking: its title, status, price, and — when it's
 *  delivered — its own Approve / Ask-for-changes (each piece bills only when it is approved). */
function DeliverableRow({ d, busy, onApprove, onChanges }: { d: BookingDeliverable; busy: boolean; onApprove: () => void; onChanges: (note: string) => void }) {
  const [showCh, setShowCh] = useState(false)
  const [note, setNote] = useState('')
  const lab = workLabel(d.status)
  const link = safeLink(d.deliveredUrl)
  const amt = money(d.amountCents)
  return (
    <div style={{ borderTop: `0.5px solid ${C.line}`, marginTop: 10, paddingTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.ink, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title || 'Delivery'}</span>
        <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', borderRadius: 99, padding: '2px 8px', fontSize: 10, fontWeight: 700, letterSpacing: '.02em', textTransform: 'uppercase', background: lab.bg, color: lab.fg }}>{lab.label}</span>
      </div>
      {amt && <div style={{ fontSize: 11.5, color: C.mute, marginTop: 2 }}>{d.status === 'approved' ? `Billed ${amt}` : `Bills ${amt} on approve`}</div>}
      {d.status === 'delivered' && (
        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {link && <a href={link} target="_blank" rel="noreferrer" style={{ ...BTN_GHOST, textDecoration: 'none' }}><ExternalLink size={13} /> View</a>}
          <button onClick={onApprove} disabled={busy} style={{ ...BTN_PRIMARY, opacity: busy ? 0.5 : 1 }}>{busy ? <Loader2 size={14} className="mvp-spin" /> : <Check size={14} />} Approve</button>
          <button onClick={() => setShowCh(!showCh)} disabled={busy} style={{ ...BTN_GHOST, opacity: busy ? 0.5 : 1 }}>Changes</button>
        </div>
      )}
      {showCh && d.status === 'delivered' && (
        <div style={{ marginTop: 8 }}>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="What should the creator change?" className="mvp-input"
            style={{ width: '100%', boxSizing: 'border-box', borderRadius: 11, border: `0.5px solid ${C.line}`, padding: '9px 11px', fontSize: 13, color: C.ink, fontFamily: 'inherit', outline: 'none', resize: 'vertical' }} />
          <button onClick={() => { onChanges(note.trim()); setShowCh(false); setNote('') }} disabled={busy || !note.trim()}
            style={{ marginTop: 8, padding: '8px 14px', borderRadius: 11, border: 'none', background: C.ink, color: '#fff', fontSize: 13.5, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', opacity: busy || !note.trim() ? 0.4 : 1 }}>Send changes</button>
        </div>
      )}
      {d.status === 'approved' && link && (
        <a href={link} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6, fontSize: 12, color: C.mute, textDecoration: 'none' }}><ExternalLink size={12} /> View work</a>
      )}
    </div>
  )
}

/** The requirements on a booking: every question the offer asks, with the restaurant's answers, and
 *  editable any time — so it can fill in ones it skipped at booking, not just the ones it answered.
 *  Saves back into the booking's note via updateBookingIntake. Renders nothing if the offer asked
 *  nothing. */
function ClientIntake({ bookingId, intake, questions }: { bookingId: string; intake: Record<string, string>; questions: string[] }) {
  // Show the offer's questions first, then any extra answered keys (legacy, or the notes field).
  const allQ = [...questions, ...Object.keys(intake).filter((k) => !questions.includes(k))]
  const seed = () => Object.fromEntries(allQ.map((q) => [q, intake[q] ?? '']))
  const [vals, setVals] = useState<Record<string, string>>(seed)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const entries = Object.entries(vals).filter(([, v]) => v)
  if (allQ.length === 0) return null

  async function save() {
    setSaving(true); setErr('')
    const res = await updateBookingIntake({ bookingId, intake: vals })
    setSaving(false)
    if (res.ok) setEditing(false)
    else setErr(res.error ?? 'Could not save.')
  }

  const hasMissing = allQ.some((q) => !(vals[q] ?? '').trim())

  return (
    <div style={{ margin: '11px 0 0', padding: '11px 0 0', borderTop: `0.5px solid ${C.line}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: editing ? 8 : 5 }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: C.faint }}>What they need from you</span>
        {!editing && <button onClick={() => setEditing(true)} style={{ fontSize: 12, fontWeight: 600, color: C.greenDk, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>{entries.length ? (hasMissing ? 'Add more' : 'Edit') : 'Add details'}</button>}
      </div>
      {editing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {allQ.map((q) => (
            <div key={q}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.ink, marginBottom: 3 }}>{q}</label>
              <textarea value={vals[q] ?? ''} onChange={(e) => setVals({ ...vals, [q]: e.target.value })} rows={2} className="mvp-input"
                style={{ width: '100%', boxSizing: 'border-box', borderRadius: 10, border: `0.5px solid ${C.line}`, padding: '8px 10px', fontSize: 13, color: C.ink, fontFamily: 'inherit', outline: 'none', resize: 'vertical' }} />
            </div>
          ))}
          {err && <div style={{ fontSize: 12, color: C.coral }}>{err}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={save} disabled={saving} style={{ ...BTN_PRIMARY, opacity: saving ? 0.5 : 1 }}>{saving ? 'Saving…' : 'Save'}</button>
            <button onClick={() => { setVals(seed()); setEditing(false); setErr('') }} disabled={saving} style={BTN_TEXT}>Cancel</button>
          </div>
        </div>
      ) : entries.length ? (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 5 }}>
          {entries.map(([q, v], i) => (
            <li key={i} style={{ fontSize: 12, color: C.mute, display: 'flex', gap: 7 }}><span style={{ color: C.faint }}>•</span> <span><span style={{ color: C.ink, fontWeight: 600 }}>{q}</span> {v}</span></li>
          ))}
        </ul>
      ) : (
        <div style={{ fontSize: 12, color: C.mute }}>The creator has {allQ.length} question{allQ.length === 1 ? '' : 's'} for you. Tap Add details to answer.</div>
      )}
    </div>
  )
}
