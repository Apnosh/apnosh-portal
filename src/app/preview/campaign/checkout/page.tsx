'use client'

/**
 * /preview/campaign/checkout — the REAL free-checkout seal + confirmation screens on a fixture
 * draft, for the Strategist's Desk verification (DESK-6) without a signed-in account.
 *
 * Same components as production (FreeCheckout, Confirmation, BillCard — exported for exactly
 * this). The seal genuinely fires saveAndShip, which fails unauthenticated: that failure IS part
 * of the verification (error surfaces, the seal remounts for another try). The Confirmation view
 * is reached by the toggle, since nothing can truly ship here.
 *
 * "The card" is the bill the paid rail draws. PayForm itself cannot mount here — it is a Stripe
 * Elements child and needs a live client secret — but BillCard is the whole receipt inside it,
 * and it is the part the tax rows live on. Three fixtures, because the three are different
 * sentences: a one-time bill with a monthly line and a KNOWN monthly tax, the same bill with a
 * NULL monthly tax ("plus tax", the honest answer when Stripe Tax could not price it), and the
 * monthly-only order that charges the first month today.
 */
import { useState } from 'react'
import { BillCard, FreeCheckout, InvoiceCheckout, Confirmation } from '@/components/mvp/campaign-builder/campaign-checkout'
import { DeskKeyframes, paperGround } from '@/components/campaigns/desk/ui'
import type { CampaignDraft } from '@/lib/campaigns/types'

const DRAFT = {
  name: 'Get found on Google',
  goalKey: 'new-customers',
  sourceCatalogId: 'gbp',
  items: [
    { id: 'gbp-1', name: 'Google profile polish', serviceId: 'gbp-optimization', price: 0, qty: 1, included: true, producer: 'diy', cadence: { kind: 'once' } },
    { id: 'gbp-2', name: 'Weekly Google posts', serviceId: 'gbp-posts', price: 0, qty: 1, included: true, producer: 'diy', cadence: { kind: 'once' } },
  ],
} as unknown as CampaignDraft

/** The bill the server would hand this screen: $655 of work, the 10% fee, $59.87 of tax. */
const BREAKDOWN = { subtotalCents: 65500, serviceFeeCents: 6550, taxCents: 5987, totalCents: 78037 }
const MONTHLY_CENTS = 11500
/** What Stripe Tax priced the monthly line at. Null is the other real answer. */
const MONTHLY_TAX_CENTS = 1051

export default function PreviewCheckoutPage() {
  const [view, setView] = useState<'free' | 'card' | 'invoice' | 'confirmed' | 'invoiced'>('free')
  return (
    <div style={{ position: 'fixed', inset: 0, ...paperGround, display: 'flex', justifyContent: 'center' }}>
      <DeskKeyframes />
      <div style={{ width: '100%', maxWidth: 480, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ flexShrink: 0, display: 'flex', gap: 8, padding: '12px 18px 8px', overflowX: 'auto' }}>
          {(['free', 'card', 'invoice', 'confirmed', 'invoiced'] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} style={{ flex: 'none', fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 999, cursor: 'pointer', border: '1px solid #E4E0D6', background: view === v ? '#EAF6F1' : '#fff', color: view === v ? '#2E9A78' : '#4A554F' }}>
              {v === 'free' ? 'The seal' : v === 'card' ? 'The card' : v === 'invoice' ? 'On invoice' : v === 'confirmed' ? 'The confirmation' : 'Invoice confirmed'}
            </button>
          ))}
        </div>
        {view === 'free' ? (
          <FreeCheckout clientId="preview-no-account" draft={DRAFT} onPlaced={() => setView('confirmed')} />
        ) : view === 'card' ? (
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 18px 24px' }}>
            <Label text="Tax priced. The monthly and its tax are both numbers." />
            <BillCard b={BREAKDOWN} monthlyCents={MONTHLY_CENTS} monthlyTaxCents={MONTHLY_TAX_CENTS} taxPending={false} costNotes={['ad spend, paid at cost']} />
            <Label text="Stripe Tax could not price the monthly. It says so, and the total says plus tax." />
            <BillCard b={BREAKDOWN} monthlyCents={MONTHLY_CENTS} monthlyTaxCents={null} taxPending={false} />
            <Label text="No address yet, so the one-time tax is not known either." />
            <BillCard b={{ ...BREAKDOWN, taxCents: 0, totalCents: 72050 }} monthlyCents={MONTHLY_CENTS} monthlyTaxCents={null} taxPending />
            <Label text="Monthly only. Nothing one-time, the first month charged today." />
            <BillCard b={{ subtotalCents: 0, serviceFeeCents: 0, taxCents: 0, totalCents: 0 }} monthlyCents={MONTHLY_CENTS} monthlyTaxCents={MONTHLY_TAX_CENTS} taxPending={false} setupOnly />
          </div>
        ) : view === 'invoice' ? (
          <InvoiceCheckout clientId="preview-no-account" draft={DRAFT} breakdown={{ ...BREAKDOWN, taxCents: 0, totalCents: 72050 }} monthlyCents={MONTHLY_CENTS} onPlaced={() => setView('invoiced')} />
        ) : view === 'invoiced' ? (
          <Confirmation draft={DRAFT} invoice breakdown={{ ...BREAKDOWN, taxCents: 0, totalCents: 72050 }} monthlyCents={MONTHLY_CENTS} onSetup={() => setView('free')} onViewCampaign={() => setView('free')} />
        ) : (
          <Confirmation
            restaurant="Yellowbee Market & Cafe"
            draft={DRAFT}
            breakdown={BREAKDOWN}
            monthlyCents={MONTHLY_CENTS}
            monthlyTaxCents={MONTHLY_TAX_CENTS}
            onSetup={() => setView('free')}
            onViewCampaign={() => setView('free')}
          />
        )}
      </div>
    </div>
  )
}

function Label({ text }: { text: string }) {
  return <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11.5, fontWeight: 700, color: '#6b746e', margin: '14px 0 6px' }}>{text}</div>
}
