'use client'
/**
 * /dashboard/plan — PLAN AHEAD, a quick request from Create (owner 2026-09-22): one month at a
 * time, viewable as a calendar, a list, the order and the rhythm. The started month's pieces show
 * on Home; the Campaigns tab stays what it was.
 */
import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useClient } from '@/lib/client-context'
import MvpShell from '@/components/mvp/mvp-shell'
import PlanMonthPage from '@/components/mvp/plan/plan-month-page'

export default function Page() { return <Suspense fallback={null}><Inner /></Suspense> }
function Inner() {
  const { client, loading } = useClient()
  const sp = useSearchParams()
  const q = sp.get('clientId') ? `?clientId=${sp.get('clientId')}` : ''
  if (loading || !client?.id) return null
  return (
    <MvpShell active="create" title="Plan ahead" back={`/dashboard/campaigns/new${q}`} solidTop>
      <PlanMonthPage clientId={client.id} month={sp.get('month')} historyHref={`/dashboard/campaigns${q}`} />
    </MvpShell>
  )
}
