'use client'

/**
 * /preview/campaign/checkout — the REAL free-checkout seal + confirmation screens on a fixture
 * draft, for the Strategist's Desk verification (DESK-6) without a signed-in account.
 *
 * Same components as production (FreeCheckout, Confirmation — exported for exactly this). The
 * seal genuinely fires saveAndShip, which fails unauthenticated: that failure IS part of the
 * verification (error surfaces, the seal remounts for another try). The Confirmation view is
 * reached by the toggle, since nothing can truly ship here.
 */
import { useState } from 'react'
import { FreeCheckout, Confirmation } from '@/components/mvp/campaign-builder/campaign-checkout'
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

export default function PreviewCheckoutPage() {
  const [view, setView] = useState<'free' | 'confirmed'>('free')
  return (
    <div style={{ position: 'fixed', inset: 0, ...paperGround, display: 'flex', justifyContent: 'center' }}>
      <DeskKeyframes />
      <div style={{ width: '100%', maxWidth: 480, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ flexShrink: 0, display: 'flex', gap: 8, padding: '12px 18px 8px' }}>
          {(['free', 'confirmed'] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 999, cursor: 'pointer', border: '1px solid #E4E0D6', background: view === v ? '#EAF6F1' : '#fff', color: view === v ? '#2E9A78' : '#4A554F' }}>
              {v === 'free' ? 'The seal' : 'The confirmation'}
            </button>
          ))}
        </div>
        {view === 'free' ? (
          <FreeCheckout clientId="preview-no-account" draft={DRAFT} onPlaced={() => setView('confirmed')} />
        ) : (
          <Confirmation
            restaurant="Yellowbee Market & Cafe"
            draft={DRAFT}
            breakdown={{ subtotalCents: 0, serviceFeeCents: 0, taxCents: 0, totalCents: 0 }}
            onSetup={() => setView('free')}
            onViewCampaign={() => setView('free')}
          />
        )}
      </div>
    </div>
  )
}
