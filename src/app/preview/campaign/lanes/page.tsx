'use client'

/**
 * /preview/campaign/lanes — the REAL CampaignPlanFlow on fixture data, for the router surfaces.
 *
 * Exists so the Phase-2 owner surfaces (the hands-on control on the order summary, the LaneRow
 * in each service sheet) can be seen and verified without a signed-in account. Same component
 * as production; confirm is a no-op with a banner, exactly like the other preview screens.
 */
import { useState } from 'react'
import CampaignPlanFlow from '@/components/campaigns/plan-flow/campaign-plan-flow'

const SUPPLY = { countByCraft: { Video: 2, Photo: 1 }, assembledAt: '2026-07-28T00:00:00Z' }

export default function PreviewLanesPage() {
  const [done, setDone] = useState(false)
  if (done) {
    return (
      <div style={{ padding: 40, fontFamily: 'Inter, sans-serif', fontSize: 14, lineHeight: 1.6 }}>
        Preview only — confirming needs a real account.{' '}
        <button onClick={() => setDone(false)} style={{ color: '#2e9a78', fontWeight: 700, border: 'none', background: 'none', cursor: 'pointer', fontSize: 14 }}>Back to the plan</button>
      </div>
    )
  }
  return (
    <CampaignPlanFlow
      itemId="firstvisit"
      vals={{}}
      restaurant="Yellowbee Market & Cafe"
      outcome="more first-time guests through the door"
      supply={SUPPLY}
      onConfirm={() => setDone(true)}
      onBack={() => setDone(true)}
    />
  )
}
