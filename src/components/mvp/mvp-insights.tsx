'use client'

/**
 * MVP Insights — the owner's "See all insights" deep-dive, reached from the
 * home chart. Stays in the apnosh-mvp app design (full-screen phone frame,
 * brand green, Cal Sans display) and reuses the home's chart + breakdown tiles
 * so the two surfaces feel like one app.
 *
 * Layout is a top-to-bottom ladder: the main graph the owner already trusts on
 * top, then each scroll answers one plainer question —
 *   1. the range-aware graph (metric switcher + hero + chart + source tiles)
 *   2. your busiest days (weekday rhythm from the daily series)
 *   3. the path (Views -> Actions -> Bookings -> Email, with drop-off)
 *   4. how people find you on Google (search vs maps, phone vs computer)
 *   5. what people search to find you (top queries)
 *   6. your best posts (top social by reach)
 *   7. what customers are saying (rating + sentiment + themes)
 *   8. latest reviews (tap to reply)
 *
 * Numbers 1-3 and 7-8 come from /api/dashboard/load (same source as the home).
 * Numbers 4-6 lazy-load from /api/dashboard/insights-detail, keyed on clientId,
 * so the shared home load stays lean.
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Minus, Star,
  Eye, MousePointerClick, CalendarDays, Mail, BarChart3,
  Search, ExternalLink, Image as ImageIcon, MessageSquare,
} from 'lucide-react'
import { ActionsChart, SourceCard, useChartRange, isFresh, relDate, type MetricView } from './mvp-home'

const C = {
  green: '#4abd98', greenDk: '#2e9a78', greenSoft: '#eaf7f3', greenLine: 'rgba(74,189,152,0.32)',
  ink: '#1d1d1f', mute: '#6e6e73', faint: '#aeaeb2', line: '#e6e6ea', bg: '#f5f5f7',
  amber: '#f5a623', coral: '#a85c3c', coralBg: '#f8efe9',
}
const DISPLAY = "'Cal Sans','Inter',sans-serif"

export interface InsightsReview {
  id: string; authorName: string; rating: number; text: string | null
  source: string; postedAt: string; replied: boolean; needsReply: boolean
}
export interface InsightsData {
  businessName: string
  metrics: MetricView[]
  reviews: InsightsReview[]
  avgRating: number | null
  totalReviews: number
  unanswered: number
}

// FAST deterministic reputation data from /api/dashboard/review-summary — paints
// instantly (rating histogram, month trend, replies, sources).
interface ReviewSummary {
  split: { positive: number; neutral: number; negative: number; total: number }
  stars: Record<string, number>
  byMonth: { ym: string; avg: number; count: number; cumAvg: number }[]
  reply: { total: number; replied: number; unanswered: number; unansweredNegative: number }
  sources: Record<string, number>
  recent: { rating: number; date: string }[]
  placeRating: number | null
  placeRatingCount: number | null
}
// SLOW AI aspect analysis from /api/dashboard/review-topics — the per-topic
// positive/negative breakdown + a plain summary. Loads a beat later.
interface ReviewTopic { name: string; positive: number; negative: number; mentions: number; direction: 'up' | 'down' | 'flat'; quote: string }
interface ReviewTopicsData { summary: string | null; topics: ReviewTopic[] }

// The "further breakdown" data that /api/dashboard/load doesn't carry.
// Lazy-fetched from /api/dashboard/insights-detail.
export interface InsightsPost { id: string; platform: string; permalink: string | null; thumbnailUrl: string | null; type: string; reach: number; likes: number; saves: number }
interface InsightsDetail {
  findYou: { searchMobile: number; searchDesktop: number; mapsMobile: number; mapsDesktop: number } | null
  topQueries: { query: string; impressions: number }[]
  topPosts: InsightsPost[]
}

// Short icon per metric key, for the metric switcher + the journey stages.
const METRIC_ICON: Record<string, React.ComponentType<{ size?: number; color?: string }>> = {
  reach: Eye, interactions: MousePointerClick, bookings: CalendarDays, loyalty: Mail, reputation: Star,
}

// Hide the native scrollbar on the horizontally-scrolling metric pills, matching
// the home (.mvp-swipe) and review-detail surfaces.
const INSIGHTS_CSS = '.mvp-insights-pills{scrollbar-width:none;-ms-overflow-style:none}.mvp-insights-pills::-webkit-scrollbar{display:none}'

export default function MvpInsights({ data, loading, error, clientId }: { data: InsightsData | null; loading: boolean; error: string | null; clientId?: string }) {
  const router = useRouter()
  const [sel, setSel] = useState(0)
  const [summary, setSummary] = useState<ReviewSummary | null>(null)
  const [topicsData, setTopicsData] = useState<ReviewTopicsData | null>(null)
  const [topicsLoading, setTopicsLoading] = useState(false)
  const [detail, setDetail] = useState<InsightsDetail | null>(null)

  const clampedSel = data ? Math.min(sel, Math.max(0, data.metrics.length - 1)) : 0

  // FAST: the deterministic reputation data (rating, histogram, replies,
  // sources) — no model call, so it paints almost immediately. Keyed on the
  // client id ONLY so it can't self-trigger a loop or bleed across accounts.
  useEffect(() => {
    if (!clientId) return
    let live = true
    setSummary(null)
    fetch(`/api/dashboard/review-summary?clientId=${clientId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (live && j) setSummary(j) })
      .catch(() => { /* leave the section quiet on failure */ })
    return () => { live = false }
  }, [clientId])

  // SLOW: the AI topic breakdown + summary, fetched separately so it never
  // holds up the fast data above.
  useEffect(() => {
    if (!clientId) return
    let live = true
    setTopicsData(null)
    setTopicsLoading(true)
    fetch(`/api/dashboard/review-topics?clientId=${clientId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (live && j) setTopicsData(j) })
      .catch(() => { /* leave the topic section quiet on failure */ })
      .finally(() => { if (live) setTopicsLoading(false) })
    return () => { live = false }
  }, [clientId])

  // Lazy-load the discovery breakdowns (find-you, searches, best posts). Same
  // client-id-only keying; a quiet failure just hides those sections.
  useEffect(() => {
    if (!clientId) return
    let live = true
    setDetail(null)
    fetch(`/api/dashboard/insights-detail?clientId=${clientId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (live && j) setDetail(j) })
      .catch(() => { /* leave the sections quiet on failure */ })
    return () => { live = false }
  }, [clientId])

  const back = () => { if (typeof window !== 'undefined' && window.history.length > 1) router.back(); else router.push('/dashboard') }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: '#f0f0f3', display: 'flex', justifyContent: 'center' }}>
      <style>{INSIGHTS_CSS}</style>
      <div style={{ width: '100%', maxWidth: 480, height: '100dvh', background: '#fff', display: 'flex', flexDirection: 'column', boxShadow: '0 0 40px rgba(0,0,0,0.06)', fontFamily: "'Inter',system-ui,sans-serif", color: C.ink }}>
      {/* sticky back header */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '12px 12px 12px 6px', borderBottom: `1px solid ${C.line}`, background: '#fff' }}>
        <button onClick={back} aria-label="Back" style={{ width: 38, height: 38, borderRadius: 99, border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: C.ink }}><ChevronLeft size={24} /></button>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 18, lineHeight: 1.1 }}>Insights</div>
          {data?.businessName && <div style={{ fontSize: 12, color: C.faint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{data.businessName}</div>}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {loading ? (
          <Centered>Loading your numbers&hellip;</Centered>
        ) : error ? (
          <Centered>Couldn&apos;t load: {error}</Centered>
        ) : !data || data.metrics.length === 0 ? (
          <EmptyState />
        ) : (
          <Body data={data} sel={clampedSel} setSel={setSel} summary={summary} topicsData={topicsData} topicsLoading={topicsLoading} detail={detail} />
        )}
      </div>
      </div>
    </div>
  )
}

function Body({ data, sel, setSel, summary, topicsData, topicsLoading, detail }: { data: InsightsData; sel: number; setSel: (i: number) => void; summary: ReviewSummary | null; topicsData: ReviewTopicsData | null; topicsLoading: boolean; detail: InsightsDetail | null }) {
  const metrics = data.metrics
  const byKey = new Map(metrics.map((m) => [m.key, m]))
  const mv = metrics[sel]

  // Selected metric's chart shares its range with the hero, so the range chips
  // move the headline number + delta (not just the bars); the delta goes honest
  // ("Updated <when>") when the data is too stale to claim a current trend.
  const rc = useChartRange(mv)
  const fresh = isFresh(mv?.lastDataDate ?? '', rc.summary.periodDays)
  const dn = rc.summary.deltaPct < 0

  return (
    <div style={{ padding: '10px 18px 44px' }}>

      {/* ─────────── 1. The main graph (on top) ─────────── */}
      {/* metric switcher */}
      <div className="mvp-insights-pills" style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 4, marginBottom: 16 }}>
        {metrics.map((m, i) => {
          const on = i === sel
          const Icon = METRIC_ICON[m.key] ?? BarChart3
          return (
            <button key={m.key} onClick={() => setSel(i)} style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${on ? C.green : C.line}`, background: on ? C.greenSoft : '#fff', color: on ? C.greenDk : C.mute, borderRadius: 999, padding: '7px 13px', fontSize: 12.5, fontWeight: on ? 700 : 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <Icon size={14} color={on ? C.greenDk : C.faint} />{m.tabLabel}
            </button>
          )
        })}
      </div>

      {/* Reviews lead with the rating + star histogram (a review's day-to-day
          timing is noise); every other metric leads with its time chart. */}
      {mv.key === 'reputation' ? (
        <ReviewHero avgRating={data.avgRating} totalReviews={data.totalReviews} summary={summary} />
      ) : (
        <>
          {/* hero */}
          <div style={{ fontSize: 14, color: C.mute, fontWeight: 500 }}>{mv.heroLabel}</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 11, marginTop: 2 }}>
            <span style={{ fontFamily: DISPLAY, fontSize: 46, fontWeight: 500, lineHeight: 1, letterSpacing: '-.02em' }}>{rc.summary.total ? rc.summary.total.toLocaleString() : '—'}</span>
            {rc.summary.total > 0 && fresh && rc.summary.deltaPct !== 0 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 600, color: dn ? C.coral : C.greenDk, background: dn ? C.coralBg : C.greenSoft, padding: '4px 11px', borderRadius: 99, marginBottom: 5 }}>
                <span style={{ fontSize: 10 }}>{dn ? '▼' : '▲'}</span>{Math.abs(rc.summary.deltaPct)}% {rc.summary.cmpFrame}
              </span>
            )}
            {rc.summary.total > 0 && !fresh && mv.lastDataDate && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: C.mute, background: C.bg, padding: '4px 11px', borderRadius: 99, marginBottom: 5 }}>
                Updated {relDate(mv.lastDataDate)}
              </span>
            )}
          </div>
          <div style={{ fontSize: 13.5, color: C.faint, marginTop: 5 }}>{mv.heroSub}</div>
          {rc.summary.total > 0 && fresh && rc.summary.compareTotal > 0 && (
            <div style={{ fontSize: 12.5, color: C.faint, marginTop: 3 }}>Was {rc.summary.compareTotal.toLocaleString()} {rc.summary.cmpFrame.replace(/^vs\s*/i, '')}</div>
          )}
          {fresh && rc.summary.yoyPct != null && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 6, fontSize: 12.5, fontWeight: 600, color: rc.summary.yoyPct > 0 ? C.greenDk : rc.summary.yoyPct < 0 ? C.coral : C.mute }}>
              {rc.summary.yoyPct > 0 ? <TrendingUp size={14} /> : rc.summary.yoyPct < 0 ? <TrendingDown size={14} /> : <Minus size={14} />}
              {rc.summary.yoyPct > 0 ? `Up ${rc.summary.yoyPct}% ${rc.summary.yoyLabel}` : rc.summary.yoyPct < 0 ? `Down ${Math.abs(rc.summary.yoyPct)}% ${rc.summary.yoyLabel}` : `Even with last year`}
            </div>
          )}

          {/* full chart with range chips (reused from the home) */}
          <ActionsChart range={rc.range} setRange={rc.setRange} cStart={rc.cStart} setCStart={rc.setCStart} cEnd={rc.cEnd} setCEnd={rc.setCEnd} summary={rc.summary} noun={mv.unit} />

          {/* what feeds this metric */}
          {mv.tiles.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.faint, margin: '16px 0 9px' }}>What feeds this</div>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(4, mv.tiles.length)},1fr)`, gap: 8 }}>
                {mv.tiles.slice(0, 4).map((s) => <SourceCard key={s.key + s.label} s={s} />)}
              </div>
            </>
          )}
        </>
      )}

      {/* ─── Breakdowns below the graph are tailored to the selected metric ─── */}
      {mv.key === 'reputation' ? (
        <>
          {/* Where reviews come from, right under the rating + histogram */}
          {summary && <ReviewSources sources={summary.sources} googleCount={summary.placeRatingCount} />}
          {/* Reviews: what customers say + the latest ones */}
          <ReviewSentiment topics={topicsData} loading={topicsLoading} />
          {summary && summary.byMonth.length >= 2 && <RatingOverTime byMonth={summary.byMonth} recent={summary.recent ?? []} />}
          {summary && summary.reply.total > 0 && <ReplyHealth reply={summary.reply} />}
          {data.reviews.length > 0 && (
            <Section title="Latest reviews" action={{ label: 'See all', href: '/dashboard/inbox?tab=reviews' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {data.reviews.slice(0, 3).map((r) => {
                  const tint = r.rating >= 4 ? C.green : r.rating <= 2 ? C.coral : C.faint
                  return (
                    <Link key={r.id} href={`/dashboard/reviews/${r.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block', background: '#fff', border: `0.5px solid ${C.line}`, borderLeft: `3px solid ${tint}`, borderRadius: 14, padding: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>{r.authorName}</span>
                        <Stars n={r.rating} />
                        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 3 }}>
                          {r.needsReply && <span style={{ fontSize: 10, fontWeight: 700, color: C.coral, background: C.coralBg, borderRadius: 99, padding: '2px 8px' }}>Reply</span>}
                          <ChevronRight size={15} color={C.faint} />
                        </span>
                      </div>
                      {r.text && <div style={{ fontSize: 12.5, color: C.mute, lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{r.text}</div>}
                    </Link>
                  )
                })}
              </div>
            </Section>
          )}
        </>
      ) : (
        <>
          {/* Views: the "who saw you" story — how they find you, what they search, best posts */}
          {mv.key === 'reach' && detail?.findYou && <FindYou b={detail.findYou} />}
          {mv.key === 'reach' && detail && detail.topQueries.length > 0 && <TopSearches queries={detail.topQueries} />}
          {mv.key === 'reach' && detail && detail.topPosts.length > 0 && <BestPosts posts={detail.topPosts} />}

          {/* When it happens — for every flow metric */}
          <BusyDays daily={mv.daily} />

          {/* Where this metric sits in the customer journey, its own stage highlighted */}
          <PathFunnel byKey={byKey} activeKey={mv.key} />
        </>
      )}
    </div>
  )
}

// ── Busiest days: average per weekday from the metric's daily series ──
const DOW2 = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const DOWFULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
function BusyDays({ daily }: { daily: { date: string; value: number }[] }) {
  if (!daily || daily.length < 14) return null
  const sums = [0, 0, 0, 0, 0, 0, 0]
  const counts = [0, 0, 0, 0, 0, 0, 0]
  for (const d of daily) {
    const g = new Date(d.date + 'T00:00:00').getDay()
    sums[g] += d.value
    counts[g] += 1
  }
  const avgs = sums.map((s, i) => (counts[i] ? s / counts[i] : 0))
  const max = Math.max(1, ...avgs)
  let peak = 0; let quiet = 0; let pv = -1; let qv = Infinity
  avgs.forEach((a, i) => {
    if (counts[i] === 0) return
    if (a > pv) { pv = a; peak = i }
    if (a < qv) { qv = a; quiet = i }
  })
  return (
    <Section title="Your busiest days">
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 90 }}>
        {avgs.map((a, i) => {
          const h = Math.max(6, Math.round((a / max) * 78))
          const isPeak = i === peak
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
              <div style={{ width: '100%', height: h, borderRadius: 7, background: isPeak ? `linear-gradient(180deg, ${C.green}, ${C.greenDk})` : C.greenSoft }} />
              <span style={{ fontSize: 10.5, color: isPeak ? C.greenDk : C.faint, fontWeight: isPeak ? 700 : 500 }}>{DOW2[i]}</span>
            </div>
          )
        })}
      </div>
      <div style={{ fontSize: 12.5, color: C.mute, marginTop: 11, lineHeight: 1.45 }}>
        <b style={{ color: C.ink, fontWeight: 600 }}>{DOWFULL[peak]}s</b> run hottest{peak !== quiet ? <>, <b style={{ color: C.ink, fontWeight: 600 }}>{DOWFULL[quiet]}s</b> are quietest</> : ''}. A good day to post or run a special.
      </div>
    </Section>
  )
}

// ── The path: Views -> Actions -> Bookings -> Email, with drop-off ──
const PATH_STAGES: { key: string; label: string; icon: React.ComponentType<{ size?: number; color?: string }> }[] = [
  { key: 'reach', label: 'Saw you', icon: Eye },
  { key: 'interactions', label: 'Took an action', icon: MousePointerClick },
  { key: 'bookings', label: 'Booked a table', icon: CalendarDays },
  { key: 'loyalty', label: 'On your email list', icon: Mail },
]
function PathFunnel({ byKey, activeKey }: { byKey: Map<string, MetricView>; activeKey?: string }) {
  const rows = PATH_STAGES.map((s) => ({ ...s, total: byKey.get(s.key)?.total ?? 0 })).filter((r) => r.total > 0)
  if (rows.length < 2) return null
  const top = rows[0].total
  // Biggest leak = the smallest step-to-step share.
  let leak = -1; let leakPct = 101
  for (let i = 1; i < rows.length; i++) {
    const p = (rows[i].total / rows[i - 1].total) * 100
    if (p < leakPct) { leakPct = p; leak = i }
  }
  return (
    <Section title="The path" sub="where this fits">
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {rows.map((r, i) => {
          const Icon = r.icon
          const w = Math.max(16, Math.round(Math.min(1, r.total / top) * 100))
          const conv = i > 0 ? Math.round((r.total / rows[i - 1].total) * 100) : null
          const isLeak = i === leak
          const isActive = r.key === activeKey
          return (
            <div key={r.key}>
              {conv != null && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 0 4px 9px', fontSize: 11, fontWeight: isLeak ? 700 : 500, color: isLeak ? C.coral : C.faint }}>
                  <span style={{ fontSize: 12, lineHeight: 1 }}>↓</span>{conv > 100 ? '100+' : conv}% moved on
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: isActive ? C.greenSoft : 'transparent', borderRadius: 12, padding: isActive ? '7px 8px' : '0', margin: isActive ? '0 -8px' : '0' }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: isActive ? C.green : C.greenSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon size={14} color={isActive ? '#fff' : C.greenDk} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4, gap: 8 }}>
                    <span style={{ fontSize: 12.5, color: isActive ? C.ink : C.mute, fontWeight: isActive ? 700 : 500, display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.label}</span>
                      {isActive && <span style={{ flexShrink: 0, fontSize: 9.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: C.greenDk, background: '#fff', border: `1px solid ${C.greenLine}`, borderRadius: 99, padding: '1px 7px' }}>This graph</span>}
                    </span>
                    <span style={{ fontFamily: DISPLAY, fontSize: 16, fontWeight: 600, flexShrink: 0 }}>{r.total.toLocaleString()}</span>
                  </div>
                  <div style={{ height: 9, borderRadius: 99, background: isActive ? '#fff' : C.bg, overflow: 'hidden' }}>
                    <div style={{ width: `${w}%`, height: '100%', borderRadius: 99, background: `linear-gradient(90deg, ${C.green}, ${C.greenDk})` }} />
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ fontSize: 11, color: C.faint, marginTop: 11, lineHeight: 1.45 }}>
        {leak > 0 ? <>Biggest drop is at <b style={{ color: C.mute, fontWeight: 600 }}>{rows[leak].label.toLowerCase()}</b>. </> : ''}Each % is how many from the step above moved on. These counts come from different tools, so read it as a rough path.
      </div>
    </Section>
  )
}

// ── How people find you on Google ──
function SplitBar({ left, right, total }: { left: { label: string; value: number; color: string }; right: { label: string; value: number; color: string }; total: number }) {
  const lp = total ? (left.value / total) * 100 : 0
  return (
    <div>
      <div style={{ display: 'flex', height: 12, borderRadius: 99, overflow: 'hidden', background: C.bg }}>
        {left.value > 0 && <div style={{ width: `${lp}%`, background: left.color }} />}
        {right.value > 0 && <div style={{ width: `${100 - lp}%`, background: right.color }} />}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11.5, color: C.mute }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 99, background: left.color }} />{left.label} <b style={{ color: C.ink, fontWeight: 600 }}>{Math.round(lp)}%</b></span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><b style={{ color: C.ink, fontWeight: 600 }}>{Math.round(100 - lp)}%</b> {right.label}<span style={{ width: 8, height: 8, borderRadius: 99, background: right.color }} /></span>
      </div>
    </div>
  )
}
function FindYou({ b }: { b: { searchMobile: number; searchDesktop: number; mapsMobile: number; mapsDesktop: number } }) {
  const search = b.searchMobile + b.searchDesktop
  const maps = b.mapsMobile + b.mapsDesktop
  const mobile = b.searchMobile + b.mapsMobile
  const desktop = b.searchDesktop + b.mapsDesktop
  const total = search + maps
  if (total <= 0) return null
  const chan = search >= maps ? 'Search' : 'Maps'
  const dev = mobile >= desktop ? 'phone' : 'computer'
  return (
    <Section title="How people find you on Google">
      <SplitBar left={{ label: 'Search', value: search, color: C.green }} right={{ label: 'Maps', value: maps, color: C.greenDk }} total={total} />
      <div style={{ height: 12 }} />
      <SplitBar left={{ label: 'On a phone', value: mobile, color: C.amber }} right={{ label: 'On a computer', value: desktop, color: C.faint }} total={total} />
      <div style={{ fontSize: 12.5, color: C.mute, marginTop: 12, lineHeight: 1.45 }}>
        Most people find you on <b style={{ color: C.ink, fontWeight: 600 }}>{chan}</b>, on their <b style={{ color: C.ink, fontWeight: 600 }}>{dev}</b>.
      </div>
    </Section>
  )
}

// ── What people search to find you ──
function TopSearches({ queries }: { queries: { query: string; impressions: number }[] }) {
  const max = Math.max(1, ...queries.map((q) => q.impressions))
  return (
    <Section title="What people search" sub="to find you on Google">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {queries.map((q, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Search size={13} color={C.faint} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 12.5, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{q.query}</span>
                <span style={{ fontSize: 11.5, color: C.mute, fontWeight: 600, flexShrink: 0 }}>{q.impressions.toLocaleString()}</span>
              </div>
              <div style={{ height: 6, borderRadius: 99, background: C.bg, overflow: 'hidden' }}>
                <div style={{ width: `${Math.max(8, Math.round((q.impressions / max) * 100))}%`, height: '100%', borderRadius: 99, background: C.greenLine }} />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, color: C.faint, marginTop: 11, lineHeight: 1.45 }}>Words guests type to find you. Feature the ones you want to be known for.</div>
    </Section>
  )
}

// ── Your best posts ──
function BestPosts({ posts }: { posts: InsightsPost[] }) {
  const hero = posts[0]
  return (
    <Section title="Your best posts lately">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {posts.map((p) => (
          <a key={p.id} href={p.permalink ?? undefined} target="_blank" rel="noreferrer noopener" style={{ textDecoration: 'none', color: 'inherit', display: 'flex', gap: 11, alignItems: 'center', background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 14, padding: 10 }}>
            <div style={{ width: 52, height: 52, borderRadius: 10, backgroundColor: p.thumbnailUrl ? '#000' : C.bg, backgroundImage: p.thumbnailUrl ? `url(${p.thumbnailUrl})` : undefined, backgroundSize: 'cover', backgroundPosition: 'center', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {!p.thumbnailUrl && <ImageIcon size={18} color={C.faint} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: C.greenDk, background: C.greenSoft, borderRadius: 99, padding: '2px 8px' }}>{p.type}</span>
                <span style={{ fontSize: 11, color: C.faint, textTransform: 'capitalize' }}>{p.platform}</span>
              </div>
              <div style={{ display: 'flex', gap: 14, fontSize: 12 }}>
                <span style={{ color: C.mute }}><b style={{ color: C.ink, fontWeight: 600, fontFamily: DISPLAY }}>{p.reach.toLocaleString()}</b> reached</span>
                {p.likes > 0 && <span style={{ color: C.mute }}><b style={{ color: C.ink, fontWeight: 600, fontFamily: DISPLAY }}>{p.likes.toLocaleString()}</b> likes</span>}
              </div>
            </div>
            <ExternalLink size={15} color={C.faint} style={{ flexShrink: 0 }} />
          </a>
        ))}
      </div>
      {hero && <div style={{ fontSize: 11, color: C.faint, marginTop: 11, lineHeight: 1.45 }}>Your <b style={{ color: C.mute, fontWeight: 600 }}>{hero.type.toLowerCase()}s</b> are pulling the most reach. Make more like these.</div>}
    </Section>
  )
}

function Section({ title, sub, action, children }: { title: string; sub?: string; action?: { label: string; href: string }; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: C.mute }}>{title}</span>
        {sub && <span style={{ fontSize: 11, color: C.faint }}>{sub}</span>}
        {action && <Link href={action.href} style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, color: C.greenDk, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 1 }}>{action.label} <ChevronRight size={13} /></Link>}
      </div>
      {children}
    </div>
  )
}

function ReviewSentiment({ topics, loading }: { topics: ReviewTopicsData | null; loading: boolean }) {
  if (!topics) {
    return (
      <Section title="What customers are saying" sub="from reviews we've read">
        <div style={{ background: '#fbfcfb', border: `0.5px solid ${C.line}`, borderRadius: 14, padding: 14, fontSize: 13, color: C.faint }}>
          {loading ? 'Reading your reviews…' : 'A few written reviews and we can pull out the topics guests mention.'}
        </div>
      </Section>
    )
  }
  return (
    <Section title="What customers are saying" sub="from reviews we've read">
      {topics.topics.length > 0
        ? <TopicBreakdown topics={topics.topics} />
        : <div style={{ fontSize: 13, color: C.faint }}>A few more written reviews and we can pull out the topics guests mention.</div>}
    </Section>
  )
}

// ── Topic breakdown: each topic's positive-vs-negative split + where it's headed ──
function TopicBreakdown({ topics }: { topics: ReviewTopic[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {topics.map((t, i) => {
        const m = t.mentions || 1
        const gp = (t.positive / m) * 100
        return (
          <div key={i}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.ink, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
              {t.direction !== 'flat' && (
                <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700, color: t.direction === 'up' ? C.greenDk : C.coral, background: t.direction === 'up' ? C.greenSoft : C.coralBg, borderRadius: 99, padding: '2px 7px' }}>
                  {t.direction === 'up' ? <TrendingUp size={11} /> : <TrendingDown size={11} />}{t.direction === 'up' ? 'Improving' : 'Slipping'}
                </span>
              )}
              <span style={{ marginLeft: 'auto', fontSize: 11.5, color: C.mute, flexShrink: 0 }}>
                <b style={{ color: C.greenDk, fontWeight: 600 }}>{t.positive}</b> liked{t.negative > 0 ? <> · <b style={{ color: C.coral, fontWeight: 600 }}>{t.negative}</b> not</> : ''}
              </span>
            </div>
            <div style={{ display: 'flex', height: 9, borderRadius: 99, overflow: 'hidden', background: C.bg }}>
              {t.positive > 0 && <div style={{ width: `${gp}%`, background: C.green }} />}
              {t.negative > 0 && <div style={{ width: `${100 - gp}%`, background: C.coral }} />}
            </div>
            {t.quote && <div style={{ fontSize: 11.5, color: C.faint, marginTop: 6, fontStyle: 'italic', lineHeight: 1.4 }}>&ldquo;{t.quote}&rdquo;</div>}
          </div>
        )
      })}
    </div>
  )
}

// ── Reviews hero: average rating + star histogram (replaces the time chart, since
//    a review's day-to-day timing is noise; the trends that matter are monthly) ──
function ReviewHero({ avgRating, totalReviews, summary }: { avgRating: number | null; totalReviews: number; summary: ReviewSummary | null }) {
  const stars = summary?.stars ?? null
  // The sample we've actually pulled through the API (drives the histogram etc).
  let sampleAvg = avgRating
  let sampleTotal = summary?.split.total ?? totalReviews
  if (stars) {
    let sum = 0; let n = 0
    for (const k of [1, 2, 3, 4, 5]) { const c = stars[String(k)] ?? 0; sum += k * c; n += c }
    if (n > 0) { sampleAvg = Math.round((sum / n) * 10) / 10; sampleTotal = n }
  }
  // Headline = Google's authoritative listing rating + count when we have it,
  // since the API only hands back a subset of the actual reviews. Fall back to
  // the sample when the place rating isn't synced.
  const shownAvg = summary?.placeRating ?? sampleAvg
  const shownTotal = summary?.placeRatingCount ?? sampleTotal
  const partial = summary?.placeRatingCount != null && summary.placeRatingCount > sampleTotal && sampleTotal > 0
  return (
    <div>
      <div style={{ fontSize: 14, color: C.mute, fontWeight: 500 }}>Your rating</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginTop: 3 }}>
        <span style={{ fontFamily: DISPLAY, fontSize: 46, fontWeight: 500, lineHeight: 1, letterSpacing: '-.02em' }}>{shownAvg != null ? shownAvg.toFixed(1) : '—'}</span>
        <span style={{ marginBottom: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Stars n={shownAvg ?? 0} />
          <span style={{ fontSize: 12.5, color: C.faint }}>{shownTotal.toLocaleString()} review{shownTotal === 1 ? '' : 's'} on Google</span>
        </span>
      </div>
      {stars && sampleTotal > 0 ? (
        <>
          <div style={{ marginTop: 18 }}><StarBars stars={stars} /></div>
          {partial && <div style={{ fontSize: 11, color: C.faint, marginTop: 10, lineHeight: 1.45 }}>Breakdowns below are from the {sampleTotal.toLocaleString()} reviews we&apos;ve read so far. Google only shares a portion through its feed.</div>}
        </>
      ) : (
        <div style={{ marginTop: 16, fontSize: 12.5, color: C.faint }}>Loading your star breakdown&hellip;</div>
      )}
    </div>
  )
}

// ── Star histogram bars (5 → 1) ──
function StarBars({ stars }: { stars: Record<string, number> }) {
  const rows = [5, 4, 3, 2, 1]
  const max = Math.max(1, ...rows.map((s) => stars[String(s)] ?? 0))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      {rows.map((s) => {
        const n = stars[String(s)] ?? 0
        const w = n > 0 ? Math.max(6, Math.round((n / max) * 100)) : 0
        return (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, width: 32, flexShrink: 0, fontSize: 12, color: C.mute, fontWeight: 600 }}>{s}<Star size={11} color={C.amber} fill={C.amber} /></span>
            <div style={{ flex: 1, height: 8, borderRadius: 99, background: C.bg, overflow: 'hidden' }}>
              <div style={{ width: `${w}%`, height: '100%', borderRadius: 99, background: s >= 4 ? C.green : s === 3 ? C.faint : C.coral }} />
            </div>
            <span style={{ width: 30, textAlign: 'right', flexShrink: 0, fontSize: 11.5, color: C.mute, fontWeight: 600 }}>{n}</span>
          </div>
        )
      })}
    </div>
  )
}

// ── A tiny bar strip shared by the rating + velocity charts ──
const MONTHS3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function monLabel(ym: string): string { const m = Number(ym.split('-')[1]); return MONTHS3[m - 1] ?? ym }
function MiniBars({ values, colorFor, height = 46 }: { values: number[]; colorFor: (v: number, i: number) => string; height?: number }) {
  const max = Math.max(1, ...values)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height }}>
      {values.map((v, i) => {
        const h = Math.max(3, Math.round((v / max) * (height - 4)))
        return <div key={i} style={{ flex: 1, minWidth: 0, height: h, borderRadius: 4, background: colorFor(v, i) }} />
      })}
    </div>
  )
}

// ── A few month labels under a chart, so the timeline is legible ──
function MonthAxis({ months }: { months: string[] }) {
  if (months.length < 2) return null
  const labels = months.length >= 3
    ? [months[0], months[Math.floor((months.length - 1) / 2)], months[months.length - 1]]
    : [months[0], months[months.length - 1]]
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10, color: C.faint }}>
      {labels.map((ym, i) => <span key={i}>{monLabel(ym)}</span>)}
    </div>
  )
}

// ── A line + soft area sparkline. Scaled to [bottom, top] so movement in a
//    tight band (like a 1-5 rating) is actually visible; stroke stays crisp. ──
// ── A bar per recent review, height = its star score (green 4-5, grey 3, coral
//    1-2). Tap a bar to see that review's rating + date, like the home chart. ──
function ScoreBars({ reviews }: { reviews: { rating: number; date: string }[] }) {
  const [picked, setPicked] = useState<number | null>(null)
  const H = 54
  const n = reviews.length
  const fmtDate = (s: string) => { const d = new Date(s); return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: H }}>
      {reviews.map((r, i) => {
        const s = r.rating
        const h = Math.max(4, Math.round((Math.min(5, Math.max(0, s)) / 5) * (H - 4)))
        const color = s >= 4 ? C.green : s >= 3 ? C.faint : C.coral
        const isPicked = picked === i
        const edge = i < 2 ? 'left' : i > n - 3 ? 'right' : 'mid'
        return (
          <div key={i} onClick={() => setPicked(isPicked ? null : i)} style={{ flex: 1, minWidth: 0, height: '100%', position: 'relative', display: 'flex', alignItems: 'flex-end', cursor: 'pointer' }}>
            <div style={{ width: '100%', height: h, borderRadius: 4, background: color, opacity: picked === null || isPicked ? 1 : 0.4, transition: 'opacity .15s' }} />
            {isPicked && (
              <div style={{ position: 'absolute', bottom: '100%', marginBottom: 6, ...(edge === 'mid' ? { left: '50%', transform: 'translateX(-50%)' } : edge === 'left' ? { left: 0 } : { right: 0 }), background: C.ink, color: '#fff', borderRadius: 8, padding: '7px 10px', whiteSpace: 'nowrap', zIndex: 5, lineHeight: 1.4, textAlign: 'left' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700 }}>{s}<Star size={11} color={C.amber} fill={C.amber} /></div>
                <div style={{ fontSize: 10.5, opacity: 0.8, marginTop: 1 }}>{fmtDate(r.date)}</div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function TrendPill({ dir }: { dir: 'up' | 'down' | 'flat' }) {
  const map = { up: { c: C.greenDk, bg: C.greenSoft, t: 'Going up' }, down: { c: C.coral, bg: C.coralBg, t: 'Going down' }, flat: { c: C.mute, bg: C.bg, t: 'Steady' } }
  const m = map[dir]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10.5, fontWeight: 700, color: m.c, background: m.bg, borderRadius: 99, padding: '2px 8px' }}>
      {dir === 'up' ? <TrendingUp size={11} /> : dir === 'down' ? <TrendingDown size={11} /> : <Minus size={11} />}{m.t}
    </span>
  )
}

// ── Rating trend (recent review scores) + review volume ──
function RatingOverTime({ byMonth, recent }: { byMonth: { ym: string; avg: number; count: number; cumAvg: number }[]; recent: { rating: number; date: string }[] }) {
  const first = byMonth[0]; const last = byMonth[byMonth.length - 1]
  const months = byMonth.map((m) => m.ym)
  const counts = byMonth.map((m) => m.count)
  const volDir: 'up' | 'down' | 'flat' = last.count > first.count ? 'up' : last.count < first.count ? 'down' : 'flat'
  // Recent ratings: each bar is one of the last 12 individual reviews, oldest to
  // newest. Direction compares the newer half of the 12 to the older half.
  const scores = recent.map((r) => r.rating)
  const rAvg = scores.length ? Math.round((scores.reduce((s, x) => s + x, 0) / scores.length) * 10) / 10 : 0
  const half = Math.floor(scores.length / 2)
  const olderAvg = half ? scores.slice(0, half).reduce((s, x) => s + x, 0) / half : 0
  const newerAvg = scores.length - half ? scores.slice(half).reduce((s, x) => s + x, 0) / (scores.length - half) : 0
  const ratingDir: 'up' | 'down' | 'flat' = newerAvg > olderAvg + 0.3 ? 'up' : newerAvg < olderAvg - 0.3 ? 'down' : 'flat'
  const card: React.CSSProperties = { background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 14, padding: 14 }
  const head: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }
  const title: React.CSSProperties = { fontSize: 12.5, color: C.mute, fontWeight: 600 }
  const big: React.CSSProperties = { fontFamily: DISPLAY, fontSize: 19, fontWeight: 500, color: C.ink }
  return (
    <Section title="Over time">
      {/* Recent ratings — each bar is one of your last 12 reviews */}
      {scores.length > 0 && (
        <div style={card}>
          <div style={head}>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
              <span style={title}>Recent ratings</span>
              <span style={big}>{rAvg}&#9733;</span>
            </span>
            <TrendPill dir={ratingDir} />
          </div>
          <ScoreBars reviews={recent} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10, color: C.faint }}>
            <span>{monLabel(recent[0].date)}</span>
            <span>Latest</span>
          </div>
          <div style={{ fontSize: 11.5, color: C.faint, marginTop: 8, lineHeight: 1.45 }}>
            Your last {scores.length} review{scores.length === 1 ? '' : 's'}, oldest to newest. {ratingDir === 'up' ? 'Recent ones are picking up.' : ratingDir === 'down' ? 'Recent ones have dipped.' : 'Fairly steady lately.'}
          </div>
        </div>
      )}

      {/* New reviews a month */}
      <div style={{ ...card, marginTop: 10 }}>
        <div style={head}>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
            <span style={title}>New reviews a month</span>
            <span style={big}>{last.count}</span>
          </span>
          <TrendPill dir={volDir} />
        </div>
        <MiniBars values={counts} height={54} colorFor={(_, i) => (i === counts.length - 1 ? C.greenDk : C.green)} />
        <MonthAxis months={months} />
        <div style={{ fontSize: 11.5, color: C.faint, marginTop: 8, lineHeight: 1.45 }}>
          <b style={{ color: C.ink, fontWeight: 600 }}>{last.count}</b> in {monLabel(last.ym)}{volDir === 'up' ? ', more than before. Keep asking happy guests.' : volDir === 'down' ? ', fewer than before. A quick ask brings them back.' : '. A steady flow.'}
        </div>
      </div>
    </Section>
  )
}

// ── Reply health: how many reviews have an owner reply ──
function ReplyHealth({ reply }: { reply: { total: number; replied: number; unanswered: number; unansweredNegative: number } }) {
  const pct = reply.total ? Math.round((reply.replied / reply.total) * 100) : 0
  return (
    <Section title="Replies" action={reply.unanswered > 0 ? { label: 'Reply now', href: '/dashboard/inbox?tab=reviews' } : undefined}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: `conic-gradient(${C.green} ${pct * 3.6}deg, ${C.bg} 0deg)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><MessageSquare size={16} color={C.greenDk} /></div>
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: DISPLAY, fontSize: 24, fontWeight: 500, lineHeight: 1 }}>{pct}%</div>
          <div style={{ fontSize: 12, color: C.mute, marginTop: 3 }}>{reply.replied.toLocaleString()} of {reply.total.toLocaleString()} replied to</div>
        </div>
      </div>
      {reply.unanswered > 0 && (
        <div style={{ fontSize: 12.5, color: C.mute, lineHeight: 1.45, marginTop: 12 }}>
          <b style={{ color: C.ink, fontWeight: 600 }}>{reply.unanswered.toLocaleString()}</b> still waiting{reply.unansweredNegative > 0 ? <>, including <b style={{ color: C.coral, fontWeight: 600 }}>{reply.unansweredNegative}</b> unhappy guest{reply.unansweredNegative === 1 ? '' : 's'}. A reply shows future diners you care.</> : '. A quick thanks goes a long way.'}
        </div>
      )}
    </Section>
  )
}

// ── Where reviews come from: the platforms that matter most for a restaurant,
//    with the ones you're not on yet flagged as an opportunity ──
const REVIEW_PLATFORMS = [
  { key: 'google', label: 'Google' },
  { key: 'yelp', label: 'Yelp' },
  { key: 'tripadvisor', label: 'Tripadvisor' },
  { key: 'facebook', label: 'Facebook' },
]
const EXTRA_SOURCE_LABEL: Record<string, string> = { apple_maps: 'Apple Maps', other: 'Other sites' }
function ReviewSources({ sources, googleCount }: { sources: Record<string, number>; googleCount?: number | null }) {
  const src = sources ?? {}
  // Google's real listing count (place_rating_count) when we have it, so this
  // tile matches the headline instead of only the reviews we've synced.
  const featured = REVIEW_PLATFORMS.map((p) => ({ key: p.key, label: p.label, count: p.key === 'google' && googleCount != null ? googleCount : (src[p.key] ?? 0) }))
  const extras = Object.keys(src)
    .filter((k) => !REVIEW_PLATFORMS.some((p) => p.key === k) && src[k] > 0)
    .map((k) => ({ key: k, label: EXTRA_SOURCE_LABEL[k] ?? k, count: src[k] }))
  const tiles = [...featured, ...extras]
  return (
    <Section title="Where reviews come from" sub="the platforms diners check">
      {/* same tile look as "What feeds this": icon, count, label, dimmed with — when you're not on it yet */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(4, tiles.length)},1fr)`, gap: 8 }}>
        {tiles.map((r) => {
          const has = r.count > 0
          return (
            <div key={r.key} style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 13, padding: '11px 4px', textAlign: 'center', minHeight: 66, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5, opacity: has ? 1 : 0.5 }}>
              <Star size={14} color={has ? C.green : C.faint} fill={has ? C.green : 'transparent'} />
              <div style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 500, lineHeight: 1, color: C.ink }}>{has ? r.count.toLocaleString() : '—'}</div>
              <div style={{ fontSize: 10.5, color: C.faint }}>{r.label}</div>
            </div>
          )
        })}
      </div>
    </Section>
  )
}

function Stars({ n }: { n: number }) {
  return (
    <span style={{ display: 'inline-flex', gap: 1 }}>
      {[1, 2, 3, 4, 5].map((i) => <Star key={i} size={11} color={C.amber} fill={i <= Math.round(n) ? C.amber : 'transparent'} />)}
    </span>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', color: C.mute, fontSize: 14 }}>{children}</div>
}

function EmptyState() {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 32px', textAlign: 'center' }}>
      <div style={{ width: 52, height: 52, borderRadius: '50%', background: C.greenSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}><BarChart3 size={24} color={C.greenDk} /></div>
      <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 18, marginBottom: 6 }}>Insights are on the way</div>
      <div style={{ fontSize: 13.5, color: C.mute, lineHeight: 1.5, maxWidth: 280 }}>Once we start tracking your Google, social, and review activity, your numbers and trends show up here.</div>
    </div>
  )
}
