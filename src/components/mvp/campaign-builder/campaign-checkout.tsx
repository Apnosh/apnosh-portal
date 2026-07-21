'use client'

/**
 * CampaignCheckout — the real "One last look" checkout page for the campaign cart.
 *
 * Charge-at-checkout: shows the full itemized bill (items + 10% service fee + Stripe-computed
 * tax), collects a billing address + card via Stripe Elements, and on "Place order" charges the
 * card, then ships the campaign through the normal saveAndShip rail. Nothing ships until the
 * charge succeeds; the card is saved for reuse.
 *
 * Server does all the money math (see /api/checkout/*). This component only renders the bill it
 * is handed and confirms the PaymentIntent. A $0 one-time bill (owner-run/free lanes) skips
 * Stripe and ships directly.
 */

import { useEffect, useRef, useState } from 'react'
import { loadStripe, type StripeAddressElementChangeEvent } from '@stripe/stripe-js'
import { Elements, AddressElement, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { saveAndShip } from '@/lib/campaigns/builder/ship'
import { clearPlan } from '@/lib/campaigns/builder/plan-draft'
import { passthroughNotesForLines, plainCostNote, passthroughMonthlyMinimumCents } from '@/lib/campaigns/builder/item-prices'
import { goLivePhraseFor } from '@/components/campaigns/plan-flow/receipt-view'
import { draftNeedsShoot } from '@/lib/campaigns/gates/derive'
import { summarize, type CampaignDraft, type PieceProducer } from '@/lib/campaigns/types'
import type { ResolvedGates, CustomGate } from '@/lib/campaigns/gates/config'

const MINT = '#4abd98'
const MINT_DARK = '#3f7d6a'
const MINT_TINT = '#e6f5ef'
const INK = '#14231c'
const SUB = '#6b746e'
const FAINT = '#9aa39d'
const LINE = 'rgba(20,35,28,0.10)'
const BG = '#fbfcfb'

function fmt(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}

interface Breakdown { subtotalCents: number; serviceFeeCents: number; taxCents: number; totalCents: number }
interface SavedCard { brand: string; last4: string }
interface PrepareResult {
  free?: boolean
  /** Monthly-only cart: a SetupIntent saves the card (no charge today); the subscription bills it. */
  setupOnly?: boolean
  paymentIntentId?: string
  clientSecret?: string
  publishableKey?: string | null
  breakdown: Breakdown
  monthlyCents?: number
  savedCard?: SavedCard | null
  gates?: ResolvedGates
}

export interface CampaignCheckoutProps {
  clientId: string
  draft: CampaignDraft
  restaurant?: string
  /** Per-piece producer picks (single-campaign "Buy now" carries these; the cart pre-merges them onto
   *  line items and passes none). Applied via a PATCH before ship, same as the old direct rail. */
  producerChoices?: Record<string, PieceProducer>
  /** Answers the owner already gave in the cart, where these questions are now asked on the
   *  item. Seeds the gate state so checkout never re-asks something already answered. */
  initialGateAnswers?: Record<string, string>
  /** Called when the owner LEAVES the confirmation screen — to the setup page or the campaign. */
  onSuccess: (campaignId: string, dest: 'setup' | 'campaign') => void
  onCancel: () => void
}

// One loadStripe promise per publishable key (module-level cache; loadStripe must not re-run per render).
let _stripePromise: ReturnType<typeof loadStripe> | null = null
let _stripeKey: string | null = null
function stripePromiseFor(key: string) {
  if (_stripePromise && _stripeKey === key) return _stripePromise
  _stripeKey = key
  _stripePromise = loadStripe(key)
  return _stripePromise
}

export default function CampaignCheckout({ clientId, draft, restaurant, producerChoices, initialGateAnswers, onSuccess, onCancel }: CampaignCheckoutProps) {
  const [prep, setPrep] = useState<PrepareResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Set once the order is placed (paid + shipped) — flips the whole overlay to the confirmation.
  const [placed, setPlaced] = useState<{ campaignId: string; breakdown: Breakdown; bookedSlot: Hold | null } | null>(null)
  const started = useRef(false)

  // The cart is done the moment the order is placed, so empty it right away (before the owner
  // navigates off the confirmation) — reopening the store must not re-checkout the same plan.
  const onPlaced = (campaignId: string, breakdown: Breakdown, bookedSlot: Hold | null = null) => { clearPlan(); setPlaced({ campaignId, breakdown, bookedSlot }) }

  useEffect(() => {
    if (started.current) return
    started.current = true
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/checkout/prepare', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId, draft }),
        })
        const j = (await res.json().catch(() => ({}))) as PrepareResult & { error?: string }
        if (!res.ok) throw new Error(j.error || 'Could not start checkout.')
        if (!cancelled) setPrep(j)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not start checkout.')
      }
    })()
    return () => { cancelled = true }
  }, [clientId, draft])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: BG, display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 480, display: 'flex', flexDirection: 'column', height: '100%' }}>
        {placed ? (
          <Confirmation
            restaurant={restaurant}
            draft={draft}
            breakdown={placed.breakdown}
            setupOnly={!!prep?.setupOnly}
            bookedSlot={placed.bookedSlot}
            onSetup={() => onSuccess(placed.campaignId, 'setup')}
            onViewCampaign={() => onSuccess(placed.campaignId, 'campaign')}
          />
        ) : (
          <>
            <Header onBack={onCancel} />
            {error && !prep && <ErrorBox message={error} onBack={onCancel} />}
            {!error && !prep && <Loading />}
            {prep?.free && <FreeCheckout clientId={clientId} draft={draft} producerChoices={producerChoices} gates={prep.gates} initialGateAnswers={initialGateAnswers} onPlaced={onPlaced} />}
            {prep && !prep.free && prep.clientSecret && prep.publishableKey && (
              <Elements
                stripe={stripePromiseFor(prep.publishableKey)}
                options={{ clientSecret: prep.clientSecret, appearance: { theme: 'flat', variables: { colorPrimary: MINT, fontFamily: 'Inter, sans-serif', borderRadius: '12px' } } }}
              >
                <PayForm
                  clientId={clientId}
                  initialGateAnswers={initialGateAnswers}
                  draft={draft}
                  restaurant={restaurant}
                  producerChoices={producerChoices}
                  paymentIntentId={prep.paymentIntentId!}
                  initialBreakdown={prep.breakdown}
                  monthlyCents={prep.monthlyCents ?? 0}
                  setupOnly={!!prep.setupOnly}
                  savedCard={prep.savedCard ?? null}
                  gates={prep.gates}
                  onPlaced={onPlaced}
                />
              </Elements>
            )}
            {prep && !prep.free && (!prep.clientSecret || !prep.publishableKey) && (
              <ErrorBox message="Payments aren’t configured yet (missing Stripe keys). Add the Stripe keys and try again." onBack={onCancel} />
            )}
          </>
        )}
      </div>
    </div>
  )
}

function Header({ onBack }: { onBack: () => void }) {
  return (
    <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px 12px' }}>
      <button onClick={onBack} aria-label="Back" style={{ width: 36, height: 36, borderRadius: 18, border: 'none', background: 'rgba(20,35,28,0.06)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
      </button>
      <h1 style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 21, fontWeight: 700, color: INK, letterSpacing: -0.4, margin: 0 }}>Checkout</h1>
    </div>
  )
}

function Loading() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: SUB, fontFamily: 'Inter, sans-serif', fontSize: 13.5 }}>
      <div style={{ width: 26, height: 26, borderRadius: 13, border: `2.5px solid ${LINE}`, borderTopColor: MINT, animation: 'apnspin 0.8s linear infinite' }} />
      Getting your total ready…
      <style>{`@keyframes apnspin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

function ErrorBox({ message, onBack }: { message: string; onBack: () => void }) {
  return (
    <div style={{ flex: 1, padding: '20px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div role="alert" style={{ background: '#fdecec', border: '1px solid #f2c9c2', borderRadius: 14, padding: '13px 15px', fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#9a3b26', lineHeight: 1.5 }}>{message}</div>
      <button onClick={onBack} style={{ height: 46, borderRadius: 23, border: `1px solid ${LINE}`, background: '#fff', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 600, color: INK }}>Back to cart</button>
    </div>
  )
}

function BillRow({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, padding: strong ? '11px 0 0' : '7px 0' }}>
      <span style={{ fontFamily: 'Inter, sans-serif', fontSize: strong ? 14 : 13, fontWeight: strong ? 700 : 400, color: muted ? SUB : INK }}>{label}</span>
      <span style={{ fontFamily: strong ? "'Cal Sans', Poppins, sans-serif" : 'Inter, sans-serif', fontSize: strong ? 19 : 13, fontWeight: strong ? 700 : 600, color: muted ? SUB : INK, whiteSpace: 'nowrap', letterSpacing: strong ? -0.3 : 0 }}>{value}</span>
    </div>
  )
}

function BillCard({ b, monthlyCents, taxPending, costNotes, setupOnly, adSpendMinCents = 0 }: { b: Breakdown; monthlyCents: number; taxPending: boolean; costNotes?: string[]; setupOnly?: boolean; adSpendMinCents?: number }) {
  // ONE real monthly total including known ad-spend minimums — never a surprise later.
  const adTotalLine = monthlyCents > 0 && adSpendMinCents > 0
    ? <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11.5, fontWeight: 600, color: INK, marginTop: 6 }}>With ad spend, about {fmt(monthlyCents + adSpendMinCents)}+/mo.</div>
    : null
  if (setupOnly) {
    // Monthly-only order: no one-time charge, the subscription bills the card starting today.
    return (
      <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 18, padding: '13px 16px 15px', marginBottom: 16 }}>
        <div style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 15, fontWeight: 600, color: INK, marginBottom: 6 }}>Order summary</div>
        <BillRow label="Monthly services" value={`${fmt(monthlyCents)}/mo`} />
        {(costNotes ?? []).map((n) => (
          <div key={n} style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: SUB, padding: '2px 0 4px' }}>Plus {n}</div>
        ))}
        <div style={{ borderTop: `1px solid ${LINE}`, marginTop: 4 }}>
          <BillRow label="First month, billed today" value={fmt(monthlyCents)} strong />
        </div>
        <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: SUB, marginTop: 6 }}>Your card is billed {fmt(monthlyCents)} each month starting today. Cancel anytime.</div>
        {adTotalLine}
      </div>
    )
  }
  return (
    <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 18, padding: '13px 16px 15px', marginBottom: 16 }}>
      <div style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 15, fontWeight: 600, color: INK, marginBottom: 6 }}>Order summary</div>
      <BillRow label="Subtotal" value={fmt(b.subtotalCents)} />
      <BillRow label="Service fee (10%)" value={fmt(b.serviceFeeCents)} />
      <BillRow label="Tax" value={taxPending ? 'Enter address' : fmt(b.taxCents)} muted={taxPending} />
      {monthlyCents > 0 && <BillRow label="Monthly services" value={`${fmt(monthlyCents)}/mo`} muted />}
      {/* Pass-through costs in plain words, from the catalog's own notes — the consent
          below must be informed, so real extra spend is on the bill, not in fine print. */}
      {(costNotes ?? []).map((n) => (
        <div key={n} style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: SUB, padding: '2px 0 4px' }}>Plus {n}</div>
      ))}
      <div style={{ borderTop: `1px solid ${LINE}`, marginTop: 4 }}>
        <BillRow label="Total due today" value={fmt(b.totalCents)} strong />
      </div>
      {monthlyCents > 0 && <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: SUB, marginTop: 6 }}>Monthly services bill {fmt(monthlyCents)}/mo to this card starting today, as a separate charge. Cancel anytime.</div>}
      {adTotalLine}
    </div>
  )
}

const CARD_BRANDS: Record<string, string> = { visa: 'Visa', mastercard: 'Mastercard', amex: 'Amex', discover: 'Discover', diners: 'Diners', jcb: 'JCB', unionpay: 'UnionPay' }
const brandLabel = (b: string) => CARD_BRANDS[b?.toLowerCase()] ?? (b ? b[0].toUpperCase() + b.slice(1) : 'Card')

// ── Pre-checkout booking gate (Checkout Gates, Phase 2) ──────────────────────────────
interface Slot { ruleId: string; date: string; start: string; end: string; timezone: string; remaining: number }
interface AvailabilityResp { available: boolean; reason?: string; timezone: string | null; slots: Slot[] }
interface Hold { bookingId: string; date: string; start: string; end: string; timezone: string }

const fmtDayShort = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
const fmtTime12 = (hhmm: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm); if (!m) return hhmm
  const h = Number(m[1]); const ap = h < 12 ? 'AM' : 'PM'; const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${m[2]} ${ap}`
}

/**
 * When the cart includes an on-site shoot, the client must pick a REAL open slot before paying (the
 * booking is firm at checkout). If nothing is published yet, we degrade honestly to request-mode
 * ("we'll reach out to schedule") — never a fake slot, and never a silent block. `onBlockingChange`
 * tells the pay button whether it must wait for a held slot.
 */
function BookingGate({ clientId, paymentIntentId, booking, targetDate, onBlockingChange, onHold }: {
  clientId: string
  paymentIntentId: string
  /** The server-resolved booking gate for this order (respects the admin's per-campaign config), or
   *  null when none applies (not a shoot, or the admin turned the gate off). */
  booking: { gateKind: string; required: boolean } | null
  /** The date the owner TYPED into the plan (draft.targetDate) — reconciled honestly against the
   *  booking horizon instead of silently offering unrelated slots. */
  targetDate?: string | null
  onBlockingChange: (blocking: boolean) => void
  /** Reports the currently held slot up (so the confirmation can replay it). */
  onHold?: (h: Hold | null) => void
}) {
  const needs = !!booking
  const gateKind = booking?.gateKind ?? 'shoot'
  const required = booking?.required ?? true
  const [loading, setLoading] = useState(needs)
  const [mode, setMode] = useState<'enforced' | 'request' | 'none'>(needs ? 'enforced' : 'none')
  // True when the OWNER chose request-mode ("ask for another time") — different copy than
  // the no-availability fallback, and pay is never locked behind unsuitable slots.
  const [userRequested, setUserRequested] = useState(false)
  const [slots, setSlots] = useState<Slot[]>([])
  const [tz, setTz] = useState<string | null>(null)
  const [horizonDays, setHorizonDays] = useState<number | null>(null)
  const [hold, setHold] = useState<Hold | null>(null)
  const [picking, setPicking] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const loadAvailability = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/gates/availability?gateKind=${encodeURIComponent(gateKind)}`)
      const j = (await res.json().catch(() => ({}))) as AvailabilityResp & { horizonDays?: number }
      const open = Array.isArray(j.slots) ? j.slots : []
      setSlots(open); setTz(j.timezone ?? null)
      setHorizonDays(typeof j.horizonDays === 'number' && j.horizonDays > 0 ? j.horizonDays : null)
      const m = open.length > 0 ? 'enforced' : 'request'
      setMode(m)
      // Only a REQUIRED booking blocks the pay button; an optional gate never blocks.
      onBlockingChange(required && m === 'enforced' && !hold)
      // Request-mode: record an honest 'requested' booking bound to this PaymentIntent so the order is
      // tracked and staff can schedule it later. Best-effort; the note shows regardless.
      if (m === 'request') {
        fetch('/api/gates/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, paymentIntentId, gateKind }) }).catch(() => {})
      }
    } catch {
      setMode('request'); onBlockingChange(false)
    } finally { setLoading(false) }
  }

  // The escape hatch: none of the posted slots work (wrong shift, wrong week, a date past
  // the horizon). Records an honest 'requested' booking and UNLOCKS pay — payment is never
  // held hostage by an unsuitable calendar.
  const askAnotherTime = () => {
    setUserRequested(true)
    setMode('request')
    setHold(null); onHold?.(null)
    onBlockingChange(false)
    fetch('/api/gates/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, paymentIntentId, gateKind }) }).catch(() => {})
  }

  // The typed plan date vs the booking horizon, reconciled OUT LOUD: a January shoot typed
  // into an order sentence must never silently meet an August-only slot list.
  const targetPastHorizon = (() => {
    if (!targetDate || !horizonDays) return false
    const t = Date.parse(`${targetDate}T00:00:00Z`)
    return Number.isFinite(t) && t > Date.now() + horizonDays * 86400000
  })()

  useEffect(() => {
    if (!needs) { onBlockingChange(false); return }
    loadAvailability()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needs, paymentIntentId])

  const pick = async (s: Slot) => {
    setPicking(`${s.date}T${s.start}`); setErr(null)
    try {
      const res = await fetch('/api/gates/hold', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, paymentIntentId, gateKind, date: s.date, start: s.start }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(j.error || 'Could not hold that time.')
        if (j.code === 'slot_taken') await loadAvailability()   // someone grabbed it — refresh
        return
      }
      const h: Hold = { bookingId: j.bookingId, date: j.slot.date, start: j.slot.start, end: j.slot.end, timezone: j.slot.timezone }
      setHold(h); onBlockingChange(false); onHold?.(h)
    } catch {
      setErr('Could not hold that time. Try again.')
    } finally { setPicking(null) }
  }

  if (mode === 'none') return null

  const byDay = new Map<string, Slot[]>()
  for (const s of slots) { const a = byDay.get(s.date) ?? []; a.push(s); byDay.set(s.date, a) }

  return (
    <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 18, padding: '13px 16px 15px', marginBottom: 16 }}>
      <div style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 15, fontWeight: 600, color: INK, marginBottom: 4 }}>Book your shoot</div>

      {loading && <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12.5, color: SUB }}>Checking open shoot times…</div>}

      {!loading && mode === 'request' && (
        <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12.5, color: SUB, lineHeight: 1.5 }}>
          {userRequested
            ? 'Got it. You can pay now, and your team will reach out to set a shoot time that works for you.'
            : 'Your team will reach out to schedule the shoot after you order. No open times are posted right now, so we set the date together.'}
        </div>
      )}

      {!loading && mode === 'enforced' && hold && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: MINT_TINT, borderRadius: 12, padding: '11px 13px' }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: MINT, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600, color: INK }}>{fmtDayShort(hold.date)} · {fmtTime12(hold.start)}</div>
            <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11.5, color: SUB }}>Held for 30 min{hold.timezone ? ` · ${hold.timezone}` : ''}. Confirmed when you pay.</div>
          </div>
          <button onClick={() => { setHold(null); onBlockingChange(required); onHold?.(null) }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600, color: MINT_DARK, padding: 0 }}>Change</button>
        </div>
      )}

      {!loading && mode === 'enforced' && !hold && (
        <>
          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12.5, color: SUB, marginBottom: 10, lineHeight: 1.5 }}>Pick a time for your on-site shoot. This locks your date now, so there&apos;s no back-and-forth later.</div>
          {/* The typed plan date vs the horizon, out loud — never a silent August-for-January swap. */}
          {targetPastHorizon && (
            <div style={{ background: '#fdf6e9', border: '1px solid #f0dfb8', borderRadius: 12, padding: '10px 12px', marginBottom: 10, fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#854f0b', lineHeight: 1.5 }}>
              You planned around {fmtDayShort(targetDate!)}. Booking here only opens {horizonDays} days out, so that date is not on this list yet. Tap &quot;Ask for another time&quot; below and your team will set your date with you.
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 260, overflowY: 'auto' }}>
            {[...byDay.entries()].map(([day, daySlots]) => (
              <div key={day}>
                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 700, color: INK, marginBottom: 6 }}>{fmtDayShort(day)}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  {daySlots.map((s) => {
                    const key = `${s.date}T${s.start}`
                    return (
                      <button key={key} onClick={() => pick(s)} disabled={!!picking} style={{ fontFamily: 'Inter, sans-serif', fontSize: 12.5, fontWeight: 600, color: INK, background: '#fff', border: `1px solid ${LINE}`, borderRadius: 10, padding: '7px 11px', cursor: picking ? 'default' : 'pointer', opacity: picking && picking !== key ? 0.5 : 1 }}>
                        {picking === key ? 'Holding…' : fmtTime12(s.start)}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
          {tz && <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: FAINT, marginTop: 8 }}>Times shown in {tz}.{horizonDays ? ` Booking opens up to ${horizonDays} days out.` : ''}</div>}
          {/* The escape hatch: pay is never locked behind unsuitable slots. */}
          <button onClick={askAnotherTime} style={{ display: 'block', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 10, fontFamily: 'Inter, sans-serif', fontSize: 12.5, fontWeight: 700, color: MINT_DARK }}>
            None of these work? Ask for another time
          </button>
        </>
      )}

      {err && <div role="alert" style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600, color: '#b3462e', marginTop: 8 }}>{err}</div>}
    </div>
  )
}

/**
 * CustomGates — the generalized pre-checkout gates an admin authored for this campaign (Phase 4a):
 * AGREEMENT gates (check to acknowledge) and INPUT gates (answer a question) that must be cleared
 * before paying. Reports every answer up so the order records them; required-but-unanswered gates
 * keep the pay button blocked.
 */
function CustomGates({ gates, answers, onChange }: {
  gates: CustomGate[]
  answers: Record<string, string>
  onChange: (id: string, value: string) => void
}) {
  if (!gates.length) return null
  // Already answered in the cart, where these are now asked on the item. Asking again reads
  // as the first answer not having landed, so the whole block goes away rather than showing
  // pre-filled. The state still carries the answers; only the re-ask is gone.
  const unanswered = gates.filter((g) => !(answers[g.id] ?? '').trim())
  if (!unanswered.length) return null
  return (
    <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 18, padding: '13px 16px 15px', marginBottom: 16 }}>
      <div style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 15, fontWeight: 600, color: INK, marginBottom: 8 }}>Before you order</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {gates.map((g) => (
          <div key={g.id}>
            {g.kind === 'agreement' ? (
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, cursor: 'pointer' }}>
                <input type="checkbox" checked={answers[g.id] === 'agreed'} onChange={(e) => onChange(g.id, e.target.checked ? 'agreed' : '')} style={{ marginTop: 2, width: 16, height: 16, accentColor: MINT }} />
                <span>
                  <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600, color: INK }}>{g.title}{g.required ? '' : ' (optional)'}</span>
                  {g.why && <span style={{ display: 'block', fontFamily: 'Inter, sans-serif', fontSize: 11.5, color: SUB, marginTop: 2 }}>{g.why}</span>}
                </span>
              </label>
            ) : (
              <div>
                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600, color: INK, marginBottom: 4 }}>{g.title}{g.required ? '' : ' (optional)'}</div>
                {g.why && <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11.5, color: SUB, marginBottom: 6 }}>{g.why}</div>}
                {g.inputType === 'select' && g.options?.length ? (
                  <>
                    {/* Tappable rows, not a native select. Every option is readable at once,
                        which matters when one of them blocks the order: an owner should be
                        able to see the honest "no" without opening a menu to find it. Also
                        a far bigger tap target on a phone, where this is mostly used. */}
                    <div role="radiogroup" aria-label={g.title} style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                      {g.options.map((o) => {
                        const picked = (answers[g.id] ?? '') === o
                        const blocks = g.blockOn === o
                        return (
                          <button
                            key={o} type="button" role="radio" aria-checked={picked}
                            onClick={() => onChange(g.id, picked ? '' : o)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                              borderRadius: 13, padding: '11px 12px', cursor: 'pointer', font: 'inherit',
                              border: picked ? `1.5px solid ${blocks ? '#e0a13a' : MINT}` : `1px solid ${LINE}`,
                              background: picked ? (blocks ? '#fdf6e9' : '#f2fbf8') : '#fff',
                            }}
                          >
                            <span style={{
                              width: 18, height: 18, borderRadius: 99, flexShrink: 0,
                              border: picked ? 'none' : `1.5px solid ${LINE}`,
                              background: picked ? (blocks ? '#e0a13a' : MINT) : '#fff',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              {picked && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>}
                            </span>
                            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 13.5, fontWeight: picked ? 600 : 500, color: INK }}>{o}</span>
                          </button>
                        )
                      })}
                    </div>
                    {/* Asset check answered with the blocking option: say why, and give the honest
                        detour. The pay button stays locked; nothing is ever charged on this answer. */}
                    {g.blockOn && (answers[g.id] ?? '') === g.blockOn && (
                      <div style={{ background: '#fdf6e9', border: '1px solid #f0dfb8', borderRadius: 12, padding: '10px 12px', marginTop: 8, fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#854f0b', lineHeight: 1.5 }}>
                        {g.blockMessage || 'This order cannot go through with that answer.'}
                        {g.rerouteHref && (
                          <a href={g.rerouteHref} style={{ display: 'inline-block', marginLeft: 6, fontWeight: 700, color: '#854f0b' }}>{g.rerouteLabel || 'Talk to your team'}</a>
                        )}
                      </div>
                    )}
                  </>
                ) : g.inputType === 'textarea' ? (
                  <textarea value={answers[g.id] ?? ''} onChange={(e) => onChange(g.id, e.target.value)} rows={3} style={{ width: '100%', fontFamily: 'Inter, sans-serif', fontSize: 13, borderRadius: 12, border: `1px solid ${LINE}`, padding: '10px 11px', resize: 'vertical' }} />
                ) : (
                  <input value={answers[g.id] ?? ''} onChange={(e) => onChange(g.id, e.target.value)} style={{ width: '100%', fontFamily: 'Inter, sans-serif', fontSize: 13, borderRadius: 12, border: `1px solid ${LINE}`, padding: '10px 11px' }} />
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/** True while any REQUIRED custom gate is still unanswered (agreement unchecked / input empty),
 *  or an asset check was answered with its blocking option (work the buyer cannot receive). */
function customGatesBlocking(gates: CustomGate[], answers: Record<string, string>): boolean {
  return gates.some((g) => (g.required && !(answers[g.id] ?? '').trim()) || blockedGate([g], answers) !== null)
}

/** The first asset gate answered with its blocking option, if any. */
function blockedGate(gates: CustomGate[], answers: Record<string, string>): CustomGate | null {
  return gates.find((g) => g.blockOn && (answers[g.id] ?? '') === g.blockOn) ?? null
}

/** The execution patch that records the answered custom gates (keyed gate-<id>), so they reach the team. */
function gateExecutionPatch(gates: CustomGate[], answers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const g of gates) {
    const v = (answers[g.id] ?? '').trim()
    if (!v) continue
    const key = g.id.startsWith('gate-') ? g.id : `gate-${g.id}`
    out[key] = g.kind === 'agreement' ? `Agreed: ${g.title}` : v
  }
  return out
}

function PayForm({ clientId, draft, restaurant, producerChoices, initialGateAnswers, paymentIntentId, initialBreakdown, monthlyCents, setupOnly, savedCard, gates, onPlaced }: {
  clientId: string
  initialGateAnswers?: Record<string, string>
  draft: CampaignDraft
  restaurant?: string
  producerChoices?: Record<string, PieceProducer>
  paymentIntentId: string
  initialBreakdown: Breakdown
  monthlyCents: number
  /** Monthly-only order: the clientSecret is a SetupIntent (save the card, no charge today). */
  setupOnly?: boolean
  savedCard: SavedCard | null
  gates?: ResolvedGates
  onPlaced: (campaignId: string, breakdown: Breakdown, bookedSlot?: Hold | null) => void
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [bill, setBill] = useState<Breakdown>(initialBreakdown)
  const [taxPending, setTaxPending] = useState(!setupOnly && initialBreakdown.taxCents === 0)
  // 'saved' = one-tap card on file; 'new' = enter a card. Default to the saved card when there is one.
  const [mode, setMode] = useState<'saved' | 'new'>(savedCard ? 'saved' : 'new')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // A retry after a partial failure must never double-charge or double-ship: these gate each stage.
  const paidRef = useRef(false)
  const shippedIdRef = useRef<string | null>(null)
  const billing = useRef<{ name?: string; address?: Record<string, unknown> }>({})
  const taxSeq = useRef(0)
  // Pre-checkout gates (Phase 4a): the booking gate (shoot) blocks until a slot is held; custom
  // agreement/input gates block until answered. `bookingBlocking` starts true when a required booking
  // gate applies, so the button waits until availability resolves.
  const customGates = gates?.custom ?? []
  const [bookingBlocking, setBookingBlocking] = useState(!!gates?.booking?.required)
  // Seeded from the cart, where these questions are now asked ON the item. Checkout keeps
  // the state (gateExecutionPatch persists it, gateBlocking gates the pay button) but must
  // not ASK again: answering the same question twice reads as the first answer not landing.
  const [gateAnswers, setGateAnswers] = useState<Record<string, string>>(initialGateAnswers ?? {})
  // The shoot slot currently held (if any), so the confirmation can replay exactly what was booked.
  const [heldSlot, setHeldSlot] = useState<Hold | null>(null)
  // Monthly consent (G4): a plan with recurring services starts a real subscription from this card at
  // checkout, so the client must explicitly agree to the $X/mo before we place the order.
  const needsMonthlyConsent = monthlyCents > 0
  const [monthlyConsent, setMonthlyConsent] = useState(false)
  // Pass-through costs in plain words + the real monthly total including known ad-spend minimums,
  // shown ON the bill and INSIDE the consent so the agreed number is the real number.
  const rawCostNotes = passthroughNotesForLines(draft.items)
  const costNotes = rawCostNotes.map(plainCostNote)
  const adSpendMinCents = passthroughMonthlyMinimumCents(rawCostNotes)
  const gateBlocking = bookingBlocking || customGatesBlocking(customGates, gateAnswers) || (needsMonthlyConsent && !monthlyConsent)

  // Recompute tax + update the charge when the billing address is complete (new-card path).
  // A setup-only (monthly-only) order charges nothing today, so there is no tax to compute.
  const onAddress = async (e: StripeAddressElementChangeEvent) => {
    billing.current = { name: e.value.name, address: e.value.address as unknown as Record<string, unknown> }
    if (!e.complete || setupOnly) return
    const seq = ++taxSeq.current
    try {
      const res = await fetch('/api/checkout/tax', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentIntentId, address: e.value.address }),
      })
      const j = (await res.json().catch(() => ({}))) as { breakdown?: Breakdown }
      if (seq === taxSeq.current && j.breakdown) { setBill(j.breakdown); setTaxPending(false) }
    } catch { /* keep the last shown total; the charge uses the server's authoritative amount */ }
  }

  // Ship the campaign (once) + link the payment, then hand off. Shared by both charge paths.
  const finishOrder = async () => {
    if (!shippedIdRef.current) {
      setStatus('Placing your order…')
      try {
        shippedIdRef.current = await saveAndShip({ clientId, draft, producerChoices, paymentIntentId })
      } catch {
        setError('Your card was charged but we hit a snag placing the order. Tap Finish to try again — you will not be charged twice.')
        setBusy(false); setStatus('Finish placing your order'); return
      }
      // Record the answered custom gates onto the campaign so the team sees them. Best-effort.
      const patch = gateExecutionPatch(customGates, gateAnswers)
      if (Object.keys(patch).length) {
        fetch(`/api/campaigns/${shippedIdRef.current}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { execution: patch } }) }).catch(() => {})
      }
    }
    setStatus('Finishing up…')
    try {
      await fetch('/api/checkout/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentIntentId, campaignId: shippedIdRef.current }),
      })
    } catch { /* order is shipped + paid; the webhook backstop reconciles the link */ }
    onPlaced(shippedIdRef.current!, bill, heldSlot)
  }

  const blockReason = bookingBlocking ? 'Pick a shoot time first'
    : blockedGate(customGates, gateAnswers) ? 'This cannot be ordered yet'
    : customGatesBlocking(customGates, gateAnswers) ? 'Answer the questions above'
    : (needsMonthlyConsent && !monthlyConsent) ? 'Agree to the monthly charge'
    : null

  const placeOrder = async () => {
    if (!stripe || busy) return
    // Pre-pay gates: a held shoot slot, answered custom gates, and monthly consent must all clear.
    if (gateBlocking) { setError(blockReason ? `${blockReason} to continue.` : 'Complete the steps above to continue.'); return }
    setBusy(true); setError(null)

    // Already paid on a prior attempt → don't charge again, just finish placing the order.
    if (paidRef.current || shippedIdRef.current) { await finishOrder(); return }

    if (mode === 'saved') {
      setStatus(setupOnly ? 'Setting up your card…' : 'Charging your card…')
      try {
        const res = await fetch('/api/checkout/confirm-saved', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paymentIntentId }),
        })
        const j = (await res.json().catch(() => ({}))) as { status?: string; clientSecret?: string; error?: string }
        if (j.status === 'requires_action' && j.clientSecret) {
          const { error: naErr, paymentIntent, setupIntent } = await stripe.handleNextAction({ clientSecret: j.clientSecret })
          const done = setupOnly ? setupIntent?.status === 'succeeded' : paymentIntent?.status === 'succeeded'
          if (naErr || !done) { setError(naErr?.message || 'We couldn’t verify that card. Try a different card.'); setBusy(false); setStatus(null); return }
        } else if (j.status !== 'succeeded') {
          setError(j.error || 'That card was declined. Try a different card.'); setBusy(false); setStatus(null); return
        }
      } catch {
        setError('Payment didn’t go through. You were not charged.'); setBusy(false); setStatus(null); return
      }
      paidRef.current = true
      await finishOrder(); return
    }

    // New-card path (Stripe Payment Element).
    if (!elements) { setBusy(false); return }
    setStatus(setupOnly ? 'Setting up your card…' : 'Charging your card…')
    const { error: submitErr } = await elements.submit()
    if (submitErr) { setError(submitErr.message || 'Please check your card details.'); setBusy(false); setStatus(null); return }
    if (setupOnly) {
      // Monthly-only order: SAVE the card (SetupIntent). No charge today — the subscription
      // bills this card right after the order ships.
      const { error: setupErr, setupIntent } = await stripe.confirmSetup({
        elements,
        redirect: 'if_required',
        confirmParams: {
          return_url: `${window.location.origin}/dashboard/campaigns`,
          payment_method_data: { billing_details: { name: billing.current.name, address: billing.current.address as never } },
        },
      })
      if (setupErr) { setError(setupErr.message || 'We couldn’t save that card. You were not charged.'); setBusy(false); setStatus(null); return }
      if (!setupIntent || setupIntent.status !== 'succeeded') { setError('Card setup didn’t complete. You were not charged.'); setBusy(false); setStatus(null); return }
      paidRef.current = true
      await finishOrder(); return
    }
    const { error: payErr, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
      confirmParams: {
        return_url: `${window.location.origin}/dashboard/campaigns`,
        payment_method_data: { billing_details: { name: billing.current.name, address: billing.current.address as never } },
      },
    })
    if (payErr) { setError(payErr.message || 'That payment didn’t go through. You were not charged.'); setBusy(false); setStatus(null); return }
    if (!paymentIntent || paymentIntent.status !== 'succeeded') { setError('Payment didn’t complete. You were not charged.'); setBusy(false); setStatus(null); return }
    paidRef.current = true
    await finishOrder()
  }

  return (
    <>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 18px 16px' }}>
        {restaurant && <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12.5, color: SUB, marginBottom: 10 }}>Placing your order for <span style={{ fontWeight: 600, color: INK }}>{restaurant}</span></div>}
        <BookingGate clientId={clientId} paymentIntentId={paymentIntentId} booking={gates?.booking ?? null} targetDate={draft.targetDate ?? null} onBlockingChange={setBookingBlocking} onHold={setHeldSlot} />
        <CustomGates gates={customGates} answers={gateAnswers} onChange={(id, value) => setGateAnswers((a) => ({ ...a, [id]: value }))} />
        <BillCard b={bill} monthlyCents={monthlyCents} taxPending={mode === 'new' && taxPending} costNotes={costNotes} setupOnly={setupOnly} adSpendMinCents={adSpendMinCents} />
        {needsMonthlyConsent && (
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, cursor: 'pointer', background: '#fff', border: `1px solid ${LINE}`, borderRadius: 14, padding: '12px 14px', marginBottom: 16 }}>
            <input type="checkbox" checked={monthlyConsent} onChange={(e) => setMonthlyConsent(e.target.checked)} style={{ marginTop: 2, width: 16, height: 16, accentColor: MINT, flexShrink: 0 }} />
            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12.5, color: INK, lineHeight: 1.5 }}>
              I agree to <b style={{ fontWeight: 700 }}>{fmt(monthlyCents)}/mo</b> for monthly services starting today, billed to this card each month. Cancel anytime.
              {adSpendMinCents > 0 && (
                <span style={{ display: 'block', color: SUB, marginTop: 3 }}>
                  Ad money is extra, paid at cost. With ad spend, plan on about <b style={{ fontWeight: 700, color: INK }}>{fmt(monthlyCents + adSpendMinCents)}+/mo</b>.
                </span>
              )}
            </span>
          </label>
        )}

        {mode === 'saved' && savedCard ? (
          <>
            <div style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 14, fontWeight: 600, color: INK, margin: '2px 0 8px' }}>Payment</div>
            <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 16, padding: '14px 15px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 11 }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(74,189,152,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={MINT_DARK} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13.5, fontWeight: 600, color: INK }}>{brandLabel(savedCard.brand)} ·· {savedCard.last4}</div>
                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11.5, color: SUB }}>Card on file</div>
              </div>
            </div>
            <button onClick={() => { setMode('new'); setError(null) }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: 12.5, fontWeight: 600, color: MINT_DARK, padding: 0, marginBottom: 14 }}>Use a different card</button>
          </>
        ) : (
          <>
            <div style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 14, fontWeight: 600, color: INK, margin: '2px 0 8px' }}>Billing address</div>
            <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 16, padding: '14px 14px 6px', marginBottom: 16 }}>
              <AddressElement options={{ mode: 'billing' }} onChange={onAddress} />
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '2px 0 8px' }}>
              <span style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 14, fontWeight: 600, color: INK }}>Card</span>
              {savedCard && <button onClick={() => { setMode('saved'); setError(null) }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600, color: MINT_DARK, padding: 0 }}>Use card on file</button>}
            </div>
            <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 16, padding: '14px', marginBottom: 12 }}>
              <PaymentElement options={{ fields: { billingDetails: { name: 'never', address: 'never' } } }} />
            </div>
          </>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'Inter, sans-serif', fontSize: 11, color: SUB }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={SUB} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
          Your card is handled by Stripe. Apnosh never sees your card number.
        </div>
      </div>

      <div style={{ flexShrink: 0, background: '#fff', borderTop: `1px solid ${LINE}`, boxShadow: '0 -10px 28px rgba(20,40,30,0.10)', padding: '11px 18px calc(12px + env(safe-area-inset-bottom))' }}>
        {error && <div role="alert" style={{ fontFamily: 'Inter, sans-serif', fontSize: 12.5, fontWeight: 600, color: '#b3462e', textAlign: 'center', marginBottom: 8, lineHeight: 1.4 }}>{error}</div>}
        <button
          onClick={placeOrder}
          disabled={busy || !stripe || gateBlocking}
          style={{ width: '100%', height: 52, borderRadius: 26, border: 'none', cursor: busy || !stripe || gateBlocking ? 'default' : 'pointer', background: busy ? MINT_DARK : (gateBlocking ? FAINT : MINT), color: '#fff', fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 16, fontWeight: 600, boxShadow: gateBlocking ? 'none' : '0 8px 22px rgba(74,189,152,0.42)' }}
        >
          {busy ? (status ?? 'Working…') : gateBlocking ? (blockReason ?? 'Complete the steps above') : setupOnly ? `Place order · ${fmt(monthlyCents)}/mo` : `Place order · ${fmt(bill.totalCents)}`}
        </button>
        <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: SUB, textAlign: 'center', marginTop: 8 }}>{setupOnly ? 'Your monthly services bill to this card starting today. Your campaign starts right after.' : 'Your card is charged now. Your campaign starts right after.'}</div>
      </div>
    </>
  )
}

function FreeCheckout({ clientId, draft, producerChoices, gates, initialGateAnswers, onPlaced }: { clientId: string; initialGateAnswers?: Record<string, string>; draft: CampaignDraft; producerChoices?: Record<string, PieceProducer>; gates?: ResolvedGates; onPlaced: (id: string, breakdown: Breakdown) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const customGates = gates?.custom ?? []
  // Seeded from the cart, where these questions are now asked ON the item. Checkout keeps
  // the state (gateExecutionPatch persists it, gateBlocking gates the pay button) but must
  // not ASK again: answering the same question twice reads as the first answer not landing.
  const [gateAnswers, setGateAnswers] = useState<Record<string, string>>(initialGateAnswers ?? {})
  const blocked = customGatesBlocking(customGates, gateAnswers)
  const place = async () => {
    if (busy || blocked) return
    setBusy(true); setError(null)
    try {
      const id = await saveAndShip({ clientId, draft, producerChoices })
      const patch = gateExecutionPatch(customGates, gateAnswers)
      if (Object.keys(patch).length) fetch(`/api/campaigns/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { execution: patch } }) }).catch(() => {})
      onPlaced(id, { subtotalCents: 0, serviceFeeCents: 0, taxCents: 0, totalCents: 0 })
    } catch (e) {
      // Surface the server's own reason when it has one (e.g. a coming-soon 409), never a mystery.
      const msg = e instanceof Error && e.message ? e.message : ''
      setError(msg || 'That didn’t go through. Nothing was ordered. Try again.'); setBusy(false)
    }
  }
  return (
    <>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 18px 16px' }}>
        <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 18, padding: '14px 16px', marginBottom: 16 }}>
          <div style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 15, fontWeight: 600, color: INK, marginBottom: 6 }}>Order summary</div>
          <BillRow label="Total due today" value="Free" strong />
          {/* The free path only fires when there is NO monthly bill (a monthly-only cart goes
              through the card + consent path instead), so this bill is genuinely $0. */}
        </div>
        <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: SUB, lineHeight: 1.5, marginBottom: 16 }}>Everything in this plan is on you to run, so there’s nothing to pay now. Placing the order starts your campaign.</div>
        <CustomGates gates={customGates} answers={gateAnswers} onChange={(id, value) => setGateAnswers((a) => ({ ...a, [id]: value }))} />
      </div>
      <div style={{ flexShrink: 0, background: '#fff', borderTop: `1px solid ${LINE}`, boxShadow: '0 -10px 28px rgba(20,40,30,0.10)', padding: '11px 18px calc(12px + env(safe-area-inset-bottom))' }}>
        {error && <div role="alert" style={{ fontFamily: 'Inter, sans-serif', fontSize: 12.5, fontWeight: 600, color: '#b3462e', textAlign: 'center', marginBottom: 8 }}>{error}</div>}
        <button onClick={place} disabled={busy || blocked} style={{ width: '100%', height: 52, borderRadius: 26, border: 'none', cursor: busy || blocked ? 'default' : 'pointer', background: busy ? MINT_DARK : (blocked ? FAINT : MINT), color: '#fff', fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 16, fontWeight: 600, boxShadow: blocked ? 'none' : '0 8px 22px rgba(74,189,152,0.42)' }}>{busy ? 'Placing your order…' : blocked ? (blockedGate(customGates, gateAnswers) ? 'This cannot be ordered yet' : 'Answer the questions above') : 'Place order'}</button>
      </div>
    </>
  )
}

/**
 * Confirmation — the "Order confirmed" screen after the charge + ship succeed (Amazon-style): a
 * success moment, a plain-language timeline (placed → we get to work → goes live), a receipt of
 * what was actually paid, and the handoff into the "A few things from you" setup page. The go-live
 * estimate is the real one (goLivePhraseFor over the ordered items), not an invented date.
 */
function Confirmation({ restaurant, draft, breakdown, setupOnly, bookedSlot, onSetup, onViewCampaign }: {
  restaurant?: string
  draft: CampaignDraft
  breakdown: Breakdown
  /** Monthly-only order: nothing paid today, the subscription bills the saved card. */
  setupOnly?: boolean
  /** The shoot slot locked at checkout (if any) — replayed here so the owner sees what they booked. */
  bookedSlot?: Hold | null
  onSetup: () => void
  onViewCampaign: () => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const billSum = summarize(draft.items)
  const monthlyCents = Math.round(billSum.perMonth * 100)
  const goLive = goLivePhraseFor(draft, { creatives: [], services: draft.items, bill: billSum }, today)
  const goLiveShort = goLive.replace(/^Live in /, '').replace(/^Starts in /, '')
  const todayLabel = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const free = breakdown.totalCents <= 0 && !setupOnly
  // The "help us start faster" blurb reflects what THIS order actually needs: no "best time to
  // film" on an order with no filming, and a booked slot means the film time is already set.
  const needsFilm = draftNeedsShoot(draft) && !bookedSlot
  const setupBlurb = needsFilm
    ? 'Your go-live date, the best time to film, and the dishes to feature. Takes a minute, and you can do it later too.'
    : 'Your go-live date and a few quick details. Takes a minute, and you can do it later too.'

  const steps: { state: 'done' | 'active' | 'todo'; title: string; sub: string }[] = [
    { state: 'done', title: 'Order placed', sub: todayLabel },
    ...(bookedSlot ? [{ state: 'done' as const, title: 'Shoot booked', sub: `${fmtDayShort(bookedSlot.date)} · ${fmtTime12(bookedSlot.start)}${bookedSlot.timezone ? ` (${bookedSlot.timezone})` : ''}` }] : []),
    { state: 'active', title: 'We get to work', sub: 'Your team starts right away' },
    { state: 'todo', title: 'Goes live', sub: goLiveShort || 'We confirm the date once we start' },
  ]

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '28px 18px 16px' }}>
        {/* success moment */}
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ width: 62, height: 62, margin: '0 auto 12px', borderRadius: '50%', background: `linear-gradient(135deg, ${MINT}, ${MINT_DARK})`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 12px 30px -8px rgba(74,189,152,0.55)' }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
          </div>
          <div style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 24, fontWeight: 700, color: INK, letterSpacing: -0.4 }}>Order confirmed</div>
          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13.5, color: SUB, marginTop: 4 }}>{restaurant ? `${restaurant}’s campaign is on the way.` : 'Your campaign is on the way.'}</div>
        </div>

        {/* timeline */}
        <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 18, padding: '16px 16px 6px', marginBottom: 14 }}>
          <div style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 15, fontWeight: 600, color: INK, marginBottom: 12 }}>What happens next</div>
          {steps.map((s, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ width: 22, height: 22, borderRadius: 11, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: s.state === 'todo' ? '#fff' : MINT, border: s.state === 'todo' ? `2px solid ${LINE}` : 'none' }}>
                  {s.state === 'done' && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>}
                  {s.state === 'active' && <div style={{ width: 8, height: 8, borderRadius: 4, background: '#fff' }} />}
                </div>
                {i < steps.length - 1 && <div style={{ width: 2, flex: 1, minHeight: 18, background: LINE, margin: '2px 0' }} />}
              </div>
              <div style={{ flex: 1, minWidth: 0, paddingBottom: 14 }}>
                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 600, color: INK }}>{s.title}</div>
                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12.5, color: s.state === 'todo' ? FAINT : SUB, marginTop: 1 }}>{s.sub}</div>
              </div>
            </div>
          ))}
        </div>

        {/* what you paid */}
        <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 18, padding: '14px 16px', marginBottom: 14 }}>
          <div style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 15, fontWeight: 600, color: INK, marginBottom: 8 }}>{free || setupOnly ? 'Order summary' : 'Paid today'}</div>
          {setupOnly ? (
            <>
              <BillRow label="Monthly services" value={`${fmt(monthlyCents)}/mo`} />
              <div style={{ borderTop: `1px solid ${LINE}`, marginTop: 4 }}><BillRow label="First month, billed today" value={fmt(monthlyCents)} strong /></div>
            </>
          ) : free ? (
            <BillRow label="Total" value="Free" strong />
          ) : (
            <>
              <BillRow label="Subtotal" value={fmt(breakdown.subtotalCents)} />
              {breakdown.serviceFeeCents > 0 && <BillRow label="Service fee (10%)" value={fmt(breakdown.serviceFeeCents)} />}
              {breakdown.taxCents > 0 && <BillRow label="Tax" value={fmt(breakdown.taxCents)} />}
              <div style={{ borderTop: `1px solid ${LINE}`, marginTop: 4 }}><BillRow label="Total paid" value={fmt(breakdown.totalCents)} strong /></div>
            </>
          )}
          {/* Every path with a monthly took a card + consent at checkout (paid orders save the card
              on the charge; monthly-only orders save it on a SetupIntent) — say exactly what bills. */}
          {monthlyCents > 0 && <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11.5, color: SUB, marginTop: 8 }}>{setupOnly ? 'Billed to your card each month starting today. Cancel anytime.' : `Plus ${fmt(monthlyCents)}/mo in monthly services, billed to this card starting today.`}</div>}
        </div>

        {/* needs-you handoff */}
        <div style={{ background: MINT_TINT, borderRadius: 16, padding: '13px 15px', display: 'flex', gap: 11, alignItems: 'flex-start' }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={MINT_DARK} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13.5, fontWeight: 600, color: INK }}>A few things from you help us start faster</div>
            <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#3f7d6a', marginTop: 2, lineHeight: 1.5 }}>{setupBlurb}</div>
          </div>
        </div>
      </div>

      <div style={{ flexShrink: 0, background: '#fff', borderTop: `1px solid ${LINE}`, boxShadow: '0 -10px 28px rgba(20,40,30,0.10)', padding: '11px 18px calc(12px + env(safe-area-inset-bottom))' }}>
        <button onClick={onSetup} style={{ width: '100%', height: 52, borderRadius: 26, border: 'none', cursor: 'pointer', background: MINT, color: '#fff', fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 8px 22px rgba(74,189,152,0.42)' }}>
          A few things from you
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
        </button>
        <button onClick={onViewCampaign} style={{ display: 'block', width: '100%', height: 44, marginTop: 8, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: 13.5, fontWeight: 600, color: SUB }}>View campaign</button>
      </div>
    </div>
  )
}
