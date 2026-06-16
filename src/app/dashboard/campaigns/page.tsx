'use client'

/**
 * /dashboard/campaigns — the redesigned "Your marketing" (Plan) screen, the
 * Campaigns tab of the apnosh-mvp owner experience. Full-screen over the portal
 * chrome with the shared bottom nav. Currently runs on sample plan data (no
 * services/billing model yet); see components/mvp/mvp-campaigns.tsx.
 */

import MvpCampaigns from '@/components/mvp/mvp-campaigns'
import BottomNav from '@/components/mvp/bottom-nav'

export default function CampaignsPage() {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: '#f0f0f3', display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 480, background: '#fff', display: 'flex', flexDirection: 'column', boxShadow: '0 0 40px rgba(0,0,0,0.06)' }}>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <MvpCampaigns />
        </div>
        <BottomNav active="campaigns" />
      </div>
    </div>
  )
}
