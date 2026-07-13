'use client'

/**
 * MVP Home — ported from the apnosh-mvp design (yejukim/apnosh-mvp,
 * src/App.tsx HomeScreen/CustomersView). Presentation only; all data is
 * passed in already-transformed by the route, which sources it from the
 * real /api/dashboard/load endpoint (GBP interactions + approvals).
 *
 * Visual system is faithful to the design: brand green #4abd98, Cal Sans
 * display + Inter body, 430px mobile frame, calm "see don't do" layout.
 * Inline styles are kept (as in the source) to maximise fidelity for this
 * proof; a later pass can move them to the portal's Tailwind tokens.
 */

import {
  Bell, Sparkles, Check, Plus, TrendingUp, TrendingDown, Minus,
  ChevronRight, ChevronLeft, Receipt, X, Navigation, Phone, MousePointerClick, CalendarDays,
  Heart, Star, MessageCircle, Mail, Eye, Users, Plug, Store, HelpCircle, Camera, Pencil, Send, MapPin,
} from 'lucide-react'
import { useState, useRef, useEffect, useMemo } from 'react'
import Link from 'next/link'
import type { Suggestion } from '@/lib/dashboard/suggestions'
import type { TimelineEvent } from '@/lib/dashboard/get-since-last-checked'
import type { UpcomingWorkItem } from '@/lib/dashboard/get-upcoming-work'
import { HomeFunnelLive } from './home-funnel'
import { MvpThemeProvider, useMvpTheme } from './mvp-theme'

const DISPLAY = "'Cal Sans','Inter',sans-serif"

/* Banner animations — ported verbatim from the design (apnosh-mvp App.tsx):
   an animated green→blue→indigo gradient, drifting/spinning background shapes,
   a floating icon, and a rise-in entrance. Honors reduced-motion. */
const MVP_ANIM_CSS = `
@keyframes mvpRise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
@keyframes mvpGradShift{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
@keyframes mvpFloaty{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
@keyframes mvpSpin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
@keyframes mvpDriftA{0%,100%{transform:translate(0,0) rotate(0)}50%{transform:translate(6px,-5px) rotate(8deg)}}
@keyframes mvpDriftB{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(-7px,4px) scale(1.08)}}
.mvp-rise{animation:mvpRise .5s cubic-bezier(.2,.7,.3,1) both}
.mvp-reviewGlow{background:linear-gradient(120deg,#2e9a78,#3a8fb0,#5b6fc9);background-size:200% 200%;animation:mvpGradShift 13s ease infinite}
.mvp-floaty{animation:mvpFloaty 3.2s ease-in-out infinite}
.mvp-driftA{animation:mvpDriftA 6s ease-in-out infinite}
.mvp-driftB{animation:mvpDriftB 7.5s ease-in-out infinite}
.mvp-spin{animation:mvpSpin 18s linear infinite}
@media (prefers-reduced-motion: reduce){.mvp-rise,.mvp-reviewGlow,.mvp-floaty,.mvp-driftA,.mvp-driftB,.mvp-spin{animation:none}}
.mvp-swipe{scrollbar-width:none;-ms-overflow-style:none}
.mvp-swipe::-webkit-scrollbar{display:none}
@keyframes mvpGrow{from{transform:scaleY(0)}to{transform:scaleY(1)}}
.mvp-grow{transform-origin:bottom;animation:mvpGrow .45s cubic-bezier(.2,.7,.3,1) both}
.mvp-stagger>*{animation:mvpRise .5s cubic-bezier(.2,.7,.3,1) both}
.mvp-stagger>*:nth-child(1){animation-delay:.03s}
.mvp-stagger>*:nth-child(2){animation-delay:.09s}
.mvp-stagger>*:nth-child(3){animation-delay:.15s}
.mvp-stagger>*:nth-child(4){animation-delay:.21s}
.mvp-stagger>*:nth-child(5){animation-delay:.27s}
.mvp-stagger>*:nth-child(6){animation-delay:.33s}
.mvp-stagger>*:nth-child(7){animation-delay:.39s}
.mvp-stagger>*:nth-child(8){animation-delay:.45s}
@media (prefers-reduced-motion: reduce){.mvp-grow,.mvp-stagger>*{animation:none}}
/* native-app feel: a quick press-in on tap, a slow breathing glow on the lead
   card, and a soft ping on live indicators (freshest win, a scheduled post). */
.mvp-press{transition:transform .16s cubic-bezier(.2,.7,.3,1),box-shadow .2s}
.mvp-press:active{transform:scale(.975)}
@media (hover:hover){.mvp-press:hover{transform:translateY(-1px);box-shadow:0 4px 14px rgba(0,0,0,.07)}}
@keyframes mvpBreathe{0%,100%{box-shadow:0 5px 14px rgba(0,0,0,.10)}50%{box-shadow:0 9px 24px rgba(0,0,0,.16)}}
.mvp-breathe{animation:mvpBreathe 4.5s ease-in-out infinite}
@keyframes mvpPing{0%{box-shadow:0 0 0 0 rgba(74,189,152,.32)}70%{box-shadow:0 0 0 7px rgba(74,189,152,0)}100%{box-shadow:0 0 0 0 rgba(74,189,152,0)}}
.mvp-ping{animation:mvpPing 2.4s ease-out infinite}
@media (prefers-reduced-motion: reduce){.mvp-breathe,.mvp-ping{animation:none}.mvp-press,.mvp-press:active,.mvp-press:hover{transition:none;transform:none}}
`

export interface MetricView {
  key: string
  tabLabel: string          // short label for the metric switcher
  heroLabel: string         // hero title
  heroSub: string           // hero subtitle
  unit: string              // chart verb, e.g. "took action", "reached"
  total: number
  weekPct: number
  monthPct: number
  prevMonthLabel: string
  // settled = fully reported (counted in the %); elapsed = has happened (counted
  // in the total/average). The current week's not-yet-reported days are neither.
  chart: { label: string; value: number; prev: number; settled?: boolean; elapsed?: boolean }[]
  chartStart?: string
  daily: { date: string; value: number }[]
  monthly: { label: string; value: number; ym: string }[]
  tiles: { key: string; label: string; value: string; configured: boolean }[]
  lastDataDate: string      // freshest day with data (data frontier); '' if none
}

export interface MvpHomeData {
  greeting: string
  avatarText: string
  avatarEmoji?: string
  avatarImage?: string
  metrics: MetricView[]
  signal: { state: 'recommendation' | 'ontrack'; metric?: string; message?: string }
  /** Tailored "stack" cards shown at the top of Home (one reads as "Do this next"). */
  suggestions?: Suggestion[]
  approvals: { id: string; tag: string; timing: string; title: string; subtitle: string; emoji?: string; image?: string }[]
  review: { prevMonthLabel: string; cycleLabel: string; budget: number } | null
  planner?: { id: string; day: string; mon: string; daysLabel: string; label: string; hook: string; planned: boolean }[]
  /** Recent activity timeline (since-you-last-checked): posts live, reviews, replies, milestones. */
  activity?: TimelineEvent[]
  /** What the team is actively working on + what's going live next. */
  upcomingWork?: UpcomingWorkItem[]
}

// Owner-facing colour per work tone for the "Coming up next" section.
const WORK_TONE: Record<string, { fg: string; bg: string }> = {
  scheduled: { fg: '#2e9a78', bg: '#eaf7f3' },
  production: { fg: '#3a6ea5', bg: '#eef3fb' },
  review: { fg: '#bd7e16', bg: '#fbf3e4' },
  planning: { fg: '#6e6e73', bg: '#f1f1f3' },
}

// Icon per recent-activity event kind (set by getSinceLastChecked).
const ACT_ICON: Record<string, React.ComponentType<{ size?: number; color?: string }>> = {
  post: Camera, star: Star, reply: MessageCircle, plug: Plug, user: Users,
  check: Check, edit: Pencil, send: Send, dot: Sparkles,
}

// Handy shortcuts at the foot of the home.
const QUICK_LINKS: { label: string; href: string; Icon: React.ComponentType<{ size?: number; color?: string }> }[] = [
  { label: 'Update business info', href: '/dashboard/business-info', Icon: Store },
  { label: 'Connected accounts', href: '/dashboard/connected-accounts', Icon: Plug },
  { label: 'Your team', href: '/dashboard/team', Icon: Users },
  { label: 'Get help', href: '/dashboard/help', Icon: HelpCircle },
]

// Breakdown-tile icons keyed by the icon name get-home-metrics emits.
const TILE_ICON: Record<string, React.ComponentType<{ size?: number; color?: string }>> = {
  pin: Navigation, phone: Phone, cursor: MousePointerClick, heart: Heart, star: Star,
  message: MessageCircle, mail: Mail, calendar: CalendarDays, eye: Eye, users: Users,
}

// Each home metric graph deep-links into its matching funnel stage on the Insights
// page (same clean graph, now the stage's own page). Loyalty/email has no funnel
// stage, so its card stays unlinked.
const METRIC_STAGE: Record<string, { key: string; label: string }> = {
  reach: { key: 'shown', label: 'Awareness' },
  interactions: { key: 'moved', label: 'Customer actions' },
  bookings: { key: 'camein', label: 'Orders' },
  reputation: { key: 'back', label: 'Retention' },
}

// The funnel (the people animation) IS the home now. The old chart-home below it — the swipeable metric/chart
// slides, suggestion stack, "Coming up next", "Recent activity", quick links — is SHELVED: kept in this file but
// NOT rendered. Flip this to `true` to bring the whole old home back exactly as it was.
const LEGACY_HOME = false

export default function MvpHome(props: { data: MvpHomeData; showHeader?: boolean; clientId?: string; suggestionsReady?: boolean }) {
  // One theme provider wraps the whole Home tree, so the funnel and every card
  // below read the same light/dark skin and the one toggle flips all of it.
  return (
    <MvpThemeProvider>
      <MvpHomeInner {...props} />
    </MvpThemeProvider>
  )
}

function MvpHomeInner({ data, showHeader = true, clientId, suggestionsReady = true }: { data: MvpHomeData; showHeader?: boolean; clientId?: string; suggestionsReady?: boolean }) {
  const { C } = useMvpTheme()
  const metrics = data.metrics ?? []
  const [reviewHidden, setReviewHidden] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [activeIdx, setActiveIdx] = useState(0)
  const onScroll = () => {
    const el = scrollRef.current; if (!el) return
    const idx = Math.round(el.scrollLeft / Math.max(1, el.clientWidth))
    setActiveIdx((p) => (p === idx ? p : idx))
  }
  const goTo = (i: number) => { const el = scrollRef.current; if (el) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' }) }

  return (
    <div style={{ fontFamily: "'Inter',system-ui,sans-serif", color: C.ink, background: C.pageBg, minHeight: '100%', overflowY: 'auto', paddingBottom: 28 }}>
      <style>{MVP_ANIM_CSS}</style>
      {/* sticky greeting bar — suppressed when embedded under the portal's
          own top bar (the design's full chrome lands in the nav-shell step). */}
      {showHeader && (
      <div style={{ position: 'sticky', top: 0, zIndex: 20, background: C.card, padding: '14px 18px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${C.line}` }}>
        <div style={{ fontSize: 15, color: C.mute }}>{data.greeting}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ position: 'relative' }}><Bell size={20} color={C.ink} />{(data.approvals?.length ?? 0) > 0 && <div style={{ position: 'absolute', top: -5, right: -6, minWidth: 15, height: 15, padding: '0 3px', boxSizing: 'border-box', borderRadius: 99, background: C.green, color: '#fff', fontSize: 9.5, fontWeight: 700, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{data.approvals.length > 9 ? '9+' : data.approvals.length}</div>}</div>
          <div style={{ width: 34, height: 34, borderRadius: '50%', background: C.greenSoft, border: `1px solid ${C.greenLine}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 600, color: C.greenDk, position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
            {data.avatarEmoji || data.avatarText}
            {data.avatarImage && <img src={data.avatarImage} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
          </div>
        </div>
      </div>
      )}

      <div style={{ padding: '16px 18px 0' }}>
        {/* monthly review nudge */}
        {data.review && !reviewHidden && (
          <div className="mvp-rise mvp-reviewGlow" style={{ position: 'relative', overflow: 'hidden', marginBottom: 12, borderRadius: 18, padding: '13px 16px', color: '#fff' }}>
            {/* drifting / spinning shapes, ported from the design */}
            <i aria-hidden className="mvp-driftB" style={{ position: 'absolute', width: 118, height: 118, top: -44, right: -28, borderRadius: '50%', background: 'rgba(255,255,255,.10)' }} />
            <i aria-hidden className="mvp-driftA" style={{ position: 'absolute', width: 66, height: 66, bottom: -26, left: 40, borderRadius: '50%', border: '2px solid rgba(255,255,255,.18)' }} />
            <i aria-hidden className="mvp-spin" style={{ position: 'absolute', width: 22, height: 22, top: 34, right: 30, borderRadius: 6, background: 'rgba(255,255,255,.12)' }} />
            <i aria-hidden className="mvp-driftA" style={{ position: 'absolute', width: 11, height: 11, bottom: 18, right: 78, borderRadius: '50%', background: 'rgba(255,255,255,.3)' }} />
            <div style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', gap: 11 }}>
              <div className="mvp-floaty" style={{ width: 38, height: 38, borderRadius: 11, background: 'rgba(255,255,255,.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Receipt size={19} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Sparkles size={13} /><span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', opacity: .92 }}>New this month</span></div>
                <div style={{ fontWeight: 700, fontSize: 15, marginTop: 2 }}>Your {data.review.prevMonthLabel} review is ready</div>
                <div style={{ fontSize: 12.5, opacity: .9, marginTop: 1 }}>See what last month&apos;s ${data.review.budget} did, then set {data.review.cycleLabel} in one decision.</div>
              </div>
              <ChevronRight size={20} />
            </div>
            <button onClick={() => setReviewHidden(true)} aria-label="Hide review" style={{ position: 'absolute', top: 8, right: 8, zIndex: 3, width: 24, height: 24, borderRadius: 99, border: 'none', background: 'rgba(255,255,255,.22)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}><X size={14} /></button>
          </div>
        )}

        {/* Everything below the banner cascades in on load (staggered rise). */}
        <div className="mvp-stagger">
        {/* THE MARKETING FUNNEL — the whole-business hero: your real Google
            funnel (Awareness → Interest → Customer actions → Orders → Retention)
            in the glass-vessel view. Renders only when the business has Google data. */}
        <div style={{ margin: '-16px -18px 0' }}>
          <HomeFunnelLive clientId={clientId} height={620} fill />
        </div>
        {LEGACY_HOME && (<>
        {/* SWIPEABLE METRIC CARDS — swipe left/right to change which graph
            you're looking at; dots show where you are. No tabs. */}
        <div ref={scrollRef} onScroll={onScroll} className="mvp-swipe" style={{ display: 'flex', overflowX: 'auto', scrollSnapType: 'x mandatory' }}>
          {metrics.map((mv) => {
            const st = METRIC_STAGE[mv.key]
            return <MetricCard key={mv.key} mv={mv} stage={st ? { href: `/dashboard/insights?stage=${st.key}`, label: st.label } : undefined} />
          })}
        </div>

        {/* dots — current metric + tap to jump */}
        {metrics.length > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 7, marginTop: 12 }}>
            {metrics.map((mv, i) => (
              <button key={mv.key} aria-label={mv.tabLabel} onClick={() => goTo(i)} style={{ width: i === activeIdx ? 20 : 7, height: 7, borderRadius: 99, border: 'none', padding: 0, cursor: 'pointer', background: i === activeIdx ? C.green : C.line, transition: 'width .2s, background .2s' }} />
            ))}
          </div>
        )}

        {/* See all insights — small text link under the graphs */}
        <Link href="/dashboard/insights" style={{ display: 'block', textAlign: 'center', marginTop: 12, marginBottom: 2, fontSize: 12.5, fontWeight: 600, color: C.greenDk, textDecoration: 'none' }}>
          See all insights · full year →
        </Link>

        {/* SUGGESTIONS — a small Robinhood-style stack of tailored cards. One
            reads as "Do this next"; the rest are timely info or genuine
            recommendations drawn from this restaurant's own signals. */}
        <SuggestionStack items={data.suggestions ?? []} clientId={clientId} ready={suggestionsReady} />

        {/* COMING UP NEXT — what the team is actively working on and what's
            going live next, from the content pipeline. Always shown; a calm
            empty state when nothing is queued. */}
        <div style={{ marginTop: 22 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: C.mute }}>Coming up next</span>
            <span style={{ fontSize: 11, color: C.faint }}>what your team is on</span>
          </div>
          {(data.upcomingWork?.length ?? 0) > 0 ? (
            (data.upcomingWork ?? []).map((w) => {
              const t = WORK_TONE[w.tone] ?? WORK_TONE.planning
              return (
                <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 11, background: C.card, border: `0.5px solid ${C.line}`, borderRadius: 14, padding: 12, marginBottom: 8 }}>
                  <span className={w.tone === 'scheduled' ? 'mvp-ping' : undefined} style={{ width: 9, height: 9, borderRadius: 99, background: t.fg, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{w.title}</div>
                    <div style={{ fontSize: 11.5, color: C.faint, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{w.channel}{w.whenLabel ? ` · ${w.whenLabel}` : ''}</div>
                  </div>
                  <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, color: t.fg, background: t.bg, borderRadius: 99, padding: '4px 10px', boxShadow: `0 2px 8px ${t.fg}1f` }}>{w.statusLabel}</span>
                </div>
              )
            })
          ) : (
            <EmptySection icon={<CalendarDays size={20} color={C.green} />} title="Nothing queued right now" text="Your next posts will show up here as your team lines them up." />
          )}
        </div>

        {/* RECENT ACTIVITY — a calm highlight reel of what just happened: posts
            that went live, new reviews, replies, milestones. The headline win
            gets a filled green dot + bold; the rest are quiet context. Always
            shown; a calm empty state when nothing's happened yet. */}
        <div style={{ marginTop: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: C.mute }}>Recent activity</span>
            {(data.activity?.length ?? 0) > 0 && <Link href="/dashboard/inbox" style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, color: C.greenDk, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 1 }}>See all <ChevronRight size={13} /></Link>}
          </div>
          {(data.activity?.length ?? 0) > 0 ? (
            <div style={{ background: C.card, border: `0.5px solid ${C.line}`, borderRadius: 16, padding: '16px 15px 9px', boxShadow: '0 1px 3px rgba(0,0,0,.03)' }}>
              {(data.activity ?? []).map((e, i, arr) => {
                const last = i === arr.length - 1
                const Icon = ACT_ICON[e.icon ?? 'dot'] ?? Sparkles
                const win = e.emphasis === 'win'
                const nodeBg = win ? C.greenSoft : e.emphasis === 'mute' ? '#f4f4f6' : '#eef3fb'
                const nodeFg = win ? C.greenDk : e.emphasis === 'mute' ? C.faint : '#3a6ea5'
                return (
                  <div key={e.id} style={{ display: 'flex', gap: 12, paddingBottom: last ? 7 : 16 }}>
                    <div style={{ position: 'relative', flexShrink: 0, width: 36 }}>
                      {!last && <div style={{ position: 'absolute', left: 18, top: 38, bottom: -16, width: 2, marginLeft: -1, background: C.line }} />}
                      <div className={e.big ? 'mvp-ping' : undefined} style={{ width: 36, height: 36, borderRadius: '50%', background: nodeBg, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 1, boxShadow: win ? '0 2px 8px rgba(74,189,152,0.22)' : 'none' }}>
                        <Icon size={16} color={nodeFg} />
                      </div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
                      <div style={{ fontSize: 13.5, fontWeight: e.big ? 700 : 500, color: C.ink, lineHeight: 1.35 }}>{e.text}{e.extra ? <span style={{ color: C.mute, fontWeight: 400 }}> · {e.extra}</span> : null}</div>
                      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.05em', color: C.faint, marginTop: 3 }}>{e.whenLabel}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <EmptySection icon={<Sparkles size={20} color={C.green} />} title="Nothing new yet" text="Your posts, reviews, and wins will show up here." />
          )}
        </div>

        {/* QUICK LINKS — handy shortcuts at the foot of the home. */}
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: C.mute, marginBottom: 12 }}>Quick links</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {QUICK_LINKS.map((q) => (
              <Link key={q.href} href={q.href} className="mvp-press" style={{ display: 'flex', alignItems: 'center', gap: 13, background: C.card, border: `0.5px solid ${C.line}`, borderRadius: 14, padding: '15px 14px', textDecoration: 'none', color: 'inherit' }}>
                <div style={{ width: 40, height: 40, borderRadius: 11, background: C.greenSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 2px 10px rgba(74,189,152,0.18)' }}><q.Icon size={19} color={C.greenDk} /></div>
                <span style={{ flex: 1, fontSize: 14.5, fontWeight: 600, lineHeight: 1.2 }}>{q.label}</span>
                <ChevronRight size={17} color={C.faint} />
              </Link>
            ))}
          </div>
        </div>
        </>)}
        </div>
      </div>
    </div>
  )
}

/* ── SUGGESTION STACK ──────────────────────────────────────────────────────
   Robinhood-style: a swipeable row of tailored cards, the first reading as
   "Do this next". Cards are dismissable (remembered for 3 days, so a quick
   "not now" sticks without burying something that's still relevant later). */
const ACCENT: Record<string, { bg: string; border: string; fg: string }> = {
  amber: { bg: '#fbf3e4', border: '#eed9b3', fg: '#bd7e16' },
  green: { bg: '#eaf7f3', border: 'rgba(74,189,152,0.32)', fg: '#2e9a78' },
  blue: { bg: '#eef3fc', border: '#cfe0f5', fg: '#2f6fd0' },
  coral: { bg: '#f8efe9', border: '#ecd4c8', fg: '#a85c3c' },
  violet: { bg: '#f1edfb', border: '#ddd2f3', fg: '#6b4fd0' },
}
const SUG_ICON: Record<string, React.ComponentType<{ size?: number; color?: string }>> = {
  plug: Plug, star: Star, sparkles: Sparkles, message: MessageCircle, bell: Bell,
  calendar: CalendarDays, plus: Plus, trendingDown: TrendingDown, trendingUp: TrendingUp, mapPin: MapPin,
}
const DISMISS_TTL = 3 * 24 * 60 * 60 * 1000 // 3 days

// Keep exactly one "DO THIS NEXT" after client-side filtering: the lead can be
// dismissed, so re-promote the first remaining actionable card (and clear the
// label from any other). Returns new objects so it never mutates the data prop.
function markLeadLocal(list: Suggestion[]): Suggestion[] {
  const leadIdx = list.findIndex((s) => s.href)
  return list.map((s, i) => {
    if (i === leadIdx) return s.eyebrow === 'DO THIS NEXT' ? s : { ...s, eyebrow: 'DO THIS NEXT' }
    if (s.eyebrow === 'DO THIS NEXT') return { ...s, eyebrow: 'WORTH A LOOK' }
    return s
  })
}

function SuggestionStack({ items, clientId, ready = true }: { items: Suggestion[]; clientId?: string; ready?: boolean }) {
  const { C } = useMvpTheme()
  const key = `apnosh:dismissed-suggestions:${clientId || 'default'}`
  const [dismissed, setDismissed] = useState<Record<string, number>>({})
  const [loaded, setLoaded] = useState(false)
  const [step, setStep] = useState(0)

  useEffect(() => {
    try {
      const obj = JSON.parse(localStorage.getItem(key) || '{}') as Record<string, number>
      const cutoff = Date.now() - DISMISS_TTL
      const fresh: Record<string, number> = {}
      for (const [id, ts] of Object.entries(obj)) if (ts > cutoff) fresh[id] = ts
      setDismissed(fresh)
    } catch { /* ignore */ }
    setLoaded(true)
  }, [key])

  // Obligations (a waiting approval, a low review, a dropped connection) always
  // show and ignore any past dismissal — they reflect real state and clear once
  // the owner acts. Only soft tips honor the 3-day dismissal.
  const visible = useMemo(() => markLeadLocal(items.filter((s) => s.obligation || !dismissed[s.id]).slice(0, 5)), [items, dismissed])

  // Linear stepper through the deck (a "1 of N" counter, not a swipe carousel):
  // the front card is visible[step]; the next one or two peek behind it. Reset
  // to the top only when the SET of cards changes (instant set → richer server
  // set), not when one card's copy/count is rewritten in place.
  const itemsKey = items.map((s) => s.id).join('|')
  useEffect(() => { setStep(0) }, [itemsKey])
  const safeStep = Math.min(step, Math.max(0, visible.length - 1))
  const deck = visible.slice(safeStep, safeStep + 3)

  const dismiss = (id: string) => setDismissed((prev) => {
    const next = { ...prev, [id]: Date.now() }
    try { localStorage.setItem(key, JSON.stringify(next)) } catch { /* ignore */ }
    return next
  })

  // The "×" on a card's corner. A soft tip snoozes for 3 days (leaves the deck);
  // a pinned obligation is real and can't be cleared, so its × just flips past
  // to the next card — you still get to step through the whole stack.
  const closeFront = (s: Suggestion) => {
    if (s.obligation) setStep((p) => Math.min(p + 1, Math.max(0, visible.length - 1)))
    else dismiss(s.id)
  }

  if (!loaded) return null
  if (visible.length === 0) {
    // Always render something here — never let the section vanish. While the
    // richer server set is still loading, hold a calm placeholder so we don't
    // flash "all caught up" before a real card has had a chance to arrive.
    if (!ready) {
      return (
        <div style={{ background: C.cardSoft, border: `0.5px solid ${C.line}`, borderRadius: 18, padding: 16, marginBottom: 22, display: 'flex', gap: 13, alignItems: 'center' }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: C.greenSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Sparkles size={18} color={C.greenDk} /></div>
          <div style={{ fontSize: 13.5, lineHeight: 1.4, color: C.faint }}>Looking over what needs you&hellip;</div>
        </div>
      )
    }
    // Honest now: obligations can't be dismissed, so an empty deck means there
    // genuinely is nothing waiting — only soft tips were cleared.
    return (
      <div style={{ background: C.cardSoft, border: `0.5px solid ${C.line}`, borderRadius: 18, padding: 16, marginBottom: 22, display: 'flex', gap: 13, alignItems: 'center' }}>
        <div style={{ width: 40, height: 40, borderRadius: '50%', background: C.greenSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Check size={19} color={C.greenDk} /></div>
        <div style={{ fontSize: 13.5, lineHeight: 1.4, color: C.mute }}><b style={{ color: C.ink }}>You&apos;re all caught up.</b> Nothing needs you right now.</div>
      </div>
    )
  }
  return (
    <div style={{ marginBottom: 14 }}>
      {/* Layered deck: the top card is live; the next one or two peek at the
          bottom. Step through with the "1 of N" controls (or tap a peek). */}
      <div style={{ position: 'relative', paddingBottom: deck.length > 2 ? 13 : deck.length > 1 ? 7 : 0 }}>
        {deck.map((s, pos) => (
          <SuggestionCard
            key={s.id}
            s={s}
            pos={pos}
            isFront={pos === 0}
            onAdvance={() => setStep(Math.min(safeStep + pos, visible.length - 1))}
            onClose={() => closeFront(s)}
            canClose={!s.obligation || safeStep + pos < visible.length - 1}
          />
        ))}
      </div>
      {visible.length > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: deck.length > 2 ? 17 : deck.length > 1 ? 11 : 9, padding: '0 2px' }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>
            <span style={{ color: C.ink }}>{safeStep + 1}</span>
            <span style={{ color: C.faint }}> of {visible.length}</span>
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <StepBtn label="Previous" disabled={safeStep === 0} onClick={() => setStep(Math.max(safeStep - 1, 0))}><ChevronLeft size={17} /></StepBtn>
            <StepBtn label="Next" disabled={safeStep >= visible.length - 1} onClick={() => setStep(Math.min(safeStep + 1, visible.length - 1))}><ChevronRight size={17} /></StepBtn>
          </div>
        </div>
      )}
    </div>
  )
}

function StepBtn({ children, onClick, disabled, label }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; label: string }) {
  const { C } = useMvpTheme()
  return (
    <button onClick={onClick} disabled={disabled} aria-label={label} style={{ width: 32, height: 32, borderRadius: '50%', border: `1px solid ${C.line}`, background: C.card, color: disabled ? C.faint : C.mute, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: disabled ? 'default' : 'pointer', padding: 0, opacity: disabled ? 0.45 : 1, transition: 'opacity .15s' }}>
      {children}
    </button>
  )
}

// Depth styles for the stacked deck: the front card is in flow; the ones
// behind are absolute, nudged down + narrowed so a clean strip peeks below.
function deckDepth(pos: number): React.CSSProperties {
  if (pos === 0) return { position: 'relative', zIndex: 30, opacity: 1 }
  if (pos === 1) return { position: 'absolute', left: 0, right: 0, top: 0, zIndex: 20, transform: 'translateY(6px) scaleX(0.955)', opacity: 1 }
  if (pos === 2) return { position: 'absolute', left: 0, right: 0, top: 0, zIndex: 10, transform: 'translateY(12px) scaleX(0.91)', opacity: 1 }
  return { position: 'absolute', left: 0, right: 0, top: 0, zIndex: 0, transform: 'translateY(18px) scaleX(0.865)', opacity: 0, pointerEvents: 'none' }
}

function SuggestionCard({ s, pos, isFront, onAdvance, onClose, canClose = true }: { s: Suggestion; pos: number; isFront: boolean; onAdvance: () => void; onClose: () => void; canClose?: boolean }) {
  const a = ACCENT[s.accent] ?? ACCENT.amber
  const Icon = SUG_ICON[s.icon] ?? Sparkles
  // The card sits on a bright pastel accent in BOTH skins, so its own text stays
  // dark-on-pastel regardless of theme (a colour chip that pops on the dark home).
  const INK = '#1d1d1f', MUTE = '#6e6e73', FAINT = '#aeaeb2'
  // Cards behind take the deck's full height (= front + peek) so their bottom
  // strip is always empty colored card, never clipped content.
  const style: React.CSSProperties = {
    ...deckDepth(pos),
    height: isFront ? undefined : '100%',
    transformOrigin: 'top center',
    transition: 'transform .32s cubic-bezier(.2,.7,.3,1), opacity .32s',
    background: a.bg, border: `0.5px solid ${a.border}`, borderRadius: 18,
    padding: '12px 15px', boxSizing: 'border-box', overflow: 'hidden',
    textDecoration: 'none', display: 'block', color: 'inherit', cursor: 'pointer',
    boxShadow: pos === 0 ? '0 6px 16px rgba(0,0,0,0.13)' : '0 2px 7px rgba(0,0,0,0.08)',
  }
  return (
    <Link
      href={s.href ?? '#'}
      aria-hidden={!isFront}
      tabIndex={isFront ? 0 : -1}
      className={isFront ? 'mvp-press mvp-breathe' : undefined}
      onClick={(e) => { if (!isFront) { e.preventDefault(); onAdvance() } else if (!s.href) e.preventDefault() }}
      style={style}
    >
      {isFront && canClose && (
        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClose() }} aria-label={s.obligation ? 'Next' : 'Dismiss'} style={{ position: 'absolute', top: 10, right: 10, width: 24, height: 24, borderRadius: 99, border: 'none', background: 'rgba(0,0,0,0.05)', color: FAINT, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0, zIndex: 2 }}><X size={14} /></button>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 9 }}>
        <div style={{ width: 38, height: 38, borderRadius: 11, background: '#fff', border: `0.5px solid ${a.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon size={18} color={a.fg} /></div>
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.07em', color: a.fg }}>{s.eyebrow}</span>
      </div>
      <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 18, lineHeight: 1.22, color: INK, marginBottom: 5, paddingRight: 14, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{s.title}</div>
      <div style={{ fontSize: 12.5, color: MUTE, lineHeight: 1.45, marginBottom: s.cta ? 13 : 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{s.body}</div>
      {s.cta && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: a.fg, color: '#fff', borderRadius: 99, padding: '9px 15px', fontWeight: 700, fontSize: 12.5 }}>{s.cta} <ChevronRight size={14} /></span>
      )}
    </Link>
  )
}

/* Calm empty state for a home section so it still reads as present (and the
   home never collapses) when there's nothing to show yet. Centered, soft,
   with a haloed icon so it feels designed rather than blank. */
function EmptySection({ icon, title, text }: { icon?: React.ReactNode; title?: string; text: string }) {
  const { C } = useMvpTheme()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', background: C.cardSoft, border: `1px dashed ${C.greenLine}`, borderRadius: 18, padding: '22px 20px' }}>
      {icon && (
        <div style={{ width: 46, height: 46, borderRadius: '50%', background: C.card, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12, boxShadow: '0 2px 10px rgba(74,189,152,0.18)' }}>{icon}</div>
      )}
      {title && <div style={{ fontFamily: DISPLAY, fontSize: 15, fontWeight: 600, color: C.ink, marginBottom: 3 }}>{title}</div>}
      <div style={{ fontSize: 12.5, color: C.mute, lineHeight: 1.5, maxWidth: 230 }}>{text}</div>
    </div>
  )
}

export function SourceCard({ s }: { s: { key: string; label: string; value: string; configured: boolean } }) {
  const { C } = useMvpTheme()
  const Icon = TILE_ICON[s.key] ?? MousePointerClick
  const zero = !s.value || s.value === '0' || s.value === '—'
  return (
    <div style={{ background: C.card, border: `0.5px solid ${C.line}`, borderRadius: 13, padding: '7px 4px', textAlign: 'center', minHeight: 52, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, opacity: zero ? 0.5 : 1 }}>
      <Icon size={14} color={C.green} />
      <div style={{ fontFamily: DISPLAY, fontSize: 20, fontWeight: 500, lineHeight: 1, color: C.ink }}>{s.value}</div>
      <div style={{ fontSize: 10, color: C.faint }}>{s.label}</div>
    </div>
  )
}

/* One swipeable metric slide: the hero number + trend, its range chart, and the
   breakdown tiles. Hero and chart share ONE range summary (useChartRange), so the
   range chips move the big number + delta, not just the bars. The delta is honest
   about staleness: when the freshest data is too old for a "this period vs last"
   claim, it shows "Updated <when>" instead of a frozen arrow. */
export function MetricCard({ mv, stage }: { mv: MetricView; stage?: { href: string; label: string } }) {
  const { C } = useMvpTheme()
  const { range, setRange, cStart, setCStart, cEnd, setCEnd, summary } = useChartRange(mv)
  const fresh = isFresh(mv.lastDataDate, summary.periodDays)
  const dn = summary.deltaPct < 0
  const ac = dn ? C.coral : C.green
  const acbg = dn ? C.coralBg : C.greenSoft
  return (
    <div style={{ flex: '0 0 100%', minWidth: 0, scrollSnapAlign: 'center' }}>
      {/* hero */}
      <div>
        <div style={{ fontSize: 15, color: C.mute, fontWeight: 500 }}>{mv.heroLabel}</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 11, marginTop: 2 }}>
          <span style={{ fontFamily: DISPLAY, fontSize: 47, fontWeight: 500, lineHeight: 1, letterSpacing: '-.02em', color: C.ink }}>{summary.total ? summary.total.toLocaleString() : '—'}</span>
          {summary.total > 0 && fresh && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 14, fontWeight: 600, color: ac, background: acbg, padding: '5px 12px', borderRadius: 99, marginBottom: 6 }}>
              <span style={{ fontSize: 11 }}>{dn ? '▼' : '▲'}</span>{Math.abs(summary.deltaPct)}% {summary.cmpFrame}
            </span>
          )}
          {summary.total > 0 && !fresh && mv.lastDataDate && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 600, color: C.mute, background: C.bg, padding: '5px 12px', borderRadius: 99, marginBottom: 6 }}>
              Updated {relDate(mv.lastDataDate)}
            </span>
          )}
        </div>
        <div style={{ fontSize: 14, color: C.faint, marginTop: 5 }}>{mv.heroSub}</div>
        {fresh && summary.yoyPct != null && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 6, fontSize: 12.5, fontWeight: 600, color: summary.yoyPct > 0 ? C.green : summary.yoyPct < 0 ? C.coral : C.mute }}>
            {summary.yoyPct > 0 ? <TrendingUp size={14} /> : summary.yoyPct < 0 ? <TrendingDown size={14} /> : <Minus size={14} />}
            {summary.yoyPct > 0 ? `Up ${summary.yoyPct}% ${summary.yoyLabel}` : summary.yoyPct < 0 ? `Down ${Math.abs(summary.yoyPct)}% ${summary.yoyLabel}` : `Even with last year`}
          </div>
        )}
      </div>
      {/* chart */}
      <ActionsChart range={range} setRange={setRange} cStart={cStart} setCStart={setCStart} cEnd={cEnd} setCEnd={setCEnd} summary={summary} noun={mv.unit} />
      {/* breakdown tiles */}
      {mv.tiles.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(4, mv.tiles.length)},1fr)`, gap: 8, margin: '10px 0 0' }}>
          {mv.tiles.slice(0, 4).map((s) => <SourceCard key={s.key + s.label} s={s} />)}
        </div>
      )}
      {/* deep-link into this metric's matching funnel stage on the Insights page */}
      {stage && (
        <Link href={stage.href} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 14, fontSize: 12.5, fontWeight: 600, color: C.greenDk, textDecoration: 'none' }}>See {stage.label} <ChevronRight size={15} /></Link>
      )}
    </div>
  )
}

/* ActionsChart — faithful port of the design: range chips (Last 7 days /
   Last 30 days / Last year / Custom), grouped bars (current green + comparison
   grey), an average dashed line, tappable bars with a date + comparison
   tooltip, and a legend. Now CONTROLLED: the range + the computed summary come
   from useChartRange (shared with the hero), so switching the range moves the
   headline number and delta, not only the bars. */
export type ChartRange = '7d' | '30d' | '1y' | 'custom'
const CHART_RANGES: [ChartRange, string][] = [['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['1y', 'Last year'], ['custom', 'Custom']]

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

type ChartSrc = { chart: { label: string; value: number; prev: number; settled?: boolean; elapsed?: boolean }[]; chartStart?: string; daily?: { date: string; value: number }[]; monthly?: { label: string; value: number; ym: string }[]; lastDataDate?: string }
// settled = fully reported → counted in the %; elapsed = has happened → counted
// in the total/average. A future/not-yet-reported day is neither (shown, empty).
// ago = the same day a YEAR earlier (52 weeks back), for the seasonal YoY line.
type Bar = { value: number; compare: number; label: string; tip: string; cmpLabel: string; cmpDate: string; settled: boolean; elapsed: boolean; ago: number }
export interface RangeSummary {
  bars: Bar[]; curLbl: string; cmpLbl: string; cmpFrame: string
  total: number; compareTotal: number; deltaPct: number
  avg: number; max: number; periodDays: number
  // Year-over-year for the SELECTED window (this period vs the same period last
  // year). null when the range can't support it (annual view — the pill already
  // is YoY) or there isn't enough data from a year ago.
  yoyPct: number | null; yoyLabel: string
}

/* Bucket the real series for a chosen range — PURE, so the hero and the chart
   read the SAME summary and the headline total + delta track the selected range.
   The '7d' branch reproduces the old fixed hero exactly (current = the last
   complete week, compare = the week before), so the default view is unchanged. */
export function bucketsFor(range: ChartRange, src: ChartSrc, cStart: string, cEnd: string): RangeSummary {
  const { chart, chartStart, daily = [], monthly = [] } = src
  const parseISO = (s: string) => new Date(s + 'T00:00:00')
  const dmap = new Map(daily.map((d) => [d.date, d.value]))
  const start = chartStart ? parseISO(chartStart) : null
  const frontier = src.lastDataDate ? parseISO(src.lastDataDate) : null
  const wk = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short' })
  const full = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  // Same day one year earlier = 52 weeks back, which preserves the weekday
  // (a Saturday compares to a Saturday) — the honest "same period last year".
  const yearAgo = (d: Date) => dmap.get(isoDate(new Date(d.getTime() - 364 * 86_400_000))) ?? 0
  let bars: Bar[] = []; let curLbl = ''; let cmpLbl = ''; let cmpFrame = ''; let periodDays = 7

  if (range === '7d') {
    curLbl = 'Last 7 days'; cmpLbl = 'Last week'; cmpFrame = 'vs last week'; periodDays = 7
    // The last 7 days; the transform already stamped settled/elapsed per day
    // (the still-filling newest day is settled=false). Carry them through so the
    // trend/total honor them.
    bars = chart.map((b, i) => {
      const d = start ? new Date(start.getFullYear(), start.getMonth(), start.getDate() + i) : null
      const prior = d ? new Date(d.getFullYear(), d.getMonth(), d.getDate() - 7) : null
      const elapsed = b.elapsed ?? true
      const settled = b.settled ?? (i < chart.length - 1)
      return { value: b.value, compare: b.prev, label: d ? wk(d) : b.label, tip: d ? full(d) : b.label, cmpLabel: 'last week', cmpDate: prior ? full(prior) : '', settled, elapsed, ago: d ? yearAgo(d) : 0 }
    })
  } else if (range === '30d') {
    curLbl = 'Last 30 days'; cmpLbl = 'Prior 30 days'; cmpFrame = 'vs prior 30 days'; periodDays = 30
    const rows = daily.slice(-30)
    bars = rows.map((d, i) => {
      const dt = parseISO(d.date); const prior = new Date(dt); prior.setDate(prior.getDate() - 30)
      // The `daily` series ends AT the frontier, so only the last row is the
      // still-filling day → not settled; every day has elapsed.
      return { value: d.value, compare: dmap.get(isoDate(prior)) ?? 0, label: String(dt.getDate()), tip: full(dt), cmpLabel: '30 days earlier', cmpDate: full(prior), settled: i < rows.length - 1, elapsed: true, ago: yearAgo(dt) }
    })
  } else if (range === '1y') {
    curLbl = 'Last 12 months'; cmpLbl = 'Prior year'; cmpFrame = 'vs prior year'; periodDays = 365
    // Compare each of the last 12 months to the SAME month a year earlier,
    // looked up by calendar key — so the prior-year (grey) bars line up
    // correctly even with fewer than 24 months of history, and fill in wherever
    // last year's data exists.
    const byKey = new Map(monthly.map((mo) => [mo.ym, mo.value]))
    const last12 = monthly.slice(-12)
    bars = last12.map((mo, i) => {
      const yr = Number(mo.ym.slice(0, 4)); const mi = Number(mo.ym.slice(5, 7))
      const priorKey = `${yr - 1}-${String(mi).padStart(2, '0')}`
      // The last month is the current, still-accruing one → not settled.
      return { value: mo.value, compare: byKey.get(priorKey) ?? 0, label: mo.label.slice(0, 3), tip: `${mo.label} ${yr}`, cmpLabel: 'a year earlier', cmpDate: `${mo.label} ${yr - 1}`, settled: i < last12.length - 1, elapsed: true, ago: byKey.get(priorKey) ?? 0 }
    })
  } else {
    curLbl = 'Custom'; cmpLbl = 'Prior period'; cmpFrame = 'vs prior period'
    const s = parseISO(cStart), e = parseISO(cEnd); const lo = s <= e ? s : e, hi = s <= e ? e : s
    const span = Math.min(92, Math.max(1, Math.round((hi.getTime() - lo.getTime()) / 86400000) + 1))
    periodDays = span
    bars = Array.from({ length: span }, (_, i) => {
      const dt = new Date(lo.getFullYear(), lo.getMonth(), lo.getDate() + i)
      const prior = new Date(dt); prior.setDate(prior.getDate() - span)
      // Date-aware: days past the frontier haven't happened; the frontier day
      // itself is still filling in.
      const elapsed = frontier ? dt.getTime() <= frontier.getTime() : true
      const settled = frontier ? dt.getTime() < frontier.getTime() : i < span - 1
      return { value: dmap.get(isoDate(dt)) ?? 0, compare: dmap.get(isoDate(prior)) ?? 0, label: `${dt.getMonth() + 1}/${dt.getDate()}`, tip: full(dt), cmpLabel: 'prior period', cmpDate: full(prior), settled, elapsed, ago: yearAgo(dt) }
    })
  }

  // total + average count ELAPSED bars (days/months that have happened); the %
  // counts only SETTLED bars (fully reported) — so the still-filling latest
  // period is shown but never tilts the up/down, and future days don't drag the
  // average. max spans all bars so the axis is stable.
  const elapsed = bars.filter((b) => b.elapsed)
  const settled = bars.filter((b) => b.settled)
  const total = elapsed.reduce((s, b) => s + b.value, 0)
  const compareTotal = bars.reduce((s, b) => s + b.compare, 0)
  const curTrend = settled.reduce((s, b) => s + b.value, 0)
  const cmpTrend = settled.reduce((s, b) => s + b.compare, 0)
  const deltaPct = settled.length === 0 ? 0 : (cmpTrend === 0 ? (curTrend > 0 ? 100 : 0) : Math.round(((curTrend - cmpTrend) / cmpTrend) * 100))
  const avg = elapsed.length ? Math.round(total / elapsed.length) : 0
  const max = Math.max(1, ...bars.map((b) => Math.max(b.value, b.compare)), avg)

  // Year-over-year for THIS window: the elapsed days vs the same days a year ago.
  // Hidden for the annual view (the pill is already YoY there) and when a year
  // ago is too sparse to be honest (fewer than 60% of the days had data) — so a
  // newer client never sees a made-up seasonal number.
  const agoTotal = elapsed.reduce((s, b) => s + b.ago, 0)
  const agoCoverage = elapsed.filter((b) => b.ago > 0).length
  let yoyPct: number | null = null
  let yoyLabel = ''
  if (range !== '1y' && agoTotal > 0 && elapsed.length > 0 && agoCoverage >= Math.ceil(elapsed.length * 0.6)) {
    yoyPct = Math.round(((total - agoTotal) / agoTotal) * 100)
    yoyLabel = 'vs last year'
  }
  return { bars, curLbl, cmpLbl, cmpFrame, total, compareTotal, deltaPct, avg, max, periodDays, yoyPct, yoyLabel }
}

/* Shared range state + summary for one metric. The hero and its chart both read
   this, so the range chips move the headline number, not just the bars. */
export function useChartRange(src: ChartSrc): {
  range: ChartRange; setRange: (r: ChartRange) => void
  cStart: string; setCStart: (s: string) => void
  cEnd: string; setCEnd: (s: string) => void
  summary: RangeSummary
} {
  const [range, setRange] = useState<ChartRange>('7d')
  const [cStart, setCStart] = useState(() => { const t = new Date(); return isoDate(new Date(t.getFullYear(), t.getMonth(), t.getDate() - 13)) })
  const [cEnd, setCEnd] = useState(() => isoDate(new Date()))
  const summary = useMemo(() => bucketsFor(range, src, cStart, cEnd), [range, src, cStart, cEnd])
  return { range, setRange, cStart, setCStart, cEnd, setCEnd, summary }
}

/* Freshness gate for the hero delta. Beyond ~a period + grace with no new data,
   a "this period vs last" arrow compares two OLD windows and calls the older one
   "now" — that is the "stuck down" bug. When stale, the hero shows an honest
   "Updated <when>" instead of a frozen direction. The year view tolerates long
   lag (its 12-month trend still reads). */
export function isFresh(lastDataDate: string, periodDays: number): boolean {
  if (!lastDataDate) return false
  const t = Date.parse(lastDataDate + 'T00:00:00'); if (Number.isNaN(t)) return false
  const staleDays = Math.floor((Date.now() - t) / 86400000)
  return staleDays <= Math.max(9, periodDays + 3)
}
export function relDate(lastDataDate: string): string {
  const t = Date.parse(lastDataDate + 'T00:00:00'); if (Number.isNaN(t)) return ''
  const days = Math.floor((Date.now() - t) / 86400000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function ActionsChart({
  range, setRange, cStart, setCStart, cEnd, setCEnd, summary, noun = 'took action',
}: {
  range: ChartRange; setRange: (r: ChartRange) => void
  cStart: string; setCStart: (s: string) => void
  cEnd: string; setCEnd: (s: string) => void
  summary: RangeSummary
  noun?: string
}) {
  const { C } = useMvpTheme()
  const H = 62
  const [picked, setPicked] = useState<number | null>(null)
  const { bars, curLbl, cmpLbl, total, avg, max } = summary
  const avgY = (avg / max) * H
  const dense = bars.length > 8
  const dateInput: React.CSSProperties = { border: `1px solid ${C.line}`, borderRadius: 8, padding: '5px 8px', fontSize: 12.5, color: C.ink, fontFamily: 'inherit', background: C.card }

  return (
    <div style={{ margin: '8px 0 0' }}>
      <div style={{ display: 'flex', gap: 7, marginBottom: 12, overflowX: 'auto', paddingBottom: 2 }}>
        {CHART_RANGES.map(([k, l]) => {
          const on = range === k
          return (
            <button key={k} onClick={() => { setRange(k); setPicked(null) }} style={{ flexShrink: 0, whiteSpace: 'nowrap', border: `1px solid ${on ? C.green : C.line}`, background: on ? C.greenSoft : C.card, color: on ? C.greenDk : C.mute, borderRadius: 999, padding: '6px 13px', fontSize: 12.5, fontWeight: on ? 700 : 500, cursor: 'pointer' }}>{l}</button>
          )
        })}
      </div>
      {range === 'custom' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 11.5, color: C.mute, display: 'flex', alignItems: 'center', gap: 6 }}>From<input type="date" value={cStart} max={cEnd} onChange={(e) => { setCStart(e.target.value); setPicked(null) }} style={dateInput} /></label>
          <label style={{ fontSize: 11.5, color: C.mute, display: 'flex', alignItems: 'center', gap: 6 }}>To<input type="date" value={cEnd} min={cStart} onChange={(e) => { setCEnd(e.target.value); setPicked(null) }} style={dateInput} /></label>
        </div>
      )}
      <div style={{ fontSize: 11.5, color: C.faint, marginBottom: 8 }}>
        <b style={{ color: C.ink, fontWeight: 700 }}>{total.toLocaleString()}</b> {noun}
      </div>
      <div style={{ position: 'relative', height: H }}>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: avgY, borderTop: `1px dashed ${C.faint}`, opacity: 0.6 }} />
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: dense ? 3 : 10, height: '100%' }}>
          {bars.map((b, i) => {
            const isPicked = picked === i
            const edge = i < 2 ? 'left' : i > bars.length - 3 ? 'right' : 'mid'
            return (
              <div key={i} onClick={() => setPicked(isPicked ? null : i)} style={{ flex: 1, height: '100%', position: 'relative', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: dense ? 1.5 : 3, cursor: 'pointer' }}>
                <div className="mvp-grow" style={{ width: '42%', maxWidth: 17, height: `${(b.value / max) * 100}%`, minHeight: b.value > 0 ? 2 : 0, background: isPicked ? C.greenDk : C.green, borderRadius: '3px 3px 0 0', boxShadow: b.value > 0 ? '0 1px 7px rgba(74,189,152,0.45)' : 'none', animationDelay: `${20 + i * 14}ms` }} />
                <div style={{ width: '42%', maxWidth: 17, height: `${(b.compare / max) * 100}%`, background: C.ghost, borderRadius: '3px 3px 0 0' }} />
                {isPicked && (() => {
                  const delta = b.value - b.compare
                  const dpct = b.compare ? Math.round((delta / b.compare) * 100) : null
                  const dCol = delta > 0 ? '#6fe3bf' : delta < 0 ? '#ef9a9a' : 'rgba(255,255,255,.6)'
                  return (
                    <div style={{ position: 'absolute', bottom: '100%', marginBottom: 6, ...(edge === 'mid' ? { left: '50%', transform: 'translateX(-50%)' } : edge === 'left' ? { left: 0 } : { right: 0 }), background: '#12211b', color: '#fff', borderRadius: 8, padding: '8px 11px', fontSize: 11, whiteSpace: 'nowrap', zIndex: 5, lineHeight: 1.45, textAlign: 'left' }}>
                      <div style={{ fontWeight: 700 }}>{b.tip}</div>
                      <div style={{ opacity: 0.9 }}>{b.value.toLocaleString()} {noun}</div>
                      <div style={{ borderTop: '1px solid rgba(255,255,255,.22)', marginTop: 6, paddingTop: 6 }}>
                        <div style={{ opacity: 0.6, fontSize: 10 }}>vs {b.cmpLabel}{b.cmpDate ? ` · ${b.cmpDate}` : ''}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 1 }}>
                          <span style={{ opacity: 0.9 }}>{b.compare.toLocaleString()} {noun}</span>
                          {dpct != null && <span style={{ color: dCol, fontWeight: 700 }}>{delta > 0 ? '▲' : delta < 0 ? '▼' : ''}{Math.abs(dpct)}%</span>}
                        </div>
                      </div>
                    </div>
                  )
                })()}
              </div>
            )
          })}
        </div>
      </div>
      <div style={{ display: 'flex', gap: dense ? 3 : 10, marginTop: 5 }}>
        {bars.map((b, i) => {
          const show = !dense || i === 0 || i === bars.length - 1 || i % Math.max(1, Math.ceil(bars.length / 6)) === 0
          return <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: dense ? 9 : 10.5, color: C.faint, whiteSpace: 'nowrap' }}>{show ? b.label : ''}</div>
        })}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 9, fontSize: 11, flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: C.mute }}><span style={{ width: 9, height: 9, borderRadius: 3, background: C.green }} /> {curLbl}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: C.faint }}><span style={{ width: 9, height: 9, borderRadius: 3, background: C.ghost }} /> {cmpLbl}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: C.faint }}><span style={{ width: 11, borderTop: `1px dashed ${C.faint}`, display: 'inline-block' }} /> Avg {avg}</span>
      </div>
    </div>
  )
}
