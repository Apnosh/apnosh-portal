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
import type { CampaignDraft } from '@/lib/campaigns/types'

const MINT = '#4abd98'
const MINT_DARK = '#3f7d6a'
const INK = '#14231c'
const SUB = '#6b746e'
const LINE = 'rgba(20,35,28,0.10)'
const BG = '#fbfcfb'

function fmt(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}

interface Breakdown { subtotalCents: number; serviceFeeCents: number; taxCents: number; totalCents: number }
interface SavedCard { brand: string; last4: string }
interface PrepareResult {
  free?: boolean
  paymentIntentId?: string
  clientSecret?: string
  publishableKey?: string | null
  breakdown: Breakdown
  monthlyCents?: number
  savedCard?: SavedCard | null
}

export interface CampaignCheckoutProps {
  clientId: string
  draft: CampaignDraft
  restaurant?: string
  onSuccess: (campaignId: string) => void
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

export default function CampaignCheckout({ clientId, draft, restaurant, onSuccess, onCancel }: CampaignCheckoutProps) {
  const [prep, setPrep] = useState<PrepareResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)

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
        <Header onBack={onCancel} />
        {error && !prep && <ErrorBox message={error} onBack={onCancel} />}
        {!error && !prep && <Loading />}
        {prep?.free && <FreeCheckout clientId={clientId} draft={draft} monthlyCents={prep.monthlyCents ?? 0} onSuccess={onSuccess} />}
        {prep && !prep.free && prep.clientSecret && prep.publishableKey && (
          <Elements
            stripe={stripePromiseFor(prep.publishableKey)}
            options={{ clientSecret: prep.clientSecret, appearance: { theme: 'flat', variables: { colorPrimary: MINT, fontFamily: 'Inter, sans-serif', borderRadius: '12px' } } }}
          >
            <PayForm
              clientId={clientId}
              draft={draft}
              restaurant={restaurant}
              paymentIntentId={prep.paymentIntentId!}
              initialBreakdown={prep.breakdown}
              monthlyCents={prep.monthlyCents ?? 0}
              savedCard={prep.savedCard ?? null}
              onSuccess={onSuccess}
            />
          </Elements>
        )}
        {prep && !prep.free && (!prep.clientSecret || !prep.publishableKey) && (
          <ErrorBox message="Payments aren’t configured yet (missing Stripe keys). Add the Stripe keys and try again." onBack={onCancel} />
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

function BillCard({ b, monthlyCents, taxPending }: { b: Breakdown; monthlyCents: number; taxPending: boolean }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 18, padding: '13px 16px 15px', marginBottom: 16 }}>
      <div style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 15, fontWeight: 600, color: INK, marginBottom: 6 }}>Order summary</div>
      <BillRow label="Subtotal" value={fmt(b.subtotalCents)} />
      <BillRow label="Service fee (10%)" value={fmt(b.serviceFeeCents)} />
      <BillRow label="Tax" value={taxPending ? 'Enter address' : fmt(b.taxCents)} muted={taxPending} />
      {monthlyCents > 0 && <BillRow label="Monthly services" value={`${fmt(monthlyCents)}/mo`} muted />}
      <div style={{ borderTop: `1px solid ${LINE}`, marginTop: 4 }}>
        <BillRow label="Total due today" value={fmt(b.totalCents)} strong />
      </div>
      {monthlyCents > 0 && <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: SUB, marginTop: 6 }}>Monthly services are billed separately once they start.</div>}
    </div>
  )
}

const CARD_BRANDS: Record<string, string> = { visa: 'Visa', mastercard: 'Mastercard', amex: 'Amex', discover: 'Discover', diners: 'Diners', jcb: 'JCB', unionpay: 'UnionPay' }
const brandLabel = (b: string) => CARD_BRANDS[b?.toLowerCase()] ?? (b ? b[0].toUpperCase() + b.slice(1) : 'Card')

function PayForm({ clientId, draft, restaurant, paymentIntentId, initialBreakdown, monthlyCents, savedCard, onSuccess }: {
  clientId: string
  draft: CampaignDraft
  restaurant?: string
  paymentIntentId: string
  initialBreakdown: Breakdown
  monthlyCents: number
  savedCard: SavedCard | null
  onSuccess: (campaignId: string) => void
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [bill, setBill] = useState<Breakdown>(initialBreakdown)
  const [taxPending, setTaxPending] = useState(initialBreakdown.taxCents === 0)
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

  // Recompute tax + update the charge when the billing address is complete (new-card path).
  const onAddress = async (e: StripeAddressElementChangeEvent) => {
    billing.current = { name: e.value.name, address: e.value.address as unknown as Record<string, unknown> }
    if (!e.complete) return
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
        shippedIdRef.current = await saveAndShip({ clientId, draft })
      } catch {
        setError('Your card was charged but we hit a snag placing the order. Tap Finish to try again — you will not be charged twice.')
        setBusy(false); setStatus('Finish placing your order'); return
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
    onSuccess(shippedIdRef.current!)
  }

  const placeOrder = async () => {
    if (!stripe || busy) return
    setBusy(true); setError(null)

    // Already paid on a prior attempt → don't charge again, just finish placing the order.
    if (paidRef.current || shippedIdRef.current) { await finishOrder(); return }

    if (mode === 'saved') {
      setStatus('Charging your card…')
      try {
        const res = await fetch('/api/checkout/confirm-saved', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paymentIntentId }),
        })
        const j = (await res.json().catch(() => ({}))) as { status?: string; clientSecret?: string; error?: string }
        if (j.status === 'requires_action' && j.clientSecret) {
          const { error: naErr, paymentIntent } = await stripe.handleNextAction({ clientSecret: j.clientSecret })
          if (naErr || paymentIntent?.status !== 'succeeded') { setError(naErr?.message || 'We couldn’t verify that card. Try a different card.'); setBusy(false); setStatus(null); return }
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
    setStatus('Charging your card…')
    const { error: submitErr } = await elements.submit()
    if (submitErr) { setError(submitErr.message || 'Please check your card details.'); setBusy(false); setStatus(null); return }
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
        <BillCard b={bill} monthlyCents={monthlyCents} taxPending={mode === 'new' && taxPending} />

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
          disabled={busy || !stripe}
          style={{ width: '100%', height: 52, borderRadius: 26, border: 'none', cursor: busy || !stripe ? 'default' : 'pointer', background: busy ? MINT_DARK : MINT, color: '#fff', fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 16, fontWeight: 600, boxShadow: '0 8px 22px rgba(74,189,152,0.42)' }}
        >
          {busy ? (status ?? 'Working…') : `Place order · ${fmt(bill.totalCents)}`}
        </button>
        <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: SUB, textAlign: 'center', marginTop: 8 }}>Your card is charged now. Your campaign starts right after.</div>
      </div>
    </>
  )
}

function FreeCheckout({ clientId, draft, monthlyCents, onSuccess }: { clientId: string; draft: CampaignDraft; monthlyCents: number; onSuccess: (id: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const place = async () => {
    if (busy) return
    setBusy(true); setError(null)
    try {
      const id = await saveAndShip({ clientId, draft })
      onSuccess(id)
    } catch {
      setError('That didn’t go through. Nothing was ordered. Try again.'); setBusy(false)
    }
  }
  return (
    <>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 18px 16px' }}>
        <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 18, padding: '14px 16px', marginBottom: 16 }}>
          <div style={{ fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 15, fontWeight: 600, color: INK, marginBottom: 6 }}>Order summary</div>
          <BillRow label="Total due today" value="Free" strong />
          {monthlyCents > 0 && <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11.5, color: SUB, marginTop: 8 }}>{fmt(monthlyCents)}/mo in monthly services starts once set up — billed separately.</div>}
        </div>
        <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: SUB, lineHeight: 1.5 }}>Everything in this plan is on you to run, so there’s nothing to pay now. Placing the order starts your campaign.</div>
      </div>
      <div style={{ flexShrink: 0, background: '#fff', borderTop: `1px solid ${LINE}`, boxShadow: '0 -10px 28px rgba(20,40,30,0.10)', padding: '11px 18px calc(12px + env(safe-area-inset-bottom))' }}>
        {error && <div role="alert" style={{ fontFamily: 'Inter, sans-serif', fontSize: 12.5, fontWeight: 600, color: '#b3462e', textAlign: 'center', marginBottom: 8 }}>{error}</div>}
        <button onClick={place} disabled={busy} style={{ width: '100%', height: 52, borderRadius: 26, border: 'none', cursor: busy ? 'default' : 'pointer', background: busy ? MINT_DARK : MINT, color: '#fff', fontFamily: "'Cal Sans', Poppins, sans-serif", fontSize: 16, fontWeight: 600, boxShadow: '0 8px 22px rgba(74,189,152,0.42)' }}>{busy ? 'Placing your order…' : 'Place order'}</button>
      </div>
    </>
  )
}
