/**
 * Legacy /dashboard/inbox route — folded into /dashboard/approvals.
 *
 * The unified inbox was a duplicate router: reviews already live in
 * Local SEO → Reviews and DMs/comments live in Social → Engage, so
 * clicking any non-approval thread routed away from the inbox anyway.
 * Approvals get a dedicated page; this stub keeps old bookmarks working.
 */

import { redirect } from 'next/navigation'

export default function InboxRedirect() {
  redirect('/dashboard/approvals')
}
