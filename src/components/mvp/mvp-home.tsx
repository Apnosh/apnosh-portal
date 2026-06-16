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
  Bell, Sparkles, Check, Plus, ClipboardList, TrendingUp, TrendingDown,
  ChevronRight, Receipt, X, Navigation, Phone, MousePointerClick, CalendarDays,
} from 'lucide-react'
import { useState } from 'react'

/* Theme tokens lifted from the design's `C` palette. */
const C = {
  green: '#4abd98', greenDk: '#2e9a78', greenSoft: '#eaf7f3', greenLine: 'rgba(74,189,152,0.32)',
  ink: '#1d1d1f', mute: '#6e6e73', faint: '#aeaeb2', line: '#e6e6ea', ghost: '#e6e6ea',
  amber: '#8a5a0c', amberBtn: '#bd7e16', amberBg: '#fbf3e4', amberLine: '#eed9b3',
  coral: '#a85c3c', coralBg: '#f8efe9', bg: '#f5f5f7',
}
const DISPLAY = "'Cal Sans','Inter',sans-serif"

export interface MvpHomeData {
  greeting: string
  avatarText: string
  hero: { total: number; weekPct: number; down: boolean; monthPct: number; prevMonthLabel: string }
  chart: { label: string; value: number; prev: number }[]
  chartStart?: string
  sources: { key: string; label: string; value: string; configured: boolean }[]
  signal: { state: 'recommendation' | 'ontrack'; metric?: string; message?: string }
  approvals: { id: string; tag: string; timing: string; title: string; subtitle: string }[]
  review: { prevMonthLabel: string; cycleLabel: string; budget: number } | null
}

const SRC_ICON: Record<string, React.ComponentType<{ size?: number; color?: string }>> = {
  directions: Navigation, calls: Phone, clicks: MousePointerClick, bookings: CalendarDays,
}

export default function MvpHome({ data, showHeader = true }: { data: MvpHomeData; showHeader?: boolean }) {
  const { hero } = data
  const [reviewHidden, setReviewHidden] = useState(false)
  const [actionDone, setActionDone] = useState(data.signal.state !== 'recommendation')
  const [picked, setPicked] = useState<number | null>(null)
  const accent = hero.down ? C.coral : C.green
  const accentBg = hero.down ? C.coralBg : C.greenSoft

  return (
    <div style={{ fontFamily: "'Inter',system-ui,sans-serif", color: C.ink, background: '#fff', minHeight: '100%', overflowY: 'auto', paddingBottom: 28 }}>
      {/* sticky greeting bar — suppressed when embedded under the portal's
          own top bar (the design's full chrome lands in the nav-shell step). */}
      {showHeader && (
      <div style={{ position: 'sticky', top: 0, zIndex: 20, background: '#fff', padding: '14px 18px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${C.line}` }}>
        <div style={{ fontSize: 15, color: C.mute }}>{data.greeting}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ position: 'relative' }}><Bell size={20} color={C.ink} /><div style={{ position: 'absolute', top: -1, right: -1, width: 7, height: 7, borderRadius: 4, background: C.green }} /></div>
          <div style={{ width: 34, height: 34, borderRadius: '50%', background: C.greenSoft, border: `1px solid ${C.greenLine}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 600 }}>{data.avatarText}</div>
        </div>
      </div>
      )}

      <div style={{ padding: '16px 18px 0' }}>
        {/* monthly review nudge */}
        {data.review && !reviewHidden && (
          <div style={{ position: 'relative', overflow: 'hidden', marginBottom: 12, borderRadius: 18, padding: '13px 16px', color: '#fff', background: 'linear-gradient(135deg,#54c6a2 0%,#2e9a78 100%)' }}>
            <div style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', gap: 11 }}>
              <div style={{ width: 38, height: 38, borderRadius: 11, background: 'rgba(255,255,255,.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Receipt size={19} /></div>
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

        {/* HERO */}
        <div>
          <div style={{ fontSize: 15, color: C.mute, fontWeight: 500 }}>Customers who took action</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 11, marginTop: 2 }}>
            <span style={{ fontFamily: DISPLAY, fontSize: 47, fontWeight: 500, lineHeight: 1, letterSpacing: '-.02em', color: C.ink }}>{hero.total || '—'}</span>
            {hero.total > 0 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 14, fontWeight: 600, color: accent, background: accentBg, padding: '5px 12px', borderRadius: 99, marginBottom: 6 }}>
                <span style={{ fontSize: 11 }}>{hero.down ? '▼' : '▲'}</span>{Math.abs(hero.weekPct)}% this week
              </span>
            )}
          </div>
          <div style={{ fontSize: 14, color: C.faint, marginTop: 5 }}>called, got directions, or visited your site</div>
          {hero.monthPct !== 0 && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 6, fontSize: 12.5, fontWeight: 600, color: hero.monthPct > 0 ? C.green : C.coral }}>
              {hero.monthPct > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              {hero.monthPct > 0 ? 'Up' : 'Down'} {Math.abs(hero.monthPct)}% from {hero.prevMonthLabel}
            </div>
          )}
        </div>

        {/* CHART */}
        <ActionsChart chart={data.chart} chartStart={data.chartStart} picked={picked} setPicked={setPicked} />

        {/* SOURCES */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, margin: '10px 0' }}>
          {data.sources.map((s) => <SourceCard key={s.key} s={s} />)}
        </div>

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
                  <div style={{ width: 42, height: 42, borderRadius: 10, background: C.greenSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><ClipboardList size={20} color={C.greenDk} /></div>
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

        <button style={{ width: '100%', marginTop: 6, background: '#fff', color: C.ink, border: `0.5px solid ${C.line}`, borderRadius: 13, padding: 13, fontWeight: 600, fontSize: 13.5, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <TrendingUp size={15} color={C.green} /> See all insights <span style={{ color: C.faint, fontWeight: 500 }}>· full year</span>
        </button>
      </div>
    </div>
  )
}

function SourceCard({ s }: { s: { key: string; label: string; value: string; configured: boolean } }) {
  const Icon = SRC_ICON[s.key] ?? MousePointerClick
  const zero = !s.value || s.value === '0' || s.value === '—'
  return (
    <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 13, padding: '7px 4px', textAlign: 'center', minHeight: 52, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, opacity: zero ? 0.5 : 1 }}>
      <Icon size={14} color={C.green} />
      <div style={{ fontFamily: DISPLAY, fontSize: 20, fontWeight: 500, lineHeight: 1, color: C.ink }}>{s.value}</div>
      <div style={{ fontSize: 10, color: C.faint }}>{s.label}</div>
    </div>
  )
}

/* ActionsChart — ported from the design: grouped bars (this week green +
   last week grey), an average dashed line, tappable bars with a date +
   comparison tooltip, and a legend. Bars are always green (the down-week
   coral accent applies only to the hero pill, as in the design). */
function ActionsChart({
  chart, chartStart, picked, setPicked,
}: {
  chart: { label: string; value: number; prev: number }[]
  chartStart?: string
  picked: number | null
  setPicked: (i: number | null) => void
}) {
  const H = 62
  const total = chart.reduce((s, b) => s + b.value, 0)
  const avg = chart.length ? Math.round(total / chart.length) : 0
  const max = Math.max(1, ...chart.map((b) => Math.max(b.value, b.prev)), avg)
  const avgY = (avg / max) * H
  const start = chartStart ? new Date(chartStart + 'T00:00:00') : null
  const dateAt = (i: number) => start ? new Date(start.getFullYear(), start.getMonth(), start.getDate() + i) : null
  const fmtFull = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

  return (
    <div style={{ margin: '8px 0 0' }}>
      <div style={{ fontSize: 11.5, color: C.faint, marginBottom: 8 }}>
        <b style={{ color: C.ink, fontWeight: 700 }}>{total.toLocaleString()}</b> took action
      </div>
      <div style={{ position: 'relative', height: H }}>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: avgY, borderTop: `1px dashed ${C.faint}`, opacity: 0.6 }} />
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: '100%' }}>
          {chart.map((b, i) => {
            const isPicked = picked === i
            const edge = i < 2 ? 'left' : i > chart.length - 3 ? 'right' : 'mid'
            const d = dateAt(i)
            return (
              <div key={i} onClick={() => setPicked(isPicked ? null : i)} style={{ flex: 1, height: '100%', position: 'relative', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 3, cursor: 'pointer' }}>
                <div style={{ width: '42%', maxWidth: 17, height: `${(b.value / max) * 100}%`, minHeight: b.value > 0 ? 2 : 0, background: isPicked ? C.greenDk : C.green, borderRadius: '3px 3px 0 0' }} />
                <div style={{ width: '42%', maxWidth: 17, height: `${(b.prev / max) * 100}%`, background: C.ghost, borderRadius: '3px 3px 0 0' }} />
                {isPicked && (
                  <div style={{ position: 'absolute', bottom: '100%', marginBottom: 6, ...(edge === 'mid' ? { left: '50%', transform: 'translateX(-50%)' } : edge === 'left' ? { left: 0 } : { right: 0 }), background: C.ink, color: '#fff', borderRadius: 8, padding: '7px 10px', fontSize: 11, whiteSpace: 'nowrap', zIndex: 5, lineHeight: 1.4, textAlign: 'left' }}>
                    <div style={{ fontWeight: 700 }}>{d ? fmtFull(d) : b.label}</div>
                    <div style={{ opacity: 0.85 }}>{b.value.toLocaleString()} took action</div>
                    <div style={{ borderTop: '1px solid rgba(255,255,255,.22)', marginTop: 5, paddingTop: 5, opacity: 0.7 }}>
                      <div>{b.prev.toLocaleString()} last week</div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 5 }}>
        {chart.map((b, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 10.5, color: C.faint }}>{b.label}</div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 9, fontSize: 11, flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: C.mute }}><span style={{ width: 9, height: 9, borderRadius: 3, background: C.green }} /> This week</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: C.faint }}><span style={{ width: 9, height: 9, borderRadius: 3, background: C.ghost }} /> Last week</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: C.faint }}><span style={{ width: 11, borderTop: `1px dashed ${C.faint}`, display: 'inline-block' }} /> Avg {avg}</span>
      </div>
    </div>
  )
}
