'use client'

/**
 * Tonight at a glance — top-of-dashboard strip.
 *
 * Answers the busiest felt-need a restaurant owner has when they open
 * the app: "what kind of night am I gonna have?"
 *
 * Three cells, left to right:
 *   1. Weather + temp + tonight's rain chance
 *   2. One-sentence outlook (AI-ish, heuristic-driven)
 *   3. Trend signal (reach or customer-actions delta this week)
 *
 * Hides itself if /api/dashboard/tonight returns nothing useful.
 */

import { useEffect, useState } from 'react'
import { Sun, Cloud, CloudRain, CloudSnow, CloudFog, CloudLightning, CloudSun, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react'

interface TonightData {
  weather: {
    tempF: number
    condition: string
    icon: 'sun' | 'cloud' | 'rain' | 'snow' | 'storm' | 'fog' | 'partly-cloudy'
    rainChance: number
  } | null
  outlook: string
  signal: {
    label: string
    value: string
    up: boolean | null
  } | null
  generatedAt: string
}

const ICON_MAP: Record<NonNullable<TonightData['weather']>['icon'], React.ReactNode> = {
  'sun': <Sun className="w-5 h-5 text-amber-500" />,
  'partly-cloudy': <CloudSun className="w-5 h-5 text-amber-400" />,
  'cloud': <Cloud className="w-5 h-5 text-slate-400" />,
  'rain': <CloudRain className="w-5 h-5 text-sky-500" />,
  'snow': <CloudSnow className="w-5 h-5 text-sky-300" />,
  'storm': <CloudLightning className="w-5 h-5 text-violet-500" />,
  'fog': <CloudFog className="w-5 h-5 text-slate-400" />,
}

export default function TonightStrip({ clientId }: { clientId: string }) {
  const [data, setData] = useState<TonightData | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/dashboard/tonight?clientId=${encodeURIComponent(clientId)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!cancelled && d) setData(d as TonightData)
        if (!cancelled) setLoaded(true)
      })
      .catch(() => { if (!cancelled) setLoaded(true) })
    return () => { cancelled = true }
  }, [clientId])

  if (!loaded) {
    return (
      <div className="rounded-xl p-4 mb-4 bg-white border animate-pulse" style={{ borderColor: 'var(--db-border, #e5e5e5)' }}>
        <div className="h-3 bg-ink-6 rounded w-32 mb-2" />
        <div className="h-4 bg-ink-6 rounded w-3/4" />
      </div>
    )
  }

  // No useful data — hide entirely
  if (!data || (!data.weather && !data.signal)) return null

  return (
    <div
      className="rounded-xl p-4 mb-4 border bg-gradient-to-br from-white via-white to-sky-50/40"
      style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
    >
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--db-ink-3, #888)' }}>
          Tonight at a glance
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr_auto] gap-x-4 gap-y-2 items-center">

        {/* Weather */}
        {data.weather ? (
          <div className="flex items-center gap-2.5">
            <div className="shrink-0">{ICON_MAP[data.weather.icon]}</div>
            <div>
              <div className="text-[16px] font-bold leading-tight" style={{ color: 'var(--db-black, #111)' }}>
                {data.weather.tempF}°
              </div>
              <div className="text-[11px]" style={{ color: 'var(--db-ink-3, #888)' }}>
                {data.weather.condition}
                {data.weather.rainChance >= 30 && (
                  <> · {data.weather.rainChance}% rain</>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div />
        )}

        {/* Outlook (one sentence) */}
        <div className="text-[13px] leading-snug min-w-0" style={{ color: 'var(--db-ink-2, #555)' }}>
          {data.outlook}
        </div>

        {/* Trend signal */}
        {data.signal ? (
          <div className="text-right">
            <div className={`inline-flex items-center gap-1 text-[14px] font-bold ${
              data.signal.up === true ? 'text-emerald-600' :
              data.signal.up === false ? 'text-rose-600' :
              'text-ink-4'
            }`}>
              {data.signal.up === true ? <ArrowUpRight className="w-3.5 h-3.5" /> :
               data.signal.up === false ? <ArrowDownRight className="w-3.5 h-3.5" /> :
               <Minus className="w-3.5 h-3.5" />}
              {data.signal.value}
            </div>
            <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--db-ink-3, #888)' }}>
              {data.signal.label}
            </div>
          </div>
        ) : (
          <div />
        )}
      </div>
    </div>
  )
}
