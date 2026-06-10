/* Dev-only preview of the advanced analytics page, fed with mock
   per-source series shaped like the future getAdvancedMetrics(). Lets us
   verify the design visually without auth. Not linked anywhere; safe to
   delete. Never reachable in production. */

import { notFound } from 'next/navigation'
import '../adv-analytics.css'
import { AdvancedAnalytics, type AdvMetric, type AdvPeriod, type AdvSource } from '@/components/dashboard/advanced-analytics'

export const dynamic = 'force-static'

// deterministic pseudo-random so SSR output is stable
let seed = 11
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

type Range = 'week' | 'month' | 'year'

// how many period instances trail behind (incl. current) on the trend line
const TREND_LEN: Record<Range, number> = { week: 8, month: 6, year: 3 }
// sub-periods (bars) inside one instance
const N_COLS: Record<Range, number> = { week: 7, month: 30, year: 12 }
// trailing future sub-periods on the *current* instance (the live frontier)
const FUTURE: Record<Range, number> = { week: 1, month: 4, year: 0 }

// short label per instance dot (oldest → newest), one row per range
const TREND_TICKS: Record<Range, string[]> = {
  week: ['Apr 19', 'Apr 26', 'May 3', 'May 10', 'May 17', 'May 24', 'May 31', 'Jun 7'],
  month: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
  year: ['2024', '2025', '2026'],
}

// caption for the headline, per instance (current / one-back / older)
function capFor(range: Range, p: number, len: number): string {
  const cur = range === 'week' ? 'This week · Jun 7 – Jun 13' : range === 'month' ? 'This month · Jun 1 – 30' : 'This year · Jan – Jun'
  if (p === len - 1) return cur
  const label = TREND_TICKS[range][p] ?? ''
  if (range === 'week') return `Week of ${label}`
  if (range === 'month') return `${label} 2026`
  return label
}

// axis ticks under the bars
function ticks(range: Range): string[] {
  if (range === 'week') return DOW
  if (range === 'year') return MON
  return Array.from({ length: 30 }, (_, i) => (i % 6 === 0 ? `${i + 1}` : ''))
}

// one source's daily series across n sub-periods; last `future` are null
function daySeries(base: number, n: number, future: number): (number | null)[] {
  return Array.from({ length: n }, (_, i) =>
    i >= n - future ? null : Math.max(0, Math.round(base * (0.6 + rnd() * 0.8))))
}

// source tuple: [key, label, icon, base, connected?]  (connected defaults true)
type SrcTuple = [string, string, string, number, boolean?]

// build every instance of one range as a full AdvPeriod (oldest → newest)
function buildRange(range: Range, sources: SrcTuple[]): AdvPeriod[] {
  const len = TREND_LEN[range]
  const n = N_COLS[range]
  const tk = ticks(range)
  const out: AdvPeriod[] = []
  for (let p = 0; p < len; p++) {
    const isCurrent = p === len - 1
    const future = isCurrent ? FUTURE[range] : 0
    // slight upward drift so newer periods read a touch higher
    const drift = 0.75 + (p / Math.max(1, len - 1)) * 0.4
    const srcs: AdvSource[] = sources.map(([k, l, ic, base, conn]) => {
      if (conn === false) {
        const nulls = Array.from({ length: n }, () => null)
        return { key: k, label: l, icon: ic, vals: nulls, prev: nulls, connected: false }
      }
      const b = (range === 'year' ? base * 22 : base) * drift
      return { key: k, label: l, icon: ic, vals: daySeries(b, n, future), prev: daySeries(b * 0.86, n, 0) }
    })
    out.push({ cap: capFor(range, p, len), ticks: tk, sources: srcs, trendLabel: TREND_TICKS[range][p] ?? '' })
  }
  return out
}

function metric(key: string, label: string, sub: string, sources: SrcTuple[]): AdvMetric {
  return {
    key, label, sub,
    week: buildRange('week', sources),
    month: buildRange('month', sources),
    year: buildRange('year', sources),
  }
}

// Reputation is a rating, not a sum: average score headline + review counts
// by platform, comparison-style. kind:'rating' tells the component to skip
// the stacked-bar and share views (they don't apply to an average).
function ratingMetric(): AdvMetric {
  const platforms: SrcTuple[] = [
    ['google', 'Google', 'pin', 9], ['yelp', 'Yelp', 'star', 0, false],
    ['facebook', 'Facebook', 'facebook', 0, false], ['tripadvisor', 'TripAdvisor', 'eye', 0, false],
  ]
  // average score per instance (oldest → newest), gently improving
  const RATING: Record<Range, number[]> = {
    week: [4.4, 4.5, 4.5, 4.6, 4.6, 4.6, 4.6, 4.7],
    month: [4.3, 4.4, 4.5, 4.5, 4.6, 4.7],
    year: [4.4, 4.5, 4.6],
  }
  const build = (range: Range): AdvPeriod[] => {
    const base = buildRange(range, platforms)
    const r = RATING[range]
    return base.map((inst, p) => ({
      ...inst,
      rating: r[p] ?? 0,
      ratingPrev: r[p - 1] ?? (r[p] ?? 0) - 0.1,
    }))
  }
  return {
    key: 'reputation', label: 'Reputation', sub: 'Average rating and where reviews come from', kind: 'rating',
    week: build('week'), month: build('month'), year: build('year'),
  }
}

// Platform-first: every metric's stacked layers are the platforms that
// actually drive that number, so the owner sees where it came from.
// Connected ones (Google via GBP, Instagram + Facebook via Meta) show real
// numbers; the rest show "—" + "Not connected" until their integration lands.
const MOCK: AdvMetric[] = [
  metric('reach', 'Reach', 'Who saw you, across platforms',
    [['instagram', 'Instagram', 'instagram', 90], ['facebook', 'Facebook', 'facebook', 55],
     ['google', 'Google', 'pin', 120], ['tiktok', 'TikTok', 'tiktok', 0, false]]),
  metric('engagement', 'Engagement', 'Who reacted to your posts. Likes, comments, shares, saves',
    [['instagram', 'Instagram', 'instagram', 80], ['facebook', 'Facebook', 'facebook', 35],
     ['tiktok', 'TikTok', 'tiktok', 0, false]]),
  metric('interactions', 'Interactions', 'Who took a step toward you. Calls, directions, clicks, taps',
    [['google', 'Google', 'pin', 18], ['instagram', 'Instagram', 'instagram', 9], ['facebook', 'Facebook', 'facebook', 5],
     ['website', 'Website', 'globe', 0, false], ['tiktok', 'TikTok', 'tiktok', 0, false]]),
  metric('bookings', 'Bookings & orders', 'Tables booked and orders placed, by platform',
    [['google', 'Google', 'pin', 6], ['opentable', 'OpenTable', 'calendar', 0, false], ['resy', 'Resy', 'clock', 0, false],
     ['doordash', 'DoorDash', 'bag', 0, false], ['ubereats', 'Uber Eats', 'bag', 0, false], ['direct', 'Direct (site)', 'globe', 0, false]]),
  metric('loyalty', 'Loyalty', 'Regulars you bring back, by channel',
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
