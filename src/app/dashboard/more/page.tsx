'use client'

/**
 * /dashboard/more — the owner More hub, rendered in the apnosh-mvp shell.
 * Repoints the bottom-nav "More" tab away from the raw profile editor to a
 * proper account-and-everything-else hub (MvpMore).
 */

import { useClient } from '@/lib/client-context'
import MvpShell from '@/components/mvp/mvp-shell'
import MvpMore from '@/components/mvp/mvp-more'

export default function MorePage() {
  const { client, loading } = useClient()
  return (
    <MvpShell active="more">
      {loading ? (
        <Centered>Loading…</Centered>
      ) : client ? (
        <MvpMore name={client.name || 'Your restaurant'} location={client.location} tier={client.tier} />
      ) : (
        <Centered>Sign in as a client to see this.</Centered>
      )}
    </MvpShell>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', color: '#6e6e73', fontSize: 14, fontFamily: "'Inter',system-ui,sans-serif" }}>
      {children}
    </div>
  )
}
