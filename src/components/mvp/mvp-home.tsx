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
  ink: '#1d1d1f', mute: '#6e6e73', faint: '#aeaeb2', line: '#e6e6ea',
  amber: '#8a5a0c', amberBtn: '#bd7e16', amberBg: '#fbf3e4', amberLine: '#eed9b3',
  coral: '#a85c3c', coralBg: '#f8efe9', bg: '#f5f5f7',
}
const DISPLAY = "'Cal Sans','Inter',sans-serif"

export interface MvpHomeData {
  greeting: string
  avatarText: string
  hero: { total: number; weekPct: number; down: boolean; monthPct: number; prevMonthLabel: string }
  chart: { label: string; value: number; prev: number }[]
  sources: { key: string; label: string; value: string; configured: boolean }[]
  signal: { state: 'recommendation' | 'ontrack'; metric?: string; message?: string }
  approvals: { id: string; tag: string; timing: string; title: string; subtitle: string }[]
  review: { prevMonthLabel: string; cycleLabel: string; budget: number } | null
}

const SRC_ICON: Record<string, React.ComponentType<{ size?: number; color?: string }>> = {
  directions: Navigation, calls: Phone, clicks: MousePointerClick, bookings: CalendarDays,
}

export default function MvpHome({ data }: { data: MvpHomeData }) {
  const { hero } = data
  const [reviewHidden, setReviewHidden] = useState(false)
  const [actionDone, setActionDone] = useState(data.signal.state !== 'recommendation')
  const accent = hero.down ? C.coral : C.green
  const accentBg = hero.down ? C.coralBg : C.greenSoft

  return (
    <div style={{ fontFamily: "'Inter',system-ui,sans-serif", color: C.ink, background: '#fff', minHeight: '100%', overflowY: 'auto', paddingBottom: 28 }}>
      {/* sticky greeting bar */}
      <div style={{ position: 'sticky', top: 0, zIndex: 20, background: '#fff', padding: '14px 18px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${C.line}` }}>
        <div style={{ fontSize: 15, color: C.mute }}>{data.greeting}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ position: 'relative' }}><Bell size={20} color={C.ink} /><div style={{ position: 'absolute', top: -1, right: -1, width: 7, height: 7, borderRadius: 4, background: C.green }} /></div>
          <div style={{ width: 34, height: 34, borderRadius: '50%', background: C.greenSoft, border: `1px solid ${C.greenLine}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 600 }}>{data.avatarText}</div>
        </div>
      </div>

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
        <Bars chart={data.chart} accent={accent} />

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
  if (!s.configured) {
    return (
      <div style={{ background: '#fff', border: `0.5px dashed ${C.line}`, borderRadius: 13, padding: '11px 9px', textAlign: 'center', opacity: 0.7 }}>
        <Icon size={15} color={C.faint} />
        <div style={{ fontSize: 11, fontWeight: 600, color: C.faint, marginTop: 4 }}>Set up</div>
        <div style={{ fontSize: 10, color: C.faint, marginTop: 1 }}>{s.label}</div>
      </div>
    )
  }
  return (
    <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 13, padding: '11px 9px', textAlign: 'center' }}>
      <Icon size={15} color={C.green} />
      <div style={{ fontFamily: DISPLAY, fontSize: 18, fontWeight: 500, color: C.ink, marginTop: 4 }}>{s.value}</div>
      <div style={{ fontSize: 10, color: C.mute, marginTop: 1 }}>{s.label}</div>
    </div>
  )
}

/* Bar chart — this week (solid) over last week (ghost), faithful to the
   design's ActionsChart without its interactive picker. */
function Bars({ chart, accent }: { chart: { label: string; value: number; prev: number }[]; accent: string }) {
  const max = Math.max(1, ...chart.map((d) => Math.max(d.value, d.prev)))
  return (
    <div style={{ marginTop: 16, background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, padding: '16px 14px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 110 }}>
        {chart.map((d, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', position: 'relative' }}>
            <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
              {/* ghost prev week */}
              <div style={{ position: 'absolute', bottom: 0, width: '64%', height: `${(d.prev / max) * 100}%`, background: C.line, borderRadius: '5px 5px 0 0', opacity: 0.7 }} />
              {/* this week */}
              <div style={{ position: 'relative', width: '64%', height: `${(d.value / max) * 100}%`, minHeight: 3, background: accent, borderRadius: '5px 5px 0 0' }} />
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 7 }}>
        {chart.map((d, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 10, color: C.faint }}>{d.label}</div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.line}`, fontSize: 11, color: C.mute }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><i style={{ width: 9, height: 9, borderRadius: 2, background: accent }} /> This week</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><i style={{ width: 9, height: 9, borderRadius: 2, background: C.line }} /> Last week</span>
      </div>
    </div>
  )
}
