'use client'
/**
 * /dashboard/campaigns/calendar — the month grid and the older campaign cards, one tap from
 * Campaigns. The page that used to be the tab, kept whole.
 */
import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import MvpShell from '@/components/mvp/mvp-shell'
import MvpCampaigns from '@/components/mvp/mvp-campaigns'

export default function Page() { return <Suspense fallback={null}><Inner /></Suspense> }
function Inner() {
  const sp = useSearchParams()
  const q = sp.get('clientId') ? `?clientId=${sp.get('clientId')}` : ''
  return (
    <MvpShell active="campaigns" title="Calendar" back={`/dashboard/campaigns${q}`}>
      <MvpCampaigns view="calendar" />
    </MvpShell>
  )
}
