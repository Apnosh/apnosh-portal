/**
 * Legacy route. Boosts now live inside /dashboard/social/calendar
 * as the Boost tab. ?postId still works -- it forwards through.
 */

import { redirect } from 'next/navigation'

interface PageProps {
  searchParams: Promise<{ postId?: string }>
}

export default async function LegacyBoostRedirect({ searchParams }: PageProps) {
  const { postId } = await searchParams
  const qs = postId ? `&postId=${encodeURIComponent(postId)}` : ''
  redirect(`/dashboard/social/calendar?view=boost${qs}`)
}
