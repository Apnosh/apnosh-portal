/**
 * Legacy URL — the team page moved to /dashboard/team since the team
 * isn't social-media-specific. Redirect preserves any existing
 * bookmarks and notification deep-links.
 */

import { redirect } from 'next/navigation'

export default function LegacyTeamRedirect() {
  redirect('/dashboard/team')
}
