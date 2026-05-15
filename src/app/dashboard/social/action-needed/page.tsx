/**
 * Legacy route. "Action needed" now lives inside /dashboard/social/inbox
 * as the Approvals tab.
 */

import { redirect } from 'next/navigation'

export default function LegacyActionNeededRedirect() {
  redirect('/dashboard/social/inbox')
}
