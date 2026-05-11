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
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import RequestForm from './request-form'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ clientId?: string }>
}

export default async function RequestPage({ searchParams }: PageProps) {
  const { clientId: clientIdParam } = await searchParams
  const { user, clientId } = await resolveCurrentClient(clientIdParam ?? null)
  if (!user) redirect('/login')
  if (!clientId) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center text-ink-3">
        Sign in as a client to request content.
      </div>
    )
  }

  return <RequestForm clientId={clientId} />
}
