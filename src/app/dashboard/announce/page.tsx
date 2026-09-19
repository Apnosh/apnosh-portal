'use client'
/**
 * /dashboard/announce — what is the news? A page, not a popup (owner 2026-09-18). Tapping a kind
 * goes to its own page.
 */
import { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useClient } from '@/lib/client-context'
import MvpShell from '@/components/mvp/mvp-shell'
import AnnounceSheet from '@/components/mvp/create/announce-sheet'

export default function Page() { return <Suspense fallback={null}><Inner /></Suspense> }
function Inner() {
  const { client, loading } = useClient()
  const router = useRouter()
  const sp = useSearchParams()
  const q = sp.get('clientId') ? `?clientId=${sp.get('clientId')}` : ''
  if (loading || !client?.id) return null
  return (
    <MvpShell active="create" title="Announce" back={`/dashboard/campaigns/new${q}`} focus>
      <AnnounceSheet clientId={client.id} page onClose={() => router.push(`/dashboard/campaigns/new${q}`)} onPick={(k) => router.push(`/dashboard/announce/${k}${q}`)} />
    </MvpShell>
  )
}
