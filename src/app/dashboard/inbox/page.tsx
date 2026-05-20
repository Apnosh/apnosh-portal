/**
 * /dashboard/inbox — Unified mobile-first inbox.
 *
 * Surfaces every "needs attention" item across approvals, reviews,
 * tasks, broken connections, and content drafts in a single
 * filterable feed. Replaces the old redirect-stub.
 *
 * Mobile-first design: filter chips along the top, vertical card
 * list below sized for thumb scrolling. Each card is a tap target
 * with urgency color, kind icon, title, preview, and relative time.
 * On wide screens (lg:) we render the same content with a tighter
 * 2-col layout — the data model is the same.
 *
 * The feed is dynamic (force-dynamic) because we want fresh counts
 * on every visit. Server-rendered for fast initial paint.
 */

import { redirect } from 'next/navigation'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { getInbox } from '@/lib/dashboard/get-inbox'
import InboxView from './inbox-view'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ clientId?: string; filter?: string }>
}

export default async function InboxPage({ searchParams }: PageProps) {
  const { clientId: clientIdParam, filter } = await searchParams
  const { user, clientId } = await resolveCurrentClient(clientIdParam ?? null)
  if (!user) redirect('/login')
  if (!clientId) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center text-ink-3">
        Sign in as a client to see your inbox.
      </div>
    )
  }

  const items = await getInbox(clientId, user.id)
  return <InboxView items={items} initialFilter={filter ?? 'all'} />
}
