'use client'

/**
 * /dashboard/more — the owner More hub, rendered in the apnosh-mvp shell.
 * Repoints the bottom-nav "More" tab away from the raw profile editor to a
 * proper account-and-everything-else hub (MvpMore).
 */

import { LogOut } from 'lucide-react'
import { useClient } from '@/lib/client-context'
import { signOut } from '@/lib/supabase/hooks'
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
        <Centered>
          <div>
            <div style={{ marginBottom: 16 }}>Sign in as a client to see this.</div>
            <button
              type="button"
              onClick={() => { void signOut() }}
              className="mvp-row"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '12px 18px', background: '#fff', border: '0.5px solid #e6e6ea', borderRadius: 14, cursor: 'pointer', font: 'inherit', fontSize: 15, fontWeight: 600, color: '#c0564f' }}
            >
              <LogOut size={17} color="#c0564f" />
              Sign out
            </button>
          </div>
        </Centered>
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
