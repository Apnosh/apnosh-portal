/**
 * TEMPORARY preview route for the new campaign-builder design port.
 * Validates the ported .jsx compiles + renders inside the portal. This route
 * is removed once the new builder is wired in at /dashboard/campaigns/new.
 */
import ApnoshCampaign from '@/components/mvp/campaign-builder/apnosh-campaign'

export const dynamic = 'force-dynamic'

export default function CampaignBuilderPreview() {
  return <ApnoshCampaign />
}
