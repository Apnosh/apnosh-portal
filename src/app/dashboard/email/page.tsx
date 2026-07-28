/**
 * /dashboard/email — the owner-facing "Land in the inbox" setup: SPF, DKIM and DMARC.
 *
 * Two doors, same as the other walkthroughs:
 *  - plain: reached from More.
 *  - ?campaignId=<id>: the post-ship task for a campaign that sends email; back returns to its
 *    setup page.
 *
 * No tier gate, for the same reason the measure card has none: an owner whose email lands in spam
 * is not getting a lesser version of the product, they are getting nothing at all.
 */

import MvpShell from '@/components/mvp/mvp-shell'
import { MvpDetailHeader } from '@/components/mvp/mvp-detail'
import EmailFix from '@/components/mvp/email-fix'

export default async function EmailPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const raw = typeof sp.campaignId === 'string' ? sp.campaignId : undefined
  const campaignId = raw && /^[A-Za-z0-9-]{1,64}$/.test(raw) ? raw : undefined
  return (
    <MvpShell
      active="more"
      header={(
        <MvpDetailHeader
          title="Land in the inbox"
          subtitle="What your domain says about who may send as you"
          backHref={campaignId ? `/dashboard/campaigns/${campaignId}/ready` : '/dashboard/more'}
          backLabel={campaignId ? 'Campaign' : 'More'}
        />
      )}
    >
      <EmailFix campaignId={campaignId} />
    </MvpShell>
  )
}
