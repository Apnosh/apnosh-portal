/**
 * /preview/campaign — the campaign-building flow, screen by screen, with no login.
 *
 * This is a working surface, not a demo. The point is to open one screen on a phone, argue about
 * it, change it, and reload — against the real components, so there is never a mock to keep in
 * sync. The wireframes went stale within a day of the design changing under them; this cannot,
 * because there is nothing here to go stale except the list itself.
 *
 * PUBLIC ON PURPOSE, AND SAFE BECAUSE IT READS NOTHING. Every screen in this subtree is fed by
 * preview-fixture.ts, which is hand-written constants. No Supabase client is created anywhere
 * under /preview/campaign, so there is no client data to expose and no session to require.
 *
 * The view is a separate client component so this file can still export metadata; see index-view.
 */

import PreviewIndexView from './index-view'

export const metadata = { title: 'Campaign screens, no login' }

export default function PreviewCampaignPage() {
  return <PreviewIndexView />
}
