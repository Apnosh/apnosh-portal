/**
 * /dashboard/social/calendar -- the "what / when" surface for social.
 *
 * Three tabs, controlled by ?view=:
 *   - schedule (default) → month grid of scheduled posts
 *   - plan               → editorial plan (theme + pillars + key dates)
 *   - boost              → paid reach (boost a post, active campaigns)
 *
 * Plan and Boost used to be standalone routes. They're folded in here
 * so everything tied to "what's going out and when" lives under one
 * URL. Old routes redirect with the correct tab pre-selected.
 */

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Calendar as CalendarIcon, Compass, Zap, Plus } from 'lucide-react'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { getEditorialPlan } from '@/lib/dashboard/get-editorial-plan'
import { getSocialHub } from '@/lib/dashboard/get-social-hub'
import { getActiveCampaigns, getPastCampaigns } from '@/lib/dashboard/get-campaigns'
import { ScheduleView } from './schedule-view'
import EditorialPlanView from '../plan/plan-view'
import BoostView from '../boost/boost-view'

export const dynamic = 'force-dynamic'

type View = 'schedule' | 'plan' | 'boost'

const TABS: { id: View; label: string; icon: React.ComponentType<{ className?: string }>; description: string }[] = [
  { id: 'schedule', label: 'Schedule', icon: CalendarIcon, description: 'When your social posts are scheduled to go live.' },
  { id: 'plan',     label: 'Plan',     icon: Compass,      description: 'This month’s theme, content pillars, and key dates.' },
  { id: 'boost',    label: 'Boost',    icon: Zap,          description: 'Put paid reach behind your best-performing posts.' },
]

interface PageProps {
  searchParams: Promise<{ clientId?: string; view?: string; postId?: string }>
}

export default async function CalendarPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const { user, isAdmin, clientId } = await resolveCurrentClient(sp.clientId ?? null)
  if (!user) redirect('/login')

  if (!clientId) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center text-ink-3">
        {isAdmin
          ? 'Pick a client from /dashboard to see their calendar.'
          : 'Sign in as a client to see your calendar.'}
      </div>
    )
  }

  const view: View = sp.view === 'plan' || sp.view === 'boost' ? sp.view : 'schedule'

  // Fetch only what the active tab needs.
  let planData: Awaited<ReturnType<typeof getEditorialPlan>> | null = null
  let boostData: {
    hub: Awaited<ReturnType<typeof getSocialHub>>
    active: Awaited<ReturnType<typeof getActiveCampaigns>>
    past: Awaited<ReturnType<typeof getPastCampaigns>>
  } | null = null

  if (view === 'plan') {
    planData = await getEditorialPlan(clientId)
  } else if (view === 'boost') {
    const [hub, active, past] = await Promise.all([
      getSocialHub(clientId),
      getActiveCampaigns(clientId),
      getPastCampaigns(clientId),
    ])
    boostData = { hub, active, past }
  }

  return (
    <div className="max-w-[1100px] mx-auto px-4 lg:px-6 pt-6 pb-20 space-y-5">
      {/* Page title */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">
            Social
          </p>
          <h1 className="text-[26px] font-semibold text-ink leading-tight mt-1 flex items-center gap-2">
            <CalendarIcon className="w-6 h-6 text-ink-4" />
            Calendar
          </h1>
          <p className="text-ink-3 text-sm mt-0.5">
            {TABS.find(t => t.id === view)?.description}
          </p>
        </div>
        {view === 'schedule' && (
          <Link
            href="/dashboard/social/requests/new"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold text-white bg-brand hover:bg-brand-dark shadow-sm shadow-brand/20"
          >
            <Plus className="w-3.5 h-3.5" /> Request a post
          </Link>
        )}
      </div>

      {/* Tab strip */}
      <div role="tablist" aria-label="Calendar section" className="flex items-center gap-1 border-b border-ink-6">
        {TABS.map(t => {
          const Icon = t.icon
          const active = t.id === view
          const href = t.id === 'schedule'
            ? '/dashboard/social/calendar'
            : `/dashboard/social/calendar?view=${t.id}`
          return (
            <Link
              key={t.id}
              href={href}
              role="tab"
              aria-selected={active}
              className={`relative inline-flex items-center gap-1.5 px-3 py-2.5 text-[13px] font-medium transition-colors ${
                active ? 'text-ink' : 'text-ink-3 hover:text-ink-2'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
              {active && (
                <span className="absolute left-0 right-0 -bottom-px h-[2px] bg-brand rounded-full" />
              )}
            </Link>
          )
        })}
      </div>

      {/* Active section */}
      {view === 'schedule' && <ScheduleView />}
      {view === 'plan' && planData && <EditorialPlanView data={planData} />}
      {view === 'boost' && boostData && (
        <BoostView
          clientId={clientId}
          preselectedPostId={sp.postId ?? null}
          candidates={boostData.hub.recent.slice(0, 6)}
          topPerformer={boostData.hub.topPerformer}
          activeCampaigns={boostData.active}
          pastCampaigns={boostData.past}
        />
      )}
    </div>
  )
}
