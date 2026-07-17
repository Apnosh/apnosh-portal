'use client'

/**
 * /dashboard/campaigns/[id]/results — the magnet-funnel results view for a REAL
 * campaign. Reuses the same gated GET /api/campaigns/:id the sibling pages use,
 * then builds the funnel (plays grouped by stage) client-side from the saved
 * line items. While the campaign is an editable draft, toggling a stage's plays
 * edits the real plan; once shipped it's read-only. Same 480 phone-column shell
 * as /order and /ready so it reads as one continuous part of the campaign.
 */
import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ChevronLeft, Loader2 } from 'lucide-react'
import { C } from '@/components/campaigns/ui'
import CampaignFunnelResult from '@/components/campaigns/campaign-funnel-result'
import { buildFunnelData } from '@/lib/campaigns/funnel-plays'
import type { SavedCampaign } from '@/lib/campaigns/view'

export default function CampaignResultsPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [camp, setCamp] = useState<SavedCampaign | null>(null)
  const [error, setError] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/campaigns/${id}`)
      if (!r.ok) throw new Error()
      const j = await r.json()
      setCamp(j.campaign as SavedCampaign)
    } catch { setError(true) }
  }, [id])
  useEffect(() => { load() }, [load])

  const data = camp ? buildFunnelData(camp) : null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: C.bg, display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 480, background: C.bg, display: 'flex', flexDirection: 'column', height: '100dvh', boxShadow: '0 0 40px rgba(0,0,0,0.06)' }}>
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px', borderBottom: `1px solid ${C.line}`, background: '#fff' }}>
          <button onClick={() => router.push(`/dashboard/campaigns/${id}`)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: C.mute, fontWeight: 600, fontSize: 14, cursor: 'pointer', padding: 0 }}>
            <ChevronLeft size={18} /> Back
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 14px 40px' }}>
          {error ? (
            <div style={{ textAlign: 'center', color: C.mute, fontSize: 14, marginTop: 60 }}>Could not load this campaign.</div>
          ) : !data ? (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 60, color: C.mute }}><Loader2 size={22} className="animate-spin" /></div>
          ) : (
            <CampaignFunnelResult
              campaignId={data.campaignId}
              campaignName={data.campaignName}
              kicker={data.kicker}
              editable={data.editable}
              pieces={data.pieces}
              initialSelected={data.initialSelected}
              initialItems={data.initialItems}
              clientId={camp?.clientId}
            />
          )}
        </div>
      </div>
    </div>
  )
}
