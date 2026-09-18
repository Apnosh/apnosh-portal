'use client'
/**
 * /dashboard/influencers — the influencer marketplace. Browse, a profile that leads with who
 * watches them, a brief, the plan. Its own back arrow, no nav underneath.
 */
import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useClient } from '@/lib/client-context'
import InfluencersPage from '@/components/mvp/influencers/influencers-page'

export default function Page() {
  return <Suspense fallback={<Centered>Loading…</Centered>}><Inner /></Suspense>
}
function Inner() {
  const { client, loading } = useClient()
  const sp = useSearchParams()
  if (loading) return <Centered>Loading…</Centered>
  if (!client?.id) return <Centered>Sign in as a client to see creators.</Centered>
  return <InfluencersPage clientId={client.id} initialSlug={sp.get('slug')} />
}
function Centered({ children }: { children: React.ReactNode }) {
  return <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', color: '#6e6e73', fontSize: 14, fontFamily: "'Inter',system-ui,sans-serif" }}>{children}</div>
}
