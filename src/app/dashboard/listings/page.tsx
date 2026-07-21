/**
 * /dashboard/listings — the owner-facing screen for the directories other than Google
 * ("Get listed everywhere", listings-sync).
 *
 * Two doors, same as the other three walkthroughs:
 *  - plain: reached from More. See where your details are wrong and fix them.
 *  - ?campaignId=<id>: the post-ship task for that campaign; back returns to its setup page.
 *
 * The campaign door also seeds which directories the owner already ticked off, so a pass
 * survives closing the tab. Through the plain door there is no campaign to read that from,
 * so progress lasts the session, which is honest for a screen anyone can open any time.
 *
 * No tier gate: knowing your own address is wrong on Yelp is not a premium fact.
 */

import MvpShell from '@/components/mvp/mvp-shell'
import { MvpDetailHeader } from '@/components/mvp/mvp-detail'
import ListingsFix from '@/components/mvp/listings-fix'
import { getCampaign } from '@/lib/campaigns/server'

export default async function ListingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const raw = typeof sp.campaignId === 'string' ? sp.campaignId : undefined
  // Same sanitize as the other doors: ids are uuid-shaped, nothing else passes.
  const campaignId = raw && /^[A-Za-z0-9-]{1,64}$/.test(raw) ? raw : undefined

  // Read-only, and only to seed the checklist. The component re-reads the live plan itself.
  const fixed = campaignId
    ? await getCampaign(campaignId).then((c) => c?.execution?.citationsFixed ?? []).catch(() => [])
    : []

  return (
    <MvpShell
      active="more"
      header={(
        <MvpDetailHeader
          title="Your other listings"
          subtitle="Yelp, Apple Maps and the rest, matching Google"
          backHref={campaignId ? `/dashboard/campaigns/${campaignId}/ready` : '/dashboard/more'}
          backLabel={campaignId ? 'Campaign' : 'More'}
        />
      )}
    >
      <ListingsFix campaignId={campaignId} initialFixed={fixed} />
    </MvpShell>
  )
}
