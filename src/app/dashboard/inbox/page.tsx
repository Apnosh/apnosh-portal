/**
 * /dashboard/inbox — the unified inbox.
 *
 * Surfaces everything that needs the owner's attention in one place:
 * content approvals, post reviews, customer reviews, and tasks.
 * Per docs/PRODUCT-SPEC.md: "every action is one click" -- the inbox
 * is the action surface that delivers on that promise.
 */

import { redirect } from 'next/navigation'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { getInbox } from '@/lib/dashboard/get-inbox'
import InboxView from './inbox-view'

export const dynamic = 'force-dynamic'

export default async function InboxPage() {
  const { user, clientId } = await resolveCurrentClient()
  if (!user) redirect('/login')
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
