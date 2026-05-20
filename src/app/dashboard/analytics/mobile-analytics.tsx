'use client'

/**
 * Mobile analytics — the restaurant owner's command center.
 *
 * Built around the question owners actually ask: "Are people finding
 * me, are they interested, and are they taking action?" The hero is a
 * customer-journey funnel (Discovery → Interest → Action). Below that:
 * Get Found (GBP), Website, Reputation, and Social — each a section a
 * restaurant owner deeply cares about.
 *
 * Pulls from getMobileAnalytics() which unifies gbp_metrics,
 * website_metrics, reviews, and social_metrics into one shape.
 *
 * All charts are inline SVG — no chart library imports.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ArrowUpRight, ArrowDownRight, Search, Phone, MapPin, Globe,
  Star, TrendingUp, Eye, Sparkles, Users, MousePointerClick,
  ChevronRight, AlertCircle, Compass, Heart, Target,
} from 'lucide-react'
import { useClient } from '@/lib/client-context'
import { getMobileAnalytics, type MobileAnalytics as MobileAnalyticsData } from '@/lib/dashboard/get-mobile-analytics'
import type { AnalyticsRange } from '@/lib/dashboard/get-gbp-analytics'

type Period = '7d' | '30d' | '90d'

const PERIODS: Array<{ key: Period; label: string }> = [
  { key: '7d',  label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: '90d', label: '90 days' },
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

  if (clientLoading || (loading && !data)) {
    return <SkeletonState />
  }

  if (!data && !client?.id) {
    return <EmptyState />
  }

  const d = data!

  return (
    <div className="pb-tabbar -mx-4 -mt-4 lg:mx-0 lg:mt-0 bg-bg-2 min-h-screen">
      {/* Header */}
      <div className="px-4 pt-5 pb-4 bg-white">
        <h1 className="text-[26px] font-semibold text-ink leading-tight">Performance</h1>
        <p className="text-[13px] text-ink-3 mt-0.5">{client?.name ?? 'Your restaurant'}</p>
        {/* Period picker */}
        <div className="inline-flex bg-ink-7 rounded-full p-0.5 mt-3">
          {PERIODS.map(p => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={[
                'px-3.5 h-9 rounded-full text-[12.5px] font-semibold transition-colors',
                period === p.key ? 'bg-white text-ink shadow-sm' : 'text-ink-3 active:text-ink-2',
              ].join(' ')}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {fetchError && (
        <div className="bg-rose-50 border-y border-rose-200 px-4 py-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-[12.5px] font-semibold text-rose-900">Some data couldn&apos;t load</p>
            <p className="text-[11.5px] text-rose-700 mt-0.5 break-words">{fetchError}</p>
          </div>
        </div>
      )}

      {/* ═══ CUSTOMER JOURNEY FUNNEL (hero) ═══ */}
      <FunnelHero funnel={d.funnel} period={period} />

      {/* ═══ GET FOUND ═══ */}
      <SectionHeader title="Get found" subtitle="How customers discover you" href="/dashboard/local-seo" Icon={Compass} />
      <section className="px-4 pb-5 bg-white space-y-4">
        {/* Sparkline mini-card */}
        <div className="bg-bg-2 rounded-2xl p-4">
          <div className="flex items-baseline justify-between mb-1">
            <p className="text-[12px] font-semibold text-ink-2">Total views on Google</p>
            <Delta {...pctChange(d.gbp.impressions, d.gbp.impressionsPrior)} />
          </div>
          <p className="text-[28px] font-bold text-ink tabular-nums leading-none mb-2">
            {formatNumber(d.gbp.impressions)}
          </p>
          {d.gbp.sparkline.length >= 2 && (
            <Sparkline values={d.gbp.sparkline} color="var(--color-brand-dark)" fill="rgba(74,189,152,0.12)" height={40} />
          )}
        </div>

        {/* Search vs Maps */}
        <SourceBars
          items={[
            { label: 'Google Search', value: d.gbp.searchTotal, color: 'bg-blue-500' },
            { label: 'Google Maps',   value: d.gbp.mapsTotal,   color: 'bg-emerald-500' },
          ]}
          total={d.gbp.searchTotal + d.gbp.mapsTotal}
        />

        {/* Actions */}
        <div className="grid grid-cols-3 gap-2.5">
          <StatTile icon={Phone} label="Calls" value={d.gbp.calls} delta={pctChange(d.gbp.calls, d.gbp.callsPrior)} tint="bg-amber-50 text-amber-700" />
          <StatTile icon={MapPin} label="Directions" value={d.gbp.directions} delta={pctChange(d.gbp.directions, d.gbp.directionsPrior)} tint="bg-emerald-50 text-emerald-700" />
          <StatTile icon={MousePointerClick} label="Site clicks" value={d.gbp.websiteClicks} delta={pctChange(d.gbp.websiteClicks, d.gbp.websiteClicksPrior)} tint="bg-blue-50 text-blue-700" />
        </div>

        {/* Top queries */}
        {d.gbp.topQueries.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold text-ink-3 mb-2">What people searched to find you</p>
            <div className="flex flex-wrap gap-1.5">
              {d.gbp.topQueries.slice(0, 6).map((q, i) => (
                <span key={i} className="inline-flex items-center gap-1 bg-bg-2 rounded-full px-2.5 py-1 text-[11.5px] text-ink-2">
                  <Search className="w-3 h-3 text-ink-4" />
                  {q.query}
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ═══ WEBSITE ═══ */}
      <SectionHeader title="Your website" subtitle="Traffic and conversions" href="/dashboard/website" Icon={Globe} />
      <section className="px-4 pb-5 bg-white space-y-4">
        {d.website.connected ? (
          <>
            <div className="grid grid-cols-2 gap-2.5">
              <BigStat label="Visitors" value={formatNumber(d.website.visitors)} delta={pctChange(d.website.visitors, d.website.visitorsPrior)} />
              <BigStat label="Page views" value={formatNumber(d.website.pageViews)} />
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              <StatTile icon={Target} label="Conversions" value={d.website.conversions} tint="bg-purple-50 text-purple-700" />
              <SmallStat label="Avg. visit" value={formatDuration(d.website.avgSessionSeconds)} />
              <SmallStat label="Bounce" value={d.website.bounceRate !== null ? `${Math.round(d.website.bounceRate)}%` : '—'} />
            </div>
            {d.website.topSources.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-ink-3 mb-2">Where website traffic comes from</p>
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
          </>
        ) : (
          <ConnectPrompt
            icon={Globe}
            title="No website data yet"
            body="Connect Google Analytics to see who visits your site and what they do."
            href="/dashboard/website"
            cta="Set up website tracking"
          />
        )}
      </section>

      {/* ═══ REPUTATION ═══ */}
      <SectionHeader title="Reputation" subtitle="Reviews and ratings" href="/dashboard/local-seo/reviews" Icon={Star} />
      <section className="px-4 pb-5 bg-white">
        {d.reviews.total > 0 ? (
          <div className="flex items-start gap-5">
            <div className="flex-shrink-0">
              <p className="text-[44px] font-bold text-ink tabular-nums leading-none">{d.reviews.avgRating?.toFixed(1) ?? '—'}</p>
              <div className="flex gap-0.5 mt-1.5">
                {[1, 2, 3, 4, 5].map(i => (
                  <Star key={i} className={`w-3.5 h-3.5 ${i <= Math.round(d.reviews.avgRating ?? 0) ? 'fill-amber-400 text-amber-400' : 'text-ink-6'}`} />
                ))}
              </div>
              <p className="text-[10.5px] text-ink-3 mt-2">
                {d.reviews.total} total
                {d.reviews.newThisPeriod > 0 && <span className="text-emerald-700 font-semibold"> · {d.reviews.newThisPeriod} new</span>}
              </p>
            </div>
            <div className="flex-1 space-y-1">
              {d.reviews.distribution.map((count, i) => {
                const star = 5 - i
                const pct = d.reviews.total > 0 ? (count / d.reviews.total) * 100 : 0
                return (
                  <div key={star} className="flex items-center gap-2 text-[10.5px] text-ink-3">
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
          </div>
        ) : (
          <ConnectPrompt
            icon={Star}
            title="No reviews yet"
            body="Reviews from Google, Yelp, and more will show up here once they come in."
            href="/dashboard/local-seo/reviews"
            cta="Set up review monitoring"
          />
        )}
      </section>

      {/* ═══ SOCIAL ═══ */}
      <SectionHeader title="Social" subtitle="Reach and engagement" href="/dashboard/social" Icon={Sparkles} />
      <section className="px-4 pb-5 bg-white space-y-4">
        {d.social.connected ? (
          <>
            {d.social.topPost && (
              <div className="bg-gradient-to-br from-pink-50 to-amber-50 border border-amber-100 rounded-2xl p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700 mb-1.5">Top post this month</p>
                <p className="text-[13.5px] text-ink leading-snug line-clamp-2 mb-2">{d.social.topPost.caption || 'Your best-performing post'}</p>
                <p className="text-[12px] text-ink-2"><strong>{formatNumber(d.social.topPost.engagement)}</strong> engagements</p>
              </div>
            )}
            <div className="grid grid-cols-3 gap-2.5">
              <StatTile icon={Eye} label="Reach" value={d.social.reach} delta={pctChange(d.social.reach, d.social.reachPrior)} tint="bg-purple-50 text-purple-700" />
              <StatTile icon={Heart} label="Engaged" value={d.social.engagement} tint="bg-pink-50 text-pink-700" />
              <StatTile icon={Users} label="Followers" value={d.social.followers} delta={d.social.followersChange !== 0 ? { delta: (d.social.followersChange > 0 ? '+' : '') + d.social.followersChange, up: d.social.followersChange > 0 } : { delta: '—', up: null }} tint="bg-blue-50 text-blue-700" />
            </div>
          </>
        ) : (
          <ConnectPrompt
            icon={Sparkles}
            title="No social data yet"
            body="Connect Instagram and Facebook to track reach, engagement, and follower growth."
            href="/dashboard/connected-accounts"
            cta="Connect social accounts"
          />
        )}
      </section>

      {/* ═══ AI INSIGHTS ═══ */}
      <section className="px-4 py-5 bg-bg-2">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-3">What this means</p>
          <Link href="/dashboard/audit" className="text-[12px] font-semibold text-brand-dark active:text-brand">See audit</Link>
        </div>
        <div className="bg-white rounded-2xl border border-ink-6 p-4 space-y-3">
          <Insight
            icon={Target}
            tint="bg-emerald-100 text-emerald-700"
            text={`${d.funnel.conversionRate.toFixed(1)}% of people who found you took action — ${d.funnel.conversionRate >= 10 ? 'that\'s strong.' : 'room to grow with better photos and a clearer call-to-action.'}`}
          />
          {d.gbp.directions > 0 && (
            <Insight
              icon={MapPin}
              tint="bg-amber-100 text-amber-700"
              text={`${formatNumber(d.gbp.directions)} people asked for directions — those are customers actively heading your way.`}
            />
          )}
          {d.website.connected && d.website.conversions > 0 && (
            <Insight
              icon={MousePointerClick}
              tint="bg-purple-100 text-purple-700"
              text={`Your website drove ${formatNumber(d.website.conversions)} conversions this period — reservations, orders, or form fills.`}
            />
          )}
        </div>
      </section>

      {/* Deep dive */}
      <section className="px-4 py-5 bg-bg-2">
        <Link href="/dashboard/local-seo/analytics" className="block bg-white rounded-2xl border border-ink-6 p-4 active:bg-ink-7 transition-colors">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[14px] font-semibold text-ink">Open full analytics</p>
              <p className="text-[12px] text-ink-3 mt-0.5">Every metric, every trend, every channel</p>
            </div>
            <ChevronRight className="w-5 h-5 text-ink-4" />
          </div>
        </Link>
      </section>
    </div>
  )
}

/* ─── Funnel hero ─── */

function FunnelHero({ funnel, period }: { funnel: MobileAnalyticsData['funnel']; period: string }) {
  const max = Math.max(funnel.discovery, 1)
  const stages = [
    { label: 'Discovered you', value: funnel.discovery, sub: 'Saw you on Google, web, or social', w: 100 },
    { label: 'Looked closer', value: funnel.interest, sub: 'Viewed photos, posts, or pages', w: Math.max(8, (funnel.interest / max) * 100) },
    { label: 'Took action', value: funnel.action, sub: 'Called, got directions, or converted', w: Math.max(8, (funnel.action / max) * 100) },
  ]
  return (
    <section className="bg-gradient-to-br from-brand to-brand-dark text-white px-5 pt-6 pb-6 relative overflow-hidden">
      <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-white/10 blur-3xl pointer-events-none" />
      <div className="relative">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/70 mb-1">
          Customer journey · last {period}
        </p>
        <p className="text-[13px] text-white/80 mb-5">
          How {formatNumber(funnel.discovery)} people moved from finding you to taking action
        </p>

        <div className="space-y-2.5">
          {stages.map((s, i) => (
            <div key={i}>
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-[12.5px] font-semibold text-white">{s.label}</span>
                <span className="text-[18px] font-bold text-white tabular-nums">{formatNumber(s.value)}</span>
              </div>
              <div className="h-7 bg-white/15 rounded-lg overflow-hidden">
                <div
                  className="h-full bg-white/90 rounded-lg transition-all duration-700 flex items-center"
                  style={{ width: `${s.w}%` }}
                />
              </div>
              <p className="text-[10.5px] text-white/60 mt-1">{s.sub}</p>
            </div>
          ))}
        </div>

        <div className="mt-5 inline-flex items-center gap-2 bg-white/15 rounded-full px-3 py-1.5">
          <Target className="w-3.5 h-3.5" />
          <span className="text-[12px] font-semibold">
            {funnel.conversionRate.toFixed(1)}% turned into customers
          </span>
        </div>
      </div>
    </section>
  )
}

/* ─── Reusable bits ─── */

function SectionHeader({ title, subtitle, href, Icon }: { title: string; subtitle: string; href: string; Icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="px-4 pt-5 pb-3 bg-white flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-brand-tint text-brand-dark">
          <Icon className="w-4 h-4" />
        </span>
        <div>
          <p className="text-[15px] font-semibold text-ink leading-tight">{title}</p>
          <p className="text-[11.5px] text-ink-3">{subtitle}</p>
        </div>
      </div>
      <Link href={href} className="text-ink-4 active:text-ink">
        <ChevronRight className="w-5 h-5" />
      </Link>
    </div>
  )
}

function Delta({ delta, up }: { delta: string; up: boolean | null }) {
  if (up === null) return <span className="text-[11px] text-ink-3">{delta}</span>
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11.5px] font-semibold ${up ? 'text-emerald-700' : 'text-rose-700'}`}>
      {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
      {delta}
    </span>
  )
}

function StatTile({ icon: Icon, label, value, delta, tint }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number; delta?: { delta: string; up: boolean | null }; tint: string }) {
  return (
    <div className="bg-bg-2 rounded-2xl p-3">
      <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg ${tint} mb-2`}>
        <Icon className="w-4 h-4" />
      </span>
      <p className="text-[9.5px] font-bold uppercase tracking-wider text-ink-3 leading-none mb-1">{label}</p>
      <p className="text-[19px] font-bold text-ink tabular-nums leading-none">{formatNumber(value)}</p>
      {delta && delta.up !== null && (
        <div className="mt-1"><Delta {...delta} /></div>
      )}
    </div>
  )
}

function BigStat({ label, value, delta }: { label: string; value: string; delta?: { delta: string; up: boolean | null } }) {
  return (
    <div className="bg-bg-2 rounded-2xl p-4">
      <p className="text-[10px] font-bold uppercase tracking-wider text-ink-3 leading-none mb-1.5">{label}</p>
      <p className="text-[26px] font-bold text-ink tabular-nums leading-none">{value}</p>
      {delta && delta.up !== null && <div className="mt-1.5"><Delta {...delta} /></div>}
    </div>
  )
}

function SmallStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-bg-2 rounded-2xl p-3 flex flex-col justify-center">
      <p className="text-[9.5px] font-bold uppercase tracking-wider text-ink-3 leading-none mb-1">{label}</p>
      <p className="text-[16px] font-bold text-ink tabular-nums leading-none">{value}</p>
    </div>
  )
}

function Insight({ icon: Icon, tint, text }: { icon: React.ComponentType<{ className?: string }>; tint: string; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className={`inline-flex items-center justify-center w-8 h-8 rounded-xl flex-shrink-0 ${tint}`}>
        <Icon className="w-4 h-4" />
      </span>
      <p className="text-[13px] text-ink leading-snug flex-1">{text}</p>
    </div>
  )
}

function ConnectPrompt({ icon: Icon, title, body, href, cta }: { icon: React.ComponentType<{ className?: string }>; title: string; body: string; href: string; cta: string }) {
  return (
    <div className="bg-bg-2 rounded-2xl p-5 text-center">
      <div className="w-11 h-11 rounded-full bg-white border border-ink-6 mx-auto mb-2.5 flex items-center justify-center">
        <Icon className="w-5 h-5 text-ink-4" />
      </div>
      <p className="text-[14px] font-semibold text-ink mb-1">{title}</p>
      <p className="text-[12px] text-ink-3 max-w-[260px] mx-auto mb-3">{body}</p>
      <Link href={href} className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand-dark active:text-brand">
        {cta} <ChevronRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  )
}

function SourceBars({ items, total }: { items: Array<{ label: string; value: number; color: string }>; total: number }) {
  if (total === 0) {
    return <p className="text-[12px] text-ink-3">No data yet for this period.</p>
  }
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
  const areaPath = `${path} L 100 100 L 0 100 Z`
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full" style={{ height }}>
      <path d={areaPath} fill={fill} />
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      {points.length > 0 && <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r={1.8} fill={color} />}
    </svg>
  )
}

function prettySource(source: string): string {
  const map: Record<string, string> = {
    organic: 'Google Search',
    direct: 'Direct',
    social: 'Social media',
    referral: 'Referral',
    paid: 'Paid ads',
    email: 'Email',
    google: 'Google',
    '(direct)': 'Direct',
    'organic search': 'Google Search',
  }
  return map[source.toLowerCase()] ?? source.charAt(0).toUpperCase() + source.slice(1)
}

function SkeletonState() {
  return (
    <div className="pb-tabbar -mx-4 -mt-4 lg:mx-0 lg:mt-0 space-y-3 p-4">
      <div className="skel h-8 w-40" />
      <div className="skel h-10 w-48 rounded-full" />
      <div className="skel h-64 w-full rounded-2xl" />
      <div className="skel h-32 w-full rounded-2xl" />
      <div className="grid grid-cols-3 gap-3">
        <div className="skel h-24 rounded-2xl" />
        <div className="skel h-24 rounded-2xl" />
        <div className="skel h-24 rounded-2xl" />
      </div>
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
        Connect a channel <ChevronRight className="w-4 h-4" />
      </Link>
    </div>
  )
}
