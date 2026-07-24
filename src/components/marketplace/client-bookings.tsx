'use client'

/**
 * ClientBookings — the restaurant's side of a creator booking, now end to end. Each booking shows its
 * live phase: waiting on the creator, on the calendar, in progress, ready to review, or approved. Once
 * the creator delivers, the same Approve / Ask-for-changes the campaign world has appears right here —
 * approving fires the owner charge + the creator payout through the shared work-order path. Reschedule
 * and cancel stay available until the work is delivered.
 */

import { useState } from 'react'
import Link from 'next/link'
import { CalendarClock, Check, Loader2, ExternalLink } from 'lucide-react'
import { cancelCreatorBooking, acceptBookingQuote } from '@/lib/marketplace/creator-booking'
import type { ClientBooking } from '@/lib/marketplace/creator-schedule-types'
import RescheduleSheet from '@/components/creator/reschedule-sheet'

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

/** The one phase pill each booking shows — delivery state wins over the raw booking status, so the
 *  row always tells the true story (in progress → ready to review → approved). */
function phaseOf(b: ClientBooking): { key: string; label: string; cls: string } {
  const w = b.workStatus
  // A quote job before it has a work order: waiting on the creator's price, or their price is in.
  if (!w && b.shape === 'quote') {
    if (b.quoteStatus === 'quoted' && b.quotedCents) return { key: 'quote_ready', label: 'Quote ready', cls: 'text-violet-700 bg-violet-50' }
    return { key: 'quote_req', label: 'Quote requested', cls: 'text-amber-700 bg-amber-50' }
  }
  if (w === 'delivered') return { key: 'delivered', label: 'Ready to review', cls: 'text-violet-700 bg-violet-50' }
  if (w === 'approved') return { key: 'approved', label: 'Approved', cls: 'text-emerald-700 bg-emerald-50' }
  if (w === 'revision') return { key: 'revision', label: 'Changes sent', cls: 'text-amber-700 bg-amber-50' }
  if (w === 'accepted' || w === 'in_progress') return { key: 'working', label: 'In progress', cls: 'text-blue-700 bg-blue-50' }
  if (b.status === 'held') return { key: 'held', label: 'Waiting on the creator', cls: 'text-amber-700 bg-amber-50' }
  if (b.status === 'needs_reschedule') return { key: 'needs', label: 'Needs a new time', cls: 'text-amber-700 bg-amber-50' }
  return { key: 'confirmed', label: 'Confirmed', cls: 'text-emerald-700 bg-emerald-50' }
}

export default function ClientBookings({ initialBookings }: { initialBookings: ClientBooking[] }) {
  const [bookings, setBookings] = useState<ClientBooking[]>(initialBookings)
  const [busy, setBusy] = useState<string | null>(null)
  const [reschedule, setReschedule] = useState<{ id: string; vendorSlug: string } | null>(null)
  const [changesFor, setChangesFor] = useState<string | null>(null) // booking id whose "ask for changes" box is open
  const [note, setNote] = useState('')

  async function cancel(id: string) {
    setBusy(id)
    const res = await cancelCreatorBooking(id)
    setBusy(null)
    if (res.ok) setBookings((prev) => prev.filter((b) => b.id !== id))
  }

  // Approve the delivery, or send it back for changes. Both go through the creator-work route, which
  // authorizes the restaurant owner (client access) and, on approve, accrues the charge + payout.
  async function review(b: ClientBooking, decision: 'approved' | 'revision', changeNote?: string) {
    if (!b.orderId) return
    setBusy(b.id)
    try {
      const res = await fetch('/api/creator/work', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: b.orderId, status: decision, ...(changeNote ? { note: changeNote } : {}) }),
      })
      if (res.ok) {
        setBookings((prev) => prev.map((x) => (x.id === b.id ? { ...x, workStatus: decision } : x)))
        setChangesFor(null); setNote('')
      }
    } finally {
      setBusy(null)
    }
  }

  // Accept a creator's quote → it mints the work order at the quoted price and starts the loop.
  async function acceptQuote(b: ClientBooking) {
    setBusy(b.id)
    try {
      const res = await acceptBookingQuote(b.id)
      if (res.ok) setBookings((prev) => prev.map((x) => (x.id === b.id ? { ...x, workStatus: 'accepted', quoteStatus: null, amountCents: b.quotedCents ?? x.amountCents } : x)))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-5 py-8" style={{ fontFamily: 'Inter, sans-serif' }}>
      <h1 className="text-xl font-bold text-neutral-900">Your bookings</h1>
      <p className="text-sm text-neutral-500 mt-1 mb-6">The creators you&apos;ve booked, when they&apos;re coming, and their finished work to approve.</p>

      {bookings.length === 0 ? (
        <div className="border border-dashed border-neutral-200 rounded-2xl p-8 text-center text-sm text-neutral-500">
          No bookings yet. Find a creator in the <Link href="/dashboard/campaigns/new" className="text-emerald-700 font-medium hover:underline">store</Link>.
        </div>
      ) : (
        <div className="space-y-3">
          {bookings.map((b) => {
            const phase = phaseOf(b)
            const isBusy = busy === b.id
            const link = safeLink(b.deliveredUrl)
            const editable = phase.key === 'held' || phase.key === 'needs' || phase.key === 'confirmed' || phase.key === 'working'
            const canReschedule = editable && (!b.shape || b.shape === 'scheduled')
            const canCancel = editable || phase.key === 'quote_req'
            const isRecurring = b.shape === 'recurring'
            return (
              <div key={b.id} className="rounded-2xl border border-neutral-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-neutral-900">{b.listingTitle}{b.tierName ? <span className="text-neutral-400 font-normal"> · {b.tierName}</span> : null}</div>
                    <div className="text-xs text-neutral-500 mt-0.5">by {b.vendorName}</div>
                    {b.date && <div className="text-sm text-neutral-700 mt-1 font-medium flex items-center gap-1.5"><CalendarClock className="w-3.5 h-3.5 text-neutral-400" />{slotLabel(b.date, b.start)}</div>}
                  </div>
                  <span className={`text-[10px] font-semibold uppercase tracking-wide rounded-full px-2.5 py-1 flex-shrink-0 ${phase.cls}`}>{phase.label}</span>
                </div>

                {/* Delivered → the review panel: see the work, approve, or ask for changes. */}
                {phase.key === 'delivered' && (
                  <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50/50 p-3">
                    <div className="text-[13px] font-semibold text-neutral-900">The finished work is ready.</div>
                    {money(b.amountCents) && <div className="text-[12px] text-neutral-500 mt-0.5">Approving bills you {money(b.amountCents)}.</div>}
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      {link && (
                        <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-neutral-200 bg-white text-sm font-medium text-neutral-700 hover:bg-neutral-50">
                          <ExternalLink className="w-3.5 h-3.5" /> View work
                        </a>
                      )}
                      <button onClick={() => review(b, 'approved')} disabled={isBusy}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">
                        {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Approve
                      </button>
                      <button onClick={() => { setChangesFor(changesFor === b.id ? null : b.id); setNote('') }} disabled={isBusy}
                        className="px-3.5 py-2 rounded-xl border border-neutral-200 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50">
                        Ask for changes
                      </button>
                    </div>
                    {changesFor === b.id && (
                      <div className="mt-2.5">
                        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
                          placeholder="What should the creator change?"
                          className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-[13px] text-neutral-800 outline-none focus:border-neutral-400" />
                        <button onClick={() => review(b, 'revision', note.trim() || undefined)} disabled={isBusy || !note.trim()}
                          className="mt-2 px-3.5 py-2 rounded-xl bg-neutral-900 text-white text-sm font-semibold disabled:opacity-40">Send changes</button>
                      </div>
                    )}
                  </div>
                )}

                {/* Approved → done, with a link to the work and what it billed. */}
                {phase.key === 'approved' && (
                  <div className="mt-3 flex items-center gap-3 text-[13px] text-emerald-700">
                    <span className="font-medium">Approved{money(b.amountCents) ? ` · ${money(b.amountCents)}` : ''}</span>
                    {link && <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-neutral-600 hover:underline"><ExternalLink className="w-3.5 h-3.5" /> View work</a>}
                  </div>
                )}

                {/* Changes sent → waiting on the creator to redo it. */}
                {phase.key === 'revision' && (
                  <div className="mt-3 text-[13px] text-amber-700">Changes sent. Waiting on the creator to redo it.</div>
                )}

                {/* In progress → the creator is on it. */}
                {phase.key === 'working' && (
                  <div className="mt-2 text-[12px] text-neutral-500">The creator is working on this.</div>
                )}

                {/* Quote ready → their price; accept to start, or decline. */}
                {phase.key === 'quote_ready' && (
                  <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50/50 p-3">
                    <div className="text-[13px] font-semibold text-neutral-900">{b.vendorName} quoted {money(b.quotedCents) ?? 'a price'}.</div>
                    <div className="text-[12px] text-neutral-500 mt-0.5">Accept to start. You&apos;re billed only after you approve the finished work.</div>
                    <div className="mt-2.5 flex items-center gap-2">
                      <button onClick={() => acceptQuote(b)} disabled={isBusy}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">
                        {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Accept quote
                      </button>
                      <button onClick={() => cancel(b.id)} disabled={isBusy}
                        className="px-3.5 py-2 rounded-xl text-sm font-medium text-neutral-400 hover:text-red-600 disabled:opacity-50">Decline</button>
                    </div>
                  </div>
                )}

                {/* Quote requested → waiting on the creator's price. */}
                {phase.key === 'quote_req' && (
                  <div className="mt-2 text-[12px] text-neutral-500">Waiting on {b.vendorName} to send a price.</div>
                )}

                {isRecurring && (phase.key === 'working' || phase.key === 'confirmed') && (
                  <div className="mt-1 text-[11px] font-medium text-neutral-400">Monthly plan · billed each month after you approve that month&apos;s work.</div>
                )}

                {/* Reschedule (scheduled shoots only) + Cancel — until the work is delivered. Quote-ready
                    carries its own Accept / Decline above, so it skips this row. */}
                {(canReschedule || canCancel) && phase.key !== 'quote_ready' && (
                  <div className="mt-3 flex items-center gap-2">
                    {canReschedule && (
                      <button onClick={() => setReschedule({ id: b.id, vendorSlug: b.vendorSlug })} disabled={isBusy}
                        className="px-3.5 py-2 rounded-xl border border-neutral-200 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50">Reschedule</button>
                    )}
                    {canCancel && (
                      <button onClick={() => cancel(b.id)} disabled={isBusy}
                        className="px-3.5 py-2 rounded-xl text-sm font-medium text-neutral-400 hover:text-red-600 disabled:opacity-50">Cancel</button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

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
    </div>
  )
}
