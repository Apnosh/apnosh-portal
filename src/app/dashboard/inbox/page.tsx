/**
 * /dashboard/inbox — the unified inbox.
 *
 * Surfaces everything that needs the owner's attention in one place:
 * content approvals, post reviews, customer reviews, and tasks.
 * Per docs/PRODUCT-SPEC.md: "every action is one click" -- the inbox
 * is the action surface that delivers on that promise.
 */

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getInbox } from '@/lib/dashboard/get-inbox'
import InboxView from './inbox-view'

export const dynamic = 'force-dynamic'

export default async function InboxPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  let clientId: string | null = null
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
  if (!clientId) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center text-ink-3">
        Sign in as a client to see your inbox.
      </div>
    )
  }

  const items = await getInbox(clientId)
  return <InboxView items={items} />
}
