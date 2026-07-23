/**
 * /dashboard/insights/setup — legacy entry, now a redirect.
 *
 * website-setup.ts and the Google OAuth callbacks were built to hand off here with
 * returnTo=/dashboard/insights/setup, but the page was never built, so every one of those
 * handoffs landed on a 404. The real setup surface is now /dashboard/measure. Redirect rather
 * than rebuild, so the old links resolve and nobody has two setup screens to keep in step.
 */

import { redirect } from 'next/navigation'

export default function InsightsSetupRedirect() {
  redirect('/dashboard/measure')
}
