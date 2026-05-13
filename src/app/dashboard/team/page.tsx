/**
 * /dashboard/team — top-level "who's working for you" page.
 *
 * Lives at the dashboard root (not under /social) because the team
 * works across all service lines, not just social media. Two tabs:
 *   - Your team: primary contact + cards + open-requests rail
 *   - Add to your team: conversational ask + collapsible roster
 */

import { redirect } from 'next/navigation'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { getTeamForClient } from '@/lib/dashboard/get-team'
import { getOpenTeamRequests } from '@/lib/dashboard/get-team-requests'
import TeamView from './team-view'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ clientId?: string }>
}

export default async function TeamPage({ searchParams }: PageProps) {
  const { clientId: clientIdParam } = await searchParams
  const { user, clientId } = await resolveCurrentClient(clientIdParam ?? null)
  if (!user) redirect('/login')
  if (!clientId) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center text-ink-3">
        Sign in as a client to see your team.
      </div>
    )
  }

  const [team, openRequests] = await Promise.all([
    getTeamForClient(clientId),
    getOpenTeamRequests(clientId),
  ])
  return (
    <TeamView
      clientId={clientId}
      team={team}
      openRequests={openRequests}
    />
  )
}
