/**
 * /dashboard/social — the publisher's hub.
 *
 * Reading order, top to bottom:
 *   1. Pulse hero        — narrative + 3 count tiles (Live / Queued / Needs you)
 *   2. Recent feed       — IG-style 5-col grid of the last 12 published posts
 *   3. Coming up         — next 5 scheduled
 *   4. What's working    — best recent performer + Boost CTA
 *   5. Push bar          — Request post / Calendar / Boost
 *
 * Analytics deep-dive lives at /dashboard/social/performance.
 */

import { redirect } from 'next/navigation'
import { getSocialHub } from '@/lib/dashboard/get-social-hub'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import SocialHubView from './hub-view'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ clientId?: string }>
}

export default async function SocialHubPage({ searchParams }: PageProps) {
  const { clientId: clientIdParam } = await searchParams
  const { user, isAdmin, clientId } = await resolveCurrentClient(clientIdParam ?? null)
  if (!user) redirect('/login')

  if (!clientId) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center text-ink-3">
        {isAdmin
          ? 'Pick a client from /dashboard to see their social hub.'
          : 'Sign in as a client to see your social media.'}
      </div>
    )
  }

  const data = await getSocialHub(clientId)
  return <SocialHubView data={data} />
}
