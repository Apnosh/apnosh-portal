/**
 * Legacy route. The editorial plan now lives inside
 * /dashboard/social/calendar as the Plan tab.
 */

import { redirect } from 'next/navigation'

export default function LegacyPlanRedirect() {
  redirect('/dashboard/social/calendar?view=plan')
}
