/**
 * /work/inbox — strategist's unified message inbox.
 *
 * Reuses the admin messages page component. RLS scopes the threads
 * visible to assigned clients only (migration 105). Admin viewing
 * this page sees all messages.
 */

import { requireCapability } from '@/lib/auth/require-capability'
import AdminMessagesClient from '@/app/admin/messages/page'

export const dynamic = 'force-dynamic'

export default async function WorkInboxPage() {
  await requireCapability('strategist')
  return <AdminMessagesClient />
}
