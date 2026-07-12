'use client'

/**
 * MVP Insights — the owner's "See all insights" deep-dive, reached from the
 * home chart. Stays in the apnosh-mvp app design (full-screen phone frame,
 * brand green, Cal Sans display) and reuses the home's chart + breakdown tiles
 * so the two surfaces feel like one app.
 *
 * Layout is a top-to-bottom ladder: the main graph the owner already trusts on
 * top, then each scroll answers one plainer question. The breakdown below the
 * graph is tailored to the selected metric:
 *   - Views (brand awareness): where people find you (Maps vs Search + social),
 *     did being seen turn into anything (saw you -> made a move + action mix),
 *     the one lever to be seen more (reviews lift Maps rank), connect social.
 *   - Reviews (reputation): rating + sentiment themes + latest reviews.
 *   - Other flow metrics: busiest days + where it sits in the customer path.
 *
 * The hero, chart, and reviews come from /api/dashboard/load (same source as the
 * home). The Views deep-dive (channel split, actions, social reach) lazy-loads
 * from /api/dashboard/insights-detail, keyed on clientId, so the home stays lean.
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Minus, Star,
  Eye, MousePointerClick, CalendarDays, Mail, BarChart3,
  Search, ExternalLink, Image as ImageIcon, Check,
  Share2, ArrowRight,
  Footprints, ShoppingBag, Repeat, Lock, SlidersHorizontal,
  Route, Heart, Megaphone,
} from 'lucide-react'
import type { StageCampaign } from '@/lib/dashboard/get-stage-campaigns'
import { ActionsChart, MetricCard, SourceCard, useChartRange, isFresh, relDate, type MetricView } from './mvp-home'
import { buildAwarenessFeed, buildInterestFeed, buildActionsFeed, stageFeedFrom, NOT_CONNECTED, type FeedInput, type StageFeed } from '@/lib/dashboard/insights-feed'
import type { ComputedStage, StageSourceView } from '@/lib/insights/compute-stages'
import { sourceActionVerb, SOURCE_BY_ID } from '@/lib/insights/source-registry'

const C = {
  green: '#4abd98', greenDk: '#2e9a78', greenSoft: '#eaf7f3', greenLine: 'rgba(74,189,152,0.32)',
  ink: '#1d1d1f', mute: '#6e6e73', faint: '#aeaeb2', line: '#e6e6ea', bg: '#f5f5f7',
  amber: '#f5a623', coral: '#a85c3c', coralBg: '#f8efe9',
}
const DISPLAY = "'Cal Sans','Inter',sans-serif"

export interface InsightsReview {
  id: string; authorName: string; rating: number; text: string | null
  source: string; postedAt: string; replied: boolean; needsReply: boolean; response: string | null
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
  byMonth: { ym: string; count: number }[]
  reply: { total: number; replied: number; unanswered: number; unansweredNegative: number }
  sources: Record<string, number>
  recent: { rating: number; date: string }[]
  placeRating: number | null
  placeRatingCount: number | null
}
// SLOW AI aspect analysis from /api/dashboard/review-topics — the per-topic
// positive/negative breakdown + a plain summary. Loads a beat later.
interface ReviewTopic { name: string; positive: number; negative: number; mentions: number; direction: 'up' | 'down' | 'flat'; quote: string; negQuote: string }
interface ReviewTopicsData { summary: string | null; topics: ReviewTopic[] }

// The "further breakdown" data that /api/dashboard/load doesn't carry.
// Lazy-fetched from /api/dashboard/insights-detail.
export interface InsightsPost { id: string; platform: string; permalink: string | null; thumbnailUrl: string | null; type: string; reach: number; likes: number; saves: number; postedAt: string | null }
interface InsightsDetail {
  findYou: { searchMobile: number; searchDesktop: number; mapsMobile: number; mapsDesktop: number } | null
  topQueries: { query: string; impressions: number }[]
  topPosts: InsightsPost[]
  // total now folds social reach in (for the home funnel); this Google-framed tab reads the
  // Google-only `google` field so its "Real · Google" numbers + Maps/Search split stay honest.
  views: { total: number; maps: number; search: number; google?: number; social?: number } | null
  actions: { directions: number; calls: number; websiteClicks: number } | null
  socialReach: number
  socialConnected: boolean
  // whether Google Business Profile analytics resolved (drives the honest
  // "Not connected" label on Google pieces vs a real 0)
  googleConnected?: boolean
  // Interest-stage social signals (best effort; 0 when absent)
  profileVisits?: number
  followersGained?: number
  socialEngagement?: number
  // Phase 2: the honest outcome-funnel stages (headline == sum of CONNECTED
  // sources). When present, the stage breakdowns are driven by these so the
  // boxes reconcile by construction.
  stages?: ComputedStage[]
}

// Pull one computed stage out of the detail payload by its funnel stage number.
function computedStage(detail: InsightsDetail | null, n: number): ComputedStage | undefined {
  return detail?.stages?.find((s) => s.stage === n)
}

// Map the lazy-loaded InsightsDetail into the pure FeedInput the breakdown
// builders read. Keeps the reconciling math (headline == sum of parts) in one
// tested place (src/lib/dashboard/insights-feed.ts).
function toFeedInput(detail: InsightsDetail): FeedInput {
  return {
    views: detail.views,
    socialReach: detail.socialReach ?? 0,
    socialConnected: !!detail.socialConnected,
    googleConnected: detail.googleConnected ?? (!!detail.views && ((detail.views.google ?? detail.views.total) > 0)),
    actions: detail.actions,
    profileVisits: detail.profileVisits ?? 0,
    followersGained: detail.followersGained ?? 0,
    socialEngagement: detail.socialEngagement ?? 0,
  }
}

// Short icon per metric key, for the metric switcher + the journey stages.
const METRIC_ICON: Record<string, React.ComponentType<{ size?: number; color?: string }>> = {
  reach: Eye, interactions: MousePointerClick, bookings: CalendarDays, loyalty: Mail, reputation: Star,
}

// The insights page is organized around the customer journey, not raw metrics.
// Each stage is a tab; `metric` names the underlying MetricView (if any) that
// drives that stage's hero + chart. The stages, in order:
//   journey     — the whole path in one view (placeholder for now)
//   discovery   — how people find you (Google reach)
//   engagement  — who looked closer (posts, photos, social)
//   intent      — who made a move (directions, calls, clicks)
//   conversion  — what it turned into (the funnel: visits, spend)
//   retention   — who comes back (reviews, loyalty)
const JOURNEY: { key: string; label: string; icon: React.ComponentType<{ size?: number; color?: string }>; metric?: string }[] = [
  { key: 'journey', label: 'Journey', icon: Route },
  { key: 'discovery', label: 'Discovery', icon: Eye, metric: 'reach' },
  { key: 'engagement', label: 'Engagement', icon: Heart },
  { key: 'intent', label: 'Intent', icon: MousePointerClick, metric: 'interactions' },
  { key: 'conversion', label: 'Conversion', icon: ShoppingBag },
  { key: 'retention', label: 'Retention', icon: Repeat },
]
const STAGE_SUB: Record<string, string> = {
  journey: '',
  discovery: 'How people find you',
  engagement: 'Who looked closer',
  intent: 'Who made a move',
  conversion: 'What it turned into',
  retention: 'Who comes back',
}

// One funnel-stage tap drives this page (no in-page selector). Map the tapped
// stage — the funnel's own key (shown/engaged/moved/camein/back), or a legacy
// insights-stage key — to the TITLE (the funnel's own name), the home METRIC
// whose clean graph we show, and a one-line sub. Interest has no Google metric,
// so it uses the special 'engagement' key → the social/content view instead.
function resolveFocus(key?: string): { title: string; metric: string; sub: string; stageKey: string } {
  switch (key) {
    case 'shown': case 'discovery': return { title: 'Awareness', metric: 'reach', sub: 'People who saw you on Google and social', stageKey: 'shown' }
    case 'engaged': case 'engagement': return { title: 'Interest', metric: 'engagement', sub: 'People who looked closer at your posts and profile', stageKey: 'engaged' }
    case 'moved': case 'intent': return { title: 'Customer actions', metric: 'interactions', sub: 'Calls, directions, clicks, and likes', stageKey: 'moved' }
    case 'camein': case 'conversion': return { title: 'Orders', metric: 'bookings', sub: 'Tables booked and orders placed', stageKey: 'camein' }
    case 'back': case 'retention': return { title: 'Retention', metric: 'reputation', sub: 'Reviews and how people rate you', stageKey: 'back' }
    default: return { title: 'Awareness', metric: 'reach', sub: 'People who saw you on Google and social', stageKey: 'shown' }
  }
}

// Compact "Jun 27" / "Jun 27, 2025" date for a review card. Shows the year only
// when the review isn't from the current calendar year, so most cards stay short.
function reviewDate(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const now = new Date()
  const opts: Intl.DateTimeFormatOptions = d.getFullYear() === now.getFullYear()
    ? { month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric', year: 'numeric' }
  return d.toLocaleDateString('en-US', opts)
}

export default function MvpInsights({ data, loading, error, clientId, initialStageKey }: { data: InsightsData | null; loading: boolean; error: string | null; clientId?: string; initialStageKey?: string }) {
  const router = useRouter()
  const [summary, setSummary] = useState<ReviewSummary | null>(null)
  const [topicsData, setTopicsData] = useState<ReviewTopicsData | null>(null)
  const [topicsLoading, setTopicsLoading] = useState(false)
  const [detail, setDetail] = useState<InsightsDetail | null>(null)
  // active (shipped) campaigns grouped by the stage they work on → "campaigns working on this"
  const [campaigns, setCampaigns] = useState<Record<string, StageCampaign[]> | null>(null)

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

  // Active campaigns grouped by stage → the "campaigns working on this" section
  // under each stage's graph. Same client-id-only keying; a quiet failure hides it.
  useEffect(() => {
    if (!clientId) return
    let live = true
    setCampaigns(null)
    fetch(`/api/dashboard/insights-campaigns?clientId=${clientId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (live && j) setCampaigns(j.stages) })
      .catch(() => { /* leave the section quiet on failure */ })
    return () => { live = false }
  }, [clientId])

  const back = () => { if (typeof window !== 'undefined' && window.history.length > 1) router.back(); else router.push('/dashboard') }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: '#f0f0f3', display: 'flex', justifyContent: 'center' }}>
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
          <Body data={data} focusKey={initialStageKey} summary={summary} topicsData={topicsData} topicsLoading={topicsLoading} detail={detail} clientId={clientId} campaigns={campaigns} />
        )}
      </div>
      </div>
    </div>
  )
}

function Body({ data, focusKey, detail, campaigns }: { data: InsightsData; focusKey?: string; summary: ReviewSummary | null; topicsData: ReviewTopicsData | null; topicsLoading: boolean; detail: InsightsDetail | null; clientId?: string; campaigns: Record<string, StageCampaign[]> | null }) {
  const metrics = data.metrics
  const byKey = new Map(metrics.map((m) => [m.key, m]))
  // one tapped funnel stage drives the whole page (no in-page selector). Each stage
  // shows the SAME clean graph the home uses (MetricCard) for its metric; Interest
  // has no Google metric, so it shows the social/content engagement view instead.
  const focus = resolveFocus(focusKey)
  const mv = byKey.get(focus.metric)

  return (
    <div style={{ padding: '14px 18px 44px' }}>

      {/* the tapped stage's own name — reflects the funnel stage you came from */}
      <div style={{ fontFamily: DISPLAY, fontSize: 27, fontWeight: 600, letterSpacing: '-.01em', lineHeight: 1.1 }}>{focus.title}</div>
      {focus.sub && <div style={{ fontSize: 13, color: C.faint, margin: '5px 0 18px' }}>{focus.sub}</div>}

      <StageView stageKey={focus.stageKey} title={focus.title} detail={detail} mv={mv} />

      {/* the live campaigns pushing on THIS stage's number */}
      <StageCampaigns list={campaigns ? (campaigns[focus.stageKey] ?? []) : null} />
    </div>
  )
}

// Route each funnel stage to its reconciling view. Awareness / Interest /
// Customer actions each show a headline that EQUALS the sum of clearly-labeled
// source pieces (built by the tested insights-feed helpers). Orders + Retention
// keep the trusted metric graph.
function StageView({ stageKey, title, detail, mv }: { stageKey: string; title: string; detail: InsightsDetail | null; mv: MetricView | undefined }) {
  switch (stageKey) {
    case 'shown': return <AwarenessStage detail={detail} mv={mv} />
    case 'engaged': return <InterestStage detail={detail} />
    case 'moved': return <ActionsStage detail={detail} mv={mv} />
    case 'camein': return <SalesStage detail={detail} mv={mv} title={title} />
    case 'back': return <RetentionStage detail={detail} mv={mv} title={title} />
    default: return mv ? <MetricCard mv={mv} /> : <NoMetricYet title={title} />
  }
}

// ── Sales — guests served, straight from a register. Every register/delivery
//    source is COMING_SOON today, so the stage COLLAPSES gracefully: Customer
//    actions stays the last real number and this reads as a calm "connect it",
//    never a fake 0. ──
function SalesStage({ detail, mv, title }: { detail: InsightsDetail | null; mv: MetricView | undefined; title: string }) {
  const stage = computedStage(detail, 4)
  // Empty (every register/delivery source COMING_SOON): collapse to the calm
  // "connect your register" state, but still SHOW the coming-soon source cards so
  // the owner sees what's coming, never a blank. No reconcile line (nothing sums).
  if (stage && stage.isEmpty) {
    return (
      <>
        <SalesLocked note={stage.note} />
        <SourceBreakdown stage={stage} unit="Guests served" showReconcile={false} />
      </>
    )
  }
  if (stage) {
    const feed = stageFeedFrom(stage)
    return (
      <>
        <StageHero total={feed.headline} label="Guests served" caption={feed.caption} />
        <SourceBreakdown stage={stage} unit="Guests served" />
      </>
    )
  }
  return mv ? <MetricCard mv={mv} /> : <NoMetricYet title={title} />
}

// ── Retention — repeat guests when a register connects, otherwise new reviews
//    this month (the clearest come-back signal we can honestly see). ──
function RetentionStage({ detail, mv, title }: { detail: InsightsDetail | null; mv: MetricView | undefined; title: string }) {
  const stage = computedStage(detail, 5)
  if (stage && !stage.isEmpty) {
    const feed = stageFeedFrom(stage)
    return (
      <>
        <StageHero total={feed.headline} label="Guests who came back" caption={feed.caption} />
        <SourceBreakdown stage={stage} unit="Came back" />
      </>
    )
  }
  return mv ? <MetricCard mv={mv} /> : <NoMetricYet title={title} />
}

// The graceful Sales collapse: honest about what we cannot see yet, with the one
// door that unlocks it. Actions remains the visible endpoint of the funnel.
function SalesLocked({ note }: { note?: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '44px 24px' }}>
      <div style={{ width: 52, height: 52, borderRadius: 14, background: C.bg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Lock size={22} color={C.faint} /></div>
      <div style={{ fontSize: 15, fontWeight: 600, color: C.ink, marginTop: 14 }}>We cannot see sales yet</div>
      <div style={{ fontSize: 12.5, color: C.faint, marginTop: 6, lineHeight: 1.5, maxWidth: 280, margin: '6px auto 0' }}>{note || 'Connect your register to measure guests and revenue.'}</div>
      <Link href="/dashboard/connect-accounts" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 16, background: C.green, color: '#fff', fontWeight: 700, fontSize: 13, borderRadius: 99, padding: '10px 16px', textDecoration: 'none' }}>Connect your register <ArrowRight size={15} /></Link>
    </div>
  )
}

// ── The stage hero: one big reconciling number + a plain caption of what it's
//    made of. This number ALWAYS equals the sum of the "What feeds this" pieces. ──
function StageHero({ total, label, caption }: { total: number; label: string; caption: string }) {
  return (
    <div>
      <div style={{ fontSize: 15, color: C.mute, fontWeight: 500 }}>{label}</div>
      <div style={{ fontFamily: DISPLAY, fontSize: 47, fontWeight: 500, lineHeight: 1, letterSpacing: '-.02em', color: C.ink, marginTop: 2 }}>{total.toLocaleString()}</div>
      <div style={{ fontSize: 13, color: C.faint, marginTop: 6, lineHeight: 1.45 }}>{caption}</div>
    </div>
  )
}

// ── "What feeds this": every source piece as its own labeled row, adding up to
//    the headline in plain sight. A piece with no connection shows "Not
//    connected" (never silently dropped). Anything NOT part of the total (e.g.
//    audience growth) sits below a clear divider so it can't imply it feeds it. ──
function WhatFeedsThis({ feed, unit }: { feed: StageFeed; unit: string }) {
  const cols = Math.min(4, Math.max(2, feed.pieces.length))
  return (
    <Section title="What feeds this" sub="last 30 days">
      {/* Small boxes, one per source — they add up to the headline in plain sight. */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 8 }}>
        {feed.pieces.map((p) => (
          <div key={p.key} style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 13, padding: '13px 6px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 74, opacity: p.connected ? 1 : 0.6 }}>
            {p.connected
              ? <span style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 600, color: C.ink, letterSpacing: '-.01em' }}>{p.value.toLocaleString()}</span>
              : <span style={{ fontSize: 11, color: C.faint }}>{NOT_CONNECTED}</span>}
            <span style={{ fontSize: 11.5, color: C.mute, lineHeight: 1.3 }}>{p.label}</span>
          </div>
        ))}
      </div>
      {/* the reconcile stays visible: the boxes above add up to this */}
      <div style={{ fontSize: 12.5, color: C.faint, marginTop: 10, textAlign: 'center' }}>Adds up to <b style={{ color: C.greenDk, fontFamily: DISPLAY, fontSize: 14 }}>{feed.headline.toLocaleString()}</b> {unit.toLowerCase()}</div>
      {feed.note.length > 0 && (
        <>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: C.faint, margin: '16px 0 8px' }}>Audience growth · not part of this number</div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(3, Math.max(2, feed.note.length))}, 1fr)`, gap: 8 }}>
            {feed.note.map((p) => (
              <div key={p.key} style={{ background: '#fbfcfb', border: `1px dashed ${C.line}`, borderRadius: 13, padding: '12px 6px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 68 }}>
                {p.connected
                  ? <span style={{ fontFamily: DISPLAY, fontSize: 19, fontWeight: 600, color: C.mute }}>{p.value.toLocaleString()}</span>
                  : <span style={{ fontSize: 11, color: C.faint }}>{NOT_CONNECTED}</span>}
                <span style={{ fontSize: 11, color: C.mute, lineHeight: 1.3 }}>{p.label}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </Section>
  )
}

// en-dash placeholder for an absent number. Deliberately NOT an em dash (house
// style bans em dashes); it reads as "no number here", never a real 0.
const DASH = '–'

// Friendly "Jul 3, 2026" for a manual entry's timestamp; '' when unknown/invalid.
function friendlyDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ── One STATE-AWARE source card. Every source in a stage renders one of these, so
//    the client always sees exactly which sources make up the number and what is
//    missing. Six looks, one per state:
//     CONNECTED+data → the value (hero gets a green accent)
//     CONNECTED+NO_DATA → a calm dash + "no activity yet" (connected, truly zero)
//     AVAILABLE_NOT_CONNECTED → dimmed + "Connect to see" (or the exact config hint)
//     ERROR → alert-tinted + "Reconnect" (never "Connect", never raw error text)
//     COMING_SOON → ghost card + "Coming soon" (never a number)
//     MANUAL_ENTRY → value + a distinct dashed-amber MANUAL tag + who/when line
//    `small` (context / more-detail cards) drops the NO_DATA subline to stay tidy. ──
export function SourceStateCard({ s, hero, small }: { s: StageSourceView; hero?: boolean; small?: boolean }) {
  const base: React.CSSProperties = {
    borderRadius: 13, padding: small ? '11px 6px' : '13px 6px', textAlign: 'center',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: 4, minHeight: small ? 70 : 80,
  }
  const numFs = small ? 19 : 22
  const label = <span style={{ fontSize: small ? 11 : 11.5, color: C.mute, lineHeight: 1.3 }}>{s.shortLabel || s.displayName}</span>
  const num = (v: number, color = C.ink) => <span style={{ fontFamily: DISPLAY, fontSize: numFs, fontWeight: 600, color, letterSpacing: '-.01em' }}>{v.toLocaleString()}</span>
  const dash = <span style={{ fontFamily: DISPLAY, fontSize: numFs, fontWeight: 600, color: C.faint }}>{DASH}</span>

  // MANUAL_ENTRY — a human typed it. DISTINCT on purpose so a client can tell a
  // hand-entered number from a platform one at a glance: dashed amber border, a
  // MANUAL tag, and a subtle who/when line.
  if (s.status === 'MANUAL_ENTRY') {
    const who = s.manualBy ? `entered by ${s.manualBy}` : 'entered by hand'
    const when = friendlyDate(s.manualAt)
    return (
      <div style={{ ...base, background: '#fffdf5', border: `1px dashed ${C.amber}` }}>
        <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: '.07em', color: '#976a12', background: '#fbeecb', borderRadius: 99, padding: '2px 7px' }}>MANUAL</span>
        {s.value != null ? num(s.value) : dash}
        {label}
        <span style={{ fontSize: 9, color: C.faint, lineHeight: 1.3 }}>{who}{when ? ` on ${when}` : ''}</span>
      </div>
    )
  }

  // ERROR — the connection is broken (not absent). Calm alert tint, always
  // "Reconnect", never a raw error string (the reason lives in admin).
  if (s.status === 'ERROR') {
    return (
      <div style={{ ...base, background: C.coralBg, border: `1px solid ${C.coral}44` }}>
        {dash}
        {label}
        <span style={{ fontSize: 10, fontWeight: 700, color: C.coral }}>{sourceActionVerb(s.status) ?? 'Reconnect'}</span>
      </div>
    )
  }

  // COMING_SOON — no adapter yet. Ghost card, never a number.
  if (s.status === 'COMING_SOON') {
    return (
      <div style={{ ...base, background: '#fbfcfb', border: `1px dashed ${C.line}`, opacity: 0.75 }}>
        {label}
        <span style={{ fontSize: 10, color: C.faint }}>Coming soon</span>
      </div>
    )
  }

  // AVAILABLE_NOT_CONNECTED — the integration exists but isn't flowing. Dimmed,
  // with a Connect affordance (or the exact config hint when one is needed, e.g.
  // GA4 menu/order sources that need a path/domain set in settings).
  if (s.status === 'AVAILABLE_NOT_CONNECTED') {
    const cfg = SOURCE_BY_ID[s.id]?.configMissingReason
    return (
      <div style={{ ...base, background: '#fff', border: `0.5px solid ${C.line}`, opacity: 0.6 }}>
        {label}
        <span style={{ fontSize: 10, color: C.greenDk, fontWeight: 600, lineHeight: 1.3 }}>{cfg ?? `${sourceActionVerb(s.status) ?? 'Connect'} to see`}</span>
      </div>
    )
  }

  // CONNECTED + data — a genuine queried number. Hero (the stage's primary
  // sub-metric) gets a light green accent.
  if (s.status === 'CONNECTED' && s.hasData && s.value != null) {
    return (
      <div style={{ ...base, background: hero ? C.greenSoft : '#fff', border: hero ? `1px solid ${C.greenLine}` : `0.5px solid ${C.line}` }}>
        {num(s.value, hero ? C.greenDk : C.ink)}
        {label}
      </div>
    )
  }

  // CONNECTED + NO_DATA — connected and genuinely zero. A dash (never a real 0)
  // plus a calm hint so it never reads as broken.
  return (
    <div style={{ ...base, background: '#fff', border: `0.5px solid ${C.line}` }}>
      {dash}
      {label}
      {!small && <span style={{ fontSize: 9.5, color: C.faint }}>no activity yet</span>}
    </div>
  )
}

// A clearly-separated group of source cards that are NOT in the headline sum
// (context / drill-downs). Its own heading keeps them from implying they feed it.
function SeparatedSources({ title, sources }: { title: string; sources: StageSourceView[] }) {
  const cols = Math.min(3, Math.max(2, sources.length))
  return (
    <>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: C.faint, margin: '16px 0 8px' }}>{title}</div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 8 }}>
        {sources.map((s) => <SourceStateCard key={s.id} s={s} small />)}
      </div>
    </>
  )
}

// ── State-aware "What feeds this": ONE card per source, straight from the honest
//    computed stage (headline == sum of CONNECTED/counted sources). The counted
//    sources sit in the sum group and add up to the headline in plain sight;
//    context (audience growth, revenue) and drill-downs are shown but clearly
//    separated so they never imply they feed the number. No source is dropped. ──
export function SourceBreakdown({ stage, unit, showReconcile = true }: { stage: ComputedStage; unit: string; showReconcile?: boolean }) {
  const sums = stage.sources.filter((s) => s.feedRole === 'sum')
  const context = stage.sources.filter((s) => s.feedRole === 'context')
  const drills = stage.sources.filter((s) => s.feedRole === 'drilldown')
  const headline = stage.headline ?? 0
  const cols = Math.min(4, Math.max(2, sums.length))
  return (
    <Section title="What feeds this" sub="last 30 days">
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 8 }}>
        {sums.map((s) => <SourceStateCard key={s.id} s={s} hero={s.isHero} />)}
      </div>
      {showReconcile && (
        <div style={{ fontSize: 12.5, color: C.faint, marginTop: 10, textAlign: 'center' }}>Adds up to <b style={{ color: C.greenDk, fontFamily: DISPLAY, fontSize: 14 }}>{headline.toLocaleString()}</b> {unit.toLowerCase()}</div>
      )}
      {context.length > 0 && <SeparatedSources title="Also tracked · not part of this number" sources={context} />}
      {drills.length > 0 && <SeparatedSources title="More detail · not part of this number" sources={drills} />}
    </Section>
  )
}

// A trend graph for a stage (per-day bars over a range). Reuses the home chart so
// the two surfaces match. It's a TREND under its own "over time" heading, kept
// separate from the reconciling headline above it.
function StageTrend({ mv, noun }: { mv: MetricView; noun: string }) {
  const { range, setRange, cStart, setCStart, cEnd, setCEnd, summary } = useChartRange(mv)
  return (
    <Section title="Over time">
      <ActionsChart range={range} setRange={setRange} cStart={cStart} setCStart={setCStart} cEnd={cEnd} setCEnd={setCEnd} summary={summary} noun={noun} />
    </Section>
  )
}

// Calm placeholder while the breakdown data is still loading in.
function FeedLoading() {
  return <div style={{ fontSize: 13, color: C.faint, padding: '24px 0' }}>Adding up your sources&hellip;</div>
}

// ── Awareness — who saw you. Headline = Google Maps + Google Search + Social
//    reach, shown as three labeled pieces that add up to it. ──
function AwarenessStage({ detail, mv }: { detail: InsightsDetail | null; mv: MetricView | undefined }) {
  if (!detail) return <FeedLoading />
  // Phase 2: drive the boxes from the honest computed stage (headline == sum of
  // CONNECTED sources) when present; fall back to the legacy feed builder.
  const cs = computedStage(detail, 1)
  const feed = cs ? stageFeedFrom(cs) : buildAwarenessFeed(toFeedInput(detail))
  return (
    <>
      {mv && <StageTrend mv={mv} noun="saw you" />}
      <StageHero total={feed.headline} label="Times you showed up" caption={feed.caption} />
      {cs ? <SourceBreakdown stage={cs} unit="Times you showed up" /> : <WhatFeedsThis feed={feed} unit="Times you showed up" />}
      {detail.topQueries.length > 0 && <TopSearches queries={detail.topQueries} />}
      {!detail.socialConnected && <ConnectSocial connected={false} />}
    </>
  )
}

// ── Interest — who looked closer. Headline = Profile visits + Post engagement.
//    New followers rides along as clearly-separated audience growth. ──
function InterestStage({ detail }: { detail: InsightsDetail | null }) {
  if (!detail) return <FeedLoading />
  const cs = computedStage(detail, 2)
  const feed = cs ? stageFeedFrom(cs) : buildInterestFeed(toFeedInput(detail))
  return (
    <>
      <StageHero total={feed.headline} label="People who looked closer" caption={feed.caption} />
      {cs ? <SourceBreakdown stage={cs} unit="Looked closer" /> : <WhatFeedsThis feed={feed} unit="Looked closer" />}
      {detail.topPosts.length > 0 && <BestPosts posts={detail.topPosts} />}
      {!detail.socialConnected && <ConnectSocial connected={false} />}
    </>
  )
}

// ── Customer actions — the moves people made on Google (directions, calls,
//    website taps). One source, still labeled per action. ──
function ActionsStage({ detail, mv }: { detail: InsightsDetail | null; mv: MetricView | undefined }) {
  if (!detail) return <FeedLoading />
  const cs = computedStage(detail, 3)
  const feed = cs ? stageFeedFrom(cs) : buildActionsFeed(toFeedInput(detail))
  return (
    <>
      {mv && <StageTrend mv={mv} noun="took action" />}
      <StageHero total={feed.headline} label="Moves people made" caption={feed.caption} />
      {cs ? <SourceBreakdown stage={cs} unit="Moves people made" /> : <WhatFeedsThis feed={feed} unit="Moves people made" />}
    </>
  )
}

// ── "Campaigns working on this" — the shipped campaigns whose live pieces push on
//    this stage's number, each a tap into its campaign. A calm prompt when none. ──
function StageCampaigns({ list }: { list: StageCampaign[] | null }) {
  if (list === null) return null // stay quiet until the fetch lands
  const MAX = 3
  const shown = list.slice(0, MAX)
  const extra = list.length - shown.length
  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: C.mute, marginBottom: 12 }}>Campaigns working on this</div>
      {list.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {shown.map((c) => (
            <Link key={c.id} href={`/dashboard/campaigns/${c.id}`} style={{ display: 'flex', alignItems: 'center', gap: 11, background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 14, padding: 12, textDecoration: 'none', color: 'inherit' }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: C.greenSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Megaphone size={16} color={C.greenDk} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                <div style={{ fontSize: 11, color: C.greenDk, display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 1 }}><span style={{ width: 6, height: 6, borderRadius: 99, background: C.green }} />Live</div>
              </div>
              <ChevronRight size={16} color={C.faint} style={{ flexShrink: 0 }} />
            </Link>
          ))}
          {extra > 0 && (
            <Link href="/dashboard/campaigns" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 2, fontSize: 12.5, fontWeight: 600, color: C.greenDk, textDecoration: 'none' }}>{extra} more working on this <ChevronRight size={15} /></Link>
          )}
        </div>
      ) : (
        <Link href="/dashboard/campaigns" style={{ display: 'flex', alignItems: 'center', gap: 11, background: '#fbfcfb', border: `1px dashed ${C.greenLine}`, borderRadius: 14, padding: 14, textDecoration: 'none', color: 'inherit' }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: C.greenSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Megaphone size={16} color={C.greenDk} /></div>
          <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: C.mute, lineHeight: 1.4 }}>No live campaign on this yet. <span style={{ color: C.greenDk, fontWeight: 600 }}>Start one →</span></div>
        </Link>
      )}
    </div>
  )
}

// Clean empty state for a stage whose metric has no data yet (e.g. no bookings or
// no reviews) — keeps the page reading as present instead of blank.
function NoMetricYet({ title }: { title: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 24px' }}>
      <div style={{ width: 52, height: 52, borderRadius: 14, background: C.greenSoft, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><BarChart3 size={24} color={C.greenDk} /></div>
      <div style={{ fontSize: 15, fontWeight: 600, color: C.ink, marginTop: 14 }}>No {title.toLowerCase()} numbers yet</div>
      <div style={{ fontSize: 12.5, color: C.faint, marginTop: 6, lineHeight: 1.5, maxWidth: 260, margin: '6px auto 0' }}>This graph fills in as soon as there&apos;s data for this stage.</div>
    </div>
  )
}

// ── Journey overview — placeholder until the whole-path view is designed. ──
function JourneyEmpty() {
  return (
    <div style={{ textAlign: 'center', padding: '52px 24px' }}>
      <div style={{ width: 52, height: 52, borderRadius: 14, background: C.greenSoft, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Route size={26} color={C.greenDk} /></div>
      <div style={{ fontSize: 15, fontWeight: 600, color: C.ink, marginTop: 14 }}>Your full customer journey</div>
      <div style={{ fontSize: 12.5, color: C.faint, marginTop: 6, lineHeight: 1.5, maxWidth: 260, margin: '6px auto 0' }}>The whole path in one view, from first showing up to coming back. Coming soon.</div>
    </div>
  )
}

// ── Engagement (interest) — who looked closer before acting: posts, photos,
//    social. Thin until social is connected, so it leans on posts + a prompt. ──
function EngagementView({ detail }: { detail: InsightsDetail | null }) {
  const posts = detail?.topPosts ?? []
  return (
    <>
      {posts.length > 0 && <BestPosts posts={posts} />}
      <Section title="Who looked closer">
        <div style={{ fontSize: 12.5, color: C.mute, lineHeight: 1.5 }}>Engagement is the middle of the journey: people who looked closer before acting. Your posts, photos, and profile taps live here.</div>
      </Section>
      {!detail?.socialConnected && <ConnectSocial connected={false} />}
    </>
  )
}

// ── Intent — the real buy signals people leave on Google: directions, website
//    taps, calls. Directions means someone is coming. ──
function IntentView({ detail }: { detail: InsightsDetail | null }) {
  const a = detail?.actions
  if (!a) return null
  const moves = a.directions + a.calls + a.websiteClicks
  if (moves <= 0) return null
  const items = [
    { label: 'Asked for directions', value: a.directions },
    { label: 'Tapped your website', value: a.websiteClicks },
    { label: 'Called you', value: a.calls },
  ].filter((x) => x.value > 0).sort((x, y) => y.value - x.value)
  const max = Math.max(1, ...items.map((x) => x.value))
  return (
    <Section title="Who made a move" sub="last 30 days">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.map((x) => (
          <div key={x.label}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 12.5, color: C.ink }}>{x.label}</span>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: C.ink, fontFamily: DISPLAY }}>{x.value.toLocaleString()}</span>
            </div>
            <div style={{ height: 8, borderRadius: 99, background: C.bg, overflow: 'hidden' }}>
              <div style={{ width: `${Math.max(6, Math.round((x.value / max) * 100))}%`, height: '100%', borderRadius: 99, background: `linear-gradient(90deg, ${C.green}, ${C.greenDk})` }} />
            </div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11.5, color: C.faint, marginTop: 12, lineHeight: 1.45 }}>These are the strongest buy signals Google gives you. Directions means someone is on their way.</div>
    </Section>
  )
}

// ── Retention (loyalty) — reviews are the clearest repeat-customer signal we
//    have: happy regulars leave them, and reputation drives who comes back. ──
function RetentionView({ data, summary, topicsData, topicsLoading }: { data: InsightsData; summary: ReviewSummary | null; topicsData: ReviewTopicsData | null; topicsLoading: boolean }) {
  return (
    <>
      <ReviewHero avgRating={data.avgRating} summary={summary} />
      {summary && <ReviewSources sources={summary.sources} googleCount={summary.placeRatingCount} />}
      <ReviewSentiment topics={topicsData} loading={topicsLoading} />
      {summary && summary.byMonth.length >= 2 && <RatingOverTime byMonth={summary.byMonth} recent={summary.recent ?? []} />}
      {data.reviews.length > 0 && (
        <Section title="Latest reviews" action={{ label: 'See all', href: '/dashboard/inbox?tab=reviews' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[...data.reviews]
              .sort((a, b) => String(b.postedAt).localeCompare(String(a.postedAt)))
              .slice(0, 3)
              .map((r) => {
                const tint = r.rating >= 4 ? C.green : r.rating <= 2 ? C.coral : C.faint
                return (
                  <Link key={r.id} href={`/dashboard/reviews/${r.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block', background: '#fff', border: `0.5px solid ${C.line}`, borderLeft: `3px solid ${tint}`, borderRadius: 14, padding: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{r.authorName}</span>
                      <Stars n={r.rating} />
                      <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {reviewDate(r.postedAt) && <span style={{ fontSize: 11, color: C.faint, whiteSpace: 'nowrap' }}>{reviewDate(r.postedAt)}</span>}
                        {r.replied
                          ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 10, fontWeight: 700, color: C.greenDk, background: C.greenSoft, borderRadius: 99, padding: '2px 8px' }}><Check size={11} />Replied</span>
                          : r.needsReply && <span style={{ fontSize: 10, fontWeight: 700, color: C.coral, background: C.coralBg, borderRadius: 99, padding: '2px 8px' }}>Reply</span>}
                        <ChevronRight size={15} color={C.faint} />
                      </span>
                    </div>
                    {r.text
                      ? <div style={{ fontSize: 12.5, color: C.mute, lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{r.text}</div>
                      : <div style={{ fontSize: 12, color: C.faint, fontStyle: 'italic' }}>Rated {r.rating}&#9733;, no written comment.</div>}
                    {r.response && (
                      <div style={{ marginTop: 8, paddingLeft: 10, borderLeft: `2px solid ${C.greenLine}` }}>
                        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: C.greenDk, marginBottom: 3 }}>Your reply</div>
                        <div style={{ fontSize: 12, color: C.mute, lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{r.response}</div>
                      </div>
                    )}
                  </Link>
                )
              })}
          </div>
        </Section>
      )}
    </>
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
// ── Where people find you: Google Maps vs Search (the one split that is real
//    brand-awareness insight), the mobile fact folded to a caption, and the
//    social channel wired in but quiet until a social account syncs. ──
function ReachChannels({ detail }: { detail: InsightsDetail | null }) {
  const v = detail?.views
  // Google-only impressions — this tab is Google-framed, so it never counts the social reach
  // that `total` now folds in. Falls back to total for older payloads with no split.
  const g = v ? (v.google ?? v.total) : 0
  if (!v || g <= 0) return null
  const mapsPct = Math.round((v.maps / g) * 100)
  const fy = detail?.findYou
  const mobile = fy ? fy.searchMobile + fy.mapsMobile : 0
  const desktop = fy ? fy.searchDesktop + fy.mapsDesktop : 0
  const mobilePct = mobile + desktop > 0 ? Math.round((mobile / (mobile + desktop)) * 100) : null
  const social = detail?.socialReach ?? 0
  return (
    <Section title="Where people find you" sub="last 30 days">
      <SplitBar left={{ label: 'Google Maps', value: v.maps, color: C.green }} right={{ label: 'Search', value: v.search, color: C.greenDk }} total={g} />
      <div style={{ fontSize: 12.5, color: C.mute, marginTop: 12, lineHeight: 1.45 }}>
        <b style={{ color: C.ink, fontWeight: 600 }}>{mapsPct}%</b> of the time people find you on Google Maps. Your spot on the map is how new people discover you.
      </div>
      {mobilePct != null && <div style={{ fontSize: 11.5, color: C.faint, marginTop: 4 }}>Almost all on a phone ({mobilePct}%).</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, paddingTop: 12, borderTop: `0.5px solid ${C.line}` }}>
        <Share2 size={14} color={C.faint} />
        <span style={{ fontSize: 12.5, color: C.mute }}>Social reach</span>
        <span style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 600, color: social > 0 ? C.ink : C.faint }}>{social > 0 ? social.toLocaleString() : 'Not connected'}</span>
      </div>
    </Section>
  )
}

// ── The full funnel bridge: "Did being seen turn into anything?"
//    A vertical spine with three honesty zones the owner can tell apart at a
//    glance: a MEASURED green top read straight from Google (Showed up -> Made a
//    move), an owner-built ESTIMATE middle in a dashed style driven by two dials
//    the owner sets (walk-in rate + average spend), and a LOCKED grey bottom
//    (Came back) that shows the stage exists but never a number until a register
//    connects. Honest by construction: money is only ever the product of the
//    owner's own two inputs (shown as a spelled-out "about"), retention has no
//    estimate path, and every unmeasured stage carries a "measure it for real"
//    door. "Came in" is framed as visits FROM GOOGLE (the slice Google can see),
//    not total footfall, and is driven by directions only — the clearest
//    intent-to-visit signal. ──
function round100(n: number): number { return Math.round(n / 100) * 100 }

function FunnelSpine({ detail, storageKey }: { detail: InsightsDetail | null; storageKey: string }) {
  const rateKey = `apnosh.funnel.rate.${storageKey}`
  const ticketKey = `apnosh.funnel.ticket.${storageKey}`
  const [walkInRate, setWalkInRate] = useState(0.5)
  const [avgTicket, setAvgTicket] = useState<number | null>(null)
  useEffect(() => {
    try {
      const r = localStorage.getItem(rateKey)
      if (r != null && r !== '') setWalkInRate(Math.min(0.9, Math.max(0.1, Number(r) || 0.5)))
      const t = localStorage.getItem(ticketKey)
      if (t != null && t !== '') setAvgTicket(Number(t) || null)
    } catch { /* no storage — defaults stand */ }
  }, [rateKey, ticketKey])
  const saveRate = (v: number) => { setWalkInRate(v); try { localStorage.setItem(rateKey, String(v)) } catch { /* ignore */ } }
  const saveTicket = (v: number | null) => { setAvgTicket(v); try { localStorage.setItem(ticketKey, v == null ? '' : String(v)) } catch { /* ignore */ } }

  const v = detail?.views
  const a = detail?.actions
  // Google-only impressions — this funnel's "Showed up" number wears a "Real · Google" pill,
  // so it must not include the social reach that `total` now folds in.
  const g = v ? (v.google ?? v.total) : 0
  if (!v || !a || g <= 0) return null
  const { directions, calls, websiteClicks } = a
  const madeMove = directions + calls + websiteClicks
  const actRate = g > 0 ? Math.round((madeMove / g) * 100) : 0
  const ratePct = Math.round(walkInRate * 100)
  const visits = Math.round(directions * walkInRate)
  const revenue = avgTicket != null && avgTicket > 0 ? round100(visits * avgTicket) : null

  const row = (w: string): React.CSSProperties => ({ width: w, margin: '0 auto' })
  const cardBase: React.CSSProperties = { borderRadius: 14, padding: 12, display: 'flex', alignItems: 'center', gap: 11 }
  const measured: React.CSSProperties = { ...cardBase, background: C.greenSoft, border: `1px solid ${C.greenLine}` }
  const estimate: React.CSSProperties = { ...cardBase, background: '#fff', border: `1px dashed ${C.faint}` }
  const locked: React.CSSProperties = { ...cardBase, background: C.bg, border: `1px dashed ${C.line}` }
  const tile = (bg: string): React.CSSProperties => ({ width: 34, height: 34, borderRadius: 9, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 })
  const bignum: React.CSSProperties = { fontFamily: DISPLAY, fontSize: 22, fontWeight: 500, lineHeight: 1, color: C.ink }
  const realPill = <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, color: C.greenDk }}><Check size={11} />Real · Google</span>
  const aboutPill = <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, color: C.mute }}><SlidersHorizontal size={10} />About · your math</span>
  const arrow = <div style={{ textAlign: 'center', color: C.faint, fontSize: 12, padding: '4px 0' }}>↓</div>

  return (
    <Section title="Did being seen turn into anything?" sub="last 30 days">
      <div style={{ display: 'flex', flexDirection: 'column' }}>

        {/* 1 — Showed up (measured) */}
        <div style={row('100%')}>
          <div style={measured}>
            <div style={tile('#fff')}><Eye size={18} color={C.greenDk} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>Showed up</div>
              <div style={{ fontSize: 11, color: C.mute }}>how many times you popped up</div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={bignum}>{g.toLocaleString()}</div>
              <div style={{ marginTop: 3 }}>{realPill}</div>
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'center', fontSize: 11, color: C.faint, padding: '5px 0' }}>↓ about {actRate} in 100 did something next</div>

        {/* 2 — Made a move (measured) */}
        <div style={row('96%')}>
          <div style={measured}>
            <div style={tile('#fff')}><MousePointerClick size={18} color={C.greenDk} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>Made a move</div>
              <div style={{ fontSize: 11, color: C.mute }}>directions {directions.toLocaleString()} · site {websiteClicks.toLocaleString()} · calls {calls.toLocaleString()}</div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={bignum}>{madeMove.toLocaleString()}</div>
              <div style={{ marginTop: 3 }}>{realPill}</div>
            </div>
          </div>
        </div>

        {/* seam — the owner's two dials */}
        <div style={{ ...row('92%'), marginTop: 12, marginBottom: 12 }}>
          <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: '13px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 11 }}>
              <SlidersHorizontal size={15} color={C.mute} />
              <span style={{ fontSize: 12.5, fontWeight: 700, color: C.ink }}>Your numbers, your call</span>
            </div>
            <div style={{ fontSize: 11.5, color: C.mute, marginBottom: 6 }}>Walk-in rate · share who got directions that came in</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 13 }}>
              <input type="range" min={10} max={90} value={ratePct} onChange={(e) => saveRate(Number(e.target.value) / 100)} style={{ flex: 1, accentColor: C.green }} aria-label="Walk-in rate" />
              <span style={{ fontSize: 13, fontWeight: 700, color: C.ink, width: 40, textAlign: 'right' }}>{ratePct}%</span>
            </div>
            <div style={{ fontSize: 11.5, color: C.mute, marginBottom: 6 }}>Average spend per visit</div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${C.line}`, borderRadius: 10, padding: '6px 11px' }}>
              <span style={{ fontSize: 14, color: C.faint }}>$</span>
              <input type="number" inputMode="numeric" placeholder="—" value={avgTicket ?? ''} onChange={(e) => saveTicket(e.target.value === '' ? null : Math.max(0, Number(e.target.value)))} style={{ width: 60, border: 'none', outline: 'none', fontSize: 14, fontWeight: 600, color: C.ink, background: 'transparent', padding: 0 }} aria-label="Average spend per visit" />
            </div>
            <div style={{ fontSize: 10.5, color: C.faint, marginTop: 10, lineHeight: 1.45 }}>Starting guesses. Set them to what you see on your floor.</div>
          </div>
        </div>

        {/* 3 — Came in from Google (estimate) */}
        <div style={row('88%')}>
          <div style={estimate}>
            <div style={tile(C.bg)}><Footprints size={18} color={C.mute} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>Came in</div>
              <div style={{ fontSize: 11, color: C.faint }}>{directions.toLocaleString()} directions × {ratePct}%</div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={bignum}>~{visits.toLocaleString()}</div>
              <div style={{ marginTop: 3 }}>{aboutPill}</div>
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'center', padding: '5px 0' }}>
          <Link href="/campaigns/new" style={{ fontSize: 11, color: C.greenDk, textDecoration: 'none', fontWeight: 600 }}>Measure it for real with a check-in offer →</Link>
        </div>

        {/* 4 — Spent money (estimate, or prompt if no ticket) */}
        <div style={row('82%')}>
          <div style={estimate}>
            <div style={tile(C.bg)}><ShoppingBag size={18} color={C.mute} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>Spent money</div>
              <div style={{ fontSize: 11, color: C.faint }}>{revenue != null ? <>~{visits.toLocaleString()} visits × ${avgTicket}</> : 'add your average spend above'}</div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              {revenue != null
                ? <><div style={bignum}>~${revenue.toLocaleString()}</div><div style={{ marginTop: 3 }}>{aboutPill}</div></>
                : <span style={{ fontSize: 11, color: C.mute, fontStyle: 'italic' }}>set spend ↑</span>}
            </div>
          </div>
        </div>

        {arrow}

        {/* 5 — Came back (locked) */}
        <div style={row('76%')}>
          <Link href="/dashboard/connect-accounts" style={{ ...locked, textDecoration: 'none', color: 'inherit' }}>
            <div style={tile('#fff')}><Repeat size={17} color={C.faint} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.mute }}>Came back</div>
              <div style={{ fontSize: 11, color: C.faint }}>connect a register to measure this</div>
            </div>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: C.mute, border: `1px solid ${C.line}`, borderRadius: 99, padding: '3px 10px', flexShrink: 0 }}><Lock size={11} />Connect</span>
          </Link>
        </div>

      </div>

      <div style={{ display: 'flex', gap: 14, justifyContent: 'center', marginTop: 14, fontSize: 10, color: C.mute }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Check size={11} color={C.greenDk} />real</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><SlidersHorizontal size={11} />about (your math)</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Lock size={11} color={C.faint} />locked</span>
      </div>
    </Section>
  )
}

// ── The one lever: more reviews lift your Maps rank, which is how new people
//    find you. Bridges the numbers to a real action (the review-request kit). ──
function GrowAwareness({ rating, reviewCount, detail }: { rating: number | null; reviewCount: number; detail: InsightsDetail | null }) {
  const v = detail?.views
  // Google-only denominator — this "views from Maps" fact is Google, not the social-inclusive total.
  const g = v ? (v.google ?? v.total) : 0
  const mapsPct = v && g > 0 ? Math.round((v.maps / g) * 100) : null
  return (
    <Section title="Get seen by more people">
      <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, padding: 16 }}>
        <div style={{ fontSize: 13, color: C.mute, lineHeight: 1.5 }}>
          {mapsPct != null && <>Most of your views come from Google Maps ({mapsPct}%). </>}
          On Maps, fresh reviews push you up the list, and that is the biggest driver of new people finding you.
          {rating != null && reviewCount > 0 && <> You are at <b style={{ color: C.ink, fontWeight: 600 }}>{rating}&#9733; from {reviewCount.toLocaleString()} reviews</b>.</>}
        </div>
        <Link href="/dashboard/inbox?tab=reviews" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 14, background: C.green, color: '#fff', fontWeight: 700, fontSize: 13, borderRadius: 99, padding: '10px 16px', textDecoration: 'none' }}>
          See your reviews <ArrowRight size={15} />
        </Link>
      </div>
    </Section>
  )
}

// ── Connect social to add that channel to this tab. Only shows when no social
//    account is synced yet, so the data flow is ready the moment it connects. ──
function ConnectSocial({ connected }: { connected: boolean }) {
  if (connected) return null
  return (
    <Section title="See your social reach here">
      <Link href="/dashboard/connect-accounts" style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, padding: 14, textDecoration: 'none', color: 'inherit' }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: C.greenSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Share2 size={18} color={C.greenDk} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>Connect Instagram</div>
          <div style={{ fontSize: 12, color: C.mute, marginTop: 2, lineHeight: 1.4 }}>Right now this counts Google only. Connect your socials to add their reach here.</div>
        </div>
        <ChevronRight size={16} color={C.faint} style={{ flexShrink: 0 }} />
      </Link>
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
                {p.postedAt && reviewDate(p.postedAt) && <span style={{ marginLeft: 'auto', fontSize: 11, color: C.faint, whiteSpace: 'nowrap' }}>{reviewDate(p.postedAt)}</span>}
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
      <Section title="What customers are saying">
        <div style={{ background: '#fbfcfb', border: `0.5px solid ${C.line}`, borderRadius: 14, padding: 14, fontSize: 13, color: C.faint }}>
          {loading ? 'Reading your reviews…' : 'A few written reviews and we can pull out the topics guests mention.'}
        </div>
      </Section>
    )
  }
  return (
    <Section title="What customers are saying">
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
            {(t.quote || (t.negQuote && t.negative > 0)) && (
              <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {t.quote && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                    <span style={{ width: 6, height: 6, borderRadius: 99, background: C.green, marginTop: 5, flexShrink: 0 }} />
                    <span style={{ fontSize: 11.5, color: C.faint, fontStyle: 'italic', lineHeight: 1.4 }}>&ldquo;{t.quote}&rdquo;</span>
                  </div>
                )}
                {t.negQuote && t.negative > 0 && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, justifyContent: 'flex-end' }}>
                    <span style={{ fontSize: 11.5, color: C.faint, fontStyle: 'italic', lineHeight: 1.4, textAlign: 'right' }}>&ldquo;{t.negQuote}&rdquo;</span>
                    <span style={{ width: 6, height: 6, borderRadius: 99, background: C.coral, marginTop: 5, flexShrink: 0 }} />
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Reviews hero: average rating + star histogram (replaces the time chart, since
//    a review's day-to-day timing is noise; the trends that matter are monthly) ──
function ReviewHero({ avgRating, summary }: { avgRating: number | null; summary: ReviewSummary | null }) {
  const stars = summary?.stars ?? null
  // Average from the histogram we've pulled; the headline prefers Google's
  // authoritative place rating when we have it.
  let sampleAvg = avgRating
  let sampleTotal = 0
  if (stars) {
    let sum = 0; let n = 0
    for (const k of [1, 2, 3, 4, 5]) { const c = stars[String(k)] ?? 0; sum += k * c; n += c }
    if (n > 0) sampleAvg = Math.round((sum / n) * 10) / 10
    sampleTotal = n
  }
  const shownAvg = summary?.placeRating ?? sampleAvg
  return (
    <div>
      <div style={{ fontSize: 14, color: C.mute, fontWeight: 500 }}>Your rating</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginTop: 3 }}>
        <span style={{ fontFamily: DISPLAY, fontSize: 46, fontWeight: 500, lineHeight: 1, letterSpacing: '-.02em' }}>{shownAvg != null ? shownAvg.toFixed(1) : '—'}</span>
        <span style={{ marginBottom: 8 }}><Stars n={shownAvg ?? 0} /></span>
      </div>
      {stars && sampleTotal > 0 ? (
        <div style={{ marginTop: 18 }}><StarBars stars={stars} /></div>
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

const MONTHS3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function monLabel(ym: string): string { const m = Number(ym.split('-')[1]); return MONTHS3[m - 1] ?? ym }

// ── A bar per month (last 12), height = review count. Tap a bar to see the month
//    + count. Zero-review months show as a faint stub so gaps are visible. ──
function CountBars({ months }: { months: { ym: string; count: number }[] }) {
  const [picked, setPicked] = useState<number | null>(null)
  const H = 54
  const n = months.length
  const max = Math.max(1, ...months.map((m) => m.count))
  const fmtMonth = (ym: string) => { const [y, mm] = ym.split('-'); return `${MONTHS3[Number(mm) - 1] ?? ym} ${y}` }
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: H }}>
      {months.map((mo, i) => {
        const h = mo.count > 0 ? Math.max(4, Math.round((mo.count / max) * (H - 4))) : 2
        const isPicked = picked === i
        const color = mo.count === 0 ? C.line : i === n - 1 ? C.greenDk : C.green
        const edge = i < 2 ? 'left' : i > n - 3 ? 'right' : 'mid'
        return (
          <div key={i} onClick={() => setPicked(isPicked ? null : i)} style={{ flex: 1, minWidth: 0, height: '100%', position: 'relative', display: 'flex', alignItems: 'flex-end', cursor: 'pointer' }}>
            <div style={{ width: '100%', height: h, borderRadius: 4, background: color, opacity: picked === null || isPicked ? 1 : 0.4, transition: 'opacity .15s' }} />
            {isPicked && (
              <div style={{ position: 'absolute', bottom: '100%', marginBottom: 6, ...(edge === 'mid' ? { left: '50%', transform: 'translateX(-50%)' } : edge === 'left' ? { left: 0 } : { right: 0 }), background: C.ink, color: '#fff', borderRadius: 8, padding: '7px 10px', whiteSpace: 'nowrap', zIndex: 5, lineHeight: 1.4, textAlign: 'left' }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{fmtMonth(mo.ym)}</div>
                <div style={{ fontSize: 10.5, opacity: 0.8, marginTop: 1 }}>{mo.count} review{mo.count === 1 ? '' : 's'}</div>
              </div>
            )}
          </div>
        )
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
function RatingOverTime({ byMonth, recent }: { byMonth: { ym: string; count: number }[]; recent: { rating: number; date: string }[] }) {
  const months = byMonth.map((m) => m.ym)
  const total12 = byMonth.reduce((s, m) => s + m.count, 0)
  const avgPerMonth = byMonth.length ? Math.round((total12 / byMonth.length) * 10) / 10 : 0
  const olderSum = byMonth.slice(0, Math.floor(byMonth.length / 2)).reduce((s, m) => s + m.count, 0)
  const newerSum = byMonth.slice(Math.floor(byMonth.length / 2)).reduce((s, m) => s + m.count, 0)
  const volDir: 'up' | 'down' | 'flat' = newerSum > olderSum ? 'up' : newerSum < olderSum ? 'down' : 'flat'
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
        </div>
      )}

      {/* New reviews — last 12 months, each bar a month (tap for the count) */}
      <div style={{ ...card, marginTop: scores.length > 0 ? 10 : 0 }}>
        <div style={head}>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
            <span style={title}>Reviews a month</span>
            <span style={big}>{avgPerMonth}</span>
          </span>
          <TrendPill dir={volDir} />
        </div>
        <CountBars months={byMonth} />
        <MonthAxis months={months} />
      </div>
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
    <Section title="Where reviews come from">
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
