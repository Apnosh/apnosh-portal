/**
 * /creator/storefront — where a creator publishes and prices their own packages.
 *
 * The seller side of the creative marketplace. A logged-in, linked creator (vendors.person_id =
 * their auth id) sees their packages and can add, price, and publish them. This is the surface
 * that makes "contractors set their own pricing and options" literally true.
 *
 * Server component: resolves the creator's store once, then hands it to the client editor. A
 * visitor who is not a linked creator sees an honest "not set up yet" state rather than an error.
 */

import { getMyStore } from '@/lib/marketplace/creator-store-actions'
import StorefrontEditor from '@/components/creator/storefront-editor'

export const dynamic = 'force-dynamic'

export default async function CreatorStorefrontPage() {
  const store = await getMyStore()
  return <StorefrontEditor initialVendor={store.vendor} initialPackages={store.packages} />
}
