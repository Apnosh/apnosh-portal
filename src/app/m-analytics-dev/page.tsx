/* Dev-only preview of the advanced analytics page, fed with mock
   per-source series shaped like the future getAdvancedMetrics(). Lets us
   verify the design visually without auth. Not linked anywhere; safe to
   delete. Never reachable in production. */

import { notFound } from 'next/navigation'
import '../adv-analytics.css'
import { AdvancedAnalytics, type AdvMetric, type AdvSource } from '@/components/dashboard/advanced-analytics'

export const dynamic = 'force-static'

// deterministic pseudo-random so SSR output is stable
let seed = 11
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// build one source's series: n sub-periods, last `future` are null (frontier)
function series(base: number, n: number, future = 0): { vals: (number | null)[]; prev: (number | null)[] } {
  const gen = (scale: number) => Array.from({ length: n }, (_, i) =>
    i >= n - future ? null : Math.max(0, Math.round(base * scale * (0.6 + rnd() * 0.8))))
  return { vals: gen(1), prev: gen(0.86) }
}

// trailing per-period totals (oldest → newest) with a slight upward drift
function trend(base: number, len: number, periodDays: number): (number | null)[] {
  return Array.from({ length: len }, (_, i) =>
    Math.max(0, Math.round(base * periodDays * (0.6 + rnd() * 0.7) * (0.75 + (i / Math.max(1, len - 1)) * 0.4))))
}

const TREND_LEN: Record<'week' | 'month' | 'year', number> = { week: 8, month: 6, year: 3 }
const PERIOD_DAYS: Record<'week' | 'month' | 'year', number> = { week: 7, month: 30, year: 365 }
const TREND_TICKS: Record<'week' | 'month' | 'year', string[]> = {
  week: ['Apr 19', 'Apr 26', 'May 3', 'May 10', 'May 17', 'May 24', 'May 31', 'Jun 7'],
  month: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
  year: ['2024', '2025', '2026'],
}

function src(key: string, label: string, icon: string, base: number, n: number, future = 0, connected = true, range: 'week' | 'month' | 'year' = 'week'): AdvSource {
  const tLen = TREND_LEN[range]
  if (!connected) {
    const nulls = Array.from({ length: n }, () => null)
    return { key, label, icon, vals: nulls, prev: nulls, trendVals: Array.from({ length: tLen }, () => null), connected: false }
  }
  const s = series(base, n, future)
  return { key, label, icon, vals: s.vals, prev: s.prev, trendVals: trend(base, tLen, PERIOD_DAYS[range]) }
}

function ticks(range: 'week' | 'month' | 'year'): string[] {
  if (range === 'week') return DOW
  if (range === 'year') return MON
  // month: ~30 days, label a handful
  return Array.from({ length: 30 }, (_, i) => (i % 6 === 0 ? `${i + 1}` : ''))
}

// source tuple: [key, label, icon, base, connected?]  (connected defaults true)
type SrcTuple = [string, string, string, number, boolean?]

function metric(key: string, label: string, sub: string, caps: [string, string, string], sources: SrcTuple[]): AdvMetric {
  const mk = (range: 'week' | 'month' | 'year', n: number, future: number, cap: string) => ({
    cap,
    ticks: ticks(range),
    trendTicks: TREND_TICKS[range],
    sources: sources.map(([k, l, ic, base, conn]) => src(k, l, ic, range === 'year' ? base * 22 : range === 'month' ? base : base, n, future, conn ?? true, range)),
  })
  return {
    key, label, sub,
    week: mk('week', 7, 1, caps[0]),
    month: mk('month', 30, 4, caps[1]),
    year: mk('year', 12, 0, caps[2]),
  }
}

// Reputation is a rating, not a sum: average score headline + review counts
// by platform, comparison-style. kind:'rating' tells the component to skip
// the stacked-bar and share views (they don't apply to an average).
function ratingMetric(): AdvMetric {
  const platforms: [string, string, string, number, boolean?][] = [
    ['google', 'Google', 'pin', 9], ['yelp', 'Yelp', 'star', 0, false],
    ['facebook', 'Facebook', 'facebook', 0, false], ['tripadvisor', 'TripAdvisor', 'eye', 0, false],
  ]
  const mk = (range: 'week' | 'month' | 'year', n: number, future: number, cap: string, rating: number, ratingPrev: number) => ({
    cap, ticks: ticks(range), rating, ratingPrev,
    sources: platforms.map(([k, l, ic, base, conn]) => src(k, l, ic, range === 'year' ? base * 10 : range === 'month' ? base * 4 : base, n, future, conn ?? true)),
  })
  return {
    key: 'reputation', label: 'Reputation', sub: 'Average rating and where reviews come from', kind: 'rating',
    week: mk('week', 7, 1, 'This week · Jun 7 – Jun 13', 4.7, 4.6),
    month: mk('month', 30, 4, 'This month · Jun 1 – 30', 4.7, 4.5),
    year: mk('year', 12, 0, 'This year · Jan – Jun', 4.6, 4.4),
  }
}

// Platform-first: every metric's stacked layers are the platforms that
// actually drive that number, so the owner sees where it came from.
const CAPS: [string, string, string] = ['This week · Jun 7 – Jun 13', 'This month · Jun 1 – 30', 'This year · Jan – Jun']

// Every platform that *could* feed each metric is listed. Connected ones
// (Google via GBP, Instagram + Facebook via Meta) show real numbers; the
// rest show "—" + "Not connected" until their integration is wired.
const MOCK: AdvMetric[] = [
  metric('reach', 'Reach', 'Who saw you, across platforms', CAPS,
    [['instagram', 'Instagram', 'instagram', 90], ['facebook', 'Facebook', 'facebook', 55],
     ['google', 'Google', 'pin', 120], ['tiktok', 'TikTok', 'tiktok', 0, false]]),
  metric('engagement', 'Engagement', 'Who reacted to your posts. Likes, comments, shares, saves', CAPS,
    [['instagram', 'Instagram', 'instagram', 80], ['facebook', 'Facebook', 'facebook', 35],
     ['tiktok', 'TikTok', 'tiktok', 0, false]]),
  metric('interactions', 'Interactions', 'Who took a step toward you. Calls, directions, clicks, taps', CAPS,
    [['google', 'Google', 'pin', 18], ['instagram', 'Instagram', 'instagram', 9], ['facebook', 'Facebook', 'facebook', 5],
     ['website', 'Website', 'globe', 0, false], ['tiktok', 'TikTok', 'tiktok', 0, false]]),
  metric('bookings', 'Bookings & orders', 'Tables booked and orders placed, by platform', CAPS,
    [['google', 'Google', 'pin', 6], ['opentable', 'OpenTable', 'calendar', 0, false], ['resy', 'Resy', 'clock', 0, false],
     ['doordash', 'DoorDash', 'bag', 0, false], ['ubereats', 'Uber Eats', 'bag', 0, false], ['direct', 'Direct (site)', 'globe', 0, false]]),
  metric('loyalty', 'Loyalty', 'Regulars you bring back, by channel', CAPS,
    [['email', 'Email', 'message', 0, false], ['sms', 'SMS', 'phone', 0, false]]),
  ratingMetric(),
]

export default function MAnalyticsDevPage() {
  if (process.env.NODE_ENV === 'production') notFound()
  return (
    <div style={{ background: '#fff', minHeight: '100vh' }}>
      <AdvancedAnalytics metrics={MOCK} />
    </div>
  )
}
