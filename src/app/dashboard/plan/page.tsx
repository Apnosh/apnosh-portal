'use client'
/**
 * /dashboard/plan — the month ahead, drawn as the Home funnel (owner 2026-09-19, "let's try it").
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
    <MvpShell active="create" title="The month" back={`/dashboard/campaigns${q}`} focus fit>
      <PlanMonthPage clientId={client.id} month={sp.get('month')} />
    </MvpShell>
  )
}
