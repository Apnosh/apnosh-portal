'use client'

/**
 * /dashboard/campaigns — the Campaigns board, full-screen owner experience.
 * Wired to real campaigns via GET /api/campaigns; see mvp-campaigns.tsx. Shows
 * shipped / live / done only — unshipped drafts live on the Orders tab.
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
