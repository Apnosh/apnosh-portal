'use client'

import type React from 'react'

import ApnoshCampaignRaw from '@/components/mvp/campaign-builder/apnosh-campaign'

/* The ported JSX narrows its inferred props from defaults (same issue builder-entry
 * re-types around); re-type the preview's slice of the surface. */
const ApnoshCampaign = ApnoshCampaignRaw as unknown as React.FC<{
  restaurant?: string
  onScratch?: () => void
  creatorCards?: unknown[]
}>

/* Fixture creator cards for the no-login preview ONLY, mirroring the seeded example
 * vendors so the Creators shelf is visible for design review. Every name says (Example)
 * on purpose. The real store feeds this from bookable vendors' active listings and the
 * shelf hides itself while that supply is empty. */
const FIXTURE_CREATORS = [
  { id: 'creator:example-maya-video:reel-pack', vendorSlug: 'example-maya-video', vendorName: 'Maya Rivera (Example)', listingSlug: 'reel-pack', title: 'Reel Pack', category: 'videographer', shelf: 'content', priceLabel: '$350', lead: '3 short reels shot at your place', href: '#', description: '3 short reels shot at your place', deliverables: ['3 edited reels', 'Shot on site', 'Ready to post'], tiers: [] },
  { id: 'creator:example-leo-photo:dish-photo-day', vendorSlug: 'example-leo-photo', vendorName: 'Leo Tanaka (Example)', listingSlug: 'dish-photo-day', title: 'Dish Photo Day', category: 'photographer', shelf: 'content', priceLabel: '$400', lead: '20 finished dish photos', href: '#', description: '20 finished dish photos', deliverables: ['20 edited photos', 'Your best plates', 'Full usage rights'], tiers: [] },
  { id: 'creator:example-priya-social:tasting-visit-post', vendorSlug: 'example-priya-social', vendorName: 'Priya Nair (Example)', listingSlug: 'tasting-visit-post', title: 'Tasting Visit + Post', category: 'food_influencer', shelf: 'content', priceLabel: '$200', lead: 'A visit and a post to their audience', href: '#', description: 'A visit and a post to their audience', deliverables: ['1 feed post', '1 story', 'Tagged location'], tiers: [] },
  { id: 'creator:example-sofia-manager:monthly-social-management', vendorSlug: 'example-sofia-manager', vendorName: 'Sofia Reyes (Example)', listingSlug: 'monthly-social-management', title: 'Monthly Social Management', category: 'social_manager', shelf: 'content', priceLabel: '$400/mo', lead: 'Posting handled, every week', href: '#', description: 'Posting handled, every week', deliverables: ['8 posts a month', 'Captions written', 'Comments answered'], tiers: [], recurring: true },
]

export default function BrowsePreviewView() {
  return (
    <div style={{ maxWidth: 430, margin: '0 auto', minHeight: '100dvh' }}>
      <ApnoshCampaign restaurant="Yellow Bee Market" onScratch={() => {}} creatorCards={FIXTURE_CREATORS} />
    </div>
  )
}
