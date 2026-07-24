'use client'

/**
 * BookOffer — the real booking flow for a creator's offer (not Apnosh bundles, which keep the
 * lead-capture BookButton). Opens a sheet where the restaurant picks a level, answers the creator's
 * questions, and — depending on how the offer is delivered — picks a time, sees a turnaround, starts
 * a monthly plan, or requests a quote. It calls the same booking rail the campaign builder uses, so
 * a booking here creates a real order + job. No charge here: money accrues only when the restaurant
 * approves the delivered work, exactly like everywhere else.
 *
 * Add-ons are shown as info, not booked, because the rail prices a booking from the chosen level;
 * letting a buyer toggle a +$ add-on that didn't reach the creator's pay would underbill them. A
 * buyer asks for extras in the notes; the creator quotes them.
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Calendar, Loader2, CheckCircle2, X, Clock, Repeat, MessageSquareText, Check } from 'lucide-react'
import { fetchCreatorSlots, holdCreatorBooking, confirmAsyncBooking, startRecurringBooking, requestQuote } from '@/lib/marketplace/creator-booking'
import type { VendorSchedule } from '@/lib/marketplace/creator-schedule-types'
import type { OpenSlot } from '@/lib/campaigns/gates/types'

type Mode = 'scheduled' | 'async' | 'recurring' | 'quote'

interface Tier { name: string; priceCents: number; deliverables: string[] }
interface Option { label: string; priceDeltaCents: number }
interface Ask { id: string; label: string; hint?: string; required?: boolean }

interface Props {
  vendorSlug: string
  vendorName: string
  listingSlug: string
  title: string
  mode: Mode
  billingMonthly: boolean
  turnaroundDays: number | null
  basePriceCents: number | null
  tiers: Tier[]
  options: Option[]
  intake: Ask[]
}

const money = (c: number | null) => (c == null ? 'Quote' : `$${Math.round(c / 100).toLocaleString()}`)
const fmtTime = (hhmm: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm); if (!m) return hhmm
  const h = Number(m[1]); const ap = h < 12 ? 'AM' : 'PM'; const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${m[2]} ${ap}`
}
const fmtDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })

export default function BookOffer(props: Props) {
  const { vendorSlug, vendorName, listingSlug, title, mode, billingMonthly, turnaroundDays, basePriceCents, tiers, options, intake } = props
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [tierName, setTierName] = useState<string | null>(tiers[0]?.name ?? null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState<null | { kind: Mode; confirmed: boolean; when?: string }>(null)

  // slots (scheduled only)
  const [schedule, setSchedule] = useState<VendorSchedule | null>(null)
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [selDate, setSelDate] = useState<string | null>(null)
  const [selTime, setSelTime] = useState<string | null>(null)
  const [selectedOpts, setSelectedOpts] = useState<Set<number>>(new Set())

  useEffect(() => {
    if (!open || mode !== 'scheduled' || schedule) return
    setLoadingSlots(true)
    fetchCreatorSlots(vendorSlug).then((s) => { setSchedule(s); setLoadingSlots(false) }).catch(() => setLoadingSlots(false))
  }, [open, mode, vendorSlug, schedule])

  const selectedTier = tiers.find((t) => t.name === tierName) ?? null
  const chosenOptions = options.filter((_, i) => selectedOpts.has(i)).map((o) => ({ label: o.label, priceDeltaCents: o.priceDeltaCents }))
  const extraCents = chosenOptions.reduce((s, o) => s + o.priceDeltaCents, 0)
  const priceCents = mode === 'quote' ? null : ((selectedTier ? selectedTier.priceCents : (basePriceCents ?? 0)) + extraCents)
  const dates = schedule ? [...new Set(schedule.slots.map((s) => s.date))].sort() : []
  const timesForDate: OpenSlot[] = schedule && selDate ? schedule.slots.filter((s) => s.date === selDate) : []

  async function submit() {
    const missing = intake.find((q) => q.required && !(answers[q.label] ?? '').trim())
    if (missing) { setErr(`Please answer: ${missing.label}`); return }
    if (mode === 'scheduled' && (!selDate || !selTime)) { setErr('Pick a time that works.'); return }
    const intakePayload: Record<string, string> = {}
    for (const q of intake) { const v = (answers[q.label] ?? '').trim(); if (v) intakePayload[q.label] = v }
    if (notes.trim()) intakePayload['Notes'] = notes.trim()
    const tn = tiers.length ? tierName : null

    setSubmitting(true); setErr('')
    try {
      if (mode === 'scheduled') {
        const r = await holdCreatorBooking({ vendorSlug, listingSlug, tierName: tn, date: selDate!, start: selTime!, intake: intakePayload, options: chosenOptions })
        if (!r.ok) return fail(r)
        setDone({ kind: 'scheduled', confirmed: r.status === 'confirmed', when: `${fmtDate(r.date)} at ${fmtTime(r.start)}` })
      } else if (mode === 'async') {
        const r = await confirmAsyncBooking({ vendorSlug, listingSlug, tierName: tn, intake: intakePayload, options: chosenOptions })
        if (!r.ok) return fail(r)
        setDone({ kind: 'async', confirmed: true, when: r.dueDate ? fmtDate(r.dueDate) : undefined })
      } else if (mode === 'recurring') {
        const r = await startRecurringBooking({ vendorSlug, listingSlug, tierName: tn, intake: intakePayload, options: chosenOptions })
        if (!r.ok) return fail(r)
        setDone({ kind: 'recurring', confirmed: true, when: r.startDate ? fmtDate(r.startDate) : undefined })
      } else {
        const r = await requestQuote({ vendorSlug, listingSlug, tierName: tn, intake: intakePayload, options: chosenOptions })
        if (!r.ok) return fail(r)
        setDone({ kind: 'quote', confirmed: false })
      }
    } finally {
      setSubmitting(false)
    }
  }

  function fail(r: { needsLogin?: boolean; error: string }) {
    if (r.needsLogin) { router.push(`/login?next=/marketplace/${vendorSlug}`); return }
    setErr(r.error || 'Could not book. Try again.')
  }

  const cta = mode === 'scheduled' ? 'Book a time' : mode === 'recurring' ? 'Start the plan' : mode === 'quote' ? 'Request a quote' : 'Book it'
  const noAvail = mode === 'scheduled' && schedule && !schedule.available

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 bg-ink text-white text-[12.5px] font-semibold rounded-full px-4 py-2 hover:bg-ink-2 transition">
        <Calendar className="w-3.5 h-3.5" /> {cta}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={() => !submitting && setOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto">
            {/* header */}
            <div className="sticky top-0 bg-white border-b border-ink-6 px-5 py-3.5 flex items-center justify-between">
              <div>
                <p className="text-[15px] font-semibold text-ink leading-tight">{done ? 'All set' : title}</p>
                {!done && <p className="text-[11.5px] text-ink-3">{vendorName}</p>}
              </div>
              <button onClick={() => !submitting && setOpen(false)} className="p-1.5 rounded-lg hover:bg-ink-7/50"><X className="w-4 h-4 text-ink-3" /></button>
            </div>

            {done ? (
              <div className="px-5 py-6">
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0" />
                  <div>
                    <p className="text-[15px] font-semibold text-ink mb-1">
                      {done.kind === 'scheduled' && done.confirmed && `You're booked for ${done.when}.`}
                      {done.kind === 'scheduled' && !done.confirmed && `Time requested: ${done.when}.`}
                      {done.kind === 'async' && 'Booked.'}
                      {done.kind === 'recurring' && 'Your plan started.'}
                      {done.kind === 'quote' && 'Request sent.'}
                    </p>
                    <p className="text-[13px] text-ink-2 leading-relaxed">
                      {done.kind === 'scheduled' && !done.confirmed && `${vendorName} will confirm shortly. `}
                      {done.kind === 'async' && `${vendorName} will deliver by about ${done.when}. `}
                      {done.kind === 'recurring' && `This month's work is in ${vendorName}'s queue. `}
                      {done.kind === 'quote' && `${vendorName} will send you a price to accept. `}
                      No charge yet. You pay after you approve the work.
                    </p>
                    <a href="/dashboard/bookings" className="inline-block mt-3 text-[13px] font-semibold text-brand-dark hover:underline">Track it in your bookings</a>
                  </div>
                </div>
              </div>
            ) : (
              <div className="px-5 py-4 space-y-5">
                {/* levels */}
                {tiers.length > 0 && (
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-ink-3 mb-2">Pick a level</p>
                    <div className="space-y-2">
                      {tiers.map((t) => (
                        <button key={t.name} onClick={() => setTierName(t.name)}
                          className={`w-full text-left rounded-xl border p-3 ${tierName === t.name ? 'border-brand bg-brand-tint/30' : 'border-ink-6'}`}>
                          <div className="flex items-center justify-between">
                            <span className="text-[13.5px] font-semibold text-ink">{t.name}</span>
                            <span className="text-[14px] font-bold text-ink tabular-nums">{money(t.priceCents)}{billingMonthly ? '/mo' : ''}</span>
                          </div>
                          {t.deliverables.length > 0 && <p className="text-[12px] text-ink-3 mt-1">{t.deliverables.join(' · ')}</p>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* delivery */}
                <div>
                  {mode === 'scheduled' && (
                    <>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-ink-3 mb-2">Pick a time</p>
                      {loadingSlots && <div className="flex items-center gap-2 text-[13px] text-ink-3 py-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading times…</div>}
                      {noAvail && <p className="text-[13px] text-ink-2">This creator has not opened their calendar yet. Check back soon.</p>}
                      {schedule?.available && (
                        <>
                          <div className="flex gap-2 overflow-x-auto pb-1">
                            {dates.map((d) => (
                              <button key={d} onClick={() => { setSelDate(d); setSelTime(null) }}
                                className={`flex-shrink-0 rounded-xl border px-3 py-2 text-[12.5px] ${selDate === d ? 'border-brand bg-brand-tint/30 text-ink font-semibold' : 'border-ink-6 text-ink-2'}`}>
                                {fmtDate(d)}
                              </button>
                            ))}
                          </div>
                          {selDate && (
                            <div className="grid grid-cols-3 gap-2 mt-2">
                              {timesForDate.map((s) => (
                                <button key={s.start} onClick={() => setSelTime(s.start)}
                                  className={`rounded-lg border py-2 text-[12.5px] ${selTime === s.start ? 'border-brand bg-brand text-white font-semibold' : 'border-ink-6 text-ink-2'}`}>
                                  {fmtTime(s.start)}
                                </button>
                              ))}
                            </div>
                          )}
                          {schedule.confirmMode === 'request' && <p className="text-[11.5px] text-ink-3 mt-2">The creator confirms your time.</p>}
                        </>
                      )}
                    </>
                  )}
                  {mode === 'async' && (
                    <div className="flex items-start gap-2 text-[13px] text-ink-2"><Clock className="w-4 h-4 text-ink-3 mt-0.5 flex-shrink-0" /> Delivered in about {turnaroundDays ?? 7} days after you book. No visit needed.</div>
                  )}
                  {mode === 'recurring' && (
                    <div className="flex items-start gap-2 text-[13px] text-ink-2"><Repeat className="w-4 h-4 text-ink-3 mt-0.5 flex-shrink-0" /> Starts today and runs every month. Each month is its own delivery you approve.</div>
                  )}
                  {mode === 'quote' && (
                    <div className="flex items-start gap-2 text-[13px] text-ink-2"><MessageSquareText className="w-4 h-4 text-ink-3 mt-0.5 flex-shrink-0" /> No set price. Send your details and {vendorName} replies with a price before anything books.</div>
                  )}
                </div>

                {/* add-ons — selectable (each adds to the price) for priced offers; a quote lists them as requests */}
                {options.length > 0 && mode !== 'quote' && (
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-ink-3 mb-2">Add-ons</p>
                    <div className="flex flex-col gap-1.5">
                      {options.map((o, i) => {
                        const on = selectedOpts.has(i)
                        return (
                          <button key={i} type="button" onClick={() => setSelectedOpts((prev) => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n })}
                            className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left ${on ? 'border-brand bg-brand-tint/30' : 'border-ink-6'}`}>
                            <span className="flex items-center gap-2 text-[13px] text-ink">
                              <span className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 ${on ? 'bg-brand' : 'border border-ink-6'}`}>{on && <Check className="w-3 h-3 text-white" />}</span>
                              {o.label}
                            </span>
                            <span className="text-[13px] font-semibold text-ink tabular-nums">+{money(o.priceDeltaCents)}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
                {options.length > 0 && mode === 'quote' && (
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-ink-3 mb-1.5">Extras you can ask for</p>
                    <div className="flex flex-wrap gap-1.5">
                      {options.map((o, i) => <span key={i} className="text-[12px] text-ink-2 bg-ink-7/40 rounded-full px-2.5 py-1">{o.label} <span className="text-ink-3">+{money(o.priceDeltaCents)}</span></span>)}
                    </div>
                    <p className="text-[11px] text-ink-3 mt-1.5">Mention any you want in the notes; the creator prices the quote.</p>
                  </div>
                )}

                {/* intake */}
                {intake.length > 0 && (
                  <div className="space-y-3">
                    {intake.map((q) => (
                      <div key={q.id}>
                        <label className="block text-[12.5px] font-semibold text-ink mb-1">{q.label}{q.required && <span className="text-rose-500"> *</span>}</label>
                        <textarea value={answers[q.label] ?? ''} onChange={(e) => setAnswers({ ...answers, [q.label]: e.target.value })} rows={2}
                          placeholder={q.hint ?? ''} className="w-full rounded-lg border border-ink-6 px-3 py-2 text-[13px] text-ink focus:outline-none focus:border-brand resize-none" />
                      </div>
                    ))}
                  </div>
                )}

                {/* notes */}
                <div>
                  <label className="block text-[12.5px] font-semibold text-ink mb-1">Anything else? <span className="text-ink-3 font-normal">(optional)</span></label>
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Extras you want, timing, anything to know."
                    className="w-full rounded-lg border border-ink-6 px-3 py-2 text-[13px] text-ink focus:outline-none focus:border-brand resize-none" />
                </div>

                {err && <p className="text-[12.5px] text-rose-700">{err}</p>}

                {/* price + submit */}
                {mode !== 'quote' && (
                  <div className="flex items-baseline justify-between">
                    <span className="text-[12.5px] text-ink-3">You pay after you approve</span>
                    <span className="text-[18px] font-bold text-ink tabular-nums">{money(priceCents)}{billingMonthly ? '/mo' : ''}</span>
                  </div>
                )}
                <button onClick={submit} disabled={submitting || !!noAvail}
                  className="w-full inline-flex items-center justify-center gap-2 bg-ink text-white text-[14px] font-semibold rounded-xl py-3 hover:bg-ink-2 transition disabled:opacity-50">
                  {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Booking…</> : cta}
                </button>
                <p className="text-[11px] text-ink-3 text-center">No charge today. Money is only owed after the creator delivers and you approve it.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
