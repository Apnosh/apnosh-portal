'use client'
/**
 * THE MONTH, DRAWN AS THE HOME FUNNEL (owner 2026-09-19, "incorporate our current dashboard
 * design with the circles and people" → "let's try it").
 * ==========================================================================================
 * Home shows now. This page shows the month ahead, dashed: the same five circles and the same
 * people, a planned number on each ring with now in small type under it, the pieces as beads on
 * the ring they push, and the levers where Home shows the conversion pills. One line says why.
 * Three pills lean it. Tap a ring to see its pieces with dates, and to add. Start makes it real:
 * the shoot day books, the creator gets the ask, the posts are ordered; graphics and Reels turn
 * into requests a week before their date. Every paid piece is approved before it is charged.
 * Once the month has run, the actual ring is drawn solid inside the dashed planned one.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowRight, Check, Loader2, X, Plus } from 'lucide-react'
import { C, DISPLAY } from '../tokens'
import { Drawing, DRAW_CSS, type Scene } from '../create/drawings'

type Stage = 'aware' | 'interest' | 'action' | 'order' | 'keep'
type Kind = 'post' | 'graphic' | 'reel' | 'photos' | 'creator' | 'boost' | 'print' | 'offer' | 'review' | 'taste' | 'sign' | 'team'
type Lean = 'seen' | 'asis' | 'in'
interface Slot { id?: string; date: string; stage: Stage; kind: Kind; label: string; options: Record<string, unknown>; cents: number; status: string; ref?: { kind: string; id: string | null; href?: string } | null; why?: string | null }
interface StagePlan { stage: Stage; label: string; now: number | null; planned: number | null; unit: string; lever: string | null; levers: string[] }
interface Tile { kind: Kind; stage: Stage; label: string; cents: number; date: string; why: string | null }
interface Month { month: string; status: string; thesis: string; lean: Lean; baseline: Record<Stage, number | null>; stages: StagePlan[]; slots: Slot[]; total: number; budgetCents: number | null; creator: { slug: string; name: string; nearby: number | null; fromCents: number | null; date: string | null } | null; facts: { usualReach: number | null; reelLift: number | null; reviews30: number | null; budgetCents: number | null; locations: number }; tiles: Tile[] }
interface Read { month: Month; off: boolean; actual: Record<Stage, number | null> | null; next: string }

const HUE: Record<Stage, string> = { aware: '#2e9a78', interest: '#3b6fd4', action: '#6a39de', order: '#d99a1e', keep: '#0f97a8' }
const SCENE: Record<Kind, Scene> = { post: 'post', graphic: 'graphic', reel: 'reel', photos: 'photos', creator: 'creator', boost: 'boost', print: 'print', offer: 'offer', review: 'review', taste: 'dish', sign: 'sticky', team: 'grid' }
/* the five rings, alternating like Home, on a 354×640 stage */
const RING: { stage: Stage; cx: number; cy: number; r: number; side: 'L' | 'R' }[] = [
  { stage: 'aware', cx: 240, cy: 72, r: 64, side: 'L' }, { stage: 'interest', cx: 112, cy: 206, r: 52, side: 'R' }, { stage: 'action', cx: 244, cy: 338, r: 44, side: 'L' }, { stage: 'order', cx: 112, cy: 462, r: 40, side: 'R' }, { stage: 'keep', cx: 244, cy: 586, r: 36, side: 'L' },
]
const MONTH_NAME = (m: string) => new Date(m + '-01T12:00:00').toLocaleDateString('en-US', { month: 'long' })
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const niceDate = (iso: string) => { const d = new Date(iso + 'T12:00:00'); return `${WD[d.getDay()]} ${d.getDate()}` }
const dollars = (c: number) => `$${Math.round(c / 100).toLocaleString()}`
const fmt = (n: number | null) => (n == null ? '—' : n >= 10000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k` : n.toLocaleString())
const lighten = (h: string, amt = .35) => { const r = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16); const m = (v: number) => Math.round(v + (255 - v) * amt); return `rgb(${m(r)},${m(g)},${m(b)})` }
/* a seeded crowd: the number is the crowd, the way it is on Home */
const rand = (seed: number) => () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280 }
function crowd(cx: number, cy: number, r: number, n: number, col: string, seed: number, alpha = 1): ReactNode[] {
  const rnd = rand(seed); const out: ReactNode[] = []
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, d = Math.pow(rnd(), .6) * (r - 12), u = 4.2 + rnd() * 1.8
    const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d
    out.push(<g key={i} opacity={alpha}><path d={`M${x - u * .6} ${y + u * .92} Q${x - u * .7} ${y + u * .02} ${x} ${y - u * .16} Q${x + u * .7} ${y + u * .02} ${x + u * .6} ${y + u * .92} Z`} fill={col} /><circle cx={x} cy={y - u * .74} r={u * .46} fill={lighten(col)} /></g>)
  }
  return out
}
const people = (n: number | null, max: number) => (n == null || n <= 0 ? 3 : Math.max(3, Math.min(max, Math.round(6 * Math.log10(n + 1)))))

export default function PlanMonthPage({ clientId, month: monthParam }: { clientId: string; month: string | null }) {
  const [data, setData] = useState<Read | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [lean, setLean] = useState<Lean>('asis')
  const [drop, setDrop] = useState<string[]>([])
  const [add, setAdd] = useState<{ kind: Kind; date?: string }[]>([])
  const [open, setOpenRaw] = useState<Stage | null>(null)
  const [openBase, setOpenBase] = useState<number | null>(null)
  const setOpen = (st: Stage | null) => { setOpenRaw(st); setOpenBase(st ? stageOf[st]?.planned ?? null : null) }
  const [confirm, setConfirm] = useState(false)
  const [started, setStarted] = useState<{ minted: number; errors: string[] } | null>(null)
  const qs = (o: Record<string, string | undefined>) => Object.entries(o).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v!)}`).join('&')
  const load = (l = lean, d = drop, a = add) => fetch(`/api/dashboard/plan-month?${qs({ clientId, month: monthParam ?? undefined, lean: l, drop: d.join(',') || undefined, add: a.map((x) => `${x.kind}:${x.date ?? ''}`).join(',') || undefined })}`, { cache: 'no-store' }).then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Could not read the month'); setData(j as Read); setLean((j as Read).month.lean) }).catch((e) => setErr(e instanceof Error ? e.message : 'Could not read the month'))
  useEffect(() => { load() }, [clientId, monthParam]) // eslint-disable-line react-hooks/exhaustive-deps
  const m = data?.month ?? null
  const live = m != null && m.status !== 'draft'
  const stageOf = useMemo(() => Object.fromEntries((m?.stages ?? []).map((s) => [s.stage, s])) as Record<Stage, StagePlan | undefined>, [m])
  const on = (m?.slots ?? []).filter((s) => s.status !== 'removed' && s.status !== 'rolled')

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
  const start = async () => {
    setBusy('start')
    const j = await post({ action: 'start', lean, drop, add })
    if (j?.ok) { setStarted({ minted: j.minted, errors: j.errors ?? [] }); setConfirm(false) }
    setBusy(null)
  }

  const h1: React.CSSProperties = { fontFamily: DISPLAY, fontSize: 28, fontWeight: 600, letterSpacing: '-.04em', lineHeight: .95, margin: 0 }
  const k2: React.CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: C.mute, margin: '18px 0 0' }
  const cta: React.CSSProperties = { marginTop: 12, width: '100%', height: 52, borderRadius: 99, border: 0, background: C.ink, color: '#fff', fontWeight: 700, fontSize: 15, font: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', cursor: 'pointer', boxSizing: 'border-box' }
  const tile = (bg: string, dashed = false): React.CSSProperties => ({ borderRadius: 16, padding: '12px 6px 10px', textAlign: 'center', background: bg, border: dashed ? '1.5px dashed #c9c9d0' : 0, position: 'relative', font: 'inherit', color: C.ink, cursor: 'pointer' })

  if (err && !data) return <div className="cr" style={{ padding: 24, color: '#c92d32', fontSize: 13 }}>{err}</div>
  if (!m) return <div style={{ padding: 40, textAlign: 'center', color: C.mute }}><Loader2 size={18} className="mvp-spin" /></div>

  const name = MONTH_NAME(m.month)
  const actual = data?.actual ?? null
  const recap = m.status === 'done' || (actual != null && Object.values(actual).some((v) => v != null))
  const advice = (() => {
    const a = stageOf.aware, ac = stageOf.action
    const heavy = a?.planned != null && ac?.planned != null && a.planned > ac.planned * 20
    if (recap && actual) { const s = m.stages.map((x) => ({ x, d: actual[x.stage] != null && x.planned ? (actual[x.stage]! - x.planned) / x.planned : null })).filter((y) => y.d != null).sort((p, q) => Math.abs(q.d!) - Math.abs(p.d!))[0]; return s ? <><b style={{ color: C.ink }}>{s.x.label} {s.d! >= 0 ? 'beat' : 'missed'} the plan by {Math.round(Math.abs(s.d!) * 100)}%.</b> {s.d! >= 0 ? `${s.x.lever ?? 'The pieces'} did it.` : 'Next month leans in.'}</> : <b style={{ color: C.ink }}>The month ran.</b> }
    return <><b style={{ color: C.ink }}>{heavy ? 'Heavy at the top, thin at Actions.' : m.facts.reelLift ? `Your Reels do ${m.facts.reelLift}× your photos.` : 'Built from what you have.'}</b> {m.lean === 'in' ? 'Leaning in on the slow night.' : m.lean === 'seen' ? 'Leaning on being seen.' : m.thesis}</>
  })()

  return (
    <div className="cr" style={{ padding: '4px 16px 40px', color: C.ink, maxWidth: 480, margin: '0 auto' }}>
      <style>{DRAW_CSS}{`.pm-ring{cursor:pointer;transition:transform .18s}.pm-ring:active{transform:scale(.98)}@keyframes pm-in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}.pm-in{animation:pm-in .24s cubic-bezier(.2,.7,.2,1)}@media(prefers-reduced-motion:reduce){.pm-in{animation:none}}`}</style>

      {/* the top: the month, the thesis, the money */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 4 }}>
        <h1 style={h1}>{name}<small style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.mute, marginTop: 8, letterSpacing: 0, fontFamily: 'inherit' }}>{recap ? 'What it did.' : m.thesis}</small></h1>
        <span style={{ textAlign: 'right' }}><b style={{ display: 'block', fontSize: 20, letterSpacing: '-.03em' }}>{dollars(m.total)}</b><small style={{ fontSize: 11, color: C.mute, fontWeight: 600 }}>{recap ? 'billed' : live ? 'started' : 'after approval'}</small></span>
      </div>

      {/* the funnel */}
      <div style={{ position: 'relative', width: '100%', maxWidth: 354, aspectRatio: '354 / 640', margin: '6px auto 0' }}>
        <svg viewBox="0 0 354 640" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          <path d={RING.map((p, i) => (i === 0 ? `M${p.cx} ${p.cy}` : `C${RING[i - 1].cx} ${RING[i - 1].cy + 60} ${p.cx} ${p.cy - 60} ${p.cx} ${p.cy}`)).join(' ')} fill="none" stroke={HUE.aware} strokeOpacity=".45" strokeWidth="1.8" strokeDasharray="3 5" />
          {RING.map((p, i) => {
            const s = stageOf[p.stage]; const c = HUE[p.stage]
            const act = actual?.[p.stage] ?? null
            const ratio = act != null && s?.planned ? Math.max(.4, Math.min(1.6, act / s.planned)) : null
            return (
              <g key={p.stage} className="pm-ring" onClick={() => setOpen(p.stage)}>
                <circle cx={p.cx} cy={p.cy} r={p.r + 14} fill="transparent" />
                <circle cx={p.cx} cy={p.cy} r={p.r} fill={c + '0d'} stroke={c} strokeWidth="1.8" strokeDasharray={recap || live ? undefined : '4 5'} />
                {ratio != null && <circle cx={p.cx} cy={p.cy} r={p.r * ratio} fill={c + '22'} stroke={c} strokeWidth="2" />}
                {crowd(p.cx, p.cy, p.r, people(s?.planned ?? null, [34, 18, 9, 5, 3][i]), c, i * 7 + 1)}
              </g>
            )
          })}
        </svg>
        {RING.map((p) => { const s = stageOf[p.stage]; const c = HUE[p.stage]; const act = actual?.[p.stage] ?? null; return (
          <div key={p.stage} onClick={() => setOpen(p.stage)} style={{ position: 'absolute', [p.side === 'L' ? 'left' : 'right']: 0, top: `${(p.cy - 28) / 6.4}%`, width: 150, textAlign: p.side === 'R' ? 'right' : 'left', fontSize: 12.5, color: C.mute, fontWeight: 600, cursor: 'pointer' }}>
            {s?.label ?? p.stage}
            <b style={{ display: 'block', fontSize: 30, letterSpacing: '-.04em', color: c, lineHeight: 1, marginTop: 2 }}>{recap && act != null ? fmt(act) : fmt(s?.planned ?? null)}</b>
            <small style={{ display: 'block', fontSize: 11, color: C.mute, marginTop: 3, fontWeight: 600 }}>{recap ? `planned ${fmt(s?.planned ?? null)}` : s?.now != null ? `now ${fmt(s.now)}` : s?.unit ?? ''}</small>
          </div>) })}
        {!recap && RING.slice(0, 4).map((p, i) => { const s = stageOf[p.stage]; if (!s?.lever) return null; const y = (p.cy + RING[i + 1].cy) / 2; return <span key={p.stage} style={{ position: 'absolute', left: '50%', top: `${y / 6.4}%`, transform: 'translate(-50%,-50%)', fontSize: 11, fontWeight: 800, padding: '4px 9px', borderRadius: 99, background: C.greenSoft, color: C.greenDk, whiteSpace: 'nowrap', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.lever}</span> })}
        {!recap && RING.map((p) => {
          const beads = on.filter((s) => s.stage === p.stage).reduce<Slot[]>((acc, s) => (acc.some((x) => x.kind === s.kind) ? acc : [...acc, s]), []).slice(0, 4)
          return beads.map((b, j) => { const ang = -Math.PI * .75 + j * (Math.PI * .5); const x = p.cx + Math.cos(ang) * p.r * .98, y = p.cy + Math.sin(ang) * p.r * .98; return (
            <span key={b.kind} onClick={() => setOpen(p.stage)} style={{ position: 'absolute', left: `${x / 3.54}%`, top: `${y / 6.4}%`, width: 26, height: 26, borderRadius: 99, background: '#fff', border: `2px solid ${HUE[p.stage]}`, display: 'grid', placeItems: 'center', transform: 'translate(-50%,-50%)', boxShadow: '0 1px 3px rgba(0,0,0,.10)', ['--c2' as string]: HUE[p.stage], cursor: 'pointer' }}><span style={{ width: 15, display: 'block' }}><Drawing spec={{ scene: SCENE[b.kind] }} name="" rating="" t={(s) => s} /></span></span>) })
        })}
      </div>

      <div style={{ fontSize: 12.5, color: C.mute, textAlign: 'center', marginTop: 4, lineHeight: 1.45 }}>{advice}</div>
      {data?.off && <div style={{ marginTop: 10, fontSize: 12.5, color: '#8a5a0c', fontWeight: 600, lineHeight: 1.45, textAlign: 'center' }}>The monthly plan is not switched on yet. The team has to run one update first. You can shape it; Start waits.</div>}

      {!recap && !live && (
        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          {([['seen', 'Seen'], ['asis', 'As is'], ['in', 'In']] as [Lean, string][]).map(([k, l]) => <button key={k} type="button" disabled={busy != null} onClick={() => relean(k)} style={{ flex: 1, textAlign: 'center', fontSize: 12.5, fontWeight: 800, padding: '10px 0', borderRadius: 99, border: `1.5px solid ${lean === k ? C.ink : C.line}`, background: lean === k ? C.ink : '#fff', color: lean === k ? '#fff' : C.ink, font: 'inherit', cursor: 'pointer' }}>{busy === 'lean' && lean === k ? <Loader2 size={12} className="mvp-spin" /> : l}</button>)}
        </div>
      )}
      {err && <div style={{ fontSize: 12.5, color: '#c92d32', marginTop: 10, textAlign: 'center' }}>{err}</div>}
      {started && <div className="pm-in" style={{ marginTop: 12, border: `0.5px solid ${C.line}`, borderRadius: 14, padding: '10px 12px', fontSize: 13, lineHeight: 1.45 }}><b>{name} is on.</b> {started.minted} thing{started.minted === 1 ? '' : 's'} went to the team. Graphics and Reels follow a week before their date. Every paid piece waits for your OK.{started.errors.map((e, i) => <div key={i} style={{ color: '#8a5a0c', marginTop: 4 }}>{e}</div>)}</div>}
      {recap ? <a href={`/dashboard/plan?clientId=${clientId}&month=${data?.next}`} style={{ ...cta, textDecoration: 'none' }}><span>Plan {MONTH_NAME(data?.next ?? m.month)}</span><ArrowRight size={18} /></a>
        : live ? <a href={`/dashboard/campaigns?clientId=${clientId}`} style={{ ...cta, textDecoration: 'none' }}><span>See it on Coming up</span><ArrowRight size={18} /></a>
        : <button type="button" disabled={busy != null || !!data?.off} onClick={() => setConfirm(true)} style={{ ...cta, opacity: data?.off ? .5 : 1 }}><span>Start {name}</span><ArrowRight size={18} /></button>}

      {/* a ring, tapped */}
      {open && (() => {
        const s = stageOf[open]; const c = HUE[open]
        const mine = on.filter((x) => x.stage === open)
        const tiles = (m.tiles ?? []).filter((t) => t.stage === open)
        const before = s?.planned ?? null
        const back = () => setOpen(null)
        return (
          <div role="dialog" aria-modal="true" onClick={back} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(20,22,26,.42)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
            <div className="cr pm-in" onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, maxHeight: '92dvh', overflowY: 'auto', background: '#fff', borderRadius: '24px 24px 0 0', padding: '10px 18px calc(24px + env(safe-area-inset-bottom))', boxSizing: 'border-box', color: C.ink, ['--c' as string]: c }}>
              <style>{DRAW_CSS}</style>
              <div style={{ width: 38, height: 4, borderRadius: 99, background: '#e2e2e7', margin: '0 auto 10px' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0 6px' }}><span style={{ width: 34 }} /><span style={{ flex: 1, textAlign: 'center', fontFamily: DISPLAY, fontSize: 18, fontWeight: 600 }}>{s?.label}</span><button type="button" onClick={back} aria-label="Close" style={{ width: 34, height: 34, borderRadius: 99, border: `0.5px solid ${C.line}`, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={16} /></button></div>
              <div style={{ marginTop: 6 }}><b style={{ fontSize: 52, letterSpacing: '-.05em', lineHeight: .9, color: c, fontFamily: DISPLAY }}>{fmt(before)}</b><small style={{ display: 'block', fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.mute, marginTop: 8 }}>planned{s?.now != null ? ` · now ${fmt(s.now)}` : ''} · {s?.unit}</small></div>
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

              {tiles.length > 0 && !recap && (
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
              <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, fontSize: 14, fontWeight: 700 }}>{openBase != null && openBase !== before && <><i style={{ fontStyle: 'normal', color: C.mute, fontWeight: 600 }}>{fmt(openBase)}</i><ArrowRight size={14} color={C.mute} /></>}<b style={{ fontSize: 26, letterSpacing: '-.04em', color: c }}>{fmt(before)}</b><i style={{ fontStyle: 'normal', color: C.mute, fontWeight: 600 }}>{s?.unit} · {dollars(m.total)} this month</i></div>
              <button type="button" onClick={back} style={{ ...cta, marginTop: 14, justifyContent: 'center' }}>Done</button>
            </div>
          </div>
        )
      })()}

      {/* start: what happens */}
      {confirm && (
        <div role="dialog" aria-modal="true" onClick={() => setConfirm(false)} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(20,22,26,.42)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div className="cr pm-in" onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, background: '#fff', borderRadius: '24px 24px 0 0', padding: '10px 18px calc(24px + env(safe-area-inset-bottom))', boxSizing: 'border-box', color: C.ink }}>
            <div style={{ width: 38, height: 4, borderRadius: 99, background: '#e2e2e7', margin: '0 auto 10px' }} />
            <div style={{ fontFamily: DISPLAY, fontSize: 23, fontWeight: 600, letterSpacing: '-.02em', margin: '4px 2px 12px' }}>Start {name}</div>
            {[
              on.some((s) => s.kind === 'photos') ? ['The shoot day books', `${niceDate(on.find((s) => s.kind === 'photos')!.date)}. Paid before the day.`] : null,
              on.some((s) => s.kind === 'creator') ? [`${m.creator?.name.split(' ')[0] ?? 'The creator'} gets the ask`, 'They say yes in their own time.'] : null,
              on.some((s) => s.kind === 'post') ? [`${on.filter((s) => s.kind === 'post').length} posts are ordered`, 'Written from the shoot. Each one waits for your OK.'] : null,
              on.some((s) => s.kind === 'graphic' || s.kind === 'reel' || s.kind === 'print') ? ['Graphics and Reels follow', 'Each becomes a request a week before its date.'] : null,
              ['Nothing is charged today', 'Every paid piece is approved first.'],
            ].filter(Boolean).map((r, i) => <div key={i} style={{ display: 'flex', gap: 10, padding: '10px 0', borderBottom: `0.5px solid ${C.line}`, fontSize: 14, fontWeight: 600 }}><Check size={16} color={C.greenDk} style={{ flex: 'none', marginTop: 2 }} /><span>{r![0]}<small style={{ display: 'block', fontWeight: 500, color: C.mute, fontSize: 12, marginTop: 2 }}>{r![1]}</small></span></div>)}
            <button type="button" disabled={busy != null} onClick={start} style={{ ...cta, justifyContent: 'center', gap: 8 }}>{busy === 'start' ? <Loader2 size={16} className="mvp-spin" /> : <Check size={16} />} Start {name}, {dollars(m.total)} after approval</button>
            <button type="button" onClick={() => setConfirm(false)} style={{ ...cta, justifyContent: 'center', background: '#fff', color: C.ink, border: `0.5px solid ${C.line}` }}>Not yet</button>
          </div>
        </div>
      )}
    </div>
  )
}
