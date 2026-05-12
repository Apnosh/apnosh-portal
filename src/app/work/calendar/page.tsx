/**
 * /work/calendar — strategist's cross-client scheduling view.
 *
 * Reuses the admin calendar. RLS scopes events to the strategist's
 * assigned book; admins see everything.
 */

import { requireAnyCapability } from '@/lib/auth/require-any-capability'
import AdminCalendarClient from '@/app/admin/calendar/page'

export const dynamic = 'force-dynamic'

export default async function WorkCalendarPage() {
  await requireAnyCapability(["strategist","copywriter","paid_media"])
  return <AdminCalendarClient />
}
