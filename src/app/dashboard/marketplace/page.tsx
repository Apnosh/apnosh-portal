/**
 * /dashboard/marketplace — multi-category vendor marketplace.
 *
 * Browse agencies, freelancers, and creators who serve restaurants.
 * Apnosh's own bundles (Starter Plate through Empire) appear as
 * featured listings; everyone else is third-party. Geographic scope
 * is Washington-only for v1.
 *
 * Distinct from /dashboard/team. Team is the client's ongoing roster.
 * Marketplace is discovery + booking — the supply side of restaurant
 * marketing help.
 */

import { redirect } from 'next/navigation'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import {
  getMarketplaceVendors,
  getMarketplaceCategoryCounts,
} from '@/lib/dashboard/get-marketplace'
import MarketplaceV2View from './marketplace-v2-view'

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

  const [vendors, categoryCounts] = await Promise.all([
    getMarketplaceVendors({ state: 'WA', featureApnosh: true }),
    getMarketplaceCategoryCounts('WA'),
  ])

  return <MarketplaceV2View vendors={vendors} categoryCounts={categoryCounts} />
}
