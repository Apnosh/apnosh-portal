/* Dev-only preview of the live mobile home, fed with mock data shaped
   exactly like getHomeMetrics(). Lets us verify the React port visually
   without auth. Not linked anywhere; safe to delete. */

import '../m-home.css'
import { MobileHomeHero } from '@/components/dashboard/mobile-home-hero'
import type { HomeMetric, HomeInstance, HomeBreakdownItem } from '@/lib/dashboard/get-home-metrics'

export const dynamic = 'force-static'

const MS = 86400000
const ymd = (d: Date) => {
  const y = d.getFullYear(), m = `${d.getMonth() + 1}`.padStart(2, '0'), day = `${d.getDate()}`.padStart(2, '0')
  return `${y}-${m}-${day}`
}
const sod = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
const dim = (y: number, m: number) => new Date(y, m + 1, 0).getDate()
// deterministic pseudo-random so SSR output is stable
let seed = 7
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }

function bd(items: [string, string, string][]): HomeBreakdownItem[] {
  return items.map(([label, value, icon]) => ({ label, value, icon }))
}

function numMetric(key: HomeMetric['key'], label: string, sub: string, base: number, comps: [string, string][]): HomeMetric {
  const today = sod(new Date())
  const dayVal = () => Math.max(0, Math.round(base / 7 + (rnd() - 0.4) * (base / 5)))
  const mkBreak = (total: number) => bd(comps.map(([l, ic], i) => [l, Math.round(total * [0.34, 0.28, 0.22, 0.16][i]).toLocaleString(), ic]))

  const week: HomeInstance[] = []
  const dow = today.getDay(); const thisSun = new Date(today.getTime() - dow * MS)
  for (let w = 7; w >= 0; w--) {
    const sun = new Date(thisSun.getTime() - w * 7 * MS); const vals: (number | null)[] = []; let tot = 0
    for (let d = 0; d < 7; d++) { const day = new Date(sun.getTime() + d * MS); if (day > today) vals.push(null); else { const v = dayVal(); vals.push(v); tot += v } }
    week.push({ vals, start: ymd(sun), sub: 'day', total: tot, rating: null, breakdown: mkBreak(tot) })
  }
  const month: HomeInstance[] = []
  for (let k = 11; k >= 0; k--) {
    const first = new Date(today.getFullYear(), today.getMonth() - k, 1); const n = dim(first.getFullYear(), first.getMonth()); const vals: (number | null)[] = []; let tot = 0
    for (let d = 0; d < n; d++) { const day = new Date(first.getFullYear(), first.getMonth(), d + 1); if (day > today) vals.push(null); else { const v = dayVal(); vals.push(v); tot += v } }
    month.push({ vals, start: ymd(first), sub: 'day', total: tot, rating: null, breakdown: mkBreak(tot) })
  }
  const year: HomeInstance[] = []
  for (let k = 2; k >= 0; k--) {
    const y = today.getFullYear() - k; const vals: (number | null)[] = []; let tot = 0
    for (let mo = 0; mo < 12; mo++) { const first = new Date(y, mo, 1); if (first > today) { vals.push(null); continue } const v = Math.round(base * 4 + rnd() * base * 2); vals.push(v); tot += v }
    year.push({ vals, start: ymd(new Date(y, 0, 1)), sub: 'month', total: tot, rating: null, breakdown: mkBreak(tot) })
  }
  return { key, label, sub, fmt: 'num', hasData: true, week, month, year }
}

function repMetric(): HomeMetric {
  const today = sod(new Date())
  const dayCount = () => (rnd() < 0.6 ? 0 : Math.round(rnd() * 2))
  const mkBreak = (count: number): HomeBreakdownItem[] => bd([
    ['New reviews', String(count), 'message'],
    ['Rating', (4.3 + rnd() * 0.6).toFixed(1) + '★', 'star'],
    ['Replied', count > 0 ? '100%' : '—', 'reply'],
    ['5-star', String(Math.round(count * 0.6)), 'star'],
  ])
  const inst = (start: Date, vals: (number | null)[], sub: 'day' | 'month'): HomeInstance => {
    const total = vals.reduce<number>((s, v) => s + (v ?? 0), 0)
    return { vals, start: ymd(start), sub, total, rating: total ? Math.round((4.3 + rnd() * 0.6) * 10) / 10 : null, breakdown: mkBreak(total) }
  }
  const week: HomeInstance[] = []
  const dow = today.getDay(); const thisSun = new Date(today.getTime() - dow * MS)
  for (let w = 7; w >= 0; w--) { const sun = new Date(thisSun.getTime() - w * 7 * MS); const vals: (number | null)[] = []; for (let d = 0; d < 7; d++) { const day = new Date(sun.getTime() + d * MS); vals.push(day > today ? null : dayCount()) } week.push(inst(sun, vals, 'day')) }
  const month: HomeInstance[] = []
  for (let k = 11; k >= 0; k--) { const first = new Date(today.getFullYear(), today.getMonth() - k, 1); const n = dim(first.getFullYear(), first.getMonth()); const vals: (number | null)[] = []; for (let d = 0; d < n; d++) { const day = new Date(first.getFullYear(), first.getMonth(), d + 1); vals.push(day > today ? null : dayCount()) } month.push(inst(first, vals, 'day')) }
  const year: HomeInstance[] = []
  for (let k = 2; k >= 0; k--) { const y = today.getFullYear() - k; const vals: (number | null)[] = []; for (let mo = 0; mo < 12; mo++) { const first = new Date(y, mo, 1); vals.push(first > today ? null : Math.round(rnd() * 8)) } year.push(inst(new Date(y, 0, 1), vals, 'month')) }
  return { key: 'reputation', label: 'Reputation', sub: 'Average rating · reviews received', fmt: 'rate', hasData: true, week, month, year }
}

const MOCK: HomeMetric[] = [
  numMetric('customers', 'Customer actions', 'Calls, directions & website clicks', 18, [['Directions', 'pin'], ['Calls', 'phone'], ['Site clicks', 'cursor'], ['Bookings', 'calendar']]),
  repMetric(),
  numMetric('reach', 'Reach', 'People who saw your content', 1200, [['Engaged', 'heart'], ['Posts', 'image'], ['Followers', 'user'], ['Profile visits', 'eye']]),
]

export default function MHomeDevPage() {
  return (
    <div style={{ background: '#fff', minHeight: '100vh' }}>
      <MobileHomeHero metrics={MOCK} />
    </div>
  )
}
