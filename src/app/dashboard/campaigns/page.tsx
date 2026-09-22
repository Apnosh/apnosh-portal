'use client'

/**
 * /dashboard/campaigns — PLAN AHEAD (owner 2026-09-22: "Home shows what is going on, the
 * campaigns page is a plan-ahead sort of thing"). The month funnel with the season strip is the
 * screen; the drawer holds its pieces, the calendar, the money, the rhythm, and the campaigns that
 * already ran. The started month lives on Home.
 */
import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useClient } from '@/lib/client-context'
import MvpShell from '@/components/mvp/mvp-shell'
import { NAV_RESERVE } from '@/components/mvp/bottom-nav'
import PlanMonthPage from '@/components/mvp/plan/plan-month-page'
import MvpCampaigns from '@/components/mvp/mvp-campaigns'

export default function CampaignsPage() { return <Suspense fallback={null}><Inner /></Suspense> }
function Inner() {
  const { client, loading } = useClient()
  const sp = useSearchParams()
  if (loading || !client?.id) return null
  return (
    <MvpShell active="campaigns" title="Plan ahead" fit>
      <PlanMonthPage clientId={client.id} month={sp.get('month')} navBottom={NAV_RESERVE} extraTabs={[
        { key: 'calendar', label: 'Calendar', render: () => <MvpCampaigns embedded view="calendar" /> },
        { key: 'campaigns', label: 'Campaigns', render: () => <MvpCampaigns embedded view="list" /> },
      ]} />
    </MvpShell>
  )
}
