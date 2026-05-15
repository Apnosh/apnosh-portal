/**
 * /dashboard/social/ads -- the client's home for paid media.
 *
 * Promoted out of /dashboard/social/calendar?view=boost so it's a
 * first-class destination. Restaurants who only want to run ads
 * (foot traffic, lead gen, etc.) shouldn't have to navigate through
 * the content calendar to find the form.
 *
 * Renders the BoostView with a campaign-type picker at the top so
 * the same flow covers post boosts AND non-post objectives.
 */

import { redirect } from 'next/navigation'
import { Megaphone } from 'lucide-react'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { getSocialHub } from '@/lib/dashboard/get-social-hub'
import { getActiveCampaigns, getPastCampaigns } from '@/lib/dashboard/get-campaigns'
import BoostView from '../boost/boost-view'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ clientId?: string; postId?: string }>
}

export default async function SocialAdsPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const { user, isAdmin, clientId } = await resolveCurrentClient(sp.clientId ?? null)
  if (!user) redirect('/login')

  if (!clientId) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center text-ink-3">
        {isAdmin
          ? 'Pick a client from /dashboard to see their ad flow.'
          : 'Sign in as a client to run ads.'}
      </div>
    )
  }

  const [hub, active, past] = await Promise.all([
    getSocialHub(clientId),
    getActiveCampaigns(clientId),
    getPastCampaigns(clientId),
  ])

  return (
    <div className="max-w-[1100px] mx-auto px-4 lg:px-6 pt-6 pb-20 space-y-5">
      {/* Page title */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">
          Social
        </p>
        <h1 className="text-[26px] font-semibold text-ink leading-tight mt-1 flex items-center gap-2">
          <Megaphone className="w-6 h-6 text-ink-4" />
          Ads
        </h1>
        <p className="text-ink-3 text-sm mt-0.5">
          Tell us what you want to run. Your strategist confirms targeting and launches in Meta Ads Manager within hours.
        </p>
      </div>

      <BoostView
        clientId={clientId}
        preselectedPostId={sp.postId ?? null}
        candidates={hub.recent.slice(0, 6)}
        topPerformer={hub.topPerformer}
        activeCampaigns={active}
        pastCampaigns={past}
      />
    </div>
  )
}
