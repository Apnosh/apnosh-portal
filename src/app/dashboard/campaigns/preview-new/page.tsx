/**
 * TEMPORARY preview route for the new campaign-builder design port.
 * Validates the ported .jsx compiles + renders inside the portal. This route
 * is removed once the new builder is wired in at /dashboard/campaigns/new.
 */
import CampaignBuilderEntry from '@/components/mvp/campaign-builder/builder-entry'

export const dynamic = 'force-dynamic'

export default function CampaignBuilderPreview() {
  return <CampaignBuilderEntry />
}
