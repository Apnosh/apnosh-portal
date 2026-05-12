/**
 * /work/calendar — strategist's cross-client scheduling view.
 *
 * Reuses the admin calendar. RLS scopes events to the strategist's
 * assigned book; admins see everything.
 */

import { requireCapability } from '@/lib/auth/require-capability'
import AdminCalendarClient from '@/app/admin/calendar/page'

export const dynamic = 'force-dynamic'

export default async function WorkCalendarPage() {
  await requireCapability('strategist')
  return <AdminCalendarClient />
}
