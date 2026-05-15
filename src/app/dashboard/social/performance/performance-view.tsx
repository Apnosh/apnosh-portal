'use client'

/**
 * Performance page client view. Receives a year-long breakdown of
 * social_metrics rows and pivots them by month + platform for display.
 *
 * Sections (top to bottom):
 *   1. Header + month picker
 *   2. KPI strip for selected month vs prior month
 *   3. Per-platform breakdown table
 *   4. Sparkline of reach over the trailing 6 months
 */

import { useMemo, useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import {
  BarChart3, TrendingUp, TrendingDown, Minus, Eye, Heart, Users, Send,
  Camera, Globe, Music, Briefcase,
} from 'lucide-react'
import type { SocialBreakdownResult, SocialDailyRow } from '@/lib/dashboard/get-social-breakdown'

const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
  google_business: 'Google',
  youtube: 'YouTube',
}

const PLATFORM_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  instagram: Camera,
  facebook: Globe,
  tiktok: Music,
  linkedin: Briefcase,
}

const PLATFORM_TINTS: Record<string, string> = {
  instagram: 'bg-rose-50 text-rose-700 ring-rose-100',
  facebook:  'bg-sky-50 text-sky-700 ring-sky-100',
  tiktok:    'bg-zinc-100 text-zinc-700 ring-zinc-200',
  linkedin:  'bg-blue-50 text-blue-700 ring-blue-100',
}

interface MonthlyAggregate {
  ym: string                // 'YYYY-MM'
  label: string             // 'May 2026'
  reach: number
  engagement: number
  posts: number
  /** Latest non-zero followers within or before this month, per platform summed. */
  followers: number
  perPlatform: Record<string, { reach: number; engagement: number; posts: number; followers: number; followersGained: number }>
}

function ym(date: string): string { return date.slice(0, 7) }

function buildMonthly(rows: SocialDailyRow[], platforms: string[]): MonthlyAggregate[] {
  // Group rows by YYYY-MM
  const groups = new Map<string, SocialDailyRow[]>()
  for (const r of rows) {
    const k = ym(r.date)
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(r)
  }

  const monthlyKeys = Array.from(groups.keys()).sort()

  /* For followers we need to walk forward through every month so a
     glitchy zero-day in the current month doesn't blank the total.
     We track the latest non-zero follower count per platform as we go. */
  const lastKnownFollowers: Record<string, number> = {}
  for (const platform of platforms) lastKnownFollowers[platform] = 0

  return monthlyKeys.map(ymKey => {
    const monthRows = groups.get(ymKey) ?? []
    const perPlatform: MonthlyAggregate['perPlatform'] = {}
    let reach = 0, engagement = 0, posts = 0

    for (const platform of platforms) {
      const pRows = monthRows.filter(r => r.platform === platform)
      const pReach = pRows.reduce((s, r) => s + Number(r.reach ?? 0), 0)
      const pEng = pRows.reduce((s, r) => s + Number(r.engagement ?? 0), 0)
      const pPosts = pRows.reduce((s, r) => s + Number(r.posts_published ?? 0), 0)
      const pGained = pRows.reduce((s, r) => s + Number(r.followers_gained ?? 0), 0)

      // Walk this platform's rows in date order to find the latest non-zero follower count.
      const sorted = [...pRows].sort((a, b) => b.date.localeCompare(a.date))
      const latestNonZero = sorted.find(r => Number(r.followers_total ?? 0) > 0)
      if (latestNonZero) {
        lastKnownFollowers[platform] = Number(latestNonZero.followers_total ?? 0)
      }

      perPlatform[platform] = {
        reach: pReach,
        engagement: pEng,
        posts: pPosts,
        followers: lastKnownFollowers[platform],
        followersGained: pGained,
      }

      reach += pReach
      engagement += pEng
      posts += pPosts
    }

    const totalFollowers = Object.values(lastKnownFollowers).reduce((s, v) => s + v, 0)

    const [y, m] = ymKey.split('-').map(Number)
    const label = new Date(y, m - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

    return {
      ym: ymKey,
      label,
      reach,
      engagement,
      posts,
      followers: totalFollowers,
      perPlatform,
    }
  })
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

function trendPct(current: number, previous: number): number | null {
  if (previous === 0) return null
  return Math.round(((current - previous) / previous) * 1000) / 10
}

export default function PerformanceView({
  breakdown, initialMonth,
}: { breakdown: SocialBreakdownResult; initialMonth: string | null }) {
  const monthly = useMemo(
    () => buildMonthly(breakdown.rows, breakdown.platforms),
    [breakdown.rows, breakdown.platforms],
  )

  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()

  // Default to the latest month that actually has data; otherwise current calendar month.
  const defaultMonth = monthly[monthly.length - 1]?.ym
    ?? new Date().toISOString().slice(0, 7)
  const [selected, setSelected] = useState(initialMonth ?? defaultMonth)

  const cur = monthly.find(m => m.ym === selected) ?? null
  const curIdx = monthly.findIndex(m => m.ym === selected)
  const prev = curIdx > 0 ? monthly[curIdx - 1] : null

  function pickMonth(ymKey: string) {
    setSelected(ymKey)
    const next = new URLSearchParams(sp.toString())
    next.set('month', ymKey)
    router.replace(`${pathname}?${next.toString()}`, { scroll: false })
  }

  return (
    <div className="max-w-[1100px] mx-auto px-4 lg:px-6 pt-6 pb-20 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">
            Social
          </p>
          <h1 className="text-[26px] font-semibold text-ink leading-tight mt-1 flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-ink-4" />
            Performance
          </h1>
          <p className="text-ink-3 text-sm mt-0.5">
            Month-by-month reach, engagement, and growth per platform.
          </p>
        </div>

        {monthly.length > 0 && (
          <select
            value={selected}
            onChange={e => pickMonth(e.target.value)}
            className="text-sm font-medium text-ink bg-white ring-1 ring-ink-6 hover:ring-ink-4 rounded-lg px-3 py-2 focus:outline-none focus:ring-ink-3"
          >
            {[...monthly].reverse().map(m => (
              <option key={m.ym} value={m.ym}>{m.label}</option>
            ))}
          </select>
        )}
      </div>

      {/* Empty state */}
      {!cur && (
        <div className="rounded-2xl border-2 border-dashed border-ink-6 bg-white p-12 text-center">
          <BarChart3 className="w-7 h-7 text-ink-4 mx-auto mb-3" />
          <p className="text-[13px] font-semibold text-ink">No performance data yet</p>
          <p className="text-[11.5px] text-ink-3 max-w-md mx-auto mt-1.5 leading-relaxed">
            Daily metrics flow in 24 hours after your platforms connect. If you just connected, check back tomorrow.
          </p>
        </div>
      )}

      {/* KPI strip + per-platform table */}
      {cur && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi icon={<Eye className="w-4 h-4" />} label="Reach" value={cur.reach} change={trendPct(cur.reach, prev?.reach ?? 0)} />
            <Kpi icon={<Heart className="w-4 h-4" />} label="Engagement" value={cur.engagement} change={trendPct(cur.engagement, prev?.engagement ?? 0)} sub="likes + comments + shares + saves" />
            <Kpi icon={<Users className="w-4 h-4" />} label="Followers" value={cur.followers} change={trendPct(cur.followers, prev?.followers ?? 0)} sub="across all platforms" />
            <Kpi icon={<Send className="w-4 h-4" />} label="Posts" value={cur.posts} change={trendPct(cur.posts, prev?.posts ?? 0)} sub={prev ? `${prev.posts} last month` : undefined} />
          </div>

          <section>
            <h2 className="text-[15px] font-bold text-ink tracking-tight mb-3">
              By platform &middot; {cur.label}
            </h2>
            <div className="bg-white rounded-2xl border border-ink-6 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-bg-2 border-b border-ink-6">
                      <th className="text-left py-2.5 px-4 text-[11px] text-ink-4 font-medium uppercase tracking-wide">Platform</th>
                      <th className="text-right py-2.5 px-4 text-[11px] text-ink-4 font-medium uppercase tracking-wide">Reach</th>
                      <th className="text-right py-2.5 px-4 text-[11px] text-ink-4 font-medium uppercase tracking-wide">Engagement</th>
                      <th className="text-right py-2.5 px-4 text-[11px] text-ink-4 font-medium uppercase tracking-wide">Followers</th>
                      <th className="text-right py-2.5 px-4 text-[11px] text-ink-4 font-medium uppercase tracking-wide">Posts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {breakdown.platforms.map(platform => {
                      const p = cur.perPlatform[platform]
                      if (!p) return null
                      const Icon = PLATFORM_ICONS[platform] ?? Globe
                      const tint = PLATFORM_TINTS[platform] ?? 'bg-ink-7 text-ink-2 ring-ink-6'
                      return (
                        <tr key={platform} className="border-b border-ink-6 last:border-0 hover:bg-bg-2/50 transition-colors">
                          <td className="py-3 px-4">
                            <span className={`inline-flex items-center gap-1.5 text-[12px] font-medium px-2 py-0.5 rounded-full ring-1 ${tint}`}>
                              <Icon className="w-3 h-3" />
                              {PLATFORM_LABELS[platform] ?? platform}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right text-ink font-medium tabular-nums">{formatCompact(p.reach)}</td>
                          <td className="py-3 px-4 text-right text-ink font-medium tabular-nums">{formatCompact(p.engagement)}</td>
                          <td className="py-3 px-4 text-right text-ink tabular-nums">
                            {formatCompact(p.followers)}
                            {p.followersGained !== 0 && (
                              <span className={`ml-1 text-[10px] ${p.followersGained > 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                                {p.followersGained > 0 ? '+' : ''}{p.followersGained}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right text-ink tabular-nums">{p.posts}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* 6-month reach trend */}
          <section>
            <h2 className="text-[15px] font-bold text-ink tracking-tight mb-3">
              Reach trend &middot; last 6 months
            </h2>
            <ReachSparkline monthly={monthly.slice(-6)} selected={selected} onPick={pickMonth} />
          </section>
        </>
      )}
    </div>
  )
}

function Kpi({
  icon, label, value, change, sub,
}: {
  icon: React.ReactNode
  label: string
  value: number
  change: number | null
  sub?: string
}) {
  const trend = change == null ? 'flat' : change > 1 ? 'up' : change < -1 ? 'down' : 'flat'
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus
  const trendColor = trend === 'up' ? 'text-emerald-600' : trend === 'down' ? 'text-rose-500' : 'text-ink-4'

  return (
    <div className="bg-white rounded-2xl border border-ink-6 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-3">
          <span className="text-ink-4">{icon}</span>
          {label}
        </span>
        {change != null && (
          <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${trendColor}`}>
            <TrendIcon className="w-3 h-3" />
            {change > 0 ? '+' : ''}{change}%
          </span>
        )}
      </div>
      <p className="text-[26px] font-bold text-ink leading-none tabular-nums">{formatCompact(value)}</p>
      <p className="text-[11.5px] text-ink-4 mt-1.5">{sub ?? ''}</p>
    </div>
  )
}

function ReachSparkline({
  monthly, selected, onPick,
}: { monthly: MonthlyAggregate[]; selected: string; onPick: (ymKey: string) => void }) {
  const max = Math.max(1, ...monthly.map(m => m.reach))
  return (
    <div className="bg-white rounded-2xl border border-ink-6 p-4">
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${monthly.length}, minmax(0, 1fr))` }}>
        {monthly.map(m => {
          const pct = (m.reach / max) * 100
          const isSelected = m.ym === selected
          return (
            <button
              key={m.ym}
              onClick={() => onPick(m.ym)}
              className={`group flex flex-col items-center gap-2 transition-opacity ${isSelected ? '' : 'opacity-70 hover:opacity-100'}`}
            >
              <div className="w-full h-32 flex items-end">
                <div
                  className={`w-full rounded-t transition-colors ${
                    isSelected ? 'bg-brand' : 'bg-ink-6 group-hover:bg-ink-5'
                  }`}
                  style={{ height: `${Math.max(pct, 2)}%` }}
                />
              </div>
              <div className="text-center">
                <p className={`text-[11px] tabular-nums font-medium ${isSelected ? 'text-ink' : 'text-ink-3'}`}>
                  {formatCompact(m.reach)}
                </p>
                <p className="text-[10px] text-ink-4 mt-0.5">
                  {m.label.split(' ')[0].slice(0, 3)}
                </p>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
