/**
 * /dashboard/order-buttons — the owner-facing screen for the Order and Reserve
 * buttons on their Google listing ("Smooth out ordering", google-food-order).
 *
 * Two doors, same as the Google-profile screen:
 *  - plain: reached from More. See what your buttons do today and fix them.
 *  - ?campaignId=<id>: the post-ship task for that campaign; back returns to its
 *    setup page.
 *
 * No tier gate. Reading your own listing and putting your own link on it is not a
 * premium feature, and gating it would leave an owner staring at a commission leak
 * they are not allowed to close. The write is protected by the same client scoping
 * every dashboard route uses.
 */

import MvpShell from '@/components/mvp/mvp-shell'
import { MvpDetailHeader } from '@/components/mvp/mvp-detail'
import OrderButtons from '@/components/mvp/order-buttons'

export default async function OrderButtonsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const raw = typeof sp.campaignId === 'string' ? sp.campaignId : undefined
  // Same sanitize as the Google-profile door: ids are uuid-shaped, nothing else passes.
  const campaignId = raw && /^[A-Za-z0-9-]{1,64}$/.test(raw) ? raw : undefined
  return (
    <MvpShell
      active="more"
      header={(
        <MvpDetailHeader
          title="Your Google order buttons"
          subtitle="Where the Order and Reserve buttons send people"
          backHref={campaignId ? `/dashboard/campaigns/${campaignId}/ready` : '/dashboard/more'}
          backLabel={campaignId ? 'Campaign' : 'More'}
        />
      )}
    >
      <OrderButtons campaignId={campaignId} />
    </MvpShell>
  )
}
