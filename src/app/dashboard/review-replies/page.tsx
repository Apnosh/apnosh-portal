/**
 * /dashboard/review-replies — the owner-facing screen for replying to the Google reviews
 * still waiting ("Reply to reviews", review-responses).
 *
 * Two doors, same as the order-button and Google-profile screens:
 *  - plain: reached from More. See what is waiting and answer it.
 *  - ?campaignId=<id>: the post-ship task for that campaign; back returns to its setup page.
 *
 * No tier gate. Reading your own reviews and answering them is not a premium feature, and
 * an owner who cannot reply to a one-star because of their plan is a worse outcome for
 * everyone. What the Pro tier buys on this card is the team doing it every month, not
 * permission to speak to your own guests.
 */

import MvpShell from '@/components/mvp/mvp-shell'
import { MvpDetailHeader } from '@/components/mvp/mvp-detail'
import ReviewReplies from '@/components/mvp/review-replies'

export default async function ReviewRepliesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const raw = typeof sp.campaignId === 'string' ? sp.campaignId : undefined
  // Same sanitize as the other two doors: ids are uuid-shaped, nothing else passes.
  const campaignId = raw && /^[A-Za-z0-9-]{1,64}$/.test(raw) ? raw : undefined
  return (
    <MvpShell
      active="more"
      header={(
        <MvpDetailHeader
          title="Reply to your reviews"
          subtitle="The ones still waiting, worst first"
          backHref={campaignId ? `/dashboard/campaigns/${campaignId}/ready` : '/dashboard/more'}
          backLabel={campaignId ? 'Campaign' : 'More'}
        />
      )}
    >
      <ReviewReplies campaignId={campaignId} />
    </MvpShell>
  )
}
