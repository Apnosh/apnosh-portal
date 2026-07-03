'use client'

/**
 * Billing > Orders > [id] — a single campaign's order receipt, rebuilt from the saved campaign so the
 * owner can re-open what they ordered any time (not just on the post-ship screen). Reuses the shared
 * CampaignReceiptView, with buildReceipt reconstructing the exact lines + producer-aware totals.
 */

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Loader2, ExternalLink } from 'lucide-react'
import MvpShell from '@/components/mvp/mvp-shell'
import { MvpDetailHeader, C } from '@/components/mvp/mvp-detail'
import { useClient } from '@/lib/client-context'
import { buildReceipt } from '@/lib/campaigns/receipt'
import CampaignReceiptView from '@/components/campaigns/plan-flow/receipt-view'
import type { SavedCampaign } from '@/lib/campaigns/view'

export default function OrderReceiptPage() {
  const params = useParams()
  const id = String((params as Record<string, string | string[]>)?.id ?? '')
  const router = useRouter()
  const { client } = useClient()
  const [camp, setCamp] = useState<SavedCampaign | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    fetch(`/api/campaigns/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!live) return
        if (j?.campaign) setCamp(j.campaign as SavedCampaign)
        else setError('We could not find this order.')
        setLoading(false)
      })
      .catch(() => { if (live) { setError('Could not load this order.'); setLoading(false) } })
    return () => { live = false }
  }, [id])

  const today = new Date().toISOString().slice(0, 10)
  const receipt = camp ? buildReceipt(camp, today) : null

  return (
    <MvpShell active="more" header={<MvpDetailHeader title="Order receipt" subtitle="What you ordered" backHref="/dashboard/billing" backLabel="Billing" />}>
      <div style={{ background: C.bg, minHeight: '100%', padding: '14px 14px 28px', boxSizing: 'border-box' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '48px 0', color: C.faint }}><Loader2 size={16} className="mvp-spin" /> Loading…</div>
        ) : error || !camp || !receipt ? (
          <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: '24px', textAlign: 'center', color: C.mute, fontSize: 13.5 }}>{error ?? 'Order not found.'}</div>
        ) : (
          <>
            <CampaignReceiptView
              restaurant={client?.name || camp.draft.name || 'Your restaurant'}
              orderId={id}
              draft={camp.draft}
              receipt={receipt}
              dateISO={camp.shippedAt ?? camp.createdAt ?? today}
            />
            <button onClick={() => router.push(`/dashboard/campaigns/${id}`)} style={{ width: '100%', height: 48, marginTop: 18, borderRadius: 13, border: `1px solid ${C.line}`, background: '#fff', color: C.ink, fontSize: 14.5, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
              <ExternalLink size={16} /> View campaign
            </button>
          </>
        )}
      </div>
    </MvpShell>
  )
}
