/**
 * "Tonight at a glance" — the top-of-dashboard strip that answers
 * the busiest felt-need a restaurant owner has when they open the
 * app: "what kind of night am I gonna have?"
 *
 * Combines (in priority order):
 *   1. Weather for tonight (Open-Meteo, no API key required)
 *   2. A trend signal pulled from this week's pulse data
 *   3. A directional outlook ("walk-in friendly", "rain — quieter")
 *
 * No paid integrations needed for v1. Once we have OpenTable/Tock/Resy
 * wired in, we'll add reservation count to the response.
 */

import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPulseData } from '@/lib/dashboard/get-pulse-data'

export const revalidate = 1800 // 30 min cache on Vercel's edge

type WeatherIcon = 'sun' | 'cloud' | 'rain' | 'snow' | 'storm' | 'fog' | 'partly-cloudy'

interface TonightData {
  weather: {
    tempF: number
    condition: string  // "Clear", "Light rain", etc.
    icon: WeatherIcon
    rainChance: number // 0-100
  } | null
  outlook: string // one-sentence directional read
  signal: {
    label: string  // "Reach this week"
    value: string  // "+22%"
    up: boolean | null
  } | null
  /** ISO timestamp; UI uses this for the "Updated 6:30pm" label */
  generatedAt: string
}

function decodeWeatherCode(code: number): { condition: string; icon: WeatherIcon } {
  // Open-Meteo WMO weather codes — collapsed to the 7 we care about
  if (code === 0) return { condition: 'Clear', icon: 'sun' }
  if (code === 1 || code === 2) return { condition: 'Partly cloudy', icon: 'partly-cloudy' }
  if (code === 3) return { condition: 'Overcast', icon: 'cloud' }
  if (code === 45 || code === 48) return { condition: 'Foggy', icon: 'fog' }
  if (code >= 51 && code <= 67) return { condition: 'Rain', icon: 'rain' }
  if (code >= 71 && code <= 86) return { condition: 'Snow', icon: 'snow' }
  if (code >= 80 && code <= 82) return { condition: 'Showers', icon: 'rain' }
  if (code >= 95 && code <= 99) return { condition: 'Thunderstorms', icon: 'storm' }
  return { condition: 'Cloudy', icon: 'cloud' }
}

async function geocode(locationText: string): Promise<{ lat: number; lon: number } | null> {
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(locationText)}&count=1&language=en&format=json`
    const res = await fetch(url, { next: { revalidate: 86400 } }) // cache 24h per location
    if (!res.ok) return null
    const json = await res.json() as { results?: Array<{ latitude: number; longitude: number }> }
    if (!json.results?.[0]) return null
    return { lat: json.results[0].latitude, lon: json.results[0].longitude }
  } catch {
    return null
  }
}

async function fetchWeather(lat: number, lon: number): Promise<TonightData['weather']> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&hourly=precipitation_probability&temperature_unit=fahrenheit&forecast_hours=12&timezone=auto`
    const res = await fetch(url, { next: { revalidate: 1800 } })
    if (!res.ok) return null
    const json = await res.json() as {
      current?: { temperature_2m: number; weather_code: number }
      hourly?: { precipitation_probability: number[] }
    }
    if (!json.current) return null

    // Peak rain chance over the next 12 hours = "is tonight going to be wet"
    const peakRain = Math.max(0, ...(json.hourly?.precipitation_probability ?? [0]))

    const { condition, icon } = decodeWeatherCode(json.current.weather_code)
    return {
      tempF: Math.round(json.current.temperature_2m),
      condition,
      icon,
      rainChance: peakRain,
    }
  } catch {
    return null
  }
}

function composeOutlook(weather: TonightData['weather'], pulseDelta: number | null): string {
  // Heuristic one-liner. Order: weather risk first, then trend, then default.
  if (weather && weather.rainChance >= 60) {
    return `Heavy rain expected — restaurants typically see 15-20% lower walk-ins. Push delivery channels.`
  }
  if (weather && weather.rainChance >= 30) {
    return `Some rain forecast — light dip in walk-ins likely. Solid night for cozy posts.`
  }
  if (weather && weather.condition === 'Clear' && weather.tempF >= 70 && weather.tempF <= 85) {
    return `Clear and ${weather.tempF}° — patio weather. Walk-ins should be strong.`
  }
  if (pulseDelta !== null && pulseDelta >= 15) {
    return `Reach is up ${pulseDelta}% this week — momentum on your side tonight.`
  }
  if (pulseDelta !== null && pulseDelta <= -15) {
    return `Reach is down ${Math.abs(pulseDelta)}% this week — consider boosting tonight's post.`
  }
  return `Standard night ahead. Nothing unusual on the radar.`
}

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })

  const access = await checkClientAccess(clientId)
  if (!access.authorized) {
    const status = access.reason === 'unauthenticated' ? 401 : 403
    return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status })
  }

  const admin = createAdminClient()
  const { data: client } = await admin
    .from('clients')
    .select('location')
    .eq('id', clientId)
    .maybeSingle()

  // Parallel: weather + pulse signal
  const [weather, pulse] = await Promise.all([
    (async () => {
      const locationText = client?.location || 'Seattle'
      const coords = await geocode(locationText)
      if (!coords) return null
      return fetchWeather(coords.lat, coords.lon)
    })(),
    getPulseData(clientId).catch(() => null),
  ])

  // Pull a single trend signal from pulse data (prefer reach, fall back to customers)
  let signal: TonightData['signal'] = null
  let pulseDelta: number | null = null
  if (pulse?.reach.state === 'live' && pulse.reach.delta) {
    const pct = parseInt(pulse.reach.delta.replace(/[^\d-]/g, ''))
    if (!isNaN(pct)) pulseDelta = pct
    signal = {
      label: 'Reach this week',
      value: pulse.reach.delta,
      up: pulse.reach.up ?? null,
    }
  } else if (pulse?.customers.state === 'live' && pulse.customers.delta) {
    const pct = parseInt(pulse.customers.delta.replace(/[^\d-]/g, ''))
    if (!isNaN(pct)) pulseDelta = pct
    signal = {
      label: 'Customer actions this week',
      value: pulse.customers.delta,
      up: pulse.customers.up ?? null,
    }
  }

  const outlook = composeOutlook(weather, pulseDelta)

  const result: TonightData = {
    weather,
    outlook,
    signal,
    generatedAt: new Date().toISOString(),
  }
  return NextResponse.json(result)
}
