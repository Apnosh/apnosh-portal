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
  Bell, Sparkles, Check, Plus, TrendingUp, TrendingDown,
  ChevronRight, Receipt, X, Navigation, Phone, MousePointerClick, CalendarDays,
  Heart, Star, MessageCircle, Mail, Eye, Users,
} from 'lucide-react'
import { useState, useRef } from 'react'

/* Theme tokens lifted from the design's `C` palette. */
const C = {
  green: '#4abd98', greenDk: '#2e9a78', greenSoft: '#eaf7f3', greenLine: 'rgba(74,189,152,0.32)',
  ink: '#1d1d1f', mute: '#6e6e73', faint: '#aeaeb2', line: '#e6e6ea', ghost: '#e6e6ea',
  amber: '#8a5a0c', amberBtn: '#bd7e16', amberBg: '#fbf3e4', amberLine: '#eed9b3',
  coral: '#a85c3c', coralBg: '#f8efe9', bg: '#f5f5f7',
}
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
  chart: { label: string; value: number; prev: number }[]
  chartStart?: string
  daily: { date: string; value: number }[]
  monthly: { label: string; value: number }[]
  tiles: { key: string; label: string; value: string; configured: boolean }[]
}

export interface MvpHomeData {
  greeting: string
  avatarText: string
  avatarEmoji?: string
  avatarImage?: string
  metrics: MetricView[]
  signal: { state: 'recommendation' | 'ontrack'; metric?: string; message?: string }
  approvals: { id: string; tag: string; timing: string; title: string; subtitle: string; emoji?: string; image?: string }[]
  review: { prevMonthLabel: string; cycleLabel: string; budget: number } | null
}

// Breakdown-tile icons keyed by the icon name get-home-metrics emits.
const TILE_ICON: Record<string, React.ComponentType<{ size?: number; color?: string }>> = {
  pin: Navigation, phone: Phone, cursor: MousePointerClick, heart: Heart, star: Star,
  message: MessageCircle, mail: Mail, calendar: CalendarDays, eye: Eye, users: Users,
}

export default function MvpHome({ data, showHeader = true }: { data: MvpHomeData; showHeader?: boolean }) {
  const metrics = data.metrics ?? []
  const [reviewHidden, setReviewHidden] = useState(false)
  const [actionDone, setActionDone] = useState(data.signal.state !== 'recommendation')
  const scrollRef = useRef<HTMLDivElement>(null)
  const [activeIdx, setActiveIdx] = useState(0)
  const onScroll = () => {
    const el = scrollRef.current; if (!el) return
    const idx = Math.round(el.scrollLeft / Math.max(1, el.clientWidth))
    setActiveIdx((p) => (p === idx ? p : idx))
  }
  const goTo = (i: number) => { const el = scrollRef.current; if (el) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' }) }

  return (
    <div style={{ fontFamily: "'Inter',system-ui,sans-serif", color: C.ink, background: '#fff', minHeight: '100%', overflowY: 'auto', paddingBottom: 28 }}>
      <style>{MVP_ANIM_CSS}</style>
      {/* sticky greeting bar — suppressed when embedded under the portal's
          own top bar (the design's full chrome lands in the nav-shell step). */}
      {showHeader && (
      <div style={{ position: 'sticky', top: 0, zIndex: 20, background: '#fff', padding: '14px 18px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${C.line}` }}>
        <div style={{ fontSize: 15, color: C.mute }}>{data.greeting}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ position: 'relative' }}><Bell size={20} color={C.ink} /><div style={{ position: 'absolute', top: -1, right: -1, width: 7, height: 7, borderRadius: 4, background: C.green }} /></div>
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

        {/* SWIPEABLE METRIC CARDS — swipe left/right to change which graph
            you're looking at; dots show where you are. No tabs. */}
        <div ref={scrollRef} onScroll={onScroll} className="mvp-swipe" style={{ display: 'flex', overflowX: 'auto', scrollSnapType: 'x mandatory' }}>
          {metrics.map((mv) => {
            const dn = mv.weekPct < 0
            const ac = dn ? C.coral : C.green
            const acbg = dn ? C.coralBg : C.greenSoft
            return (
              <div key={mv.key} style={{ flex: '0 0 100%', minWidth: 0, scrollSnapAlign: 'center' }}>
                {/* hero */}
                <div>
                  <div style={{ fontSize: 15, color: C.mute, fontWeight: 500 }}>{mv.heroLabel}</div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 11, marginTop: 2 }}>
                    <span style={{ fontFamily: DISPLAY, fontSize: 47, fontWeight: 500, lineHeight: 1, letterSpacing: '-.02em', color: C.ink }}>{mv.total ? mv.total.toLocaleString() : '—'}</span>
                    {mv.total > 0 && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 14, fontWeight: 600, color: ac, background: acbg, padding: '5px 12px', borderRadius: 99, marginBottom: 6 }}>
                        <span style={{ fontSize: 11 }}>{dn ? '▼' : '▲'}</span>{Math.abs(mv.weekPct)}% this week
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 14, color: C.faint, marginTop: 5 }}>{mv.heroSub}</div>
                  {mv.monthPct !== 0 && (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 6, fontSize: 12.5, fontWeight: 600, color: mv.monthPct > 0 ? C.green : C.coral }}>
                      {mv.monthPct > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                      {mv.monthPct > 0 ? 'Up' : 'Down'} {Math.abs(mv.monthPct)}% from {mv.prevMonthLabel}
                    </div>
                  )}
                </div>
                {/* chart */}
                <ActionsChart chart={mv.chart} chartStart={mv.chartStart} daily={mv.daily} monthly={mv.monthly} noun={mv.unit} />
                {/* breakdown tiles */}
                {mv.tiles.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(4, mv.tiles.length)},1fr)`, gap: 8, margin: '10px 0 0' }}>
                    {mv.tiles.slice(0, 4).map((s) => <SourceCard key={s.key + s.label} s={s} />)}
                  </div>
                )}
              </div>
            )
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
        <a href="/dashboard/insights" style={{ display: 'block', textAlign: 'center', marginTop: 12, marginBottom: 2, fontSize: 12.5, fontWeight: 600, color: C.greenDk, textDecoration: 'none' }}>
          See all insights · full year →
        </a>

        {/* DO THIS NEXT */}
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: C.amber, marginBottom: 11 }}>Do this next</div>
        {!actionDone && data.signal.state === 'recommendation' ? (
          <div style={{ background: C.amberBg, border: `0.5px solid ${C.amberLine}`, borderRadius: 18, padding: 16, marginBottom: 24 }}>
            <div style={{ display: 'flex', gap: 13, marginBottom: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#fff', border: `0.5px solid ${C.amberLine}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Sparkles size={19} color={C.amberBtn} /></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 19, lineHeight: 1.2, color: C.ink, marginBottom: 6 }}>Your {data.signal.metric} slipped this week</div>
                <div style={{ fontSize: 13, color: C.mute, lineHeight: 1.5 }}>{data.signal.message}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button style={{ flex: 1, background: C.amberBtn, color: '#fff', border: 'none', borderRadius: 12, padding: '12px 16px', fontWeight: 600, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}><Plus size={16} />Request a post</button>
              <button onClick={() => setActionDone(true)} style={{ background: 'transparent', color: C.amber, border: 'none', borderRadius: 12, padding: '12px 18px', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>Not now</button>
            </div>
          </div>
        ) : (
          <div style={{ background: C.amberBg, border: `0.5px solid ${C.amberLine}`, borderRadius: 18, padding: 16, marginBottom: 24, display: 'flex', gap: 13, alignItems: 'center' }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#fff', border: `0.5px solid ${C.amberLine}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Check size={19} color={C.amberBtn} /></div>
            <div style={{ fontSize: 13.5, lineHeight: 1.4, color: C.mute }}><b style={{ color: C.ink }}>You&apos;re on track.</b> Nothing else needs you right now.</div>
          </div>
        )}

        {/* NEEDS YOUR APPROVAL */}
        {data.approvals.length > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: C.mute }}>Needs your approval</span>
              <span style={{ width: 18, height: 18, borderRadius: 99, background: C.ink, color: '#fff', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{data.approvals.length}</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: C.faint }}>only you can do this</span>
            </div>
            <div style={{ marginBottom: 10 }}>
              {data.approvals.map((a) => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 14, padding: 12, marginBottom: 8 }}>
                  <Thumb emoji={a.emoji} image={a.image} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.06em', color: C.faint, marginBottom: 2 }}>{a.tag} <span style={{ fontWeight: 600 }}>· {a.timing}</span></div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.title}</div>
                    <div style={{ fontSize: 11, color: C.faint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.subtitle}</div>
                  </div>
                  <button style={{ background: '#fff', color: C.ink, border: `0.5px solid ${C.line}`, borderRadius: 99, padding: '9px 18px', fontWeight: 600, fontSize: 13, cursor: 'pointer', flexShrink: 0 }}>Review</button>
                </div>
              ))}
            </div>
          </>
        )}

      </div>
    </div>
  )
}

/* Thumb — ported from the design: a rounded preview that shows an emoji
   fallback with the real image layered on top (hidden if it fails to load). */
function Thumb({ emoji, image }: { emoji?: string; image?: string }) {
  return (
    <div style={{ width: 42, height: 42, borderRadius: 10, background: '#f5f4f1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 21, position: 'relative', overflow: 'hidden' }}>
      {emoji || '📄'}
      {image && <img src={image} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
    </div>
  )
}

function SourceCard({ s }: { s: { key: string; label: string; value: string; configured: boolean } }) {
  const Icon = TILE_ICON[s.key] ?? MousePointerClick
  const zero = !s.value || s.value === '0' || s.value === '—'
  return (
    <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 13, padding: '7px 4px', textAlign: 'center', minHeight: 52, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, opacity: zero ? 0.5 : 1 }}>
      <Icon size={14} color={C.green} />
      <div style={{ fontFamily: DISPLAY, fontSize: 20, fontWeight: 500, lineHeight: 1, color: C.ink }}>{s.value}</div>
      <div style={{ fontSize: 10, color: C.faint }}>{s.label}</div>
    </div>
  )
}

/* ActionsChart — faithful port of the design: range chips (Last 7 days /
   Last 30 days / Last year / Custom), grouped bars (current green + comparison
   grey), an average dashed line, tappable bars with a date + comparison
   tooltip, and a legend. Wired to the real daily + monthly series. */
type ChartRange = '7d' | '30d' | '1y' | 'custom'
const RANGES: [ChartRange, string][] = [['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['1y', 'Last year'], ['custom', 'Custom']]

function ActionsChart({
  chart, chartStart, daily = [], monthly = [], noun = 'took action',
}: {
  chart: { label: string; value: number; prev: number }[]
  chartStart?: string
  daily?: { date: string; value: number }[]
  monthly?: { label: string; value: number }[]
  noun?: string
}) {
  const H = 62
  const [range, setRange] = useState<ChartRange>('7d')
  const [picked, setPicked] = useState<number | null>(null)
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const parseISO = (s: string) => new Date(s + 'T00:00:00')
  const today = new Date()
  const [cStart, setCStart] = useState(() => iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 13)))
  const [cEnd, setCEnd] = useState(() => iso(today))
  const dmap = new Map(daily.map((d) => [d.date, d.value]))
  const start = chartStart ? parseISO(chartStart) : null

  type Bar = { value: number; compare: number; label: string; tip: string; cmpLabel: string; cmpDate: string }
  let bars: Bar[] = []; let curLbl = ''; let cmpLbl = ''
  const wk = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short' })
  const full = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

  if (range === '7d') {
    curLbl = 'Last 7 days'; cmpLbl = 'Last week'
    bars = chart.map((b, i) => {
      const d = start ? new Date(start.getFullYear(), start.getMonth(), start.getDate() + i) : null
      const prior = d ? new Date(d.getFullYear(), d.getMonth(), d.getDate() - 7) : null
      return { value: b.value, compare: b.prev, label: d ? wk(d) : b.label, tip: d ? full(d) : b.label, cmpLabel: 'last week', cmpDate: prior ? full(prior) : '' }
    })
  } else if (range === '30d') {
    curLbl = 'Last 30 days'; cmpLbl = 'Prior 30 days'
    bars = daily.slice(-30).map((d) => {
      const dt = parseISO(d.date); const prior = new Date(dt); prior.setDate(prior.getDate() - 30)
      return { value: d.value, compare: dmap.get(iso(prior)) ?? 0, label: String(dt.getDate()), tip: full(dt), cmpLabel: '30 days earlier', cmpDate: full(prior) }
    })
  } else if (range === '1y') {
    curLbl = 'Last 12 months'; cmpLbl = 'Prior year'
    const last12 = monthly.slice(-12); const prior12 = monthly.slice(-24, -12)
    bars = last12.map((m, i) => ({ value: m.value, compare: prior12[i]?.value ?? 0, label: m.label.slice(0, 3), tip: m.label, cmpLabel: 'a year earlier', cmpDate: '' }))
  } else {
    curLbl = 'Custom'; cmpLbl = 'Prior period'
    const s = parseISO(cStart), e = parseISO(cEnd); const lo = s <= e ? s : e, hi = s <= e ? e : s
    const span = Math.min(92, Math.max(1, Math.round((hi.getTime() - lo.getTime()) / 86400000) + 1))
    bars = Array.from({ length: span }, (_, i) => {
      const dt = new Date(lo.getFullYear(), lo.getMonth(), lo.getDate() + i)
      const prior = new Date(dt); prior.setDate(prior.getDate() - span)
      return { value: dmap.get(iso(dt)) ?? 0, compare: dmap.get(iso(prior)) ?? 0, label: `${dt.getMonth() + 1}/${dt.getDate()}`, tip: full(dt), cmpLabel: 'prior period', cmpDate: full(prior) }
    })
  }

  const total = bars.reduce((s, b) => s + b.value, 0)
  const avg = bars.length ? Math.round(total / bars.length) : 0
  const max = Math.max(1, ...bars.map((b) => Math.max(b.value, b.compare)), avg)
  const avgY = (avg / max) * H
  const dense = bars.length > 8
  const dateInput: React.CSSProperties = { border: `1px solid ${C.line}`, borderRadius: 8, padding: '5px 8px', fontSize: 12.5, color: C.ink, fontFamily: 'inherit', background: '#fff' }

  return (
    <div style={{ margin: '8px 0 0' }}>
      <div style={{ display: 'flex', gap: 7, marginBottom: 12, overflowX: 'auto', paddingBottom: 2 }}>
        {RANGES.map(([k, l]) => {
          const on = range === k
          return (
            <button key={k} onClick={() => { setRange(k); setPicked(null) }} style={{ flexShrink: 0, whiteSpace: 'nowrap', border: `1px solid ${on ? C.green : C.line}`, background: on ? C.greenSoft : '#fff', color: on ? C.greenDk : C.mute, borderRadius: 999, padding: '6px 13px', fontSize: 12.5, fontWeight: on ? 700 : 500, cursor: 'pointer' }}>{l}</button>
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
                <div style={{ width: '42%', maxWidth: 17, height: `${(b.value / max) * 100}%`, minHeight: b.value > 0 ? 2 : 0, background: isPicked ? C.greenDk : C.green, borderRadius: '3px 3px 0 0' }} />
                <div style={{ width: '42%', maxWidth: 17, height: `${(b.compare / max) * 100}%`, background: C.ghost, borderRadius: '3px 3px 0 0' }} />
                {isPicked && (() => {
                  const delta = b.value - b.compare
                  const dpct = b.compare ? Math.round((delta / b.compare) * 100) : null
                  const dCol = delta > 0 ? '#6fe3bf' : delta < 0 ? '#ef9a9a' : 'rgba(255,255,255,.6)'
                  return (
                    <div style={{ position: 'absolute', bottom: '100%', marginBottom: 6, ...(edge === 'mid' ? { left: '50%', transform: 'translateX(-50%)' } : edge === 'left' ? { left: 0 } : { right: 0 }), background: C.ink, color: '#fff', borderRadius: 8, padding: '8px 11px', fontSize: 11, whiteSpace: 'nowrap', zIndex: 5, lineHeight: 1.45, textAlign: 'left' }}>
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
