'use client'

/**
 * /dashboard/campaigns/calendar — the month, one tap from the Campaigns tab (owner 2026-09-22):
 * the plan's real items by week or by month, open slots dashed and yours to fill, every piece
 * with its own sheet. The Week / Month toggle sits in the top row where the bell is elsewhere.
 */
import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { LayoutList, CalendarDays } from 'lucide-react'
import { useClient } from '@/lib/client-context'
import MvpShell from '@/components/mvp/mvp-shell'
import PlanMonthPage from '@/components/mvp/plan/plan-month-page'

export default function Page() { return <Suspense fallback={null}><Inner /></Suspense> }
function Inner() {
  const { client, loading } = useClient()
  const sp = useSearchParams()
  const [view, setView] = useState<'week' | 'month'>('week')
  if (loading || !client?.id) return null
  const q = sp.get('clientId') ? `?clientId=${sp.get('clientId')}` : ''
  const thisMonth = new Date().toISOString().slice(0, 7)
  const toggle = (
    <div style={{ display: 'flex', gap: 2, padding: 2, borderRadius: 99, background: '#f2f2f5' }}>
      {([['week', 'Week', LayoutList], ['month', 'Month', CalendarDays]] as const).map(([k, l, I]) => <button key={k} type="button" aria-label={l} title={l} onClick={() => setView(k)} style={{ width: 32, height: 28, borderRadius: 99, border: 0, background: view === k ? '#fff' : 'transparent', color: view === k ? '#1d1d1f' : '#6e6e73', boxShadow: view === k ? '0 1px 3px rgba(0,0,0,.10)' : 'none', display: 'grid', placeItems: 'center', cursor: 'pointer' }}><I size={15} /></button>)}
    </div>
  )
  return (
    <MvpShell active="campaigns" title="Calendar" back={`/dashboard/campaigns${q}`} solidTop right={toggle}>
      <PlanMonthPage clientId={client.id} month={sp.get('month') ?? thisMonth} mode="campaigns" view={view} onView={setView} historyHref={`/dashboard/campaigns/history${q}`} />
    </MvpShell>
  )
}
