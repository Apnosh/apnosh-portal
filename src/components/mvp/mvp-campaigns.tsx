'use client'

/**
 * MVP Campaigns — the apnosh-mvp design's Campaign Board: a scannable card
 * list of campaigns (All / Live / Drafts / Done) with a List/Calendar toggle.
 * Each card shows status, cadence, cost, a one-line status, an at-a-glance
 * performance signal (production progress / metric trend / finished lift), and
 * a "see how it's doing" footer.
 *
 * Runs on sample campaigns (no campaign model exists yet); the CampVM shape is
 * what real campaigns would map to.
 */

import { useState } from 'react'
import {
  Plus, Repeat, Check, TrendingUp, TrendingDown, Minus, ArrowRight, Clock,
  CalendarDays, Eye, ChevronLeft, ChevronRight,
} from 'lucide-react'

const C = {
  green: '#4abd98', greenDk: '#2e9a78', greenSoft: '#eaf7f3', greenLine: 'rgba(74,189,152,0.32)',
  ink: '#1d1d1f', mute: '#6e6e73', faint: '#aeaeb2', line: '#e6e6ea',
  amber: '#8a5a0c', amberBg: '#fbf3e4', amberLine: '#eed9b3',
  red: '#c0392b', redBg: '#fdecea',
}
const DISPLAY = "'Cal Sans','Inter',sans-serif"

const ANIM = `
@keyframes ccRise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
.cc-stagger>*{animation:ccRise .45s cubic-bezier(.2,.7,.3,1) both}
.cc-stagger>*:nth-child(1){animation-delay:.03s}.cc-stagger>*:nth-child(2){animation-delay:.08s}.cc-stagger>*:nth-child(3){animation-delay:.13s}.cc-stagger>*:nth-child(4){animation-delay:.18s}.cc-stagger>*:nth-child(5){animation-delay:.23s}.cc-stagger>*:nth-child(6){animation-delay:.28s}.cc-stagger>*:nth-child(7){animation-delay:.33s}.cc-stagger>*:nth-child(8){animation-delay:.38s}.cc-stagger>*:nth-child(9){animation-delay:.43s}
.cc-scroll{scrollbar-width:none}.cc-scroll::-webkit-scrollbar{display:none}
@media (prefers-reduced-motion: reduce){.cc-stagger>*{animation:none}}
`

type Perf =
  | { type: 'progress'; live: number; total: number }
  | { type: 'ready'; ready: number }
  | { type: 'trend'; trend: 'up' | 'down' | 'flat'; note: string; metric: string; spark: number[] }
  | { type: 'lift'; pct: number; reach: number }
type Camp = {
  key: string; kind: 'live' | 'draft' | 'done'; title: string
  pill: string; pillIcon: 'dot' | 'calendar' | 'check'
  blurb: string; cost: string | null; recurring?: boolean
  perf?: Perf | null; review?: boolean; goLive?: string
}

const CAMPAIGNS: Camp[] = [
  { key: 'c1', kind: 'live', title: "Promote Father's Day menu", pill: 'In production', pillIcon: 'dot', blurb: "In production · your team's on it", cost: '$150/mo', recurring: true, perf: { type: 'progress', live: 1, total: 3 }, review: true },
  { key: 'c2', kind: 'live', title: 'Pork belly combo launch', pill: 'Scheduled', pillIcon: 'calendar', blurb: 'Goes live Jun 22', cost: '$240 one-time', recurring: false, perf: { type: 'ready', ready: 2 } },
  { key: 'c3', kind: 'live', title: "Father's Day brunch", pill: 'In production', pillIcon: 'dot', blurb: 'Goes live Jun 27', cost: null, perf: null },
  { key: 'c4', kind: 'live', title: 'Weekly Reels', pill: 'Live', pillIcon: 'dot', blurb: 'Working — your directions are climbing', cost: '$280/mo', recurring: true, perf: { type: 'trend', trend: 'up', note: '+34%', metric: 'Directions', spark: [40, 52, 48, 60, 72, 68, 90] } },
  { key: 'c5', kind: 'live', title: 'Summer cocktail series', pill: 'In production', pillIcon: 'dot', blurb: "In production · your team's on it", cost: '$120/mo', recurring: true, perf: { type: 'progress', live: 2, total: 4 } },
  { key: 'c6', kind: 'live', title: 'Google profile refresh', pill: 'Live', pillIcon: 'dot', blurb: 'Working — your directions are climbing', cost: '$90/mo', recurring: true, perf: { type: 'trend', trend: 'up', note: '+12%', metric: 'Directions', spark: [30, 34, 33, 38, 42, 44, 48] } },
  { key: 'c7', kind: 'live', title: 'Review reply program', pill: 'Live', pillIcon: 'dot', blurb: 'Worth a look — calls dipped', cost: '$70/mo', recurring: true, perf: { type: 'trend', trend: 'down', note: '-8%', metric: 'Calls', spark: [60, 58, 55, 50, 48, 46, 44] } },
  { key: 'c8', kind: 'draft', title: 'Late-night menu teaser', pill: 'Draft', pillIcon: 'dot', blurb: 'Ready when you are · 2 parts', cost: '$90 one-time', recurring: false, perf: null },
  { key: 'c9', kind: 'done', title: 'Cinco de Mayo special', pill: 'Done', pillIcon: 'check', blurb: 'Wrapped — full results inside', cost: null, perf: { type: 'lift', pct: 28, reach: 12400 } },
]

type Tab = 'all' | 'live' | 'draft' | 'done'

export default function MvpCampaigns() {
  const [view, setView] = useState<'list' | 'calendar'>('list')
  const [tab, setTab] = useState<Tab>('all')

  const live = CAMPAIGNS.filter((c) => c.kind === 'live')
  const drafts = CAMPAIGNS.filter((c) => c.kind === 'draft')
  const done = CAMPAIGNS.filter((c) => c.kind === 'done')
  const counts: Record<Tab, number> = { all: CAMPAIGNS.length, live: live.length, draft: drafts.length, done: done.length }
  const shown = tab === 'all' ? CAMPAIGNS : tab === 'live' ? live : tab === 'draft' ? drafts : done

  return (
    <div style={{ fontFamily: "'Inter',system-ui,sans-serif", color: C.ink, background: '#fff', minHeight: '100%', overflowY: 'auto', paddingBottom: 28 }}>
      <style>{ANIM}</style>
      {/* sticky header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 20, background: '#fff', padding: '14px 18px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${C.line}` }}>
        <div style={{ fontSize: 15, color: C.ink, fontWeight: 600 }}>Campaigns</div>
        <a href="/dashboard/requests/new" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: C.ink, color: '#fff', textDecoration: 'none', borderRadius: 99, padding: '8px 14px', fontWeight: 700, fontSize: 13.5 }}><Plus size={16} strokeWidth={2.5} /> New</a>
      </div>

      <div style={{ padding: '16px 18px 0' }}>
        <p style={{ fontSize: 13.5, color: C.mute, margin: '0 0 16px' }}>Open any card to see what it costs, what it&apos;s driving, and how it&apos;s doing inside.</p>

        {/* List / Calendar toggle */}
        <div style={{ display: 'inline-flex', background: '#f1f3f2', borderRadius: 10, padding: 3, marginBottom: 18 }}>
          {([['list', 'List'], ['calendar', 'Calendar']] as const).map(([k, l]) => {
            const on = view === k
            return <button key={k} onClick={() => setView(k)} style={{ border: 'none', borderRadius: 8, padding: '6px 18px', fontSize: 13, fontWeight: on ? 700 : 500, color: on ? C.ink : C.mute, background: on ? '#fff' : 'transparent', boxShadow: on ? '0 1px 3px rgba(0,0,0,.08)' : 'none', cursor: 'pointer', transition: 'all .15s' }}>{l}</button>
          })}
        </div>

        {view === 'calendar' ? (
          <CampaignCalendar camps={CAMPAIGNS} />
        ) : (
          <>
            {/* filter chips */}
            <div className="cc-scroll" style={{ display: 'flex', gap: 7, marginBottom: 16, overflowX: 'auto', paddingBottom: 2 }}>
              {([['all', 'All'], ['live', 'Live'], ['draft', 'Drafts'], ['done', 'Done']] as const).map(([k, l]) => {
                const on = tab === k; const n = counts[k]
                return (
                  <button key={k} onClick={() => setTab(k)} style={{ flexShrink: 0, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 7, border: `1px solid ${on ? C.green : C.line}`, background: on ? C.greenSoft : '#fff', color: on ? C.greenDk : C.mute, borderRadius: 999, padding: '6px 13px', fontSize: 12.5, fontWeight: on ? 700 : 500, cursor: 'pointer', transition: 'all .15s' }}>
                    {l}<span style={{ minWidth: 17, height: 17, padding: '0 5px', borderRadius: 99, background: on ? C.green : '#eef0ef', color: on ? '#fff' : C.faint, fontSize: 10.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{n}</span>
                  </button>
                )
              })}
            </div>

            {shown.length === 0 ? (
              <div style={{ background: '#fff', border: `0.5px dashed ${C.line}`, borderRadius: 16, padding: '26px 16px', textAlign: 'center', color: C.faint, fontSize: 13.5, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}><Plus size={20} color={C.faint} />Nothing here yet — tap <b style={{ color: C.mute }}>+ New</b> to start one.</div>
            ) : (
              <div className="cc-stagger" key={tab}>
                {shown.map((c) => <CampaignCard key={c.key} c={c} />)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function Spark({ values, color }: { values: number[]; color: string }) {
  if (!values || values.length < 2) return null
  const max = Math.max(...values), min = Math.min(...values), range = max - min || 1
  const w = 56, h = 20
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - min) / range) * h}`).join(' ')
  return <svg width={w} height={h} style={{ display: 'block' }}><polyline points={pts} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" /></svg>
}

function CampaignCard({ c }: { c: Camp }) {
  const tone = c.kind === 'draft'
    ? { bar: '#cfd4d1', dot: '#aeb4b0', pillBg: '#eef0ef', pillC: C.mute }
    : { bar: C.green, dot: C.green, pillBg: C.greenSoft, pillC: C.greenDk }
  const ts = (t: 'up' | 'down' | 'flat') => t === 'up' ? { c: C.green, bg: C.greenSoft, I: TrendingUp } : t === 'down' ? { c: C.red, bg: C.redBg, I: TrendingDown } : { c: C.mute, bg: '#f0f0ee', I: Minus }
  const fmtReach = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)

  return (
    <div style={{ position: 'relative', overflow: 'hidden', background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 14, padding: '11px 13px 10px', marginBottom: 9, cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: tone.bar }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: tone.pillBg, color: tone.pillC, borderRadius: 99, padding: '2px 8px', fontWeight: 700, fontSize: 11 }}>
            {c.pillIcon === 'check' ? <Check size={11} strokeWidth={3} /> : c.pillIcon === 'calendar' ? <CalendarDays size={11} /> : <span style={{ width: 6, height: 6, borderRadius: 99, background: tone.dot, display: 'inline-block' }} />}{c.pill}
          </span>
          {c.kind !== 'done' && c.cost && (c.recurring
            ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: '#eef0ef', color: C.mute, borderRadius: 99, padding: '2px 8px', fontWeight: 700, fontSize: 10 }}><Repeat size={10} /> Recurring</span>
            : <span style={{ background: '#eef0ef', color: C.mute, borderRadius: 99, padding: '2px 8px', fontWeight: 700, fontSize: 10 }}>One-time</span>)}
        </div>
        {c.cost && <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 14.5, color: C.ink, flexShrink: 0 }}>{c.cost}</span>}
      </div>

      <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 16, color: C.ink, lineHeight: 1.15, marginBottom: 2 }}>{c.title}</div>
      <div style={{ fontSize: 12.5, color: C.mute, lineHeight: 1.35, marginBottom: 8 }}>{c.blurb}</div>

      {c.perf?.type === 'trend' && (() => { const s = ts(c.perf.trend); return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: s.bg, color: s.c, borderRadius: 7, padding: '3px 8px', fontWeight: 700, fontSize: 11.5 }}><s.I size={12} /> {c.perf.metric}{c.perf.note ? ` ${c.perf.note}` : ''}</span>
          <Spark values={c.perf.spark} color={s.c} />
        </div>
      ) })()}
      {c.perf?.type === 'progress' && (() => { const pct = c.perf.total ? c.perf.live / c.perf.total : 0; return (
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: C.ink }}>{c.perf.live} of {c.perf.total} parts live</span>
            <span style={{ fontSize: 10.5, color: C.faint }}>{Math.round(pct * 100)}%</span>
          </div>
          <div style={{ height: 5, borderRadius: 99, background: '#eef0ef', overflow: 'hidden' }}><div style={{ width: `${Math.max(5, pct * 100)}%`, height: '100%', background: C.green, borderRadius: 99 }} /></div>
        </div>
      ) })()}
      {c.perf?.type === 'ready' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
          <Clock size={14} color={C.mute} />
          <span style={{ fontSize: 12.5 }}><b style={{ fontWeight: 700 }}>{c.perf.ready} parts ready</b> <span style={{ color: C.faint }}>· waiting to go live</span></span>
        </div>
      )}
      {c.perf?.type === 'lift' && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: C.greenSoft, color: C.greenDk, borderRadius: 7, padding: '3px 8px', fontWeight: 700, fontSize: 11.5, marginBottom: 8 }}><TrendingUp size={12} /> +{c.perf.pct}% actions · {fmtReach(c.perf.reach)} reached</div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: C.greenDk, fontWeight: 700, fontSize: 12.5 }}>See how it&apos;s doing <ArrowRight size={14} /></span>
        {c.review && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: C.amberBg, border: `0.5px solid ${C.amberLine}`, color: C.amber, borderRadius: 99, padding: '4px 10px', fontWeight: 700, fontSize: 11.5 }}><Eye size={12} /> 1 to review</span>}
      </div>
    </div>
  )
}

/* Lightweight month calendar: campaign go-live dates + holidays as dots. */
function CampaignCalendar({ camps }: { camps: Camp[] }) {
  const [cur, setCur] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() } })
  const first = new Date(cur.y, cur.m, 1)
  const startDow = first.getDay()
  const days = new Date(cur.y, cur.m + 1, 0).getDate()
  const monthLabel = first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const today = new Date()
  const isToday = (d: number) => today.getFullYear() === cur.y && today.getMonth() === cur.m && today.getDate() === d

  // Sample go-live marks (matching the cards) + a holiday.
  const marks: Record<number, { type: 'camp' | 'holiday' }[]> = {}
  if (cur.m === 5) { // June
    ;[20, 22, 27].forEach((d) => (marks[d] ||= []).push({ type: 'camp' }))
    ;(marks[21] ||= []).push({ type: 'holiday' })
  }

  const cells: (number | null)[] = [...Array(startDow).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)]
  return (
    <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, padding: '14px 14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <button onClick={() => setCur((c) => ({ y: c.m === 0 ? c.y - 1 : c.y, m: c.m === 0 ? 11 : c.m - 1 }))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.mute, padding: 4 }}><ChevronLeft size={18} /></button>
        <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 15 }}>{monthLabel}</span>
        <button onClick={() => setCur((c) => ({ y: c.m === 11 ? c.y + 1 : c.y, m: c.m === 11 ? 0 : c.m + 1 }))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.mute, padding: 4 }}><ChevronRight size={18} /></button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, marginBottom: 4 }}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <div key={i} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: C.faint }}>{d}</div>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
        {cells.map((d, i) => (
          <div key={i} style={{ aspectRatio: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, borderRadius: 9, background: d && isToday(d) ? C.greenSoft : 'transparent' }}>
            {d && <span style={{ fontSize: 12, fontWeight: isToday(d) ? 700 : 500, color: isToday(d) ? C.greenDk : C.ink }}>{d}</span>}
            <div style={{ display: 'flex', gap: 2, height: 4 }}>
              {(marks[d ?? -1] ?? []).slice(0, 3).map((mk, j) => <span key={j} style={{ width: 4, height: 4, borderRadius: 99, background: mk.type === 'holiday' ? C.amber : C.green }} />)}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 12, fontSize: 11, color: C.mute }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: 99, background: C.green }} /> Campaign go-live</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: 99, background: C.amber }} /> Holiday</span>
      </div>
    </div>
  )
}
