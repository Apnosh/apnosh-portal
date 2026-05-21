'use server'

/**
 * Real data for the mobile home sections: Needs you, This week recap,
 * Your channels, Plan. Mirrors the HomeSectionsData shape the React
 * components consume. Every sub-loader is independently guarded so a
 * failure in one degrades to a sensible empty/zero state rather than
 * breaking the whole payload.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { getMarketingCalendar, daysUntil } from '@/lib/dashboard/marketing-calendar'
import { getPrimaryStrategist } from '@/lib/dashboard/get-primary-strategist'

export interface NeedItem { title: string; time: string | null; icon: string }
export interface PlanItem { when: string; title: string; hint: string; cta: string; icon: string }
export interface Channel { name: string; sub: string; value: string; delta: string; dir: 'up' | 'down'; spark: number[]; connected: boolean; href?: string }
export interface WeekRecap { shipped: number; items: string; strategist: string | null }
export interface HomeSectionsData { needs: NeedItem[]; plan: PlanItem[]; channels: Channel[]; week: WeekRecap }

const DAY = 86400000
const num = (v: unknown) => Number(v ?? 0)
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0)
const ymd = (d: Date) => d.toISOString().slice(0, 10)

function fmtCompact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'k'
  return Math.round(n).toLocaleString()
}
function pctDelta(cur: number, prev: number): { delta: string; dir: 'up' | 'down' } {
  if (prev <= 0) return { delta: cur > 0 ? 'New' : '—', dir: 'up' }
  const pct = Math.round(((cur - prev) / prev) * 100)
  return { delta: `${pct >= 0 ? '+' : ''}${pct}%`, dir: pct >= 0 ? 'up' : 'down' }
}

/* Build a daily map and derive: last-7 sum, prior-7 sum, and 8 weekly
   points for the sparkline. */
function seriesStats(rows: { date: string; v: number }[], today: Date) {
  const byDate = new Map<string, number>()
  for (const r of rows) byDate.set(r.date.slice(0, 10), (byDate.get(r.date.slice(0, 10)) ?? 0) + r.v)
  const dayAt = (offset: number) => byDate.get(ymd(new Date(today.getTime() - offset * DAY))) ?? 0
  const window = (n: number, off = 0) => { let s = 0; for (let i = 0; i < n; i++) s += dayAt(i + off); return s }
  const last7 = window(7), prev7 = window(7, 7)
  const spark: number[] = []
  for (let w = 7; w >= 0; w--) spark.push(window(7, w * 7))
  return { last7, prev7, spark, hasData: byDate.size > 0 }
}

/* ── Needs you ─────────────────────────────────────────────── */
function needMeta(title: string): { icon: string; time: string | null } {
  const t = title.toLowerCase()
  if (/review/.test(t)) return { icon: 'reply', time: '2 min' }
  if (/approve|post|instagram|caption|social/.test(t)) return { icon: 'image', time: '30 sec' }
  if (/photo|menu|image/.test(t)) return { icon: 'image', time: '3 min' }
  if (/hour|holiday|memorial|christmas|closure|open/.test(t)) return { icon: 'clock', time: '1 min' }
  if (/book|reservation/.test(t)) return { icon: 'calendar', time: '1 min' }
  return { icon: 'message', time: null }
}

async function loadNeeds(clientId: string): Promise<NeedItem[]> {
  try {
    const admin = createAdminClient()
    const nowMs = Date.now()
    const { data } = await admin
      .from('client_tasks')
      .select('title, status, snoozed_until, due_at, visible_to_client')
      .eq('client_id', clientId)
      .eq('visible_to_client', true)
      .in('status', ['todo', 'doing'])
      .order('due_at', { ascending: true, nullsFirst: false })
      .limit(20)
    return (data ?? [])
      .filter((t: { snoozed_until?: string | null }) => !t.snoozed_until || new Date(t.snoozed_until).getTime() <= nowMs)
      .map((t: { title?: string | null }) => {
        const title = t.title ?? 'Untitled task'
        const meta = needMeta(title)
        return { title, time: meta.time, icon: meta.icon }
      })
  } catch (e) { console.error('[home-sections] needs', e); return [] }
}

/* ── This week recap (events ledger) ───────────────────────── */
function eventCategory(type: string, summary: string): string | null {
  const s = (type + ' ' + summary).toLowerCase()
  if (/post|caption|content|social|instagram|reel/.test(s)) return 'posts'
  if (/review/.test(s)) return 'review replies'
  if (/profile|gbp|listing|hours|business info/.test(s)) return 'profile updates'
  if (/site|website|page|seo/.test(s)) return 'website updates'
  if (/photo|image|shoot/.test(s)) return 'photos'
  return null
}

async function loadWeek(clientId: string): Promise<WeekRecap> {
  let strategist: string | null = null
  try {
    const s = await getPrimaryStrategist(clientId)
    strategist = (s && typeof s === 'object' && 'name' in s ? (s as { name?: string }).name : null) ?? null
  } catch { /* self-serve */ }

  try {
    const admin = createAdminClient()
    const since = new Date(Date.now() - 7 * DAY).toISOString()
    const { data } = await admin
      .from('events')
      .select('event_type, summary, actor_role, occurred_at')
      .eq('client_id', clientId)
      .gte('occurred_at', since)
      .order('occurred_at', { ascending: false })
      .limit(200)
    const buckets = new Map<string, number>()
    let shipped = 0
    for (const e of (data ?? []) as { event_type?: string; summary?: string; actor_role?: string }[]) {
      // Work shipped FOR the client = anything not done by the client themselves.
      if (e.actor_role === 'client' || e.actor_role === 'owner') continue
      const cat = eventCategory(e.event_type ?? '', e.summary ?? '')
      if (!cat) continue
      buckets.set(cat, (buckets.get(cat) ?? 0) + 1)
      shipped++
    }
    const items = [...buckets.entries()]
      .sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([cat, n]) => `${n} ${cat.replace(/s$/, n === 1 ? '' : 's')}`).join(' · ')
    return { shipped, items: items || 'Updates across your channels', strategist }
  } catch (e) { console.error('[home-sections] week', e); return { shipped: 0, items: '', strategist } }
}

/* ── Your channels ─────────────────────────────────────────── */
async function loadChannels(clientId: string): Promise<Channel[]> {
  const admin = createAdminClient()
  const today = new Date()
  const bound = ymd(new Date(today.getTime() - 70 * DAY))
  const safe = async <T,>(p: PromiseLike<{ data: T[] | null }>): Promise<T[]> => {
    try { const r = await p; return r.data ?? [] } catch { return [] }
  }
  const [gbp, social, web, reviews] = await Promise.all([
    safe(admin.from('gbp_metrics').select('date, search_views, photo_views').eq('client_id', clientId).gte('date', bound)),
    safe(admin.from('social_metrics').select('date, reach').eq('client_id', clientId).gte('date', bound)),
    safe(admin.from('website_metrics').select('date, visitors').eq('client_id', clientId).gte('date', bound)),
    safe(admin.from('reviews').select('rating, posted_at').eq('client_id', clientId)),
  ])

  const out: Channel[] = []

  // Local presence — profile views
  {
    const rows = (gbp as Record<string, unknown>[]).map(r => ({ date: String(r.date), v: num(r.search_views) + num(r.photo_views) }))
    const st = seriesStats(rows, today)
    const d = pctDelta(st.last7, st.prev7)
    out.push({ name: 'Local presence', sub: 'Profile views', value: fmtCompact(st.last7), delta: d.delta, dir: d.dir, spark: st.spark, connected: st.hasData, href: '/dashboard/local-seo' })
  }
  // Social — reach
  {
    const rows = (social as Record<string, unknown>[]).map(r => ({ date: String(r.date), v: num(r.reach) }))
    const st = seriesStats(rows, today)
    const d = pctDelta(st.last7, st.prev7)
    out.push({ name: 'Social media', sub: 'Reach', value: fmtCompact(st.last7), delta: d.delta, dir: d.dir, spark: st.spark, connected: st.hasData, href: '/dashboard/social' })
  }
  // Website — visitors
  {
    const rows = (web as Record<string, unknown>[]).map(r => ({ date: String(r.date), v: num(r.visitors) }))
    const st = seriesStats(rows, today)
    const d = pctDelta(st.last7, st.prev7)
    out.push({ name: 'Website', sub: 'Visitors', value: fmtCompact(st.last7), delta: d.delta, dir: d.dir, spark: st.spark, connected: st.hasData, href: '/dashboard/website' })
  }
  // Reviews — avg rating + new this week
  {
    const revs = reviews as { rating?: number | null; posted_at?: string | null }[]
    const connected = revs.length > 0
    const avg = connected ? revs.reduce((s, r) => s + num(r.rating), 0) / revs.length : 0
    const weekAgo = today.getTime() - 7 * DAY
    const newCount = revs.filter(r => r.posted_at && new Date(r.posted_at).getTime() >= weekAgo).length
    // sparkline: rolling weekly review counts (volume)
    const rows = revs.filter(r => r.posted_at).map(r => ({ date: String(r.posted_at).slice(0, 10), v: 1 }))
    const st = seriesStats(rows, today)
    out.push({ name: 'Reviews', sub: 'Avg rating', value: connected ? avg.toFixed(1) + '★' : '—', delta: newCount > 0 ? `+${newCount} new` : '—', dir: 'up', spark: st.spark, connected, href: '/dashboard/local-seo/reviews' })
  }

  return out
}

/* ── Plan ──────────────────────────────────────────────────── */
function relWhen(days: number): string {
  if (days <= 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days < 7) return `In ${days} days`
  if (days < 14) return 'Next week'
  const wk = Math.round(days / 7)
  return `In ${wk} weeks`
}

async function loadPlan(clientId: string): Promise<PlanItem[]> {
  const out: PlanItem[] = []
  const admin = createAdminClient()
  const today = new Date()

  // 1) Upcoming holidays / marketing moments
  try {
    const cal = getMarketingCalendar(new Date(), 45)
    for (const e of cal.slice(0, 2)) {
      out.push({ when: relWhen(daysUntil(e.date)), title: e.label, hint: e.hook, cta: 'Plan a promo', icon: 'gift' })
    }
  } catch (e) { console.error('[home-sections] plan/holidays', e) }

  // 2) Slow-period heuristic — quietest weekday over the last 8 weeks
  try {
    const bound = ymd(new Date(today.getTime() - 56 * DAY))
    const { data } = await admin.from('gbp_metrics')
      .select('date, directions, calls, website_clicks, bookings').eq('client_id', clientId).gte('date', bound)
    const rows = (data ?? []) as Record<string, unknown>[]
    if (rows.length >= 14) {
      const dow = [0, 0, 0, 0, 0, 0, 0], dowN = [0, 0, 0, 0, 0, 0, 0]
      for (const r of rows) {
        const day = new Date(String(r.date) + 'T00:00:00').getDay()
        dow[day] += num(r.directions) + num(r.calls) + num(r.website_clicks) + num(r.bookings)
        dowN[day]++
      }
      const avgByDow = dow.map((s, i) => (dowN[i] ? s / dowN[i] : Infinity))
      let lo = 0; for (let i = 1; i < 7; i++) if (avgByDow[i] < avgByDow[lo]) lo = i
      const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
      out.push({ when: `Next ${names[lo]}`, title: `Slow ${names[lo].toLowerCase()} expected`, hint: 'Your quietest day historically. A deal can fill seats.', cta: 'Create a deal', icon: 'trenddown' })
    }
  } catch (e) { console.error('[home-sections] plan/slow', e) }

  // 3) Content gap — posts scheduled in the next 14 days
  try {
    const { data } = await admin.from('scheduled_posts')
      .select('scheduled_for, status').eq('client_id', clientId)
      .in('status', ['scheduled', 'publishing'])
      .gte('scheduled_for', new Date().toISOString())
      .lte('scheduled_for', new Date(Date.now() + 14 * DAY).toISOString())
    const count = (data ?? []).length
    if (count < 3) {
      out.push({ when: 'Next 2 weeks', title: count === 0 ? 'No posts scheduled' : `${count} of 3 posts scheduled`, hint: count === 0 ? 'Keep your feed active — line up some posts.' : 'A gap in your content calendar.', cta: 'Schedule a post', icon: 'image' })
    }
  } catch (e) { console.error('[home-sections] plan/content', e) }

  return out
}

export async function getHomeSections(clientId: string): Promise<HomeSectionsData> {
  const [needs, week, channels, plan] = await Promise.all([
    loadNeeds(clientId),
    loadWeek(clientId),
    loadChannels(clientId).catch(() => [] as Channel[]),
    loadPlan(clientId).catch(() => [] as PlanItem[]),
  ])
  return { needs, week, channels, plan }
}
