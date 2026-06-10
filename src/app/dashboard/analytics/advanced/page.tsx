/**
 * /dashboard/analytics/advanced — the deep, platform-first read on every
 * home metric. Reached from the "See details" link on the home hero.
 *
 * Server component: resolves the client, pulls the per-source series from
 * getAdvancedMetrics, and hands them to the <AdvancedAnalytics> client view.
 * Only Google Business Profile data is live today; every other platform
 * renders as an honest "Not connected" until its ingest lands.
 */

import { redirect } from 'next/navigation'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { getAdvancedMetrics } from '@/lib/dashboard/get-advanced-metrics'
import { AdvancedAnalytics } from '@/components/dashboard/advanced-analytics'
import '../../../adv-analytics.css'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ clientId?: string }>
}

export default async function AdvancedAnalyticsPage({ searchParams }: PageProps) {
  const { clientId: clientIdParam } = await searchParams
  const { user, isAdmin, clientId } = await resolveCurrentClient(clientIdParam ?? null)
  if (!user) redirect('/login')

  if (!clientId) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center text-ink-3">
        {isAdmin
          ? 'Pick a client from /dashboard to see their advanced analytics.'
          : 'Sign in as a client to see your analytics.'}
      </div>
    )
  }

  const { metrics } = await getAdvancedMetrics(clientId)

  return (
    <div style={{ background: '#fff', minHeight: '100vh' }}>
      <AdvancedAnalytics metrics={metrics} />
    </div>
  )
}
