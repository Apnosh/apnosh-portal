/**
 * /dashboard/marketplace — one-off creator bookings.
 *
 * Distinct from /dashboard/team. Team is ongoing roster; Marketplace
 * is per-engagement: book a food influencer for a single feature,
 * book a photographer for one shoot, etc. Each booking is a
 * separate transaction handled offline by the strategist.
 */

import { redirect } from 'next/navigation'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { getMarketplaceCreators } from '@/lib/dashboard/get-marketplace'
import MarketplaceView from './marketplace-view'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ clientId?: string }>
}

export default async function MarketplacePage({ searchParams }: PageProps) {
  const { clientId: clientIdParam } = await searchParams
  const { user, clientId } = await resolveCurrentClient(clientIdParam ?? null)
  if (!user) redirect('/login')
  if (!clientId) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center text-ink-3">
        Sign in as a client to see the marketplace.
      </div>
    )
  }

  /* Default to Washington for v1. The state filter is in the URL so
     deep-links survive future expansion. */
  const creators = await getMarketplaceCreators({ state: 'WA' })
  return <MarketplaceView clientId={clientId} creators={creators} />
}
