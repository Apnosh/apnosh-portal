'use client'

/**
 * Mobile analytics — designed like a world-class consumer product.
 *
 * Design principles for this audience (time-starved restaurant owners,
 * low data literacy, checking on a phone):
 *
 *   1. ANSWER FIRST. Lead with a plain-language verdict ("More
 *      customers are finding you") + one number + trend. No jargon.
 *   2. THE STORY. The customer-journey funnel (Discovery → Interest →
 *      Action) is the emotional anchor — it shows the whole journey
 *      in one glance.
 *   3. PROGRESSIVE DISCLOSURE. Channels are collapsed cards showing
 *      just the headline metric. Tap to expand the rich detail inline.
 *      No "open full metrics" dead-end — the detail lives right here,
 *      and each expanded card deep-links to manage that channel.
 *   4. ACTION, NOT METRICS. End with "What to do" — concrete next
 *      steps with buttons, not passive observations.
 *
 * Data from getMobileAnalytics() (gbp_metrics + website_metrics +
 * reviews + social_metrics). All charts are inline SVG.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ArrowUpRight, ArrowDownRight, Search, Phone, MapPin, Globe,
  Star, TrendingUp, Eye, Sparkles, Users, MousePointerClick,
  ChevronDown, AlertCircle, Compass, Heart, Target, Camera,
  MessageSquare, ArrowRight,
} from 'lucide-react'
import { useClient } from '@/lib/client-context'
import { getMobileAnalytics, type MobileAnalytics as MobileAnalyticsData } from '@/lib/dashboard/get-mobile-analytics'
import type { AnalyticsRange } from '@/lib/dashboard/get-gbp-analytics'

type Period = '7d' | '30d' | '90d'

const PERIODS: Array<{ key: Period; label: string; word: string }> = [
  { key: '7d',  label: '7 days',  word: 'week' },
  { key: '30d', label: '30 days', word: 'month' },
  { key: '90d', label: '90 days', word: 'quarter' },
]

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000) return `${(n / 1_000).toFixed(0)}k`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(Math.round(n))
}

function pctChange(curr: number, prev: number): { delta: string; up: boolean | null } {
  if (prev === 0) return { delta: curr > 0 ? 'New' : '—', up: curr > 0 ? true : null }
  const d = ((curr - prev) / prev) * 100
  const sign = d > 0 ? '+' : ''
  return { delta: `${sign}${d.toFixed(0)}%`, up: d > 0 ? true : d < 0 ? false : null }
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

export default function MobileAnalytics() {
  const { client, loading: clientLoading } = useClient()
  const [period, setPeriod] = useState<Period>('30d')
  const [data, setData] = useState<MobileAnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  /* Which channel cards are expanded. Google starts open since it's
     the most important channel for a restaurant. */
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['google']))

  const toggle = (key: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  useEffect(() => {
    if (!client?.id) {
      if (!clientLoading) setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setFetchError(null)
    ;(async () => {
      try {
        const result = await getMobileAnalytics(client.id, period as AnalyticsRange)
        if (!cancelled) setData(result)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to load analytics'
        console.error('Mobile analytics fetch failed:', err)
        if (!cancelled) setFetchError(msg)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [client?.id, period, clientLoading])

  if (clientLoading || (loading && !data)) return <SkeletonState />
  if (!data && !client?.id) return <EmptyState />

  const d = data!
  const periodWord = PERIODS.find(p => p.key === period)?.word ?? 'month'
  const discoveryChange = pctChange(d.funnel.discovery, d.gbp.impressionsPrior + d.website.visitorsPrior + d.social.reachPrior)

  /* Build the "what to do" action list from the data. */
  const actions = buildActions(d)

  return (
    <div className="pb-tabbar -mx-4 -mt-4 lg:mx-0 lg:mt-0 bg-bg-2 min-h-screen">
      {/* Sticky header */}
      <div className="px-4 pt-5 pb-3 bg-white sticky top-14 z-20 border-b border-ink-6">
        <div className="flex items-center justify-between">
          <h1 className="text-[22px] font-semibold text-ink leading-tight">Performance</h1>
          <div className="inline-flex bg-ink-7 rounded-full p-0.5">
            {PERIODS.map(p => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={[
                  'px-3 h-8 rounded-full text-[12px] font-semibold transition-colors',
                  period === p.key ? 'bg-white text-ink shadow-sm' : 'text-ink-3 active:text-ink-2',
                ].join(' ')}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {fetchError && (
        <div className="bg-rose-50 border-b border-rose-200 px-4 py-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-[12.5px] font-semibold text-rose-900">Some data couldn&apos;t load</p>
            <p className="text-[11.5px] text-rose-700 mt-0.5 break-words">{fetchError}</p>
          </div>
        </div>
      )}

      {/* ═══ HERO: verdict + funnel ═══ */}
      <section className="bg-gradient-to-br from-brand to-brand-dark text-white px-5 pt-6 pb-6 relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-white/10 blur-3xl pointer-events-none" />
        <div className="relative">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/70 mb-2">
            Last {periodWord}
          </p>
          <h2 className="text-[22px] font-semibold leading-snug mb-1">
            {verdictHeadline(discoveryChange.up, d.funnel.discovery)}
          </h2>
          {discoveryChange.up !== null && (
            <p className={`inline-flex items-center gap-1 text-[13.5px] font-semibold ${discoveryChange.up ? 'text-emerald-200' : 'text-rose-200'}`}>
              {discoveryChange.up ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
              {discoveryChange.delta} <span className="text-white/60 font-normal">vs last {periodWord}</span>
            </p>
          )}

          {/* Funnel */}
          <div className="mt-5 space-y-2.5">
            <FunnelBar label="Discovered you" value={d.funnel.discovery} max={d.funnel.discovery} />
            <FunnelBar label="Looked closer" value={d.funnel.interest} max={d.funnel.discovery} />
            <FunnelBar label="Took action" value={d.funnel.action} max={d.funnel.discovery} />
          </div>

          <div className="mt-4 inline-flex items-center gap-2 bg-white/15 rounded-full px-3 py-1.5">
            <Target className="w-3.5 h-3.5" />
            <span className="text-[12px] font-semibold">
              {d.funnel.conversionRate.toFixed(1)}% became customers
            </span>
          </div>
        </div>
      </section>

      {/* ═══ CHANNELS (expandable) ═══ */}
      <div className="px-4 pt-5 pb-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-3">Your channels</p>
      </div>
      <div className="px-4 space-y-2.5">
        {/* Google */}
        <ChannelCard
          icon={Compass}
          tint="bg-blue-50 text-blue-700"
          name="Google"
          sub="Search + Maps"
          headline={formatNumber(d.gbp.impressions)}
          headlineLabel="views"
          delta={pctChange(d.gbp.impressions, d.gbp.impressionsPrior)}
          sparkline={d.gbp.sparkline}
          open={expanded.has('google')}
          onToggle={() => toggle('google')}
        >
          <SourceBars
            items={[
              { label: 'Google Search', value: d.gbp.searchTotal, color: 'bg-blue-500' },
              { label: 'Google Maps', value: d.gbp.mapsTotal, color: 'bg-emerald-500' },
            ]}
            total={d.gbp.searchTotal + d.gbp.mapsTotal}
          />
          <div className="grid grid-cols-3 gap-2.5 mt-3">
            <StatTile icon={Phone} label="Calls" value={d.gbp.calls} delta={pctChange(d.gbp.calls, d.gbp.callsPrior)} tint="bg-amber-50 text-amber-700" />
            <StatTile icon={MapPin} label="Directions" value={d.gbp.directions} delta={pctChange(d.gbp.directions, d.gbp.directionsPrior)} tint="bg-emerald-50 text-emerald-700" />
            <StatTile icon={MousePointerClick} label="Site clicks" value={d.gbp.websiteClicks} delta={pctChange(d.gbp.websiteClicks, d.gbp.websiteClicksPrior)} tint="bg-purple-50 text-purple-700" />
          </div>
          {d.gbp.topQueries.length > 0 && (
            <div className="mt-3">
              <p className="text-[11px] font-semibold text-ink-3 mb-1.5">What people searched</p>
              <div className="flex flex-wrap gap-1.5">
                {d.gbp.topQueries.slice(0, 5).map((q, i) => (
                  <span key={i} className="inline-flex items-center gap-1 bg-bg-2 rounded-full px-2.5 py-1 text-[11.5px] text-ink-2">
                    <Search className="w-3 h-3 text-ink-4" />{q.query}
                  </span>
                ))}
              </div>
            </div>
          )}
          <ManageLink href="/dashboard/local-seo" label="Manage Google profile" />
        </ChannelCard>

        {/* Website */}
        <ChannelCard
          icon={Globe}
          tint="bg-emerald-50 text-emerald-700"
          name="Website"
          sub={d.website.connected ? 'Visitors + conversions' : 'Not connected'}
          headline={d.website.connected ? formatNumber(d.website.visitors) : '—'}
          headlineLabel={d.website.connected ? 'visitors' : ''}
          delta={d.website.connected ? pctChange(d.website.visitors, d.website.visitorsPrior) : undefined}
          sparkline={d.website.connected ? d.website.sparkline : undefined}
          open={expanded.has('website')}
          onToggle={() => toggle('website')}
        >
          {d.website.connected ? (
            <>
              <div className="grid grid-cols-3 gap-2.5">
                <StatTile icon={Target} label="Conversions" value={d.website.conversions} tint="bg-purple-50 text-purple-700" />
                <MiniStat label="Avg visit" value={formatDuration(d.website.avgSessionSeconds)} />
                <MiniStat label="Bounce" value={d.website.bounceRate !== null ? `${Math.round(d.website.bounceRate)}%` : '—'} />
              </div>
              {d.website.topSources.length > 0 && (
                <div className="mt-3">
                  <p className="text-[11px] font-semibold text-ink-3 mb-1.5">Where traffic comes from</p>
                  <SourceBars
                    items={d.website.topSources.map((s, i) => ({
                      label: prettySource(s.source),
                      value: s.visitors,
                      color: ['bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-purple-500'][i % 4],
                    }))}
                    total={d.website.topSources.reduce((a, b) => a + b.visitors, 0)}
                  />
                </div>
              )}
              <ManageLink href="/dashboard/website" label="Manage website" />
            </>
          ) : (
            <InlineConnect body="Connect Google Analytics to see who visits your site and what they do." href="/dashboard/website" cta="Set up website tracking" />
          )}
        </ChannelCard>

        {/* Reviews */}
        <ChannelCard
          icon={Star}
          tint="bg-amber-50 text-amber-700"
          name="Reviews"
          sub={d.reviews.total > 0 ? `${d.reviews.total} reviews` : 'No reviews yet'}
          headline={d.reviews.avgRating?.toFixed(1) ?? '—'}
          headlineLabel={d.reviews.avgRating !== null ? '★ avg' : ''}
          deltaBadge={d.reviews.newThisPeriod > 0 ? `+${d.reviews.newThisPeriod} new` : undefined}
          open={expanded.has('reviews')}
          onToggle={() => toggle('reviews')}
        >
          {d.reviews.total > 0 ? (
            <>
              <div className="space-y-1">
                {d.reviews.distribution.map((count, i) => {
                  const star = 5 - i
                  const pct = d.reviews.total > 0 ? (count / d.reviews.total) * 100 : 0
                  return (
                    <div key={star} className="flex items-center gap-2 text-[11px] text-ink-3">
                      <span className="w-3 tabular-nums">{star}</span>
                      <Star className="w-3 h-3 text-ink-4" />
                      <div className="flex-1 h-1.5 bg-ink-7 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-400 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-6 text-right tabular-nums">{count}</span>
                    </div>
                  )
                })}
              </div>
              <ManageLink href="/dashboard/local-seo/reviews" label="Respond to reviews" />
            </>
          ) : (
            <InlineConnect body="Reviews from Google, Yelp, and more show up here once they come in." href="/dashboard/local-seo/reviews" cta="Set up review monitoring" />
          )}
        </ChannelCard>

        {/* Social */}
        <ChannelCard
          icon={Sparkles}
          tint="bg-purple-50 text-purple-700"
          name="Social"
          sub={d.social.connected ? 'Reach + engagement' : 'Not connected'}
          headline={d.social.connected ? formatNumber(d.social.reach) : '—'}
          headlineLabel={d.social.connected ? 'reach' : ''}
          delta={d.social.connected ? pctChange(d.social.reach, d.social.reachPrior) : undefined}
          open={expanded.has('social')}
          onToggle={() => toggle('social')}
        >
          {d.social.connected ? (
            <>
              {d.social.topPost && (
                <div className="bg-gradient-to-br from-pink-50 to-amber-50 border border-amber-100 rounded-xl p-3 mb-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700 mb-1">Top post</p>
                  <p className="text-[13px] text-ink leading-snug line-clamp-2 mb-1">{d.social.topPost.caption || 'Your best post'}</p>
                  <p className="text-[11.5px] text-ink-2"><strong>{formatNumber(d.social.topPost.engagement)}</strong> engagements</p>
                </div>
              )}
              <div className="grid grid-cols-3 gap-2.5">
                <StatTile icon={Eye} label="Reach" value={d.social.reach} delta={pctChange(d.social.reach, d.social.reachPrior)} tint="bg-purple-50 text-purple-700" />
                <StatTile icon={Heart} label="Engaged" value={d.social.engagement} tint="bg-pink-50 text-pink-700" />
                <StatTile icon={Users} label="Followers" value={d.social.followers} delta={d.social.followersChange !== 0 ? { delta: (d.social.followersChange > 0 ? '+' : '') + d.social.followersChange, up: d.social.followersChange > 0 } : undefined} tint="bg-blue-50 text-blue-700" />
              </div>
              <ManageLink href="/dashboard/social" label="Open social" />
            </>
          ) : (
            <InlineConnect body="Connect Instagram and Facebook to track reach, engagement, and followers." href="/dashboard/connected-accounts" cta="Connect social accounts" />
          )}
        </ChannelCard>
      </div>

      {/* ═══ WHAT TO DO ═══ */}
      {actions.length > 0 && (
        <section className="px-4 pt-6 pb-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-3 mb-2.5">What to do next</p>
          <div className="space-y-2.5">
            {actions.map((a, i) => (
              <Link
                key={i}
                href={a.href}
                className="flex items-start gap-3 bg-white rounded-2xl border border-ink-6 p-4 active:bg-ink-7 transition-colors"
              >
                <span className={`inline-flex items-center justify-center w-9 h-9 rounded-xl flex-shrink-0 ${a.tint}`}>
                  <a.icon className="w-4 h-4" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[13.5px] font-semibold text-ink leading-snug">{a.title}</p>
                  <p className="text-[12px] text-ink-3 mt-0.5 leading-snug">{a.body}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-ink-4 flex-shrink-0 mt-1" />
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="h-6" />
    </div>
  )
}

/* ─── "What to do" generator ─── */

function buildActions(d: MobileAnalyticsData): Array<{ icon: React.ComponentType<{ className?: string }>; tint: string; title: string; body: string; href: string }> {
  const out: Array<{ icon: React.ComponentType<{ className?: string }>; tint: string; title: string; body: string; href: string }> = []

  /* Reviews needing response is always top priority. */
  if (d.reviews.newThisPeriod > 0) {
    out.push({
      icon: MessageSquare,
      tint: 'bg-amber-100 text-amber-700',
      title: `Respond to ${d.reviews.newThisPeriod} new review${d.reviews.newThisPeriod > 1 ? 's' : ''}`,
      body: 'Replying fast keeps your rating strong and shows you care.',
      href: '/dashboard/local-seo/reviews',
    })
  }

  /* Low conversion → add photos. */
  if (d.funnel.conversionRate < 10 && d.gbp.impressions > 0) {
    out.push({
      icon: Camera,
      tint: 'bg-purple-100 text-purple-700',
      title: 'Add fresh photos to your Google profile',
      body: 'More photos lift how many viewers become customers.',
      href: '/dashboard/assets',
    })
  }

  /* No website connected. */
  if (!d.website.connected) {
    out.push({
      icon: Globe,
      tint: 'bg-emerald-100 text-emerald-700',
      title: 'Connect your website analytics',
      body: 'See who visits your site and turn them into reservations.',
      href: '/dashboard/website',
    })
  }

  /* No social connected. */
  if (!d.social.connected) {
    out.push({
      icon: Sparkles,
      tint: 'bg-pink-100 text-pink-700',
      title: 'Connect Instagram & Facebook',
      body: 'Track which posts bring people through your door.',
      href: '/dashboard/connected-accounts',
    })
  }

  /* Strong performer encouragement. */
  if (d.funnel.conversionRate >= 10 && out.length < 2) {
    out.push({
      icon: TrendingUp,
      tint: 'bg-emerald-100 text-emerald-700',
      title: 'Keep the momentum going',
      body: 'Your numbers are strong. Post consistently to keep climbing.',
      href: '/dashboard/social/calendar',
    })
  }

  return out.slice(0, 3)
}

function verdictHeadline(up: boolean | null, discovery: number): string {
  if (discovery === 0) return 'Let\'s get more customers finding you'
  if (up === true) return 'More customers are finding you'
  if (up === false) return 'Fewer customers found you this period'
  return 'Here\'s how customers are finding you'
}

/* ─── Channel card (expandable) ─── */

function ChannelCard({
  icon: Icon, tint, name, sub, headline, headlineLabel, delta, deltaBadge,
  sparkline, open, onToggle, children,
}: {
  icon: React.ComponentType<{ className?: string }>
  tint: string
  name: string
  sub: string
  headline: string
  headlineLabel: string
  delta?: { delta: string; up: boolean | null }
  deltaBadge?: string
  sparkline?: number[]
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-2xl border border-ink-6 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-4 active:bg-ink-7 transition-colors text-left"
        aria-expanded={open}
      >
        <span className={`inline-flex items-center justify-center w-10 h-10 rounded-xl flex-shrink-0 ${tint}`}>
          <Icon className="w-5 h-5" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-semibold text-ink leading-tight">{name}</p>
          <p className="text-[11.5px] text-ink-3">{sub}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-[18px] font-bold text-ink tabular-nums leading-none">
            {headline}
            {headlineLabel && <span className="text-[11px] font-normal text-ink-3 ml-0.5">{headlineLabel}</span>}
          </p>
          <div className="flex items-center justify-end gap-1.5 mt-1">
            {delta && delta.up !== null && (
              <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${delta.up ? 'text-emerald-700' : 'text-rose-700'}`}>
                {delta.up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                {delta.delta}
              </span>
            )}
            {deltaBadge && (
              <span className="text-[11px] font-semibold text-emerald-700">{deltaBadge}</span>
            )}
          </div>
        </div>
        <ChevronDown className={`w-5 h-5 text-ink-4 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Collapsed-state sparkline peek (only when closed + available) */}
      {!open && sparkline && sparkline.length >= 2 && (
        <div className="px-4 pb-3 -mt-1">
          <Sparkline values={sparkline} color="var(--color-ink-5)" fill="transparent" height={24} />
        </div>
      )}

      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-ink-7">
          <div className="pt-3">{children}</div>
        </div>
      )}
    </div>
  )
}

/* ─── Reusable bits ─── */

function FunnelBar({ label, value, max }: { label: string; value: number; max: number }) {
  const w = max > 0 ? Math.max(6, (value / max) * 100) : 6
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[12.5px] font-semibold text-white">{label}</span>
        <span className="text-[16px] font-bold text-white tabular-nums">{formatNumber(value)}</span>
      </div>
      <div className="h-6 bg-white/15 rounded-lg overflow-hidden">
        <div className="h-full bg-white/90 rounded-lg transition-all duration-700" style={{ width: `${w}%` }} />
      </div>
    </div>
  )
}

function ManageLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand-dark active:text-brand mt-3.5">
      {label} <ArrowRight className="w-3.5 h-3.5" />
    </Link>
  )
}

function StatTile({ icon: Icon, label, value, delta, tint }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number; delta?: { delta: string; up: boolean | null }; tint: string }) {
  return (
    <div className="bg-bg-2 rounded-xl p-2.5">
      <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg ${tint} mb-1.5`}>
        <Icon className="w-3.5 h-3.5" />
      </span>
      <p className="text-[9px] font-bold uppercase tracking-wider text-ink-3 leading-none mb-1">{label}</p>
      <p className="text-[17px] font-bold text-ink tabular-nums leading-none">{formatNumber(value)}</p>
      {delta && delta.up !== null && (
        <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold mt-1 ${delta.up ? 'text-emerald-700' : 'text-rose-700'}`}>
          {delta.up ? <ArrowUpRight className="w-2.5 h-2.5" /> : <ArrowDownRight className="w-2.5 h-2.5" />}
          {delta.delta}
        </span>
      )}
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-bg-2 rounded-xl p-2.5 flex flex-col justify-center">
      <p className="text-[9px] font-bold uppercase tracking-wider text-ink-3 leading-none mb-1">{label}</p>
      <p className="text-[15px] font-bold text-ink tabular-nums leading-none">{value}</p>
    </div>
  )
}

function InlineConnect({ body, href, cta }: { body: string; href: string; cta: string }) {
  return (
    <div className="text-center py-2">
      <p className="text-[12.5px] text-ink-3 max-w-[260px] mx-auto mb-2.5">{body}</p>
      <Link href={href} className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand-dark active:text-brand">
        {cta} <ArrowRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  )
}

function SourceBars({ items, total }: { items: Array<{ label: string; value: number; color: string }>; total: number }) {
  if (total === 0) return <p className="text-[12px] text-ink-3">No data yet for this period.</p>
  return (
    <div className="space-y-2.5">
      {items.map(item => {
        const pct = total > 0 ? (item.value / total) * 100 : 0
        return (
          <div key={item.label}>
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-[12.5px] font-semibold text-ink">{item.label}</span>
              <div className="flex items-baseline gap-2">
                <span className="text-[14px] font-bold text-ink tabular-nums">{formatNumber(item.value)}</span>
                <span className="text-[11px] text-ink-3 w-8 text-right">{pct.toFixed(0)}%</span>
              </div>
            </div>
            <div className="h-2 bg-ink-7 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-700 ${item.color}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Sparkline({ values, color, fill, height = 64 }: { values: number[]; color: string; fill: string; height?: number }) {
  if (values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const w = 100 / (values.length - 1)
  const points = values.map((v, i) => ({ x: i * w, y: 100 - ((v - min) / range) * 100 }))
  const path = points.reduce((acc, p, i, arr) => {
    if (i === 0) return `M ${p.x.toFixed(2)} ${p.y.toFixed(2)}`
    const prev = arr[i - 1]
    const cx = ((prev.x + p.x) / 2).toFixed(2)
    return `${acc} C ${cx} ${prev.y.toFixed(2)}, ${cx} ${p.y.toFixed(2)}, ${p.x.toFixed(2)} ${p.y.toFixed(2)}`
  }, '')
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full" style={{ height }}>
      {fill !== 'transparent' && <path d={`${path} L 100 100 L 0 100 Z`} fill={fill} />}
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function prettySource(source: string): string {
  const map: Record<string, string> = {
    organic: 'Google Search', direct: 'Direct', social: 'Social media',
    referral: 'Referral', paid: 'Paid ads', email: 'Email', google: 'Google',
    '(direct)': 'Direct', 'organic search': 'Google Search',
  }
  return map[source.toLowerCase()] ?? source.charAt(0).toUpperCase() + source.slice(1)
}

function SkeletonState() {
  return (
    <div className="pb-tabbar -mx-4 -mt-4 lg:mx-0 lg:mt-0 space-y-3 p-4">
      <div className="skel h-8 w-40" />
      <div className="skel h-64 w-full rounded-2xl" />
      <div className="skel h-16 w-full rounded-2xl" />
      <div className="skel h-16 w-full rounded-2xl" />
      <div className="skel h-16 w-full rounded-2xl" />
    </div>
  )
}

function EmptyState() {
  return (
    <div className="px-4 py-12 text-center -mx-4 -mt-4 lg:mx-0 lg:mt-0">
      <div className="w-16 h-16 rounded-full bg-brand-tint mx-auto mb-4 flex items-center justify-center">
        <TrendingUp className="w-7 h-7 text-brand-dark" />
      </div>
      <p className="text-[18px] font-semibold text-ink mb-2">No analytics yet</p>
      <p className="text-[13px] text-ink-3 max-w-xs mx-auto mb-6">
        Connect your Google Business Profile and website to see how customers find and engage with you.
      </p>
      <Link href="/dashboard/connected-accounts" className="inline-flex items-center gap-1.5 bg-brand text-white rounded-full px-5 py-2.5 text-[13px] font-semibold active:bg-brand-dark">
        Connect a channel <ArrowRight className="w-4 h-4" />
      </Link>
    </div>
  )
}
