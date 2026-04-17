'use client'

/**
 * The "Weekly Brief" view for restaurant owners.
 *
 * Optimized for FREQUENT check-ins: designed for an owner opening the page
 * 2-3 times per week to answer "are we doing okay? anything I need to do?"
 * in under 30 seconds.
 *
 * Structure (top to bottom, reads like a news brief):
 *   1. Health pulse -- one colored card with status + one-sentence summary
 *   2. Latest post spotlight -- the thing they just made, with context
 *   3. Weekly highlights -- 3-5 newsletter-style bullets
 *   4. One action -- a single specific next step
 *   5. At-a-glance strip -- small row of numbers for those who want them
 *
 * Everything is computed locally from the posts + social_metrics rows we
 * already have; no new API calls.
 */

import { useMemo } from 'react'
import Image from 'next/image'
import {
  Play, Image as ImageIcon, Layers, Heart, Bookmark, TrendingUp,
  ExternalLink, Clock, ArrowUpRight, ArrowDownRight,
} from 'lucide-react'
import type { SocialPost } from '@/lib/dashboard/get-social-posts'
import type { SocialDailyRow } from '@/lib/dashboard/get-social-breakdown'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '0'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 10_000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  if (n >= 1000) return Math.round(n).toLocaleString('en-US')
  return Math.round(n).toString()
}

function truncateCaption(caption: string | null, maxChars: number = 110): string {
  if (!caption) return ''
  const clean = caption.replace(/\s+/g, ' ').trim()
  if (clean.length <= maxChars) return clean
  return clean.slice(0, maxChars).replace(/\s+\S*$/, '') + '…'
}

function isReel(p: SocialPost): boolean {
  return p.media_product_type === 'REELS' || p.media_type === 'VIDEO'
}

function contentTypeLabel(post: SocialPost): string {
  if (post.media_product_type === 'REELS') return 'reel'
  if (post.media_product_type === 'STORY') return 'story'
  if (post.media_type === 'CAROUSEL_ALBUM') return 'carousel'
  if (post.media_type === 'VIDEO') return 'video'
  if (post.media_type === 'IMAGE') return 'photo'
  return 'post'
}

function ContentTypeIcon({ post, className = '' }: { post: SocialPost; className?: string }) {
  if (isReel(post)) return <Play className={className} />
  if (post.media_type === 'CAROUSEL_ALBUM') return <Layers className={className} />
  return <ImageIcon className={className} />
}

function daysAgo(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

function daysAgoLabel(iso: string): string {
  const n = daysAgo(iso)
  if (n === 0) return 'Today'
  if (n === 1) return 'Yesterday'
  if (n < 7) return `${n} days ago`
  if (n < 30) return `${Math.floor(n / 7)} weeks ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

// ---------------------------------------------------------------------------
// Mini chart primitives (pure SVG, no chart library)
// ---------------------------------------------------------------------------

/**
 * Smooth area chart -- for "nice curve going up" growth visuals like
 * followers over time. Draws both a filled area and a top stroke.
 */
function AreaChart({
  values, color = '#4abd98', height = 80,
}: {
  values: number[]
  color?: string
  height?: number
}) {
  if (values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const width = 100
  const step = width / (values.length - 1)
  const padY = height * 0.12
  const plotH = height - padY * 2

  const points = values.map((v, i) => ({
    x: i * step,
    y: height - ((v - min) / range) * plotH - padY,
  }))

  const stroke = points.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')
  const area = `M ${points[0].x},${height} L ${stroke.split(' ').join(' L ')} L ${points[points.length - 1].x},${height} Z`

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="w-full"
      style={{ height: `${height}px` }}
    >
      <defs>
        <linearGradient id={`area-grad-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#area-grad-${color})`} />
      <polyline
        points={stroke}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

/**
 * Bar chart -- for weekly totals where week-over-week comparison matters
 * more than a smooth curve.
 */
function BarChart({
  values, color = '#4abd98', height = 80,
}: {
  values: number[]
  color?: string
  height?: number
}) {
  if (values.length === 0) return null
  const max = Math.max(...values, 1)
  const width = 100
  const gap = 2
  const barWidth = (width - gap * (values.length - 1)) / values.length

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="w-full"
      style={{ height: `${height}px` }}
    >
      {values.map((v, i) => {
        const h = Math.max(1, (v / max) * (height - 4))
        const x = i * (barWidth + gap)
        const y = height - h
        return (
          <rect
            key={i}
            x={x.toFixed(2)}
            y={y.toFixed(2)}
            width={barWidth.toFixed(2)}
            height={h.toFixed(2)}
            fill={color}
            rx="1"
            opacity={i === values.length - 1 ? 1 : 0.55}
          />
        )
      })}
    </svg>
  )
}

/**
 * Tiny inline sparkline for the at-a-glance strip. Height is 20px so it
 * fits under a small number without stealing attention.
 */
function MiniSparkline({
  values, color = '#4abd98',
}: {
  values: number[]
  color?: string
}) {
  if (values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const height = 20
  const width = 100
  const step = width / (values.length - 1)
  const points = values.map((v, i) => {
    const x = i * step
    const y = height - ((v - min) / range) * (height * 0.8) - height * 0.1
    return `${x.toFixed(2)},${y.toFixed(2)}`
  }).join(' ')

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height: `${height}px` }}>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Computed weekly snapshot (used by every section below)
// ---------------------------------------------------------------------------

interface WeeklySnapshot {
  postsThisWeek: SocialPost[]
  postsLastWeek: SocialPost[]
  reachThisWeek: number
  reachLastWeek: number
  savesThisWeek: number
  savesLastWeek: number
  engThisWeek: number
  engLastWeek: number
  followersNow: number
  followersMonthDelta: number
  followersWeekDelta: number
  daysSinceLastPost: number | null
  latestPost: SocialPost | null
  medianReach: number
  reelCount: number
  staticCount: number
  reelAvgReach: number
  staticAvgReach: number
  // Trend series for visualizations
  followersTrend30: number[]         // 30-day followers, carry-forward
  reachByWeek: number[]              // last 6 ISO-weeks of content reach
  sparkFollowers30: number[]         // 30 data points (same as trend)
  sparkReach8: number[]              // 8 weekly reach totals
  sparkSaves8: number[]              // 8 weekly saves totals
  sparkPosts8: number[]              // 8 weekly post counts
  reachWeeklyChangePct: number | null
}

function computeSnapshot(posts: SocialPost[], rows: SocialDailyRow[]): WeeklySnapshot {
  const now = Date.now()
  const weekAgo = now - 7 * 86_400_000
  const twoWeeksAgo = now - 14 * 86_400_000

  const inWindow = (p: SocialPost, start: number, end: number) => {
    const t = new Date(p.posted_at).getTime()
    return t >= start && t < end
  }

  const postsThisWeek = posts.filter(p => inWindow(p, weekAgo, now))
  const postsLastWeek = posts.filter(p => inWindow(p, twoWeeksAgo, weekAgo))

  const sum = (arr: SocialPost[], field: keyof SocialPost) =>
    arr.reduce((a, p) => a + (Number(p[field]) || 0), 0)
  const eng = (arr: SocialPost[]) =>
    arr.reduce((a, p) =>
      a + (p.likes ?? 0) + (p.comments ?? 0) + (p.saves ?? 0) + (p.shares ?? 0), 0)

  // Followers from rows -- latest per platform, summed
  const latestByPlatform = new Map<string, SocialDailyRow>()
  for (const r of rows) {
    const existing = latestByPlatform.get(r.platform)
    if (!existing || r.date > existing.date) latestByPlatform.set(r.platform, r)
  }
  const followersNow = Array.from(latestByPlatform.values())
    .reduce((a, r) => a + (r.followers_total ?? 0), 0)
  const followersWeekDelta = rows
    .filter(r => {
      const t = new Date(r.date).getTime()
      return t >= weekAgo && t < now
    })
    .reduce((a, r) => a + (r.followers_gained ?? 0), 0)

  const sortedPosts = [...posts].sort(
    (a, b) => new Date(b.posted_at).getTime() - new Date(a.posted_at).getTime(),
  )
  const latestPost = sortedPosts[0] ?? null
  const daysSinceLastPost = latestPost ? daysAgo(latestPost.posted_at) : null

  const reachValues = posts.map(p => p.reach ?? 0).filter(v => v > 0)
  const medianReach = median(reachValues)

  const reels = posts.filter(isReel)
  const statics = posts.filter(p => !isReel(p) && p.media_product_type !== 'STORY')
  const avg = (arr: SocialPost[]) => {
    const withReach = arr.filter(p => (p.reach ?? 0) > 0)
    return withReach.length === 0 ? 0 : Math.round(
      withReach.reduce((a, p) => a + (p.reach ?? 0), 0) / withReach.length,
    )
  }

  // ----- Trend series for visualizations -----

  // Followers over the last 30 days, carry-forward so the line stays
  // continuous across backfill days with null followers_total.
  const followersByDate = new Map<string, number>()
  const sortedDates = Array.from(new Set(rows.map(r => r.date))).sort()
  for (const date of sortedDates) {
    const dayRows = rows.filter(r => r.date === date)
    const total = dayRows.reduce((acc, r) => acc + (r.followers_total ?? 0), 0)
    if (total > 0) followersByDate.set(date, total)
  }
  const followersTrend30: number[] = []
  let lastSeen = 0
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now - i * 86_400_000)
    const dateStr = d.toISOString().split('T')[0]
    const val = followersByDate.get(dateStr)
    if (val) lastSeen = val
    if (lastSeen > 0) followersTrend30.push(lastSeen)
  }

  // Followers month delta: current vs 30 days ago (if we have both)
  const followersMonthDelta = followersTrend30.length >= 2
    ? followersTrend30[followersTrend30.length - 1] - followersTrend30[0]
    : 0

  // Last 8 weeks of content so each at-a-glance card can carry a spark.
  const reachByWeekAll: number[] = []
  const savesByWeekAll: number[] = []
  const postsByWeekAll: number[] = []
  for (let w = 7; w >= 0; w--) {
    const weekStart = now - (w + 1) * 7 * 86_400_000
    const weekEnd = now - w * 7 * 86_400_000
    const weekPosts = posts.filter(p => {
      const t = new Date(p.posted_at).getTime()
      return t >= weekStart && t < weekEnd
    })
    reachByWeekAll.push(weekPosts.reduce((a, p) => a + (p.reach ?? 0), 0))
    savesByWeekAll.push(weekPosts.reduce((a, p) => a + (p.saves ?? 0), 0))
    postsByWeekAll.push(weekPosts.length)
  }

  // Weekly change %: this week vs last week content reach
  const thisWeekReach = reachByWeekAll[reachByWeekAll.length - 1] ?? 0
  const lastWeekReach = reachByWeekAll[reachByWeekAll.length - 2] ?? 0
  const reachWeeklyChangePct = lastWeekReach > 0
    ? ((thisWeekReach - lastWeekReach) / lastWeekReach) * 100
    : null

  return {
    postsThisWeek,
    postsLastWeek,
    reachThisWeek: sum(postsThisWeek, 'reach'),
    reachLastWeek: sum(postsLastWeek, 'reach'),
    savesThisWeek: sum(postsThisWeek, 'saves'),
    savesLastWeek: sum(postsLastWeek, 'saves'),
    engThisWeek: eng(postsThisWeek),
    engLastWeek: eng(postsLastWeek),
    followersNow,
    followersMonthDelta,
    followersWeekDelta,
    daysSinceLastPost,
    latestPost,
    medianReach,
    reelCount: reels.length,
    staticCount: statics.length,
    reelAvgReach: avg(reels),
    staticAvgReach: avg(statics),
    followersTrend30,
    reachByWeek: reachByWeekAll.slice(-6),
    sparkFollowers30: followersTrend30,
    sparkReach8: reachByWeekAll,
    sparkSaves8: savesByWeekAll,
    sparkPosts8: postsByWeekAll,
    reachWeeklyChangePct,
  }
}

// ---------------------------------------------------------------------------
// 1. Health pulse -- hero card with colored status + one sentence
// ---------------------------------------------------------------------------

type PulseStatus = 'green' | 'yellow' | 'red'

function computePulse(snap: WeeklySnapshot): { status: PulseStatus; headline: string; detail: string } {
  const daysSince = snap.daysSinceLastPost ?? 999
  const postedRecently = daysSince <= 3
  const postedThisWeek = snap.postsThisWeek.length > 0
  const reachChange = snap.reachLastWeek > 0
    ? ((snap.reachThisWeek - snap.reachLastWeek) / snap.reachLastWeek) * 100
    : null

  // Scoring: 1 point each for "posted this week", "reach steady/up", "followers steady/up"
  // Green = 3, Yellow = 2, Red = 0-1
  let score = 0
  if (postedThisWeek) score += 1
  if (reachChange === null || reachChange >= -20) score += 1
  if (snap.followersWeekDelta >= 0) score += 1

  const status: PulseStatus = score >= 3 ? 'green' : score >= 2 ? 'yellow' : 'red'

  // One-line headline
  let headline: string
  if (status === 'green') {
    headline = reachChange && reachChange >= 20
      ? 'Your social is having a great week.'
      : 'Your social is growing steadily.'
  } else if (status === 'yellow') {
    headline = !postedThisWeek
      ? 'Your social is quiet this week.'
      : reachChange !== null && reachChange < -20
      ? 'Reach is softening this week.'
      : 'Your social is holding steady.'
  } else {
    headline = !postedRecently
      ? `No new posts in ${daysSince} days.`
      : 'Your social needs attention this week.'
  }

  // Detail line: "2 new followers · 3 posts · reach up 18% vs last week"
  const parts: string[] = []
  if (snap.followersWeekDelta > 0) {
    parts.push(`${snap.followersWeekDelta} new follower${snap.followersWeekDelta === 1 ? '' : 's'}`)
  } else if (snap.followersWeekDelta < 0) {
    parts.push(`${Math.abs(snap.followersWeekDelta)} lost`)
  }
  parts.push(`${snap.postsThisWeek.length} post${snap.postsThisWeek.length === 1 ? '' : 's'}`)
  if (reachChange !== null) {
    const rounded = Math.round(reachChange)
    if (Math.abs(rounded) >= 5) {
      parts.push(`reach ${rounded > 0 ? 'up' : 'down'} ${Math.abs(rounded)}% vs last week`)
    }
  }

  return { status, headline, detail: parts.join(' · ') }
}

function HealthPulse({ snap }: { snap: WeeklySnapshot }) {
  const pulse = computePulse(snap)

  const styles: Record<PulseStatus, { bg: string; border: string; dot: string; label: string }> = {
    green: { bg: 'rgba(74, 189, 152, 0.08)', border: '#4abd98', dot: '#4abd98', label: 'Growing' },
    yellow: { bg: 'rgba(234, 179, 8, 0.08)', border: '#eab308', dot: '#eab308', label: 'Steady' },
    red: { bg: 'rgba(229, 115, 115, 0.08)', border: '#e57373', dot: '#e57373', label: 'Needs attention' },
  }
  const s = styles[pulse.status]

  return (
    <section className="mb-8">
      <div
        className="rounded-2xl border-2 p-6 flex items-start gap-5"
        style={{ background: s.bg, borderColor: s.border }}
      >
        <div className="flex-shrink-0 flex flex-col items-center">
          <div
            className="w-4 h-4 rounded-full mb-2"
            style={{ background: s.dot, boxShadow: `0 0 0 4px ${s.bg}` }}
          />
          <span
            className="text-[10px] font-bold uppercase tracking-wider"
            style={{ color: s.dot }}
          >
            {s.label}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-[family-name:var(--font-display)] text-[22px] text-ink leading-tight mb-2">
            {pulse.headline}
          </h2>
          <p className="text-[13px] text-ink-3">{pulse.detail}</p>
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// 2. Latest post spotlight
// ---------------------------------------------------------------------------

function LatestPost({ snap }: { snap: WeeklySnapshot }) {
  if (!snap.latestPost) return null
  const p = snap.latestPost
  const reach = p.reach ?? 0
  const multiple = snap.medianReach > 0 ? reach / snap.medianReach : null

  let performance: { label: string; color: string; bg: string } | null = null
  if (multiple !== null && reach > 0) {
    if (multiple >= 1.5) {
      performance = {
        label: `${multiple.toFixed(1)}\u00d7 your average`,
        color: '#2d7a5f',
        bg: 'rgba(74, 189, 152, 0.15)',
      }
    } else if (multiple >= 0.8) {
      performance = {
        label: 'Typical for you',
        color: 'var(--db-ink-2)',
        bg: 'var(--db-bg-3)',
      }
    } else {
      performance = {
        label: `${Math.round(multiple * 100)}% of average`,
        color: '#c14343',
        bg: 'rgba(229, 115, 115, 0.12)',
      }
    }
  }

  return (
    <section className="mb-8">
      <div className="mb-3">
        <h2 className="text-lg font-bold text-ink">Your latest post</h2>
        <p className="text-xs text-ink-3 mt-0.5">How the thing you just published is doing.</p>
      </div>

      <a
        href={p.permalink ?? '#'}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex gap-4 bg-white rounded-xl border border-ink-6 p-4 hover:shadow-md transition-shadow"
      >
        {/* Thumbnail */}
        <div className="relative w-28 h-28 sm:w-36 sm:h-36 rounded-lg overflow-hidden bg-bg-2 flex-shrink-0">
          {p.thumbnail_url ? (
            <Image
              src={p.thumbnail_url}
              alt={truncateCaption(p.caption, 40) || 'Latest post'}
              fill
              unoptimized
              sizes="144px"
              className="object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="h-full flex items-center justify-center">
              <ContentTypeIcon post={p} className="w-8 h-8 text-ink-4" />
            </div>
          )}
          <div className="absolute top-1.5 left-1.5 bg-black/70 text-white text-[9px] font-semibold px-1.5 py-0.5 rounded flex items-center gap-1 uppercase">
            <ContentTypeIcon post={p} className="w-2.5 h-2.5" />
            {contentTypeLabel(p)}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex items-center gap-2 text-[11px] text-ink-4 mb-2">
            <Clock className="w-3 h-3" />
            {daysAgoLabel(p.posted_at)}
            {performance && (
              <span
                className="ml-auto text-[11px] font-semibold px-2 py-0.5 rounded-full tabular-nums"
                style={{ color: performance.color, background: performance.bg }}
              >
                {performance.label}
              </span>
            )}
          </div>
          <p className="text-[14px] text-ink-2 line-clamp-3 leading-snug mb-auto">
            {truncateCaption(p.caption) || <span className="italic text-ink-4">No caption</span>}
          </p>
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-ink-6 text-[13px]">
            <span className="inline-flex items-center gap-1 text-ink-3 tabular-nums">
              <TrendingUp className="w-3.5 h-3.5" />
              <span className="font-semibold text-ink">{formatNumber(reach)}</span>
              <span className="text-ink-4">reached</span>
            </span>
            <span className="inline-flex items-center gap-1 text-ink-3 tabular-nums">
              <Heart className="w-3.5 h-3.5" />
              <span className="font-semibold text-ink">{formatNumber(p.likes ?? 0)}</span>
            </span>
            {p.saves != null && p.saves > 0 && (
              <span className="inline-flex items-center gap-1 text-ink-3 tabular-nums">
                <Bookmark className="w-3.5 h-3.5" />
                <span className="font-semibold text-ink">{formatNumber(p.saves)}</span>
              </span>
            )}
            <ExternalLink className="w-3 h-3 text-ink-4 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
      </a>
    </section>
  )
}

// ---------------------------------------------------------------------------
// 2b. Your growth -- two compact trend cards
// ---------------------------------------------------------------------------

/**
 * Visual reassurance that "we're growing" in a way numbers alone can't
 * provide. Two side-by-side cards: followers (smooth area chart) and
 * content reach (weekly bars). Intentionally lightweight -- no axes, no
 * filters, just the shape. Chart color softens to yellow/red when the
 * trend is flat or declining so the visual doubles as a soft alert.
 */
function Growth({ snap }: { snap: WeeklySnapshot }) {
  const hasFollowerData = snap.followersTrend30.length >= 3
  const hasReachData = snap.reachByWeek.some(v => v > 0)
  if (!hasFollowerData && !hasReachData) return null

  // Followers trend color -- green if up, neutral if flat, red if down
  const followersStart = snap.followersTrend30[0] ?? 0
  const followersEnd = snap.followersTrend30[snap.followersTrend30.length - 1] ?? 0
  const followersDelta = followersEnd - followersStart
  const followerColor = followersDelta > 0 ? '#4abd98'
    : followersDelta < 0 ? '#e57373'
    : 'var(--db-ink-4, #888)'

  // Reach trend color -- compare last 3 weeks vs prior 3
  const recent3 = snap.reachByWeek.slice(-3).reduce((a, b) => a + b, 0)
  const prior3 = snap.reachByWeek.slice(0, 3).reduce((a, b) => a + b, 0)
  const reachColor = recent3 > prior3 ? '#4abd98'
    : recent3 < prior3 ? '#eab308'
    : 'var(--db-ink-4, #888)'

  const totalReach6w = snap.reachByWeek.reduce((a, b) => a + b, 0)
  const avgWeeklyReach = snap.reachByWeek.length > 0
    ? Math.round(totalReach6w / snap.reachByWeek.length)
    : 0

  return (
    <section className="mb-8">
      <div className="mb-3">
        <h2 className="text-lg font-bold text-ink">Your growth</h2>
        <p className="text-xs text-ink-3 mt-0.5">Followers and content reach over the last several weeks.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Followers area chart */}
        {hasFollowerData && (
          <div className="bg-white rounded-xl border border-ink-6 p-4">
            <div className="flex items-baseline justify-between mb-1 gap-2">
              <span className="text-[11px] font-semibold text-ink-3 uppercase tracking-wide">Followers</span>
              {snap.followersMonthDelta !== 0 && (
                <span
                  className="inline-flex items-center text-[11px] font-semibold tabular-nums"
                  style={{ color: snap.followersMonthDelta > 0 ? '#2d7a5f' : '#c14343' }}
                >
                  {snap.followersMonthDelta > 0 ? (
                    <ArrowUpRight className="w-3 h-3" />
                  ) : (
                    <ArrowDownRight className="w-3 h-3" />
                  )}
                  {Math.abs(snap.followersMonthDelta)} this month
                </span>
              )}
            </div>
            <div className="font-[family-name:var(--font-display)] text-2xl text-ink tabular-nums mb-2">
              {formatNumber(followersEnd)}
            </div>
            <AreaChart values={snap.followersTrend30} color={followerColor} height={80} />
          </div>
        )}

        {/* Weekly reach bars */}
        {hasReachData && (
          <div className="bg-white rounded-xl border border-ink-6 p-4">
            <div className="flex items-baseline justify-between mb-1 gap-2">
              <span className="text-[11px] font-semibold text-ink-3 uppercase tracking-wide">Content reach</span>
              {snap.reachWeeklyChangePct !== null && Math.abs(snap.reachWeeklyChangePct) >= 5 && (
                <span
                  className="inline-flex items-center text-[11px] font-semibold tabular-nums"
                  style={{ color: snap.reachWeeklyChangePct > 0 ? '#2d7a5f' : '#c14343' }}
                >
                  {snap.reachWeeklyChangePct > 0 ? (
                    <ArrowUpRight className="w-3 h-3" />
                  ) : (
                    <ArrowDownRight className="w-3 h-3" />
                  )}
                  {Math.abs(Math.round(snap.reachWeeklyChangePct))}% vs last week
                </span>
              )}
            </div>
            <div className="font-[family-name:var(--font-display)] text-2xl text-ink tabular-nums mb-2">
              {formatNumber(avgWeeklyReach)}
              <span className="text-xs text-ink-4 font-sans ml-2">avg/week</span>
            </div>
            <BarChart values={snap.reachByWeek} color={reachColor} height={80} />
          </div>
        )}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// 3. Weekly highlights -- newsletter-style bullets
// ---------------------------------------------------------------------------

interface Highlight {
  emoji: string
  text: string
  priority: number // Higher = more prominent
}

function computeHighlights(snap: WeeklySnapshot): Highlight[] {
  const out: Highlight[] = []

  // Cadence warning -- highest priority if problem
  if (snap.daysSinceLastPost !== null && snap.daysSinceLastPost >= 5) {
    out.push({
      emoji: '⚠️',
      text: `You haven't posted in ${snap.daysSinceLastPost} days. Aim for 3-4 posts per week to stay in the algorithm.`,
      priority: 100,
    })
  }

  // Top post of the week
  if (snap.postsThisWeek.length > 0) {
    const bestThisWeek = [...snap.postsThisWeek].sort(
      (a, b) => (b.reach ?? 0) - (a.reach ?? 0),
    )[0]
    if (bestThisWeek && (bestThisWeek.reach ?? 0) > snap.medianReach * 1.3) {
      const multiple = snap.medianReach > 0
        ? Math.round(((bestThisWeek.reach ?? 0) / snap.medianReach) * 10) / 10
        : null
      out.push({
        emoji: '🔥',
        text: multiple
          ? `Your ${contentTypeLabel(bestThisWeek)} this week reached ${multiple}\u00d7 your typical post.`
          : `Your ${contentTypeLabel(bestThisWeek)} this week is your top performer.`,
        priority: 80,
      })
    }
  }

  // Reels vs static performance
  if (snap.reelCount >= 2 && snap.staticCount >= 2 && snap.staticAvgReach > 0) {
    const multiple = snap.reelAvgReach / snap.staticAvgReach
    if (multiple >= 1.5) {
      out.push({
        emoji: '📈',
        text: `Your reels reach ${Math.round(multiple * 10) / 10}\u00d7 more people than your other posts.`,
        priority: 70,
      })
    } else if (multiple <= 0.67) {
      out.push({
        emoji: '📊',
        text: `Your photos and carousels are outperforming your reels right now.`,
        priority: 70,
      })
    }
  }

  // Reach trend
  if (snap.reachLastWeek > 0) {
    const change = ((snap.reachThisWeek - snap.reachLastWeek) / snap.reachLastWeek) * 100
    const rounded = Math.round(change)
    if (rounded >= 25) {
      out.push({
        emoji: '🚀',
        text: `Total reach is up ${rounded}% vs last week.`,
        priority: 60,
      })
    } else if (rounded <= -25) {
      out.push({
        emoji: '📉',
        text: `Total reach dropped ${Math.abs(rounded)}% vs last week. Try posting more this week.`,
        priority: 65,
      })
    }
  }

  // Saves trend -- algorithm-favored
  if (snap.savesLastWeek > 0) {
    const change = ((snap.savesThisWeek - snap.savesLastWeek) / snap.savesLastWeek) * 100
    if (change >= 30) {
      out.push({
        emoji: '💾',
        text: `Saves are up ${Math.round(change)}% — the algorithm loves that.`,
        priority: 55,
      })
    }
  } else if (snap.savesThisWeek >= 3) {
    out.push({
      emoji: '💾',
      text: `You got ${snap.savesThisWeek} saves this week. Saves are the strongest signal to the algorithm.`,
      priority: 50,
    })
  }

  // Follower growth
  if (snap.followersWeekDelta > 0) {
    out.push({
      emoji: '✨',
      text: `Gained ${snap.followersWeekDelta} new follower${snap.followersWeekDelta === 1 ? '' : 's'} this week.`,
      priority: 40,
    })
  } else if (snap.followersWeekDelta < -5) {
    out.push({
      emoji: '👋',
      text: `${Math.abs(snap.followersWeekDelta)} followers unfollowed this week. Normal ebb, but worth noting.`,
      priority: 45,
    })
  }

  // Fallback -- don't leave the section empty
  if (out.length === 0 && snap.postsThisWeek.length > 0) {
    out.push({
      emoji: '👍',
      text: `You posted ${snap.postsThisWeek.length} time${snap.postsThisWeek.length === 1 ? '' : 's'} this week. Steady rhythm.`,
      priority: 10,
    })
  }

  return out.sort((a, b) => b.priority - a.priority).slice(0, 5)
}

function WeeklyHighlights({ snap }: { snap: WeeklySnapshot }) {
  const highlights = useMemo(() => computeHighlights(snap), [snap])

  if (highlights.length === 0) return null

  return (
    <section className="mb-8">
      <div className="mb-3">
        <h2 className="text-lg font-bold text-ink">This week&apos;s highlights</h2>
        <p className="text-xs text-ink-3 mt-0.5">What changed since last time you checked.</p>
      </div>
      <div className="bg-white rounded-xl border border-ink-6 divide-y divide-ink-6">
        {highlights.map((h, i) => (
          <div key={i} className="flex items-start gap-3 p-4">
            <span className="text-[18px] leading-none flex-shrink-0 mt-0.5">{h.emoji}</span>
            <p className="text-[14px] text-ink-2 leading-snug">{h.text}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// 4. One action for this week
// ---------------------------------------------------------------------------

function computeAction(snap: WeeklySnapshot): string {
  // Priority 1: cadence gap
  if (snap.daysSinceLastPost !== null && snap.daysSinceLastPost >= 5) {
    return 'Post something this week. A reel is your best bet.'
  }

  // Priority 2: underposting
  if (snap.postsThisWeek.length === 0) {
    return 'Get one post out this week to stay visible.'
  }
  if (snap.postsThisWeek.length === 1) {
    return 'Try posting 2 more times this week. Consistency trains the algorithm.'
  }

  // Priority 3: content format lever
  if (snap.reelCount >= 2 && snap.staticCount >= 2 && snap.staticAvgReach > 0) {
    const multiple = snap.reelAvgReach / snap.staticAvgReach
    if (multiple >= 1.5) {
      return `Post at least one more reel this week. They reach ${Math.round(multiple * 10) / 10}\u00d7 more people for you.`
    }
  }

  // Priority 4: saves opportunity
  if (snap.savesThisWeek === 0 && snap.postsThisWeek.length >= 2) {
    return 'Try a post worth saving — recipes, tips, or behind-the-scenes tend to get saved most.'
  }

  // Default: stay the course
  return 'Keep your cadence going. What\u2019s working is working.'
}

function WeeklyAction({ snap }: { snap: WeeklySnapshot }) {
  const action = useMemo(() => computeAction(snap), [snap])

  return (
    <section className="mb-8">
      <div className="bg-ink text-white rounded-2xl p-5 flex items-center gap-4">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(255, 255, 255, 0.1)' }}
        >
          <span className="text-[18px]">👉</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: '#4abd98' }}>
            This week&apos;s move
          </div>
          <p className="text-[15px] font-semibold leading-snug">{action}</p>
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// 5. At-a-glance strip -- compact row of numbers at the bottom
// ---------------------------------------------------------------------------

function AtAGlanceStrip({ snap }: { snap: WeeklySnapshot }) {
  const items: Array<{
    label: string
    value: string
    delta?: number
    spark: number[]
  }> = [
    {
      label: 'Followers',
      value: formatNumber(snap.followersNow),
      delta: snap.followersWeekDelta,
      spark: snap.sparkFollowers30,
    },
    {
      label: 'Reach this week',
      value: formatNumber(snap.reachThisWeek),
      spark: snap.sparkReach8,
    },
    {
      label: 'Saves this week',
      value: formatNumber(snap.savesThisWeek),
      spark: snap.sparkSaves8,
    },
    {
      label: 'Posts this week',
      value: String(snap.postsThisWeek.length),
      spark: snap.sparkPosts8,
    },
  ]

  return (
    <section>
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-ink-3">At a glance</h2>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {items.map(item => {
          // Tint color based on series direction
          const first = item.spark[0] ?? 0
          const last = item.spark[item.spark.length - 1] ?? 0
          const sparkColor = last > first ? '#4abd98'
            : last < first ? '#e57373'
            : 'var(--db-ink-4, #aaa)'
          return (
            <div key={item.label} className="bg-white rounded-xl border border-ink-6 px-4 py-3">
              <div className="text-[10px] font-semibold text-ink-4 uppercase tracking-wide mb-1.5">
                {item.label}
              </div>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="font-[family-name:var(--font-display)] text-xl text-ink tabular-nums">
                  {item.value}
                </span>
                {item.delta !== undefined && item.delta !== 0 && (
                  <span
                    className="inline-flex items-center text-[11px] font-semibold tabular-nums"
                    style={{ color: item.delta > 0 ? '#2d7a5f' : '#c14343' }}
                  >
                    {item.delta > 0 ? (
                      <ArrowUpRight className="w-3 h-3" />
                    ) : (
                      <ArrowDownRight className="w-3 h-3" />
                    )}
                    {Math.abs(item.delta)}
                  </span>
                )}
              </div>
              {item.spark.length >= 2 && (
                <div className="opacity-80">
                  <MiniSparkline values={item.spark} color={sparkColor} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Combined export
// ---------------------------------------------------------------------------

interface SocialOverviewProps {
  posts: SocialPost[]
  rows: SocialDailyRow[]
}

export default function SocialOverview({ posts, rows }: SocialOverviewProps) {
  const snap = useMemo(() => computeSnapshot(posts, rows), [posts, rows])

  if (posts.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-ink-6 p-8 text-center mb-10">
        <p className="text-sm font-medium text-ink-2">No posts synced yet</p>
        <p className="text-xs text-ink-4 mt-1">Once the daily sync has run, your brief will show up here.</p>
      </div>
    )
  }

  return (
    <>
      <HealthPulse snap={snap} />
      <LatestPost snap={snap} />
      <Growth snap={snap} />
      <WeeklyHighlights snap={snap} />
      <WeeklyAction snap={snap} />
      <AtAGlanceStrip snap={snap} />
    </>
  )
}
