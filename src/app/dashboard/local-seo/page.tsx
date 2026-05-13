'use client'

import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { MapPin, Star, TrendingUp, ChevronRight, BarChart3 } from 'lucide-react'
import type { TimeRange, DashboardView } from '@/types/dashboard'
import { getLocalSeoView } from '@/lib/dashboard/get-local-seo-view'
import { getClientLocations } from '@/lib/dashboard/get-client-locations'
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
  const [businessName, setBusinessName] = useState<string>('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadData() {
      if (clientLoading) return
      if (!client?.id) { setLoading(false); return }

      try {
        const [v, locs] = await Promise.all([
          getLocalSeoView(client.id, selectedLocationId),
          getClientLocations(client.id),
        ])
        setView(v)
        setLocations(locs)
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
            href="/dashboard/analytics"
            className="bg-white rounded-xl border border-ink-6 p-4 flex items-center justify-between hover:shadow-sm transition-shadow"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-bg-2 flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-ink-3" />
              </div>
              <div>
                <div className="text-sm font-medium text-ink">Full details</div>
                <div className="text-xs text-ink-4">All GBP metrics + charts</div>
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
      {/* Location selector (hidden when 0-1 locations) */}
      {locations.length > 1 && (
        <div className="flex justify-end pt-6">
          <LocationSelector
            locations={locations}
            selectedLocationId={selectedLocationId}
            onChange={handleLocationChange}
          />
        </div>
      )}

      {/* How your local presence is doing */}
      <div className="db-fade db-d1">
        <StatusBanner
          headline={view.headline}
          businessName={businessName}
          pct={view.pct}
          up={view.up}
        />
      </div>

      {/* Your main number */}
      <div className="db-fade db-d3">
        <HeroMetric ctx={view.ctx} num={view.num} pctFull={view.pctFull} up={view.up} />
      </div>

      {/* Your trend over time */}
      <div className="db-fade db-d4">
        <TrendChart
          data={view.chartData}
          timeRange={timeRange}
          onTimeRangeChange={setTimeRange}
          up={view.up}
          unit={view.unit}
        />
      </div>

      {/* The breakdown */}
      <div className="db-fade db-d5">
        <MetricGrid title={view.bdtitle} metrics={view.metrics} />
      </div>

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

      {/* Local SEO tools */}
      <div className="db-fade db-d7">
        <h2 className="text-[15px] font-bold mb-3" style={{ color: 'var(--db-black)' }}>
          Local SEO tools
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {locations.length > 1 && (
            <Link
              href="/dashboard/local-seo/locations"
              className="bg-white rounded-xl border border-ink-6 p-4 flex items-center justify-between hover:shadow-sm transition-shadow"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-bg-2 flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-ink-3" />
                </div>
                <div>
                  <div className="text-sm font-medium text-ink">Locations</div>
                  <div className="text-xs text-ink-4">{locations.length} locations compared</div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-ink-4" />
            </Link>
          )}
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
            href="/dashboard/local-seo/listing"
            className="bg-white rounded-xl border border-ink-6 p-4 flex items-center justify-between hover:shadow-sm transition-shadow"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-bg-2 flex items-center justify-center">
                <MapPin className="w-5 h-5 text-ink-3" />
              </div>
              <div>
                <div className="text-sm font-medium text-ink">Your listing</div>
                <div className="text-xs text-ink-4">Hours, phone, website, description</div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-ink-4" />
          </Link>
          <Link
            href="/dashboard/analytics"
            className="bg-white rounded-xl border border-ink-6 p-4 flex items-center justify-between hover:shadow-sm transition-shadow"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-bg-2 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-ink-3" />
              </div>
              <div>
                <div className="text-sm font-medium text-ink">Full details</div>
                <div className="text-xs text-ink-4">All GBP metrics + charts</div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-ink-4" />
          </Link>
        </div>
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
