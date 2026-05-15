'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  MapPin, Navigation, Phone, Globe, Star, TrendingUp, ChevronRight,
} from 'lucide-react'
import { useClient } from '@/lib/client-context'
import { getLocationsScoreboard, type LocationScoreRow } from '@/lib/dashboard/get-locations-scoreboard'
import { locationLabel } from '@/lib/dashboard/location-helpers'

function fmtNum(n: number): string {
  if (n >= 10000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  if (n >= 1000) return n.toLocaleString('en-US')
  return n.toString()
}

export default function LocationsScoreboardPage() {
  const { client, loading: clientLoading } = useClient()
  const [rows, setRows] = useState<LocationScoreRow[]>([])
  const [loading, setLoading] = useState(true)

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const load = useCallback(async () => {
    if (!client?.id) { setLoading(false); return }
    try {
      const data = await getLocationsScoreboard(client.id)
      setRows(data)
    } catch (err) {
      console.error('Failed to load locations scoreboard', err)
    }
    setLoading(false)
  }, [client?.id])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  if (clientLoading || loading) {
    return (
      <div className="max-w-5xl mx-auto space-y-4 animate-pulse">
        <div className="h-8 w-48 bg-ink-6 rounded" />
        <div className="h-64 bg-white rounded-xl border border-ink-6" />
      </div>
    )
  }

  const hasAnyData = rows.some(r => r.interactions > 0 || r.new_reviews > 0)

  return (
    <div className="max-w-5xl mx-auto px-4 lg:px-6 pt-6 pb-20 space-y-5">
      {/* Header -- matches the portal-wide page-title pattern */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">
          Local SEO
        </p>
        <h1 className="text-[26px] font-semibold text-ink leading-tight mt-1 flex items-center gap-2">
          <MapPin className="w-6 h-6 text-ink-4" />
          Locations
        </h1>
        <p className="text-ink-3 text-sm mt-0.5">
          This month&apos;s performance for every location you run.
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState message="No locations added yet" hint="Your AM can add locations from the admin console." />
      ) : !hasAnyData ? (
        <EmptyState message="No data yet this month" hint="Directions, calls, clicks, and new reviews will show up here once data syncs." />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-white rounded-xl border border-ink-6 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-bg-2 text-ink-3">
                <tr>
                  <th className="text-left py-3 px-4 font-medium">Location</th>
                  <th className="text-right py-3 px-4 font-medium">Directions</th>
                  <th className="text-right py-3 px-4 font-medium">Calls</th>
                  <th className="text-right py-3 px-4 font-medium">Site clicks</th>
                  <th className="text-right py-3 px-4 font-medium">New reviews</th>
                  <th className="text-right py-3 px-4 font-medium">Avg rating</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.location.id} className="border-t border-ink-6 hover:bg-bg-2/50">
                    <td className="py-3 px-4">
                      <Link
                        href={`/dashboard/local-seo?location=${row.location.id}`}
                        className="flex items-center gap-3 text-ink hover:text-brand-dark"
                      >
                        <div className="min-w-0">
                          <div className="font-medium truncate">{locationLabel(row.location)}</div>
                          {row.location.city && row.location.state && (
                            <div className="text-[11px] text-ink-4 truncate">
                              {row.location.city}, {row.location.state}
                              {row.location.is_primary ? ' · primary' : ''}
                            </div>
                          )}
                        </div>
                      </Link>
                    </td>
                    <td className="py-3 px-4 text-right font-medium tabular-nums">{fmtNum(row.directions)}</td>
                    <td className="py-3 px-4 text-right font-medium tabular-nums">{fmtNum(row.calls)}</td>
                    <td className="py-3 px-4 text-right font-medium tabular-nums">{fmtNum(row.website_clicks)}</td>
                    <td className="py-3 px-4 text-right font-medium tabular-nums">{fmtNum(row.new_reviews)}</td>
                    <td className="py-3 px-4 text-right font-medium tabular-nums">
                      {row.avg_rating != null ? (
                        <span className="inline-flex items-center gap-1">
                          <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                          {row.avg_rating.toFixed(1)}
                        </span>
                      ) : (
                        <span className="text-ink-4">—</span>
                      )}
                    </td>
                    <td className="pr-4 text-ink-4">
                      <Link href={`/dashboard/local-seo?location=${row.location.id}`} aria-label="View">
                        <ChevronRight className="w-4 h-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {rows.map(row => (
              <Link
                key={row.location.id}
                href={`/dashboard/local-seo?location=${row.location.id}`}
                className="block bg-white rounded-xl border border-ink-6 p-4 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="min-w-0">
                    <div className="font-medium text-ink truncate">{locationLabel(row.location)}</div>
                    {row.location.city && row.location.state && (
                      <div className="text-[11px] text-ink-4 truncate">
                        {row.location.city}, {row.location.state}
                        {row.location.is_primary ? ' · primary' : ''}
                      </div>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-ink-4 flex-shrink-0 mt-0.5" />
                </div>
                <div className="grid grid-cols-4 gap-2 text-[11px]">
                  <StatTile icon={Navigation} value={row.directions} label="Directions" />
                  <StatTile icon={Phone} value={row.calls} label="Calls" />
                  <StatTile icon={Globe} value={row.website_clicks} label="Clicks" />
                  <StatTile
                    icon={Star}
                    value={row.new_reviews}
                    label={row.avg_rating != null ? `Reviews · ${row.avg_rating.toFixed(1)}★` : 'Reviews'}
                  />
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      {/* Footer: current month context */}
      <p className="text-[11px] text-ink-4 text-center">
        Showing {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} month-to-date.
      </p>
    </div>
  )
}

function EmptyState({ message, hint }: { message: string; hint: string }) {
  return (
    <div className="bg-white rounded-xl border border-ink-6 p-12 text-center">
      <TrendingUp className="w-6 h-6 text-ink-4 mx-auto mb-3" />
      <p className="text-sm font-medium text-ink-2">{message}</p>
      <p className="text-xs text-ink-4 mt-1 max-w-sm mx-auto">{hint}</p>
    </div>
  )
}

function StatTile({
  icon: Icon, value, label,
}: {
  icon: typeof MapPin
  value: number
  label: string
}) {
  return (
    <div className="bg-bg-2 rounded-lg p-2">
      <div className="flex items-center gap-1 mb-0.5">
        <Icon className="w-3 h-3 text-ink-4" />
        <span className="text-ink-4">{label}</span>
      </div>
      <div className="text-sm font-semibold text-ink tabular-nums">{fmtNum(value)}</div>
    </div>
  )
}
