'use client'
/**
 * THE MONTH, DRAWN AS THE HOME FUNNEL (owner 2026-09-19 "incorporate the circles and people" →
 * "let's try it"; 2026-09-21 "separate it, estimates, show the services, it feels dead").
 * ==========================================================================================
 * Home shows now. This page shows one month in one of three states, and says which:
 *   Plan October   the draft. Each ring says what the month ADDS, as an estimate ("+about 15k"),
 *                  with now in small type. Tap a ring for the arithmetic, the pieces, and Add.
 *   October, on    the month is running. The solid ring is what has happened so far inside the
 *                  dashed planned one; every piece is coming, with the team, or done.
 *   October        the recap: actual against planned, one line on what did it.
 * The people mill and float like Home's, and a trickle walks the path between rings. Under the
 * funnel, the services: every piece by week, with its date and price, the receipt for the total.
 * Start makes it real; every paid piece is approved before it is charged.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowRight, Check, ChevronLeft, ChevronRight, Loader2, X, Plus } from 'lucide-react'
import { C, DISPLAY } from '../tokens'
import { Drawing, DRAW_CSS, type Scene } from '../create/drawings'
import PlanCrowd, { type CrowdRing } from './plan-crowd'

type Stage = 'aware' | 'interest' | 'action' | 'order' | 'keep'
type Kind = 'post' | 'graphic' | 'reel' | 'photos' | 'creator' | 'boost' | 'print' | 'offer' | 'review' | 'taste' | 'sign' | 'team'
type Lean = 'seen' | 'asis' | 'in'
interface Slot { id?: string; date: string; stage: Stage; kind: Kind; label: string; options: Record<string, unknown>; cents: number; status: string; ref?: { kind: string; id: string | null; href?: string } | null; why?: string | null }
interface StagePlan { stage: Stage; label: string; now: number | null; planned: number | null; add: number | null; basis: string | null; unit: string; lever: string | null; levers: string[] }
interface Tile { kind: Kind; stage: Stage; label: string; cents: number; date: string; why: string | null }
interface Month { month: string; status: string; thesis: string; subject: string | null; lean: Lean; baseline: Record<Stage, number | null>; stages: StagePlan[]; slots: Slot[]; total: number; budgetCents: number | null; creator: { slug: string; name: string; nearby: number | null; fromCents: number | null; date: string | null } | null; facts: { usualReach: number | null; reelLift: number | null; reviews30: number | null; budgetCents: number | null; locations: number }; tiles: Tile[] }
interface Rhythm { posts_week: number; graphics_week: number; reels_month: number; shoots_month: number; creator_quarter: number }
interface SeasonMonth { month: string; status: string; total: number; subject: string | null; pieces: number; occasions: { id: string; name: string; emoji: string; date: string }[] }
interface Read { month: Month; off: boolean; actual: Record<Stage, number | null> | null; elapsed: number; days: number; next: string; season: SeasonMonth[]; rhythm: Rhythm; rhythmSet: boolean }

const HUE: Record<Stage, string> = { aware: '#2e9a78', interest: '#3b6fd4', action: '#6a39de', order: '#d99a1e', keep: '#0f97a8' }
const SCENE: Record<Kind, Scene> = { post: 'post', graphic: 'graphic', reel: 'reel', photos: 'photos', creator: 'creator', boost: 'boost', print: 'print', offer: 'offer', review: 'review', taste: 'dish', sign: 'sticky', team: 'grid' }
/* Home's geometry (home-funnel.tsx layout): the mouth ring biggest, tapering [1,.8,.7,.64,.6];
   even stations swing right and odd swing left, the top pair wider; the number sits on the
   opposite side. Drawn in a 430×800 space that scales to the page width. */
const W = 430, H = 800, RTOP = 76
const RING = ([1, .8, .7, .64, .6] as const).map((ratio, i) => { const lean = i % 2 === 0 ? 1 : -1; return { stage: (['aware', 'interest', 'action', 'order', 'keep'] as Stage[])[i], cx: W / 2 + lean * 72 * (i <= 1 ? 1.34 : 1), cy: 90 + i * 158, r: RTOP * ratio, side: (i % 2 === 0 ? 'L' : 'R') as 'L' | 'R' } })
const PATH = RING.map((p, i) => (i === 0 ? `M${p.cx} ${p.cy}` : `C${RING[i - 1].cx} ${RING[i - 1].cy + 80} ${p.cx} ${p.cy - 80} ${p.cx} ${p.cy}`)).join(' ')
const MAXP = [34, 18, 9, 5, 3]
const KIND_STAGE: Record<Kind, Stage> = { post: 'aware', boost: 'aware', creator: 'aware', reel: 'interest', graphic: 'interest', photos: 'interest', offer: 'action', taste: 'action', sign: 'action', print: 'action', review: 'keep', team: 'keep' }
const monthAfter = (m: string) => { const [y, mo] = m.split('-').map(Number); return `${mo === 12 ? y + 1 : y}-${String(mo === 12 ? 1 : mo + 1).padStart(2, '0')}` }
const MONTH_NAME = (m: string) => new Date(m + '-01T12:00:00').toLocaleDateString('en-US', { month: 'long' })
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dt = (iso: string) => new Date(iso + 'T12:00:00')
const niceDate = (iso: string) => { const d = dt(iso); return `${WD[d.getDay()]} ${d.getDate()}` }
const dollars = (c: number) => `$${Math.round(c / 100).toLocaleString()}`
const fmt = (n: number | null) => (n == null ? '—' : n >= 10000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k` : n.toLocaleString())
/** an estimate, said like one: rounded, never exact */
const about = (n: number | null) => (n == null ? '—' : n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(Math.round(n / 100) / 10).toFixed(1)}k` : n >= 100 ? String(Math.round(n / 10) * 10) : String(Math.round(n)))
const people = (n: number | null, max: number) => (n == null || n <= 0 ? 3 : Math.max(3, Math.min(max, Math.round(6 * Math.log10(n + 1)))))
const weekOf = (iso: string) => { const d = dt(iso); d.setDate(d.getDate() - d.getDay()); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

export default function PlanMonthPage({ clientId, month: monthParam, navBottom = 0, extraTabs = [] }: { clientId: string; month: string | null; /** px the bottom nav takes, so the drawer rests above it */ navBottom?: number; /** more drawer tabs from the page around it (the calendar, the campaigns that ran) */ extraTabs?: { key: string; label: string; render: () => React.ReactNode }[] }) {
  const [data, setData] = useState<Read | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [lean, setLean] = useState<Lean>('asis')
  const [drop, setDrop] = useState<string[]>([])
  const [add, setAdd] = useState<{ kind: Kind; date?: string }[]>([])
  const [open, setOpenRaw] = useState<Stage | null>(null)
  const [openBase, setOpenBase] = useState<number | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [subject, setSubject] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [day, setDay] = useState<string | null>(null)
  const [drawer, setDrawer] = useState(false)
  const [tab, setTab] = useState<string>('pieces')
  const [rh, setRh] = useState<Rhythm | null>(null)
  /* the funnel fits the screen like Home: as tall as the room between the header and the
     bottom block, never wider than the page */
  const wrap = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 398, h: 740 })
  useEffect(() => {
    const el = wrap.current; if (!el) return
    const fit = () => { const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return; const bh = Math.min(h, w * H / W); setBox({ w: bh * W / H, h: bh }) }
    fit(); const ro = new ResizeObserver(fit); ro.observe(el); return () => ro.disconnect()
  }, [data])
  const dragY = useRef<number | null>(null)
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  const [started, setStarted] = useState<{ minted: number; errors: string[] } | null>(null)
  const qs = (o: Record<string, string | undefined>) => Object.entries(o).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v!)}`).join('&')
  const load = (l = lean, d = drop, a = add, sub = subject) => fetch(`/api/dashboard/plan-month?${qs({ clientId, month: monthParam ?? undefined, lean: l, subject: sub ?? undefined, drop: d.join(',') || undefined, add: a.map((x) => `${x.kind}:${x.date ?? ''}`).join(',') || undefined })}`, { cache: 'no-store' }).then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Could not read the month'); setData(j as Read); setLean((j as Read).month.lean); if ((j as Read).month.subject && subject == null) setSubject((j as Read).month.subject) }).catch((e) => setErr(e instanceof Error ? e.message : 'Could not read the month'))
  useEffect(() => { load() }, [clientId, monthParam]) // eslint-disable-line react-hooks/exhaustive-deps
  const m = data?.month ?? null
  const stageOf = useMemo(() => Object.fromEntries((m?.stages ?? []).map((s) => [s.stage, s])) as Record<Stage, StagePlan | undefined>, [m])
  const setOpen = (st: Stage | null) => { setOpenRaw(st); setOpenBase(st ? stageOf[st]?.add ?? null : null) }
  const on = (m?.slots ?? []).filter((s) => s.status !== 'removed' && s.status !== 'rolled')
  const actual = data?.actual ?? null
  const state: 'draft' | 'on' | 'done' = !m ? 'draft' : m.status === 'done' || (m.status === 'started' && data != null && data.elapsed >= data.days) ? 'done' : m.status === 'started' ? 'on' : 'draft'
  const live = state !== 'draft'
  /* the crowd: what is there now, and (lighter, arriving) what the month adds */
  const rings = useMemo<CrowdRing[]>(() => RING.map((p, i) => { const s = stageOf[p.stage]; const base = state === 'draft' ? s?.now ?? null : actual?.[p.stage] ?? s?.now ?? null; const n = people(base, MAXP[i]); const planned = people(s?.planned ?? null, MAXP[i]); return { cx: p.cx, cy: p.cy, r: p.r, n, color: HUE[p.stage], extra: state === 'draft' ? Math.max(0, planned - n) : 0 } }), [stageOf, actual, state])

  const saveSubject = async (v: string) => {
    const sub = v.trim().slice(0, 80) || null
    setEditing(false); setSubject(sub)
    if (live) { setBusy('subject'); await post({ action: 'subject', subject: sub }); setBusy(null); return }
    setBusy('subject'); await load(lean, drop, add, sub); setBusy(null)
  }
  const saveRhythm = async (r: Rhythm) => { setRh(r); setBusy('rhythm'); const j = await post({ action: 'rhythm', rhythm: r }); if (j?.ok) await load(); setBusy(null) }
  const relean = (l: Lean) => { setLean(l); setBusy('lean'); load(l, drop, add).finally(() => setBusy(null)) }
  const dropSlot = async (s: Slot) => {
    if (live) { setBusy(s.id ?? ''); await post({ action: 'drop', key: s.id ?? `${s.kind}:${s.date}` }); setBusy(null); return }
    const d = [...drop, `${s.kind}:${s.date}`]; const a = add.filter((x) => !(x.kind === s.kind && (x.date ?? '') === s.date)); setDrop(d); setAdd(a); setBusy('edit'); await load(lean, d, a); setBusy(null)
  }
  const addSlot = async (t: Tile) => {
    if (live) { setBusy(t.kind); await post({ action: 'add', kind: t.kind, date: t.date }); setBusy(null); return }
    const a = [...add, { kind: t.kind, date: t.date }]; setAdd(a); setBusy(t.kind); await load(lean, drop, a); setBusy(null)
  }
  const post = async (body: Record<string, unknown>) => {
    setErr(null)
    try {
      const r = await fetch('/api/dashboard/plan-month', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, month: m?.month, ...body }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Could not save it')
      if (j.month) setData((d) => (d ? { ...d, month: j.month } : d))
      return j
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save it'); return null }
  }
  const start = async () => { setBusy('start'); const j = await post({ action: 'start', lean, drop, add, subject }); if (j?.ok) { setStarted({ minted: j.minted, errors: j.errors ?? [] }); setConfirm(false); load() } setBusy(null) }

  const h1: React.CSSProperties = { fontFamily: DISPLAY, fontSize: 24, fontWeight: 600, letterSpacing: '-.04em', lineHeight: 1, margin: 0, whiteSpace: 'nowrap' }
  const k2: React.CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: C.mute, margin: '18px 0 0' }
  const cta: React.CSSProperties = { marginTop: 12, width: '100%', height: 52, borderRadius: 99, border: 0, background: C.ink, color: '#fff', fontWeight: 700, fontSize: 15, font: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', cursor: 'pointer', boxSizing: 'border-box' }
  const tile = (bg: string, dashed = false): React.CSSProperties => ({ borderRadius: 16, padding: '12px 6px 10px', textAlign: 'center', background: bg, border: dashed ? '1.5px dashed #c9c9d0' : 0, position: 'relative', font: 'inherit', color: C.ink, cursor: 'pointer' })
  const est = <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', padding: '2px 6px', borderRadius: 99, background: '#f2f2f5', color: C.mute, verticalAlign: 'middle' }}>estimate</span>
  const chip = (s: Slot) => { const st = s.status === 'done' ? ['done', C.greenSoft, C.greenDk] : s.status === 'minted' ? ['with the team', C.greenSoft, C.greenDk] : state === 'on' ? ['coming', '#f2f2f5', C.mute] : null; return st ? <span style={{ fontSize: 10.5, fontWeight: 800, padding: '3px 8px', borderRadius: 99, background: st[1], color: st[2], whiteSpace: 'nowrap' }}>{st[0]}</span> : null }

  if (err && !data) return <div className="cr" style={{ padding: 24, color: '#c92d32', fontSize: 13 }}>{err}</div>
  if (!m || !data) return <div style={{ padding: 40, textAlign: 'center', color: C.mute }}><Loader2 size={18} className="mvp-spin" /></div>

  const name = MONTH_NAME(m.month)
  const title = state === 'draft' ? `Plan ${name}` : state === 'on' ? `${name}, on` : name
  const subtitle = state === 'draft' ? m.thesis : state === 'on' ? `Day ${data.elapsed} of ${data.days}. ${on.filter((s) => s.status === 'done').length} done, ${on.filter((s) => s.status === 'minted').length} with the team.` : 'What it did.'
  const advice = (() => {
    const a = stageOf.aware, ac = stageOf.action
    const heavy = a?.add != null && ac?.add != null && a.add > ac.add * 20
    if (state === 'done' && actual) { const s = m.stages.map((x) => ({ x, d: actual[x.stage] != null && x.planned ? (actual[x.stage]! - x.planned) / x.planned : null })).filter((y) => y.d != null).sort((p, q) => Math.abs(q.d!) - Math.abs(p.d!))[0]; return s ? <><b style={{ color: C.ink }}>{s.x.label} {s.d! >= 0 ? 'beat' : 'missed'} the plan by {Math.round(Math.abs(s.d!) * 100)}%.</b> {s.d! >= 0 ? `${s.x.lever ?? 'The pieces'} did it.` : 'Next month leans in.'}</> : <b style={{ color: C.ink }}>The month ran.</b> }
    if (state === 'on') return <><b style={{ color: C.ink }}>Solid is what has happened so far.</b> Dashed is the plan.</>
    return <><b style={{ color: C.ink }}>{heavy ? 'Heavy at the top, thin at Actions.' : m.facts.reelLift ? `Your Reels do ${m.facts.reelLift}× your photos.` : 'Built from what you have.'}</b> {m.lean === 'in' ? 'Leaning in on the slow night.' : m.lean === 'seen' ? 'Leaning on being seen.' : 'Numbers are estimates from your own posts.'}</>
  })()
  /* the month as deliverables, the owner's own part, and the money by kind */
  const count = (k: Kind) => on.filter((x) => x.kind === k).length
  const shoot = on.find((x) => x.kind === 'photos'); const creator = on.find((x) => x.kind === 'creator'); const offer = on.find((x) => x.kind === 'offer')
  const photosN = shoot ? (((shoot.options.list as string[]) ?? []).length <= 2 ? 15 : ((shoot.options.list as string[]) ?? []).length <= 4 ? 25 : 40) : 0
  const getting: [number, string, Kind][] = ([[count('post'), 'posts', 'post'], [count('graphic'), count('graphic') === 1 ? 'graphic' : 'graphics', 'graphic'], [count('reel'), count('reel') === 1 ? 'Reel' : 'Reels', 'reel'], [photosN, 'photos', 'photos'], [count('creator'), count('creator') === 1 ? 'creator post' : 'creator posts', 'creator'], [count('boost'), count('boost') === 1 ? 'boost' : 'boosts', 'boost'], [count('print'), count('print') === 1 ? 'table tent' : 'table tents', 'print']] as [number, string, Kind][]).filter(([n]) => n > 0)
  const needs: [string, string][] = [
    ...(shoot ? [[`Be there ${niceDate(shoot.date)} for the shoot`, 'Have the dishes ready to plate. About two hours.'] as [string, string]] : []),
    ...(creator ? [[`Host ${creator.label.replace(/ visits$/, '')} on ${niceDate(creator.date)}`, 'A table for two, the meal on the house.'] as [string, string]] : []),
    ...(count('post') ? [['Approve the posts once a week', 'A few minutes in Approvals. Nothing goes out without your OK.'] as [string, string]] : []),
    ...(offer ? [[`Put the ${offer.label.toLowerCase()} on the board`, 'And tell the team the code.'] as [string, string]] : []),
    ...(count('taste') ? [['A taste at the counter, the first week', 'One bite of the special for whoever is waiting.'] as [string, string]] : []),
    ...(count('review') ? [['Ask happy tables for a review', 'The card says how. Two a week is plenty.'] as [string, string]] : []),
  ]
  const sum = (ks: Kind[]) => on.filter((x) => ks.includes(x.kind)).reduce((a, x) => a + x.cents, 0)
  const byKind: [string, number, string][] = ([['The shoot day', sum(['photos']), 'Paid before the day'], ['Graphics, Reels and print', sum(['graphic', 'reel', 'print']), 'Each one as you approve it'], ['The creator', sum(['creator']), 'When they say yes'], ['Boosts', sum(['boost']), 'When the post runs']] as [string, number, string][]).filter(([, c]) => c > 0)
  /* the services, by week */
  const weeks = (() => { const g = new Map<string, Slot[]>(); for (const s of on) { const k = weekOf(s.date); g.set(k, [...(g.get(k) ?? []), s]) } return [...g.entries()].sort(([a], [b]) => a.localeCompare(b)) })()

  const funnel = (
      <div ref={wrap} style={{ flex: 1, minHeight: 0, width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', margin: '2px 0 0' }}>
      <div style={{ position: 'relative', width: box.w, height: box.h }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          <path className={state === 'done' ? undefined : 'pm-path'} d={PATH} fill="none" stroke={HUE.aware} strokeOpacity=".45" strokeWidth="1.8" strokeDasharray="3 5" />
          {RING.map((p) => {
            const s = stageOf[p.stage]; const c = HUE[p.stage]
            const act = actual?.[p.stage] ?? null
            const empty = state === 'draft' ? s?.add == null && s?.now == null : act == null
            const ratio = live && act != null && s?.planned ? Math.max(.25, Math.min(1.5, Math.sqrt(act / s.planned))) : null
            const nx = p.side === 'L' ? 150 : W - 150
            return (
              <g key={p.stage} className="pm-ring" onClick={() => setOpen(p.stage)}>
                <line x1={nx} y1={p.cy} x2={p.side === 'L' ? p.cx - p.r - 4 : p.cx + p.r + 4} y2={p.cy} stroke={c} strokeOpacity=".28" strokeWidth=".8" />
                <circle cx={p.side === 'L' ? p.cx - p.r - 4 : p.cx + p.r + 4} cy={p.cy} r="2" fill={c} fillOpacity=".6" />
                <circle cx={p.cx} cy={p.cy} r={p.r + 14} fill="transparent" />
                <circle cx={p.cx} cy={p.cy} r={p.r} fill={empty ? '#f6f6f8' : '#fff'} stroke={c} strokeOpacity={empty ? .5 : 1} strokeWidth="1.6" strokeDasharray={state === 'draft' ? '4 5' : undefined} />
                {ratio != null && <circle cx={p.cx} cy={p.cy} r={p.r * ratio} fill={c + '14'} stroke={c} strokeWidth="1.6" />}
                <path d={`M${W - 16} ${p.cy - 6} L${W - 10} ${p.cy} L${W - 16} ${p.cy + 6}`} fill="none" stroke={c} strokeOpacity=".45" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </g>
            )
          })}
        </svg>
        <PlanCrowd rings={rings} flow={state !== 'done'} W={W} H={H} />
        {RING.map((p, i) => { const s = stageOf[p.stage]; const c = HUE[p.stage]; const act = actual?.[p.stage] ?? null
          const big = state === 'draft' ? s?.now : act
          const chip = state === 'draft' ? (s?.add != null ? [`+${about(s.add)}`, c] : null) : state === 'on' ? (s?.planned != null ? [`of ${about(s.planned)}`, C.mute] : null) : (act != null && s?.planned ? [`${act >= s.planned ? '▲' : '▼'}${Math.round(Math.abs(act - s.planned) / s.planned * 100)}%`, act >= s.planned ? C.greenDk : '#c92d32'] : null)
          const k = box.w / W
          return (
          <div key={p.stage} className="pm-num" onClick={() => setOpen(p.stage)} style={{ position: 'absolute', [p.side === 'L' ? 'left' : 'right']: '3%', top: `${(p.cy - 34) / H * 100}%`, width: '37%', textAlign: p.side === 'R' ? 'right' : 'left', cursor: 'pointer', animationDelay: `${i * 90}ms` }}>
            <div style={{ fontSize: Math.round(14 * k), color: C.mute, fontWeight: 600, letterSpacing: '-.01em' }}>{s?.label ?? p.stage}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, justifyContent: p.side === 'R' ? 'flex-end' : 'flex-start', flexDirection: p.side === 'R' ? 'row-reverse' : 'row' }}>
              <b style={{ fontFamily: DISPLAY, fontSize: Math.round(40 * k), fontWeight: 600, letterSpacing: '-.5px', color: big == null ? C.faint : C.ink, lineHeight: 1 }}>{big == null ? (state === 'draft' && s?.add != null ? `+${about(s.add)}` : '—') : fmt(big)}</b>
              {chip && big != null && <span style={{ fontSize: Math.round(13 * k), fontWeight: 700, color: chip[1], whiteSpace: 'nowrap' }}>{chip[0]}</span>}
            </div>
            <div style={{ fontSize: Math.round(11 * k), color: C.mute, fontWeight: 600, marginTop: 4 }}>{state === 'draft' ? (s?.add != null ? `+${about(s.add)} ${s.unit} · estimate` : 'nothing planned') : state === 'on' ? `so far · ${s?.unit ?? ''}` : `the month · ${s?.unit ?? ''}`}</div>
          </div>) })}
        {state !== 'done' && RING.slice(0, 4).map((p, i) => { const s = stageOf[p.stage]; if (!s?.lever) return null; const y = (p.cy + RING[i + 1].cy) / 2; const kk = box.w / W; return <span key={p.stage} className="pm-num" style={{ position: 'absolute', left: '50%', top: `${y / H * 100}%`, transform: 'translate(-50%,-50%)', fontSize: Math.max(10, Math.round(12 * kk)), fontWeight: 700, padding: `${Math.max(3, Math.round(5 * kk))}px ${Math.max(7, Math.round(11 * kk))}px`, borderRadius: 99, background: C.greenSoft, color: C.greenDk, whiteSpace: 'nowrap', maxWidth: '52%', overflow: 'hidden', textOverflow: 'ellipsis', animationDelay: `${300 + i * 90}ms` }}>{s.lever}</span> })}
        {state !== 'done' && RING.map((p, i) => {
          const beads = on.filter((s) => s.stage === p.stage).reduce<Slot[]>((acc, s) => (acc.some((x) => x.kind === s.kind) ? acc : [...acc, s]), []).slice(0, 4)
          return beads.map((b, j) => { /* on the ring's OUTER side, clear of the levers in the middle and the number opposite */ const right = p.cx > W / 2; const deg = right ? [-30, 30, 90, 150][j] : [210, 150, 90, 30][j]; const ang = deg * Math.PI / 180; const x = p.cx + Math.cos(ang) * p.r * .98, y = p.cy + Math.sin(ang) * p.r * .98; return (
            <span key={b.kind} className="pm-bead" onClick={() => setOpen(p.stage)} style={{ position: 'absolute', left: `${x / W * 100}%`, top: `${y / H * 100}%`, width: Math.max(20, Math.round(28 * box.w / W)), height: Math.max(20, Math.round(28 * box.w / W)), borderRadius: 99, background: '#fff', border: `1.6px solid ${HUE[p.stage]}`, display: 'grid', placeItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,.10)', ['--c2' as string]: HUE[p.stage], cursor: 'pointer', animationDelay: `${500 + i * 120 + j * 70}ms` }}><span style={{ width: Math.max(12, Math.round(16 * box.w / W)), display: 'block' }}><Drawing spec={{ scene: SCENE[b.kind] }} now={b.status === 'done'} name="" rating="" t={(s) => s} /></span></span>) })
        })}
      </div>
      </div>
  )

  const row = (s: Slot | null, label: string, sub: string, cents: number, stage: Stage, kind: Kind, canDrop: boolean) => (
    <div key={s?.id ?? `${kind}:${label}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: `0.5px solid ${C.line}`, fontSize: 13.5, fontWeight: 600 }}>
      <span style={{ width: 30, flex: 'none', ['--c2' as string]: HUE[stage] }}><Drawing spec={{ scene: SCENE[kind] }} now={s?.status === 'done'} name="" rating="" t={(x) => x} /></span>
      <span style={{ flex: 1, minWidth: 0 }}>{label}<small style={{ display: 'block', fontWeight: 500, color: C.mute, fontSize: 11.5, marginTop: 1 }}>{sub}</small></span>
      {s && chip(s)}
      <span style={{ fontSize: 12.5, color: cents ? C.ink : C.mute, fontWeight: 700, width: 46, textAlign: 'right' }}>{cents ? dollars(cents) : 'Free'}</span>
      {canDrop && s && <button type="button" aria-label="Take it off" disabled={busy != null} onClick={() => dropSlot(s)} style={{ width: 24, height: 24, borderRadius: 99, border: `0.5px solid ${C.line}`, background: '#fff', color: C.mute, display: 'grid', placeItems: 'center', cursor: 'pointer', flex: 'none' }}>{busy === (s.id ?? '') ? <Loader2 size={10} className="mvp-spin" /> : <X size={11} />}</button>}
    </div>
  )
  const allMonth = (s: Slot) => s.kind === 'taste' || s.kind === 'review' || s.kind === 'team'
  const prevMonth = (mm: string) => { const [y, mo] = mm.split('-').map(Number); return `${mo === 1 ? y - 1 : y}-${String(mo === 1 ? 12 : mo - 1).padStart(2, '0')}` }
  const go = (mm: string) => { window.location.href = `${window.location.pathname}?clientId=${clientId}&month=${mm}` }

  const summary = getting.slice(0, 4).map(([n, w]) => `${n} ${w}`).join(' · ') + (m.creator && on.some((x) => x.kind === 'creator') ? ` · ${m.creator.name.split(' ')[0]}` : '')
  return (
    <div className="cr" style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '2px 16px 0', boxSizing: 'border-box', color: C.ink, maxWidth: 480, margin: '0 auto', width: '100%' }}>
      <style>{DRAW_CSS}{`.pm-ring{cursor:pointer}@keyframes pm-in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}.pm-in{animation:pm-in .24s cubic-bezier(.2,.7,.2,1)}@keyframes pm-flow{to{stroke-dashoffset:-16}}.pm-path{animation:pm-flow 1.6s linear infinite}@keyframes pm-pop{0%{transform:translate(-50%,-50%) scale(.4);opacity:0}70%{transform:translate(-50%,-50%) scale(1.12)}100%{transform:translate(-50%,-50%) scale(1);opacity:1}}.pm-bead{animation:pm-pop .5s cubic-bezier(.2,.7,.2,1) both}@keyframes pm-up{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}.pm-num{animation:pm-up .6s cubic-bezier(.2,.7,.2,1) both}.pm-drawer{transition:transform .32s cubic-bezier(.2,.7,.2,1)}.pm-chips{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none}.pm-chips::-webkit-scrollbar{display:none}@media(prefers-reduced-motion:reduce){.pm-in,.pm-path,.pm-bead,.pm-num{animation:none}.pm-drawer{transition:none}}`}</style>

      {/* the month and its subject on the left; the lean on the right, the way Home keeps its range */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flex: 'none' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1 style={h1}>{title}</h1>
          {editing
            ? <input autoFocus defaultValue={m.subject ?? ''} placeholder="Fall menu, Halloween…" maxLength={80} onBlur={(e) => saveSubject(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(false) }} style={{ display: 'block', marginTop: 4, width: '100%', font: 'inherit', fontSize: 13, fontWeight: 600, padding: '5px 10px', borderRadius: 10, border: `1px solid ${C.ink}`, color: C.ink, boxSizing: 'border-box' }} />
            : <small onClick={() => { if (state === 'draft') setEditing(true) }} style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.mute, marginTop: 3, lineHeight: 1.3, cursor: state === 'draft' ? 'text' : 'default', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{state === 'draft' ? (m.subject ?? <span style={{ color: C.faint }}>What is {name} about? Tap to say.</span>) : subtitle}</small>}
        </div>
        {state === 'draft' && (
          <div style={{ display: 'flex', gap: 2, padding: 3, borderRadius: 99, background: '#f2f2f5', flex: 'none' }}>
            {([['seen', 'Seen'], ['asis', 'As is'], ['in', 'In']] as [Lean, string][]).map(([kk, l]) => <button key={kk} type="button" disabled={busy != null} onClick={() => relean(kk)} style={{ fontSize: 11.5, fontWeight: 800, padding: '6px 9px', borderRadius: 99, border: 0, background: lean === kk ? '#fff' : 'transparent', color: lean === kk ? C.ink : C.mute, boxShadow: lean === kk ? '0 1px 3px rgba(0,0,0,.12)' : 'none', font: 'inherit', cursor: 'pointer' }}>{busy === 'lean' && lean === kk ? <Loader2 size={11} className="mvp-spin" /> : l}</button>)}
          </div>
        )}
      </div>

      {/* the season: this month and the two after it, with their holidays. Also how you move between months. */}
      {data.season?.length > 1 && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flex: 'none' }}>
          {data.season.map((sm) => { const here = sm.month === m.month; const st = sm.status === 'started' ? 'on' : sm.status === 'done' ? 'done' : 'draft'; return (
            <button key={sm.month} type="button" onClick={() => { if (!here) go(sm.month) }} style={{ flex: 1, minWidth: 0, textAlign: 'left', font: 'inherit', border: 0, background: here ? C.ink : '#f6f6f8', color: here ? '#fff' : C.ink, borderRadius: 12, padding: '6px 9px', cursor: here ? 'default' : 'pointer' }}>
              <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 4 }}><b style={{ fontSize: 12.5 }}>{MONTH_NAME(sm.month).slice(0, 3)}</b><small style={{ fontSize: 10, fontWeight: 700, color: here ? 'rgba(255,255,255,.7)' : st === 'on' ? C.greenDk : C.mute }}>{st === 'on' ? 'on' : st === 'done' ? 'done' : sm.total ? dollars(sm.total) : ''}</small></span>
              <span style={{ display: 'block', fontSize: 11, marginTop: 1, color: here ? 'rgba(255,255,255,.75)' : C.mute, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sm.occasions.length ? sm.occasions.map((o) => `${o.emoji} ${o.name}`).join(' · ') : sm.subject ?? `${sm.pieces} pieces`}</span>
            </button>) })}
        </div>
      )}

      {funnel}

      <div style={{ fontSize: 12, color: C.mute, textAlign: 'center', lineHeight: 1.35, flex: 'none', padding: '2px 0 0', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{advice}</div>
      {data.off && <div style={{ marginTop: 4, fontSize: 12, color: '#8a5a0c', fontWeight: 600, textAlign: 'center', flex: 'none' }}>Not switched on yet. The team has to run one update first.</div>}
      {err && <div style={{ fontSize: 12.5, color: '#c92d32', marginTop: 4, textAlign: 'center', flex: 'none' }}>{err}</div>}
      {started && <div className="pm-in" style={{ marginTop: 6, border: `0.5px solid ${C.line}`, borderRadius: 14, padding: '8px 12px', fontSize: 12.5, lineHeight: 1.4, flex: 'none' }}><b>{name} is on.</b> {started.minted} thing{started.minted === 1 ? '' : 's'} went to the team. Graphics and Reels follow a week before their date.{started.errors.map((e, i) => <div key={i} style={{ color: '#8a5a0c', marginTop: 4 }}>{e}</div>)}</div>}
      <div style={{ flex: 'none', padding: navBottom ? '8px 0 74px' : '8px 0 calc(72px + env(safe-area-inset-bottom))' }}>
        {state === 'done' ? <a href={`?clientId=${clientId}&month=${monthAfter(m.month)}`} style={{ ...cta, marginTop: 0, textDecoration: 'none' }}><span>Plan {MONTH_NAME(monthAfter(m.month))}</span><ArrowRight size={18} /></a>
          : state === 'on' ? <a href={`/dashboard?clientId=${clientId}`} style={{ ...cta, marginTop: 0, textDecoration: 'none' }}><span>See it on Home</span><ArrowRight size={18} /></a>
          : <button type="button" disabled={busy != null || data.off} onClick={() => setConfirm(true)} style={{ ...cta, marginTop: 0, opacity: data.off ? .5 : 1 }}><span>Start {name}</span><span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}><span style={{ fontWeight: 600, opacity: .8 }}>{dollars(m.total)}</span><ArrowRight size={18} /></span></button>}
      </div>

      {/* the drawer: pieces, days, money. Rests on the bottom edge; pull it up. Portaled to the
         body so 'fixed' means the screen, not the shell's transformed frame. */}
      {mounted && createPortal(<>
      {drawer && <div onClick={() => setDrawer(false)} style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(20,22,26,.25)' }} />}
      <div className="pm-drawer" style={{ position: 'fixed', left: 0, right: 0, bottom: navBottom ? `calc(${navBottom}px + env(safe-area-inset-bottom))` : 0, zIndex: 71, display: 'flex', justifyContent: 'center', transform: drawer ? 'none' : `translateY(calc(100% - 66px${navBottom ? '' : ' - env(safe-area-inset-bottom)'}))`, pointerEvents: 'none' }}>
        <div className="cr" style={{ width: '100%', maxWidth: 480, height: navBottom ? `calc(76dvh - ${navBottom}px)` : '76dvh', background: '#fff', borderRadius: navBottom ? 22 : '22px 22px 0 0', boxShadow: '0 -8px 30px rgba(0,0,0,.10)', display: 'flex', flexDirection: 'column', pointerEvents: 'auto', boxSizing: 'border-box' }}
          onTouchStart={(e) => { dragY.current = e.touches[0].clientY }} onTouchEnd={(e) => { const y0 = dragY.current; dragY.current = null; if (y0 == null) return; const dy = e.changedTouches[0].clientY - y0; if (dy < -30) setDrawer(true); else if (dy > 30) setDrawer(false) }}>
          <style>{DRAW_CSS}</style>
          <button type="button" onClick={() => setDrawer((v) => !v)} aria-label={drawer ? 'Close' : 'Open'} style={{ border: 0, background: 'none', padding: '8px 16px 0', cursor: 'pointer', width: '100%', font: 'inherit', color: C.ink, textAlign: 'left' }}>
            <span style={{ display: 'block', width: 38, height: 4, borderRadius: 99, background: '#d9d9de', margin: '0 auto' }} />
            {!drawer && <span style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0 8px' }}><span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{summary}</span><span style={{ fontSize: 12.5, fontWeight: 700, color: C.greenDk, display: 'inline-flex', alignItems: 'center', gap: 2, flex: 'none' }}>Details <ChevronRight size={14} /></span></span>}
          </button>
          <div style={{ display: drawer ? 'flex' : 'none', gap: 4, padding: '8px 14px 8px', background: '#f2f2f5', margin: '6px 16px 0', borderRadius: 12 }}>
            {([['pieces', 'Pieces'], ...(extraTabs.some((t) => t.key === 'calendar') ? [] : [['days', 'Days']]), ['money', 'Money'], ['rhythm', 'Rhythm'], ...extraTabs.map((t) => [t.key, t.label])] as [string, string][]).map(([k, l]) => <button key={k} type="button" onClick={() => { setTab(k); setDrawer(true) }} style={{ flex: 1, font: 'inherit', fontSize: extraTabs.length ? 12 : 13, fontWeight: 700, padding: '7px 0', borderRadius: 9, border: 0, background: tab === k ? '#fff' : 'transparent', color: tab === k ? C.ink : C.mute, boxShadow: tab === k ? '0 1px 3px rgba(0,0,0,.10)' : 'none', cursor: 'pointer' }}>{l}</button>)}
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 16px calc(24px + env(safe-area-inset-bottom))', overscrollBehavior: 'contain' }}>
            {tab === 'pieces' && weeks.map(([wk, rows]) => {
              const posts = rows.filter((s) => s.kind === 'post'); const rest = rows.filter((s) => s.kind !== 'post')
              const ds = rows.map((s) => s.date).sort(); const a = dt(ds[0]), b = dt(ds[ds.length - 1]); const label = a.getDate() === b.getDate() ? `${MO[a.getMonth()]} ${a.getDate()}` : `${MO[a.getMonth()]} ${a.getDate()} to ${b.getDate()}`
              return (
                <div key={wk} style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.mute, padding: '6px 0 2px' }}>{label}</div>
                  {posts.length > 0 && row(posts[0], `${posts.length} post${posts.length === 1 ? '' : 's'}`, posts.map((p) => WD[dt(p.date).getDay()]).join(' · '), 0, 'aware', 'post', false)}
                  {rest.map((s) => row(s, `${s.options.emoji ? `${s.options.emoji} ` : ''}${s.label}`, `${allMonth(s) ? 'All month' : niceDate(s.date)}${s.why ? ` · ${s.why}` : ''}`, s.cents, s.stage, s.kind, s.status === 'planned'))}
                </div>
              )
            })}
            {tab === 'pieces' && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0 0', fontSize: 14, fontWeight: 800 }}><span>{name}</span><span>{dollars(m.total)}</span></div>}
            {tab === 'days' && <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, marginTop: 10, textAlign: 'center' }}>
                {WD.map((w) => <span key={w} style={{ fontSize: 10, fontWeight: 700, color: C.faint, padding: '2px 0' }}>{w[0]}</span>)}
                {Array.from({ length: dt(`${m.month}-01`).getDay() }).map((_, i) => <span key={`b${i}`} />)}
                {Array.from({ length: data.days }).map((_, i) => { const iso = `${m.month}-${String(i + 1).padStart(2, '0')}`; const here = on.filter((x) => x.date === iso && !allMonth(x)); const sel = day === iso; const past = state !== 'draft' && i + 1 <= data.elapsed; return (
                  <button key={iso} type="button" onClick={() => setDay(sel ? null : iso)} style={{ font: 'inherit', border: 0, background: sel ? C.ink : 'transparent', color: sel ? '#fff' : past ? C.faint : C.ink, borderRadius: 10, padding: '6px 0 5px', cursor: 'pointer', minHeight: 44 }}>
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 700, lineHeight: 1 }}>{i + 1}</span>
                    <span style={{ display: 'flex', justifyContent: 'center', gap: 2, marginTop: 4, height: 5 }}>{here.slice(0, 4).map((x, j) => <span key={j} style={{ width: 5, height: 5, borderRadius: 99, background: sel ? '#fff' : HUE[x.stage], opacity: x.kind === 'post' ? .45 : 1 }} />)}</span>
                  </button>) })}
              </div>
              {day ? (() => { const here = on.filter((x) => x.date === day); return <div className="pm-in" style={{ marginTop: 10 }}><div style={{ fontSize: 12, fontWeight: 700, color: C.mute, padding: '6px 0 2px' }}>{niceDate(day)}</div>{here.length ? here.map((s) => row(s, s.kind === 'post' ? 'A post' : s.label, s.why ?? (allMonth(s) ? 'All month' : ''), s.cents, s.stage, s.kind, s.status === 'planned' && s.kind !== 'post')) : <div style={{ fontSize: 13, color: C.mute, padding: '8px 0' }}>Nothing planned. Tap a ring to add something.</div>}</div> })() : <div style={{ fontSize: 12, color: C.mute, marginTop: 10, textAlign: 'center' }}>A dot per piece, in the colour of the ring it pushes. Tap a day.</div>}
              {state === 'on' && <div style={{ fontSize: 12, color: C.mute, marginTop: 12, textAlign: 'center' }}>These are on your Calendar too.</div>}
            </>}
            {tab === 'money' && <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 12 }}><b style={{ fontFamily: DISPLAY, fontSize: 28, letterSpacing: '-.03em', fontWeight: 600 }}>{dollars(m.total)}</b>{m.budgetCents ? <span style={{ fontSize: 12.5, color: m.total > m.budgetCents ? '#c92d32' : C.mute, fontWeight: 700 }}>of your {dollars(m.budgetCents)} a month</span> : null}</div>
              {m.budgetCents ? <div style={{ height: 6, borderRadius: 99, background: '#eeeef1', marginTop: 8, overflow: 'hidden' }}><div style={{ width: `${Math.min(100, m.total / m.budgetCents * 100)}%`, height: '100%', background: m.total > m.budgetCents ? '#c92d32' : C.greenDk, borderRadius: 99 }} /></div> : null}
              {byKind.map(([label, cents, when]) => <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: `0.5px solid ${C.line}`, fontSize: 13.5, fontWeight: 600 }}><span style={{ flex: 1 }}>{label}<small style={{ display: 'block', fontWeight: 500, color: C.mute, fontSize: 11.5, marginTop: 1 }}>{when}</small></span><span style={{ fontWeight: 700 }}>{dollars(cents)}</span></div>)}
              <div style={{ fontSize: 12, color: C.mute, marginTop: 10, lineHeight: 1.45 }}>Posts, the taste, the review ask and the team card are free. Nothing is charged today; each paid piece is approved before it is charged.</div>
              {state === 'draft' && <div style={{ fontSize: 12, color: C.mute, marginTop: 8, lineHeight: 1.45 }}>{MONTH_NAME(monthAfter(m.month))} drafts itself near the end of {name}. Nothing starts without you.</div>}
            </>}
            {extraTabs.map((t) => tab === t.key ? <div key={t.key} style={{ margin: '0 -16px' }}>{t.render()}</div> : null)}
            {tab === 'rhythm' && (() => { const r = rh ?? data.rhythm; const step = (k: keyof Rhythm, lo: number, hi: number) => (v: number) => setRh({ ...r, [k]: Math.max(lo, Math.min(hi, v)) }); const rows: [keyof Rhythm, string, string, number, number][] = [['posts_week', 'Posts', 'a week', 0, 7], ['graphics_week', 'Graphics', 'a week', 0, 3], ['reels_month', 'Reels', 'a month', 0, 8], ['shoots_month', 'Shoot days', 'a month', 0, 2], ['creator_quarter', 'Creator visits', 'a quarter', 0, 3]]; const dirty = rh != null && JSON.stringify(rh) !== JSON.stringify(data.rhythm); return (
              <>
                <div style={{ fontSize: 13, color: C.mute, marginTop: 12, lineHeight: 1.45 }}>Set once. Every month starts from this, and the holidays add their own pieces on top. {data.rhythmSet ? 'This is yours.' : 'This is our read of your budget until you change it.'}</div>
                {rows.map(([k, l, unit, lo, hi]) => <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: `0.5px solid ${C.line}`, fontSize: 14, fontWeight: 600 }}><span style={{ flex: 1 }}>{l}<small style={{ display: 'block', fontWeight: 500, color: C.mute, fontSize: 11.5 }}>{unit}</small></span><button type="button" aria-label="Fewer" onClick={() => step(k, lo, hi)(r[k] - 1)} style={{ width: 32, height: 32, borderRadius: 99, border: `1px solid ${C.line}`, background: '#fff', font: 'inherit', fontSize: 16, cursor: 'pointer' }}>−</button><b style={{ width: 22, textAlign: 'center', fontFamily: DISPLAY, fontSize: 18 }}>{r[k]}</b><button type="button" aria-label="More" onClick={() => step(k, lo, hi)(r[k] + 1)} style={{ width: 32, height: 32, borderRadius: 99, border: `1px solid ${C.line}`, background: '#fff', font: 'inherit', fontSize: 16, cursor: 'pointer' }}>+</button></div>)}
                <button type="button" disabled={!dirty || busy != null} onClick={() => saveRhythm(r)} style={{ ...cta, marginTop: 14, justifyContent: 'center', gap: 8, opacity: dirty ? 1 : .5 }}>{busy === 'rhythm' ? <Loader2 size={16} className="mvp-spin" /> : <Check size={16} />} Keep this rhythm</button>
                <div style={{ fontSize: 11.5, color: C.mute, marginTop: 8, textAlign: 'center' }}>Changes the months you have not started. Started months keep their pieces.</div>
              </>) })()}
          </div>
        </div>
      </div>
      </>, document.body)}

      {/* a ring, tapped */}
      {open && (() => {
        const s = stageOf[open]; const c = HUE[open]
        const mine = on.filter((x) => x.stage === open)
        const tiles = (m.tiles ?? []).filter((t) => t.stage === open)
        const back = () => setOpen(null)
        const act = actual?.[open] ?? null
        return (
          <div role="dialog" aria-modal="true" onClick={back} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(20,22,26,.42)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
            <div className="cr pm-in" onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, maxHeight: '92dvh', overflowY: 'auto', background: '#fff', borderRadius: '24px 24px 0 0', padding: '10px 18px calc(24px + env(safe-area-inset-bottom))', boxSizing: 'border-box', color: C.ink, ['--c' as string]: c }}>
              <style>{DRAW_CSS}</style>
              <div style={{ width: 38, height: 4, borderRadius: 99, background: '#e2e2e7', margin: '0 auto 10px' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0 6px' }}><span style={{ width: 34 }} /><span style={{ flex: 1, textAlign: 'center', fontFamily: DISPLAY, fontSize: 18, fontWeight: 600 }}>{s?.label}</span><button type="button" onClick={back} aria-label="Close" style={{ width: 34, height: 34, borderRadius: 99, border: `0.5px solid ${C.line}`, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={16} /></button></div>
              {state === 'draft'
                ? <div style={{ marginTop: 6 }}><b style={{ fontSize: 52, letterSpacing: '-.05em', lineHeight: .9, color: c, fontFamily: DISPLAY }}>{s?.add != null ? `+${about(s.add)}` : '—'}</b> {s?.add != null && est}<small style={{ display: 'block', fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.mute, marginTop: 8 }}>{s?.unit}{s?.now != null ? ` · now ${fmt(s.now)}` : ''}{s?.planned != null && s?.now != null ? ` → about ${about(s.planned)}` : ''}</small>{s?.basis && <div style={{ fontSize: 12.5, color: C.mute, marginTop: 8, lineHeight: 1.45 }}>{s.basis}. From your own posts, not a promise.</div>}</div>
                : <div style={{ marginTop: 6 }}><b style={{ fontSize: 52, letterSpacing: '-.05em', lineHeight: .9, color: c, fontFamily: DISPLAY }}>{fmt(act)}</b><small style={{ display: 'block', fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.mute, marginTop: 8 }}>{state === 'on' ? 'so far' : 'the month'} · about {about(s?.planned ?? null)} planned{s?.now != null ? ` · was ${fmt(s.now)}` : ''}</small></div>}
              {s?.levers.length ? <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>{s.levers.map((l) => <span key={l} style={{ fontSize: 11, fontWeight: 800, padding: '4px 9px', borderRadius: 99, background: C.greenSoft, color: C.greenDk }}>{l}</span>)}</div> : null}

              <div style={k2}>On it</div>
              {mine.length === 0 && <div style={{ fontSize: 13, color: C.mute, marginTop: 8 }}>Nothing on this ring yet.</div>}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginTop: 10 }}>
                {mine.filter((x, i) => x.kind !== 'post' || mine.findIndex((y) => y.kind === 'post') === i).map((x) => (
                  <div key={x.id ?? `${x.kind}:${x.date}`} style={{ ...tile('#f6f6f8'), cursor: 'default', ['--c2' as string]: c }}>
                    {x.status === 'planned' && <button type="button" aria-label="Take it off" disabled={busy != null} onClick={() => dropSlot(x)} style={{ position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 99, border: 0, background: '#fff', color: C.mute, display: 'grid', placeItems: 'center', cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,.12)' }}>{busy === (x.id ?? '') ? <Loader2 size={10} className="mvp-spin" /> : <X size={11} />}</button>}
                    <span style={{ width: 36, margin: '0 auto 6px', display: 'block' }}><Drawing spec={{ scene: SCENE[x.kind] }} now={x.status === 'done'} name="" rating="" t={(s) => s} /></span>
                    <b style={{ display: 'block', fontSize: 12, lineHeight: 1.2 }}>{x.label}</b>
                    <small style={{ display: 'block', fontSize: 10.5, color: C.mute, marginTop: 2 }}>{x.kind === 'post' ? `${mine.filter((y) => y.kind === 'post').length}× · ${niceDate(x.date)}` : x.kind === 'taste' || x.kind === 'review' || x.kind === 'team' ? 'all month' : niceDate(x.date)}{x.cents ? ` · ${dollars(x.cents)}` : ''}</small>
                    {x.status === 'minted' && <small style={{ display: 'block', fontSize: 10, color: C.greenDk, fontWeight: 800, marginTop: 2 }}>with the team</small>}
                  </div>
                ))}
              </div>

              {tiles.length > 0 && state !== 'done' && (
                <>
                  <div style={k2}>Add</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginTop: 10 }}>
                    {tiles.map((t) => (
                      <button key={t.kind} type="button" disabled={busy != null} onClick={() => addSlot(t)} style={{ ...tile('#fff', true), ['--c2' as string]: c }}>
                        <span style={{ width: 36, margin: '0 auto 6px', display: 'block' }}><Drawing spec={{ scene: SCENE[t.kind] }} name="" rating="" t={(s) => s} /></span>
                        <b style={{ display: 'block', fontSize: 12, lineHeight: 1.2 }}>{t.label}</b>
                        <small style={{ display: 'block', fontSize: 10.5, color: C.mute, marginTop: 2 }}>{t.cents ? dollars(t.cents) : 'Free'}</small>
                        <span style={{ width: 22, height: 22, borderRadius: 99, background: C.ink, color: '#fff', display: 'grid', placeItems: 'center', margin: '6px auto 0' }}>{busy === t.kind ? <Loader2 size={11} className="mvp-spin" /> : <Plus size={12} />}</span>
                      </button>
                    ))}
                  </div>
                  {tiles.find((t) => t.why) && <div style={{ fontSize: 12, color: C.mute, marginTop: 10, lineHeight: 1.45 }}>{tiles.filter((t) => t.why).map((t) => t.why).join('. ')}.</div>}
                </>
              )}
              {state === 'draft' && <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, fontSize: 14, fontWeight: 700 }}>{openBase != null && openBase !== (s?.add ?? null) && <><i style={{ fontStyle: 'normal', color: C.mute, fontWeight: 600 }}>+{about(openBase)}</i><ArrowRight size={14} color={C.mute} /></>}<b style={{ fontSize: 26, letterSpacing: '-.04em', color: c }}>{s?.add != null ? `+${about(s.add)}` : '—'}</b><i style={{ fontStyle: 'normal', color: C.mute, fontWeight: 600 }}>{s?.unit} · {dollars(m.total)} this month</i></div>}
              <button type="button" onClick={back} style={{ ...cta, marginTop: 14, justifyContent: 'center' }}>Done</button>
            </div>
          </div>
        )
      })()}

      {confirm && (
        <div role="dialog" aria-modal="true" onClick={() => setConfirm(false)} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(20,22,26,.42)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div className="cr pm-in" onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, maxHeight: '90dvh', overflowY: 'auto', background: '#fff', borderRadius: '24px 24px 0 0', padding: '10px 18px calc(24px + env(safe-area-inset-bottom))', boxSizing: 'border-box', color: C.ink }}>
            <div style={{ width: 38, height: 4, borderRadius: 99, background: '#e2e2e7', margin: '0 auto 10px' }} />
            <div style={{ fontFamily: DISPLAY, fontSize: 23, fontWeight: 600, letterSpacing: '-.02em', margin: '4px 2px 12px' }}>Start {name}</div>
            {[
              on.some((s) => s.kind === 'photos') ? ['The shoot day books', `${niceDate(on.find((s) => s.kind === 'photos')!.date)}. Paid before the day.`] : null,
              on.some((s) => s.kind === 'creator') ? [`${m.creator?.name.split(' ')[0] ?? 'The creator'} gets the ask`, 'They say yes in their own time.'] : null,
              on.some((s) => s.kind === 'post') ? [`${on.filter((s) => s.kind === 'post').length} posts are ordered`, 'Written from the shoot. Each one waits for your OK.'] : null,
              on.some((s) => s.kind === 'graphic' || s.kind === 'reel' || s.kind === 'print') ? ['Graphics and Reels follow', 'Each becomes a request a week before its date.'] : null,
              ['Nothing is charged today', 'Every paid piece is approved first.'],
            ].filter(Boolean).map((r, i) => <div key={i} style={{ display: 'flex', gap: 10, padding: '9px 0', borderBottom: `0.5px solid ${C.line}`, fontSize: 14, fontWeight: 600 }}><Check size={16} color={C.greenDk} style={{ flex: 'none', marginTop: 2 }} /><span>{r![0]}<small style={{ display: 'block', fontWeight: 500, color: C.mute, fontSize: 12, marginTop: 2 }}>{r![1]}</small></span></div>)}
            {needs.length > 0 && <>
              <div style={{ ...k2, margin: '14px 0 2px' }}>What we need from you</div>
              {needs.map(([t, d], i) => <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: `0.5px solid ${C.line}`, fontSize: 13.5, fontWeight: 600 }}><span style={{ width: 22, height: 22, borderRadius: 99, background: C.greenSoft, color: C.greenDk, display: 'grid', placeItems: 'center', flex: 'none', fontSize: 11, fontWeight: 800 }}>{i + 1}</span><span>{t}<small style={{ display: 'block', fontWeight: 500, color: C.mute, fontSize: 11.5, marginTop: 1 }}>{d}</small></span></div>)}
            </>}
            <button type="button" disabled={busy != null} onClick={start} style={{ ...cta, justifyContent: 'center', gap: 8 }}>{busy === 'start' ? <Loader2 size={16} className="mvp-spin" /> : <Check size={16} />} Start {name}, {dollars(m.total)} after approval</button>
            <button type="button" onClick={() => setConfirm(false)} style={{ ...cta, justifyContent: 'center', background: '#fff', color: C.ink, border: `0.5px solid ${C.line}` }}>Not yet</button>
          </div>
        </div>
      )}
    </div>
  )
}
