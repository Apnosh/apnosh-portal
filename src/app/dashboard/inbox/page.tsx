'use client'
import { useState } from 'react'
import { TopSearch } from '@/components/mvp/top-row'

/**
 * /dashboard/inbox — the owner Inbox, redesigned to the apnosh-mvp design.
 * Renders the full-screen owner shell (design chrome + bottom nav) with the
 * 3-tab Inbox (Approvals · Messages · Reviews), wired to real data.
 *
 * The previous unified-feed inbox is preserved in git history / on main.
 */

import { useClient } from '@/lib/client-context'
import MvpShell from '@/components/mvp/mvp-shell'
import MvpInbox from '@/components/mvp/mvp-inbox'

export default function InboxPage() {
  const [query, setQuery] = useState('')
  const { client, loading } = useClient()
  return (
    <MvpShell active="inbox" middle={<TopSearch value={query} onChange={setQuery} placeholder="Search notifications" />}>
      {loading ? (
        <Centered>Loading…</Centered>
      ) : client?.id ? (
        <MvpInbox clientId={client.id} query={query} />
      ) : (
        <Centered>Sign in as a client to see your inbox.</Centered>
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
