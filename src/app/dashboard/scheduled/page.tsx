'use client'

/** /dashboard/scheduled — everything asked for that has not happened yet. */

import { useClient } from '@/lib/client-context'
import MvpScheduled from '@/components/mvp/mvp-scheduled'

export default function ScheduledPage() {
  const { client, loading } = useClient()
  if (loading) return <Centered>Loading…</Centered>
  if (!client?.id) return <Centered>Sign in as a client to see this.</Centered>
  return <MvpScheduled clientId={client.id} />
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', color: '#6e6e73', fontSize: 14, fontFamily: "'Inter',system-ui,sans-serif" }}>{children}</div>
}
