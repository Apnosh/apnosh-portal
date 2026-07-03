'use client'

/**
 * OrderConfirmed — the "you're all set" screen after the owner approves + ships. Wraps the shared
 * receipt body (CampaignReceiptView) with the confirmation header, a go-live chip, the "Needs you"
 * handoff to the setup page, and the Add-setup / Skip CTAs. The receipt renders the exact lines +
 * producer-aware totals the owner just approved (threaded in as `receipt`). The same receipt is
 * reachable later under Billing > Orders. Mobile-first, centered phone column on desktop.
 */

import { Check, CalendarDays, ChevronRight, ClipboardList } from 'lucide-react'
import { C, DISPLAY } from '@/components/campaigns/ui'
import type { CampaignDraft, CampaignReceipt } from '@/lib/campaigns/types'
import CampaignReceiptView, { goLivePhraseFor } from '@/components/campaigns/plan-flow/receipt-view'

export default function OrderConfirmed({
  restaurant, orderId, draft, receipt, doneSetupIds, onSetup, onSkip,
}: {
  restaurant: string
  orderId: string
  draft: CampaignDraft
  /** What the owner just approved — the exact pieces, services, and producer-aware bill. */
  receipt: CampaignReceipt
  /** Setup serviceIds already in place — skipped in the go-live estimate (no re-quoting done setup). */
  doneSetupIds?: readonly string[]
  /** Go to the dedicated campaign setup ("Needs you") page to gather the full intake. */
  onSetup: () => void
  /** Skip for now and land on the campaign. */
  onSkip: () => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const goLivePhrase = goLivePhraseFor(draft, receipt, today, doneSetupIds)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 70, background: C.bg, overflowY: 'auto', display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 480, minHeight: '100dvh', background: '#fff', boxSizing: 'border-box', padding: '40px 18px 26px', display: 'flex', flexDirection: 'column' }}>

        {/* confirmation */}
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ width: 64, height: 64, margin: '0 auto 13px', borderRadius: '50%', background: 'linear-gradient(135deg,#16a34a,#0f6e56)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 12px 30px -8px rgba(22,163,74,.5)' }}>
            <Check size={33} color="#fff" strokeWidth={2.8} />
          </div>
          <div style={{ fontFamily: DISPLAY, fontSize: 25, fontWeight: 600, color: C.ink, letterSpacing: '-.3px' }}>You&rsquo;re all set</div>
          <div style={{ fontSize: 13.5, color: C.mute, marginTop: 4 }}>{restaurant}&rsquo;s plan is in. The team starts now.</div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 10, background: C.greenSoft, color: C.greenDk, borderRadius: 99, padding: '4px 11px', fontSize: 12, fontWeight: 600 }}>
            <CalendarDays size={12} /> {goLivePhrase}
          </div>
        </div>

        <CampaignReceiptView restaurant={restaurant} orderId={orderId} draft={draft} receipt={receipt} doneSetupIds={doneSetupIds} />

        {/* needs you handoff */}
        <div style={{ border: `1px solid ${C.line}`, borderRadius: 14, padding: '14px', display: 'flex', gap: 12, alignItems: 'flex-start', marginTop: 14 }}>
          <span style={{ width: 34, height: 34, borderRadius: 9, background: C.greenSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><ClipboardList size={17} color={C.greenDk} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>A few details help us start faster</div>
            <div style={{ fontSize: 12, color: C.mute, marginTop: 2, lineHeight: 1.5 }}>Your go-live date, the best time for a shoot, who to ask for, and the dishes to feature. Takes a minute, and you can do it later too.</div>
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 18 }} />

        <button onClick={onSetup} style={{ width: '100%', height: 52, borderRadius: 14, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg,#16a34a,#0f6e56)', color: '#fff', fontSize: 15.5, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 18, boxShadow: '0 10px 24px -8px rgba(22,163,74,.5)' }}>
          Add setup details <ChevronRight size={18} />
        </button>
        <button onClick={onSkip} style={{ width: '100%', height: 46, marginTop: 10, borderRadius: 13, border: 'none', background: 'none', color: C.mute, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
          Skip for now · view campaign
        </button>
      </div>
    </div>
  )
}
