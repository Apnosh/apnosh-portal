'use client'

/**
 * /dashboard/campaigns — PLAN AHEAD (owner 2026-09-22): one month at a time, viewable as a
 * calendar, a list, the money and the rhythm. The campaigns that already ran live one tap away
 * at /dashboard/campaigns/history. The started month's pieces show on Home.
 */
import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useClient } from '@/lib/client-context'
import MvpShell from '@/components/mvp/mvp-shell'
import PlanMonthPage from '@/components/mvp/plan/plan-month-page'

export default function CampaignsPage() { return <Suspense fallback={null}><Inner /></Suspense> }
function Inner() {
  const { client, loading } = useClient()
  const sp = useSearchParams()
  if (loading || !client?.id) return null
  const q = sp.get('clientId') ? `?clientId=${sp.get('clientId')}` : ''
  return (
    <MvpShell active="campaigns" title="Plan ahead">
      <PlanMonthPage clientId={client.id} month={sp.get('month')} historyHref={`/dashboard/campaigns/history${q}`} />
    </MvpShell>
  )
}
