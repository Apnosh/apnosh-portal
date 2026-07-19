'use client'

/**
 * /dashboard/campaigns/[id]/order — "Your order": the full-screen order details page. The receipt
 * (what you bought, what it aims at, what it costs) moved here from the detail page so the tracker
 * stays focused on what is happening. Read-only; changes go to your strategist via Request a change.
 * Same 480 phone-column shell as /ready so it reads as one continuous part of the campaign.
 */
import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ChevronLeft, Loader2, MessageCircle, Ban, Clock, CheckCircle2 } from 'lucide-react'
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
                <CancelOrder camp={camp} onChanged={load} />
              </>
            )}
        </div>
      </div>
    </div>
  )
}

/**
 * Cancel an order — Amazon-style. It's a REQUEST, not a guaranteed stop: the
 * owner asks, a human reviews, and either approves (the order is canceled) or
 * declines (it keeps running). Requesting does not stop work or billing on its
 * own, and the copy says so. Four states: canceled / pending / declined / can-ask.
 */
function CancelOrder({ camp, onChanged }: { camp: SavedCampaign; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(false)

  // Only a running order can be canceled. A draft isn't an order yet.
  if (camp.status !== 'shipped' && camp.status !== 'stopped') return null

  async function requestCancel() {
    if (busy) return
    const ok = typeof window === 'undefined' ? true : window.confirm(
      'Ask to cancel this order?\n\nThis sends a cancellation request to your team. It is not guaranteed: work already underway may still be finished and billed. We will message you either way.',
    )
    if (!ok) return
    setBusy(true); setErr(false)
    const r = await fetch(`/api/campaigns/${camp.draft.id}/cancel-request`, { method: 'POST' }).catch(() => null)
    setBusy(false)
    if (r && r.ok) onChanged()
    else setErr(true)
  }

  const box = (bg: string, border: string, fg: string, Icon: typeof Ban, title: string, body: string) => (
    <div style={{ marginTop: 20, background: bg, border: `1px solid ${border}`, borderRadius: 14, padding: '13px 14px', display: 'flex', gap: 11 }}>
      <Icon size={17} color={fg} style={{ flexShrink: 0, marginTop: 1 }} />
      <div>
        <div style={{ fontWeight: 700, fontSize: 13.5, color: fg }}>{title}</div>
        <div style={{ fontSize: 12.5, color: C.mute, lineHeight: 1.5, marginTop: 2 }}>{body}</div>
      </div>
    </div>
  )

  if (camp.status === 'stopped') {
    return box('#f4f4f6', C.line, C.mute, CheckCircle2, 'This order was canceled', 'Nothing new starts or posts. Anything already made was finished and billed as normal.')
  }
  if (camp.cancelState === 'requested') {
    return box('#fdf6e9', '#f0dfb8', '#854f0b', Clock, 'Cancellation requested', 'Your team is reviewing it. This is not guaranteed. Work already underway may still be finished and billed. We will message you either way.')
  }

  return (
    <div style={{ marginTop: 20, borderTop: `1px solid ${C.line}`, paddingTop: 16 }}>
      {camp.cancelState === 'declined' && box('#f4f4f6', C.line, C.mute, Ban, 'We could not cancel this order', 'It was already too far along, so it is still running. You can ask again and your team will take another look.')}
      <button onClick={requestCancel} disabled={busy} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: camp.cancelState === 'declined' ? 12 : 0, height: 44, padding: '0 14px', borderRadius: 10, border: `1px solid ${C.line}`, cursor: busy ? 'default' : 'pointer', background: '#fff', color: C.red, fontSize: 13, fontWeight: 600, opacity: busy ? 0.6 : 1 }}>
        <Ban size={14} /> {busy ? 'Sending…' : camp.cancelState === 'declined' ? 'Ask to cancel again' : 'Request to cancel this order'}
      </button>
      <div style={{ fontSize: 11.5, color: C.faint, marginTop: 7, lineHeight: 1.45 }}>A request, not a guarantee. Work already underway may still be finished and billed.</div>
      {err && <div style={{ fontSize: 12, color: C.red, marginTop: 6 }}>That did not go through. Tap to try again.</div>}
    </div>
  )
}
