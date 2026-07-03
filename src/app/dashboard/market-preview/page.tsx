import { notFound } from 'next/navigation'

/**
 * The marketplace prototype that lived here rendered fabricated creators, ratings,
 * prices, and a "you only pay as each ships" guarantee as if it were a real booking
 * flow. It is not wired to anything, so the route is retired until there is real
 * supply. (History is in git if the prototype is needed for reference.)
 */
export default function MarketPreviewRetired() {
  notFound()
}
