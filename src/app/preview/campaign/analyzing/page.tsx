'use client'

/**
 * /preview/campaign/analyzing — the REAL PlanAnalyzing (the kitchen-ticket thinking screen) on a
 * fixture profile, for Strategist's Desk verification without a signed-in account. `ready` is
 * true from the start so the run plays through; on finish it loops so the print can be watched
 * again.
 */
import { useState } from 'react'
import PlanAnalyzing from '@/components/campaigns/plan-flow/plan-analyzing'
import type { CampaignProfile } from '@/lib/campaigns/builder/campaign-profile'

const PROFILE = { cuisine: 'Grocery + cafe', neighborhood: 'Traxx', rating: 4.6, ratingCount: 212 } as unknown as CampaignProfile

export default function PreviewAnalyzingPage() {
  const [run, setRun] = useState(0)
  return (
    <PlanAnalyzing
      key={run}
      restaurant="Yellowbee Market & Cafe"
      itemId="firstvisit"
      profile={PROFILE}
      goalLabel="Win first-time visits"
      ready
      tailored
      onDone={() => setTimeout(() => setRun((r) => r + 1), 1400)}
    />
  )
}
