/**
 * Legacy route. Ads now live at /dashboard/social/ads.
 * Forwards ?postId so existing 'boost this post' links from the
 * social hub keep working.
 */

import { redirect } from 'next/navigation'

interface PageProps {
  searchParams: Promise<{ postId?: string }>
}

export default async function LegacyBoostRedirect({ searchParams }: PageProps) {
  const { postId } = await searchParams
  const qs = postId ? `?postId=${encodeURIComponent(postId)}` : ''
  redirect(`/dashboard/social/ads${qs}`)
}
