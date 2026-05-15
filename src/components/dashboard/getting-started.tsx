'use client'

/**
 * First-run experience after onboarding. Shown on the Today page
 * when the client has:
 *   - no connected platforms (platform_connections + channel_connections empty)
 *   - no active paid services (client_services has no rows w/ status='active')
 *   - basically, they just signed up and haven't done anything yet
 *
 * Four big cards walking them through Day 1:
 *   1. Connect your accounts        (the platforms they marked at signup)
 *   2. Browse services              (the free portal + paid services pitch)
 *   3. Meet your strategist         (relationship building)
 *   4. Finish your profile          (only when onboarding_paused = true)
 *
 * Replaces the default Today page (which is for active clients with
 * data + drafts + approvals). The Today page now branches: getting-
 * started for fresh clients, full briefing for activated ones.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Plug, ShoppingBag, MessageSquare, Sparkles, ArrowRight, Check,
  Camera, Globe, Search, ListChecks,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface PlatformIntent {
  /** Platform id from the onboarding step they marked. */
  id: 'instagram' | 'facebook' | 'gbp'
  /** Their selection at onboarding -- 'we have this'. */
  intended: boolean
  /** Actual connection state from platform_connections / channel_connections. */
  connected: boolean
}

interface FreshClientState {
  bizName: string
  /** Onboarding got paused -- finish-your-profile card lights up. */
  onboardingPaused: boolean
  platforms: PlatformIntent[]
}

export default function GettingStarted({ clientName }: { clientName: string }) {
  const [state, setState] = useState<FreshClientState | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || cancelled) return

      /* Pull the business row + the live connection state in parallel. */
      const [bizRes, pcRes, ccRes] = await Promise.all([
        supabase
          .from('businesses')
          .select('name, current_platforms, onboarding_paused, client_id')
          .eq('owner_id', user.id)
          .maybeSingle(),
        supabase
          .from('platform_connections')
          .select('platform, access_token')
          .order('connected_at', { ascending: false }),
        supabase
          .from('channel_connections')
          .select('channel, access_token, status'),
      ])
      if (cancelled) return

      const bizName = (bizRes.data?.name as string) ?? clientName
      const onboardingPaused = !!bizRes.data?.onboarding_paused
      const intended = ((bizRes.data?.current_platforms as string[] | null) ?? [])

      const igConnected = (pcRes.data ?? []).some(r => r.platform === 'instagram' && r.access_token)
      const fbConnected = (pcRes.data ?? []).some(r => r.platform === 'facebook' && r.access_token)
      const gbpConnected = (ccRes.data ?? []).some(r => r.channel === 'google_business_profile' && r.access_token && r.status === 'active')

      setState({
        bizName,
        onboardingPaused,
        platforms: [
          { id: 'instagram', intended: intended.includes('instagram'), connected: igConnected },
          { id: 'facebook',  intended: intended.includes('facebook'),  connected: fbConnected },
          { id: 'gbp',       intended: intended.includes('gbp'),       connected: gbpConnected },
        ],
      })
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [clientName])

  if (loading || !state) {
    return (
      <div className="max-w-[1100px] mx-auto px-4 lg:px-6 pt-8 pb-20">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-ink-7 rounded w-1/2" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-44 bg-ink-7 rounded-2xl" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  const allWanted = state.platforms.filter(p => p.intended)
  const connectedCount = state.platforms.filter(p => p.connected).length
  const intendedCount = allWanted.length
  const connectComplete = intendedCount > 0 && connectedCount >= intendedCount

  return (
    <div className="max-w-[1100px] mx-auto px-4 lg:px-6 pt-8 pb-20">
      {/* Hero */}
      <div className="mb-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">
          Welcome
        </p>
        <h1 className="text-[28px] sm:text-[32px] font-semibold text-ink leading-tight mt-1 flex items-center gap-2">
          <Sparkles className="w-7 h-7 text-amber-500" />
          You&apos;re in, {state.bizName.split(' ')[0] || 'there'}!
        </h1>
        <p className="text-[14px] text-ink-3 mt-1.5 max-w-2xl">
          Three quick things to do today to get the most out of your portal.
        </p>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* 1. Connect accounts */}
        <Card
          number={1}
          icon={Plug}
          tint="bg-emerald-50 ring-emerald-100 text-emerald-700"
          title="Connect your accounts"
          done={connectComplete}
          summary={
            connectComplete
              ? 'All set — your data starts syncing automatically.'
              : intendedCount > 0
                ? `${connectedCount} of ${intendedCount} platforms connected`
                : 'See your real follower, reach, and review numbers'
          }
          actionLabel={connectComplete ? 'Manage connections' : 'Connect now'}
          actionHref="/dashboard/connected-accounts"
          details={
            <div className="space-y-1.5">
              {state.platforms
                .filter(p => p.intended || p.connected)
                .map(p => (
                  <PlatformRow key={p.id} platform={p} />
                ))}
              {intendedCount === 0 && (
                <p className="text-[12px] text-ink-3">
                  Connect any of: Instagram, Facebook, Google Business Profile.
                </p>
              )}
            </div>
          }
        />

        {/* 2. Browse services */}
        <Card
          number={2}
          icon={ShoppingBag}
          tint="bg-violet-50 ring-violet-100 text-violet-700"
          title="Browse services"
          summary="The portal is free. Add services when you want hands-on help from our team."
          actionLabel="See the menu"
          actionHref="/dashboard/services"
          details={
            <ul className="text-[12.5px] text-ink-2 space-y-1">
              <li className="flex items-start gap-1.5">
                <Check className="w-3 h-3 text-emerald-600 flex-shrink-0 mt-0.5" />
                Social Media Management from $199/mo
              </li>
              <li className="flex items-start gap-1.5">
                <Check className="w-3 h-3 text-emerald-600 flex-shrink-0 mt-0.5" />
                Local SEO + GBP from $149/mo
              </li>
              <li className="flex items-start gap-1.5">
                <Check className="w-3 h-3 text-emerald-600 flex-shrink-0 mt-0.5" />
                Email + SMS from $199/mo
              </li>
              <li className="flex items-start gap-1.5">
                <Sparkles className="w-3 h-3 text-amber-600 flex-shrink-0 mt-0.5" />
                <span className="font-medium">Founding member: 50% off forever</span>
              </li>
            </ul>
          }
        />

        {/* 3. Meet your strategist */}
        <Card
          number={3}
          icon={MessageSquare}
          tint="bg-sky-50 ring-sky-100 text-sky-700"
          title="Meet your strategist"
          summary="Once you subscribe to a service, your strategist reaches out within 24 hours. You can also message us any time."
          actionLabel="Send a message"
          actionHref="/dashboard/messages"
          details={
            <p className="text-[12.5px] text-ink-3 leading-relaxed">
              Tell us about your goals, your busiest nights, what&apos;s worked before. The more
              context we have, the better the first content lands.
            </p>
          }
        />

        {/* 4. Finish your profile -- only when paused */}
        {state.onboardingPaused ? (
          <Card
            number={4}
            icon={ListChecks}
            tint="bg-amber-50 ring-amber-100 text-amber-700"
            title="Finish your profile"
            summary="You saved partway through. A few more questions = much better content from day one."
            actionLabel="Continue setup"
            actionHref="/onboarding"
            details={
              <p className="text-[12.5px] text-ink-3 leading-relaxed">
                Voice, content preferences, brand assets. ~3 minutes.
              </p>
            }
          />
        ) : (
          /* If no paused profile, surface a fourth card pointing at brand assets. */
          <Card
            number={4}
            icon={ListChecks}
            tint="bg-amber-50 ring-amber-100 text-amber-700"
            title="Upload your photos + logo"
            summary="Your strategist needs visual assets to draft your first batch of content."
            actionLabel="Upload assets"
            actionHref="/dashboard/brand"
            details={
              <p className="text-[12.5px] text-ink-3 leading-relaxed">
                5+ recent food photos and your logo are the minimum. Higher res = better.
              </p>
            }
          />
        )}
      </div>

      {/* Bottom strip */}
      <div className="mt-8 pt-6 border-t border-ink-7">
        <p className="text-[12px] text-ink-4">
          Need help? Message your strategist any time, or{' '}
          <Link href="/dashboard/help" className="underline hover:text-ink-2">
            see the help center
          </Link>.
        </p>
      </div>
    </div>
  )
}

function Card({
  number, icon: Icon, tint, title, summary, actionLabel, actionHref, details, done,
}: {
  number: number
  icon: React.ComponentType<{ className?: string }>
  tint: string
  title: string
  summary: string
  actionLabel: string
  actionHref: string
  details?: React.ReactNode
  done?: boolean
}) {
  return (
    <div className="rounded-2xl bg-white border border-ink-6 hover:border-ink-4 hover:shadow-sm p-5 transition-all flex flex-col">
      <div className="flex items-start gap-3 mb-3">
        <span className={`w-10 h-10 rounded-xl grid place-items-center ring-1 flex-shrink-0 ${tint}`}>
          {done ? <Check className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-4">
            Step {number}
          </p>
          <p className="text-[16px] font-semibold text-ink leading-tight mt-0.5">{title}</p>
        </div>
      </div>
      <p className="text-[13px] text-ink-2 leading-relaxed">{summary}</p>
      {details && <div className="mt-3 flex-1">{details}</div>}
      <Link
        href={actionHref}
        className="mt-4 inline-flex items-center justify-center gap-1.5 text-[13px] font-semibold text-ink-2 bg-bg-2 hover:bg-bg-3 rounded-full px-3 py-2 transition-colors"
      >
        {actionLabel}
        <ArrowRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  )
}

function PlatformRow({ platform }: { platform: PlatformIntent }) {
  const meta = {
    instagram: { label: 'Instagram',    Icon: Camera },
    facebook:  { label: 'Facebook',     Icon: Globe },
    gbp:       { label: 'Google Business', Icon: Search },
  }[platform.id]
  return (
    <div className="flex items-center gap-2 text-[12px]">
      <meta.Icon className="w-3.5 h-3.5 text-ink-3 flex-shrink-0" />
      <span className="text-ink-2 flex-1">{meta.label}</span>
      {platform.connected ? (
        <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wider text-emerald-700 bg-emerald-50 ring-1 ring-emerald-100 px-1.5 py-0.5 rounded">
          <Check className="w-2.5 h-2.5" />
          Connected
        </span>
      ) : (
        <span className="text-[11px] text-ink-4">Not yet</span>
      )}
    </div>
  )
}
