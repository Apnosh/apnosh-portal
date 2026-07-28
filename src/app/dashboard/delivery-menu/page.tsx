/**
 * /dashboard/delivery-menu — the owner-facing "Price your delivery menu" screen.
 */
import MvpShell from '@/components/mvp/mvp-shell'
import { MvpDetailHeader } from '@/components/mvp/mvp-detail'
import DeliveryMenu from '@/components/mvp/delivery-menu'

export default async function DeliveryMenuPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const raw = typeof sp.campaignId === 'string' ? sp.campaignId : undefined
  const campaignId = raw && /^[A-Za-z0-9-]{1,64}$/.test(raw) ? raw : undefined
  return (
    <MvpShell
      active="more"
      header={(
        <MvpDetailHeader
          title="Price your delivery menu"
          subtitle="What to charge once the app takes its cut"
          backHref={campaignId ? `/dashboard/campaigns/${campaignId}/ready` : '/dashboard/more'}
          backLabel={campaignId ? 'Campaign' : 'More'}
        />
      )}
    >
      <DeliveryMenu campaignId={campaignId} />
    </MvpShell>
  )
}
