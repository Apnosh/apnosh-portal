/**
 * /dashboard/social/engage — unified comments + DMs + mentions inbox.
 *
 * Server resolves clientId then hands off to a client component that
 * fetches comments/DMs live via /api/social/inbox and renders them
 * with AI-suggested replies inline.
 */

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import EngageView from './engage-view'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ clientId?: string }>
}

export default async function EngagePage({ searchParams }: PageProps) {
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
        Sign in as a client to see your engage inbox.
      </div>
    )
  }

  // Pre-flight: do they actually have any connected accounts? Save the
  // client a wasted Meta call if not.
  const admin = createAdminClient()
  const { data: conns } = await admin
    .from('platform_connections')
    .select('platform')
    .eq('client_id', clientId)
    .not('access_token', 'is', null)

  return (
    <EngageView
      clientId={clientId}
      connectedPlatforms={(conns ?? []).map(c => c.platform as string)}
    />
  )
}
