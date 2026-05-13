/**
 * /dashboard/inbox — customer conversations inbox (Direction D from Claude Design).
 *
 * Unified feed of every place a customer reaches the restaurant: reviews
 * (Google/Yelp), Instagram DMs, IG comments, mentions. Two-pane layout —
 * thread list on the left, detail with strategist's draft reply on the
 * right. Severity colors drive urgency (urgent / soon / no-rush / handled).
 *
 * Action items (approvals, broken connections, tasks) moved to the
 * dashboard "Needs you today" rail per the redesign.
 */

import { redirect } from 'next/navigation'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { getInboxThreads } from '@/lib/dashboard/get-inbox-threads'
import { getPrimaryStrategist } from '@/lib/dashboard/get-primary-strategist'
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

  const [threads, strategist] = await Promise.all([
    getInboxThreads(clientId, 50),
    getPrimaryStrategist(clientId),
  ])
  return <InboxView threads={threads} strategist={strategist} />
}
