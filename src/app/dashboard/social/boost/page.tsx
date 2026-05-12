/**
 * /dashboard/social/boost — paid reach for the owner.
 *
 * Three sections:
 *   1. Smart boost   — top 3 winning posts in the last 30 days.
 *      One-click "boost this" → opens a small budget / duration sheet
 *      that creates a request the strategist confirms before launch.
 *   2. Active campaigns — what's currently running, with reach / clicks
 *      so far and inline pause / extend / increase controls. v1 stub:
 *      empty state with explanatory copy.
 *   3. Budget & results — monthly ad budget, used vs. remaining,
 *      estimated foot-traffic attributable to ads.
 *
 * Submit handler writes to ad_campaigns (status='pending') so the
 * strategist sees it in /work/boosts and launches it. Direct Meta
 * Ads Manager API launch can replace the manual step later.
 */

import { redirect } from 'next/navigation'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { getSocialHub } from '@/lib/dashboard/get-social-hub'
import { getActiveCampaigns, getPastCampaigns } from '@/lib/dashboard/get-campaigns'
import BoostView from './boost-view'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ clientId?: string; postId?: string }>
}

export default async function BoostPage({ searchParams }: PageProps) {
  const params = await searchParams
  const { user, clientId } = await resolveCurrentClient(params.clientId ?? null)
  if (!user) redirect('/login')
  if (!clientId) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center text-ink-3">
        Sign in as a client to manage boosts.
      </div>
    )
  }

  // Pull everything in parallel: candidate posts from the hub, plus
  // active and past campaigns for the rails below the form.
  const [hub, activeCampaigns, pastCampaigns] = await Promise.all([
    getSocialHub(clientId),
    getActiveCampaigns(clientId),
    getPastCampaigns(clientId),
  ])

  return (
    <BoostView
      clientId={clientId}
      preselectedPostId={params.postId ?? null}
      candidates={hub.recent.slice(0, 6)}
      topPerformer={hub.topPerformer}
      activeCampaigns={activeCampaigns}
      pastCampaigns={pastCampaigns}
    />
  )
}
