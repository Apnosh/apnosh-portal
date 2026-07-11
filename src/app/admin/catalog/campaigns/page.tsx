/**
 * /admin/catalog/campaigns — the campaign content CMS (Phase C1). Lists the 34 store
 * campaigns from the canonical in-code CAMPAIGN_CONTENT record and lets an admin edit
 * every content field (plus the hero image) as a sparse DB override; empty fields keep
 * the code default. Creating NEW campaigns (composition/pricing) is Phase C2, not here.
 * Admin-only, same gate as /admin/catalog.
 */
import { requireAdminUser } from '@/lib/auth/require-admin'
import { getContentOverrides } from '@/lib/campaigns/content-overrides-server'
import { CampaignsContentAdmin } from './campaigns-admin'

export const dynamic = 'force-dynamic'

export default async function AdminCampaignContentPage() {
  await requireAdminUser()
  const overrides = await getContentOverrides()
  return <CampaignsContentAdmin initialOverrides={overrides} />
}
