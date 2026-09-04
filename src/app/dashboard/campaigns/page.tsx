'use client'
import { useState } from 'react'
import { TopSegmented } from '@/components/mvp/top-row'

/**
 * /dashboard/campaigns — the Campaigns board, full-screen owner experience.
 * Wired to real campaigns via GET /api/campaigns; see mvp-campaigns.tsx. Shows
 * shipped / live / done only — unshipped drafts live on the Orders tab.
 */

import MvpCampaigns from '@/components/mvp/mvp-campaigns'
import MvpShell from '@/components/mvp/mvp-shell'

export default function CampaignsPage() {
  const [view, setView] = useState<'list' | 'calendar'>('list')
  return (
    <MvpShell active="campaigns" middle={<TopSegmented options={[['list', 'List'], ['calendar', 'Calendar']]} value={view} onChange={setView} />}>
      <MvpCampaigns view={view} />
    </MvpShell>
  )
}
