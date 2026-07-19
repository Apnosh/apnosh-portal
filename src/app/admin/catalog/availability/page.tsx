/**
 * /admin/catalog/availability — the Availability tab (Checkout Gates, Phase 1). Publishes the team's
 * real shoot calendar so a client can only pick slots that actually exist. Reads every rule
 * server-side (service role) and hands them to the editor. Admin-only, same gate as /admin/catalog.
 */
import { requireAdminUser } from '@/lib/auth/require-admin'
import { getAllGateRules } from '@/lib/campaigns/gates/availability-server'
import { AvailabilityAdmin } from './availability-admin'

export const dynamic = 'force-dynamic'

export default async function AdminAvailabilityPage() {
  await requireAdminUser()
  const rules = await getAllGateRules()
  return <AvailabilityAdmin initialRules={rules} />
}
