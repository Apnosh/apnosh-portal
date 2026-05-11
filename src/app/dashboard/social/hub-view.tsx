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
  Sparkles, Plus, Calendar as CalendarIcon, TrendingUp, ArrowRight,
  Camera, Globe, Image as ImageIcon, Video, Layers, Send, Zap, Music,
} from 'lucide-react'
import type { SocialHubData, SocialPostCard, TopPerformer } from '@/lib/dashboard/get-social-hub'

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

export default function SocialHubView({ data }: { data: SocialHubData }) {
  return (
    <div className="max-w-7xl mx-auto py-8 px-4 lg:px-6">
      {/* Hero */}
      <Hero data={data} />

      {/* Recent + Coming up */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 lg:gap-7 mt-7">
        <RecentFeed posts={data.recent} />
        <ComingUp posts={data.upcoming} />
      </div>

      {/* What's working */}
      {data.topPerformer && (
        <WhatsWorking perf={data.topPerformer} />
      )}

      {/* Push bar */}
      <PushBar />
    </div>
  )
}

/* ─────────────────────────────── Hero ─────────────────────────────── */

function Hero({ data }: { data: SocialHubData }) {
  return (
    <header>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-amber-50 text-amber-700 ring-1 ring-amber-100">
            <Sparkles className="w-4.5 h-4.5" />
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-3 leading-none">
              Social Media
            </p>
            <p className="text-[11px] text-ink-4 mt-1 leading-none">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </div>
        </div>
        <Link
          href="/dashboard/social/performance"
          className="hidden sm:inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-2 hover:text-ink bg-white border border-ink-6 hover:border-ink-4 hover:shadow-sm rounded-full px-3 py-1.5 transition-all"
        >
          <TrendingUp className="w-3 h-3 text-emerald-600" />
          Performance
        </Link>
      </div>
      <h1 className="text-[32px] sm:text-[34px] leading-[1.05] font-bold text-ink tracking-tight">
        {data.reach30d
          ? <>Reaching <span className="text-emerald-700">{formatCompact(data.reach30d)}</span> people this month</>
          : 'Your social feed'}
      </h1>
      <p className="text-[14px] text-ink-2 mt-2 leading-relaxed max-w-2xl">
        {data.narrative}
      </p>

      <div
        className="mt-5 grid grid-cols-3 max-w-xl rounded-2xl bg-white border overflow-hidden divide-x"
        style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
      >
        <PulseTile label="Live" sub="last 30 days" value={data.counts.live} href="/dashboard/social/performance" />
        <PulseTile label="Queued" sub="upcoming" value={data.counts.queued} href="/dashboard/calendar" />
        <PulseTile
          label="Needs you"
          sub="in review"
          value={data.counts.needsYou}
          href="/dashboard/social/action-needed"
          tone={data.counts.needsYou > 0 ? 'rose' : 'neutral'}
        />
      </div>
    </header>
  )
}

function PulseTile({
  label, sub, value, href, tone = 'neutral',
}: {
  label: string; sub: string; value: number; href: string; tone?: 'neutral' | 'rose'
}) {
  return (
    <Link
      href={href}
      className="group block px-4 py-3 hover:bg-bg-2/40 transition-colors"
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-ink-4 leading-none mb-1.5 group-hover:text-ink-3 transition-colors">
        {label}
      </p>
      <p className={`text-[22px] font-bold tabular-nums leading-none tracking-tight ${
        tone === 'rose' && value > 0 ? 'text-rose-700' : 'text-ink'
      }`}>
        {value}
      </p>
      <p className="text-[10px] text-ink-4 mt-1 leading-none">{sub}</p>
    </Link>
  )
}

/* ─────────────────────────────── Recent feed ─────────────────────────────── */

function RecentFeed({ posts }: { posts: SocialPostCard[] }) {
  return (
    <section>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-[16px] font-bold text-ink tracking-tight">
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
        <h2 className="text-[16px] font-bold text-ink tracking-tight">
          Coming up
        </h2>
        <Link
          href="/dashboard/calendar"
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

        <Link
          href={`/dashboard/social/boost?postId=${encodeURIComponent(perf.postId)}`}
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-full px-4 py-2 transition-colors flex-shrink-0"
        >
          <Zap className="w-3.5 h-3.5" />
          Boost this post
        </Link>
      </div>
    </section>
  )
}

/* ─────────────────────────────── Push bar ─────────────────────────────── */

function PushBar() {
  const actions = [
    {
      label: 'Request a post',
      sub: 'Tell us what to share',
      href: '/dashboard/social/request',
      Icon: Plus,
      tone: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    },
    {
      label: 'Open calendar',
      sub: 'See everything dated',
      href: '/dashboard/calendar',
      Icon: CalendarIcon,
      tone: 'bg-white hover:bg-bg-2 text-ink border border-ink-6',
    },
    {
      label: 'Boost a post',
      sub: 'Push paid reach',
      href: '/dashboard/social/boost',
      Icon: Zap,
      tone: 'bg-white hover:bg-bg-2 text-ink border border-ink-6',
    },
  ]
  return (
    <section className="mt-8">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {actions.map(a => {
          const { Icon } = a
          return (
            <Link
              key={a.href}
              href={a.href}
              className={`flex items-center gap-3 rounded-2xl px-4 py-3.5 transition-colors ${a.tone}`}
            >
              <span className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                a.tone.includes('emerald-600') ? 'bg-white/15' : 'bg-bg-2'
              }`}>
                <Icon className="w-4 h-4" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold leading-tight">{a.label}</p>
                <p className={`text-[11px] leading-tight mt-0.5 ${
                  a.tone.includes('emerald-600') ? 'text-white/80' : 'text-ink-3'
                }`}>
                  {a.sub}
                </p>
              </div>
              <ArrowRight className="w-4 h-4 opacity-60 flex-shrink-0" />
            </Link>
          )
        })}
      </div>
    </section>
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
