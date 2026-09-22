'use client'

/**
 * /dashboard/campaigns — everything ordered or planned, by month, by campaign, or as what is
 * coming (owner 2026-09-22). See src/components/mvp/campaigns/campaigns-page.tsx. The older
 * cards and the calendar grid live at /dashboard/campaigns/calendar.
 */
import { Suspense } from 'react'
import { useClient } from '@/lib/client-context'
import MvpShell from '@/components/mvp/mvp-shell'
import CampaignsPage from '@/components/mvp/campaigns/campaigns-page'

export default function Page() { return <Suspense fallback={null}><Inner /></Suspense> }
function Inner() {
  const { client, loading } = useClient()
  if (loading || !client?.id) return null
  return (
    <MvpShell active="campaigns" title="Campaigns">
      <CampaignsPage clientId={client.id} />
    </MvpShell>
  )
}
