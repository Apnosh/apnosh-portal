'use client'

import { Fragment, useMemo, useState } from 'react'
import Image from 'next/image'
import {
  Play, Image as ImageIcon, Layers, Heart, MessageCircle, Bookmark, Repeat,
  ExternalLink, TrendingUp, Clock, Calendar, ArrowUpRight, ArrowDownRight, Minus,
  Hash, MessageSquare, Sparkles,
} from 'lucide-react'
import type { SocialPost } from '@/lib/dashboard/get-social-posts'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PLATFORM_COLORS: Record<string, string> = {
  instagram: '#E1306C',
  facebook: '#1877F2',
}

const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
}

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '0'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 10_000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  if (n >= 1000) return Math.round(n).toLocaleString('en-US')
  return Math.round(n).toString()
}

function truncateCaption(caption: string | null, maxChars: number = 120): string {
  if (!caption) return ''
  const clean = caption.replace(/\s+/g, ' ').trim()
  if (clean.length <= maxChars) return clean
  return clean.slice(0, maxChars).replace(/\s+\S*$/, '') + '…'
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
  if (post.media_product_type === 'REELS' || post.media_type === 'VIDEO') {
    return <Play className={className} />
  }
  if (post.media_type === 'CAROUSEL_ALBUM') {
    return <Layers className={className} />
  }
  return <ImageIcon className={className} />
}

/**
 * Post-level engagement rate -- (likes+comments+saves+shares) / reach.
 *
 * This is the ONE engagement-rate calculation that's honest: both numerator
 * and denominator come from the same post, measured over the same window.
 * Contrast with account-level rate (removed earlier) which divides Meta's
 * 1-day reach by aggregate interactions and produces nonsense.
 *
 * Returns null when reach is zero so we can display "—" rather than a
 * misleading 0%.
 */
function engagementRate(p: SocialPost): number | null {
  if (!p.reach || p.reach <= 0) return null
  const actions = (p.likes ?? 0) + (p.comments ?? 0) + (p.saves ?? 0) + (p.shares ?? 0)
  return (actions / p.reach) * 100
}

/**
 * Is this post a reel (short-form video)? Marketers benchmark reels and
 * feed posts separately because the IG algorithm distributes them very
 * differently -- a "good" reel reach is often 5-10x a "good" carousel reach.
 */
function isReel(p: SocialPost): boolean {
  return p.media_product_type === 'REELS' || p.media_type === 'VIDEO'
}

function isStatic(p: SocialPost): boolean {
  return !isReel(p) && p.media_product_type !== 'STORY'
}

/** Median of a numeric array, ignoring null/undefined. */
function median(values: Array<number | null | undefined>): number | null {
  const nums = values.filter((v): v is number => v != null && Number.isFinite(v))
  if (nums.length === 0) return null
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function daysAgo(iso: string): string {
  const posted = new Date(iso).getTime()
  const now = Date.now()
  const days = Math.floor((now - posted) / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ---------------------------------------------------------------------------
// Week-over-week summary
// ---------------------------------------------------------------------------

/**
 * Aggregates post-level stats for the current 7 days vs the prior 7 days.
 * Uses the post's published date as the anchor -- a reel published Monday
 * counts toward Monday's week, and its lifetime engagement shows up there.
 *
 * This isn't perfect (a reel keeps accumulating views after its week ends),
 * but it's the cleanest WoW we can make from post-level data and matches
 * how agencies report in weekly rollups.
 */
function WeekOverWeek({ posts }: { posts: SocialPost[] }) {
  const stats = useMemo(() => {
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7)
    const twoWeeksAgo = new Date(now); twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14)

    const bucket = (start: Date, end: Date) =>
      posts.filter(p => {
        const t = new Date(p.posted_at).getTime()
        return t >= start.getTime() && t < end.getTime()
      })

    const thisWeek = bucket(weekAgo, now)
    const lastWeek = bucket(twoWeeksAgo, weekAgo)

    const sum = (arr: SocialPost[], field: keyof SocialPost) =>
      arr.reduce((acc, p) => acc + (Number(p[field]) || 0), 0)

    return {
      thisWeek: {
        posts: thisWeek.length,
        reach: sum(thisWeek, 'reach'),
        saves: sum(thisWeek, 'saves'),
        engagement: thisWeek.reduce((acc, p) =>
          acc + (p.likes ?? 0) + (p.comments ?? 0) + (p.saves ?? 0) + (p.shares ?? 0), 0),
      },
      lastWeek: {
        posts: lastWeek.length,
        reach: sum(lastWeek, 'reach'),
        saves: sum(lastWeek, 'saves'),
        engagement: lastWeek.reduce((acc, p) =>
          acc + (p.likes ?? 0) + (p.comments ?? 0) + (p.saves ?? 0) + (p.shares ?? 0), 0),
      },
    }
  }, [posts])

  // Hide if there's literally nothing in either week (fresh connection)
  if (stats.thisWeek.posts === 0 && stats.lastWeek.posts === 0) return null

  return (
    <section className="mb-10">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-ink">This week vs last week</h2>
        <p className="text-xs text-ink-3 mt-0.5">Week-over-week changes across what you posted.</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <WoWStat label="Posts published" current={stats.thisWeek.posts} prior={stats.lastWeek.posts} />
        <WoWStat label="Total reach" current={stats.thisWeek.reach} prior={stats.lastWeek.reach} />
        <WoWStat label="Total engagement" current={stats.thisWeek.engagement} prior={stats.lastWeek.engagement} />
        <WoWStat label="Saves" current={stats.thisWeek.saves} prior={stats.lastWeek.saves} hint="Algorithm favors this" />
      </div>
    </section>
  )
}

function WoWStat({
  label, current, prior, hint,
}: {
  label: string
  current: number
  prior: number
  hint?: string
}) {
  const hasDelta = prior > 0
  const pct = hasDelta ? ((current - prior) / prior) * 100 : 0
  const rounded = Math.round(pct)
  const dir: 'up' | 'down' | 'flat' = !hasDelta ? 'flat' : rounded > 0 ? 'up' : rounded < 0 ? 'down' : 'flat'
  const Icon = dir === 'up' ? ArrowUpRight : dir === 'down' ? ArrowDownRight : Minus
  const color = dir === 'up' ? 'var(--db-up, #4abd98)' : dir === 'down' ? 'var(--db-down, #e57373)' : 'var(--db-ink-3)'
  const bg = dir === 'up' ? 'rgba(74, 189, 152, 0.12)' : dir === 'down' ? 'rgba(229, 115, 115, 0.12)' : 'transparent'

  return (
    <div className="bg-white rounded-xl border border-ink-6 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold text-ink-3 uppercase tracking-wide">{label}</span>
      </div>
      <div className="flex items-baseline gap-2 flex-wrap mb-1">
        <span className="font-[family-name:var(--font-display)] text-2xl text-ink tabular-nums">{formatNumber(current)}</span>
        {hasDelta && (
          <span
            className="inline-flex items-center gap-0.5 text-[11px] font-semibold rounded-full px-1.5 py-0.5 tabular-nums"
            style={{ color, background: bg }}
            title={`${prior.toLocaleString('en-US')} last week`}
          >
            <Icon className="w-3 h-3" />
            {Math.abs(rounded)}%
          </span>
        )}
      </div>
      <span className="text-[11px] text-ink-4">
        {hasDelta ? `vs ${formatNumber(prior)} prior week` : 'no prior-week data yet'}
        {hint ? ` · ${hint}` : ''}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Top Posts section
// ---------------------------------------------------------------------------

type PostSort = 'reach' | 'engagement' | 'saves' | 'recent'
type PostFilter = 'all' | 'reels' | 'feed'

function TopPosts({ posts }: { posts: SocialPost[] }) {
  const [sort, setSort] = useState<PostSort>('reach')
  const [filter, setFilter] = useState<PostFilter>('all')

  // Filter first, sort second. Filtering by format matters because reels
  // and feed posts sit on totally different reach scales -- showing them
  // together in a "top posts" list makes reels always win and hides the
  // winners inside the feed-post cohort.
  const filtered = useMemo(() => {
    if (filter === 'reels') return posts.filter(isReel)
    if (filter === 'feed') return posts.filter(isStatic)
    return posts
  }, [posts, filter])

  // Median reach is computed from whatever cohort the user is viewing so the
  // "vs median" chip compares apples to apples (reels to reels, feed to feed).
  const medianReach = useMemo(
    () => median(filtered.map(p => p.reach)) ?? 0,
    [filtered],
  )

  const sortedPosts = useMemo(() => {
    const engagementScore = (p: SocialPost) =>
      (p.likes ?? 0) + (p.comments ?? 0) + (p.saves ?? 0) + (p.shares ?? 0)

    const sorted = [...filtered].sort((a, b) => {
      if (sort === 'reach') return (b.reach ?? 0) - (a.reach ?? 0)
      if (sort === 'engagement') return engagementScore(b) - engagementScore(a)
      if (sort === 'saves') return (b.saves ?? 0) - (a.saves ?? 0)
      return new Date(b.posted_at).getTime() - new Date(a.posted_at).getTime()
    })
    return sorted.slice(0, 6)
  }, [filtered, sort])

  if (posts.length === 0) {
    return null
  }

  const reelCount = posts.filter(isReel).length
  const feedCount = posts.filter(isStatic).length

  return (
    <section className="mb-10">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-bold text-ink">Top posts</h2>
          <p className="text-xs text-ink-3 mt-0.5">
            Your best-performing content — this is what to do more of.
            {medianReach > 0 && (
              <> Median reach for this cohort: <span className="font-semibold text-ink-2 tabular-nums">{formatNumber(medianReach)}</span>.</>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Format filter -- reels and feed posts benchmark differently */}
          <div className="inline-flex bg-bg-2 rounded-lg p-0.5 text-[12px]">
            <SortTab label={`All (${posts.length})`} active={filter === 'all'} onClick={() => setFilter('all')} />
            {reelCount > 0 && <SortTab label={`Reels (${reelCount})`} active={filter === 'reels'} onClick={() => setFilter('reels')} />}
            {feedCount > 0 && <SortTab label={`Feed (${feedCount})`} active={filter === 'feed'} onClick={() => setFilter('feed')} />}
          </div>
          {/* Sort order */}
          <div className="inline-flex bg-bg-2 rounded-lg p-0.5 text-[12px]">
            <SortTab label="Reach" active={sort === 'reach'} onClick={() => setSort('reach')} />
            <SortTab label="Engagement" active={sort === 'engagement'} onClick={() => setSort('engagement')} />
            <SortTab label="Saves" active={sort === 'saves'} onClick={() => setSort('saves')} />
            <SortTab label="Recent" active={sort === 'recent'} onClick={() => setSort('recent')} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {sortedPosts.map(post => (
          <PostCard key={post.id} post={post} medianReach={medianReach} />
        ))}
      </div>
    </section>
  )
}

function SortTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="font-medium rounded-md transition-colors px-3 py-1.5"
      style={{
        color: active ? 'var(--db-black)' : 'var(--db-ink-3)',
        background: active ? 'white' : 'transparent',
        boxShadow: active ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
      }}
    >
      {label}
    </button>
  )
}

function PostCard({ post, medianReach }: { post: SocialPost; medianReach: number }) {
  const platformColor = PLATFORM_COLORS[post.platform] ?? '#888'
  const engRate = engagementRate(post)

  // "vs median" chip: how this post's reach compares to the cohort median.
  // Only render when we actually have a median (>= 2 posts) and the post
  // itself has reach -- a "0.0x" chip would be noise.
  const vsMedian = medianReach > 0 && post.reach && post.reach > 0
    ? post.reach / medianReach
    : null

  const chipColor = !vsMedian ? null
    : vsMedian >= 1.5 ? { bg: 'rgba(74, 189, 152, 0.15)', fg: 'var(--db-up, #2d7a5f)' }
    : vsMedian >= 0.8 ? { bg: 'var(--db-bg-3, #f1f1f1)', fg: 'var(--db-ink-2, #666)' }
    : { bg: 'rgba(229, 115, 115, 0.12)', fg: 'var(--db-down, #c14343)' }

  return (
    <a
      href={post.permalink ?? '#'}
      target="_blank"
      rel="noopener noreferrer"
      className="group bg-white rounded-xl border border-ink-6 overflow-hidden hover:shadow-md transition-shadow flex flex-col"
    >
      {/* Thumbnail */}
      <div className="relative aspect-square bg-bg-2 overflow-hidden">
        {post.thumbnail_url ? (
          <Image
            src={post.thumbnail_url}
            alt={truncateCaption(post.caption, 40) || 'Post thumbnail'}
            fill
            unoptimized
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="h-full flex items-center justify-center">
            <ContentTypeIcon post={post} className="w-8 h-8 text-ink-4" />
          </div>
        )}
        {/* Content type badge */}
        <div className="absolute top-2 left-2 bg-black/70 text-white text-[10px] font-semibold px-2 py-1 rounded-md flex items-center gap-1">
          <ContentTypeIcon post={post} className="w-3 h-3" />
          {contentTypeLabel(post)}
        </div>
        {/* Platform dot */}
        <div
          className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
          style={{ background: platformColor }}
          title={PLATFORM_LABELS[post.platform] ?? post.platform}
        >
          {post.platform.charAt(0).toUpperCase()}
        </div>
        {/* vs-median chip, bottom-left so it's visible against thumbnail */}
        {vsMedian !== null && chipColor && (
          <div
            className="absolute bottom-2 left-2 text-[10px] font-bold px-2 py-1 rounded-md tabular-nums"
            style={{ background: chipColor.bg, color: chipColor.fg, backdropFilter: 'blur(4px)' }}
            title={`Reach is ${vsMedian.toFixed(1)}x the cohort median (${formatNumber(medianReach)})`}
          >
            {vsMedian >= 1 ? `${vsMedian.toFixed(1)}× median` : `${Math.round(vsMedian * 100)}% of median`}
          </div>
        )}
        {/* Open-in-new hint */}
        <div className="absolute bottom-2 right-2 bg-white/90 rounded-md p-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <ExternalLink className="w-3 h-3 text-ink-2" />
        </div>
      </div>

      {/* Caption + meta */}
      <div className="p-3 flex flex-col gap-2 flex-1">
        <div className="flex items-center justify-between text-[11px] text-ink-4">
          <span className="flex items-center gap-1.5">
            <Clock className="w-3 h-3" />
            {daysAgo(post.posted_at)}
          </span>
          {engRate !== null && (
            <span
              className="font-semibold tabular-nums text-ink-2"
              title="Engagement rate = (likes + comments + saves + shares) / reach"
            >
              {engRate.toFixed(1)}% eng
            </span>
          )}
        </div>
        <p className="text-[13px] text-ink-2 line-clamp-3 leading-snug">
          {truncateCaption(post.caption) || <span className="italic text-ink-4">No caption</span>}
        </p>

        {/* Stats row */}
        <div className="flex items-center gap-3 mt-auto pt-2 border-t border-ink-6 text-[12px]">
          <Stat icon={TrendingUp} value={post.reach} />
          <Stat icon={Heart} value={post.likes} />
          <Stat icon={MessageCircle} value={post.comments} />
          {post.saves != null && post.saves > 0 && <Stat icon={Bookmark} value={post.saves} />}
          {post.shares != null && post.shares > 0 && <Stat icon={Repeat} value={post.shares} />}
        </div>
      </div>
    </a>
  )
}

function Stat({ icon: Icon, value }: { icon: typeof Heart; value: number | null }) {
  if (value == null) return null
  return (
    <span className="inline-flex items-center gap-1 text-ink-3 tabular-nums">
      <Icon className="w-3 h-3" />
      <span className="font-medium text-ink-2">{formatNumber(value)}</span>
    </span>
  )
}

// ---------------------------------------------------------------------------
// Content Type Breakdown
// ---------------------------------------------------------------------------

function ContentTypeBreakdown({ posts }: { posts: SocialPost[] }) {
  const breakdown = useMemo(() => {
    const buckets = new Map<string, { count: number; totalReach: number; totalEng: number; totalSaves: number }>()
    for (const p of posts) {
      const label = contentTypeLabel(p)
      const b = buckets.get(label) ?? { count: 0, totalReach: 0, totalEng: 0, totalSaves: 0 }
      b.count += 1
      b.totalReach += p.reach ?? 0
      b.totalEng += (p.likes ?? 0) + (p.comments ?? 0) + (p.saves ?? 0) + (p.shares ?? 0)
      b.totalSaves += p.saves ?? 0
      buckets.set(label, b)
    }
    return Array.from(buckets.entries())
      .map(([type, b]) => ({
        type,
        count: b.count,
        avgReach: b.count > 0 ? Math.round(b.totalReach / b.count) : 0,
        avgEng: b.count > 0 ? Math.round(b.totalEng / b.count) : 0,
        avgSaves: b.count > 0 ? Math.round(b.totalSaves / b.count) : 0,
      }))
      .sort((a, b) => b.avgReach - a.avgReach)
  }, [posts])

  if (breakdown.length === 0) return null

  const best = breakdown[0]
  const worst = breakdown[breakdown.length - 1]
  // Action-oriented phrasing: tell the marketer what to DO, not just what's
  // happening. "Post more reels" is directly usable; "Your reels average
  // 10x reach" makes the reader translate it themselves.
  const insight = breakdown.length > 1 && worst.avgReach > 0
    ? `Post more ${best.type.toLowerCase()}s \u2014 they reach ${Math.round((best.avgReach / worst.avgReach) * 10) / 10}\u00d7 more people than your ${worst.type.toLowerCase()}s.`
    : `You've posted ${best.count} ${best.type.toLowerCase()}${best.count === 1 ? '' : 's'} recently.`

  return (
    <section className="mb-10">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-ink">What kind of content works</h2>
        <p className="text-xs text-ink-3 mt-0.5">{insight}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {breakdown.map(b => (
          <div key={b.type} className="bg-white rounded-xl border border-ink-6 p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-semibold text-ink-3 uppercase tracking-wide">{b.type}{b.count !== 1 ? 's' : ''}</span>
              <span className="text-[11px] text-ink-4 tabular-nums">{b.count} post{b.count === 1 ? '' : 's'}</span>
            </div>
            <div className="flex items-baseline justify-between mb-2">
              <span className="font-[family-name:var(--font-display)] text-2xl text-ink tabular-nums">{formatNumber(b.avgReach)}</span>
              <span className="text-[11px] text-ink-4">avg reach</span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-ink-4">
              <span>{formatNumber(b.avgEng)} avg engagement</span>
              {b.avgSaves > 0 && <span>{formatNumber(b.avgSaves)} avg saves</span>}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Posting Cadence (last 4 weeks)
// ---------------------------------------------------------------------------

function PostingCadence({ posts }: { posts: SocialPost[] }) {
  const grid = useMemo(() => {
    // 28 days ending today, laid out in 4 weeks of 7 columns
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    const cells: Array<{ date: Date; count: number; label: string }> = []
    for (let i = 27; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i)
      const dateStr = d.toISOString().split('T')[0]
      const count = posts.filter(p => p.posted_at.startsWith(dateStr)).length
      cells.push({ date: d, count, label: dateStr })
    }
    return cells
  }, [posts])

  const totalRecent = grid.reduce((a, c) => a + c.count, 0)
  const daysActive = grid.filter(c => c.count > 0).length

  return (
    <section className="mb-10">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-ink">Posting cadence</h2>
        <p className="text-xs text-ink-3 mt-0.5">
          {daysActive < 8
            ? `Post more often \u2014 you were only active on ${daysActive} of the last 28 days. Consistent posting (3\u20135 times per week) trains the algorithm to favor your account.`
            : daysActive < 14
            ? `You posted on ${daysActive} of 28 days. Getting to 12\u201315 active days per month tends to unlock the next tier of organic reach.`
            : `Great cadence \u2014 you posted on ${daysActive} of 28 days. Keep it steady.`}
        </p>
      </div>

      <div className="bg-white rounded-xl border border-ink-6 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="w-4 h-4 text-ink-4" />
          <span className="text-xs font-medium text-ink-2">Last 4 weeks</span>
        </div>

        {/* Grid: 4 rows × 7 days */}
        <div className="grid grid-cols-7 gap-1.5">
          {/* Day headers */}
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
            <div key={i} className="text-[10px] text-ink-4 text-center font-medium">{d}</div>
          ))}
          {/* Cells */}
          {grid.map((cell, i) => {
            const intensity = cell.count === 0 ? 0
              : cell.count === 1 ? 0.35
              : cell.count === 2 ? 0.65
              : 0.95
            return (
              <div
                key={i}
                className="aspect-square rounded-md relative group"
                style={{
                  background: intensity === 0 ? 'var(--db-bg-3)' : `rgba(74, 189, 152, ${intensity})`,
                  minHeight: '24px',
                }}
                title={`${cell.label} · ${cell.count} post${cell.count === 1 ? '' : 's'}`}
              >
                {cell.count > 0 && (
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold" style={{ color: intensity > 0.5 ? 'white' : 'var(--db-black)' }}>
                    {cell.count}
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 mt-3 text-[10px] text-ink-4">
          <span>Less</span>
          {[0, 0.35, 0.65, 0.95].map((a, i) => (
            <span key={i} className="w-3 h-3 rounded-sm" style={{ background: a === 0 ? 'var(--db-bg-3)' : `rgba(74, 189, 152, ${a})` }} />
          ))}
          <span>More</span>
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Best Time To Post (heatmap by day-of-week × rough hour band)
// ---------------------------------------------------------------------------

function BestTimeToPost({ posts }: { posts: SocialPost[] }) {
  const matrix = useMemo(() => {
    // Rows = day of week (Mon-Sun), Cols = 4 time bands (morning/midday/afternoon/evening)
    const bands = [
      { key: 'morning', label: 'Morning', range: [6, 11] },
      { key: 'midday', label: 'Midday', range: [11, 14] },
      { key: 'afternoon', label: 'Afternoon', range: [14, 18] },
      { key: 'evening', label: 'Evening', range: [18, 23] },
    ]
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

    // Accumulator: dow × band -> { count, totalReach, totalEng }
    const cells: Array<Array<{ count: number; totalReach: number; totalEng: number }>> = Array.from(
      { length: 7 },
      () => Array.from({ length: bands.length }, () => ({ count: 0, totalReach: 0, totalEng: 0 })),
    )

    for (const p of posts) {
      const d = new Date(p.posted_at)
      // Convert JS getDay() (0=Sun) to our Mon-Sun (0=Mon)
      const dow = (d.getDay() + 6) % 7
      const hour = d.getHours()
      const bandIdx = bands.findIndex(b => hour >= b.range[0] && hour < b.range[1])
      if (bandIdx < 0) continue

      const cell = cells[dow][bandIdx]
      cell.count += 1
      cell.totalReach += p.reach ?? 0
      cell.totalEng += (p.likes ?? 0) + (p.comments ?? 0) + (p.saves ?? 0)
    }

    // Find the best cell (highest avg reach among cells with >= 1 post)
    let bestKey = ''
    let bestAvg = 0
    for (let i = 0; i < 7; i++) {
      for (let j = 0; j < bands.length; j++) {
        const c = cells[i][j]
        if (c.count > 0) {
          const avg = c.totalReach / c.count
          if (avg > bestAvg) {
            bestAvg = avg
            bestKey = `${days[i]} · ${bands[j].label}`
          }
        }
      }
    }

    return { cells, bands, days, bestKey, bestAvg }
  }, [posts])

  if (posts.length < 3) return null

  // Color intensity based on max avg-reach across all cells
  let maxAvg = 0
  for (let i = 0; i < 7; i++) {
    for (let j = 0; j < matrix.bands.length; j++) {
      const c = matrix.cells[i][j]
      if (c.count > 0) {
        const avg = c.totalReach / c.count
        if (avg > maxAvg) maxAvg = avg
      }
    }
  }

  return (
    <section className="mb-10">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-ink">When to post</h2>
        <p className="text-xs text-ink-3 mt-0.5">
          {matrix.bestAvg > 0
            ? `Schedule your next post for ${matrix.bestKey} \u2014 posts in this window averaged ${formatNumber(Math.round(matrix.bestAvg))} reach. Sample is still small; pattern firms up as you post more.`
            : `Post more consistently to see time-of-day patterns emerge here.`}
        </p>
      </div>

      <div className="bg-white rounded-xl border border-ink-6 p-4 overflow-x-auto">
        <div className="min-w-[400px]">
          <div className="grid grid-cols-[60px_repeat(4,1fr)] gap-1.5">
            <div />
            {matrix.bands.map(b => (
              <div key={b.key} className="text-[10px] text-ink-4 text-center font-medium pb-1">{b.label}</div>
            ))}
            {matrix.days.map((day, dowIdx) => (
              <Fragment key={day}>
                <div className="text-[10px] text-ink-4 flex items-center font-medium">{day}</div>
                {matrix.bands.map((band, bandIdx) => {
                  const c = matrix.cells[dowIdx][bandIdx]
                  const avg = c.count > 0 ? c.totalReach / c.count : 0
                  const intensity = maxAvg > 0 ? avg / maxAvg : 0
                  return (
                    <div
                      key={`${day}-${band.key}`}
                      className="aspect-[3/2] rounded-md flex flex-col items-center justify-center text-[10px] relative"
                      style={{
                        background: c.count === 0 ? 'var(--db-bg-3)' : `rgba(74, 189, 152, ${Math.max(0.2, intensity)})`,
                      }}
                      title={c.count === 0 ? 'No posts' : `${c.count} post${c.count === 1 ? '' : 's'} · avg reach ${formatNumber(Math.round(avg))}`}
                    >
                      {c.count > 0 ? (
                        <>
                          <span className="font-semibold" style={{ color: intensity > 0.5 ? 'white' : 'var(--db-black)' }}>
                            {formatNumber(Math.round(avg))}
                          </span>
                          <span className="text-[9px]" style={{ color: intensity > 0.5 ? 'rgba(255,255,255,0.8)' : 'var(--db-ink-3)' }}>
                            {c.count} post{c.count === 1 ? '' : 's'}
                          </span>
                        </>
                      ) : null}
                    </div>
                  )
                })}
              </Fragment>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Caption / hashtag analysis
// ---------------------------------------------------------------------------

/**
 * Extracts lightweight patterns from captions and correlates them with reach
 * so marketers can see whether captions that ask questions, use CTAs, or run
 * certain hashtags actually move the needle.
 *
 * This is heuristic, not ML -- we look at:
 *   - Caption length buckets (short / medium / long)
 *   - Has a question mark ("ask something")
 *   - Has a CTA verb ("try/order/visit/tag/save/tap")
 *   - Top 5 hashtags by reach
 *
 * Everything is computed locally from posts we already have; no new API.
 */
function CaptionAnalysis({ posts }: { posts: SocialPost[] }) {
  const analysis = useMemo(() => {
    const postsWithReach = posts.filter(p => (p.reach ?? 0) > 0)
    if (postsWithReach.length < 3) return null

    const mean = (arr: number[]) =>
      arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length

    const lengthBucket = (p: SocialPost): 'short' | 'medium' | 'long' | 'none' => {
      const len = (p.caption ?? '').trim().length
      if (len === 0) return 'none'
      if (len < 80) return 'short'
      if (len < 220) return 'medium'
      return 'long'
    }

    const hasQuestion = (p: SocialPost) => /\?/.test(p.caption ?? '')

    // Simple CTA detector -- english-only first pass; good enough for US
    // restaurants. Imperfect but high-signal: a caption ending in "tap
    // save to try this" is obviously a CTA, and gets flagged.
    const CTA_WORDS = /\b(try|order|visit|tag|save|tap|book|reserve|dm|comment|share|follow|click|link in bio|swipe)\b/i
    const hasCTA = (p: SocialPost) => CTA_WORDS.test(p.caption ?? '')

    // Length breakdown
    const lengthBuckets: Record<'short' | 'medium' | 'long' | 'none', SocialPost[]> = {
      short: [], medium: [], long: [], none: [],
    }
    for (const p of postsWithReach) lengthBuckets[lengthBucket(p)].push(p)

    const lengthStats = (Object.keys(lengthBuckets) as Array<keyof typeof lengthBuckets>).map(key => ({
      key,
      count: lengthBuckets[key].length,
      avgReach: Math.round(mean(lengthBuckets[key].map(p => p.reach ?? 0))),
    })).filter(s => s.count > 0)

    // Best length band by avg reach, with at least 2 posts (avoid single-post outliers)
    const bestLength = [...lengthStats]
      .filter(s => s.count >= 2)
      .sort((a, b) => b.avgReach - a.avgReach)[0]

    // Question vs no question
    const qPosts = postsWithReach.filter(hasQuestion)
    const nqPosts = postsWithReach.filter(p => !hasQuestion(p))
    const questionInsight = qPosts.length >= 2 && nqPosts.length >= 2
      ? {
          qAvg: Math.round(mean(qPosts.map(p => p.reach ?? 0))),
          nqAvg: Math.round(mean(nqPosts.map(p => p.reach ?? 0))),
          qCount: qPosts.length,
          nqCount: nqPosts.length,
        }
      : null

    // CTA vs no CTA
    const ctaPosts = postsWithReach.filter(hasCTA)
    const nctaPosts = postsWithReach.filter(p => !hasCTA(p))
    const ctaInsight = ctaPosts.length >= 2 && nctaPosts.length >= 2
      ? {
          ctaAvg: Math.round(mean(ctaPosts.map(p => p.reach ?? 0))),
          nctaAvg: Math.round(mean(nctaPosts.map(p => p.reach ?? 0))),
          ctaCount: ctaPosts.length,
          nctaCount: nctaPosts.length,
        }
      : null

    // Top hashtags by avg reach. Require >= 2 posts to avoid ranking
    // one-off winners.
    const hashtagMap = new Map<string, { count: number; totalReach: number }>()
    for (const p of postsWithReach) {
      const tags = (p.caption ?? '').match(/#[\w\u0080-\uFFFF]+/g) ?? []
      const uniqueInPost = new Set(tags.map(t => t.toLowerCase()))
      for (const tag of uniqueInPost) {
        const entry = hashtagMap.get(tag) ?? { count: 0, totalReach: 0 }
        entry.count += 1
        entry.totalReach += p.reach ?? 0
        hashtagMap.set(tag, entry)
      }
    }
    const topHashtags = Array.from(hashtagMap.entries())
      .filter(([, v]) => v.count >= 2)
      .map(([tag, v]) => ({ tag, count: v.count, avgReach: Math.round(v.totalReach / v.count) }))
      .sort((a, b) => b.avgReach - a.avgReach)
      .slice(0, 5)

    return {
      totalAnalyzed: postsWithReach.length,
      bestLength,
      questionInsight,
      ctaInsight,
      topHashtags,
    }
  }, [posts])

  if (!analysis) return null

  const lengthLabel = (key: string) =>
    key === 'short' ? 'Short (<80 chars)'
      : key === 'medium' ? 'Medium (80-220)'
      : key === 'long' ? 'Long (220+)'
      : 'No caption'

  return (
    <section className="mb-10">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-ink">What makes your captions work</h2>
        <p className="text-xs text-ink-3 mt-0.5">
          Patterns across {analysis.totalAnalyzed} posts with reach data. Use these as directional, not absolute.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Length */}
        {analysis.bestLength && (
          <div className="bg-white rounded-xl border border-ink-6 p-4">
            <div className="flex items-center gap-2 mb-2">
              <MessageSquare className="w-4 h-4 text-ink-4" />
              <span className="text-[11px] font-semibold text-ink-3 uppercase tracking-wide">Caption length</span>
            </div>
            <p className="text-[13px] text-ink-2 leading-snug mb-3">
              <span className="font-semibold">{lengthLabel(analysis.bestLength.key)}</span> captions reach the most people
              &mdash; averaging <span className="font-semibold tabular-nums">{formatNumber(analysis.bestLength.avgReach)}</span> reach
              across {analysis.bestLength.count} posts.
            </p>
            <div className="text-[11px] text-ink-4">
              Try leaning into this length for your next few posts.
            </div>
          </div>
        )}

        {/* Questions */}
        {analysis.questionInsight && (
          <div className="bg-white rounded-xl border border-ink-6 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-ink-4" />
              <span className="text-[11px] font-semibold text-ink-3 uppercase tracking-wide">Asking a question</span>
            </div>
            <p className="text-[13px] text-ink-2 leading-snug mb-3">
              {analysis.questionInsight.qAvg > analysis.questionInsight.nqAvg ? (
                <>
                  Posts with a question reach <span className="font-semibold">{Math.round((analysis.questionInsight.qAvg / analysis.questionInsight.nqAvg) * 10) / 10}&times;</span> more
                  &mdash; <span className="font-semibold tabular-nums">{formatNumber(analysis.questionInsight.qAvg)}</span> vs <span className="tabular-nums">{formatNumber(analysis.questionInsight.nqAvg)}</span> for plain captions.
                </>
              ) : (
                <>
                  Questions aren&apos;t helping here &mdash; plain captions average <span className="font-semibold tabular-nums">{formatNumber(analysis.questionInsight.nqAvg)}</span> vs <span className="tabular-nums">{formatNumber(analysis.questionInsight.qAvg)}</span> for question posts.
                </>
              )}
            </p>
            <div className="text-[11px] text-ink-4">
              {analysis.questionInsight.qCount} with questions, {analysis.questionInsight.nqCount} without.
            </div>
          </div>
        )}

        {/* CTA */}
        {analysis.ctaInsight && (
          <div className="bg-white rounded-xl border border-ink-6 p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-ink-4" />
              <span className="text-[11px] font-semibold text-ink-3 uppercase tracking-wide">Call to action</span>
            </div>
            <p className="text-[13px] text-ink-2 leading-snug mb-3">
              {analysis.ctaInsight.ctaAvg > analysis.ctaInsight.nctaAvg ? (
                <>
                  Captions with a CTA (try, order, visit, save, etc) reach <span className="font-semibold">{Math.round((analysis.ctaInsight.ctaAvg / analysis.ctaInsight.nctaAvg) * 10) / 10}&times;</span> more
                  &mdash; <span className="font-semibold tabular-nums">{formatNumber(analysis.ctaInsight.ctaAvg)}</span> vs <span className="tabular-nums">{formatNumber(analysis.ctaInsight.nctaAvg)}</span>.
                </>
              ) : (
                <>
                  CTA phrasing isn&apos;t moving reach for you yet &mdash; non-CTA posts average <span className="font-semibold tabular-nums">{formatNumber(analysis.ctaInsight.nctaAvg)}</span>.
                </>
              )}
            </p>
            <div className="text-[11px] text-ink-4">
              {analysis.ctaInsight.ctaCount} with CTA, {analysis.ctaInsight.nctaCount} without.
            </div>
          </div>
        )}

        {/* Top hashtags */}
        {analysis.topHashtags.length > 0 && (
          <div className="bg-white rounded-xl border border-ink-6 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Hash className="w-4 h-4 text-ink-4" />
              <span className="text-[11px] font-semibold text-ink-3 uppercase tracking-wide">Top hashtags</span>
            </div>
            <div className="flex flex-col gap-2">
              {analysis.topHashtags.map(h => (
                <div key={h.tag} className="flex items-center justify-between text-[12px]">
                  <span className="font-medium text-ink-2 truncate">{h.tag}</span>
                  <span className="text-ink-4 tabular-nums flex-shrink-0 ml-3">
                    {formatNumber(h.avgReach)} avg · {h.count} use{h.count === 1 ? '' : 's'}
                  </span>
                </div>
              ))}
            </div>
            <div className="text-[11px] text-ink-4 mt-3">
              Tags you&apos;ve used at least twice, ranked by average reach.
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Combined export
// ---------------------------------------------------------------------------

interface SocialPerformanceProps {
  posts: SocialPost[]
}

export default function SocialPerformance({ posts }: SocialPerformanceProps) {
  if (posts.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-ink-6 p-8 text-center mb-10">
        <p className="text-sm font-medium text-ink-2">No posts synced yet</p>
        <p className="text-xs text-ink-4 mt-1">Your content performance insights will appear here once the daily sync has run with your connected accounts.</p>
      </div>
    )
  }

  return (
    <>
      <WeekOverWeek posts={posts} />
      <TopPosts posts={posts} />
      <ContentTypeBreakdown posts={posts} />
      <CaptionAnalysis posts={posts} />
      <PostingCadence posts={posts} />
      <BestTimeToPost posts={posts} />
    </>
  )
}
