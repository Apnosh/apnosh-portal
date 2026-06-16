'use client'

/**
 * /dashboard/mvp-home — desktop-viewable preview of the redesigned owner
 * Home (the same design that now powers the real mobile /dashboard). Shows
 * it inside a 430px phone frame so it can be reviewed on a laptop. Wired to
 * the real /api/dashboard/load via the shared transform. Unlinked; safe to
 * delete once the redesign ships.
 */

import { useEffect, useState } from 'react'
import { useClient } from '@/lib/client-context'
import MvpHome, { type MvpHomeData } from '@/components/mvp/mvp-home'
import { transformHome } from '@/components/mvp/home-transform'

export default function MvpHomePage() {
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
        setData(transformHome(json.homeMetrics, json.agenda, client.name ?? '·'))
      })
      .catch((e) => { if (live) setError(e.message) })
    return () => { live = false }
  }, [client?.id, client?.name])

  return (
    <div style={{ minHeight: '100dvh', background: '#f0f0f3', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '24px 0' }}>
      <div style={{ width: 430, maxWidth: '100%', minHeight: 800, background: '#fff', borderRadius: 28, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.12)' }}>
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
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ height: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', color: '#6e6e73', fontSize: 14, fontFamily: "'Inter',system-ui,sans-serif" }}>
      {children}
    </div>
  )
}
