'use client'

/**
 * /dashboard/campaigns — the actual month (owner 2026-09-22, "the calendar, with the queue's
 * swap"): Plan ahead's layout with the real items. Open slots are dashed squares, yours to fill.
 * Tap a day to fill, swap, push back or scrap. Something came up puts a new thing on the soonest
 * day that can take it. Order history one tap away. Plan ahead (from Create) drafts and starts.
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
  if (loading || !client?.id) return null
  const q = sp.get('clientId') ? `?clientId=${sp.get('clientId')}` : ''
  const thisMonth = new Date().toISOString().slice(0, 7)
  return (
    <MvpShell active="campaigns" title="Campaigns">
      <PlanMonthPage clientId={client.id} month={sp.get('month') ?? thisMonth} mode="campaigns" historyHref={`/dashboard/campaigns/history${q}`} />
    </MvpShell>
  )
}
