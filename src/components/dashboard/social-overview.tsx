'use client'

/**
 * Simplified social performance view for restaurant owners.
 *
 * This is the "Overview" tab -- the page someone who just wants to know
 * "is my social doing okay?" sees first. Three cards of plain numbers, top
 * three posts as big thumbnails, and one action to take. No cohort medians,
 * no caption-length buckets, no Meta footnotes. Power users click over to
 * Details for the full depth.
 *
 * Everything here computes locally from the same SocialPost array the full
 * performance component uses -- no new data required.
 */

import { useMemo } from 'react'
import Image from 'next/image'
import {
  Play, Image as ImageIcon, Layers, Heart, Bookmark,
  ArrowUpRight, ArrowDownRight, Users, TrendingUp, Zap, ExternalLink, Calendar,
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

function truncateCaption(caption: string | null, maxChars: number = 80): string {
  if (!caption) return ''
  const clean = caption.replace(/\s+/g, ' ').trim()
  if (clean.length <= maxChars) return clean
  return clean.slice(0, maxChars).replace(/\s+\S*$/, '') + '…'
}

function isReel(p: SocialPost): boolean {
  return p.media_product_type === 'REELS' || p.media_type === 'VIDEO'
}

function contentTypeLabel(post: SocialPost): string {
  if (post.media_product_type === 'REELS') return 'Reel'
  if (post.media_product_type === 'STORY') return 'Story'
  if (post.media_type === 'CAROUSEL_ALBUM') return 'Carousel'
  if (post.media_type === 'VIDEO') return 'Video'
  if (post.media_type === 'IMAGE') return 'Photo'
  return 'Post'
}

function ContentTypeIcon({ post, className = '' }: { post: SocialPost; className?: string }) {
  if (isReel(post)) return <Play className={className} />
  if (post.media_type === 'CAROUSEL_ALBUM') return <Layers className={className} />
  return <ImageIcon className={className} />
}

/**
 * Tiny inline SVG sparkline for summary cards. Uses viewBox-based scaling
 * so it responds to card width without needing a chart library. Points
 * below the min or above the max are never clipped; we pad the y-range
 * slightly so the line doesn't kiss the edges.
 */
function Sparkline({
  values, color = '#4abd98', height = 28,
}: {
  values: number[]
  color?: string
  height?: number
}) {
  if (values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const width = 100 // viewBox width; SVG scales to container
  const step = width / (values.length - 1)
  const points = values.map((v, i) => {
    const x = i * step
    // Invert y (SVG y-down); pad 10% top/bottom
    const y = height - ((v - min) / range) * (height * 0.8) - height * 0.1
    return `${x.toFixed(2)},${y.toFixed(2)}`
  }).join(' ')

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="w-full"
      style={{ height: `${height}px` }}
    >
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
// Simple at-a-glance -- 3 cards, big numbers, no small print
// ---------------------------------------------------------------------------

interface SimpleAtAGlanceProps {
  posts: SocialPost[]
  rows: SocialDailyRow[]
}

function SimpleAtAGlance({ posts, rows }: SimpleAtAGlanceProps) {
  const stats = useMemo(() => {
    const now = Date.now()
    const thirtyDaysMs = 30 * 86_400_000
    const recentPosts = posts.filter(
      p => now - new Date(p.posted_at).getTime() <= thirtyDaysMs,
    )

    // Avg reach per post across the last 30 days
    const postsWithReach = recentPosts.filter(p => (p.reach ?? 0) > 0)
    const avgReach = postsWithReach.length > 0
      ? Math.round(
          postsWithReach.reduce((a, p) => a + (p.reach ?? 0), 0) / postsWithReach.length,
        )
      : 0

    // Current follower total -- latest row we have across all platforms
    const latestRowByPlatform = new Map<string, SocialDailyRow>()
    for (const r of rows) {
      const existing = latestRowByPlatform.get(r.platform)
      if (!existing || r.date > existing.date) latestRowByPlatform.set(r.platform, r)
    }
    const currentFollowers = Array.from(latestRowByPlatform.values())
      .reduce((a, r) => a + (r.followers_total ?? 0), 0)

    // Net new followers over the last 30 days (sum of daily deltas). Will
    // be 0 for a while after connect -- honest.
    const thirtyDayRows = rows.filter(r => {
      const d = new Date(r.date).getTime()
      return now - d <= thirtyDaysMs
    })
    const netNewFollowers = thirtyDayRows.reduce(
      (a, r) => a + (r.followers_gained ?? 0), 0,
    )

    // Followers trend -- one point per day over the last 30 days, summed
    // across platforms. If we don't have a followers_total for a given day
    // (happens during the backfill window), we carry the last known value
    // forward so the line stays continuous instead of sinking to zero.
    const sortedDates = Array.from(new Set(rows.map(r => r.date))).sort()
    const followersByDate = new Map<string, number>()
    for (const date of sortedDates) {
      const dayRows = rows.filter(r => r.date === date)
      const total = dayRows.reduce((acc, r) => acc + (r.followers_total ?? 0), 0)
      if (total > 0) followersByDate.set(date, total)
    }
    // Turn the map into a dense array over the last 30 days with carry-forward
    const followersTrend: number[] = []
    let lastSeen = 0
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now - i * 86_400_000)
      const dateStr = d.toISOString().split('T')[0]
      const val = followersByDate.get(dateStr)
      if (val) lastSeen = val
      if (lastSeen > 0) followersTrend.push(lastSeen)
    }

    return {
      postCount: recentPosts.length,
      avgReach,
      currentFollowers,
      netNewFollowers,
      followersTrend,
    }
  }, [posts, rows])

  return (
    <section className="mb-8">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Followers */}
        <div className="bg-white rounded-xl border border-ink-6 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-ink-4" />
            <span className="text-[12px] font-semibold text-ink-3">Followers</span>
          </div>
          <div className="font-[family-name:var(--font-display)] text-4xl text-ink tabular-nums mb-1">
            {formatNumber(stats.currentFollowers)}
          </div>
          <div className="flex items-end justify-between gap-3 min-h-[28px]">
            {stats.netNewFollowers !== 0 ? (
              <div
                className="inline-flex items-center gap-1 text-[12px] font-medium tabular-nums flex-shrink-0"
                style={{ color: stats.netNewFollowers > 0 ? '#2d7a5f' : '#c14343' }}
              >
                {stats.netNewFollowers > 0 ? (
                  <ArrowUpRight className="w-3.5 h-3.5" />
                ) : (
                  <ArrowDownRight className="w-3.5 h-3.5" />
                )}
                {Math.abs(stats.netNewFollowers)} this month
              </div>
            ) : (
              <div className="text-[12px] text-ink-4 flex-shrink-0">Steady this month</div>
            )}
            {stats.followersTrend.length >= 3 && (
              <div className="flex-1 max-w-[120px] opacity-80">
                <Sparkline values={stats.followersTrend} />
              </div>
            )}
          </div>
        </div>

        {/* Avg reach per post */}
        <div className="bg-white rounded-xl border border-ink-6 p-5">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-ink-4" />
            <span className="text-[12px] font-semibold text-ink-3">Avg people reached</span>
          </div>
          <div className="font-[family-name:var(--font-display)] text-4xl text-ink tabular-nums mb-1">
            {formatNumber(stats.avgReach)}
          </div>
          <div className="text-[12px] text-ink-4">per post, last 30 days</div>
        </div>

        {/* Posts this month */}
        <div className="bg-white rounded-xl border border-ink-6 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-ink-4" />
            <span className="text-[12px] font-semibold text-ink-3">Posts this month</span>
          </div>
          <div className="font-[family-name:var(--font-display)] text-4xl text-ink tabular-nums mb-1">
            {stats.postCount}
          </div>
          <div className="text-[12px] text-ink-4">
            {stats.postCount >= 12
              ? 'Strong cadence'
              : stats.postCount >= 6
              ? 'Try for a few more'
              : 'Post more often to grow'}
          </div>
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Top 3 posts -- big, simple, clickable
// ---------------------------------------------------------------------------

function TopThreePosts({ posts }: { posts: SocialPost[] }) {
  const top = useMemo(() => {
    return [...posts]
      .sort((a, b) => (b.reach ?? 0) - (a.reach ?? 0))
      .slice(0, 3)
  }, [posts])

  if (top.length === 0) return null

  return (
    <section className="mb-8">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-ink">Your best posts</h2>
        <p className="text-xs text-ink-3 mt-0.5">Top three by how many people they reached.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {top.map(post => (
          <SimplePostCard key={post.id} post={post} />
        ))}
      </div>
    </section>
  )
}

function SimplePostCard({ post }: { post: SocialPost }) {
  return (
    <a
      href={post.permalink ?? '#'}
      target="_blank"
      rel="noopener noreferrer"
      className="group bg-white rounded-xl border border-ink-6 overflow-hidden hover:shadow-md transition-shadow flex flex-col"
    >
      <div className="relative aspect-square bg-bg-2 overflow-hidden">
        {post.thumbnail_url ? (
          <Image
            src={post.thumbnail_url}
            alt={truncateCaption(post.caption, 40) || 'Post thumbnail'}
            fill
            unoptimized
            sizes="(max-width: 640px) 100vw, 33vw"
            className="object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="h-full flex items-center justify-center">
            <ContentTypeIcon post={post} className="w-10 h-10 text-ink-4" />
          </div>
        )}
        <div className="absolute top-2 left-2 bg-black/70 text-white text-[10px] font-semibold px-2 py-1 rounded-md flex items-center gap-1">
          <ContentTypeIcon post={post} className="w-3 h-3" />
          {contentTypeLabel(post)}
        </div>
        <div className="absolute bottom-2 right-2 bg-white/90 rounded-md p-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <ExternalLink className="w-3 h-3 text-ink-2" />
        </div>
      </div>

      <div className="p-3 flex flex-col gap-2 flex-1">
        <p className="text-[13px] text-ink-2 line-clamp-2 leading-snug">
          {truncateCaption(post.caption) || <span className="italic text-ink-4">No caption</span>}
        </p>
        <div className="flex items-center gap-4 mt-auto pt-2 border-t border-ink-6 text-[13px]">
          <span className="inline-flex items-center gap-1 text-ink-3 tabular-nums">
            <TrendingUp className="w-3.5 h-3.5" />
            <span className="font-semibold text-ink">{formatNumber(post.reach ?? 0)}</span>
          </span>
          <span className="inline-flex items-center gap-1 text-ink-3 tabular-nums">
            <Heart className="w-3.5 h-3.5" />
            <span className="font-semibold text-ink">{formatNumber(post.likes ?? 0)}</span>
          </span>
          {post.saves != null && post.saves > 0 && (
            <span className="inline-flex items-center gap-1 text-ink-3 tabular-nums">
              <Bookmark className="w-3.5 h-3.5" />
              <span className="font-semibold text-ink">{formatNumber(post.saves)}</span>
            </span>
          )}
        </div>
      </div>
    </a>
  )
}

// ---------------------------------------------------------------------------
// One-action insight
// ---------------------------------------------------------------------------

function PrimaryAction({ posts }: { posts: SocialPost[] }) {
  const analysis = useMemo(() => {
    const postsWithReach = posts.filter(p => (p.reach ?? 0) > 0)
    if (postsWithReach.length < 3) return null

    const byType = new Map<string, { count: number; total: number }>()
    for (const p of postsWithReach) {
      const type = contentTypeLabel(p).toLowerCase()
      const entry = byType.get(type) ?? { count: 0, total: 0 }
      entry.count += 1
      entry.total += p.reach ?? 0
      byType.set(type, entry)
    }
    const ranked = Array.from(byType.entries())
      .filter(([, v]) => v.count >= 2)
      .map(([type, v]) => ({ type, avg: Math.round(v.total / v.count), count: v.count }))
      .sort((a, b) => b.avg - a.avg)

    if (ranked.length < 2) return null
    const best = ranked[0]
    const worst = ranked[ranked.length - 1]
    const multiple = Math.round((best.avg / Math.max(worst.avg, 1)) * 10) / 10
    if (multiple < 1.5) return null

    return {
      ranked,
      headline: `Post more ${best.type}s. They reach ${multiple}x more people than your ${worst.type}s.`,
      bestType: best.type,
    }
  }, [posts])

  if (!analysis) return null

  const maxAvg = analysis.ranked[0].avg

  return (
    <section className="mb-8">
      <div className="bg-white rounded-xl border-2 p-5" style={{ borderColor: '#4abd98' }}>
        <div className="flex items-start gap-3 mb-4">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(74, 189, 152, 0.15)' }}
          >
            <Zap className="w-4 h-4" style={{ color: '#4abd98' }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: '#4abd98' }}>
              Biggest lever
            </div>
            <p className="text-[15px] text-ink font-semibold leading-snug">{analysis.headline}</p>
          </div>
        </div>

        {/* Visual bar chart of avg reach by format */}
        <div className="flex flex-col gap-2 pl-12">
          {analysis.ranked.map(row => {
            const isBest = row.type === analysis.bestType
            const widthPct = Math.max(6, (row.avg / maxAvg) * 100)
            return (
              <div key={row.type} className="flex items-center gap-3">
                <span className="text-[12px] text-ink-2 font-medium capitalize w-20 flex-shrink-0">
                  {row.type}
                </span>
                <div className="flex-1 h-7 bg-bg-2 rounded-md overflow-hidden relative">
                  <div
                    className="h-full rounded-md transition-all"
                    style={{
                      width: `${widthPct}%`,
                      background: isBest ? '#4abd98' : 'var(--db-ink-5, #ccc)',
                    }}
                  />
                  <div className="absolute inset-0 flex items-center px-3">
                    <span
                      className="text-[11px] font-semibold tabular-nums"
                      style={{ color: isBest && widthPct > 20 ? 'white' : 'var(--db-black)' }}
                    >
                      {formatNumber(row.avg)} reach
                    </span>
                  </div>
                </div>
                <span className="text-[11px] text-ink-4 tabular-nums w-16 flex-shrink-0 text-right">
                  {row.count} post{row.count === 1 ? '' : 's'}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Compact 14-day posting strip
// ---------------------------------------------------------------------------

/**
 * Two-week strip of posting activity. Simpler than the full 28-day heatmap
 * on the Details tab -- owners want to see "am I posting enough?" at a
 * glance, not a grid they have to interpret. Each day is a square colored
 * by post count, with day-of-week labels for context.
 */
function CadenceStrip({ posts }: { posts: SocialPost[] }) {
  const days = useMemo(() => {
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    const cells: Array<{ date: Date; count: number; label: string; dow: string }> = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      const dateStr = d.toISOString().split('T')[0]
      const count = posts.filter(p => p.posted_at.startsWith(dateStr)).length
      cells.push({
        date: d,
        count,
        label: dateStr,
        dow: d.toLocaleDateString('en-US', { weekday: 'narrow' }),
      })
    }
    return cells
  }, [posts])

  const totalPosts = days.reduce((a, d) => a + d.count, 0)
  const activeDays = days.filter(d => d.count > 0).length

  const summary = totalPosts === 0
    ? 'No posts in the last two weeks. Post at least once this week to stay in the algorithm.'
    : activeDays >= 8
    ? `Great rhythm. You posted on ${activeDays} of the last 14 days.`
    : activeDays >= 4
    ? `You posted on ${activeDays} of the last 14 days. Aim for 8+ to see real growth.`
    : `You posted on just ${activeDays} of the last 14 days. Try for 3-4 per week.`

  return (
    <section className="mb-8">
      <div className="bg-white rounded-xl border border-ink-6 p-5">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-ink-4" />
            <span className="text-[12px] font-semibold text-ink-3">Posting rhythm</span>
          </div>
          <span className="text-[11px] text-ink-4">Last 14 days</span>
        </div>

        <p className="text-[13px] text-ink-2 mb-4 leading-snug">{summary}</p>

        {/* 14-day strip */}
        <div className="grid grid-cols-14 gap-1.5" style={{ gridTemplateColumns: 'repeat(14, 1fr)' }}>
          {days.map((cell, i) => {
            const intensity = cell.count === 0 ? 0
              : cell.count === 1 ? 0.4
              : cell.count === 2 ? 0.7
              : 1.0
            return (
              <div key={i} className="flex flex-col items-center gap-1">
                <div
                  className="w-full aspect-square rounded-md flex items-center justify-center text-[10px] font-semibold"
                  style={{
                    background: intensity === 0 ? 'var(--db-bg-3)' : `rgba(74, 189, 152, ${intensity})`,
                    color: intensity > 0.5 ? 'white' : 'var(--db-ink-3)',
                    minHeight: '26px',
                  }}
                  title={`${cell.label} - ${cell.count} post${cell.count === 1 ? '' : 's'}`}
                >
                  {cell.count > 0 ? cell.count : ''}
                </div>
                <span className="text-[9px] text-ink-4">{cell.dow}</span>
              </div>
            )
          })}
        </div>
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
  if (posts.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-ink-6 p-8 text-center mb-10">
        <p className="text-sm font-medium text-ink-2">No posts synced yet</p>
        <p className="text-xs text-ink-4 mt-1">Once the daily sync has run, your overview will show up here.</p>
      </div>
    )
  }

  return (
    <>
      <SimpleAtAGlance posts={posts} rows={rows} />
      <PrimaryAction posts={posts} />
      <CadenceStrip posts={posts} />
      <TopThreePosts posts={posts} />
    </>
  )
}
