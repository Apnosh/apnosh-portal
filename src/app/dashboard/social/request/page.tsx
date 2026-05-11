/**
 * /dashboard/social/request — streamlined "tell us what to post".
 *
 * One page. The old flow was: pick type -> dedicated graphic form (20
 * fields) or video form (25 fields). For a restaurant owner standing
 * on the line that's a brick wall. This collapses to: pick a type,
 * tell us about it, drop in any photos, hit send.
 *
 * Submission writes to client_tasks (visible_to_client=true,
 * assignee_type='admin') so it lands in the strategist's queue
 * immediately. Strategists convert into a full graphic / video brief
 * when they pick it up.
 */

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import RequestForm from './request-form'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ clientId?: string }>
}

export default async function RequestPage({ searchParams }: PageProps) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  const isAdmin = (profile?.role as string | null) === 'admin'

  let clientId: string | null = null
  if (isAdmin) {
    clientId = params.clientId ?? null
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
        Sign in as a client to request content.
      </div>
    )
  }

  return <RequestForm clientId={clientId} />
}
