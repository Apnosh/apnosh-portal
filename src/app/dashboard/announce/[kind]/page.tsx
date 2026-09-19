'use client'
/**
 * /dashboard/announce/[kind] — one announcement, as a page. The same flow the sheet runs,
 * under the app shell with its own back arrow.
 */
import { Suspense, use } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useClient } from '@/lib/client-context'
import MvpShell from '@/components/mvp/mvp-shell'
import AnnounceSheet, { type AnnounceKind } from '@/components/mvp/create/announce-sheet'

const KINDS: AnnounceKind[] = ['dish', 'hours', 'deal', 'event', 'hiring', 'open', 'holiday', 'else', 'slow', 'post', 'update']
const TITLE: Record<AnnounceKind, string> = { dish: 'New dish', hours: 'Hours changed', deal: 'A deal', event: 'An event', hiring: 'Hiring', open: 'Opening', holiday: 'A holiday', else: 'Something else', slow: 'Slow night', post: 'A post', update: 'Update' }

export default function Page({ params }: { params: Promise<{ kind: string }> }) {
  const { kind } = use(params)
  return <Suspense fallback={null}><Inner kind={kind} /></Suspense>
}
function Inner({ kind }: { kind: string }) {
  const { client, loading } = useClient()
  const router = useRouter()
  const sp = useSearchParams()
  const q = sp.get('clientId') ? `?clientId=${sp.get('clientId')}` : ''
  const k = KINDS.includes(kind as AnnounceKind) ? (kind as AnnounceKind) : null
  if (loading || !client?.id) return null
  if (!k) { router.replace(`/dashboard/announce${q}`); return null }
  const back = k === 'post' || k === 'update' || k === 'slow' ? `/dashboard/campaigns/new${q}` : `/dashboard/announce${q}`
  return (
    <MvpShell active="create" title={TITLE[k]} back={back} focus>
      <AnnounceSheet clientId={client.id} page initialKind={k} onClose={() => router.push(`/dashboard/campaigns/new${q}`)} />
    </MvpShell>
  )
}
