/**
 * /creator/earnings — "Get paid". What the creator has earned, and their Stripe payout status. They
 * connect their own bank through Stripe's hosted onboarding; Apnosh transfers their net (after the
 * platform fee) to that account when a piece is approved and the client's invoice is paid.
 *
 * Payouts are gated on STRIPE_CONNECT_PAYOUTS (test mode) until turned on — the page is honest about
 * that state rather than showing a dead "connect" button.
 */

import { currentVendor } from '@/lib/marketplace/creator-schedule'
import { getVendorConnectStatus } from '@/lib/campaigns/vendor-connect'
import { getCreatorEarnings, getCreatorPayoutLines } from '@/lib/campaigns/work-orders'
import EarningsView from '@/components/creator/earnings-view'

export const dynamic = 'force-dynamic'

export default async function CreatorEarningsPage() {
  const vendor = await currentVendor()
  if (!vendor) {
    return (
      <div className="max-w-md mx-auto text-center pt-24 px-6">
        <h1 className="text-lg font-semibold text-neutral-900">You are not set up as a creator yet</h1>
        <p className="text-sm text-neutral-500 mt-2 leading-relaxed">Once your account is a creator, this is where you connect your bank and see what you have earned.</p>
      </div>
    )
  }

  const [earnings, lines, connect] = await Promise.all([
    getCreatorEarnings(vendor.id),
    getCreatorPayoutLines(vendor.id),
    getVendorConnectStatus(vendor.id),
  ])
  const payoutsLive = process.env.STRIPE_CONNECT_PAYOUTS === '1'

  return <EarningsView earnings={earnings} lines={lines} connect={connect} payoutsLive={payoutsLive} />
}
