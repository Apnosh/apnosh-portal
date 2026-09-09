'use client'

/**
 * /dashboard/post — write a post and send it, now or later.
 * Chrome-free by design: this is one job, start to finish, with a back arrow.
 */

import { useClient } from '@/lib/client-context'
import MvpComposer from '@/components/mvp/mvp-composer'

export default function PostPage() {
  const { client, loading } = useClient()
  if (loading) return <Centered>Loading…</Centered>
  if (!client?.id) return <Centered>Sign in as a client to post.</Centered>
  return <MvpComposer clientId={client.id} />
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', color: '#6e6e73', fontSize: 14, fontFamily: "'Inter',system-ui,sans-serif" }}>
      {children}
    </div>
  )
}
