/**
 * /work/campaigns — email specialist's queue.
 *
 * Three rails: Drafts, Scheduled, Sent. AI drafts body_text from a
 * brief (theme, offer, CTA, audience) using the standard retrieval
 * contract — brand voice, top posts, judgments, cross-client signal.
 *
 * Send is currently a status flip + simulated metrics. Wiring to a
 * real ESP (Postmark / Resend) is downstream.
 */

import { requireAnyCapability } from '@/lib/auth/require-any-capability'
import { getEmailQueue, listClientsForCampaign } from '@/lib/work/get-email-queue'
import CampaignsView from './campaigns-view'

export const dynamic = 'force-dynamic'

export default async function CampaignsPage() {
  await requireAnyCapability(['email_specialist'])
  const [queue, clients] = await Promise.all([getEmailQueue(), listClientsForCampaign()])
  return <CampaignsView initialQueue={queue} clients={clients} />
}
