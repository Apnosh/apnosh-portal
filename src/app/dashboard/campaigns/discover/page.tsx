'use client'

/**
 * /dashboard/campaigns/discover — the "create a campaign" page (the center +).
 * A full-screen discovery feed (recommended + categories); tapping a card opens
 * the campaign preview before building. The Campaigns tab keeps the detailed
 * list of the owner's actual campaigns.
 */
import MvpCampaignsDiscovery from '@/components/mvp/mvp-campaigns-discovery'

export default function CampaignDiscoverPage() {
  return <MvpCampaignsDiscovery />
}
