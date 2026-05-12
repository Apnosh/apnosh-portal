/**
 * /work/today — strategist landing.
 *
 * The single workday surface for an account lead. Three rails:
 *   1. Approvals waiting (drafts, quotes, briefs that need a strategist
 *      decision)
 *   2. Sent quotes + pending boosts that need follow-through
 *   3. Tasks across every client they touch, grouped by urgency
 *
 * Today this surface mirrors /admin/today (which is gated to admins).
 * The difference: /work/today is gated to anyone with the strategist
 * capability — including non-admin staff who service a book of
 * clients. Long-term we'll scope rows to assigned_client_ids() so a
 * strategist sees only their book, while admin sees all.
 */

import { requireAnyCapability } from '@/lib/auth/require-any-capability'
import AdminTodayClient from '@/app/admin/today/page'

export const dynamic = 'force-dynamic'

export default async function WorkTodayPage() {
  await requireAnyCapability(["strategist","copywriter","designer","paid_media","community_mgr","local_seo","email_specialist","web_ops","onboarder","editor","data_analyst"])
  // Reuse the existing admin client component verbatim. It already
  // pulls cross-client data the strategist needs.
  return <AdminTodayClient />
}
