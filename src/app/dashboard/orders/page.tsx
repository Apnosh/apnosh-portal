'use client'

/**
 * /dashboard/orders — the owner "Orders" tab: the MONEY story of every campaign
 * (cart → paying now → receipts). The Campaigns tab tells the results story of
 * the same campaigns. Renders its own MvpShell (this route is in MVP_EXACT in
 * the dashboard layout, so it gets no legacy back-header). The old à-la-carte
 * services storefront that used to live here was removed.
 */

import MvpShell from '@/components/mvp/mvp-shell'
import MvpOrders from '@/components/mvp/mvp-orders'

export default function OrdersPage() {
  return (
    <MvpShell active="orders">
      <MvpOrders />
    </MvpShell>
  )
}
