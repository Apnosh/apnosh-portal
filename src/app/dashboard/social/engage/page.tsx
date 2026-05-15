/**
 * Legacy route. The engage inbox now lives inside /dashboard/social/inbox
 * as the Messages tab.
 */

import { redirect } from 'next/navigation'

export default function LegacyEngageRedirect() {
  redirect('/dashboard/social/inbox?tab=engage')
}
