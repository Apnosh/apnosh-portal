/**
 * /dashboard/social/team — Section 1: Your team.
 *
 * Primary contact card (full-width, with current focus + working-now)
 * followed by a grid of standard team-member cards in role priority
 * order. Single "Message your team" CTA above the primary contact —
 * that's the recommended channel; individual message is available
 * but de-emphasized.
 *
 * Section 2 (marketplace / available specialists) is a follow-up slice.
 * This page degrades gracefully into a clear empty state if the team
 * hasn't been assembled yet.
 */

import { redirect } from 'next/navigation'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { getTeamForClient } from '@/lib/dashboard/get-team'
import { getAvailableSpecialists } from '@/lib/dashboard/get-available-specialists'
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

  const [team, available] = await Promise.all([
    getTeamForClient(clientId),
    getAvailableSpecialists(clientId),
  ])
  return (
    <TeamView
      clientId={clientId}
      team={team}
      available={available}
    />
  )
}
