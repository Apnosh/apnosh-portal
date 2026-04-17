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
  ArrowUpRight, ArrowDownRight, Users, TrendingUp, Zap, ExternalLink,
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

    return {
      postCount: recentPosts.length,
      avgReach,
      currentFollowers,
      netNewFollowers,
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
          {stats.netNewFollowers !== 0 ? (
            <div
              className="inline-flex items-center gap-1 text-[12px] font-medium tabular-nums"
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
            <div className="text-[12px] text-ink-4">Steady this month</div>
          )}
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
  const action = useMemo(() => {
    const postsWithReach = posts.filter(p => (p.reach ?? 0) > 0)
    if (postsWithReach.length < 3) return null

    // Compute avg reach by format -- reels vs carousels vs photos
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
      .map(([type, v]) => ({ type, avg: v.total / v.count, count: v.count }))
      .sort((a, b) => b.avg - a.avg)

    if (ranked.length < 2) return null
    const best = ranked[0]
    const worst = ranked[ranked.length - 1]
    const multiple = Math.round((best.avg / Math.max(worst.avg, 1)) * 10) / 10
    if (multiple < 1.5) return null

    return `Post more ${best.type}s. They reach ${multiple}x more people than your ${worst.type}s.`
  }, [posts])

  if (!action) return null

  return (
    <section className="mb-8">
      <div className="bg-white rounded-xl border-2 p-5 flex items-start gap-3" style={{ borderColor: '#4abd98' }}>
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
          <p className="text-[15px] text-ink font-semibold leading-snug">{action}</p>
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
      <TopThreePosts posts={posts} />
    </>
  )
}
