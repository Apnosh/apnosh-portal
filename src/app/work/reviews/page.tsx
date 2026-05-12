/**
 * /work/reviews — Local SEO manager's review queue.
 *
 * 1-2 star reviews surface first (the urgent rail). AI drafts a
 * gracious, on-voice response grounded in the client's voice + their
 * past judgments + cross-client signal. Local SEO approves, edits,
 * sends. Every reply becomes a public voice example.
 */

import { requireAnyCapability } from '@/lib/auth/require-any-capability'
import { getReviewsQueue } from '@/lib/work/get-reviews-queue'
import ReviewsView from './reviews-view'

export const dynamic = 'force-dynamic'

export default async function ReviewsPage() {
  await requireAnyCapability(['local_seo'])
  const queue = await getReviewsQueue()
  return <ReviewsView initialQueue={queue} />
}
