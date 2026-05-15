'use client'

/**
 * Social Media hub — the publisher's home, not the analyst's.
 *
 * Visual language matches the Calendar / Today redesigns: brand-tinted
 * icon tile, generous typography, 3-tile pulse card with vertical
 * dividers, soft shadows on grids.
 *
 * IG-style 5-col grid for recent posts so the brain reads it as a
 * social feed instantly. Squared aspect ratio with mini overlays for
 * platform + age.
 */

import Link from 'next/link'
import {
  Sparkles, Plus, TrendingUp, TrendingDown, ArrowRight, AlertCircle,
  Camera, Globe, Image as ImageIcon, Video, Layers, Send, Zap, Music,
  Eye, MousePointer2, Footprints, FileText, CircleCheck, Heart,
} from 'lucide-react'
import type { SocialHubData, SocialPostCard, TopPerformer } from '@/lib/dashboard/get-social-hub'
import type { SocialBreakdownResult, SocialDailyRow } from '@/lib/dashboard/get-social-breakdown'
import type { CampaignRow } from '@/lib/dashboard/get-campaigns'
import type { ContentPlan } from '@/lib/dashboard/get-content-plan'
import type { ContentQuote } from '@/lib/dashboard/get-quotes'

const PLATFORM_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  instagram: Camera,
  facebook: Globe,
  tiktok: Music,
  linkedin: Send,
}

const PLATFORM_TINT: Record<string, string> = {
  instagram: 'bg-rose-50 text-rose-700',
  facebook:  'bg-sky-50 text-sky-700',
  tiktok:    'bg-zinc-100 text-zinc-700',
  linkedin:  'bg-blue-50 text-blue-700',
}

export default function SocialHubView({
  data, breakdown,
}: { data: SocialHubData; breakdown: SocialBreakdownResult }) {
  const stats = computeStats(data, breakdown)
  const platforms = computePlatformPulse(breakdown)
  const urgentCount = data.counts.needsYou + data.pendingQuotes.length

  return (
    <div className="max-w-[1100px] mx-auto px-4 lg:px-6 pt-6 pb-20 space-y-6">
      {/* 1. Header */}
      <PageHeader />

      {/* 2. Needs you alert -- only when something is actually waiting.
         Sits at the very top so the eye finds it before anything else. */}
      {urgentCount > 0 && (
        <NeedsYouAlert
          approvals={data.counts.needsYou}
          quotes={data.pendingQuotes.length}
        />
      )}

      {/* 3. Stat strip -- three pills with values + trend deltas. */}
      <StatStrip stats={stats} queued={data.counts.queued} />

      {/* 4. Recent posts + Coming up */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 lg:gap-7">
        <RecentFeed posts={data.recent} />
        <ComingUp posts={data.upcoming} />
      </div>

      {/* 5. Platform pulse -- one row per connected platform */}
      {platforms.length > 0 && <PlatformPulse platforms={platforms} />}

      {/* 6. What's working */}
      {data.topPerformer && <WhatsWorking perf={data.topPerformer} />}

      {/* 7. Plan + Pending quotes */}
      {(shouldShowPlan(data.plan) || data.pendingQuotes.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {shouldShowPlan(data.plan) && <PlanCard plan={data.plan} />}
          {data.pendingQuotes.length > 0 && <QuotesCard quotes={data.pendingQuotes} />}
          {shouldShowPlan(data.plan) && data.pendingQuotes.length === 0 && (
            <QuotesEmptyCard />
          )}
          {!shouldShowPlan(data.plan) && data.pendingQuotes.length > 0 && (
            <PlanEmptyCard />
          )}
        </div>
      )}

      {/* 8. Last boost result */}
      {data.lastCompletedBoost && <LastBoostResult campaign={data.lastCompletedBoost} />}
    </div>
  )
}

/* ─────────────────────────────── Page header ─────────────────────────────── */

function PageHeader() {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">
          Social
        </p>
        <h1 className="text-[26px] font-semibold text-ink leading-tight mt-1 flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-amber-600" />
          Overview
        </h1>
      </div>
      <Link
        href="/dashboard/social/request"
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold text-white bg-brand hover:bg-brand-dark shadow-sm shadow-brand/20"
      >
        <Plus className="w-3.5 h-3.5" />
        Request a post
      </Link>
    </div>
  )
}

/* ─────────────────────────────── Needs you alert ─────────────────────────────── */

function NeedsYouAlert({ approvals, quotes }: { approvals: number; quotes: number }) {
  const parts: string[] = []
  if (approvals > 0) parts.push(`${approvals} ${approvals === 1 ? 'post' : 'posts'} to review`)
  if (quotes > 0) parts.push(`${quotes} ${quotes === 1 ? 'quote' : 'quotes'} to approve`)
  const label = parts.join(' and ')

  return (
    <Link
      href="/dashboard/social/inbox"
      className="group flex items-center gap-4 rounded-2xl bg-gradient-to-r from-rose-50 via-amber-50 to-amber-50 ring-1 ring-rose-200/60 hover:ring-rose-300 px-5 py-4 transition-all"
    >
      <span className="w-11 h-11 rounded-full bg-white flex items-center justify-center ring-1 ring-rose-200/60 flex-shrink-0">
        <AlertCircle className="w-5 h-5 text-rose-600" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-bold text-ink leading-tight">
          {label}
        </p>
        <p className="text-[12.5px] text-ink-2 mt-0.5">
          Nothing goes live until you say yes.
        </p>
      </div>
      <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-rose-700 group-hover:text-rose-800 flex-shrink-0">
        Open inbox
        <ArrowRight className="w-3.5 h-3.5" />
      </span>
    </Link>
  )
}

/* ─────────────────────────────── Stat strip ─────────────────────────────── */

interface StatSummary {
  posts30d: number
  postsPrev30d: number
  reach30d: number
  reachPrev30d: number
  engagement30d: number
  engagementRate30d: number | null
  engagementRatePrev30d: number | null
}

function StatStrip({ stats, queued }: { stats: StatSummary; queued: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <StatCard
        icon={<Send className="w-4 h-4" />}
        label="Posts"
        value={stats.posts30d}
        current={stats.posts30d}
        previous={stats.postsPrev30d}
        sub={queued > 0 ? `${queued} more queued` : 'last 30 days'}
      />
      <StatCard
        icon={<Eye className="w-4 h-4" />}
        label="Reach"
        value={stats.reach30d}
        current={stats.reach30d}
        previous={stats.reachPrev30d}
        sub="last 30 days"
      />
      <StatCard
        icon={<Heart className="w-4 h-4" />}
        label="Engagement rate"
        value={stats.engagementRate30d}
        current={stats.engagementRate30d ?? 0}
        previous={stats.engagementRatePrev30d ?? 0}
        sub="likes + comments / reach"
        format="pct"
      />
    </div>
  )
}

function StatCard({
  icon, label, value, current, previous, sub, format = 'compact',
}: {
  icon: React.ReactNode
  label: string
  value: number | null
  current: number
  previous: number
  sub: string
  format?: 'compact' | 'pct'
}) {
  const change = previous > 0 ? ((current - previous) / previous) * 100 : null
  const changeRounded = change == null ? null : Math.round(change * 10) / 10
  const trend = changeRounded == null ? 'flat' : changeRounded > 1 ? 'up' : changeRounded < -1 ? 'down' : 'flat'
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : null
  const trendColor = trend === 'up' ? 'text-emerald-600' : trend === 'down' ? 'text-rose-500' : 'text-ink-4'

  const display = value == null
    ? '—'
    : format === 'pct'
      ? `${value.toFixed(1)}%`
      : formatCompact(value)

  return (
    <div className="bg-white rounded-2xl border border-ink-6 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-3">
          <span className="text-ink-4">{icon}</span>
          {label}
        </span>
        {TrendIcon && changeRounded != null && (
          <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${trendColor}`}>
            <TrendIcon className="w-3 h-3" />
            {changeRounded > 0 ? '+' : ''}{changeRounded}%
          </span>
        )}
      </div>
      <p className="text-[26px] font-bold text-ink leading-none tabular-nums">{display}</p>
      <p className="text-[11.5px] text-ink-4 mt-1.5">{sub}</p>
    </div>
  )
}

/* ─────────────────────────────── Platform pulse ─────────────────────────────── */

interface PlatformPulseData {
  platform: string
  label: string
  followers: number
  followersChange: number
  reach30d: number
}

function PlatformPulse({ platforms }: { platforms: PlatformPulseData[] }) {
  return (
    <section>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-[15px] font-bold text-ink tracking-tight">
          By platform
        </h2>
        <Link
          href="/dashboard/social/performance"
          className="text-[12px] font-medium text-ink-3 hover:text-ink inline-flex items-center gap-1"
        >
          Full breakdown <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {platforms.map(p => {
          const Icon = PLATFORM_ICON[p.platform] ?? Globe
          const tint = PLATFORM_TINT[p.platform] ?? 'bg-ink-7 text-ink-2'
          const trend = p.followersChange > 0 ? 'up' : p.followersChange < 0 ? 'down' : 'flat'
          const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : null
          const trendColor = trend === 'up' ? 'text-emerald-600' : trend === 'down' ? 'text-rose-500' : 'text-ink-4'
          return (
            <div key={p.platform} className="bg-white rounded-xl border border-ink-6 p-3.5">
              <div className="flex items-center gap-2 mb-2.5">
                <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${tint}`}>
                  <Icon className="w-3.5 h-3.5" />
                </span>
                <span className="text-[13px] font-semibold text-ink">{p.label}</span>
              </div>
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-[18px] font-bold text-ink tabular-nums leading-none">
                    {formatCompact(p.followers)}
                  </p>
                  <p className="text-[10.5px] text-ink-4 mt-1">followers</p>
                </div>
                {TrendIcon && p.followersChange !== 0 && (
                  <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${trendColor}`}>
                    <TrendIcon className="w-3 h-3" />
                    {p.followersChange > 0 ? '+' : ''}{p.followersChange}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

/* ─────────────────────────────── Stat computation ─────────────────────────────── */

const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
  google_business: 'Google',
  youtube: 'YouTube',
  twitter: 'Twitter',
}

function computeStats(data: SocialHubData, breakdown: SocialBreakdownResult): StatSummary {
  const now = new Date()
  const start30 = new Date(now); start30.setDate(start30.getDate() - 30)
  const start60 = new Date(now); start60.setDate(start60.getDate() - 60)

  let posts30d = 0, postsPrev30d = 0
  let reach30d = 0, reachPrev30d = 0
  let engagement30d = 0, engagementPrev30d = 0

  for (const r of breakdown.rows) {
    const d = new Date(r.date)
    const isCurrent = d >= start30 && d < now
    const isPrev = d >= start60 && d < start30
    const posts = Number(r.posts_published ?? 0)
    const reach = Number(r.reach ?? 0)
    const eng = Number(r.engagement ?? 0)
    if (isCurrent) {
      posts30d += posts
      reach30d += reach
      engagement30d += eng
    } else if (isPrev) {
      postsPrev30d += posts
      reachPrev30d += reach
      engagementPrev30d += eng
    }
  }

  // Fall back to hub data when breakdown is empty.
  if (reach30d === 0 && data.reach30d) reach30d = data.reach30d
  if (posts30d === 0) posts30d = data.counts.live

  /* Engagement rate uses the latest known follower count across all
     platforms, not the reach window. Industry standard is
     `engagement_events / followers * 100` for restaurants; using reach
     blows up to thousands of percent on tiny test accounts where reach
     can be ~10 but engagement events are ~500. */
  const totalFollowersNow = pickLatestFollowers(breakdown, now)
  const totalFollowersPrev = pickLatestFollowers(breakdown, start30)
  const engagementRate30d = totalFollowersNow > 0
    ? (engagement30d / totalFollowersNow) * 100
    : null
  const engagementRatePrev30d = totalFollowersPrev > 0
    ? (engagementPrev30d / totalFollowersPrev) * 100
    : null

  return {
    posts30d, postsPrev30d,
    reach30d, reachPrev30d,
    engagement30d,
    engagementRate30d, engagementRatePrev30d,
  }
}

function computePlatformPulse(breakdown: SocialBreakdownResult): PlatformPulseData[] {
  const now = new Date()
  const start30 = new Date(now); start30.setDate(start30.getDate() - 30)

  return breakdown.platforms.map(platform => {
    const rows = breakdown.rows.filter(r => r.platform === platform)
    /* Walk backward through the sorted rows for the latest non-zero
       follower count. Sync sometimes writes zero rows when the platform
       API briefly returns empty (token issues, account hiccups); we
       don't want a single bad day to make the pulse strip read "0
       followers" when the real number is e.g. 2,067. */
    const sorted = [...rows].sort((a, b) => b.date.localeCompare(a.date))
    const latestNonZero = sorted.find(r => Number(r.followers_total ?? 0) > 0)
    const followers = Number(latestNonZero?.followers_total ?? 0)
    /* Followers gained in last 30 days. Sum followers_gained, but
       skip zero-row days so a glitchy sync doesn't bury real growth. */
    const followersChange = rows
      .filter(r => new Date(r.date) >= start30)
      .reduce((s, r: SocialDailyRow) => s + Number(r.followers_gained ?? 0), 0)
    // Reach in last 30 days
    const reach30d = rows
      .filter(r => new Date(r.date) >= start30)
      .reduce((s, r: SocialDailyRow) => s + Number(r.reach ?? 0), 0)
    return {
      platform,
      label: PLATFORM_LABELS[platform] ?? platform,
      followers,
      followersChange,
      reach30d,
    }
  }).filter(p => p.followers > 0 || p.reach30d > 0)
    .sort((a, b) => b.followers - a.followers)
}

/**
 * Sum the latest known follower_total per platform up to a given
 * cutoff date. Walks backward through each platform's rows so a single
 * empty-sync day doesn't zero out the result.
 */
function pickLatestFollowers(breakdown: SocialBreakdownResult, asOf: Date): number {
  const cutoff = asOf.toISOString().slice(0, 10)
  let total = 0
  for (const platform of breakdown.platforms) {
    const rows = breakdown.rows
      .filter(r => r.platform === platform && r.date <= cutoff)
      .sort((a, b) => b.date.localeCompare(a.date))
    const latest = rows.find(r => Number(r.followers_total ?? 0) > 0)
    total += Number(latest?.followers_total ?? 0)
  }
  return total
}

/* ─────────────────────────────── Recent feed ─────────────────────────────── */

function RecentFeed({ posts }: { posts: SocialPostCard[] }) {
  return (
    <section>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-[15px] font-bold text-ink tracking-tight">
          Recent posts
        </h2>
        {posts.length > 0 && (
          <Link
            href="/dashboard/social/performance"
            className="text-[12px] font-medium text-ink-3 hover:text-ink inline-flex items-center gap-1"
          >
            View all <ArrowRight className="w-3 h-3" />
          </Link>
        )}
      </div>

      {posts.length === 0 ? (
        <div
          className="rounded-2xl border-2 border-dashed p-10 text-center bg-white"
          style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
        >
          <div className="w-12 h-12 mx-auto rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center mb-3 ring-1 ring-amber-100">
            <Sparkles className="w-5 h-5" />
          </div>
          <p className="text-[14px] font-semibold text-ink leading-tight">
            Your feed will fill in here
          </p>
          <p className="text-[12px] text-ink-3 max-w-md mx-auto mt-1.5 leading-relaxed">
            Once your strategist publishes your first batch, every post lands here as a thumbnail.
            Typically within a day or two of kickoff.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-1.5">
          {posts.map(p => <PostTile key={p.id} post={p} />)}
        </div>
      )}
    </section>
  )
}

function PostTile({ post }: { post: SocialPostCard }) {
  const platform = post.platforms[0] ?? 'instagram'
  const PlatformIcon = PLATFORM_ICON[platform] ?? Camera
  const platformTint = PLATFORM_TINT[platform] ?? PLATFORM_TINT.instagram
  const MediaIcon = post.mediaType === 'video' ? Video : post.mediaType === 'carousel' ? Layers : ImageIcon

  return (
    <div
      className="group relative aspect-square rounded-lg overflow-hidden bg-bg-2 border cursor-pointer hover:shadow-sm transition-shadow"
      style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
      title={post.text}
    >
      {post.mediaUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.mediaUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-3 text-center">
          <MediaIcon className="w-5 h-5 text-ink-4 mb-1.5" />
          <p className="text-[10px] text-ink-3 leading-snug line-clamp-3">
            {post.text || 'Untitled post'}
          </p>
        </div>
      )}

      {/* Platform badge */}
      <div className={`absolute top-1.5 left-1.5 w-5 h-5 rounded-full ${platformTint} flex items-center justify-center shadow-sm`}>
        <PlatformIcon className="w-2.5 h-2.5" />
      </div>

      {/* Media type badge */}
      {post.mediaType && post.mediaType !== 'image' && (
        <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center">
          <MediaIcon className="w-2.5 h-2.5" />
        </div>
      )}

      {/* Age caption on hover */}
      <div className="absolute inset-x-0 bottom-0 px-2 py-1.5 bg-gradient-to-t from-black/70 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
        <p className="text-[10px] font-medium text-white tabular-nums">
          {relativeShort(post.scheduledFor ?? post.publishedAt)}
        </p>
      </div>
    </div>
  )
}

/* ─────────────────────────────── Coming up ─────────────────────────────── */

function ComingUp({ posts }: { posts: SocialPostCard[] }) {
  return (
    <aside>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-[15px] font-bold text-ink tracking-tight">
          Coming up
        </h2>
        <Link
          href="/dashboard/social/calendar"
          className="text-[12px] font-medium text-ink-3 hover:text-ink inline-flex items-center gap-1"
        >
          Calendar <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {posts.length === 0 ? (
        <div
          className="rounded-2xl border bg-white p-5"
          style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
        >
          <p className="text-[13px] text-ink-2 leading-relaxed">
            Nothing queued yet. Your strategist drops new posts in here as they get scheduled.
          </p>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {posts.map(p => <ComingUpRow key={p.id} post={p} />)}
        </ul>
      )}
    </aside>
  )
}

function ComingUpRow({ post }: { post: SocialPostCard }) {
  const platform = post.platforms[0] ?? 'instagram'
  const PlatformIcon = PLATFORM_ICON[platform] ?? Camera
  const platformTint = PLATFORM_TINT[platform] ?? PLATFORM_TINT.instagram
  return (
    <li>
      <div
        className="flex items-center gap-3 rounded-xl border bg-white p-3 hover:shadow-sm transition-shadow"
        style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
      >
        {post.mediaUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={post.mediaUrl} alt="" className="w-10 h-10 rounded-md object-cover flex-shrink-0" />
        ) : (
          <div className="w-10 h-10 rounded-md bg-bg-2 flex items-center justify-center flex-shrink-0">
            <ImageIcon className="w-4 h-4 text-ink-4" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-semibold text-ink tabular-nums">
            {formatShort(post.scheduledFor)}
          </p>
          <p className="text-[11px] text-ink-3 truncate">
            {post.text.slice(0, 60) || 'Scheduled post'}
          </p>
        </div>
        <div className={`w-6 h-6 rounded-full ${platformTint} flex items-center justify-center flex-shrink-0`}>
          <PlatformIcon className="w-3 h-3" />
        </div>
      </div>
    </li>
  )
}

/* ─────────────────────────────── What's working ─────────────────────────────── */

function WhatsWorking({ perf }: { perf: TopPerformer }) {
  return (
    <section className="mt-8">
      <div
        className="rounded-2xl border bg-gradient-to-br from-emerald-50/60 via-white to-white p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center gap-5"
        style={{ borderColor: 'var(--db-border, #e8efe9)' }}
      >
        <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200/60 flex-shrink-0">
          <TrendingUp className="w-4.5 h-4.5" />
        </div>

        {perf.mediaUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={perf.mediaUrl} alt="" className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl object-cover flex-shrink-0" />
        )}

        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-700 leading-none mb-1.5">
            What&rsquo;s working
          </p>
          <p className="text-[15px] font-semibold text-ink leading-snug">
            {perf.text.slice(0, 100) || 'A recent post is hitting'}
            {perf.text.length > 100 ? '…' : ''}
          </p>
          <p className="text-[12px] text-ink-2 mt-1 leading-relaxed">
            <span className="font-semibold tabular-nums">{formatCompact(perf.reach)} reach</span>
            {perf.vsAverage !== null && perf.vsAverage > 0 && (
              <span> · +{perf.vsAverage}% vs your average</span>
            )}
          </p>
        </div>

        {/* Boost CTA hidden for v1 -- the boost flow is not wired yet.
            Re-add when /dashboard/social/boost connects to the strategist queue. */}
      </div>
    </section>
  )
}

/* ─────────────────────────────── Plan + Quotes cards ─────────────────────────────── */

function shouldShowPlan(plan: ContentPlan): boolean {
  return !!plan.tier || plan.socialMonthlyAllotment != null
}

function PlanCard({ plan }: { plan: ContentPlan }) {
  const tier = plan.tier ?? 'Plan'
  const allot = plan.socialMonthlyAllotment
  const used = plan.usedThisMonth
  const remaining = plan.remainingThisMonth
  const percent = plan.percentUsed
  const isFull = remaining !== null && remaining === 0
  return (
    <div
      className="rounded-2xl border bg-white p-5"
      style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 flex-shrink-0">
            <CircleCheck className="w-4.5 h-4.5" />
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-3 leading-none">
              Your plan
            </p>
            <p className="text-[15px] font-semibold text-ink mt-1 leading-none">
              {tier}
              {plan.monthlyRate !== null && (
                <span className="text-ink-3 font-medium text-[12px]"> · ${plan.monthlyRate}/mo</span>
              )}
            </p>
          </div>
        </div>
      </div>

      {allot ? (
        <>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-[28px] font-bold text-ink leading-none tabular-nums tracking-tight">
              {used}
              <span className="text-[18px] text-ink-3 font-medium"> / {allot}</span>
            </span>
            <span className="text-[12px] text-ink-3">posts used this month</span>
          </div>
          <div className="h-2 rounded-full bg-bg-2 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                isFull ? 'bg-rose-500' : percent && percent >= 80 ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.max(2, percent ?? 0)}%` }}
            />
          </div>
          <p className="text-[11px] text-ink-3 mt-2 leading-snug">
            {isFull
              ? 'Plan maxed for this month. Extras need a quote.'
              : remaining !== null
              ? `${remaining} ${remaining === 1 ? 'post' : 'posts'} left this month. Resets on the 1st.`
              : 'Resets on the 1st of the month.'}
          </p>
        </>
      ) : (
        <p className="text-[13px] text-ink-2 leading-relaxed">
          Your strategist will set monthly allotments once your plan is finalized. Until then,
          requests are quoted individually.
        </p>
      )}
    </div>
  )
}

function PlanEmptyCard() {
  return (
    <div
      className="rounded-2xl border-2 border-dashed bg-white p-5 flex items-start gap-3"
      style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
    >
      <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-bg-2 text-ink-3 flex-shrink-0">
        <CircleCheck className="w-4.5 h-4.5" />
      </div>
      <div className="flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-3 leading-none">
          Your plan
        </p>
        <p className="text-[12px] text-ink-2 mt-1.5 leading-snug">
          Your strategist sets monthly allotments once your plan is finalized. Until then,
          each request is quoted on its own.
        </p>
      </div>
    </div>
  )
}

function QuotesCard({ quotes }: { quotes: ContentQuote[] }) {
  const total = quotes.reduce((s, q) => s + q.total, 0)
  return (
    <div
      className="rounded-2xl border bg-gradient-to-br from-amber-50/60 via-white to-white p-5"
      style={{ borderColor: 'var(--db-border, #f0e6d6)' }}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-amber-100 text-amber-700 ring-1 ring-amber-200/60 flex-shrink-0">
            <FileText className="w-4.5 h-4.5" />
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-700 leading-none">
              Waiting on you
            </p>
            <p className="text-[15px] font-semibold text-ink mt-1 leading-none">
              {quotes.length} quote{quotes.length === 1 ? '' : 's'} to review
            </p>
          </div>
        </div>
        <p className="text-[18px] font-bold text-ink tabular-nums leading-none">
          ${formatCompact(total)}
        </p>
      </div>

      <ul className="space-y-1.5">
        {quotes.slice(0, 3).map(q => (
          <li key={q.id}>
            <Link
              href={`/dashboard/social/quotes/${q.id}`}
              className="flex items-center gap-3 rounded-xl border bg-white px-3 py-2.5 hover:shadow-sm transition-shadow"
              style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
            >
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold text-ink leading-tight truncate">
                  {q.title}
                </p>
                {q.sourceRequestSummary && (
                  <p className="text-[10px] text-ink-3 mt-0.5 leading-tight truncate">
                    {q.sourceRequestSummary}
                  </p>
                )}
              </div>
              <span className="text-[13px] font-bold text-ink tabular-nums flex-shrink-0">
                ${q.total.toFixed(0)}
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-ink-4 flex-shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
      {quotes.length > 3 && (
        <p className="text-[11px] text-ink-3 mt-2">
          And {quotes.length - 3} more.
        </p>
      )}
    </div>
  )
}

function QuotesEmptyCard() {
  return (
    <div
      className="rounded-2xl border-2 border-dashed bg-white p-5 flex items-start gap-3"
      style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
    >
      <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-bg-2 text-ink-3 flex-shrink-0">
        <FileText className="w-4.5 h-4.5" />
      </div>
      <div className="flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-3 leading-none">
          No quotes pending
        </p>
        <p className="text-[12px] text-ink-2 mt-1.5 leading-snug">
          If a request goes beyond your plan, your strategist sends a quote here within 24 hours.
          Approve, decline, or ask for changes.
        </p>
      </div>
    </div>
  )
}

/* ─────────────────────────────── Last boost result ─────────────────────────────── */

function LastBoostResult({ campaign }: { campaign: CampaignRow }) {
  const cpClick = campaign.clicks > 0 ? campaign.spend / campaign.clicks : null
  return (
    <section className="mt-8">
      <div
        className="rounded-2xl border bg-gradient-to-br from-amber-50/60 via-white to-white p-5 sm:p-6"
        style={{ borderColor: 'var(--db-border, #f0e6d6)' }}
      >
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-amber-100 text-amber-700 ring-1 ring-amber-200/60 flex-shrink-0">
            <Zap className="w-4.5 h-4.5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-700 leading-none">
              Last boost result
            </p>
            <p className="text-[12px] text-ink-3 mt-1 leading-tight">
              ${campaign.budgetTotal.toFixed(0)} over {campaign.days} days · ended {relativeShort(campaign.endedAt ?? campaign.createdAt)}
            </p>
          </div>
          {/* "Boost another" CTA hidden for v1 (boost flow not wired). */}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <BoostStat icon={<Eye className="w-3.5 h-3.5" />} label="Reach" value={formatCompact(campaign.reach)} />
          <BoostStat icon={<MousePointer2 className="w-3.5 h-3.5" />} label="Clicks" value={formatCompact(campaign.clicks)} />
          <BoostStat icon={<TrendingUp className="w-3.5 h-3.5" />} label="Cost / click" value={cpClick ? `$${cpClick.toFixed(2)}` : '—'} />
          <BoostStat icon={<Footprints className="w-3.5 h-3.5" />} label="Visits (est.)" value={campaign.footTrafficEst ? formatCompact(campaign.footTrafficEst) : '—'} />
        </div>
      </div>
    </section>
  )
}

function BoostStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div
      className="rounded-xl bg-white border px-3 py-2.5"
      style={{ borderColor: 'var(--db-border, #ececec)' }}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-ink-4 mb-1.5 inline-flex items-center gap-1">
        <span className="text-ink-3">{icon}</span>
        {label}
      </p>
      <p className="text-[20px] font-bold text-ink tabular-nums leading-none">{value}</p>
    </div>
  )
}

/* ─────────────────────────────── helpers ─────────────────────────────── */

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return `${n}`
}

function relativeShort(iso: string | null): string {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  const d = Math.round(ms / 86_400_000)
  if (d < 1) return 'today'
  if (d === 1) return 'yesterday'
  if (d < 7) return `${d}d ago`
  if (d < 30) return `${Math.round(d / 7)}w ago`
  return `${Math.round(d / 30)}mo ago`
}

function formatShort(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  if (sameDay(d, today)) return `Today · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
  if (sameDay(d, tomorrow)) return `Tomorrow · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}
