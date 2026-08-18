/**
 * /dashboard/design/order — the graphic configurator, the real door (DESIGN-ORDERING Phase B).
 *
 * Reached from the store's "Get a graphic made" card. The menu chips are the signed-in
 * client's REAL menu items, and the photo step is the client's REAL library: Photos & files
 * uploads plus menu dish photos (client-photos.ts). Fixtures only ever appear in dev when
 * the account genuinely has nothing.
 *
 * While RATE_CARD.approved is false the flow itself shows the amber test-prices banner on
 * every step, so this surface is safe to open during owner testing and must not be sold
 * until the reviewed rate card flips the flag.
 */

import DesignOrderFlow from '@/components/design/design-order-flow'
import MvpShell from '@/components/mvp/mvp-shell'
import { FIXTURE_ASSETS, FIXTURE_MENU } from '@/lib/design/fixture-assets'
import { listMyDesignPhotos } from '@/lib/design/client-photos'
import { listMyMenuItems } from '@/lib/dashboard/menu-actions'

export const metadata = { title: 'Get a graphic made' }
export const dynamic = 'force-dynamic'

export default async function DesignOrderPage() {
  /* The signed-in client's real menu feeds the Featuring chips. An empty or failed read
   * falls back to nothing-to-feature rather than fake dishes; fixtures are preview-only. */
  const [res, library] = await Promise.all([
    listMyMenuItems().catch(() => null),
    listMyDesignPhotos(),
  ])
  const menu =
    res && res.success && res.data.length > 0
      ? res.data.map((m) => ({ id: m.id, name: m.name }))
      : process.env.NODE_ENV !== 'production'
        ? FIXTURE_MENU
        : []
  const assets =
    library.photos.length > 0
      ? library.photos
      : process.env.NODE_ENV !== 'production'
        ? FIXTURE_ASSETS
        : []

  /* Inside the standard shell (owner ask 2026-08-18): the bottom nav must never
   * disappear on a creatives flow — it reads as leaving the app. */
  return (
    <MvpShell active="campaigns">
      <div style={{ maxWidth: 430, margin: '0 auto', minHeight: '100%', background: '#F5F5F7' }}>
        <DesignOrderFlow menu={menu} assets={assets} businessName={library.businessName} />
      </div>
    </MvpShell>
  )
}
