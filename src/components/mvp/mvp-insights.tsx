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
  Search, ExternalLink, Image as ImageIcon,
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

// "What customers are saying" — sentiment split (rating-derived) + an AI theme
// summary. Lazy-fetched from /api/dashboard/review-summary when the page opens.
interface ReviewSummary {
  split: { positive: number; neutral: number; negative: number; total: number; withText: number }
  summary: string | null
  loved: string[]
  improve: string[]
  source: string
}

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
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [detail, setDetail] = useState<InsightsDetail | null>(null)

  const clampedSel = data ? Math.min(sel, Math.max(0, data.metrics.length - 1)) : 0

  // Prefetch the review sentiment + theme summary once the client is known, so
  // the reviews section is instant. Keyed on the client id ONLY — never on its
  // own loading/result state — so it can't self-trigger a loop or get stuck.
  useEffect(() => {
    if (!clientId) return
    let live = true
    setSummary(null)
    setSummaryLoading(true)
    fetch(`/api/dashboard/review-summary?clientId=${clientId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (live && j) setSummary(j) })
      .catch(() => { /* leave the section quiet on failure */ })
      .finally(() => { if (live) setSummaryLoading(false) })
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
          <Body data={data} sel={clampedSel} setSel={setSel} summary={summary} summaryLoading={summaryLoading} detail={detail} />
        )}
      </div>
      </div>
    </div>
  )
}

function Body({ data, sel, setSel, summary, summaryLoading, detail }: { data: InsightsData; sel: number; setSel: (i: number) => void; summary: ReviewSummary | null; summaryLoading: boolean; detail: InsightsDetail | null }) {
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

      {/* ─── Breakdowns below the graph are tailored to the selected metric ─── */}
      {mv.key === 'reputation' ? (
        <>
          {/* Reviews: what customers say + the latest ones */}
          <ReviewSentiment summary={summary} loading={summaryLoading} avgRating={data.avgRating} totalReviews={data.totalReviews} unanswered={data.unanswered} />
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

function ReviewSentiment({ summary, loading, avgRating, totalReviews, unanswered }: { summary: ReviewSummary | null; loading: boolean; avgRating: number | null; totalReviews: number; unanswered: number }) {
  const head = avgRating != null && (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
      <span style={{ fontFamily: DISPLAY, fontSize: 30, fontWeight: 500, lineHeight: 1 }}>{avgRating.toFixed(1)}</span>
      <Stars n={avgRating} />
      <span style={{ fontSize: 12, color: C.faint, marginLeft: 2 }}>{totalReviews.toLocaleString()} review{totalReviews === 1 ? '' : 's'}{unanswered > 0 ? `, ${unanswered} to reply` : ''}</span>
    </div>
  )
  if (!summary) {
    return (
      <Section title="What customers are saying">
        {head}
        <div style={{ background: '#fbfcfb', border: `0.5px solid ${C.line}`, borderRadius: 14, padding: 14, fontSize: 13, color: C.faint }}>
          {loading ? 'Reading your reviews…' : 'A few written reviews and we can pull out the themes guests mention.'}
        </div>
      </Section>
    )
  }
  const s = summary.split
  const total = s.total || 1
  const pct = (n: number) => `${(n / total) * 100}%`
  return (
    <Section title="What customers are saying">
      {head}
      {/* positive / neutral / negative split, from the star ratings */}
      <div style={{ display: 'flex', height: 12, borderRadius: 99, overflow: 'hidden', background: C.bg }}>
        {s.positive > 0 && <div style={{ width: pct(s.positive), background: C.green }} />}
        {s.neutral > 0 && <div style={{ width: pct(s.neutral), background: C.faint }} />}
        {s.negative > 0 && <div style={{ width: pct(s.negative), background: C.coral }} />}
      </div>
      <div style={{ display: 'flex', gap: 14, marginTop: 9, fontSize: 11.5, flexWrap: 'wrap' }}>
        <Legend dot={C.green} label="Positive" n={s.positive} />
        <Legend dot={C.faint} label="Neutral" n={s.neutral} />
        <Legend dot={C.coral} label="Negative" n={s.negative} />
      </div>

      {summary.summary && <div style={{ fontSize: 13.5, color: C.mute, lineHeight: 1.5, marginTop: 14 }}>{summary.summary}</div>}

      {(summary.loved.length > 0 || summary.improve.length > 0) && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 11 }}>
          {summary.loved.length > 0 && <ThemeRow label="Loved" items={summary.loved} fg={C.greenDk} bg={C.greenSoft} />}
          {summary.improve.length > 0 && <ThemeRow label="Could improve" items={summary.improve} fg={C.coral} bg={C.coralBg} />}
        </div>
      )}
    </Section>
  )
}

function Legend({ dot, label, n }: { dot: string; label: string; n: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: C.mute }}>
      <span style={{ width: 8, height: 8, borderRadius: 99, background: dot }} />{label} <b style={{ color: C.ink, fontWeight: 600 }}>{n.toLocaleString()}</b>
    </span>
  )
}

function ThemeRow({ label, items, fg, bg }: { label: string; items: string[]; fg: string; bg: string }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: C.faint, marginBottom: 7 }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {items.map((t, i) => <span key={i} style={{ fontSize: 12, fontWeight: 600, color: fg, background: bg, borderRadius: 99, padding: '5px 11px' }}>{t}</span>)}
      </div>
    </div>
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
