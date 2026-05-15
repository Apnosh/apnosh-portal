/**
 * /dashboard/social — the publisher's hub.
 *
 * Reading order, top to bottom:
 *   1. Header           — page title + primary CTA
 *   2. Needs you alert  — only when approvals or quotes are waiting
 *   3. Stat strip       — Posts, Reach, Engagement with trend deltas
 *   4. Recent feed      — IG-style 5-col grid + Coming up sidebar
 *   5. Platform pulse   — per-platform follower count + delta
 *   6. What's working   — top performer
 *   7. Plan + Quotes    — current plan usage + pending estimates
 *   8. Last boost       — most recent campaign result
 *
 * Two parallel server fetches: getSocialHub for the core data and
 * getSocialBreakdown for per-platform metrics that power the pulse strip.
 */

import { redirect } from 'next/navigation'
import { getSocialHub } from '@/lib/dashboard/get-social-hub'
import { getSocialBreakdown } from '@/lib/dashboard/get-social-breakdown'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import SocialHubView from './hub-view'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ clientId?: string }>
}

export default async function SocialHubPage({ searchParams }: PageProps) {
  const { clientId: clientIdParam } = await searchParams
  const { user, isAdmin, clientId } = await resolveCurrentClient(clientIdParam ?? null)
  if (!user) redirect('/login')

  if (!clientId) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center text-ink-3">
        {isAdmin
          ? 'Pick a client from /dashboard to see their social hub.'
          : 'Sign in as a client to see your social media.'}
      </div>
    )
  }

  const [data, breakdown] = await Promise.all([
    getSocialHub(clientId),
    getSocialBreakdown(clientId),
  ])

  return <SocialHubView data={data} breakdown={breakdown} />
}
