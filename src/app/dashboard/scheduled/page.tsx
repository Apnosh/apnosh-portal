/**
 * /dashboard/scheduled — folded into the post list (owner 2026-09-10).
 *
 * Coming up and the posts that already went were two screens holding one story in
 * time order. They are one screen now, Coming up on top. This route stays as a
 * redirect because the composer sent every scheduled post here, and so did More.
 */

import { redirect } from 'next/navigation'

export default function ScheduledPage() {
  redirect('/dashboard/insights/posts')
}
