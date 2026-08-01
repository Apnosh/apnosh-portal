/**
 * /dashboard/design/order — the graphic configurator, the real door (DESIGN-ORDERING Phase B).
 *
 * Reached from the store's "Get a graphic made" card. The menu chips are the signed-in
 * client's REAL menu items (never asked what we already hold); the photo library is the
 * shared fixture set until the real asset store lands (reuse flag 1).
 *
 * While RATE_CARD.approved is false the flow itself shows the amber test-prices banner on
 * every step, so this surface is safe to open during owner testing and must not be sold
 * until the reviewed rate card flips the flag.
 */

import DesignOrderFlow from '@/components/design/design-order-flow'
import { FIXTURE_ASSETS, FIXTURE_MENU } from '@/lib/design/fixture-assets'
import { listMyMenuItems } from '@/lib/dashboard/menu-actions'

export const metadata = { title: 'Get a graphic made' }
export const dynamic = 'force-dynamic'

export default async function DesignOrderPage() {
  /* The signed-in client's real menu feeds the Featuring chips. An empty or failed read
   * falls back to nothing-to-feature rather than fake dishes; fixtures are preview-only. */
  const res = await listMyMenuItems().catch(() => null)
  const menu =
    res && res.success && res.data.length > 0
      ? res.data.map((m) => ({ id: m.id, name: m.name }))
      : process.env.NODE_ENV !== 'production'
        ? FIXTURE_MENU
        : []

  return (
    <div style={{ maxWidth: 430, margin: '0 auto', minHeight: '100dvh', background: '#F5F5F7' }}>
      <DesignOrderFlow menu={menu} assets={FIXTURE_ASSETS} />
    </div>
  )
}
