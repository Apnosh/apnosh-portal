/**
 * /dashboard/social/performance -- monthly per-platform deep view.
 *
 * Builds on the same getSocialBreakdown data that powers the Overview
 * stat strip, but pivots it month-by-month + platform-by-platform so
 * AMs and owners can answer "how did this month compare to last month?
 * which platforms drove it?" without leaving the portal.
 *
 * Replaces the old summary / deep-view split which was wired against
 * an older schema (month + year columns) that no longer exists. The
 * real social_metrics table has a `date` column; we aggregate by
 * YYYY-MM in the client.
 */

import { redirect } from 'next/navigation'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { getSocialBreakdown } from '@/lib/dashboard/get-social-breakdown'
import PerformanceView from './performance-view'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ clientId?: string; month?: string }>
}

export default async function SocialPerformancePage({ searchParams }: PageProps) {
  const sp = await searchParams
  const { user, isAdmin, clientId } = await resolveCurrentClient(sp.clientId ?? null)
  if (!user) redirect('/login')

  if (!clientId) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center text-ink-3">
        {isAdmin
          ? 'Pick a client from /dashboard to see their performance.'
          : 'Sign in as a client to see your performance.'}
      </div>
    )
  }

  const breakdown = await getSocialBreakdown(clientId)

  return <PerformanceView breakdown={breakdown} initialMonth={sp.month ?? null} />
}
