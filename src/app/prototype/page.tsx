/**
 * /prototype — the create experience at full potential, as a thing you can click.
 *
 * Deliberately outside the dashboard: no auth, no chrome, no client resolution, no database.
 * It answers "what would this feel like if we had a deep bench and every campaign was really
 * deliverable", and it is meant to be thrown away or promoted whole.
 */

import Shop from '@/components/prototype/shop'

export const metadata = {
  title: 'Prototype · the shop',
  description: 'Create-page prototype. Everything in it is invented.',
}

// Nothing to prerender against, and no reason to cache a pure client toy.
export const dynamic = 'force-static'

export default function PrototypePage() {
  return <Shop />
}
