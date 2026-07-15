'use client'

/**
 * /dashboard/campaigns/[id]/order — "Your order": the full-screen order details page. The receipt
 * (what you bought, what it aims at, what it costs) moved here from the detail page so the tracker
 * stays focused on what is happening. Read-only; changes go to your strategist via Request a change.
 * Same 480 phone-column shell as /ready so it reads as one continuous part of the campaign.
 */
import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ChevronLeft, Loader2, MessageCircle } from 'lucide-react'
import { C, DISPLAY } from '@/components/campaigns/ui'
import OrderSummary, { type OrderPayment } from '@/components/campaigns/campaign-order'
import type { SavedCampaign } from '@/lib/campaigns/view'

export default function OrderPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [camp, setCamp] = useState<SavedCampaign | null>(null)
  const [payment, setPayment] = useState<OrderPayment | null>(null)
  const [error, setError] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/campaigns/${id}`)
      if (!r.ok) throw new Error()
      const j = await r.json()
      setCamp(j.campaign as SavedCampaign)
      setPayment((j.payment ?? null) as OrderPayment | null)
    } catch { setError(true) }
  }, [id])
  useEffect(() => { load() }, [load])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: C.bg, display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 480, background: '#fff', display: 'flex', flexDirection: 'column', height: '100dvh', boxShadow: '0 0 40px rgba(0,0,0,0.06)' }}>
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px', borderBottom: `1px solid ${C.line}` }}>
          <button onClick={() => router.push(`/dashboard/campaigns/${id}`)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: C.mute, fontWeight: 600, fontSize: 14, cursor: 'pointer', padding: 0 }}>
            <ChevronLeft size={18} /> Back
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '18px 16px 28px' }}>
          {error ? <div style={{ color: C.red, fontSize: 13.5, padding: '20px 0', textAlign: 'center' }}>Could not load this order.</div>
            : !camp ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '40px 0', color: C.faint }}><Loader2 size={16} className="animate-spin" /> Loading…</div>
            : (
              <>
                <h1 style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 24, letterSpacing: '-.02em', margin: '0 0 2px', lineHeight: 1.15 }}>Your order</h1>
                <p style={{ fontSize: 13, color: C.mute, margin: '0 0 14px' }}>{camp.draft.name}</p>
                <OrderSummary camp={camp} payment={payment} />
                <button onClick={() => router.push('/dashboard/messages?to=strategist')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 14, height: 44, padding: '0 14px', borderRadius: 10, border: `1px solid ${C.line}`, cursor: 'pointer', background: '#fff', color: C.greenDk, fontSize: 13, fontWeight: 600 }}>
                  <MessageCircle size={14} /> Request a change
                </button>
              </>
            )}
        </div>
      </div>
    </div>
  )
}
