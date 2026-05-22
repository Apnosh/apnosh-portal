/**
 * /dashboard/analytics — the collaborative Plan calendar.
 *
 * Repurposed from the old GBP analytics view (now at /dashboard/insights)
 * into an owner-facing marketing planner. It shows a unified, viewer-
 * centric feed: the viewer's own plans, shoots they're on, and Apnosh's
 * scheduled content, merged across every restaurant they have a stake in.
 * /dashboard/calendar redirects here so there's a single source of truth.
 *
 * A photoshoot shows up for both the photographer and the owner; notes
 * can stay private or be sent to a strategist. See get-plan-feed.ts.
 */

import { redirect } from 'next/navigation'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { getPlanFeed, getAssignablePeople } from '@/lib/dashboard/get-plan-feed'
import { getHomeSections } from '@/lib/dashboard/get-home-sections'
import PlanView from './plan-view'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ clientId?: string }>
}

export default async function PlanPage({ searchParams }: PageProps) {
  const { clientId: clientIdParam } = await searchParams
  const { user, isAdmin, clientId } = await resolveCurrentClient(clientIdParam ?? null)
  if (!user) redirect('/login')

  // Scope: an explicit target, else the viewer's own resolved client, else
  // unscoped (agency / multi-restaurant users see everything + a switcher).
  const scope = clientIdParam ?? clientId ?? undefined
  const feed = await getPlanFeed(user.id, scope ? { clientId: scope } : undefined)

  // The active restaurant for "create" + suggestions + the people picker.
  const activeClientId = scope ?? feed.clients[0]?.id ?? null

  if (!activeClientId && feed.items.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center text-ink-3">
        {isAdmin
          ? 'Add ?clientId=<id> to the URL to plan for a specific client.'
          : 'Sign in as a client to start planning.'}
      </div>
    )
  }

  const [people, sections] = await Promise.all([
    activeClientId ? getAssignablePeople(activeClientId) : Promise.resolve([]),
    activeClientId
      ? getHomeSections(activeClientId).then(s => s.plan).catch(() => [])
      : Promise.resolve([]),
  ])

  return (
    <div className="-m-4 lg:-m-6">
      <PlanView
        feed={feed}
        opportunities={sections}
        people={people}
        activeClientId={activeClientId}
        isAdmin={isAdmin}
      />
    </div>
  )
}
