/**
 * AI Analysis Service for GBP Performance Data
 * Ported from Lovable analytics dashboard, adapted for Next.js API routes
 */
import type { GBPMonthlyData, AiAnalysis } from '@/types/database'
import { formatMonth } from '@/lib/gbp-data'

/* ═══ Helpers ═══ */
const totalInt = (d: GBPMonthlyData) => (d.calls ?? 0) + (d.bookings ?? 0) + (d.directions ?? 0) + (d.website_clicks ?? 0)
const totalViews = (d: GBPMonthlyData) => (d.search_mobile ?? 0) + (d.search_desktop ?? 0) + (d.maps_mobile ?? 0) + (d.maps_desktop ?? 0)
function sumMetric(data: GBPMonthlyData[], fn: (d: GBPMonthlyData) => number) { return data.reduce((s, d) => s + fn(d), 0) }
function pct(cur: number, prev: number): number | string { if (prev === 0) return cur > 0 ? 100 : 'N/A'; return Math.round(((cur - prev) / prev) * 100) }

function getCurrentPeriod(sorted: GBPMonthlyData[], period: string): GBPMonthlyData[] {
  if (period === 'all') return sorted
  const n = parseInt(period)
  return sorted.slice(-n)
}
function getPreviousPeriod(sorted: GBPMonthlyData[], period: string): GBPMonthlyData[] | null {
  if (period === 'all') return null
  const n = parseInt(period)
  const start = sorted.length - n * 2
  const end = sorted.length - n
  if (start < 0) return null
  return sorted.slice(start, end)
}
function getLastYearPeriod(sorted: GBPMonthlyData[], current: GBPMonthlyData[]): GBPMonthlyData[] | null {
  if (!current.length) return null
  const matched = current.map(d => sorted.find(r => r.month === d.month && r.year === d.year - 1)).filter(Boolean) as GBPMonthlyData[]
  return matched.length > 0 ? matched : null
}

const PERIOD_LABELS: Record<string, string> = { '1': 'This Month', '3': 'Last 3 Months', '6': 'Last 6 Months', 'all': 'Full History' }

/* ═══ Cache ═══ */
const analysisCache = new Map<string, AiAnalysis>()

function getCacheKey(businessId: string, period: string, latestMonth: string) {
  return `${businessId}-${period}-${latestMonth}`
}

export function clearAnalysisCache(businessId?: string) {
  if (!businessId) { analysisCache.clear(); return }
  for (const key of analysisCache.keys()) {
    if (key.startsWith(businessId)) analysisCache.delete(key)
  }
}

export function getCachedAnalysis(businessId: string, period: string, latestMonth: string): AiAnalysis | null {
  return analysisCache.get(getCacheKey(businessId, period, latestMonth)) ?? null
}

/* ═══ Build prompt payload ═══ */
export function buildAnalysisPayload({
  businessName,
  agencyName,
  period,
  sortedAsc,
}: {
  businessName: string
  agencyName: string
  period: string
  sortedAsc: GBPMonthlyData[]
}) {
  const currentPeriod = getCurrentPeriod(sortedAsc, period)
  const prevPeriod = getPreviousPeriod(sortedAsc, period)
  const lastYearPeriod = getLastYearPeriod(sortedAsc, currentPeriod)

  const curInt = sumMetric(currentPeriod, totalInt)
  const prevInt = prevPeriod ? sumMetric(prevPeriod, totalInt) : null
  const yoyInt = lastYearPeriod ? sumMetric(lastYearPeriod, totalInt) : null

  let peakVal = 0, peakD = sortedAsc[0]
  sortedAsc.forEach(d => { const v = totalInt(d); if (v > peakVal) { peakVal = v; peakD = d } })

  const last3 = sortedAsc.slice(-3)
  const prior3 = sortedAsc.length >= 6 ? sortedAsc.slice(-6, -3) : []

  return {
    clientName: businessName,
    agencyName,
    period: { label: PERIOD_LABELS[period] || period },
    calculatedMetrics: {
      totalInteractions: curInt,
      vsPrevious: prevInt !== null ? pct(curInt, prevInt) : 'N/A',
      vsLastYear: yoyInt !== null ? pct(curInt, yoyInt) : 'N/A',
      mapsImpressions: sumMetric(currentPeriod, d => (d.maps_mobile ?? 0) + (d.maps_desktop ?? 0)),
      mapsVsPrevious: prevPeriod ? pct(sumMetric(currentPeriod, d => (d.maps_mobile ?? 0) + (d.maps_desktop ?? 0)), sumMetric(prevPeriod, d => (d.maps_mobile ?? 0) + (d.maps_desktop ?? 0))) : 'N/A',
      searchImpressions: sumMetric(currentPeriod, d => (d.search_mobile ?? 0) + (d.search_desktop ?? 0)),
      searchVsPrevious: prevPeriod ? pct(sumMetric(currentPeriod, d => (d.search_mobile ?? 0) + (d.search_desktop ?? 0)), sumMetric(prevPeriod, d => (d.search_mobile ?? 0) + (d.search_desktop ?? 0))) : 'N/A',
      websiteClicks: sumMetric(currentPeriod, d => d.website_clicks ?? 0),
      websiteVsPrevious: prevPeriod ? pct(sumMetric(currentPeriod, d => d.website_clicks ?? 0), sumMetric(prevPeriod, d => d.website_clicks ?? 0)) : 'N/A',
      calls: sumMetric(currentPeriod, d => d.calls ?? 0),
      callsVsPrevious: prevPeriod ? pct(sumMetric(currentPeriod, d => d.calls ?? 0), sumMetric(prevPeriod, d => d.calls ?? 0)) : 'N/A',
      directions: sumMetric(currentPeriod, d => d.directions ?? 0),
      directionsVsPrevious: prevPeriod ? pct(sumMetric(currentPeriod, d => d.directions ?? 0), sumMetric(prevPeriod, d => d.directions ?? 0)) : 'N/A',
      bookings: sumMetric(currentPeriod, d => d.bookings ?? 0),
      bookingsVsPrevious: prevPeriod ? pct(sumMetric(currentPeriod, d => d.bookings ?? 0), sumMetric(prevPeriod, d => d.bookings ?? 0)) : 'N/A',
      foodOrders: sumMetric(currentPeriod, d => d.food_orders ?? 0),
      peakMonth: formatMonth(peakD.month, peakD.year),
      peakValue: peakVal,
      avg3Month: last3.length ? Math.round(sumMetric(last3, totalInt) / last3.length) : 0,
      prevAvg3Month: prior3.length ? Math.round(sumMetric(prior3, totalInt) / prior3.length) : 0,
      trend: totalInt(sortedAsc[sortedAsc.length - 1]) >= totalInt(sortedAsc[0]) ? 'upward' : 'downward',
    },
    previousPeriodData: prevPeriod?.map(d => ({ month: d.month, year: d.year, interactions: totalInt(d), views: totalViews(d), calls: d.calls, directions: d.directions, websiteClicks: d.website_clicks, bookings: d.bookings })) || null,
    lastYearPeriodData: lastYearPeriod?.map(d => ({ month: d.month, year: d.year, interactions: totalInt(d), views: totalViews(d), calls: d.calls, directions: d.directions, websiteClicks: d.website_clicks, bookings: d.bookings })) || null,
    allHistoricalData: sortedAsc.map(d => ({ month: d.month, year: d.year, interactions: totalInt(d), views: totalViews(d), maps: (d.maps_mobile ?? 0) + (d.maps_desktop ?? 0), search: (d.search_mobile ?? 0) + (d.search_desktop ?? 0), calls: d.calls, directions: d.directions, websiteClicks: d.website_clicks, bookings: d.bookings, foodOrders: d.food_orders })),
  }
}

/* ═══ Fetch analysis from API route ═══ */
export async function fetchAiAnalysis({
  businessId,
  businessName,
  agencyName,
  period,
  sortedAsc,
}: {
  businessId: string
  businessName: string
  agencyName: string
  period: string
  sortedAsc: GBPMonthlyData[]
}): Promise<AiAnalysis | null> {
  if (sortedAsc.length < 2) return null

  const latest = sortedAsc[sortedAsc.length - 1]
  const latestMonth = `${latest.year}-${latest.month}`
  const key = getCacheKey(businessId, period, latestMonth)

  if (analysisCache.has(key)) return analysisCache.get(key)!

  const payload = buildAnalysisPayload({ businessName, agencyName, period, sortedAsc })

  try {
    const res = await fetch('/api/ai/analyze-gbp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      console.error('AI analysis error:', res.status)
      return null
    }

    const { analysis } = await res.json()
    if (analysis) analysisCache.set(key, analysis)
    return analysis as AiAnalysis
  } catch (err) {
    console.error('AI analysis fetch error:', err)
    return null
  }
}
