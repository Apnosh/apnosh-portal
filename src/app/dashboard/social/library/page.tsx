/**
 * /dashboard/social/library — read-only library of the client's
 * drafts, hashtag bundles, and previously used media. Helpful
 * reference surface so the strategist + client can both look at
 * the same "what do we have to work with" view.
 */

import { redirect } from 'next/navigation'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { getLibrary } from '@/lib/dashboard/get-library'
import LibraryView from './library-view'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ clientId?: string }>
}

export default async function LibraryPage({ searchParams }: PageProps) {
  const { clientId: clientIdParam } = await searchParams
  const { user, clientId } = await resolveCurrentClient(clientIdParam ?? null)
  if (!user) redirect('/login')
  if (!clientId) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center text-ink-3">
        Sign in as a client to see your library.
      </div>
    )
  }

  const data = await getLibrary(clientId)
  return <LibraryView data={data} />
}
