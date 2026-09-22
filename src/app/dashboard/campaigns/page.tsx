'use client'

/**
 * /dashboard/campaigns — the Campaigns board (owner 2026-09-22): Calendar and Order history
 * rows on top, then what is running. What ran lives on Order history.
 */

import CampaignsBoard from '@/components/mvp/campaigns-board'
import MvpShell from '@/components/mvp/mvp-shell'

export default function CampaignsPage() {
  return (
    <MvpShell active="campaigns" title="Campaigns">
      <CampaignsBoard />
    </MvpShell>
  )
}
