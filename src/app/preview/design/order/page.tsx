/**
 * /preview/design/order — the design order flow, no login (DESIGN-ORDERING Phase B testing).
 *
 * Same contract as /preview/campaign: a working surface fed by hand-written fixtures, reading
 * nothing. The menu and the photo library are constants below (the real photo library is
 * flagged infrastructure, reuse flag 1); the describe step calls the real /api/design/describe
 * and degrades to chips when it cannot. Prices come from the real engine and rate card, which
 * is why the placeholder banner shows: RATE_CARD.approved is false until the designer
 * job-history review lands.
 */

import DesignOrderFlow from '@/components/design/design-order-flow'
import { FIXTURE_ASSETS, FIXTURE_MENU } from '@/lib/design/fixture-assets'

export const metadata = { title: 'Design order, no login' }

export default function PreviewDesignOrderPage() {
  return (
    <div style={{ maxWidth: 430, margin: '0 auto', minHeight: '100dvh', background: '#F5F5F7' }}>
      <DesignOrderFlow menu={FIXTURE_MENU} assets={FIXTURE_ASSETS} businessName="The Rib Shack" />
    </div>
  )
}
