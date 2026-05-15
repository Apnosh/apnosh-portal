/**
 * Legacy route. The "Results" deep dive now lives inside
 * /dashboard/social/performance as the "Deep dive" tab.
 *
 * Old bookmarks and any AM-shared links keep working through this
 * redirect.
 */

import { redirect } from 'next/navigation'

export default function LegacyResultsRedirect() {
  redirect('/dashboard/social/performance?view=deep')
}
