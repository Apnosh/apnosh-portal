'use client'

/**
 * /dashboard/inbox — the owner Inbox, redesigned to the apnosh-mvp design.
 * Renders the full-screen owner shell (design chrome + bottom nav) with the
 * 3-tab Inbox (Approvals · Messages · Reviews), wired to real data.
 *
 * The previous unified-feed inbox is preserved in git history / on main.
 */

import Link from 'next/link'
import { Settings2 } from 'lucide-react'
import { useClient } from '@/lib/client-context'
import { GLASS } from '@/components/mvp/top-row'
import MvpShell from '@/components/mvp/mvp-shell'
import MvpInbox from '@/components/mvp/mvp-inbox'

export default function InboxPage() {
  const { client, loading } = useClient()
  /* Back on the left, the title, and a gear on the right for what to be told about (owner
     2026-09-11): a screen you came INTO, not a tab, so no avatar and no bell. */
  return (
    <MvpShell active="inbox" title="Notifications" back="/dashboard" right={
      <Link href="/dashboard/settings/notifications" aria-label="Notification settings" title="Notification settings" style={{ ...GLASS, width: 40, height: 40, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1d1d1f', textDecoration: 'none', boxSizing: 'border-box' }}>
        <Settings2 size={19} />
      </Link>
    }>
      {loading ? (
        <Centered>Loading…</Centered>
      ) : client?.id ? (
        <MvpInbox clientId={client.id} />
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
