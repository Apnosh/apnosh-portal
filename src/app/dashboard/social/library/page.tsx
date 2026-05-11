/**
 * /dashboard/social/library — read-only library of the client's
 * drafts, hashtag bundles, and previously used media. Helpful
 * reference surface so the strategist + client can both look at
 * the same "what do we have to work with" view.
 */

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getLibrary } from '@/lib/dashboard/get-library'
import LibraryView from './library-view'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ clientId?: string }>
}

export default async function LibraryPage({ searchParams }: PageProps) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const sp = await searchParams
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  const isAdmin = (profile?.role as string | null) === 'admin'

  let clientId: string | null = null
  if (isAdmin) {
    clientId = sp.clientId ?? null
  } else {
    const { data: business } = await supabase
      .from('businesses')
      .select('client_id')
      .eq('owner_id', user.id)
      .maybeSingle()
    clientId = (business?.client_id as string | null) ?? null
    if (!clientId) {
      const { data: cu } = await supabase
        .from('client_users')
        .select('client_id')
        .eq('auth_user_id', user.id)
        .maybeSingle()
      clientId = (cu?.client_id as string | null) ?? null
    }
  }

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
