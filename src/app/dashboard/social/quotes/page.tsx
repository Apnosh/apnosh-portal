/**
 * Legacy route. The quotes list now lives inside /dashboard/social/inbox
 * as the Quotes tab. Detail pages at /social/quotes/[id] are unaffected.
 */

import { redirect } from 'next/navigation'

export default function LegacyQuotesIndexRedirect() {
  redirect('/dashboard/social/inbox?tab=quotes')
}
