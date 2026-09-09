'use client'

/**
 * /dashboard/boost — put money behind a post that already worked.
 * Same shape as /dashboard/post: one job, its own back arrow, no nav underneath.
 */

import { useClient } from '@/lib/client-context'
import MvpBoost from '@/components/mvp/mvp-boost'

export default function BoostPage() {
  const { client, loading } = useClient()
  if (loading) return <Centered>Loading…</Centered>
  if (!client?.id) return <Centered>Sign in as a client to boost a post.</Centered>
  return <MvpBoost clientId={client.id} />
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', color: '#6e6e73', fontSize: 14, fontFamily: "'Inter',system-ui,sans-serif" }}>
      {children}
    </div>
  )
}
