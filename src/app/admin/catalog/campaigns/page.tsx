/**
 * /admin/catalog/campaigns — the campaign CMS. Phase C1: lists the built-in store
 * campaigns (canonical in-code CAMPAIGN_CONTENT) and lets an admin edit every content
 * field (plus the hero image) as a sparse DB override; empty fields keep the code
 * default. Phase C2: create/edit/publish/delete entirely NEW services-only campaigns
 * (catalog_campaigns rows) whose price/deliverables/requirements/timeline all derive
 * from the real priced catalog. Admin-only, same gate as /admin/catalog.
 */
import { requireAdminUser } from '@/lib/auth/require-admin'
import { getContentOverrides } from '@/lib/campaigns/content-overrides-server'
import { getAllDbCampaigns } from '@/lib/campaigns/catalog-campaigns-server'
import { CampaignsContentAdmin } from './campaigns-admin'

export const dynamic = 'force-dynamic'

export default async function AdminCampaignContentPage() {
  await requireAdminUser()
  const [overrides, campaigns] = await Promise.all([getContentOverrides(), getAllDbCampaigns()])
  return <CampaignsContentAdmin initialOverrides={overrides} initialCampaigns={campaigns} />
}
