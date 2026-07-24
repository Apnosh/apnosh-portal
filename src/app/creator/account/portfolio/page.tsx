/**
 * /creator/account/portfolio — the creator's case-studies gallery. A logged-in, linked creator adds
 * photos of past work that show on their public page. Non-creators are bounced to their workspace.
 */

import { redirect } from 'next/navigation'
import { getMyCreatorProfile, getMyPortfolio } from '@/lib/marketplace/creator-store-actions'
import CaseStudies from '@/components/creator/case-studies'

export const dynamic = 'force-dynamic'

export default async function CreatorPortfolioPage() {
  const profile = await getMyCreatorProfile()
  if (!profile) redirect('/creator/work')
  const items = await getMyPortfolio()
  return <CaseStudies initial={items} />
}
