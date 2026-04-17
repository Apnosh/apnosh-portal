'use client'

import { Fragment, useMemo, useState } from 'react'
import Image from 'next/image'
import {
  Play, Image as ImageIcon, Layers, Heart, MessageCircle, Bookmark, Repeat,
  ExternalLink, TrendingUp, Clock, Calendar,
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
// Top Posts section
// ---------------------------------------------------------------------------

type PostSort = 'reach' | 'engagement' | 'recent'

function TopPosts({ posts }: { posts: SocialPost[] }) {
  const [sort, setSort] = useState<PostSort>('reach')

  const sortedPosts = useMemo(() => {
    const engagementScore = (p: SocialPost) =>
      (p.likes ?? 0) + (p.comments ?? 0) + (p.saves ?? 0) + (p.shares ?? 0)

    const sorted = [...posts].sort((a, b) => {
      if (sort === 'reach') return (b.reach ?? 0) - (a.reach ?? 0)
      if (sort === 'engagement') return engagementScore(b) - engagementScore(a)
      return new Date(b.posted_at).getTime() - new Date(a.posted_at).getTime()
    })
    return sorted.slice(0, 5)
  }, [posts, sort])

  if (posts.length === 0) {
    return null
  }

  return (
    <section className="mb-10">
      <div className="flex items-end justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-ink">Top posts</h2>
          <p className="text-xs text-ink-3 mt-0.5">Your best-performing content — this is what to do more of.</p>
        </div>
        <div className="inline-flex bg-bg-2 rounded-lg p-0.5 text-[12px]">
          <SortTab label="By reach" active={sort === 'reach'} onClick={() => setSort('reach')} />
          <SortTab label="By engagement" active={sort === 'engagement'} onClick={() => setSort('engagement')} />
          <SortTab label="Most recent" active={sort === 'recent'} onClick={() => setSort('recent')} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {sortedPosts.map(post => (
          <PostCard key={post.id} post={post} />
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

function PostCard({ post }: { post: SocialPost }) {
  const platformColor = PLATFORM_COLORS[post.platform] ?? '#888'

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
        {/* Open-in-new hint */}
        <div className="absolute bottom-2 right-2 bg-white/90 rounded-md p-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <ExternalLink className="w-3 h-3 text-ink-2" />
        </div>
      </div>

      {/* Caption + meta */}
      <div className="p-3 flex flex-col gap-2 flex-1">
        <div className="text-[11px] text-ink-4 flex items-center gap-1.5">
          <Clock className="w-3 h-3" />
          {daysAgo(post.posted_at)}
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
  const insight = breakdown.length > 1 && worst.avgReach > 0
    ? `Your ${best.type.toLowerCase()}s average ${Math.round((best.avgReach / worst.avgReach) * 10) / 10}x the reach of your ${worst.type.toLowerCase()}s.`
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
          You posted {totalRecent} {totalRecent === 1 ? 'time' : 'times'} in the last 4 weeks,
          active on {daysActive} of 28 days.
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
            ? `Your best-performing window: ${matrix.bestKey} (avg reach ${formatNumber(Math.round(matrix.bestAvg))}).`
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
      <TopPosts posts={posts} />
      <ContentTypeBreakdown posts={posts} />
      <PostingCadence posts={posts} />
      <BestTimeToPost posts={posts} />
    </>
  )
}
