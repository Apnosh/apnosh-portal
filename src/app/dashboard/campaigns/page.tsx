'use client'

/**
 * /dashboard/campaigns — the Campaigns board, full-screen owner experience.
 * Wired to real campaigns via GET /api/campaigns; see mvp-campaigns.tsx. Shows
 * shipped / live / done only — unshipped drafts live on the Orders tab.
 */

import MvpCampaigns from '@/components/mvp/mvp-campaigns'
import MvpShell from '@/components/mvp/mvp-shell'

export default function CampaignsPage() {
  /* the top row says Campaigns (owner 2026-09-11); the calendar is a row on the page, not a tab up here */
  return (
    <MvpShell active="campaigns" title="Campaigns">
      <MvpCampaigns />
    </MvpShell>
  )
}
