'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Star, Flag, MessageSquare, ExternalLink, ChevronDown,
  TrendingUp, AlertTriangle, Filter,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeRefresh } from '@/lib/realtime'
import { useClient } from '@/lib/client-context'
import { getReviewsPerformance, type ReviewsPerformance } from '@/lib/dashboard/get-channel-performance'
import { getPlatformReviewSnapshots, type PlatformSnapshot } from '@/lib/dashboard/get-platform-reviews'
import { getClientLocations } from '@/lib/dashboard/get-client-locations'
import type { ClientLocation } from '@/lib/dashboard/location-helpers'
import ChannelHero from '@/components/dashboard/channel-hero'
import type { Review, ReviewSource } from '@/types/database'
import ConnectEmptyState from '../connect-empty-state'

const SOURCE_LABEL: Record<ReviewSource, string> = {
  google: 'Google',
  yelp: 'Yelp',
  facebook: 'Facebook',
  tripadvisor: 'TripAdvisor',
  other: 'Other',
}

const SOURCE_COLOR: Record<ReviewSource, string> = {
  google: 'bg-blue-50 text-blue-700',
  yelp: 'bg-red-50 text-red-700',
  facebook: 'bg-sky-50 text-sky-700',
  tripadvisor: 'bg-green-50 text-green-700',
  other: 'bg-ink-6 text-ink-3',
}

function Stars({ rating, size = 'sm' }: { rating: number; size?: 'sm' | 'md' | 'lg' }) {
  const pixels = size === 'lg' ? 'w-5 h-5' : size === 'md' ? 'w-4 h-4' : 'w-3.5 h-3.5'
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          className={`${pixels} ${
            i <= Math.round(rating) ? 'fill-amber-400 text-amber-400' : 'text-ink-5'
          }`}
        />
      ))}
    </div>
  )
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/* Per-platform summary card. For platforms where we can't fetch
   individual reviews (Yelp, future TripAdvisor), this is the only
   surface where their data appears. Connect CTA shows up when the
   platform isn't linked yet so owners have a clear path forward. */
function PlatformCard({ snapshot }: { snapshot: PlatformSnapshot }) {
  const platformInfo: Record<PlatformSnapshot['platform'], { label: string; color: string; bg: string; connectPath: string }> = {
    google: { label: 'Google', color: 'text-blue-700', bg: 'bg-blue-50', connectPath: '/dashboard/connected-accounts' },
    yelp: { label: 'Yelp', color: 'text-red-700', bg: 'bg-red-50', connectPath: '/dashboard/connected-accounts/yelp' },
    facebook: { label: 'Facebook', color: 'text-sky-700', bg: 'bg-sky-50', connectPath: '/dashboard/connected-accounts' },
    tripadvisor: { label: 'TripAdvisor', color: 'text-green-700', bg: 'bg-green-50', connectPath: '/dashboard/connected-accounts' },
    other: { label: 'Other', color: 'text-ink-3', bg: 'bg-ink-7', connectPath: '/dashboard/connected-accounts' },
  }
  const info = platformInfo[snapshot.platform]

  if (!snapshot.connected) {
    return (
      <Link
        href={info.connectPath}
        className="block rounded-2xl border border-dashed border-ink-5 bg-white p-4 hover:border-ink-4 hover:bg-bg-2/30 transition-colors"
      >
        <div className="flex items-center justify-between">
          <span className={`text-[12px] font-bold uppercase tracking-wider ${info.color} ${info.bg} px-2 py-0.5 rounded`}>
            {info.label}
          </span>
          <span className="text-[12px] text-ink-3 font-medium">Connect →</span>
        </div>
        <p className="text-[12px] text-ink-3 mt-3">
          {snapshot.platform === 'yelp'
            ? 'See your Yelp rating and review count. (Yelp doesn\'t share individual review text via their API, so reviews show here as a summary only.)'
            : `Track ${info.label} performance.`}
        </p>
      </Link>
    )
  }

  return (
    <div className="rounded-2xl border border-ink-6 bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <span className={`text-[12px] font-bold uppercase tracking-wider ${info.color} ${info.bg} px-2 py-0.5 rounded`}>
          {info.label}
        </span>
        {!snapshot.hasIndividualReviews && (
          <span className="text-[10px] text-ink-4">Summary only</span>
        )}
      </div>
      <div className="flex items-baseline gap-3 mb-1.5">
        <div className="text-[28px] font-semibold text-ink tabular-nums leading-none">
          {snapshot.ratingAvg !== null ? snapshot.ratingAvg.toFixed(1) : '—'}
        </div>
        {snapshot.ratingAvg !== null && (
          <Stars rating={snapshot.ratingAvg} size="sm" />
        )}
      </div>
      <div className="text-[11.5px] text-ink-3">
        {snapshot.reviewCount.toLocaleString()} review{snapshot.reviewCount === 1 ? '' : 's'}
        {snapshot.newReviewsThisMonth > 0 && (
          <> · <strong className="text-emerald-700">+{snapshot.newReviewsThisMonth}</strong> this month</>
        )}
      </div>
    </div>
  )
}

/* Inline reply composer. Posts to /api/dashboard/reviews/[id]/reply
   which calls the GBP v4 API and mirrors the response into our DB. */
function ReplyBox({ reviewId, source, v4Enabled, onSent }: {
  reviewId: string
  source: ReviewSource
  v4Enabled: boolean
  onSent: () => void
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (source !== 'google') {
    return <div className="mt-3 text-[11px] text-ink-4 italic">No response yet · reply available on Google soon</div>
  }

  /* Until v4 access lands, replying would just round-trip an "API not
     enabled" error. Better to surface the actual state up-front. */
  if (!v4Enabled) {
    return (
      <div className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-ink-4 italic">
        Reply available once Google approves the v4 API request
      </div>
    )
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-medium text-brand-dark hover:text-brand"
      >
        <MessageSquare className="w-3 h-3" />
        Reply
      </button>
    )
  }

  async function submit() {
    if (!text.trim()) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/dashboard/reviews/${reviewId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ replyText: text.trim() }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error || `Failed (${res.status})`)
      } else {
        onSent()
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-3 space-y-2">
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Write a public reply…"
        rows={3}
        className="w-full text-sm p-2.5 rounded-lg border border-ink-6 bg-white focus:outline-none focus:ring-2 focus:ring-brand/30"
      />
      {error && <p className="text-xs text-rose-700">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          onClick={submit}
          disabled={busy || !text.trim()}
          className="text-xs font-semibold text-white bg-brand hover:bg-brand-dark rounded-full px-3.5 py-1.5 disabled:opacity-50"
        >
          {busy ? 'Posting to Google…' : 'Post reply'}
        </button>
        <button
          onClick={() => { setOpen(false); setText(''); setError(null) }}
          disabled={busy}
          className="text-xs text-ink-3 hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

export default function ReviewsPage() {
  const supabase = createClient()
  const { client, loading: clientLoading } = useClient()

  const [reviews, setReviews] = useState<Review[]>([])
  const [perf, setPerf] = useState<ReviewsPerformance | null>(null)
  const [platforms, setPlatforms] = useState<PlatformSnapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [v4Enabled, setV4Enabled] = useState(false)
  const [connected, setConnected] = useState<boolean | null>(null)

  const [sourceFilter, setSourceFilter] = useState<ReviewSource | 'all'>('all')
  const [ratingFilter, setRatingFilter] = useState<'all' | '5' | '4' | '3' | '2' | '1'>('all')
  const [showFlaggedOnly, setShowFlaggedOnly] = useState(false)
  const [locationFilter, setLocationFilter] = useState<string | 'all'>('all')
  const [locations, setLocations] = useState<ClientLocation[]>([])

  useEffect(() => {
    if (!client?.id) return
    getClientLocations(client.id).then(setLocations).catch(() => { /* keep empty */ })
  }, [client?.id])

  const load = useCallback(async () => {
    if (!client?.id) { setLoading(false); return }

    const [reviewsRes, perfRes, platformRes] = await Promise.all([
      supabase
        .from('reviews')
        .select('*')
        .eq('client_id', client.id)
        .order('posted_at', { ascending: false }),
      getReviewsPerformance(client.id).catch(() => null),
      getPlatformReviewSnapshots(client.id).catch(() => [] as PlatformSnapshot[]),
    ])

    setReviews((reviewsRes.data ?? []) as Review[])
    setPerf(perfRes)
    setPlatforms(platformRes)
    setLoading(false)
  }, [client?.id, supabase])

  useEffect(() => { load() }, [load])
  useRealtimeRefresh(['reviews'], load)

  /* Check whether the legacy v4 Business Profile API is enabled for
     this connection — drives whether the Reply UI is interactive.
     Also tracks whether the client is connected at all so we can
     show a friendly empty state instead of a silent zero-reviews list. */
  useEffect(() => {
    let cancelled = false
    fetch('/api/dashboard/gbp/status')
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (cancelled || !json) return
        setV4Enabled(!!json.v4Enabled)
        setConnected(json.connected !== false)
      })
      .catch(() => { /* leave false */ })
    return () => { cancelled = true }
  }, [])

  const filtered = useMemo(() => {
    return reviews.filter(r => {
      if (sourceFilter !== 'all' && r.source !== sourceFilter) return false
      if (ratingFilter !== 'all' && Math.round(r.rating) !== Number(ratingFilter)) return false
      if (showFlaggedOnly && !r.flagged) return false
      /* Location filter — reviews.location_id is the client_locations
         FK. Reviews without a location_id (older data, or platforms
         without per-location attribution) pass through on the "all"
         selection but get hidden when filtering to a specific location. */
      if (locationFilter !== 'all') {
        const reviewLocId = (r as unknown as { location_id?: string | null }).location_id
        if (reviewLocId !== locationFilter) return false
      }
      return true
    })
  }, [reviews, sourceFilter, ratingFilter, showFlaggedOnly, locationFilter])

  // Summary stats
  const stats = useMemo(() => {
    const total = reviews.length
    const avgRating = total === 0 ? 0 : reviews.reduce((sum, r) => sum + r.rating, 0) / total
    const flaggedCount = reviews.filter(r => r.flagged).length
    const unrespondedCount = reviews.filter(r => !r.responded_at).length

    // Rating distribution
    const distribution = [5, 4, 3, 2, 1].map(star => ({
      star,
      count: reviews.filter(r => Math.round(r.rating) === star).length,
    }))

    // Review volume by month (last 6 months)
    const now = new Date()
    const monthlyVolume = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
      const label = d.toLocaleDateString('en-US', { month: 'short' })
      const count = reviews.filter(r => {
        const rd = new Date(r.posted_at)
        return rd.getFullYear() === d.getFullYear() && rd.getMonth() === d.getMonth()
      }).length
      return { label, count }
    })
    const maxMonthly = Math.max(1, ...monthlyVolume.map(m => m.count))

    return { total, avgRating, flaggedCount, unrespondedCount, distribution, monthlyVolume, maxMonthly }
  }, [reviews])

  if (clientLoading || loading) return <ReviewsSkeleton />

  /* Show the connect CTA when the owner clearly has no GBP linked
     yet — much friendlier than a silent zero-review list. */
  if (connected === false && reviews.length === 0) {
    return <ConnectEmptyState context="your reviews" />
  }

  const hasData = reviews.length > 0

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link href="/dashboard/local-seo" className="text-ink-4 hover:text-ink transition-colors mt-1">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink flex items-center gap-2">
            <Star className="w-6 h-6 text-amber-400 fill-amber-400" />
            Reviews
          </h1>
          <p className="text-ink-3 text-sm mt-0.5">Every review across every platform, with our responses.</p>
        </div>
      </div>

      {/* Heads-up: Google reviews require the legacy v4 Business Profile API,
         which Google deprecated and gates behind a separate allowlist. We've
         submitted the request — until it's approved, no Google reviews can
         flow in. */}
      {!hasData && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 flex items-start gap-3">
          <AlertTriangle className="w-4.5 h-4.5 text-amber-700 flex-shrink-0 mt-0.5" />
          <div className="text-sm leading-relaxed">
            <p className="font-semibold text-amber-900">Google reviews aren&rsquo;t flowing in yet</p>
            <p className="text-amber-900/85 mt-1">
              Reading and replying to Google reviews uses Google&rsquo;s legacy v4
              Business Profile API, which Google gates behind a separate access
              request. We&rsquo;ve submitted ours (case 5-7311000040463) — typical
              turnaround is 7–10 business days. The reply UI is already wired,
              so the moment Google approves it, every existing review will
              show up here automatically.
            </p>
          </div>
        </div>
      )}

      {/* Performance hero — average star, new-review count, response rate */}
      {perf && (
        <ChannelHero title="Reviews performance · last 30 days" summary={perf.summary} metrics={perf.metrics} />
      )}

      {/* Per-platform performance cards. Surfaces Yelp summary even
         though Yelp Fusion free tier doesn't expose review text. */}
      {platforms.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-ink mb-3">By platform</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {platforms.map(p => <PlatformCard key={p.platform} snapshot={p} />)}
          </div>
        </div>
      )}

      {!hasData ? (
        <div className="bg-white rounded-xl border border-ink-6 p-12 text-center">
          <Star className="w-6 h-6 text-ink-4 mx-auto mb-3" />
          <p className="text-sm font-medium text-ink-2">No reviews yet</p>
          <p className="text-xs text-ink-4 mt-1 max-w-sm mx-auto">
            Your Apnosh team will sync reviews from Google, Yelp, and other platforms here as they come in.
          </p>
        </div>
      ) : (
        <>
          {/* Alert for flagged reviews */}
          {stats.flaggedCount > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-amber-900">
                  {stats.flaggedCount} {stats.flaggedCount === 1 ? 'review needs' : 'reviews need'} attention
                </p>
                <p className="text-xs text-amber-700 mt-0.5">These have been flagged by your team for follow-up.</p>
              </div>
              <button
                onClick={() => setShowFlaggedOnly(!showFlaggedOnly)}
                className="text-xs font-medium text-amber-800 hover:text-amber-900 whitespace-nowrap"
              >
                {showFlaggedOnly ? 'Show all' : 'View flagged'} →
              </button>
            </div>
          )}

          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Average rating */}
            <div className="bg-white rounded-xl border border-ink-6 p-5">
              <div className="text-[11px] text-ink-4 font-medium uppercase tracking-wide">Avg Rating</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-[family-name:var(--font-display)] text-3xl text-ink">{stats.avgRating.toFixed(1)}</span>
                <Stars rating={stats.avgRating} size="sm" />
              </div>
              <div className="text-xs text-ink-3 mt-1">from {stats.total} reviews</div>
            </div>

            {/* Total reviews */}
            <div className="bg-white rounded-xl border border-ink-6 p-5">
              <div className="text-[11px] text-ink-4 font-medium uppercase tracking-wide">Total Reviews</div>
              <div className="font-[family-name:var(--font-display)] text-3xl text-ink mt-1">{stats.total}</div>
              <div className="text-xs text-ink-3 mt-1">All time</div>
            </div>

            {/* Unresponded */}
            <div className="bg-white rounded-xl border border-ink-6 p-5">
              <div className="text-[11px] text-ink-4 font-medium uppercase tracking-wide">Unresponded</div>
              <div className="font-[family-name:var(--font-display)] text-3xl text-ink mt-1">{stats.unrespondedCount}</div>
              <div className="text-xs text-ink-3 mt-1">Pending a reply</div>
            </div>

            {/* Flagged */}
            <div className="bg-white rounded-xl border border-ink-6 p-5">
              <div className="text-[11px] text-ink-4 font-medium uppercase tracking-wide">Flagged</div>
              <div className={`font-[family-name:var(--font-display)] text-3xl ${stats.flaggedCount > 0 ? 'text-amber-600' : 'text-ink'} mt-1`}>
                {stats.flaggedCount}
              </div>
              <div className="text-xs text-ink-3 mt-1">Needs attention</div>
            </div>
          </div>

          {/* Rating distribution + Volume by month */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Distribution */}
            <div className="bg-white rounded-xl border border-ink-6 p-5">
              <h3 className="text-sm font-semibold text-ink mb-4">Rating Distribution</h3>
              <div className="space-y-2">
                {stats.distribution.map(d => {
                  const percent = stats.total === 0 ? 0 : (d.count / stats.total) * 100
                  return (
                    <div key={d.star} className="flex items-center gap-3">
                      <div className="flex items-center gap-1 w-12">
                        <span className="text-xs text-ink font-medium">{d.star}</span>
                        <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                      </div>
                      <div className="flex-1 h-2 bg-bg-2 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-400 transition-all" style={{ width: `${percent}%` }} />
                      </div>
                      <div className="text-xs text-ink-3 w-8 text-right">{d.count}</div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Volume by month */}
            <div className="bg-white rounded-xl border border-ink-6 p-5">
              <h3 className="text-sm font-semibold text-ink mb-4">Volume (last 6 months)</h3>
              <div className="flex items-end justify-between gap-2 h-32">
                {stats.monthlyVolume.map(m => {
                  const height = stats.maxMonthly === 0 ? 0 : (m.count / stats.maxMonthly) * 100
                  return (
                    <div key={m.label} className="flex-1 flex flex-col items-center gap-1">
                      <div className="text-[10px] text-ink-3 font-medium">{m.count}</div>
                      <div className="w-full bg-bg-2 rounded-t-md" style={{ height: `${Math.max(height, 4)}%` }}>
                        <div className="w-full h-full bg-brand rounded-t-md" />
                      </div>
                      <div className="text-[10px] text-ink-4">{m.label}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="w-4 h-4 text-ink-4" />
            {locations.length > 1 && (
              <select
                value={locationFilter}
                onChange={e => setLocationFilter(e.target.value)}
                className="text-xs border border-ink-6 rounded-lg px-2.5 py-1.5 text-ink-2 bg-white"
              >
                <option value="all">All {locations.length} locations</option>
                {locations.map(l => (
                  <option key={l.id} value={l.id}>{l.location_name}</option>
                ))}
              </select>
            )}
            <select
              value={sourceFilter}
              onChange={e => setSourceFilter(e.target.value as ReviewSource | 'all')}
              className="text-xs border border-ink-6 rounded-lg px-2.5 py-1.5 text-ink-2 bg-white"
            >
              <option value="all">All sources</option>
              {Object.entries(SOURCE_LABEL).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
            <select
              value={ratingFilter}
              onChange={e => setRatingFilter(e.target.value as typeof ratingFilter)}
              className="text-xs border border-ink-6 rounded-lg px-2.5 py-1.5 text-ink-2 bg-white"
            >
              <option value="all">All ratings</option>
              <option value="5">5 stars</option>
              <option value="4">4 stars</option>
              <option value="3">3 stars</option>
              <option value="2">2 stars</option>
              <option value="1">1 star</option>
            </select>
            <label className="flex items-center gap-1.5 text-xs text-ink-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showFlaggedOnly}
                onChange={e => setShowFlaggedOnly(e.target.checked)}
                className="rounded border-ink-6"
              />
              Flagged only
            </label>
            <span className="text-xs text-ink-4 ml-auto">{filtered.length} of {reviews.length}</span>
          </div>

          {/* Reviews feed */}
          {filtered.length === 0 ? (
            <div className="bg-white rounded-xl border border-ink-6 p-12 text-center">
              <Star className="w-6 h-6 text-ink-4 mx-auto mb-3" />
              <p className="text-sm text-ink-3">No reviews match your filters.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map(review => (
                <div
                  key={review.id}
                  className={`bg-white rounded-xl border p-5 ${
                    review.flagged ? 'border-amber-300 ring-1 ring-amber-200' : 'border-ink-6'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      {review.author_avatar_url ? (
                        <img src={review.author_avatar_url} alt={review.author_name ?? ''} className="w-10 h-10 rounded-full object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-bg-2 flex items-center justify-center text-ink-3 text-sm font-medium">
                          {(review.author_name ?? 'A').slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-ink">{review.author_name ?? 'Anonymous'}</span>
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${SOURCE_COLOR[review.source]}`}>
                            {SOURCE_LABEL[review.source]}
                          </span>
                          {review.flagged && (
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
                              <Flag className="w-2.5 h-2.5" /> Flagged
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <Stars rating={review.rating} size="sm" />
                          <span className="text-[10px] text-ink-4">{formatDate(review.posted_at)}</span>
                        </div>
                      </div>
                    </div>
                    {review.review_url && (
                      <a
                        href={review.review_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-ink-4 hover:text-brand transition-colors"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                  </div>

                  {review.review_text && (
                    <p className="text-sm text-ink-2 mt-3 leading-relaxed whitespace-pre-wrap">{review.review_text}</p>
                  )}

                  {review.flag_reason && (
                    <div className="mt-2 text-xs text-amber-700 flex items-start gap-1.5">
                      <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                      <span>{review.flag_reason}</span>
                    </div>
                  )}

                  {/* Response */}
                  {review.response_text ? (
                    <div className="mt-4 pl-4 border-l-2 border-brand-tint">
                      <div className="flex items-center gap-2 mb-1">
                        <MessageSquare className="w-3.5 h-3.5 text-brand-dark" />
                        <span className="text-[11px] text-brand-dark font-medium uppercase tracking-wide">
                          Our Response
                          {review.responded_at && <> &middot; {formatDate(review.responded_at)}</>}
                        </span>
                      </div>
                      <p className="text-xs text-ink-2 leading-relaxed whitespace-pre-wrap">{review.response_text}</p>
                    </div>
                  ) : (
                    <ReplyBox reviewId={review.id} source={review.source as ReviewSource} v4Enabled={v4Enabled} onSent={() => window.location.reload()} />
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ReviewsSkeleton() {
  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-pulse">
      <div className="h-8 w-48 bg-ink-6 rounded" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-ink-6 p-5 h-28" />
        ))}
      </div>
      <div className="bg-white rounded-xl border border-ink-6 h-40" />
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-ink-6 p-5 h-32" />
        ))}
      </div>
    </div>
  )
}
