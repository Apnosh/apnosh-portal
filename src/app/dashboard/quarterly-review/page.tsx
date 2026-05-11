/**
 * /dashboard/quarterly-review -- placeholder surface.
 *
 * Per PRODUCT-SPEC.md, the quarterly review is the heartbeat of the
 * relationship. Full flow (pre-meeting brief, owner agreement panel,
 * goal-update integration) ships after we've done one with a real
 * client. This page exists so the strategist card's "Next review"
 * link has a destination and the concept is visible in the IA.
 */

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Calendar, MessageSquare, Target } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getActiveClientGoals } from '@/lib/goals/queries'

export const dynamic = 'force-dynamic'

function nextQuarterStartLabel(): string {
  const now = new Date()
  const month = now.getMonth()
  const year = now.getFullYear()
  // Next quarter start = first of month {3, 6, 9, 0} after current.
  const quarterStarts = [0, 3, 6, 9]
  let nextMonth = quarterStarts.find(m => m > month) ?? null
  let nextYear = year
  if (nextMonth === null) {
    nextMonth = 0
    nextYear = year + 1
  }
  return new Date(nextYear, nextMonth, 1).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  })
}

export default async function QuarterlyReviewPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('client_id')
    .eq('id', user.id)
    .maybeSingle()
  let clientId = profile?.client_id as string | null | undefined
  if (!clientId) {
    const { data: cu } = await supabase
      .from('client_users')
      .select('client_id')
      .eq('auth_user_id', user.id)
      .maybeSingle()
    clientId = cu?.client_id as string | null | undefined
  }

  const goals = clientId ? await getActiveClientGoals(clientId) : []
  const nextReviewLabel = nextQuarterStartLabel()

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      <div className="text-center">
        <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
          <Calendar className="w-7 h-7 text-emerald-700" />
        </div>
        <h1 className="text-2xl font-bold text-ink mb-2">Quarterly review</h1>
        <p className="text-sm text-ink-3 max-w-md mx-auto leading-relaxed">
          Every 90 days you and your strategist sit down to look at progress,
          adjust goals, and decide what to focus on next.
        </p>
      </div>

      <div className="rounded-xl border bg-white p-5" style={{ borderColor: 'var(--db-border)' }}>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-ink-3 mb-2">
          Next review
        </p>
        <p className="text-lg font-bold text-ink mb-1">{nextReviewLabel}</p>
        <p className="text-sm text-ink-3 leading-relaxed">
          Your strategist will reach out a week before to schedule a 30-minute call.
          You&apos;ll get a written brief beforehand summarizing the quarter.
        </p>
      </div>

      <div className="rounded-xl border bg-white p-5" style={{ borderColor: 'var(--db-border)' }}>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-ink-3 mb-3 flex items-center gap-1.5">
          <Target className="w-3.5 h-3.5" />
          Your active goals
        </p>
        {goals.length === 0 ? (
          <div>
            <p className="text-sm text-ink-3 mb-3 leading-relaxed">
              You haven&apos;t set any goals yet. Pick up to 3 to tell us what matters most.
            </p>
            <Link
              href="/dashboard/goals"
              className="inline-block px-4 py-2 rounded-lg text-sm font-semibold text-white"
              style={{ background: '#4abd98' }}
            >
              Pick your goals →
            </Link>
          </div>
        ) : (
          <ul className="space-y-2">
            {goals.map(g => (
              <li key={g.id} className="flex items-baseline gap-2 text-sm">
                <span className="text-[10px] font-bold w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center flex-shrink-0">
                  {g.priority}
                </span>
                <span className="font-medium text-ink">{displayName(g.goalSlug)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="text-center">
        <Link
          href="/dashboard/messages"
          className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 hover:text-emerald-800"
        >
          <MessageSquare className="w-4 h-4" />
          Message your strategist
        </Link>
      </div>
    </div>
  )
}

function displayName(slug: string): string {
  const map: Record<string, string> = {
    more_foot_traffic: 'More foot traffic',
    regulars_more_often: 'Regulars come back more often',
    more_online_orders: 'More online orders',
    more_reservations: 'More reservations',
    better_reputation: 'Better online reputation',
    be_known_for: 'Be known as the spot for ___',
    fill_slow_times: 'Fill slow times',
    grow_catering: 'Grow catering / private events',
  }
  return map[slug] ?? slug
}
