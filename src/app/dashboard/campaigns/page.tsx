'use client'

/**
 * /dashboard/campaigns — the Campaigns board, full-screen owner experience.
 * Runs on sample campaign data (no campaign model yet); see mvp-campaigns.tsx.
 */

import MvpCampaigns from '@/components/mvp/mvp-campaigns'
import MvpShell from '@/components/mvp/mvp-shell'

export default function CampaignsPage() {
  return (
    <MvpShell active="campaigns">
      <MvpCampaigns />
    </MvpShell>
  )
}
