/**
 * /dashboard/social-profiles — the owner-facing walkthrough for the "Set up your social
 * profiles" card (social-profiles service).
 *
 * Two doors, same as the other walkthroughs:
 *  - plain: reached from More. Fix your profiles whenever you like.
 *  - ?campaignId=<id>: the post-ship task for that campaign; back returns to its setup page.
 *
 * The campaign door seeds which platforms the owner already ticked off, so a pass survives
 * closing the tab. Through the plain door progress lasts the session.
 *
 * No tier gate: the checklist and your own facts are free, like the listings walkthrough.
 */

import MvpShell from '@/components/mvp/mvp-shell'
import { MvpDetailHeader } from '@/components/mvp/mvp-detail'
import SocialProfilesFix from '@/components/mvp/social-profiles-fix'
import { getCampaign } from '@/lib/campaigns/server'

export default async function SocialProfilesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const raw = typeof sp.campaignId === 'string' ? sp.campaignId : undefined
  const campaignId = raw && /^[A-Za-z0-9-]{1,64}$/.test(raw) ? raw : undefined

  const fixed = campaignId
    ? await getCampaign(campaignId).then((c) => (c?.execution?.socialProfilesFixed as string[] | undefined) ?? []).catch(() => [])
    : []

  return (
    <MvpShell
      active="more"
      header={(
        <MvpDetailHeader
          title="Your social profiles"
          subtitle="Five platforms, complete and matching"
          backHref={campaignId ? `/dashboard/campaigns/${campaignId}/ready` : '/dashboard/more'}
          backLabel={campaignId ? 'Campaign' : 'More'}
        />
      )}
    >
      <SocialProfilesFix campaignId={campaignId} initialFixed={fixed} />
    </MvpShell>
  )
}
