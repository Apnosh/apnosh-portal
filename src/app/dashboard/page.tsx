'use client'

/**
 * /dashboard — the owner home, redesigned to the apnosh-mvp design. Renders
 * the full-screen owner experience (design header + content + bottom nav),
 * wired to real data via the shared transform. On wide screens it centers in a
 * phone-width column.
 *
 * The previous Direction-A dashboard (admin picker, desktop home, getting
 * started) is preserved in git history / on main.
 */

import { useEffect, useState } from 'react'
import { useClient } from '@/lib/client-context'
import MvpHome, { type MvpHomeData } from '@/components/mvp/mvp-home'
import { transformHome } from '@/components/mvp/home-transform'
import BottomNav from '@/components/mvp/bottom-nav'

// Design sample content — shown only where the client has no real approvals /
// monthly review yet, so the home reads complete during this build phase.
const SAMPLE_APPROVALS: MvpHomeData['approvals'] = [
  { id: 's1', tag: 'POST', timing: 'By 5pm', title: 'Kimchi Burger reel', subtitle: 'For Saturday lunch · drafted by your team', emoji: '🌶️', image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=320&q=80&auto=format&fit=crop' },
  { id: 's2', tag: 'DESIGN', timing: 'No rush', title: 'Summer menu poster', subtitle: 'Studio applied your notes', emoji: '🍑', image: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=320&q=80&auto=format&fit=crop' },
]
const SAMPLE_REVIEW: MvpHomeData['review'] = { prevMonthLabel: 'May', cycleLabel: 'June', budget: 800 }

export default function DashboardHomePage() {
  const { client, loading: clientLoading } = useClient()
  const [data, setData] = useState<MvpHomeData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!client?.id) return
    let live = true
    setError(null)
    fetch(`/api/dashboard/load?clientId=${client.id}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Load failed (${r.status})`)
        return r.json()
      })
      .then((json) => {
        if (!live) return
        const d = transformHome(json.homeMetrics, json.agenda, client.name ?? '·', undefined, json.comingUp)
        if (d.approvals.length === 0) d.approvals = SAMPLE_APPROVALS
        if (!d.review) d.review = SAMPLE_REVIEW
        setData(d)
      })
      .catch((e) => { if (live) setError(e.message) })
    return () => { live = false }
  }, [client?.id, client?.name])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: '#f0f0f3', display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 480, background: '#fff', display: 'flex', flexDirection: 'column', boxShadow: '0 0 40px rgba(0,0,0,0.06)' }}>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {clientLoading || (!data && !error) ? (
            <Centered>Loading your numbers…</Centered>
          ) : error ? (
            <Centered>Couldn&apos;t load: {error}</Centered>
          ) : data ? (
            <MvpHome data={data} />
          ) : (
            <Centered>No client found for this account.</Centered>
          )}
        </div>
        <BottomNav active="home" />
      </div>
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', color: '#6e6e73', fontSize: 14, fontFamily: "'Inter',system-ui,sans-serif" }}>
      {children}
    </div>
  )
}
