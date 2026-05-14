'use client'

import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { MapPin, Star, TrendingUp, ChevronRight, BarChart3, AlertTriangle, Phone, Navigation, Globe, ArrowRight } from 'lucide-react'
import type { TimeRange, DashboardView } from '@/types/dashboard'
import { getLocalSeoView } from '@/lib/dashboard/get-local-seo-view'
import { getClientLocations } from '@/lib/dashboard/get-client-locations'
import { getLocationsScoreboard, type LocationScoreRow } from '@/lib/dashboard/get-locations-scoreboard'
import type { ClientLocation } from '@/lib/dashboard/location-helpers'
import { useClient } from '@/lib/client-context'
import StatusBanner from '@/components/dashboard/status-banner'
import HeroMetric from '@/components/dashboard/hero-metric'
import TrendChart from '@/components/dashboard/trend-chart'
import MetricGrid from '@/components/dashboard/metric-grid'
import InsightCard from '@/components/dashboard/insight-card'
import AMNote from '@/components/dashboard/am-note'
import LocationSelector from '@/components/dashboard/location-selector'

function LocalSeoContent() {
  const { client, loading: clientLoading } = useClient()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const selectedLocationId = searchParams.get('location')

  const [timeRange, setTimeRange] = useState<TimeRange>('1M')
  const [view, setView] = useState<DashboardView | null>(null)
  const [locations, setLocations] = useState<ClientLocation[]>([])
  const [scoreboard, setScoreboard] = useState<LocationScoreRow[]>([])
  const [businessName, setBusinessName] = useState<string>('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadData() {
      if (clientLoading) return
      if (!client?.id) { setLoading(false); return }

      try {
        const [v, locs, sc] = await Promise.all([
          getLocalSeoView(client.id, selectedLocationId),
          getClientLocations(client.id),
          /* Per-location scoreboard powers the "By location" panel.
             Best-effort — single-location clients ignore it. */
          getLocationsScoreboard(client.id).catch(() => [] as LocationScoreRow[]),
        ])
        setView(v)
        setLocations(locs)
        setScoreboard(sc)
        setBusinessName(client.name ?? '')
      } catch (err) {
        console.error('Failed to load local-seo view', err)
        setView(null)
      }
      setLoading(false)
    }
    loadData()
  }, [client?.id, client?.name, clientLoading, selectedLocationId])

  function handleLocationChange(locId: string | null) {
    const params = new URLSearchParams(searchParams.toString())
    if (locId) params.set('location', locId)
    else params.delete('location')
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname)
  }

  if (loading) {
    return (
      <div className="max-w-[840px] mx-auto px-8 max-sm:px-4 pt-12 text-center">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-ink-6 rounded w-48 mx-auto" />
          <div className="h-12 bg-ink-6 rounded w-32 mx-auto" />
          <div className="h-64 bg-ink-6 rounded" />
        </div>
      </div>
    )
  }

  // No data yet (GBP not connected or still syncing)
  if (!view || view.num === '---') {
    return (
      <div
        className="max-w-[840px] mx-auto px-8 max-sm:px-4 pb-20"
        style={{ fontFamily: "var(--font-dm-sans, 'DM Sans'), var(--font-inter, 'Inter'), -apple-system, system-ui, sans-serif" }}
      >
        {locations.length > 1 && (
          <div className="flex justify-end pt-6">
            <LocationSelector
              locations={locations}
              selectedLocationId={selectedLocationId}
              onChange={handleLocationChange}
            />
          </div>
        )}
        <div className="text-center py-20">
          <div
            className="w-16 h-16 rounded-full mx-auto mb-6 flex items-center justify-center"
            style={{ background: 'rgba(74, 189, 152, 0.1)' }}
          >
            <MapPin className="w-7 h-7" style={{ color: '#4abd98' }} />
          </div>
          <h2 className="text-[20px] font-bold mb-2" style={{ color: 'var(--db-black, #111)' }}>
            Connect Google Business Profile
          </h2>
          <p className="text-[14px] max-w-sm mx-auto mb-8" style={{ color: 'var(--db-ink-3, #888)' }}>
            Once your Google Business Profile is connected, directions, calls, website clicks, and review data will show up here.
          </p>
          <Link
            href="/dashboard/connected-accounts"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white"
            style={{ background: '#4abd98' }}
          >
            Connect accounts
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-10">
          <Link
            href="/dashboard/local-seo/reviews"
            className="bg-white rounded-xl border border-ink-6 p-4 flex items-center justify-between hover:shadow-sm transition-shadow"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-bg-2 flex items-center justify-center">
                <Star className="w-5 h-5 text-ink-3" />
              </div>
              <div>
                <div className="text-sm font-medium text-ink">Reviews</div>
                <div className="text-xs text-ink-4">Google, Yelp, and more</div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-ink-4" />
          </Link>
          <Link
            href="/dashboard/local-seo/analytics"
            className="bg-white rounded-xl border border-ink-6 p-4 flex items-center justify-between hover:shadow-sm transition-shadow"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-bg-2 flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-ink-3" />
              </div>
              <div>
                <div className="text-sm font-medium text-ink">Full analytics</div>
                <div className="text-xs text-ink-4">Daily metrics, sparklines, CSV export</div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-ink-4" />
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div
      className="max-w-[840px] mx-auto px-8 max-sm:px-4 pb-20 max-sm:pb-16"
      style={{ fontFamily: "var(--font-dm-sans, 'DM Sans'), var(--font-inter, 'Inter'), -apple-system, system-ui, sans-serif" }}
    >
      {/* Location-aware header — for multi-location clients, makes it
         obvious whether they're seeing aggregated or single-location data,
         and the picker is right next to the brand so it's discoverable. */}
      {locations.length > 1 && (
        <div className="flex items-end justify-between pt-6 mb-4 gap-3 flex-wrap">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">
              Local SEO
            </p>
            <h1 className="text-[26px] font-semibold text-ink leading-tight mt-1">
              {businessName || 'Your business'}
            </h1>
            <p className="text-[12.5px] text-ink-3 mt-0.5">
              {selectedLocationId
                ? `Viewing one of ${locations.length} locations`
                : `Across ${locations.length} locations`}
            </p>
          </div>
          <LocationSelector
            locations={locations}
            selectedLocationId={selectedLocationId}
            onChange={handleLocationChange}
          />
        </div>
      )}

      {(() => {
        const r = view.byRange?.[timeRange]
        const num = r?.num ?? view.num
        const pct = r?.pct ?? view.pct
        const pctFull = r?.pctFull ?? view.pctFull
        const up = r?.up ?? view.up
        const metrics = r?.metrics ?? view.metrics
        return (
          <>
            <div className="db-fade db-d1">
              <StatusBanner headline={view.headline} businessName={businessName} pct={pct} up={up} />
            </div>
            <div className="db-fade db-d3">
              <HeroMetric ctx={view.ctx} num={num} pctFull={pctFull} up={up} />
            </div>
            <div className="db-fade db-d4">
              <TrendChart
                data={view.chartData}
                timeRange={timeRange}
                onTimeRangeChange={setTimeRange}
                up={up}
                unit={view.unit}
              />
            </div>
            <div className="db-fade db-d5">
              <MetricGrid title={view.bdtitle} metrics={metrics} />
            </div>
          </>
        )
      })()}

      {/* Per-location panel — only for multi-location clients viewing all.
         Sorted by total interactions; shows top performers and easy-to-spot
         underperformers without making the owner click into Locations tab. */}
      {locations.length > 1 && !selectedLocationId && scoreboard.length > 0 && (
        <div className="db-fade db-d5 pb-8 mb-8" style={{ borderBottom: '1px solid var(--db-border)' }}>
          <div className="flex items-end justify-between mb-3">
            <h2 className="text-[15px] font-bold" style={{ color: 'var(--db-black)' }}>
              By location
            </h2>
            <Link
              href="/dashboard/local-seo/locations"
              className="text-[12px] font-medium text-brand-dark hover:text-brand"
            >
              See all →
            </Link>
          </div>
          <LocationScoreboard rows={scoreboard} onLocationClick={handleLocationChange} />
        </div>
      )}

      {/* Needs attention — surface real issues across the linked listings.
         Zero-activity locations, missing phone numbers, listings without
         categories all show up here as actionable items. */}
      <NeedsAttentionPanel
        scoreboard={scoreboard}
        isMultiLocation={locations.length > 1}
      />

      {/* What we noticed */}
      {view.insights.length > 0 && (
        <div className="db-fade db-d6 pb-8 mb-8" style={{ borderBottom: '1px solid var(--db-border)' }}>
          <h2 className="text-[15px] font-bold mb-3" style={{ color: 'var(--db-black)' }}>
            What we noticed
          </h2>
          <div className="flex flex-col gap-2.5">
            {view.insights.map((ins, i) => (
              <InsightCard key={i} icon={ins.icon} title={ins.title} subtitle={ins.subtitle} />
            ))}
          </div>
        </div>
      )}

      {/* From your account manager */}
      {view.am.note && (
        <div className="db-fade db-d7 pb-8 mb-8" style={{ borderBottom: '1px solid var(--db-border)' }}>
          <AMNote
            name={view.am.name}
            initials={view.am.initials}
            role={view.am.role}
            note={view.am.note}
          />
        </div>
      )}

      {/* The "tools" tile group is gone — the sticky LocalSeoNav at the top
         of every page already exposes Overview / Reviews / Your listing /
         Locations, so duplicating them at the bottom is just noise.
         Keeping a lone Full details deep-link until the analytics page
         is folded in. */}
      <div className="db-fade db-d7">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Link
            href="/dashboard/local-seo/analytics"
            className="bg-white rounded-xl border border-ink-6 p-4 flex items-center justify-between hover:shadow-sm transition-shadow"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-bg-2 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-ink-3" />
              </div>
              <div>
                <div className="text-sm font-medium text-ink">Full analytics</div>
                <div className="text-xs text-ink-4">Daily metrics, sparklines, CSV export</div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-ink-4" />
          </Link>
        </div>
      </div>
    </div>
  )
}

/* Compact per-location scoreboard for the Overview. Always shows the
   top performers first so the owner sees where the wins are; click any
   row to switch the page to that location's view (uses the existing
   ?location=... URL pattern that the location selector already drives). */
function LocationScoreboard({ rows, onLocationClick }: {
  rows: LocationScoreRow[]
  onLocationClick: (id: string | null) => void
}) {
  const sorted = [...rows].sort((a, b) => b.interactions - a.interactions)
  const top = sorted[0]

  return (
    <div className="space-y-2">
      {sorted.map((row, i) => {
        const isTop = i === 0 && top && top.interactions > 0
        const cityState = [row.location.city, row.location.state].filter(Boolean).join(', ')
        const share = top && top.interactions > 0 ? row.interactions / top.interactions : 0
        return (
          <button
            key={row.location.id}
            onClick={() => onLocationClick(row.location.id)}
            className="w-full text-left bg-white rounded-xl border border-ink-6 hover:border-ink-4 hover:shadow-sm p-3 flex items-center gap-3 transition-all"
          >
            <div className="w-9 h-9 rounded-lg bg-bg-2 flex items-center justify-center flex-shrink-0">
              <MapPin className="w-4 h-4 text-ink-3" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-[13px] font-semibold text-ink truncate">{row.location.location_name}</p>
                {isTop && (
                  <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                    Top
                  </span>
                )}
                {row.location.is_primary && (
                  <span className="text-[9px] font-bold uppercase tracking-wider text-ink-3 bg-ink-7 px-1.5 py-0.5 rounded">
                    Primary
                  </span>
                )}
              </div>
              <p className="text-[11px] text-ink-4 truncate">{cityState || '—'}</p>
              {/* Bar showing this location's share of total interactions */}
              <div className="mt-1.5 h-1 bg-ink-7 rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand rounded-full transition-all"
                  style={{ width: `${share * 100}%` }}
                />
              </div>
            </div>
            <div className="flex-shrink-0 text-right">
              <p className="text-[14px] font-semibold text-ink tabular-nums">
                {row.interactions.toLocaleString()}
              </p>
              <p className="text-[10px] text-ink-4">interactions</p>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-ink-4 flex-shrink-0" />
          </button>
        )
      })}
    </div>
  )
}

/* Surfaces concrete things the owner should look at — zero-activity
   locations (probably misconfigured), missing phone numbers, etc.
   Hidden when there's nothing actionable. */
function NeedsAttentionPanel({
  scoreboard, isMultiLocation,
}: {
  scoreboard: LocationScoreRow[]
  isMultiLocation: boolean
}) {
  const issues: Array<{ icon: React.ComponentType<{ className?: string }>; title: string; subtitle: string; href?: string }> = []

  if (isMultiLocation) {
    const zeroActivity = scoreboard.filter(r => r.interactions === 0 && (r.location.location_name ?? '').length > 0)
    if (zeroActivity.length > 0 && zeroActivity.length < scoreboard.length) {
      issues.push({
        icon: AlertTriangle,
        title: `${zeroActivity.length} location${zeroActivity.length === 1 ? '' : 's'} with no activity this month`,
        subtitle: zeroActivity.slice(0, 3).map(r => r.location.location_name).join(', ')
          + (zeroActivity.length > 3 ? `, +${zeroActivity.length - 3} more` : '')
          + ' — could be a verification issue or wrong listing connected.',
        href: '/dashboard/local-seo/locations',
      })
    }

    /* Calls of 0 with non-zero directions means the listing probably
       has a missing or wrong phone number. */
    const phoneMissing = scoreboard.filter(r => r.directions > 5 && r.calls === 0)
    if (phoneMissing.length > 0) {
      issues.push({
        icon: Phone,
        title: `${phoneMissing.length} location${phoneMissing.length === 1 ? '' : 's'} getting directions but 0 calls`,
        subtitle: 'Check that the phone number on Google matches what customers should call.',
        href: '/dashboard/local-seo/listing',
      })
    }
  }

  if (issues.length === 0) return null

  return (
    <div className="db-fade db-d5 pb-8 mb-8" style={{ borderBottom: '1px solid var(--db-border)' }}>
      <h2 className="text-[15px] font-bold mb-3" style={{ color: 'var(--db-black)' }}>
        Needs attention
      </h2>
      <div className="flex flex-col gap-2">
        {issues.map((issue, i) => {
          const Icon = issue.icon
          const body = (
            <div className="bg-amber-50/70 rounded-xl border border-amber-200 p-3 flex items-start gap-3 hover:bg-amber-50 transition-colors">
              <Icon className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-amber-900">{issue.title}</p>
                <p className="text-[11.5px] text-amber-900/80 mt-0.5 leading-relaxed">{issue.subtitle}</p>
              </div>
              {issue.href && <ArrowRight className="w-3.5 h-3.5 text-amber-700 flex-shrink-0 mt-0.5" />}
            </div>
          )
          return issue.href ? (
            <Link key={i} href={issue.href}>{body}</Link>
          ) : (
            <div key={i}>{body}</div>
          )
        })}
      </div>
    </div>
  )
}

export default function LocalSeoOverviewPage() {
  return (
    <Suspense fallback={
      <div className="max-w-[840px] mx-auto px-8 pt-12 text-center">
        <div className="animate-pulse h-12 bg-ink-6 rounded w-48 mx-auto" />
      </div>
    }>
      <LocalSeoContent />
    </Suspense>
  )
}
