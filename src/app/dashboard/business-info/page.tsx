/**
 * /dashboard/business-info — the "Update business info" quick-action
 * destination. A focused, super-simple editor that syncs changes to
 * Google Business Profile + the website + our DB in one save.
 *
 * Server wrapper loads the current values; the client editor handles
 * the form + save flow.
 */

import { redirect } from 'next/navigation'
import { loadBusinessInfo } from './actions'
import { getWebsiteConnection } from './website-actions'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import BusinessInfoEditor from './business-info-editor'

export const dynamic = 'force-dynamic'

export default async function BusinessInfoPage() {
  const { user } = await resolveCurrentClient(null)
  if (!user) redirect('/login')

  const [loaded, websiteConn] = await Promise.all([
    loadBusinessInfo(),
    getWebsiteConnection(),
  ])

  return (
    <BusinessInfoEditor
      initial={loaded.info ?? null}
      gbpConnected={loaded.gbpConnected}
      hasWebsite={loaded.hasWebsite}
      websiteRepo={websiteConn.connected ? websiteConn.repo : null}
      loadError={loaded.ok ? null : (loaded.error ?? 'Could not load your info')}
    />
  )
}
