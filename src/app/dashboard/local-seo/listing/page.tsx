/**
 * /dashboard/local-seo/listing — edit the public Google Business
 * Profile listing fields right from the portal.
 *
 * Fetches current values from v1 mybusinessbusinessinformation on
 * page load, lets the owner change them, PATCHes them back. v1 only —
 * no v4 dependency, so this works even while the v4 review/posts
 * approval is in flight.
 */

import ListingEditor from './listing-editor'

export const dynamic = 'force-dynamic'

export default function ListingPage() {
  return <ListingEditor />
}
