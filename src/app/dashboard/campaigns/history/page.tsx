'use client'

/**
 * /dashboard/campaigns/history — the campaigns that already ran, with the old calendar row.
 * Reached from Plan ahead's list. Unchanged cards, one screen back.
 */
import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import MvpShell from '@/components/mvp/mvp-shell'
import MvpCampaigns from '@/components/mvp/mvp-campaigns'

export default function HistoryPage() { return <Suspense fallback={null}><Inner /></Suspense> }
function Inner() {
  const sp = useSearchParams()
  const q = sp.get('clientId') ? `?clientId=${sp.get('clientId')}` : ''
  return (
    <MvpShell active="campaigns" title="Campaigns" back={`/dashboard/campaigns${q}`}>
      <MvpCampaigns />
    </MvpShell>
  )
}
