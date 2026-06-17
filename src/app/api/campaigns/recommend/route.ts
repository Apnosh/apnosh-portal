/**
 * GET /api/campaigns/recommend?clientId=… — personalized campaign suggestions
 * for the discovery feed. Ranks the campaign templates by this restaurant's
 * real signals (an upcoming event, the primary metric trend, review state),
 * each with a plain "why this fits you" reason, then fills the row with the
 * always-useful baselines. Returns ordered template ids + reasons; the client
 * maps them onto the local CAMPAIGN_TEMPLATES catalog.
 */
import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { getHomeMetrics } from '@/lib/dashboard/get-home-metrics'
import { getMarketingCalendar, daysUntil } from '@/lib/dashboard/marketing-calendar'

export const dynamic = 'force-dynamic'

const METRIC_TAB: Record<string, string> = { interactions: 'Customers', reach: 'Reach', bookings: 'Bookings', reputation: 'Reviews', loyalty: 'Email' }
const ORDER = ['interactions', 'reach', 'bookings', 'reputation', 'loyalty']
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)
function planLabel(days: number): string {
  if (days <= 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days < 7) return `in ${days} days`
  if (days < 14) return 'next week'
  return `in ${Math.round(days / 7)} weeks`
}
// Primary metric week-over-week (mirrors the home transform's complete-week rule).
function primaryDelta(hm: { metrics?: { key: string; hasData?: boolean; week?: { total?: number }[] }[] } | null): { label: string; weekPct: number } | null {
  const metrics = hm?.metrics ?? []
  const m = ORDER.map((k) => metrics.find((x) => x.key === k)).find((x) => x && x.hasData)
  if (!m) return null
  const weeks = m.week ?? []
  let ti = Math.max(0, weeks.length - 2)
  while (ti > 0 && (weeks[ti]?.total ?? 0) === 0) ti--
  const total = weeks[ti]?.total ?? 0
  const prev = weeks[ti - 1]?.total ?? 0
  const weekPct = prev === 0 ? (total > 0 ? 100 : 0) : Math.round(((total - prev) / prev) * 100)
  return { label: METRIC_TAB[m.key] ?? m.key, weekPct }
}

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })
  const access = await checkClientAccess(clientId)
  if (!access.authorized) return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status: access.reason === 'unauthenticated' ? 401 : 403 })

  const admin = createAdminClient()
  const [hm, reviewRes] = await Promise.all([
    getHomeMetrics(clientId).catch(() => null),
    admin.from('reviews').select('rating, response_text').eq('client_id', clientId).limit(300),
  ])

  const reviews = reviewRes.data ?? []
  const rated = reviews.filter((r) => Number(r.rating) > 0)
  const avg = rated.length ? rated.reduce((s, r) => s + Number(r.rating), 0) / rated.length : 0
  const unanswered = reviews.filter((r) => !r.response_text).length
  const m = primaryDelta(hm as Parameters<typeof primaryDelta>[0])
  const moment = getMarketingCalendar(new Date(), 35).find((x) => daysUntil(x.date) >= 0 && daysUntil(x.date) <= 28 && x.weight >= 3)

  const recs: { id: string; reason: string; priority: number }[] = []
  if (moment) recs.push({ id: 'event', reason: `${moment.label} is ${planLabel(daysUntil(moment.date))} — pack the date`, priority: 100 })
  if (m && m.weekPct < 0) recs.push({ id: 'discover', reason: `${cap(m.label)} dipped ${Math.abs(m.weekPct)}% this week — get in front of new locals`, priority: 90 })
  if (unanswered > 0) recs.push({ id: 'reviews', reason: `${unanswered} review${unanswered > 1 ? 's are' : ' is'} waiting — turn them into a higher rating`, priority: 75 })
  else if (avg > 0 && avg < 4.3) recs.push({ id: 'reviews', reason: `Your rating is ${avg.toFixed(1)} stars — fresh reviews nudge it up`, priority: 70 })
  if (m && m.weekPct > 8) recs.push({ id: 'regulars', reason: `${cap(m.label)} is up ${m.weekPct}% — turn the new faces into regulars`, priority: 55 })

  // Always-useful baselines fill the rest of the row (lower priority).
  const baseline = [
    { id: 'fill-shifts', reason: 'Turn your quiet shifts into covers' },
    { id: 'recurring-night', reason: 'Build a weekly habit your regulars plan around' },
    { id: 'winback', reason: 'Bring back guests who have drifted away' },
    { id: 'new-menu', reason: 'Got something new? Get people in to try it' },
    { id: 'discover', reason: 'Be found by nearby diners who have never been in' },
  ]
  let pr = 40
  for (const b of baseline) recs.push({ ...b, priority: pr-- })

  const byId = new Map<string, { id: string; reason: string; priority: number }>()
  for (const r of recs.sort((a, b) => b.priority - a.priority)) if (!byId.has(r.id)) byId.set(r.id, r)
  const recommended = [...byId.values()].sort((a, b) => b.priority - a.priority).slice(0, 5).map(({ id, reason }) => ({ id, reason }))

  return NextResponse.json({ recommended })
}
