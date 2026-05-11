/**
 * /dashboard/social/boost — paid reach for the owner.
 *
 * Three sections:
 *   1. Smart boost   — top 3 winning posts in the last 30 days.
 *      One-click "boost this" → opens a small budget / duration sheet
 *      that creates a request the strategist confirms before launch.
 *   2. Active campaigns — what's currently running, with reach / clicks
 *      so far and inline pause / extend / increase controls. v1 stub:
 *      empty state with explanatory copy.
 *   3. Budget & results — monthly ad budget, used vs. remaining,
 *      estimated foot-traffic attributable to ads.
 *
 * v1 is intentionally UI-only — no live ad data wired. The structure
 * stays in shape for when we wire Meta Ads Manager / TikTok Ads.
 */

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSocialHub } from '@/lib/dashboard/get-social-hub'
import BoostView from './boost-view'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ clientId?: string; postId?: string }>
}

export default async function BoostPage({ searchParams }: PageProps) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  const isAdmin = (profile?.role as string | null) === 'admin'

  let clientId: string | null = null
  if (isAdmin) {
    clientId = params.clientId ?? null
  } else {
    const { data: business } = await supabase
      .from('businesses')
      .select('client_id')
      .eq('owner_id', user.id)
      .maybeSingle()
    clientId = (business?.client_id as string | null) ?? null
    if (!clientId) {
      const { data: cu } = await supabase
        .from('client_users')
        .select('client_id')
        .eq('auth_user_id', user.id)
        .maybeSingle()
      clientId = (cu?.client_id as string | null) ?? null
    }
  }

  if (!clientId) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center text-ink-3">
        Sign in as a client to manage boosts.
      </div>
    )
  }

  // Use the existing social hub data for the recent post pool. Top
  // performer comes from there; we use the next 2 recent posts as
  // secondary suggestions.
  const hub = await getSocialHub(clientId)
  return (
    <BoostView
      clientId={clientId}
      preselectedPostId={params.postId ?? null}
      candidates={hub.recent.slice(0, 6)}
      topPerformer={hub.topPerformer}
    />
  )
}
