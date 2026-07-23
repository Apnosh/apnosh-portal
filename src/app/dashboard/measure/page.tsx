/**
 * /dashboard/measure — the owner-facing "Get measurable" setup: Search Console and Analytics.
 *
 * The setup before the other setups. Every Google campaign assumes the client can already be
 * measured; for a new client that is not true, and nothing else in the portal had a path to fix
 * it. This is that path.
 *
 * Two doors, same as the other walkthroughs:
 *  - plain: reached from More and from the insights screen when a tool is missing.
 *  - ?campaignId=<id>: the post-ship task for a campaign that needs measurement; back returns
 *    to its setup page.
 *
 * No tier gate. Being able to tell whether your marketing works is not a premium feature, it is
 * the thing that makes every other feature honest.
 */

import MvpShell from '@/components/mvp/mvp-shell'
import { MvpDetailHeader } from '@/components/mvp/mvp-detail'
import MeasureSetup from '@/components/mvp/measure-setup'

export default async function MeasurePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const raw = typeof sp.campaignId === 'string' ? sp.campaignId : undefined
  const campaignId = raw && /^[A-Za-z0-9-]{1,64}$/.test(raw) ? raw : undefined
  return (
    <MvpShell
      active="more"
      header={(
        <MvpDetailHeader
          title="Get measurable"
          subtitle="The two tools that show whether your marketing works"
          backHref={campaignId ? `/dashboard/campaigns/${campaignId}/ready` : '/dashboard/more'}
          backLabel={campaignId ? 'Campaign' : 'More'}
        />
      )}
    >
      <MeasureSetup campaignId={campaignId} />
    </MvpShell>
  )
}
