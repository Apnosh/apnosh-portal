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

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import MvpShell from './mvp-shell'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { usePullToRefresh, PullIndicator } from './pull-to-refresh'
import {
  ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Minus, Star,
  Eye, MousePointerClick, CalendarDays, Mail, BarChart3,
  Search, ExternalLink, Image as ImageIcon, Check,
  Share2, ArrowRight,
  Footprints, ShoppingBag, Repeat, Lock, SlidersHorizontal,
  Route, Heart, Megaphone, Sparkles, Info, Globe, Store, ArrowUpRight, FileText,
} from 'lucide-react'
import { HUES, STAGE_HUES, type HueKey } from './hues'
import { Mark } from './mark'
import type { StageCampaign } from '@/lib/dashboard/get-stage-campaigns'
import { useClient } from '@/lib/client-context'
import { isProTier } from '@/lib/entitlements'
import { ActionsChart, MetricCard, SourceCard, useChartRange, isFresh, relDate, deltaLabel, deltaSub, bucketsFor, type MetricView, type ChartRange } from './mvp-home'
import { TopSegmented } from './top-row'
import ProofDeck from './proof-deck'
import { bandFor, BAND_WORD, BAND_INK, type HealthBand } from './home-funnel'
import { deriveStandouts } from '@/lib/insights/analyst-derive'
import { buildAwarenessFeed, buildInterestFeed, buildActionsFeed, stageFeedFrom, NOT_CONNECTED, type FeedInput, type StageFeed } from '@/lib/dashboard/insights-feed'
import type { ComputedStage, StageSourceView, StageGroup } from '@/lib/insights/compute-stages'
import { sourceActionVerb, SOURCE_BY_ID } from '@/lib/insights/source-registry'

/* the browser's local calendar date — the server must never guess the client's timezone */
function localYmdOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function localYmd(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}


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
export interface InsightsPost { id: string; platform: string; permalink: string | null; thumbnailUrl: string | null; type: string; reach: number; /** the vendor has not finished syncing this post's numbers — show that, never a false 0 */ pending?: boolean; /** this post kind never reports reach (e.g. a Story) — an absence, not a zero */ unreported?: boolean; likes: number; saves: number; postedAt: string | null }
interface InsightsDetail {
  findYou: { searchMobile: number; searchDesktop: number; mapsMobile: number; mapsDesktop: number } | null
  topQueries: { query: string; impressions: number }[]
  topPosts: InsightsPost[]
  /** total posts we hold, so "view all" can state a true count */
  postCount?: number
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
    case 'moved': case 'intent': return { title: 'Actions', metric: 'interactions', sub: 'Calls, directions, clicks, and likes', stageKey: 'moved' }
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
  const [tab, setTab] = useState<'insights' | 'trends'>('insights') // Insights | Trends, the top row's two tabs (owner 2026-09-04)

  const [summary, setSummary] = useState<ReviewSummary | null>(null)
  const [topicsData, setTopicsData] = useState<ReviewTopicsData | null>(null)
  const [topicsLoading, setTopicsLoading] = useState(false)
  const [detail, setDetail] = useState<InsightsDetail | null>(null)
  /* true while the background sync is fetching newer numbers from the vendor —
   * without this the first minute after opening reads as stale-and-static when
   * it is actually mid-update (owner hit this live 2026-08-21). */
  const [refreshing, setRefreshing] = useState(false)
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
    const load = () => fetch(`/api/dashboard/insights-detail?clientId=${clientId}&today=${localYmd()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (live && j) setDetail(j) })
      .catch(() => { /* leave the sections quiet on failure */ })
    /* Same self-refresh as the home funnel: show the stored numbers first, then ask the route
     * whether a sync is due and redraw only if one actually ran. The route owns the interval,
     * so opening Insights right after Home costs one cheap "already fresh" reply. */
    load().then(() => {
      if (!live) return
      setRefreshing(true)
      fetch(`/api/dashboard/social-refresh?clientId=${clientId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((res) => { if (live && res?.synced) return load() })
        .catch(() => { /* the numbers on screen are still the last good ones */ })
        .finally(() => { if (live) setRefreshing(false) })
    })
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

  /* Pull down to refresh. force=1 tells the route this is the owner asking rather than a
   * routine view, so it drops from the 90 minute interval to a 30 second floor, then we reload
   * the numbers. A pull that finds nothing new still ends with genuinely current data. */
  const onPullRefresh = useCallback(async () => {
    if (!clientId) return { ok: false, changed: false }
    try {
      const r = await fetch(`/api/dashboard/social-refresh?clientId=${clientId}&force=1`, { cache: 'no-store' })
      const j = await r.json().catch(() => ({}))
      const d = await fetch(`/api/dashboard/insights-detail?clientId=${clientId}&today=${localYmd()}`, { cache: 'no-store' })
        .then((x) => (x.ok ? x.json() : null))
      if (d) setDetail(d)
      return { ok: true, changed: !!j?.synced }
    } catch {
      return { ok: false, changed: false }
    }
  }, [clientId])
  const { pull, phase } = usePullToRefresh(useCallback(() => (typeof document === 'undefined' ? null : document.querySelector<HTMLElement>('.mvp-frame-scroll')), []), onPullRefresh)


  return (
    <MvpShell active="home" back="/dashboard" middle={<TopSegmented options={[['insights', 'Insights'], ['trends', 'Trends']]} value={tab} onChange={setTab} />}>
      <style>{`.mvp-swipe{scrollbar-width:none;-ms-overflow-style:none}
.mvp-swipe::-webkit-scrollbar{display:none}
.mvp-spin{animation:mvpspin .8s linear infinite}
@keyframes mvpspin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ background: '#fff', minHeight: '100%' }}>

        <PullIndicator pull={pull} phase={phase} />
        {loading ? (
          <InsightsGhost />
        ) : error ? (
          <Centered>Couldn&apos;t load: {error}</Centered>
        ) : !data || data.metrics.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <Body data={data} focusKey={initialStageKey} summary={summary} topicsData={topicsData} topicsLoading={topicsLoading} detail={detail} clientId={clientId} campaigns={campaigns} refreshing={refreshing} tab={tab} />
          </>
        )}
      </div>
    </MvpShell>
  )
}

const ANALYST_HREF = '/dashboard/insights/analyst'

/**
 * The AI Analyst entry, top right of the Insights header.
 *
 * Two things it has to get right, both reported by the owner:
 *
 * 1. IT MUST ALWAYS DO SOMETHING. It was a bare <Link>, and a tap could land on a
 *    screen that never appeared, with no feedback at all. A control that sometimes
 *    does nothing is the worst possible state, because there is no way to tell a
 *    broken app from a slow one. So: an explicit push, a pressed state so the tap is
 *    always acknowledged, and a hard fallback to a full page load if the client-side
 *    navigation has not moved us anywhere after a beat. A slow navigation beats a
 *    silent one.
 *
 * 2. IT MUST BE HONEST ABOUT THE PRO GATE. The server only ever generates a read for
 *    Pro (and Internal) clients; everyone else was invited to tap a full-price-looking
 *    button and only then told they could not use it. The lock now shows on the button
 *    itself, so the gate is visible before the tap, and the page explains it.
 */
function AnalystButton() {
  const router = useRouter()
  const { client } = useClient()
  const pro = isProTier(client?.tier)
  const [pressed, setPressed] = useState(false)

  const go = () => {
    setPressed(true)
    const from = typeof window !== 'undefined' ? window.location.pathname : ''
    router.push(ANALYST_HREF)
    // Safety net: if we are still on exactly the same path shortly after, the client
    // router did not take us anywhere, so force a real navigation instead.
    setTimeout(() => {
      if (typeof window !== 'undefined' && window.location.pathname === from) {
        window.location.assign(ANALYST_HREF)
      }
    }, 700)
  }

  return (
    <button
      type="button"
      onClick={go}
      aria-label={pro ? 'Your report' : 'Your report, Pro plan only'}
      title={pro ? 'Your report' : 'Your report (Pro)'}
      style={{ ...GLASS_CIRCLE, background: pro ? C.greenSoft : GLASS_CIRCLE.background, color: pro ? C.greenDk : C.mute, border: `1px solid ${pro ? C.greenLine : 'rgba(255,255,255,0.75)'}`, opacity: pressed ? 0.55 : 1, transition: 'opacity .12s ease' }}
    >
      {pro ? <FileText size={16} /> : <Lock size={14} />}
    </button>
  )
}
// The five funnel stages, in funnel order — the swipeable header moves through
// these, so every stage is reachable from every stage and a deep-link lands on
// exactly the stage that was tapped.
/* the page's card + heading kit: white cards on the soft ground, sentence-case headings,
   no hairline borders (the ground does the separating) */
const CARD_SHADOW = '0 1px 2px rgba(0,0,0,.04), 0 6px 20px rgba(0,0,0,.045)'
const CARD: React.CSSProperties = { marginTop: 14, background: '#fff', borderRadius: 18, padding: '16px 16px 18px', boxShadow: CARD_SHADOW }
const H2: React.CSSProperties = { fontSize: 15.5, fontWeight: 600, letterSpacing: '-.01em', color: C.ink }
const TILE: React.CSSProperties = { background: '#f5f5f7', borderRadius: 14 }
/* a 36px frosted round button — the page's tools on the stage row */
const GLASS_CIRCLE: React.CSSProperties = { width: 36, height: 36, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(240,241,240,0.72)', backdropFilter: 'saturate(180%) blur(16px)', WebkitBackdropFilter: 'saturate(180%) blur(16px)', border: '1px solid rgba(255,255,255,0.75)', boxShadow: '0 1px 3px rgba(0,0,0,.06)', color: C.ink, textDecoration: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0, flexShrink: 0 }
/* each stage owns a hue — the bars, dots, source bars and pins below the graph all
   take it, so swiping stages visibly changes the page's colour (owner 2026-09-04:
   "missing some colour"). Up/down stays green/coral everywhere: those are signals,
   not identity. */
type Accent = { main: string; soft: string; dark: string }
/* the five stage colours come from the shared hue table (portal redesign 2026-09-04), so
   Home's rings, Insights and Trends all paint a stage the same way */
const STAGE_HUE: Record<string, HueKey> = { shown: STAGE_HUES[0], engaged: STAGE_HUES[1], moved: STAGE_HUES[2], camein: STAGE_HUES[3], back: STAGE_HUES[4] }
const accentOf = (k: HueKey): Accent => ({ main: HUES[k][1], soft: HUES[k][0] + '29', dark: HUES[k][1] })
const STAGE_ACCENT: Record<string, Accent> = {
  shown: accentOf(STAGE_HUE.shown), engaged: accentOf(STAGE_HUE.engaged), moved: accentOf(STAGE_HUE.moved), camein: accentOf(STAGE_HUE.camein), back: accentOf(STAGE_HUE.back),
}
/* what each stage counts — behind the ⓘ next to the stage name, so the row stays
   one line ("Awareness" + "Times you showed up" was two, owner 2026-09-04) */
const STAGE_EXPLAIN: Record<string, string> = {
  shown: 'Times you showed up: your listing, posts and site appearing in Google searches, Maps and social feeds.',
  engaged: 'People who looked closer: profile visits, website clicks and menu taps after seeing you.',
  moved: 'Moves people made: calls, direction taps, bookings and orders.',
  camein: 'Orders and guests served, from your register and delivery apps.',
  back: 'People who came back: repeat customers and new reviews.',
}
/* the graph's bars take the NUMBER's colour (owner 2026-09-04): green when the period is up on
   the one before, red when down, amber when even. The stage hue stays on the dots + sections. */
const TREND_GREEN = '#2e9a78', TREND_RED = '#c92d32', TREND_AMBER = '#d99a1e'
const AccentCtx = createContext<Accent>(STAGE_ACCENT.shown)
const useAccent = () => useContext(AccentCtx)
/* The conversion from the stage before, as a chip beside the stage name (owner 2026-09-04:
   "see the conversion on insights too"). Same owner-set bands as Home's step chips; tap it
   for the plain-words read. */
function convFor(detail: InsightsDetail | null, i: number): { pct: number; band: HealthBand } | null {
  if (!detail || i <= 0) return null
  const prev = computedStage(detail, i), cur = computedStage(detail, i + 1)
  if (!prev || !cur || cur.isEmpty || prev.headline == null || prev.headline <= 0 || cur.headline == null) return null
  const rate = cur.headline / prev.headline
  return { pct: Math.round(rate * 100), band: bandFor(rate, STAGE_ORDER[i].key) }
}
const CONV_SENTENCE: Record<string, string> = {
  engaged: 'of the people who saw you looked closer',
  moved: 'of the people who looked closer made a move (a call, directions or an order)',
  camein: 'of the people who made a move ordered',
  back: 'of your customers came back',
}
function convExplain(key: string, c: { pct: number; band: HealthBand }): string {
  const w = BAND_WORD[c.band]
  const tail = c.band === 'veryLow' || c.band === 'low' ? ' This is the step to work on.' : c.band === 'average' ? '' : ' Keep doing what you are doing.'
  return `${c.pct >= 1 ? c.pct : '<1'}% ${CONV_SENTENCE[key] ?? 'converted'}. That is ${w} for a restaurant like yours.${tail}`
}
function ConvChip({ c, open, onToggle }: { c: { pct: number; band: HealthBand }; open: boolean; onToggle: () => void }) {
  const ink = `rgb(${BAND_INK[c.band].join(',')})`
  const alarm = c.band === 'veryLow'
  return (
    <button type="button" onClick={onToggle} aria-expanded={open} title="Conversion from the stage before" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', cursor: 'pointer', fontFamily: 'inherit', borderRadius: 999, padding: '3px 9px', fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap', background: alarm ? '#c92d32' : `rgba(${BAND_INK[c.band].join(',')},0.13)`, color: alarm ? '#fff' : ink, boxShadow: open ? `0 0 0 2px #fff, 0 0 0 3.5px ${alarm ? '#c92d32' : ink}` : 'none' }}>
      {c.pct >= 1 ? c.pct : '<1'}% · {BAND_WORD[c.band]}
    </button>
  )
}
const STAGE_ORDER: Array<{ key: string; label: string }> = [
  { key: 'shown', label: 'Awareness' },
  { key: 'engaged', label: 'Interest' },
  { key: 'moved', label: 'Actions' },
  { key: 'camein', label: 'Orders' },
  { key: 'back', label: 'Retention' },
]

function Body({ data, focusKey, detail, campaigns, clientId, refreshing, tab = 'insights' }: { tab?: 'insights' | 'trends'; data: InsightsData; focusKey?: string; summary: ReviewSummary | null; topicsData: ReviewTopicsData | null; topicsLoading: boolean; detail: InsightsDetail | null; clientId?: string; refreshing?: boolean; campaigns: Record<string, StageCampaign[]> | null }) {
  const metrics = data.metrics
  const byKey = new Map(metrics.map((m) => [m.key, m]))
  // The tapped funnel stage seeds the view; SWIPING the graph block moves
  // between stages (dots sit below the histogram) and the source cards below
  // re-render to match. The URL follows (replaceState) so a refresh or share
  // keeps the same stage.
  const [sel, setSel] = useState<string | undefined>(focusKey)
  const [explain, setExplain] = useState(false)
  const [convOpen, setConvOpen] = useState(false)
  useEffect(() => { if (focusKey) setSel(focusKey) }, [focusKey])
  // Warm the other range windows up front so switching tabs is instant.
  useEffect(() => { prewarmStageWindows(clientId) }, [clientId])
  const focus = resolveFocus(sel)
  const idx = Math.max(0, STAGE_ORDER.findIndex((s) => s.key === focus.stageKey))

  // each slide's chart reports its picked range up, so the source cards below
  // the dots stay scoped to the SAME window the visible chart shows
  const [ranges, setRanges] = useState<Record<string, string>>({})
  const rangeFor = (k: string) => (r: string) => setRanges((prev) => (prev[k] === r ? prev : { ...prev, [k]: r }))

  const swipeRef = useRef<HTMLDivElement>(null)
  const progRef = useRef(false) // true while WE scroll it (deep-link) — don't re-pick
  /* the WHOLE hero card swipes (owner 2026-09-04: "not very swipable"): a horizontal drag that
     starts on the name row, the number, the dots or the padding is forwarded to the carousel */
  const dragRef = useRef<{ x: number; y: number; left: number; horiz: boolean | null } | null>(null)
  const onCardTouchStart = (e: React.TouchEvent) => { const t = e.touches[0]; dragRef.current = { x: t.clientX, y: t.clientY, left: swipeRef.current?.scrollLeft ?? 0, horiz: null } }
  const onCardTouchMove = (e: React.TouchEvent) => {
    const d = dragRef.current, el = swipeRef.current; if (!d || !el) return
    const t = e.touches[0]; const dx = t.clientX - d.x, dy = t.clientY - d.y
    if (d.horiz === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) d.horiz = Math.abs(dx) > Math.abs(dy)
    if (d.horiz && !el.contains(e.target as Node)) el.scrollLeft = d.left - dx
  }
  const onCardTouchEnd = () => {
    const d = dragRef.current, el = swipeRef.current
    if (d?.horiz && el) { const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth)); el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' }) }
    dragRef.current = null
  }
  const pick = (k: string) => {
    setSel(k)
    try { window.history.replaceState(null, '', `/dashboard/insights?stage=${k}`) } catch { /* ignore */ }
  }
  // keep the carousel on the selected stage (mount + deep-link arriving late)
  useEffect(() => {
    const el = swipeRef.current
    if (!el) return
    const want = idx * el.clientWidth
    if (Math.abs(el.scrollLeft - want) < 2) return
    progRef.current = true
    el.scrollTo({ left: want, behavior: 'auto' })
    const t = setTimeout(() => { progRef.current = false }, 120)
    return () => clearTimeout(t)
  }, [idx])
  // a finished swipe picks the stage it landed on
  const onSwipe = () => {
    const el = swipeRef.current
    if (!el || progRef.current) return
    const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth))
    const k = STAGE_ORDER[i]?.key
    if (k && k !== focus.stageKey) pick(k)
  }

  if (tab === 'trends') return <TrendsTab detail={detail} campaigns={campaigns} byKey={byKey} initial={focus.stageKey} clientId={clientId} />
  return (
    <div style={{ padding: '0 0 8px' }}>
      {/* the hero is a card like everything else: one soft ground, no seam between the graph and the rest */}
      <div onTouchStart={onCardTouchStart} onTouchMove={onCardTouchMove} onTouchEnd={onCardTouchEnd} onTouchCancel={onCardTouchEnd} style={{ margin: '12px 18px 0', background: '#fff', borderRadius: 18, padding: '14px 0 4px', boxShadow: CARD_SHADOW, overflow: 'hidden', position: 'relative', touchAction: 'pan-y' }}>
      {/* the page's two tools ride the stage row, top right, over every slide */}
      <div style={{ position: 'absolute', top: 12, right: 14, display: 'flex', gap: 8, zIndex: 2 }}>
        <AnalystButton />
        <Link href="/dashboard/insights/metrics" aria-label="Choose your metrics" title="Choose your metrics" style={GLASS_CIRCLE}><SlidersHorizontal size={16} /></Link>
      </div>
      {/* SWIPEABLE GRAPHS — each slide is a stage's title + number + trend +
          histogram; swipe the graph left/right to change stages */}
      <div ref={swipeRef} onScroll={onSwipe} className="mvp-swipe" style={{ display: 'flex', overflowX: 'auto', scrollSnapType: 'x mandatory', alignItems: 'flex-start' }}>
        {STAGE_ORDER.map((s, si) => {
          const smv = byKey.get(resolveFocus(s.key).metric)
          const conv = convFor(detail, si)
          return (
            <div key={s.key} style={{ flex: '0 0 100%', minWidth: 0, scrollSnapAlign: 'center', padding: '0 18px' }}>
              {/* stage name + ⓘ (tap: what this counts); the tools sit to the right */}
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0 10px', maxWidth: 'calc(100% - 88px)', minHeight: 36, margin: '2px 0 0' }}>
              <button type="button" onClick={() => setExplain((v) => !v)} aria-expanded={explain} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', color: C.ink, maxWidth: '100%', height: 36 }}>
                <span style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 600, letterSpacing: '-.01em', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.label}</span>
                <Info size={16} color={explain ? STAGE_ACCENT[s.key].dark : C.faint} style={{ flexShrink: 0 }} />
                {refreshing && <span className="mvp-spin" style={{ width: 11, height: 11, border: `2px solid ${C.line}`, borderTopColor: STAGE_ACCENT[s.key].main, borderRadius: '50%', display: 'inline-block', flexShrink: 0 }} />}
              </button>
              {conv && <ConvChip c={conv} open={convOpen} onToggle={() => setConvOpen((v) => !v)} />}
              </div>
              {explain && <div style={{ fontSize: 12.5, color: C.mute, lineHeight: 1.45, margin: '2px 0 4px' }}>{STAGE_EXPLAIN[s.key]}</div>}
              {convOpen && conv && <div style={{ fontSize: 12.5, color: C.ink, lineHeight: 1.45, margin: '4px 0 6px', padding: '8px 11px', borderRadius: 12, background: conv.band === 'veryLow' || conv.band === 'low' ? C.coralBg : C.bg }}>{convExplain(s.key, conv)}</div>}
              <StageTop stageKey={s.key} detail={detail} mv={smv} clientId={clientId} onRange={rangeFor(s.key)} accent={STAGE_ACCENT[s.key].main} />
            </div>
          )
        })}
      </div>

      {/* the swipe dots — BELOW the histogram; tappable to jump */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center', margin: '10px 18px 14px' }}>
        {STAGE_ORDER.map((s, i) => (
          <button key={s.key} aria-label={s.label} onClick={() => pick(s.key)} style={{ width: i === idx ? 18 : 6, height: 6, borderRadius: 99, border: 'none', padding: 0, cursor: 'pointer', background: i === idx ? STAGE_ACCENT[STAGE_ORDER[idx].key].main : C.line, transition: 'width .2s, background .2s' }} />
        ))}
      </div>

      </div>
      {/* RESULTS — the stackable deck of fired proof cards, right between the
          histogram's dots and the by-source tiles (owner placement). */}
      <div style={{ paddingTop: 10 }}><ProofDeck clientId={clientId} mute={C.mute} /></div>

      {/* everything below the dots follows the ACTIVE stage: its by-source
          cards (scoped to the chart's picked range), extras, and campaigns */}
      <AccentCtx.Provider value={STAGE_ACCENT[focus.stageKey] ?? STAGE_ACCENT.shown}>
      <div style={{ padding: '0 18px' }}>
        <StageBottom stageKey={focus.stageKey} detail={detail} clientId={clientId} range={ranges[focus.stageKey] ?? '30d'} />
        {/* the trend chart and the campaigns live on the Trends tab now (owner 2026-09-04) */}
      </div>
      </AccentCtx.Provider>
    </div>
  )
}

// ── The swipeable TOP of a stage: number + trend + histogram (no cards). ──
function StageTop({ stageKey, detail, mv, clientId, onRange, accent }: { stageKey: string; detail: InsightsDetail | null; mv?: MetricView; clientId?: string; onRange?: (r: string) => void; accent?: string }) {
  if (!detail) return <FeedLoading />
  switch (stageKey) {
    case 'shown': {
      const cs = computedStage(detail, 1)
      const feed = cs ? stageFeedFrom(cs) : buildAwarenessFeed(toFeedInput(detail))
      return mv && cs
        ? <StageWithChart mv={mv} label="Times you showed up" cs={cs} stageNumber={1} clientId={clientId} unit="Times you showed up" showBreakdown={false} onRange={onRange} accent={accent} />
        : <StageHero total={feed.headline} label="Times you showed up" caption={feed.caption} />
    }
    case 'engaged': {
      const cs = computedStage(detail, 2)
      if (cs?.isEmpty) return <EmptyStageHero label="People who looked closer" note="Connect Instagram (or add your menu link) to measure this." />
      const feed = cs ? stageFeedFrom(cs) : buildInterestFeed(toFeedInput(detail))
      return mv && cs
        ? <StageWithChart mv={mv} label="People who looked closer" cs={cs} stageNumber={2} clientId={clientId} unit="Looked closer" showBreakdown={false} onRange={onRange} accent={accent} />
        : <StageHero total={feed.headline} label="People who looked closer" caption={feed.caption} />
    }
    case 'moved': {
      const cs = computedStage(detail, 3)
      const feed = cs ? stageFeedFrom(cs) : buildActionsFeed(toFeedInput(detail))
      return mv && cs
        ? <StageWithChart mv={mv} label="Moves people made" cs={cs} stageNumber={3} clientId={clientId} unit="Moves people made" showBreakdown={false} onRange={onRange} accent={accent} />
        : <StageHero total={feed.headline} label="Moves people made" caption={feed.caption} />
    }
    case 'camein': {
      const cs = computedStage(detail, 4)
      if (cs?.isEmpty) return <SalesLocked note={cs.note} />
      if (cs) { const feed = stageFeedFrom(cs); return <StageHero total={feed.headline} label="Guests served" caption={feed.caption} /> }
      return mv ? <MetricCard mv={mv} /> : <NoMetricYet title="Orders" />
    }
    case 'back': {
      const cs = computedStage(detail, 5)
      if (cs && !cs.isEmpty) {
        const registerLive = cs.sources.some((s) => s.id === 'pos_repeat_customers' && s.counted)
        if (mv && !registerLive) return <StageWithChart mv={mv} label="New reviews" cs={cs} stageNumber={5} clientId={clientId} unit="Came back" showBreakdown={false} onRange={onRange} accent={accent} />
        const feed = stageFeedFrom(cs)
        return <StageHero total={feed.headline} label="Guests who came back" caption={feed.caption} />
      }
      return mv ? <MetricCard mv={mv} /> : <NoMetricYet title="Retention" />
    }
    default: return null
  }
}

// ── The BOTTOM of a stage (under the dots): by-source cards scoped to the
//    visible chart's range, plus the stage's extras. ──
function StageBottom({ stageKey, detail, clientId, range }: { stageKey: string; detail: InsightsDetail | null; clientId?: string; range: string }) {
  if (!detail) return null
  switch (stageKey) {
    case 'shown': {
      const cs = computedStage(detail, 1)
      return (
        <>
          {cs
            ? <RangeSources cs={cs} stageNumber={1} clientId={clientId} unit="Times you showed up" title="Views by source" range={range} />
            : <WhatFeedsThis feed={buildAwarenessFeed(toFeedInput(detail))} unit="Times you showed up" />}
          {detail.topPosts.length > 0 && <BestPosts posts={detail.topPosts} total={detail?.postCount} />}
          {detail.topQueries.length > 0 && <TopSearches queries={detail.topQueries} />}
        </>
      )
    }
    case 'engaged': {
      const cs = computedStage(detail, 2)
      return (
        <>
          {cs
            ? <RangeSources cs={cs} stageNumber={2} clientId={clientId} unit="Looked closer" title="Interest by source" range={range} />
            : <WhatFeedsThis feed={buildInterestFeed(toFeedInput(detail))} unit="Looked closer" />}
          {detail.topPosts.length > 0 && <BestPosts posts={detail.topPosts} />}
          {!cs && !detail.socialConnected && <ConnectSocial connected={false} />}
        </>
      )
    }
    case 'moved': {
      const cs = computedStage(detail, 3)
      return cs
        ? <RangeSources cs={cs} stageNumber={3} clientId={clientId} unit="Moves people made" title="Actions by source" range={range} />
        : <WhatFeedsThis feed={buildActionsFeed(toFeedInput(detail))} unit="Moves people made" />
    }
    case 'camein': {
      const cs = computedStage(detail, 4)
      return cs ? <SourceBreakdown stage={cs} unit="Guests served" showReconcile={!cs.isEmpty} /> : null
    }
    case 'back': {
      const cs = computedStage(detail, 5)
      return cs ? <RangeSources cs={cs} stageNumber={5} clientId={clientId} unit="Came back" title="Retention by source" range={range} /> : null
    }
    default: return null
  }
}

// A stage with genuinely nothing to measure yet: a dash, never a fake 0.
function EmptyStageHero({ label, note }: { label: string; note: string }) {
  return (
    <div>
      <div style={{ fontSize: 15, color: C.mute, fontWeight: 500 }}>{label}</div>
      <div style={{ fontFamily: DISPLAY, fontSize: 47, fontWeight: 500, lineHeight: 1, letterSpacing: '-.02em', color: C.faint, marginTop: 2 }}>{DASH}</div>
      <div style={{ fontSize: 13, color: C.faint, marginTop: 6, lineHeight: 1.45 }}>{note}</div>
    </div>
  )
}

// The by-source cards, re-scoped to the chart's picked range (driven by the
// range the visible slide reported up — never its own separate state).
function RangeSources({ cs, stageNumber, clientId, unit, title, range }: { cs: ComputedStage; stageNumber: number; clientId?: string; unit: string; title: string; range: string }) {
  const { stage, sub } = useRangeStage(cs, stageNumber, clientId, range)
  const s = stage ?? cs
  return (
    <>
      <GroupedSources stage={s} sub={sub} />
    </>
  )
}

// The by-source detail: the individual sources nested UNDER their group, so it
// reads as the drill-down of the 4 cards above (Google -> Maps + Search; Calls
// -> Google + website) instead of a flat repeat of them. Groups with no source
// are skipped.
function GroupedSources({ stage, sub }: { stage: ComputedStage; sub: string }) {
  const A = useAccent()
  const rows = (stage.groups ?? [])
    .map((g) => ({ g, srcs: g.sourceIds.map((id) => stage.sources.find((x) => x.id === id)).filter((v): v is StageSourceView => !!v) }))
    .filter((x) => x.srcs.length > 0)
  if (rows.length === 0) return null
  const isOff = (x: StageSourceView) => x.status === 'AVAILABLE_NOT_CONNECTED' || x.status === 'COMING_SOON'
  const live = rows.filter(({ srcs }) => !srcs.every(isOff))
  const off = rows.filter(({ srcs }) => srcs.every(isOff))
  /* EVERY source on its own row (owner 2026-09-04: a folded "Social reach" row hid which
     network did what) — biggest first, unreported last; the group's name only when the
     source's own label would not say where it is from */
  const items = live.flatMap(({ g, srcs }) => srcs.filter((x) => !isOff(x)).map((x) => ({ g, x, v: sourceValue(x) })))
    .sort((p, q) => (q.v ?? -1) - (p.v ?? -1))
  const top = Math.max(0, ...items.map((i) => i.v ?? 0))
  const offLabel = off.map(({ g }, k) => (k === 0 ? g.label : g.label.charAt(0).toLowerCase() + g.label.slice(1))).join(', ')
  return (
    <Section title="Breakdown by source" sub={sub}>
      <div style={{ fontSize: 12, color: C.faint, margin: '-8px 0 6px', lineHeight: 1.4 }}>Each bar is that source next to your biggest one.</div>
      <div>
        {items.map((it, k) => <SourceItemRow key={it.x.id} s={it.x} groupLabel={it.g.label} first={k === 0} top={top} accent={A} />)}
        {off.length > 0 && <ConnectRow label={offLabel} sources={off.flatMap(({ srcs }) => srcs)} first={items.length === 0} />}
      </div>
    </Section>
  )
}

/** One SOURCE as a row: its network's mark, its own label, its number, and a bar sized
 *  against the stage's biggest source. */
function SourceItemRow({ s, groupLabel, first, top, accent }: { s: StageSourceView; groupLabel: string; first: boolean; top: number; accent: Accent }) {
  const v = sourceValue(s)
  const err = s.status === 'ERROR'
  const manual = s.status === 'MANUAL_ENTRY'
  const asOf = friendlyStamp(s.asOf)
  const provider = String(s.provider ?? '')
  const label = s.shortLabel || s.displayName
  const subText = err ? 'Reconnect' : manual ? `entered by ${s.manualBy ?? 'hand'}` : s.context || (asOf ? `as of ${asOf}` : (label.toLowerCase().includes(groupLabel.toLowerCase()) ? '' : groupLabel))
  return (
    <div style={{ padding: '10px 0 11px', borderTop: first ? 'none' : `0.5px solid ${C.line}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ width: 36, height: 36, borderRadius: 99, background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,.05), 0 3px 10px rgba(0,0,0,.09)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <BrandOrMark provider={provider} size={20} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 600, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
          {subText && <div style={{ fontSize: 12, color: err ? C.coral : C.mute, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{subText}</div>}
        </div>
        <div style={{ fontFamily: DISPLAY, fontSize: 20, fontWeight: 600, letterSpacing: '-.01em', color: v != null ? C.ink : C.faint, flexShrink: 0 }}>
          {v != null ? v.toLocaleString() : DASH}
        </div>
      </div>
      {v != null && top > 0 && (
        <div style={{ height: 5, borderRadius: 99, background: C.bg, marginTop: 8, marginLeft: 48, overflow: 'hidden' }}>
          <div style={{ width: `${Math.max(1.5, (v / top) * 100)}%`, height: '100%', borderRadius: 99, background: accent.main }} />
        </div>
      )}
    </div>
  )
}

/** a source's real number, or null (connected + reported, or typed in by hand) */
function sourceValue(x: StageSourceView): number | null {
  if (x.status === 'CONNECTED' && x.hasData && x.value != null) return x.value
  if (x.status === 'MANUAL_ENTRY' && x.value != null) return x.value
  return null
}
/** "Google Search views" under the Google group reads as "Search" */
function partName(x: StageSourceView): string {
  const t = (x.shortLabel || x.displayName).replace(/\b(Google|Instagram|Facebook|TikTok|YouTube|Yelp|LinkedIn)\b/g, '').replace(/[()]/g, '').replace(/\s+(views?|clicks?)$/i, '').replace(/\s+/g, ' ').trim()
  return t || (x.shortLabel || x.displayName)
}

/* ── Real brand marks, inline (no icon package ships them). Each draws inside a
   `size` box; the network's own colours, never ours. Unknown → a quiet globe. ── */
const BRAND_OF: Record<string, string> = {
  google_business_profile: 'google', google: 'google', gbp: 'google', google_analytics: 'google', google_search_console: 'google',
  instagram: 'instagram', facebook: 'facebook', tiktok: 'tiktok', youtube: 'youtube', yelp: 'yelp', linkedin: 'linkedin',
}
export function BrandIcon({ provider, size = 20 }: { provider: string; size?: number }) {
  const b = BRAND_OF[provider] ?? provider
  const sz = { width: size, height: size, display: 'block', flexShrink: 0 } as const
  switch (b) {
    case 'google':
      return (
        <svg viewBox="0 0 48 48" style={sz} aria-hidden>
          <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-2.8-.4-4H24v7.3h12.1c-.2 2-1.6 5-4.5 7l-.1.3 6.5 5 .5.1c4.1-3.8 6.6-9.5 6.6-15.7z" />
          <path fill="#34A853" d="M24 45c5.9 0 10.9-1.9 14.5-5.3l-6.9-5.4c-1.9 1.3-4.4 2.2-7.6 2.2-5.8 0-10.7-3.8-12.5-9.1l-.3 0-6.8 5.2-.1.3C7.9 39.9 15.4 45 24 45z" />
          <path fill="#FBBC05" d="M11.5 27.4c-.5-1.4-.7-2.8-.7-4.4s.3-3 .7-4.4l0-.3-6.9-5.3-.2.1C2.9 16 2 19.9 2 24s.9 8 2.4 11.4l7.1-5.5z" />
          <path fill="#EB4335" d="M24 10.5c4.1 0 6.9 1.8 8.5 3.3l6.2-6C34.8 4.2 29.9 2 24 2 15.4 2 7.9 7.1 4.4 14.1l7.1 5.5c1.8-5.3 6.7-9.1 12.5-9.1z" />
        </svg>
      )
    case 'facebook':
      return (
        <svg viewBox="0 0 24 24" style={sz} aria-hidden>
          <circle cx="12" cy="12" r="12" fill="#1877F2" />
          <path fill="#fff" d="M15.9 15.5l.5-3.5h-3.3V9.8c0-1 .5-1.9 2-1.9h1.5V5c-.8-.1-1.8-.2-2.6-.2-2.7 0-4.4 1.6-4.4 4.6V12H6.5v3.5h3.1V24h3.5v-8.5h2.8z" />
        </svg>
      )
    case 'instagram':
      return (
        <svg viewBox="0 0 24 24" style={sz} aria-hidden>
          <defs><linearGradient id="igGrad" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#F9A13D" /><stop offset=".5" stopColor="#E1306C" /><stop offset="1" stopColor="#7B3FBF" /></linearGradient></defs>
          <rect x="1" y="1" width="22" height="22" rx="6.5" fill="url(#igGrad)" />
          <rect x="5.2" y="5.2" width="13.6" height="13.6" rx="4" fill="none" stroke="#fff" strokeWidth="1.8" />
          <circle cx="12" cy="12" r="3.3" fill="none" stroke="#fff" strokeWidth="1.8" />
          <circle cx="16.4" cy="7.6" r="1" fill="#fff" />
        </svg>
      )
    case 'youtube':
      return (
        <svg viewBox="0 0 24 24" style={sz} aria-hidden>
          <rect x="1" y="4.5" width="22" height="15" rx="4.5" fill="#FF0033" />
          <path fill="#fff" d="M9.8 8.6v6.8l6-3.4z" />
        </svg>
      )
    case 'tiktok':
      return (
        <svg viewBox="0 0 24 24" style={sz} aria-hidden>
          <rect width="24" height="24" rx="6.5" fill="#111" />
          <g transform="translate(5.2 4.4) scale(0.6)">
            <path fill="#69C9D0" d="M12.53.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-1.99 6.15-1.58.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" transform="translate(-.6 -.6)" />
            <path fill="#EE1D52" d="M12.53.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-1.99 6.15-1.58.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" transform="translate(.6 .6)" />
            <path fill="#fff" d="M12.53.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-1.99 6.15-1.58.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
          </g>
        </svg>
      )
    case 'yelp':
      return (
        <svg viewBox="0 0 24 24" style={sz} aria-hidden>
          <rect width="24" height="24" rx="6.5" fill="#D32323" />
          <text x="12" y="17" textAnchor="middle" fontSize="14" fontWeight="800" fill="#fff" fontFamily="Inter, system-ui, sans-serif">Y</text>
        </svg>
      )
    case 'linkedin':
      return (
        <svg viewBox="0 0 24 24" style={sz} aria-hidden>
          <rect width="24" height="24" rx="5" fill="#0A66C2" />
          <path fill="#fff" d="M7.1 9.6h2.4V17H7.1zM8.3 5.8a1.4 1.4 0 110 2.8 1.4 1.4 0 010-2.8zM11 9.6h2.3v1c.3-.6 1.1-1.2 2.3-1.2 2.5 0 2.9 1.6 2.9 3.7V17h-2.4v-3.5c0-.8 0-1.9-1.2-1.9s-1.4.9-1.4 1.9V17H11z" />
        </svg>
      )
    default:
      return null
  }
}

export function BrandOrMark({ provider, size = 20 }: { provider: string; size?: number }) {
  return BRAND_OF[provider] ? <BrandIcon provider={provider} size={size} /> : <ProviderMark provider={provider} size={Math.round(size * 1.1)} />
}
/* Brand marks: a small tile in each network's own colour, so a row reads at a glance
   without a word. Unknown providers get a quiet globe. */
const PROVIDER_MARK: Record<string, { bg: string; fg?: string; text?: string; icon?: 'globe' | 'store' | 'bag' | 'cal' | 'heart' | 'mail' | 'share' | 'mega' }> = {
  google_business_profile: { bg: '#4285f4', text: 'G' },
  google: { bg: '#4285f4', text: 'G' },
  gbp: { bg: '#4285f4', text: 'G' },
  google_analytics: { bg: '#e37400', text: 'GA' },
  google_search_console: { bg: '#4285f4', text: 'GS' },
  instagram: { bg: 'linear-gradient(135deg, #f9a13d 0%, #e1306c 55%, #7b3fbf 100%)', text: 'IG' },
  facebook: { bg: '#1877f2', text: 'f' },
  tiktok: { bg: '#111111', text: 'TT' },
  linkedin: { bg: '#0a66c2', text: 'in' },
  youtube: { bg: '#ff0033', text: '▶' },
  yelp: { bg: '#d32323', text: 'Y' },
  pos: { bg: '#dd9a1c', icon: 'store' },
  delivery: { bg: '#dd9a1c', icon: 'bag' },
  reservations: { bg: '#7a5fd6', icon: 'cal' },
  loyalty: { bg: '#1fa39a', icon: 'heart' },
  email: { bg: '#6e6e73', icon: 'mail' },
  social: { bg: '#e1306c', icon: 'share' },
  ads: { bg: '#3d8ed8', icon: 'mega' },
}
export function ProviderMark({ provider, size = 28 }: { provider: string; size?: number }) {
  const m = PROVIDER_MARK[provider] ?? { bg: C.bg, fg: C.mute, icon: 'globe' as const }
  const ic = Math.round(size * 0.5)
  const icon = m.icon === 'store' ? <Store size={ic} /> : m.icon === 'bag' ? <ShoppingBag size={ic} /> : m.icon === 'cal' ? <CalendarDays size={ic} /> : m.icon === 'heart' ? <Heart size={ic} /> : m.icon === 'mail' ? <Mail size={ic} /> : m.icon === 'share' ? <Share2 size={ic} /> : m.icon === 'mega' ? <Megaphone size={ic} /> : m.icon === 'globe' ? <Globe size={ic} /> : null
  return (
    <span aria-hidden style={{ width: size, height: size, borderRadius: Math.round(size * 0.3), background: m.bg, color: m.fg ?? '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: m.text && m.text.length > 1 ? size * 0.36 : size * 0.5, fontWeight: 800, letterSpacing: '-.02em', flexShrink: 0, fontFamily: DISPLAY, lineHeight: 1 }}>
      {icon ?? m.text}
    </span>
  )
}

// The graceful Sales collapse: honest about what we cannot see yet, with the one
// door that unlocks it. Actions remains the visible endpoint of the funnel.
function SalesLocked({ note }: { note?: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '44px 24px' }}>
      <div style={{ width: 52, height: 52, borderRadius: 14, background: C.bg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Lock size={22} color={C.faint} /></div>
      <div style={{ fontSize: 15, fontWeight: 600, color: C.ink, marginTop: 14 }}>We cannot see sales yet</div>
      <div style={{ fontSize: 12.5, color: C.faint, marginTop: 6, lineHeight: 1.5, maxWidth: 280, margin: '6px auto 0' }}>{note && !/cannot see sales/i.test(note) ? note : 'Connect your register to measure guests and revenue.'}</div>
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
          <div style={{ fontSize: 13, fontWeight: 600, color: C.mute, margin: '16px 0 8px' }}>Audience growth · not part of this number</div>
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
/** "Aug 12, 11:29 PM" — the moment a platform last refreshed a number. Accepts the vendor's
 *  "2026-08-12 23:29:55" (UTC, no T or Z) as well as real ISO, and renders in local time. */
function friendlyStamp(raw: string | null | undefined): string {
  if (!raw) return ''
  /* A BARE date means the source reports by day and has no clock of its own (Google, GA4).
   * Parsing it as a timestamp would both shift the day backwards through the timezone and
   * print an hour we invented — "as of Aug 10, 5:00 PM" for a number Google filed on Aug 11.
   * Read the parts literally and print the day alone. */
  const dayOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
  if (dayOnly) {
    const d = new Date(Number(dayOnly[1]), Number(dayOnly[2]) - 1, Number(dayOnly[3]))
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(raw) ? raw.replace(' ', 'T') + 'Z' : raw
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

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
      <div style={{ ...base, ...TILE, opacity: 0.7 }}>
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
      <div style={{ ...base, ...TILE, opacity: 0.6 }}>
        {label}
        <span style={{ fontSize: 10, color: C.greenDk, fontWeight: 600, lineHeight: 1.3 }}>{cfg ?? `${sourceActionVerb(s.status) ?? 'Connect'} to see`}</span>
      </div>
    )
  }

  // CONNECTED + data — a genuine queried number. Hero (the stage's primary
  // sub-metric) gets a light green accent.
  if (s.status === 'CONNECTED' && s.hasData && s.value != null) {
    /* When the PLATFORM last refreshed this number. Platforms run on their own clocks, so a
     * single dashboard-wide "updated" line would be a guess for four of five cards. */
    const asOf = friendlyStamp(s.asOf)
    return (
      <div style={{ ...base, ...TILE, ...(hero ? { background: C.greenSoft } : {}) }}>
        {num(s.value, hero ? C.greenDk : C.ink)}
        {label}
        {s.context && <span style={{ fontSize: 9.5, color: C.mute, lineHeight: 1.2 }}>{s.context}</span>}
        {asOf && <span style={{ fontSize: 9, color: C.faint, lineHeight: 1.2 }}>as of {asOf}</span>}
      </div>
    )
  }

  // CONNECTED + NO_DATA — connected and genuinely zero. A dash (never a real 0)
  // plus a calm hint so it never reads as broken.
  return (
    <div style={{ ...base, ...TILE }}>
      {dash}
      {label}
      {/* "0 new followers" with no other number reads as "you have no followers". The real
          audience size rides along so the row cannot be misread that way. */}
      {s.context
        ? <span style={{ fontSize: 9.5, color: C.mute, lineHeight: 1.2 }}>{s.context}</span>
        : !small && <span style={{ fontSize: 9.5, color: C.faint }}>no activity yet</span>}
      {friendlyStamp(s.asOf) && <span style={{ fontSize: 9, color: C.faint, lineHeight: 1.2 }}>as of {friendlyStamp(s.asOf)}</span>}
    </div>
  )
}

// A clearly-separated group of source cards that are NOT in the headline sum
// (context / drill-downs). Its own heading keeps them from implying they feed it.
function SeparatedSources({ title, sources }: { title: string; sources: StageSourceView[] }) {
  const cols = Math.min(3, Math.max(2, sources.length))
  return (
    <>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: C.mute, margin: '16px 0 8px' }}>{title}</div>
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
export function SourceBreakdown({ stage, unit, showReconcile = true, showExtras = true, title = 'What feeds this', sub = 'last 30 days' }: { stage: ComputedStage; unit: string; showReconcile?: boolean; showExtras?: boolean; title?: string; sub?: string }) {
  const sums = stage.sources.filter((s) => s.feedRole === 'sum')
  const context = stage.sources.filter((s) => s.feedRole === 'context')
  const drills = stage.sources.filter((s) => s.feedRole === 'drilldown')
  const headline = stage.headline ?? 0
  const cols = Math.min(4, Math.max(2, sums.length))
  const nothingYet = stage.sources.every((s) => s.status === 'AVAILABLE_NOT_CONNECTED' || s.status === 'COMING_SOON')
  if (nothingYet) {
    // no ghost tiles: one row that names what fills this, and the door to it
    return (
      <Section title={title} sub={sub}>
        <ConnectRow label={unit} sources={stage.sources} />
      </Section>
    )
  }
  return (
    <Section title={title} sub={sub}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 8 }}>
        {sums.map((s) => <SourceStateCard key={s.id} s={s} hero={s.isHero} />)}
      </div>
      {showReconcile && (
        <div style={{ fontSize: 12.5, color: C.faint, marginTop: 10, textAlign: 'center' }}>Adds up to <b style={{ color: C.greenDk, fontFamily: DISPLAY, fontSize: 14 }}>{headline.toLocaleString()}</b> {unit.toLowerCase()}</div>
      )}
      {showExtras && context.length > 0 && <SeparatedSources title="Also tracked, not part of this number" sources={context} />}
      {showExtras && drills.length > 0 && <SeparatedSources title="More detail, not part of this number" sources={drills} />}
    </Section>
  )
}

// chart range chip -> the funnel window computeStages supports (+ owner label).
// A custom range has no fixed window, so it keeps the 30-day snapshot.
const RANGE_WINDOW: Record<string, { w: string; label: string } | null> = {
  '7d': { w: '7d', label: 'last 7 days' },
  '30d': { w: '30d', label: 'last 30 days' },
  '90d': { w: '90d', label: 'last 90 days' },
  '1y': { w: '12m', label: 'last year' },
  custom: null,
}

// Session cache of the light insights-stages payload, keyed by client+window, so
// switching ranges/tabs is INSTANT once a window is warm (no refetch). The
// non-default windows are prewarmed on mount (prewarmStageWindows), so even the
// first click is instant.
const STAGES_CACHE = new Map<string, ComputedStage[]>()
async function loadStagesWindow(clientId: string, w: string): Promise<ComputedStage[] | null> {
  const key = `${clientId}:${w}`
  const hit = STAGES_CACHE.get(key)
  if (hit) return hit
  try {
    const r = await fetch(`/api/dashboard/insights-stages?clientId=${clientId}&window=${w}`)
    if (!r.ok) return null
    const stages = ((await r.json())?.stages as ComputedStage[] | undefined) ?? []
    STAGES_CACHE.set(key, stages)
    return stages
  } catch { return null }
}
// Warm the windows the range chips can pick (30d is already in `detail`).
function prewarmStageWindows(clientId: string | undefined) {
  if (!clientId) return
  for (const w of ['7d', '90d', '12m']) void loadStagesWindow(clientId, w)
}

// ── Re-scope a computed stage to a picked chart range: served INSTANTLY from the
//    session cache when the window is warm, else fetched once and cached (falling
//    back to the 30-day `cs` while loading — never a blank). ──
function useRangeStage(cs: ComputedStage | undefined, stageNumber: number | undefined, clientId: string | undefined, range: string): { stage: ComputedStage | undefined; sub: string } {
  const [rangeStage, setRangeStage] = useState<ComputedStage | undefined>(cs)
  const [sub, setSub] = useState('last 30 days')
  useEffect(() => {
    const picked = RANGE_WINDOW[range] ?? null
    // 30 days, custom, or no way to fetch → the snapshot we already have
    if (!picked || picked.w === '30d' || !clientId || stageNumber == null) {
      setRangeStage(cs)
      setSub(range === 'custom' ? 'recent' : 'last 30 days')
      return
    }
    setSub(picked.label)
    const cached = STAGES_CACHE.get(`${clientId}:${picked.w}`)
    if (cached) { setRangeStage(cached.find((s) => s.stage === stageNumber) ?? cs); return } // instant
    let live = true
    loadStagesWindow(clientId, picked.w).then((stages) => {
      if (!live) return
      setRangeStage(stages?.find((s) => s.stage === stageNumber) ?? cs)
    })
    return () => { live = false }
  }, [range, clientId, stageNumber, cs])
  return { stage: rangeStage ?? cs, sub }
}

// ── A charted stage, in the shape the owner trusts (the home MetricCard): the big
//    number + an up/down trend on TOP, the histogram under it. ONE useChartRange
//    drives the number, the delta AND the bars, so the range chips move ALL of
//    them together. The trend is honest about staleness: when the freshest data
//    is too old for a real "this period vs last" claim, it shows "Updated <when>"
//    instead of a frozen arrow. In the swipeable layout the source cards live
//    BELOW the dots (showBreakdown=false + onRange reports the picked range up so
//    the cards outside stay scoped to this chart's window). ──
/** the big number rolls to its new value (≈450ms) instead of snapping — the page feels alive
 *  without saying anything it did not say before; static under prefers-reduced-motion */
function useCountUp(target: number): number {
  const [v, setV] = useState(target)
  const fromRef = useRef(target)
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setV(target); fromRef.current = target; return }
    const from = fromRef.current, to = target, t0 = performance.now(), dur = 450
    if (from === to) return
    let raf = 0
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3)
      setV(Math.round(from + (to - from) * e))
      if (p < 1) raf = requestAnimationFrame(tick); else fromRef.current = to
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target])
  return v
}

function StageWithChart({ mv, label, cs, unit, breakdownTitle, clientId, stageNumber, showBreakdown = true, onRange, accent }: { mv: MetricView; label: string; cs: ComputedStage | undefined; unit: string; accent?: string; breakdownTitle?: string; clientId?: string; stageNumber?: number; showBreakdown?: boolean; onRange?: (r: string) => void }) {
  const { range, setRange, cStart, setCStart, cEnd, setCEnd, summary } = useChartRange(mv)
  const fresh = isFresh(mv.lastDataDate, summary.periodDays)
  const dn = summary.deltaPct < 0
  const ac = dn ? C.coral : C.green
  const acbg = dn ? C.coralBg : C.greenSoft
  // report the picked range up (the external cards follow it)
  useEffect(() => { onRange?.(range) }, [range, onRange])
  // The big number IS the sum of the by-source breakdown (the computeStages
  // headline), scoped to the picked range — so the total ALWAYS equals the cards
  // below it and can never drift. The histogram shows the trend/shape from the
  // metric series; the delta pill describes that trend.
  const { stage: rangeStage, sub } = useRangeStage(cs, stageNumber, clientId, range)
  const csTotal = rangeStage?.headline ?? cs?.headline
  const total = csTotal != null ? csTotal : summary.total
  const shown = useCountUp(total)

  return (
    <>
      {/* the number sits right under the stage name; its "Times you showed up"
          line now lives behind the ⓘ (owner 2026-09-04) */}
      <div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
          <span aria-label={label} style={{ fontFamily: DISPLAY, fontSize: 40, fontWeight: 500, lineHeight: 1, letterSpacing: '-.02em', color: C.ink }}>{shown.toLocaleString()}</span>
          {total > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 600, color: ac, background: acbg, padding: '4px 10px', borderRadius: 99, marginBottom: 4 }}>
              <span style={{ fontSize: 10.5 }}>{dn ? '▼' : '▲'}</span>{deltaLabel(summary)}
            </span>
          )}
        </div>
        {/* the two windows behind that change, by date — the way a portfolio app says
            "past month"; a stale feed says so here instead of hiding the change */}
        {total > 0 && (
          <div style={{ fontSize: 12, color: C.mute, marginTop: 5, lineHeight: 1.4 }}>
            {deltaSub(summary)}{!fresh && mv.lastDataDate ? ` · last update ${relDate(mv.lastDataDate)}` : ''}
          </div>
        )}
        {/* year-over-year: same window a year ago. Shows only when we can honestly
            make the claim (fresh data + a real prior-year number). */}
        {fresh && summary.yoyPct != null && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 3, fontSize: 12, fontWeight: 600, color: summary.yoyPct > 0 ? C.greenDk : summary.yoyPct < 0 ? C.coral : C.mute }}>
            {summary.yoyPct > 0 ? <TrendingUp size={14} /> : summary.yoyPct < 0 ? <TrendingDown size={14} /> : <Minus size={14} />}
            {summary.yoyPct > 999 ? `Far above ${summary.yoyLabel}` : summary.yoyPct > 0 ? `Up ${summary.yoyPct}% ${summary.yoyLabel}` : summary.yoyPct < 0 ? `Down ${Math.abs(summary.yoyPct)}% ${summary.yoyLabel}` : `Even with last year`}
          </div>
        )}
      </div>
      {/* histogram — trend/shape only; the ONE number for this card is the
          by-source total above, so the chart's own sum caption stays off */}
      <ActionsChart range={range} setRange={setRange} cStart={cStart} setCStart={setCStart} cEnd={cEnd} setCEnd={setCEnd} summary={summary} noun={mv.unit} showTotal={false} accent={dn ? TREND_RED : summary.deltaPct === 0 ? TREND_AMBER : TREND_GREEN} />
      {/* inline source cards (legacy single-column layout only — the swipeable
          layout renders them below the dots instead via RangeSources) */}
      {showBreakdown && (rangeStage ?? cs) ? <SourceBreakdown stage={(rangeStage ?? cs)!} unit={unit} title={breakdownTitle} sub={sub} showReconcile={false} showExtras={false} /> : null}
    </>
  )
}

// Calm placeholder while the breakdown data is still loading in.
function FeedLoading() {
  return <div style={{ fontSize: 13, color: C.faint, padding: '24px 0' }}>Adding up your sources&hellip;</div>
}

// ── "Campaigns working on this" — the shipped campaigns whose live pieces push on
//    this stage's number, each a tap into its campaign. A calm prompt when none. ──
// ── The TRENDS tab (owner 2026-09-04): every stage side by side, then one stage in depth ──
/* the smoothing follows the window (owner 2026-09-04): a week shows real days, a month a
   7-day average, a quarter two weeks, a year a month; a custom span picks by its length */
function smoothDays(range: string, spanDays: number): number {
  if (range === '7d') return 1
  if (range === '30d') return 7
  if (range === '90d') return 14
  if (range === '1y') return 30
  return spanDays <= 14 ? 1 : spanDays <= 45 ? 7 : spanDays <= 120 ? 14 : 30
}
const avgLabel = (n: number) => (n <= 1 ? 'Each day' : `${n}-day average`)
const TREND_RANGES: [ChartRange, string][] = [['7d', '7d'], ['30d', '30d'], ['90d', '90d'], ['1y', '1y'], ['custom', 'Custom']]
function TrendsTab({ detail, campaigns, byKey, initial, clientId }: { detail: InsightsDetail | null; campaigns: Record<string, StageCampaign[]> | null; byKey: Map<string, MetricView>; initial: string; clientId?: string }) {
  const [range, setRange] = useState<ChartRange>('30d')
  const [cStart, setCStart] = useState(() => { const t = new Date(); return localYmdOf(new Date(t.getFullYear(), t.getMonth(), t.getDate() - 13)) })
  const [cEnd, setCEnd] = useState(() => localYmd())
  const [sel, setSel] = useState(initial)
  const [pins, setPins] = useState<Record<string, number>>({})
  const [lit, setLit] = useState<number | null>(null)
  const onPins = useCallback((m: Record<string, number>) => setPins(m), [])
  const customDays = Math.max(2, Math.round((trendDayMs(cEnd) - trendDayMs(cStart)) / DAY_MS) + 1)
  const days = range === 'custom' ? customDays : TREND_DAYS[(TREND_OF_RANGE[range] ?? 'month') as 'week' | 'month' | 'quarter' | 'year']
  const smooth = smoothDays(range, days)
  const rows = STAGE_ORDER.map((st) => {
    const mv = byKey.get(resolveFocus(st.key).metric)
    const cs = computedStage(detail, STAGE_ORDER.findIndex((x) => x.key === st.key) + 1)
    const locked = !mv || cs?.isEmpty === true
    const sm = mv && !locked ? bucketsFor(range, mv, cStart, cEnd) : null
    const launches = (campaigns?.[st.key] ?? []).filter((c) => c.state !== 'production' && c.shippedAt && Date.now() - trendDayMs(c.shippedAt) <= days * DAY_MS).length
    return { st, mv, sm, launches, locked, cs, n: STAGE_ORDER.findIndex((x) => x.key === st.key) + 1 }
  })
  const cur = rows.find((r) => r.st.key === sel) ?? rows[0]
  return (
    <div style={{ padding: '12px 18px 8px' }}>
      <div style={{ display: 'flex', gap: 2, borderRadius: 999, padding: 3, background: 'rgba(240,241,240,0.72)', backdropFilter: 'saturate(180%) blur(16px)', WebkitBackdropFilter: 'saturate(180%) blur(16px)', border: '1px solid rgba(255,255,255,0.75)', boxShadow: '0 1px 3px rgba(0,0,0,.05)' }}>
        {TREND_RANGES.map(([k, l]) => {
          const on = range === k
          const cal = k === 'custom'
          return <button key={k} type="button" aria-label={cal ? 'Custom dates' : l} onClick={() => setRange(k)} style={{ flex: cal ? '0 0 44px' : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: on ? '#fff' : 'transparent', color: on ? C.ink : C.mute, borderRadius: 999, padding: '8px 0', fontSize: 13.5, fontWeight: on ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit', boxShadow: on ? '0 2px 6px rgba(0,0,0,.12)' : 'none' }}>{cal ? <CalendarDays size={15} /> : l}</button>
        })}
      </div>
      {range === 'custom' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 11.5, color: C.mute, display: 'flex', alignItems: 'center', gap: 6 }}>From<input type="date" value={cStart} max={cEnd} onChange={(e) => setCStart(e.target.value)} style={{ border: 'none', borderRadius: 8, padding: '6px 8px', fontSize: 12.5, color: C.ink, fontFamily: 'inherit', background: C.bg }} /></label>
          <label style={{ fontSize: 11.5, color: C.mute, display: 'flex', alignItems: 'center', gap: 6 }}>To<input type="date" value={cEnd} min={cStart} onChange={(e) => setCEnd(e.target.value)} style={{ border: 'none', borderRadius: 8, padding: '6px 8px', fontSize: 12.5, color: C.ink, fontFamily: 'inherit', background: C.bg }} /></label>
        </div>
      )}
      {/* every stage on one screen: its 7-day average as a sparkline, its total, its change, its launches */}
      <div style={{ ...CARD, padding: '14px 16px 6px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={H2}>All stages</span>
          <span style={{ fontSize: 12.5, color: C.faint }}>tap one to open it</span>
        </div>
        {rows.map((r, i) => <StageTrendRow key={r.st.key} label={r.st.label} accent={STAGE_ACCENT[r.st.key]} mv={r.mv} sm={r.sm} launches={r.launches} locked={r.locked} days={days} campaigns={campaigns?.[r.st.key] ?? []} on={r.st.key === sel} first={i === 0} onPick={() => setSel(r.st.key)} cs={r.cs} stageNumber={r.n} clientId={clientId} range={range} smooth={smooth} />)}
      </div>
      <AccentCtx.Provider value={STAGE_ACCENT[cur.st.key] ?? STAGE_ACCENT.shown}>
        {cur.mv && !cur.locked
          ? <CampaignTrend mv={cur.mv} list={campaigns ? (campaigns[cur.st.key] ?? []) : null} chartRange={range} customStart={cStart} customEnd={cEnd} smooth={smooth} title={cur.st.label} onPins={onPins} litPin={lit} footer={<StageCampaigns list={campaigns ? (campaigns[cur.st.key] ?? []) : null} pins={pins} lit={lit} onLight={setLit} bare />} />
          : <div style={CARD}><div style={H2}>{cur.st.label}</div><div style={{ fontSize: 13, color: C.mute, marginTop: 6, lineHeight: 1.45 }}>Nothing to draw here yet. Connect the source that measures it and the trend appears.</div></div>}
        {cur.mv && !cur.locked && <HighlightsCard mv={cur.mv} days={days} label={cur.st.label} smooth={smooth} />}
      </AccentCtx.Provider>
    </div>
  )
}

function StageTrendRow({ label, accent, mv, sm, launches, locked, days, campaigns, on, first, onPick, cs, stageNumber, clientId, range, smooth = 7 }: { smooth?: number; label: string; accent: Accent; mv?: MetricView; sm: ReturnType<typeof bucketsFor> | null; launches: number; locked: boolean; days: number; campaigns: StageCampaign[]; on: boolean; first: boolean; onPick: () => void; cs?: ComputedStage; stageNumber: number; clientId?: string; range: string }) {
  // the row's total is the SAME by-source headline the Insights tab shows for this window
  // (the series' own sum can differ by definition); the % stays the series' read
  const { stage: rs } = useRangeStage(cs, stageNumber, clientId, range)
  const headline = rs?.headline ?? cs?.headline ?? null
  const total = headline != null ? headline : sm?.total ?? null
  // the sparkline: the last N days' 7-day rolling average, trailing unreported zeros trimmed
  const raw = (mv?.daily ?? []).filter((d) => d && d.date && trendDayMs(d.date) > 0)
  let cut = raw.length
  while (cut > 0 && cut > raw.length - 7 && (raw[cut - 1].value ?? 0) === 0) cut--
  const series = raw.slice(Math.max(0, cut - days), cut)
  const roll = series.map((_, i) => { const sl = series.slice(Math.max(0, i - (smooth - 1)), i + 1); return sl.reduce((t, x) => t + (x.value ?? 0), 0) / sl.length })
  const mx = Math.max(1, ...roll)
  const W = 100, H = 30
  const pts = roll.map((v, i) => `${(i / Math.max(1, roll.length - 1)) * W},${H - 3 - (v / mx) * (H - 6)}`)
  const t0 = series.length ? trendDayMs(series[0].date) : 0, t1 = series.length ? trendDayMs(series[series.length - 1].date) : 1
  const pins = campaigns.map((c) => (c.shippedAt ? trendDayMs(c.shippedAt) : NaN)).filter((ms) => Number.isFinite(ms) && ms >= t0 && ms <= t1)
  const dn = (sm?.deltaPct ?? 0) < 0
  return (
    <button type="button" onClick={onPick} aria-pressed={on} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '11px 8px', margin: '0 -8px', boxSizing: 'content-box', borderTop: first ? 'none' : `0.5px solid ${C.line}`, background: on ? accent.soft : 'none', borderRadius: on ? 12 : 0, border: 'none', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', transition: 'background .15s' }}>
      <span style={{ width: 9, height: 9, borderRadius: 99, background: accent.main, flexShrink: 0 }} />
      <span style={{ width: 92, flexShrink: 0 }}>
        <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: C.ink, lineHeight: 1.2 }}>{label}</span>
        <span style={{ display: 'block', fontSize: 11.5, color: C.faint, marginTop: 2, whiteSpace: 'nowrap' }}>{locked ? 'not measured' : launches === 0 ? 'no launches' : launches === 1 ? '1 launch' : `${launches} launches`}</span>
      </span>
      <span style={{ flex: 1, minWidth: 0, height: H }}>
        {roll.length > 1 && !locked && (
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{ display: 'block' }} aria-hidden>
            <polyline points={pts.join(' ')} fill="none" stroke={accent.main} strokeWidth={1.8} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
            {pins.map((ms, i) => { const x = ((ms - t0) / Math.max(1, t1 - t0)) * W; return <line key={i} x1={x} y1={2} x2={x} y2={H - 2} stroke={accent.main} strokeOpacity={0.45} strokeWidth={1} strokeDasharray="2 2" vectorEffect="non-scaling-stroke" /> })}
          </svg>
        )}
      </span>
      <span style={{ textAlign: 'right', flexShrink: 0, minWidth: 64 }}>
        <span style={{ display: 'block', fontFamily: DISPLAY, fontSize: 16, fontWeight: 600, color: locked ? C.faint : C.ink, letterSpacing: '-.01em' }}>{!locked && total != null ? total.toLocaleString() : DASH}</span>
        {sm && sm.compareTotal > 0 && <span style={{ display: 'inline-block', marginTop: 2, fontSize: 11, fontWeight: 700, color: dn ? C.coral : C.greenDk }}>{dn ? '▼' : '▲'}{Math.abs(sm.deltaPct) > 999 ? 'sharply' : `${Math.abs(sm.deltaPct)}%`}</span>}
      </span>
    </button>
  )
}

// ── Campaign impact trend ──────────────────────────────────────────────────
// A separate line chart for the active stage: the stage's real daily series with
// a numbered pin at each campaign's real go-live date, so the owner can see
// whether launching a campaign actually moved this line. Everything here is real
// data — no invented comparison line, no fake "before us" region. Campaigns
// without a known go-live date (or shipped after our last data day) simply don't
// pin, because we can't honestly show their effect yet.
type TrendRange = 'week' | 'month' | 'quarter' | 'year' | 'all'
const TREND_LABEL: Record<TrendRange, string> = { week: 'Week', month: 'Month', quarter: 'Quarter', year: 'Year', all: 'All time' }
/* the chart's range → the trend's window, so both cards read the same days (owner 2026-09-04) */
const TREND_OF_RANGE: Record<string, TrendRange> = { '7d': 'week', '30d': 'month', '90d': 'quarter', '1y': 'year', custom: 'month' }
const TREND_DAYS: Record<'week' | 'month' | 'quarter' | 'year', number> = { week: 7, month: 30, quarter: 90, year: 365 }
const DAY_MS = 86400000

function trendDayMs(iso: string): number { return Date.parse(iso.length <= 10 ? `${iso}T00:00:00Z` : iso) }
function fmtPinDate(ms: number): string { return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) }
function trendCompact(n: number): string { const v = Math.round(n); return v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1).replace(/\.0$/, '')}k` : String(v) }
// a smooth (Catmull-Rom → bézier) curve through the points, so the line reads as
// a trend instead of a jagged connect-the-dots.

// mean of the daily series in [a, b) — the honest before/after read on a launch
function trendMeanIn(dayMs: { t: number; v: number }[], a: number, b: number): { mean: number; n: number } {
  let sum = 0, n = 0
  for (const d of dayMs) { if (d.t >= a && d.t < b) { sum += d.v; n++ } }
  return { mean: n > 0 ? sum / n : 0, n }
}

function CampaignTrend({ mv, list, chartRange = '30d', title = 'Trend', onPins, litPin, footer, customStart, customEnd, smooth = 7 }: { mv?: MetricView; list: StageCampaign[] | null; /** the stage chart's picked range — the trend follows it */ chartRange?: string; /** the custom window's edges (YYYY-MM-DD) when chartRange is 'custom' */ customStart?: string; customEnd?: string; /** the rolling window in days (1 = each day) */ smooth?: number; title?: string; /** which campaign got which pin number, for the list under the chart */ onPins?: (m: Record<string, number>) => void; /** the pin a tapped campaign row belongs to */ litPin?: number | null; /** the campaigns legend, rendered inside this card so it lines up with the pins */ footer?: React.ReactNode }) {
  const A = useAccent()
  const range: TrendRange = TREND_OF_RANGE[chartRange] ?? 'month'
  const [pick, setPick] = useState<number | null>(null) // the day under the finger
  const pinsRef = useRef<string>('')
  const [pinsKey, setPinsKey] = useState('')
  useEffect(() => { if (onPins && pinsKey) onPins(JSON.parse(pinsKey)) }, [pinsKey, onPins])
  // the sync writes zero rows for the newest days Google has not delivered yet; drawn as
  // data they dive the line and fake a "trending down" — so the series ends at the last
  // day with a real number (at most a week trimmed)
  const raw = (mv?.daily ?? []).filter((d) => d && d.date && trendDayMs(d.date) > 0)
  let cut = raw.length
  while (cut > 0 && cut > raw.length - 7 && (raw[cut - 1].value ?? 0) === 0) cut--
  const daily = raw.slice(0, Math.max(cut, 2))
  if (daily.length < 2) return null // no series → nothing honest to draw

  const dayMs = daily.map((d) => ({ t: trendDayMs(d.date), v: d.value }))
  const firstMs = dayMs[0].t
  const lastMs = dayMs[dayMs.length - 1].t
  const isCustom = chartRange === 'custom' && !!customStart && !!customEnd
  const endMs = isCustom ? Math.min(lastMs, trendDayMs(customEnd!)) : lastMs
  const startMs = isCustom ? Math.max(firstMs, trendDayMs(customStart!)) : range === 'all' ? firstMs : Math.max(firstMs, endMs - TREND_DAYS[range] * DAY_MS)
  const spanMs = Math.max(DAY_MS, endMs - startMs)

  const win = dayMs.filter((d) => d.t >= startMs && d.t <= endMs)
  if (win.length < 2) return null

  /* Every day drawn (owner 2026-09-04: the smoothed dozen-bucket curve "didn't share much"):
     thin bars for the raw days, weekends and all; a 7-DAY ROLLING AVERAGE as the trend
     line; the same window one period earlier as a faint dashed line; the best day marked;
     the latest average labelled. Shape, direction and "better than last time" read at once. */
  const days = win
  const n = days.length
  const maxV = Math.max(...days.map((d) => d.v))
  if (maxV <= 0) return null // an all-zero window → don't draw a flat fake line
  const avgV = days.reduce((s, d) => s + d.v, 0) / n
  // the one-line read: the window's last stretch against its first (a week each, or a
  // third of a short window), so "trending up 12%" means something a person can check
  const stretch = Math.max(DAY_MS * 2, Math.min(7 * DAY_MS, spanMs / 3))
  const headA = trendMeanIn(dayMs, startMs, startMs + stretch), headB = trendMeanIn(dayMs, endMs - stretch, endMs + 1)
  const trendPct = headA.n >= 2 && headB.n >= 2 && headA.mean > 0 ? Math.round(((headB.mean - headA.mean) / headA.mean) * 100) : null
  const roll = days.map((_, i) => { const sl = days.slice(Math.max(0, i - (smooth - 1)), i + 1); return sl.reduce((t, x) => t + x.v, 0) / sl.length })
  const byT = new Map(dayMs.map((x) => [x.t, x.v]))
  const priorOffset = Math.round(spanMs / DAY_MS + 1) * DAY_MS
  const prior = days.map((d) => byT.get(d.t - priorOffset) ?? null)
  const priorHas = prior.filter((v) => v != null).length >= Math.ceil(n / 2)
  // scale to the LINE that is drawn (the 7-day average), not the raw daily peak — a sharp
  // rise should fill the chart, not sit in the bottom half (owner 2026-09-04)
  const lineMax = Math.max(1, ...roll, ...(priorHas ? prior.filter((v): v is number => v != null) : [0]))
  const head = lineMax * 1.1
  // SVG geometry (uniform-scaled so pins stay round). y grows downward; a left gutter
  // holds the axis numbers.
  const W = 344, H = 214, padL = 34, padR = 14, padT = 28, padB = 22
  const plotW = W - padL - padR, yTop = padT, yBot = H - padB
  const xAt = (t: number) => padL + ((t - startMs) / spanMs) * plotW
  const yAt = (v: number) => yBot - (v / head) * (yBot - yTop)
  const clampX = (x: number) => Math.max(padL + 11, Math.min(W - padR - 11, x))
  const yTicks = [lineMax, lineMax / 2, 0]
  const slot = plotW / n
  const xOf = (i: number) => padL + (i + 0.5) * slot
  const pts = days.map((_, i) => ({ x: xOf(i), y: yAt(roll[i]) }))
  const line = pts.map((pt, i) => `${i ? 'L' : 'M'}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(' ')
  const area = `${line} L${pts[n - 1].x.toFixed(1)},${yBot} L${pts[0].x.toFixed(1)},${yBot} Z`
  const priorLine = prior.map((v, i) => (v == null ? '' : `${i > 0 && prior[i - 1] != null ? 'L' : 'M'}${xOf(i).toFixed(1)},${yAt(v).toFixed(1)}`)).filter(Boolean).join(' ')
  const noun = mv?.unit ?? ''

  const yOnLine = (x: number) => {
    if (x <= pts[0].x) return pts[0].y
    if (x >= pts[pts.length - 1].x) return pts[pts.length - 1].y
    for (let i = 0; i < pts.length - 1; i++) {
      if (x >= pts[i].x && x <= pts[i + 1].x) {
        const f = (x - pts[i].x) / Math.max(1e-6, pts[i + 1].x - pts[i].x)
        return pts[i].y + f * (pts[i + 1].y - pts[i].y)
      }
    }
    return pts[pts.length - 1].y
  }

  // Group campaigns that went live inside the window BY DAY → one pin per date
  // (several launches on the same day share a pin). For each date, the honest
  // before/after read: mean of this stage's daily metric in the 14 days before vs
  // the 14 days after the launch. Shown only when both windows have real data.
  const HALF = 14 * DAY_MS
  const byDay = new Map<string, { ms: number; items: StageCampaign[] }>()
  for (const c of list ?? []) {
    if (c.state === 'production') continue // being made — nothing has gone live to pin
    const ms = c.shippedAt ? trendDayMs(c.shippedAt) : NaN
    if (!Number.isFinite(ms) || ms < startMs || ms > endMs) continue
    const key = new Date(ms).toISOString().slice(0, 10)
    const g = byDay.get(key)
    if (g) { g.items.push(c); g.ms = Math.min(g.ms, ms) }
    else byDay.set(key, { ms, items: [c] })
  }
  const marks = [...byDay.values()].sort((a, b) => a.ms - b.ms).map((g, i) => {
    const before = trendMeanIn(dayMs, g.ms - HALF, g.ms)
    const after = trendMeanIn(dayMs, g.ms, g.ms + HALF)
    const delta = before.n >= 3 && after.n >= 3 && before.mean > 0
      ? Math.round(((after.mean - before.mean) / before.mean) * 100)
      : null
    const cx = clampX(xAt(g.ms))
    return { ...g, n: i + 1, cx, cy: yOnLine(cx), delta }
  })

  // When markers sit close enough that the numbers touch, show each one's date
  // beneath its pin so they can be told apart. Stagger crowded labels across rows
  // so the dates themselves don't collide.
  // Pins that would overlap merge into ONE pin that reads "2–6" and carries one date span,
  // so the chart stays legible; the list below still shows every launch day on its own.
  const CROWD = 26
  type Cluster = { first: number; last: number; cx: number; cy: number; ms0: number; ms1: number }
  const clusters: Cluster[] = []
  for (const m of marks) {
    const c = clusters[clusters.length - 1]
    if (c && m.cx - c.cx < CROWD) { c.last = m.n; c.ms1 = m.ms; c.cx = (c.cx + m.cx) / 2; c.cy = yOnLine(c.cx) }
    else clusters.push({ first: m.n, last: m.n, cx: m.cx, cy: m.cy, ms0: m.ms, ms1: m.ms })
  }

  const gid = `trendfill-${mv?.key ?? 'x'}`
  const pinMap: Record<string, number> = {}
  for (const m of marks) for (const c of m.items) pinMap[c.id] = m.n
  const pinsJson = JSON.stringify(pinMap)
  if (pinsJson !== pinsRef.current) { pinsRef.current = pinsJson; queueMicrotask(() => setPinsKey(pinsJson)) }
  return (
    <div style={CARD}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 2 }}>
        <span style={H2}>{title}</span>
        <span style={{ fontSize: 12.5, color: C.faint }}>{isCustom ? `${fmtPinDate(startMs)} – ${fmtPinDate(endMs)}` : range === 'all' ? 'all time' : `this ${TREND_LABEL[range].toLowerCase()}`}</span>
      </div>
      {/* the read, in one line: where the line is heading, and what was launched into it */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {trendPct == null ? (
          <span style={{ fontSize: 13.5, color: C.mute }}>Not enough days to call a direction yet.</span>
        ) : (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13.5, fontWeight: 600, color: Math.abs(trendPct) < 5 ? C.mute : trendPct > 0 ? C.greenDk : C.coral }}>
            {Math.abs(trendPct) < 5 ? <Minus size={15} /> : trendPct > 0 ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
            {Math.abs(trendPct) < 5 ? 'Holding steady' : Math.abs(trendPct) > 999 ? (trendPct > 0 ? 'Trending up sharply' : 'Trending down sharply') : `${trendPct > 0 ? 'Trending up' : 'Trending down'} ${Math.abs(trendPct)}%`}
          </span>
        )}
        <span style={{ fontSize: 12.5, color: C.faint }}>· {marks.length === 0 ? 'nothing launched in this window' : marks.length === 1 ? '1 launch pinned below' : `${marks.length} launches pinned below`}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', touchAction: 'pan-y' }} role="img" aria-label="Stage trend: every day, the 7-day average, the prior period, and campaign go-live markers"
        onPointerDown={(e) => { const r = e.currentTarget.getBoundingClientRect(); const x = ((e.clientX - r.left) / r.width) * W; setPick(Math.max(0, Math.min(n - 1, Math.round((x - padL) / slot - 0.5)))) }}
        onPointerMove={(e) => { if (e.buttons === 0 && e.pointerType !== 'mouse') return; const r = e.currentTarget.getBoundingClientRect(); const x = ((e.clientX - r.left) / r.width) * W; setPick(Math.max(0, Math.min(n - 1, Math.round((x - padL) / slot - 0.5)))) }}
        onPointerLeave={() => setPick(null)}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={A.main} stopOpacity="0.22" />
            <stop offset="100%" stopColor={A.main} stopOpacity="0.01" />
          </linearGradient>
        </defs>
        {/* axis: three numbers, hairlines */}
        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={padL} y1={yAt(v)} x2={W - padR} y2={yAt(v)} stroke={C.line} strokeWidth={0.6} opacity={v === 0 ? 1 : 0.6} />
            <text x={padL - 6} y={yAt(v)} textAnchor="end" dominantBaseline="central" fontSize={9} fill={C.faint}>{trendCompact(v)}</text>
          </g>
        ))}
        {/* the same window one period earlier */}
        {priorHas && <path d={priorLine} fill="none" stroke={C.mute} strokeOpacity={0.55} strokeWidth={1.3} strokeDasharray="3 3" strokeLinejoin="round" />}
        {/* the trend: a 7-day rolling average */}
        <path d={area} fill={`url(#${gid})`} />
        <path d={line} fill="none" stroke={A.main} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
        {/* the latest average, at the line's end */}
        <circle cx={pts[n - 1].x} cy={pts[n - 1].y} r={3.5} fill={A.main} stroke="#fff" strokeWidth={1.5} />
        {clusters.map((c) => {
          const multi = c.last !== c.first
          const tag = multi ? `${c.first}–${c.last}` : String(c.first)
          const r = multi ? 11 : 9
          const lit = litPin != null && litPin >= c.first && litPin <= c.last
          return (
            <g key={c.ms0}>
              <line x1={c.cx} y1={yTop} x2={c.cx} y2={yBot} stroke={lit ? A.dark : A.main} strokeWidth={lit ? 1.6 : 1} strokeOpacity={lit ? 0.9 : 0.55} strokeDasharray="3 3" />
              <circle cx={c.cx} cy={yBot} r={r} fill={lit ? A.dark : '#fff'} stroke={lit ? A.dark : A.main} strokeWidth={1.8} />
              <text x={c.cx} y={yBot} textAnchor="middle" dominantBaseline="central" fontSize={multi ? 8.5 : 10} fontWeight={700} fill={lit ? '#fff' : A.dark}>{tag}</text>
            </g>
          )
        })}
        {/* the day under the finger */}
        {pick != null && (
          <g>
            <line x1={xOf(pick)} y1={yTop} x2={xOf(pick)} y2={yBot} stroke={C.ink} strokeOpacity={0.35} strokeWidth={1} />
            <circle cx={xOf(pick)} cy={yAt(roll[pick])} r={4} fill="#fff" stroke={A.dark} strokeWidth={2} />
          </g>
        )}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.faint, margin: '2px 4px 0', paddingLeft: 18 }}>
        <span>{fmtPinDate(startMs)}</span>
        <span>{fmtPinDate((startMs + endMs) / 2)}</span>
        <span>{fmtPinDate(endMs)}</span>
      </div>
      {/* one fixed line under the axis: the legend, or the picked day's read */}
      <div style={{ minHeight: 22, marginTop: 8, fontSize: 11.5, display: 'flex', alignItems: 'center' }}>
        {pick != null ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: C.mute, width: '100%', whiteSpace: 'nowrap', overflow: 'hidden' }}>
            <b style={{ color: C.ink }}>{fmtPinDate(days[pick].t)}</b>
            <span><b style={{ color: C.ink }}>{Math.round(roll[pick]).toLocaleString()}</b> {noun}{smooth > 1 ? ' a day, on average' : ''}</span>
            {prior[pick] != null && <span style={{ color: C.faint }}>· prior period {prior[pick]!.toLocaleString()}</span>}
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', fontSize: 11 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: C.mute }}><span style={{ width: 14, height: 0, borderTop: `2.2px solid ${A.main}` }} /> {avgLabel(smooth)}</span>
            {priorHas && <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: C.faint }}><span style={{ width: 14, borderTop: `1.3px dashed ${C.mute}`, display: 'inline-block' }} /> Prior period</span>}
          </div>
        )}
      </div>

      {marks.length === 0 && !footer && <div style={{ marginTop: 12, fontSize: 12.5, color: C.faint, lineHeight: 1.45 }}>Nothing launched in this window. When something goes live, its day pins here.</div>}
      {footer}
    </div>
  )
}

/* A friendly network name from a source's provider id ("instagram" → "Instagram"). */
const PROVIDER_NAMES: Record<string, string> = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', linkedin: 'LinkedIn', youtube: 'YouTube', google_business_profile: 'Google', google_analytics: 'Google Analytics', google_search_console: 'Search Console', yelp: 'Yelp', social: 'a social account', ads: 'an ads account', pos: 'your register', reservations: 'a reservations app', delivery: 'a delivery app', loyalty: 'a loyalty program', email: 'your email tool' }
function providerName(id: string): string {
  const p = String(SOURCE_BY_ID[id]?.provider ?? '')
  return PROVIDER_NAMES[p] ?? (p ? p.charAt(0).toUpperCase() + p.slice(1) : '')
}
/** One quiet row for a group with nothing connected yet: names the networks that would
 *  fill it and opens the connect screen. Replaces a tile per network saying "Connect to see". */
function ConnectRow({ label, sources, first = false }: { label: string; sources: StageSourceView[]; first?: boolean }) {
  const provs = [...new Set(sources.filter((s) => s.status === 'AVAILABLE_NOT_CONNECTED').map((s) => String(SOURCE_BY_ID[s.id]?.provider ?? '')).filter(Boolean))]
  const names = provs.map((p) => PROVIDER_NAMES[p] ?? p)
  const list = names.length <= 2 ? names.join(' or ') : `${names.slice(0, 2).join(', ')} or ${names.length - 2} more`
  return (
    <Link href="/dashboard/connected-accounts" style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'inherit', padding: '11px 0 4px', borderTop: first ? 'none' : `0.5px solid ${C.line}` }}>
      <span style={{ display: 'inline-flex', flexShrink: 0, width: 36, justifyContent: 'center' }}>
        {(provs.length ? provs.slice(0, 3) : ['website']).map((p, i) => (
          <span key={p} style={{ width: 28, height: 28, borderRadius: 99, background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,.05), 0 3px 10px rgba(0,0,0,.09)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginLeft: i ? -10 : 0, opacity: 0.55, filter: 'grayscale(.4)' }}>
            <BrandOrMark provider={p} size={15} />
          </span>
        ))}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 600, color: C.ink }}>{label}</div>
        <div style={{ fontSize: 12, color: C.mute, marginTop: 1, lineHeight: 1.35 }}>{names.length ? `Connect ${list} to see it here.` : 'Coming soon.'}</div>
      </div>
      {names.length > 0 && <span style={{ fontSize: 12.5, fontWeight: 600, color: C.greenDk, flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 2 }}>Connect <ChevronRight size={14} /></span>}
    </Link>
  )
}
/** Several campaigns shipped the same day under the same title read as one row with a count. */
function foldSameNames(items: StageCampaign[]): { c: StageCampaign; count: number }[] {
  const out: { c: StageCampaign; count: number }[] = []
  for (const c of items) {
    const hit = out.find((o) => o.c.name === c.name)
    if (hit) hit.count++; else out.push({ c, count: 1 })
  }
  return out
}
function StageCampaigns({ list, pins = {}, lit = null, onLight, bare = false }: { list: StageCampaign[] | null; /** campaign id → its pin number on the trend above */ pins?: Record<string, number>; lit?: number | null; onLight?: (n: number | null) => void; /** render inside another card (the trend), no card of its own */ bare?: boolean }) {
  const A = useAccent()
  if (list === null) return null // stay quiet until the fetch lands
  const MAX = 5
  // live and finished ones first (they pin), then what is still being made
  const order = (c: StageCampaign) => (c.state === 'production' ? 2 : c.state === 'done' ? 1 : 0)
  const sorted = [...list].sort((a, b) => order(a) - order(b) || (pins[a.id] ?? 99) - (pins[b.id] ?? 99))
  const shown = foldSameNames(sorted).slice(0, MAX)
  const extra = foldSameNames(sorted).length - shown.length
  const hasPins = Object.keys(pins).length > 0
  const wrap: React.CSSProperties = bare ? { marginTop: 16 } : CARD
  return (
    <div style={wrap}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 2 }}><span style={H2}>Campaigns</span>{hasPins && <span style={{ fontSize: 12.5, color: C.faint }}>tap a number to find it above</span>}</div>
      {shown.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {shown.map(({ c, count }) => {
            const n = pins[c.id]
            const isLit = n != null && lit === n
            const stateWord = c.state === 'done' ? 'Finished' : c.state === 'production' ? 'In production' : 'Live'
            const stateCol = c.state === 'done' ? C.mute : c.state === 'production' ? '#a8720c' : A.dark
            return (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 0', borderTop: `0.5px solid ${C.line}` }}>
                {n != null
                  ? <button type="button" onClick={() => onLight?.(isLit ? null : n)} aria-pressed={isLit} aria-label={`Find pin ${n} on the chart`} style={{ width: 34, height: 34, borderRadius: 99, background: isLit ? A.dark : '#fff', border: `1.8px solid ${isLit ? A.dark : A.main}`, color: isLit ? '#fff' : A.dark, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0, cursor: 'pointer', fontFamily: 'inherit', padding: 0, transition: 'background .15s' }}>{n}</button>
                  : <div style={{ width: 34, height: 34, borderRadius: 9, background: c.state === 'production' ? '#fbf1da' : A.soft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Megaphone size={16} color={c.state === 'production' ? '#a8720c' : A.dark} /></div>}
                <Link href={count > 1 ? '/dashboard/campaigns' : (c.href ?? `/dashboard/campaigns/${c.id}`)} style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'inherit' }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: stateCol, marginTop: 1 }}><span style={{ width: 6, height: 6, borderRadius: 99, background: stateCol }} />{stateWord}{count > 1 ? ` · ${count} alike` : ''}{c.shippedAt && c.state !== 'production' ? ` · ${fmtPinDate(trendDayMs(c.shippedAt))}` : ''}</span>
                  </span>
                  <ChevronRight size={17} color={C.faint} style={{ flexShrink: 0 }} />
                </Link>
              </div>
            )
          })}
          {extra > 0 && (
            <Link href="/dashboard/campaigns" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 8, fontSize: 12.5, fontWeight: 600, color: A.dark, textDecoration: 'none' }}>{extra} more on this stage <ChevronRight size={14} /></Link>
          )}
        </div>
      ) : (
        <Link href="/dashboard/campaigns/new" style={{ display: 'flex', alignItems: 'center', gap: 11, ...TILE, padding: 14, textDecoration: 'none', color: 'inherit', marginTop: 8 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: A.soft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Megaphone size={16} color={A.dark} /></div>
          <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: C.mute, lineHeight: 1.4 }}>No campaign on this yet. <span style={{ color: A.dark, fontWeight: 600 }}>Start one →</span></div>
        </Link>
      )}
    </div>
  )
}

/* ── Highlights: only the days that were abnormally high or low against their own week ── */
function HighlightsCard({ mv, days, label, smooth = 7 }: { mv: MetricView; days: number; label: string; smooth?: number }) {
  const win_n = Math.max(3, smooth)
  const raw = (mv.daily ?? []).filter((d) => d && d.date && trendDayMs(d.date) > 0).map((d) => ({ date: d.date, value: d.value ?? 0 }))
  const win = raw.slice(-Math.max(days, 14))
  const hits = deriveStandouts(win, 4, win_n).filter((h) => Math.abs(h.vsWeekPct) >= 30)
  const noun = mv.unit ?? ''
  return (
    <div style={CARD}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={H2}>Highlights</span>
        <span style={{ fontSize: 12.5, color: C.faint }}>days far from their own {win_n}-day average</span>
      </div>
      {hits.length === 0 ? (
        <div style={{ fontSize: 13, color: C.mute, marginTop: 6, lineHeight: 1.45 }}>No day stood out from its week for {label.toLowerCase()} in this window.</div>
      ) : hits.map((h, i) => (
        <div key={h.date} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: i === 0 ? 'none' : `0.5px solid ${C.line}` }}>
          <span style={{ width: 34, height: 34, borderRadius: 99, background: h.vsWeekPct > 0 ? C.greenSoft : C.coralBg, color: h.vsWeekPct > 0 ? C.greenDk : C.coral, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{h.vsWeekPct > 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: C.ink }}>{fmtPinDate(trendDayMs(h.date))} · {h.holiday ?? h.weekday}</span>
            <span style={{ display: 'block', fontSize: 12.5, color: C.mute, marginTop: 2 }}>{h.value.toLocaleString()} {noun} · <b style={{ color: h.vsWeekPct > 0 ? C.greenDk : C.coral, fontWeight: 700 }}>{h.vsWeekPct > 0 ? '▲' : '▼'}{Math.abs(h.vsWeekPct)}%</b> {h.vsWeekPct > 0 ? 'above' : 'below'} its {win_n}-day average</span>
          </span>
        </div>
      ))}
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

// ── Recent posts, newest first ────────────────────────────────────────────────
//    Three honesty rules the owner asked for by name:
//    · a post whose numbers have NOT synced says so instead of showing a false 0
//    · the type chip names what it is (Photo / Video / Reel / Carousel) from real fields
//    · a row only looks tappable when there IS a link; otherwise it says the link is
//      unavailable, because a tap that goes nowhere reads as broken
/**
 * ONE post row, exported so the "view all" page renders the SAME row rather than a copy that
 * drifts. The honesty rules below live here once: a re-implementation on the full list would
 * be the next place a false zero or a dead link comes back.
 */
export function PostRow({ p, first = true }: { p: InsightsPost; first?: boolean }) {
  const date = p.postedAt ? reviewDate(p.postedAt) : ''
  const platform = p.platform ? p.platform.charAt(0).toUpperCase() + p.platform.slice(1) : ''
  const inner = (
    <>
      <div style={{ position: 'relative', width: 60, height: 60, flexShrink: 0 }}>
        <div style={{ width: 60, height: 60, borderRadius: 12, backgroundColor: p.thumbnailUrl ? '#000' : '#eeeef1', backgroundImage: p.thumbnailUrl ? `url(${p.thumbnailUrl})` : undefined, backgroundSize: 'cover', backgroundPosition: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {!p.thumbnailUrl && <ImageIcon size={20} color={C.faint} />}
        </div>
        <span style={{ position: 'absolute', right: -5, bottom: -5, width: 24, height: 24, borderRadius: 99, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <BrandOrMark provider={p.platform} size={14} />
        </span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: C.mute, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{platform}{p.type ? ` ${p.type.toLowerCase()}` : ''}{date ? ` · ${date}` : ''}</div>
        <div style={{ fontSize: 15, fontWeight: 600, color: C.ink, marginTop: 3, fontFamily: DISPLAY, letterSpacing: '-.01em' }}>
          {p.unreported ? <span style={{ color: C.faint, fontWeight: 500, fontFamily: 'inherit' }}>Views not reported</span>
            : p.pending ? <span style={{ color: C.faint, fontWeight: 500, fontFamily: 'inherit' }}>Numbers still coming in</span>
            : <>{p.reach.toLocaleString()} <span style={{ fontWeight: 500, color: C.mute, fontFamily: 'inherit', fontSize: 13 }}>views</span></>}
          {p.likes > 0 && <span style={{ fontWeight: 500, color: C.mute, fontSize: 13, fontFamily: 'inherit' }}> · {p.likes.toLocaleString()} likes</span>}
        </div>
        {!p.permalink && <div style={{ fontSize: 11.5, color: C.faint, marginTop: 2 }}>link unavailable</div>}
      </div>
      {p.permalink && <ArrowUpRight size={16} color={C.faint} style={{ flexShrink: 0 }} />}
    </>
  )
  const box: React.CSSProperties = { textDecoration: 'none', color: 'inherit', display: 'flex', gap: 13, alignItems: 'center', padding: '10px 0', borderTop: first ? 'none' : `0.5px solid ${C.line}` }
  return p.permalink
    ? <a href={p.permalink} target="_blank" rel="noreferrer noopener" style={box}>{inner}</a>
    : <div style={box}>{inner}</div>
}
export const POSTS_FOOTNOTE = 'Your latest posts across every connected account, with how many views each one has so far. A post added very recently can take a day for its numbers to arrive.'

/** The five newest, with a way through to everything. The count is the REAL total we hold,
 *  so the link never promises a fuller list than exists. */
function BestPosts({ posts, total }: { posts: InsightsPost[]; total?: number }) {
  const more = typeof total === 'number' && total > posts.length
  return (
    <Section title="Recent posts">
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {posts.map((p, i) => <PostRow key={p.id} p={p} first={i === 0} />)}
      </div>
      {more && (
        /* the way through to every post reads as one more row of the list (owner 2026-09-04:
           the full-width glass slab looked ugly on the white card) */
        <Link href="/dashboard/insights/posts" className="mvp-row" style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 2, padding: '12px 0 4px', borderTop: `0.5px solid ${C.line}`, textDecoration: 'none', color: C.ink }}>
          <Mark hue="mint" size={36} bare><ImageIcon size={17} /></Mark>
          <span style={{ flex: 1, fontSize: 14.5, fontWeight: 600 }}>View all</span>
          <ChevronRight size={17} color={C.faint} style={{ flexShrink: 0 }} />
        </Link>
      )}
      <div style={{ fontSize: 11, color: C.faint, marginTop: 11, lineHeight: 1.45 }}>{POSTS_FOOTNOTE}</div>
    </Section>
  )
}

function Section({ title, sub, action, children }: { title: string; sub?: string; action?: { label: string; href: string }; children: React.ReactNode }) {
  return (
    <div style={CARD}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 14 }}>
        <span style={H2}>{title}</span>
        {sub && <span style={{ fontSize: 12.5, color: C.faint }}>{sub}</span>}
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

/** the hero card's shape while the numbers load — a quiet shimmer, no copy to read */
function InsightsGhost() {
  const bone = (w: number | string, h: number, r = 8): React.CSSProperties => ({ width: w, height: h, borderRadius: r, background: 'linear-gradient(90deg, #f0f0f3 0%, #f7f7f9 45%, #f0f0f3 90%)', backgroundSize: '200% 100%', animation: 'mvpGhost 1.6s ease-in-out infinite' })
  return (
    <div style={{ margin: '12px 18px 0', background: '#fff', borderRadius: 18, padding: '14px 18px 18px', boxShadow: CARD_SHADOW }} aria-busy>
      <style>{`@keyframes mvpGhost{0%{background-position:100% 0}100%{background-position:-100% 0}}@media (prefers-reduced-motion:reduce){[aria-busy] *{animation:none!important}}`}</style>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={bone(150, 26, 8)} />
        <div style={{ display: 'flex', gap: 8 }}><div style={bone(36, 36, 99)} /><div style={bone(36, 36, 99)} /></div>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginTop: 16 }}><div style={bone(120, 40, 10)} /><div style={bone(110, 26, 99)} /></div>
      <div style={{ ...bone(180, 12, 6), marginTop: 10 }} />
      <div style={{ ...bone('100%', 40, 999), marginTop: 22 }} />
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 84, marginTop: 16 }}>
        {Array.from({ length: 30 }, (_, i) => <div key={i} style={{ ...bone('100%', 14 + ((i * 37) % 60), 3), flex: 1 }} />)}
      </div>
      <div style={{ ...bone(190, 12, 6), marginTop: 14 }} />
    </div>
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
