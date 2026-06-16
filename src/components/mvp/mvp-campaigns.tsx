'use client'

/**
 * MVP Campaigns — the apnosh-mvp design's "Your marketing" (Plan) screen,
 * reproduced faithfully. The owner steers (pause / swap / drop / add) but never
 * authors. Shows: running monthly total, what the spend is getting (ROI), the
 * money map sized by cost, what results say (best vs lagging), the running
 * lines, and recommended adds.
 *
 * No real plan/billing data is modelled yet, so this runs on sample data (a
 * representative subscriber). Once a services-with-cost model exists, swap the
 * SAMPLE_TACTICS for the client's real lines — the components stay the same.
 */

import { useState } from 'react'
import {
  Navigation, Phone, MousePointerClick, CalendarDays, TrendingUp, TrendingDown,
  Minus, Sparkles, ChevronRight, ChevronDown, ArrowRight, Receipt, Info, Clock,
  Plus, Pause, Play, Trash2, Film, Repeat, Check, X,
} from 'lucide-react'

const C = {
  green: '#4abd98', greenDk: '#2e9a78', greenBar: '#4abd98', greenSoft: '#eaf7f3', greenLine: 'rgba(74,189,152,0.32)',
  ink: '#1d1d1f', mute: '#6e6e73', faint: '#aeaeb2', line: '#e6e6ea',
  amber: '#8a5a0c', amberBtn: '#bd7e16', amberBg: '#fbf3e4', amberLine: '#eed9b3',
  coral: '#a85c3c', coralBg: '#f8efe9', red: '#c0392b', redBg: '#fdecea', bg: '#f5f5f7',
}
const DISPLAY = "'Cal Sans','Inter',sans-serif"
const GRAD = 'linear-gradient(135deg,#54c6a2 0%,#2e9a78 100%)'

const ANIM = `
@keyframes crRise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
.cr-rise{animation:crRise .5s cubic-bezier(.2,.7,.3,1) both}
@media (prefers-reduced-motion: reduce){.cr-rise{animation:none}}
`

const METRIC_ICON: Record<string, React.ComponentType<{ size?: number; color?: string }>> = {
  Directions: Navigation, Calls: Phone, Clicks: MousePointerClick, Bookings: CalendarDays,
}
const SRC_TAG: Record<string, { t: string; c: string; bg: string }> = {
  apnosh: { t: 'Apnosh', c: '#2e9a78', bg: '#eaf7f3' },
  ai: { t: 'AI pick', c: '#6b5bd1', bg: '#eeeafc' },
  owner: { t: 'You', c: '#6e6e73', bg: '#f0f0f5' },
}
const SIGNAL_COPY: Record<string, string> = {
  Directions: 'We watch your Google Maps "directions" requests, week over week.',
  Calls: 'We track taps on the call button on your profile.',
  Clicks: 'We track website clicks coming from your profile.',
  Bookings: 'We track reservations started from your profile.',
}

type Lane = 'self_serve' | 'done_for_you'
interface Service { id: string; category: string; title: string; desc: string; metric: string; lane: Lane; cost: number; recommended?: boolean; rec?: string }
const SERVICE_CATALOG: Service[] = [
  { id: 'svc_reels', category: 'Social media', title: 'Weekly Reels', desc: 'Our team films, edits & posts a short video every week — you just approve each one.', metric: 'Directions', lane: 'done_for_you', cost: 280, recommended: true, rec: 'Reels reach the most new locals — a steady weekly cadence keeps Directions climbing.' },
  { id: 'svc_stories', category: 'Social media', title: 'Daily Stories', desc: 'Behind-the-scenes stories posted every day to keep you top of feed.', metric: 'Clicks', lane: 'done_for_you', cost: 120 },
  { id: 'svc_feed', category: 'Social media', title: 'Feed posts · 3×/week', desc: 'Branded photo posts to Instagram & Facebook — captioned, designed and scheduled.', metric: 'Clicks', lane: 'done_for_you', cost: 180 },
  { id: 'svc_gbp_opt', category: 'Google Business Profile', title: 'Profile optimization', desc: 'We keep your Google listing complete — photos, hours, categories, Q&A — so you rank in Maps.', metric: 'Directions', lane: 'done_for_you', cost: 90, recommended: true, rec: 'Directions are your strongest metric right now — a fuller profile compounds that.' },
  { id: 'svc_reviews', category: 'Local SEO', title: 'Reply to reviews', desc: 'We respond to every Google review in your voice, fast — replies lift your ranking.', metric: 'Calls', lane: 'done_for_you', cost: 70 },
  { id: 'svc_localseo', category: 'Local SEO', title: 'Local SEO setup', desc: 'Directory citations, listings & local keywords so nearby customers find you first.', metric: 'Clicks', lane: 'done_for_you', cost: 150 },
]

interface Tactic { id: string; title: string; why: string; cost: number; metric: string; trend: 'up' | 'down' | null; note: string; pct: number; spark: number[]; status: 'active' | 'suggested'; lane: Lane; source: string; swapTo?: { title: string; cost: number; startsLabel: string } | null }
const SAMPLE_TACTICS: Tactic[] = [
  { id: 't1', title: 'Weekly Reels', why: 'We film, edit & post a short video every week — you just approve each one.', cost: 280, metric: 'Directions', trend: 'up', note: '+34%', pct: 34, spark: [40, 52, 48, 60, 72, 68, 90], status: 'active', lane: 'done_for_you', source: 'apnosh' },
  { id: 't2', title: 'Reply to reviews', why: 'We respond to every Google review in your voice, fast.', cost: 70, metric: 'Calls', trend: 'down', note: '-8%', pct: -8, spark: [60, 58, 55, 50, 48, 46, 44], status: 'active', lane: 'done_for_you', source: 'apnosh' },
  { id: 't3', title: 'Local SEO setup', why: 'Directory citations & local keywords so nearby diners find you first.', cost: 150, metric: 'Clicks', trend: 'up', note: '+6%', pct: 6, spark: [30, 32, 31, 34, 36, 35, 38], status: 'active', lane: 'done_for_you', source: 'apnosh' },
  { id: 't4', title: 'Profile monitoring', why: 'We keep your Google listing accurate — hours, photos, Q&A.', cost: 0, metric: 'Directions', trend: null, note: '', pct: 0, spark: [], status: 'active', lane: 'done_for_you', source: 'apnosh' },
]
const MONTH_ACTIONS = 1836
const MONTH_PCT = 12
const PREV_MONTH = 'May'

export default function MvpCampaigns() {
  const [tactics, setTactics] = useState<Tactic[]>(SAMPLE_TACTICS)
  const [showCatalog, setShowCatalog] = useState(false)
  const [swapping, setSwapping] = useState<Tactic | null>(null)

  const active = tactics.filter((t) => t.status === 'active')
  const paused = tactics.filter((t) => t.status === 'suggested')
  const spent = active.reduce((s, t) => s + Number(t.cost || 0), 0)
  const paidCount = active.filter((t) => Number(t.cost) > 0).length
  const cycleLabel = new Date().toLocaleString('en-US', { month: 'long' })
  const nextLabel = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toLocaleString('en-US', { month: 'long' })

  const setStatus = (id: string, status: 'active' | 'suggested') => setTactics((t) => t.map((x) => x.id === id ? { ...x, status } : x))
  const del = (id: string) => setTactics((t) => t.filter((x) => x.id !== id))
  const undoSwap = (id: string) => setTactics((t) => t.map((x) => x.id === id ? { ...x, swapTo: null } : x))
  const confirmSwap = (oldT: Tactic, s: Service) => {
    setTactics((list) => list.map((x) => x.id === oldT.id ? { ...x, swapTo: { title: s.title, cost: s.cost, startsLabel: nextLabel } } : x))
    setSwapping(null)
  }
  const addService = (s: Service) => {
    setTactics((list) => list.some((x) => x.id === s.id) ? list : [...list, { id: s.id, title: s.title, why: s.desc, cost: s.cost, metric: s.metric, trend: null, note: '', pct: 0, spark: [], status: 'active', lane: s.lane, source: 'apnosh' }])
  }

  const best = active.length ? active.reduce((a, b) => (b.pct > a.pct ? b : a), active[0]) : null
  const bestId = active.length > 1 && best && best.pct > 0 ? best.id : null
  const paidLagging = active.filter((t) => t.cost > 0 && t.pct <= 0).sort((a, b) => a.pct - b.pct)[0]
  const wasteId = paidLagging ? paidLagging.id : null
  const winner = bestId ? best : null

  const onPlan = new Set(tactics.map((t) => t.title.toLowerCase().trim()))
  const avail = SERVICE_CATALOG.filter((s) => !onPlan.has(s.title.toLowerCase()) && !tactics.some((t) => t.id === s.id))
  const recommended = avail.filter((s) => s.recommended)
  const browse = avail.filter((s) => !s.recommended)
  const categories = [...new Set(browse.map((s) => s.category))]
  const amplify = (winner && recommended.find((s) => s.metric === winner.metric)) || recommended[0] || null
  const doMore = () => { if (amplify) addService(amplify); else setShowCatalog(true) }

  const perCust = spent > 0 && MONTH_ACTIONS ? spent / MONTH_ACTIONS : 0
  const costEach = perCust >= 1 ? `$${perCust.toFixed(2)} each` : `${Math.round(perCust * 100)}¢ each`

  return (
    <div style={{ fontFamily: "'Inter',system-ui,sans-serif", color: C.ink, background: '#fff', minHeight: '100%', overflowY: 'auto', paddingBottom: 28 }}>
      <style>{ANIM}</style>
      <div style={{ padding: '20px 20px 0' }}>
        <h1 className="cr-rise" style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 27, margin: '0 0 4px' }}>Your marketing</h1>
        <p className="cr-rise" style={{ fontSize: 13.5, color: C.mute, margin: '0 0 16px', animationDelay: '.05s' }}>Everything you&apos;re paying for, and what it&apos;s doing. Your strategist runs it — add, pause, or drop anything.</p>

        {/* RUNNING TOTAL */}
        <div className="cr-rise" style={{ animationDelay: '.1s', background: '#fff', borderRadius: 22, padding: '18px 20px', boxShadow: '0 2px 10px rgba(0,0,0,.04)', marginBottom: 16, border: `1px solid ${C.line}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ fontSize: 12, color: C.mute, fontWeight: 600, letterSpacing: '.05em' }}>{cycleLabel.toUpperCase()} · YOU&apos;RE PAYING</span>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: C.green, background: C.greenSoft, padding: '2px 8px', borderRadius: 99, display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 5, height: 5, borderRadius: 3, background: C.greenBar }} />Running</span>
            </div>
            <span style={{ fontFamily: DISPLAY, fontSize: 30, fontWeight: 600 }}>${spent}<span style={{ fontSize: 14, color: C.mute, fontWeight: 400 }}>/mo</span></span>
          </div>
          <div style={{ fontSize: 13, color: C.mute, marginTop: 6 }}>{paidCount > 0 ? <><b style={{ color: C.ink }}>{paidCount}</b> {paidCount === 1 ? 'service' : 'services'} running.</> : 'Nothing running yet — add a service to grow.'}</div>
          <div style={{ marginTop: 12, fontSize: 12, color: C.faint, lineHeight: 1.5, display: 'flex', gap: 7 }}>
            <Info size={14} color={C.faint} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>Your monthly total. Adding shows the new total before any charge; pausing applies next month.</span>
          </div>
        </div>

        {/* ROI LINE */}
        {spent > 0 && MONTH_ACTIONS > 0 && (
          <div className="cr-rise" style={{ animationDelay: '.12s', background: '#fff', borderRadius: 22, padding: '16px 20px', boxShadow: '0 2px 10px rgba(0,0,0,.04)', marginBottom: 16, border: `1px solid ${C.line}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.mute, marginBottom: 9 }}>What it&apos;s getting you</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <b style={{ color: C.ink, fontFamily: DISPLAY, fontWeight: 600, fontSize: 19 }}>${spent}</b>
              <span style={{ color: C.faint, fontSize: 14 }}>this month</span>
              <ArrowRight size={15} color={C.faint} />
              <b style={{ color: C.ink, fontFamily: DISPLAY, fontWeight: 600, fontSize: 19 }}>{MONTH_ACTIONS.toLocaleString()}</b>
              <span style={{ color: C.faint, fontSize: 14 }}>customers · {costEach}</span>
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 9, fontSize: 12.5, fontWeight: 600, color: MONTH_PCT > 0 ? C.green : C.coral }}>
              {MONTH_PCT > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}{MONTH_PCT > 0 ? 'Up' : 'Down'} {Math.abs(MONTH_PCT)}% from {PREV_MONTH}
            </div>
          </div>
        )}

        {/* MONEY MAP */}
        <BudgetBreakdown active={active} spent={spent} bestId={bestId} wasteId={wasteId} />

        {/* WHAT YOUR RESULTS SAY */}
        {(winner || wasteId) && (
          <div className="cr-rise" style={{ animationDelay: '.15s', background: '#fff', borderRadius: 22, padding: '16px 18px', boxShadow: '0 2px 10px rgba(0,0,0,.04)', marginBottom: 16, border: `1px solid ${C.line}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
              <TrendingUp size={14} color={C.green} />
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.mute }}>What your results say</span>
            </div>
            {winner && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: wasteId ? 14 : 0 }}>
                <div style={{ width: 38, height: 38, borderRadius: 11, background: C.greenSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><TrendingUp size={18} color={C.green} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.35 }}><b>{winner.title}</b> is your best performer <span style={{ color: C.green, fontWeight: 700 }}>{winner.note}</span></div>
                </div>
                <button onClick={doMore} style={{ flexShrink: 0, background: GRAD, color: '#fff', border: 'none', borderRadius: 10, padding: '9px 13px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Do more</button>
              </div>
            )}
            {winner && wasteId && <div style={{ borderTop: `1px solid ${C.line}` }} />}
            {wasteId && paidLagging && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0 0' }}>
                <div style={{ width: 38, height: 38, borderRadius: 11, background: C.amberBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><TrendingDown size={18} color={C.amberBtn} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.35 }}><b>{paidLagging.title}</b> isn&apos;t moving <span style={{ color: C.amber, fontWeight: 700 }}>{paidLagging.note}</span></div>
                  <div style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>${paidLagging.cost}/mo, flat.</div>
                </div>
                <button onClick={() => setStatus(wasteId, 'suggested')} style={{ flexShrink: 0, background: '#fff', color: C.amber, border: `1px solid ${C.amberLine}`, borderRadius: 10, padding: '9px 13px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Pause it</button>
              </div>
            )}
          </div>
        )}

        {/* WHAT YOU'RE RUNNING */}
        {active.length > 0 && (
          <>
            <Label>What you&apos;re running now</Label>
            <p style={{ fontSize: 12, color: C.faint, lineHeight: 1.5, margin: '-4px 0 12px' }}>Each line&apos;s trend is the metric it grows, this month vs. last — so a winner and a laggard are easy to spot.</p>
            {active.map((t) => (
              <TacticRow key={t.id} t={t} bucket="active" rank={t.id === bestId ? 'best' : t.id === wasteId ? 'waste' : undefined} onDelete={() => del(t.id)} onToggle={() => setStatus(t.id, 'suggested')} onSwap={() => setSwapping(t)} onUndoSwap={() => undoSwap(t.id)} />
            ))}
          </>
        )}

        {paused.length > 0 && (
          <>
            <div style={{ height: 18 }} /><Label>Paused</Label>
            {paused.map((t) => <TacticRow key={t.id} t={t} bucket="paused" onResume={() => setStatus(t.id, 'active')} onDelete={() => del(t.id)} />)}
          </>
        )}

        {/* RECOMMENDED */}
        {recommended.length > 0 && (
          <>
            <div style={{ height: 18 }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '0 0 10px' }}>
              <Sparkles size={14} color={C.green} />
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.green }}>Recommended for you</span>
            </div>
            {recommended.map((s) => <ServiceRow key={s.id} s={s} onAdd={() => addService(s)} />)}
          </>
        )}

        {/* CATALOG behind a link */}
        {browse.length > 0 && (
          <>
            <div style={{ height: 18 }} />
            {!showCatalog ? (
              <div onClick={() => setShowCatalog(true)} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: '14px 16px', cursor: 'pointer' }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: '#f5f4f1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Plus size={17} color={C.mute} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: C.ink }}>Add something else</div>
                  <div style={{ fontSize: 12, color: C.faint }}>Browse everything we can run for you</div>
                </div>
                <ChevronDown size={18} color={C.faint} style={{ flexShrink: 0 }} />
              </div>
            ) : (
              <>
                <Label>Add a service</Label>
                <p style={{ fontSize: 12, color: C.faint, lineHeight: 1.5, margin: '-4px 0 14px' }}>Prices are a starting point — your strategist confirms before any charge.</p>
                {categories.map((cat) => (
                  <div key={cat} style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: C.mute, margin: '6px 0 9px' }}>{cat}</div>
                    {browse.filter((s) => s.category === cat).map((s) => <ServiceRow key={s.id} s={s} onAdd={() => addService(s)} />)}
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </div>

      {swapping && (
        <SwapSheet
          line={swapping}
          options={SERVICE_CATALOG.filter((s) => s.cost <= swapping.cost && !onPlan.has(s.title.toLowerCase()) && !tactics.some((t) => t.id === s.id))}
          nextLabel={nextLabel}
          onPick={(s) => confirmSwap(swapping, s)}
          onClose={() => setSwapping(null)}
        />
      )}
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink, margin: '4px 0 10px' }}>{children}</div>
}

function MiniBtn({ children, onClick, danger, compact }: { children: React.ReactNode; onClick?: () => void; danger?: boolean; compact?: boolean }) {
  return (
    <button onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, background: '#fff', color: danger ? C.coral : C.mute, border: `1px solid ${C.line}`, borderRadius: 9, padding: compact ? '7px 9px' : '7px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>{children}</button>
  )
}

function Spark({ values, color }: { values: number[]; color: string }) {
  if (!values || values.length < 2) return <div style={{ width: 56, height: 20 }} />
  const max = Math.max(...values), min = Math.min(...values), range = max - min || 1
  const w = 56, h = 20
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - min) / range) * h}`).join(' ')
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function BudgetBreakdown({ active, spent, bestId, wasteId }: { active: Tactic[]; spent: number; bestId: string | null; wasteId: string | null }) {
  const paid = active.filter((t) => Number(t.cost) > 0).sort((a, b) => Number(b.cost) - Number(a.cost))
  const free = active.filter((t) => !Number(t.cost))
  if (paid.length === 0 && free.length === 0) return null
  return (
    <div className="cr-rise" style={{ animationDelay: '.13s', background: '#fff', borderRadius: 22, padding: '18px 20px', boxShadow: '0 2px 10px rgba(0,0,0,.04)', marginBottom: 16, border: `1px solid ${C.line}` }}>
      <span style={{ fontSize: 12, color: C.mute, fontWeight: 600, letterSpacing: '.05em' }}>WHERE IT GOES</span>
      <p style={{ fontSize: 12, color: C.faint, lineHeight: 1.5, margin: '5px 0 16px' }}>Each line, sized by cost — and how it&apos;s pulling.</p>
      {paid.map((t) => {
        const w = spent > 0 ? Math.round((Number(t.cost) / spent) * 100) : 0
        const isBest = t.id === bestId, isWaste = t.id === wasteId
        const barColor = isWaste ? C.coral : isBest ? C.green : C.greenBar
        const trendColor = t.trend === 'up' ? C.green : t.trend === 'down' ? C.coral : C.faint
        return (
          <div key={t.id} style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: C.ink, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
              <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 15, flexShrink: 0 }}>${t.cost}<span style={{ fontSize: 11, color: C.mute, fontWeight: 400 }}>/mo</span></span>
            </div>
            <div style={{ height: 7, background: '#eef2f0', borderRadius: 5, overflow: 'hidden' }}>
              <div style={{ width: `${w}%`, height: '100%', background: barColor, borderRadius: 5 }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11.5, color: C.faint }}>{w}% of spend · grows {t.metric}</span>
              {t.trend && t.note && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 11.5, fontWeight: 700, color: trendColor }}>{t.trend === 'up' ? '↑' : t.trend === 'down' ? '↓' : ''}{t.note}</span>
              )}
              {isBest && <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.03em', textTransform: 'uppercase', color: C.green, background: C.greenSoft, padding: '2px 7px', borderRadius: 99 }}>✓ Working best</span>}
              {isWaste && <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.03em', textTransform: 'uppercase', color: C.coral, background: C.coralBg, padding: '2px 7px', borderRadius: 99 }}>Not pulling its weight</span>}
            </div>
          </div>
        )
      })}
      {free.length > 0 && (
        <div style={{ borderTop: `1px solid ${C.line}`, marginTop: 4, paddingTop: 12 }}>
          {free.map((t) => (
            <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 13, color: C.ink, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
              <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.03em', textTransform: 'uppercase', color: C.green, background: C.greenSoft, padding: '2px 8px', borderRadius: 99, flexShrink: 0 }}>Free</span>
            </div>
          ))}
          <div style={{ fontSize: 11.5, color: C.faint, marginTop: 4 }}>Included at no cost — work we do that you don&apos;t pay extra for.</div>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderTop: `2px solid ${C.ink}`, marginTop: 14, paddingTop: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: C.mute }}>Committed monthly</span>
        <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 20, color: C.greenDk }}>${spent}<span style={{ fontSize: 12, color: C.mute, fontWeight: 400 }}>/mo</span></span>
      </div>
    </div>
  )
}

function ServiceRow({ s, onAdd }: { s: Service; onAdd: () => void }) {
  const Icon = METRIC_ICON[s.metric] || MousePointerClick
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 16, padding: '15px 16px', marginBottom: 9 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14.5, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
            {s.lane === 'done_for_you' && <Film size={14} color={C.green} />}{s.title}
            {s.recommended && <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: C.green, background: C.greenSoft, padding: '2px 7px', borderRadius: 99 }}>Recommended</span>}
          </div>
          <div style={{ fontSize: 12.5, color: C.mute, display: 'flex', alignItems: 'center', gap: 4 }}>{s.cost === 0 ? 'Free' : `$${s.cost}/mo`} · <Icon size={13} color={C.green} /> grows <b style={{ color: C.ink, fontWeight: 600 }}>{s.metric}</b></div>
          <div style={{ fontSize: 12, color: C.faint, marginTop: 6, lineHeight: 1.45 }}>{s.rec || s.desc}</div>
        </div>
        <button onClick={onAdd} style={{ flexShrink: 0, background: GRAD, color: '#fff', border: 'none', borderRadius: 10, padding: '9px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}><Plus size={14} />Add</button>
      </div>
    </div>
  )
}

function TacticRow({ t, bucket, rank, onDelete, onToggle, onResume, onSwap, onUndoSwap }: {
  t: Tactic; bucket: 'active' | 'paused'; rank?: 'best' | 'waste'
  onDelete: () => void; onToggle?: () => void; onResume?: () => void; onSwap?: () => void; onUndoSwap?: () => void
}) {
  const [open, setOpen] = useState(false)
  const Icon = METRIC_ICON[t.metric] || MousePointerClick
  const T = t.trend === 'up' ? TrendingUp : t.trend === 'down' ? TrendingDown : Minus
  const c = t.trend === 'up' ? C.green : t.trend === 'down' ? C.red : C.mute
  const src = SRC_TAG[t.source]
  return (
    <div className="cr-rise" style={{ background: '#fff', borderRadius: 16, padding: '15px 16px', marginBottom: 9, boxShadow: rank === 'best' ? '0 2px 12px rgba(31,122,84,.12)' : '0 1px 4px rgba(0,0,0,.04)', border: rank === 'best' ? `1px solid ${C.greenLine}` : rank === 'waste' ? `1px solid ${C.amberLine}` : '1px solid transparent', opacity: bucket === 'paused' ? .7 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14.5, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {t.lane === 'done_for_you' && <Film size={14} color={C.green} />}{t.title}
            {rank === 'best' && <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: C.green, background: C.greenSoft, padding: '2px 7px', borderRadius: 99 }}>★ Working best</span>}
            {rank === 'waste' && <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: C.amber, background: C.amberBg, padding: '2px 7px', borderRadius: 99 }}>Not pulling its weight</span>}
            {src && <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: src.c, background: src.bg, padding: '2px 7px', borderRadius: 99 }}>{src.t}</span>}
          </div>
          <div style={{ fontSize: 12.5, color: C.mute, display: 'flex', alignItems: 'center', gap: 4 }}>{t.cost === 0 ? 'Free' : `$${t.cost}/mo`} · <Icon size={13} color={C.green} /> grows <b style={{ color: C.ink, fontWeight: 600 }}>{t.metric}</b></div>
          {t.why && <div style={{ fontSize: 12, color: C.faint, marginTop: 6, lineHeight: 1.45 }}>{t.why}</div>}
        </div>
        {bucket === 'active' && t.trend && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
            <Spark values={t.spark} color={c} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12.5, fontWeight: 700, color: c, background: t.trend === 'down' ? C.redBg : t.trend === 'up' ? C.greenSoft : '#f0f0ee', padding: '4px 9px', borderRadius: 8, whiteSpace: 'nowrap' }}><T size={13} />{t.metric} {t.note}</div>
          </div>
        )}
      </div>
      {bucket === 'active' && t.swapTo && (
        <div style={{ marginTop: 12, background: C.greenSoft, border: `0.5px solid ${C.greenLine}`, borderRadius: 12, padding: '11px 13px', display: 'flex', alignItems: 'center', gap: 9 }}>
          <Repeat size={15} color={C.greenDk} style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, color: C.ink, fontWeight: 600, lineHeight: 1.4 }}>Switching to {t.swapTo.title} in {t.swapTo.startsLabel}</div>
            <div style={{ fontSize: 11.5, color: C.mute, marginTop: 2 }}>{t.title} runs through this month · {t.swapTo.cost === 0 ? 'Free' : `$${t.swapTo.cost}/mo`}, no charge now</div>
          </div>
          <button onClick={onUndoSwap} style={{ flexShrink: 0, background: 'none', border: 'none', fontSize: 12, fontWeight: 700, color: C.greenDk, cursor: 'pointer', padding: '4px 2px' }}>Undo</button>
        </div>
      )}
      {bucket === 'active' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 12 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: C.faint }}>{t.lane === 'done_for_you' ? <><Film size={12} /> Your strategist runs this</> : <><Check size={12} /> You run this</>}</span>
          <div style={{ flex: 1 }} />
          {!t.swapTo && <MiniBtn onClick={onSwap} compact><Repeat size={13} /></MiniBtn>}
          <MiniBtn onClick={onToggle} compact><Pause size={13} /></MiniBtn>
          <MiniBtn onClick={onDelete} danger><Trash2 size={13} /></MiniBtn>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 12 }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: C.amber }}>Paused</span>
          <div style={{ flex: 1 }} />
          <MiniBtn onClick={onResume} compact><Play size={13} /></MiniBtn>
          <MiniBtn onClick={onDelete} danger><Trash2 size={13} /></MiniBtn>
        </div>
      )}
      {bucket === 'active' && (
        <>
          <div onClick={() => setOpen((o) => !o)} style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 11, paddingTop: 11, borderTop: `1px solid ${C.line}`, fontSize: 12, fontWeight: 600, color: C.green, cursor: 'pointer' }}>
            <Info size={13} /> What you&apos;re paying for
            <ChevronDown size={15} style={{ marginLeft: 'auto', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
          </div>
          {open && (
            <div style={{ marginTop: 11, border: `1px solid ${C.line}`, borderRadius: 12, overflow: 'hidden' }}>
              {[
                { k: 'What you get', v: t.why || `${t.title}, run for you every week.` },
                { k: 'Who runs it', v: t.lane === 'done_for_you' ? 'Your strategist produces, schedules and posts it — you only approve.' : 'You run this one yourself; we just track how it does.' },
                { k: "How we'll know it's working", v: SIGNAL_COPY[t.metric] || `We track your ${t.metric}.` },
              ].map((row, i) => (
                <div key={row.k} style={{ padding: '11px 13px', borderTop: i ? `1px solid ${C.line}` : 'none', background: '#fcfcfb' }}>
                  <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: C.green, marginBottom: 4 }}>{row.k}</div>
                  <div style={{ fontSize: 12.5, color: C.ink, lineHeight: 1.5 }}>{row.v}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function SwapSheet({ line, options, nextLabel, onPick, onClose }: { line: Tactic; options: Service[]; nextLabel: string; onPick: (s: Service) => void; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,.4)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: '22px 22px 0 0', padding: '18px 20px 24px', maxHeight: '80%', overflowY: 'auto' }}>
        <div style={{ width: 36, height: 4, borderRadius: 99, background: C.line, margin: '0 auto 14px' }} />
        <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 19, marginBottom: 4 }}>Swap {line.title}</div>
        <p style={{ fontSize: 12.5, color: C.mute, lineHeight: 1.5, margin: '0 0 16px' }}>Redirect the same ${line.cost}/mo. {line.title} runs through this month; your pick starts in {nextLabel}. Nothing&apos;s charged now.</p>
        {options.length === 0 ? (
          <div style={{ fontSize: 13, color: C.faint, textAlign: 'center', padding: '20px 0' }}>No same-or-lower-price options available right now.</div>
        ) : options.map((s) => {
          const Icon = METRIC_ICON[s.metric] || MousePointerClick
          return (
            <div key={s.id} onClick={() => onPick(s)} style={{ display: 'flex', alignItems: 'center', gap: 12, border: `1px solid ${C.line}`, borderRadius: 14, padding: '13px 14px', marginBottom: 9, cursor: 'pointer' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 3 }}>{s.title}</div>
                <div style={{ fontSize: 12.5, color: C.mute, display: 'flex', alignItems: 'center', gap: 4 }}>{s.cost === 0 ? 'Free' : `$${s.cost}/mo`} · <Icon size={12} color={C.green} /> grows <b style={{ color: C.ink, fontWeight: 600 }}>{s.metric}</b></div>
              </div>
              <ChevronRight size={18} color={C.faint} />
            </div>
          )
        })}
        <button onClick={onClose} style={{ width: '100%', marginTop: 6, background: '#fff', color: C.mute, border: `1px solid ${C.line}`, borderRadius: 12, padding: 12, fontWeight: 600, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><X size={15} />Cancel</button>
      </div>
    </div>
  )
}
