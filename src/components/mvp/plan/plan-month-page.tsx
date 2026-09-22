'use client'
/**
 * PLAN AHEAD (owner 2026-09-22: "get rid of the funnel for that, keep it viewable by month, make
 * the calendar views and buttons easier to navigate, no slide-up").
 * ==========================================================================================
 * One month at a time. The season strip is how you move between months and where the holidays
 * show. Under it, a segmented control picks the view:
 *   Month   a calendar grid, each day carrying its pieces as the app's own small drawings. Tap a
 *           day to see them with prices, take one off, or add something on that day.
 *   List    the pieces by week, the receipt for the total.
 *   Money   the total against the budget, by kind, and when each is paid.
 *   Rhythm  what recurs: posts a week, a shoot a month, a creator a quarter.
 * What the month adds is one row of estimates. Start is a bar at the bottom and makes it real;
 * every paid piece is approved before it is charged. Home carries the running month's pieces
 * on its rings.
 */
import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Check, Loader2, X, Plus, ChevronRight } from 'lucide-react'
import { C, DISPLAY } from '../tokens'
import { Drawing, DRAW_CSS, type Scene } from '../create/drawings'

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
interface CalEvent { id: string; kind: string; title: string; startIso: string; status: string; href?: string }

const HUE: Record<Stage, string> = { aware: '#2e9a78', interest: '#3b6fd4', action: '#6a39de', order: '#d99a1e', keep: '#0f97a8' }
const SCENE: Record<Kind, Scene> = { post: 'post', graphic: 'graphic', reel: 'reel', photos: 'photos', creator: 'creator', boost: 'boost', print: 'print', offer: 'offer', review: 'review', taste: 'dish', sign: 'sticky', team: 'grid' }
const KIND_STAGE: Record<Kind, Stage> = { post: 'aware', boost: 'aware', creator: 'aware', reel: 'interest', graphic: 'interest', photos: 'interest', offer: 'action', taste: 'action', sign: 'action', print: 'action', review: 'keep', team: 'keep' }
const STAGE_WORD: Record<Stage, string> = { aware: 'Awareness', interest: 'Interest', action: 'Actions', order: 'Orders', keep: 'Reviews' }
const LEANS: [Lean, string, string][] = [['seen', 'Reach', 'Boost to $100'], ['asis', 'Balanced', 'The rhythm as it is'], ['in', 'Slow nights', 'A Tuesday deal, a table tent, the creator on a Tuesday']]
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dt = (iso: string) => new Date(iso + 'T12:00:00')
const niceDate = (iso: string) => { const d = dt(iso); return `${WD[d.getDay()]} ${d.getDate()}` }
const dollars = (c: number) => `$${Math.round(c / 100).toLocaleString()}`
const about = (n: number | null) => (n == null ? '—' : n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(Math.round(n / 100) / 10).toFixed(1)}k` : n >= 100 ? String(Math.round(n / 10) * 10) : String(Math.round(n)))
const fmt = (n: number | null) => (n == null ? '—' : n >= 10000 ? `${(n / 1000).toFixed(1)}k` : n.toLocaleString())
const monthAfter = (m: string) => { const [y, mo] = m.split('-').map(Number); return `${mo === 12 ? y + 1 : y}-${String(mo === 12 ? 1 : mo + 1).padStart(2, '0')}` }
const MONTH_NAME = (m: string) => new Date(m + '-01T12:00:00').toLocaleDateString('en-US', { month: 'long' })
const weekOf = (iso: string) => { const d = dt(iso); d.setDate(d.getDate() - d.getDay()); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const allMonth = (s: Slot) => s.kind === 'taste' || s.kind === 'review' || s.kind === 'team'

export default function PlanMonthPage({ clientId, month: monthParam, historyHref }: { clientId: string; month: string | null; /** where the campaigns that already ran live */ historyHref?: string }) {
  const [data, setData] = useState<Read | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [lean, setLean] = useState<Lean>('asis')
  const [drop, setDrop] = useState<string[]>([])
  const [add, setAdd] = useState<{ kind: Kind; date?: string }[]>([])
  const [confirm, setConfirm] = useState(false)
  const [started, setStarted] = useState<{ minted: number; errors: string[] } | null>(null)
  const [subject, setSubject] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [view, setView] = useState<'month' | 'list' | 'money' | 'rhythm'>('month')
  const [day, setDay] = useState<string | null>(null)
  const [adding, setAdding] = useState<string | null>(null)
  const [rh, setRh] = useState<Rhythm | null>(null)
  const [events, setEvents] = useState<CalEvent[]>([])
  const qs = (o: Record<string, string | undefined>) => Object.entries(o).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v!)}`).join('&')
  const load = (l = lean, d = drop, a = add, sub = subject) => fetch(`/api/dashboard/plan-month?${qs({ clientId, month: monthParam ?? undefined, lean: l, subject: sub ?? undefined, drop: d.join(',') || undefined, add: a.map((x) => `${x.kind}:${x.date ?? ''}`).join(',') || undefined })}`, { cache: 'no-store' }).then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Could not read the month'); setData(j as Read); setLean((j as Read).month.lean); if ((j as Read).month.subject && subject == null) setSubject((j as Read).month.subject) }).catch((e) => setErr(e instanceof Error ? e.message : 'Could not read the month'))
  useEffect(() => { load() }, [clientId, monthParam]) // eslint-disable-line react-hooks/exhaustive-deps
  const m = data?.month ?? null
  /* everything else already on the calendar that month: scheduled posts, shoots, tasks */
  useEffect(() => {
    if (!m) return
    const [y, mo] = m.month.split('-').map(Number); const last = new Date(y, mo, 0).getDate()
    fetch(`/api/dashboard/calendar?clientId=${clientId}&from=${m.month}-01T00:00:00&to=${m.month}-${String(last).padStart(2, '0')}T23:59:59`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((j) => { if (j?.events) setEvents((j.events as CalEvent[]).filter((e) => !e.id.startsWith('plan-'))) }).catch(() => {})
  }, [clientId, m?.month]) // eslint-disable-line react-hooks/exhaustive-deps
  const stageOf = useMemo(() => Object.fromEntries((m?.stages ?? []).map((s) => [s.stage, s])) as Record<Stage, StagePlan | undefined>, [m])
  const on = (m?.slots ?? []).filter((s) => s.status !== 'removed' && s.status !== 'rolled')
  const state: 'draft' | 'on' | 'done' = !m ? 'draft' : m.status === 'done' || (m.status === 'started' && data != null && data.elapsed >= data.days) ? 'done' : m.status === 'started' ? 'on' : 'draft'
  const live = state !== 'draft'

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
  const saveSubject = async (v: string) => { const sub = v.trim().slice(0, 80) || null; setEditing(false); setSubject(sub); setBusy('subject'); if (live) await post({ action: 'subject', subject: sub }); else await load(lean, drop, add, sub); setBusy(null) }
  const saveRhythm = async (r: Rhythm) => { setRh(r); setBusy('rhythm'); const j = await post({ action: 'rhythm', rhythm: r }); if (j?.ok) await load(); setBusy(null) }
  const relean = (l: Lean) => { setLean(l); setBusy('lean'); load(l, drop, add).finally(() => setBusy(null)) }
  const dropSlot = async (s: Slot) => {
    if (live) { setBusy(s.id ?? ''); await post({ action: 'drop', key: s.id ?? `${s.kind}:${s.date}` }); setBusy(null); return }
    const d = [...drop, `${s.kind}:${s.date}`]; const a = add.filter((x) => !(x.kind === s.kind && (x.date ?? '') === s.date)); setDrop(d); setAdd(a); setBusy('edit'); await load(lean, d, a); setBusy(null)
  }
  const addSlot = async (t: Tile, date?: string) => {
    const when = date ?? t.date
    if (live) { setBusy(t.kind); await post({ action: 'add', kind: t.kind, date: when }); setBusy(null); setAdding(null); return }
    const a = [...add, { kind: t.kind, date: when }]; setAdd(a); setBusy(t.kind); await load(lean, drop, a); setBusy(null); setAdding(null)
  }
  const start = async () => { setBusy('start'); const j = await post({ action: 'start', lean, drop, add, subject }); if (j?.ok) { setStarted({ minted: j.minted, errors: j.errors ?? [] }); setConfirm(false); load() } setBusy(null) }
  const go = (mm: string) => { window.location.href = `${window.location.pathname}?clientId=${clientId}&month=${mm}` }

  const h1: React.CSSProperties = { fontFamily: DISPLAY, fontSize: 24, fontWeight: 600, letterSpacing: '-.04em', lineHeight: 1, margin: 0 }
  const k2: React.CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: C.mute, margin: '18px 0 0' }
  const cta: React.CSSProperties = { width: '100%', height: 52, borderRadius: 99, border: 0, background: C.ink, color: '#fff', fontWeight: 700, fontSize: 15, font: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', cursor: 'pointer', boxSizing: 'border-box' }
  const sheet: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(20,22,26,.42)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }
  const sheetIn: React.CSSProperties = { width: '100%', maxWidth: 480, maxHeight: '88dvh', overflowY: 'auto', background: '#fff', borderRadius: '24px 24px 0 0', padding: '10px 18px calc(24px + env(safe-area-inset-bottom))', boxSizing: 'border-box', color: C.ink }
  const chip = (s: Slot) => { const st = s.status === 'done' ? ['done', C.greenSoft, C.greenDk] : s.status === 'minted' ? ['with the team', C.greenSoft, C.greenDk] : state === 'on' ? ['coming', '#f2f2f5', C.mute] : null; return st ? <span style={{ fontSize: 10.5, fontWeight: 800, padding: '3px 8px', borderRadius: 99, background: st[1], color: st[2], whiteSpace: 'nowrap' }}>{st[0]}</span> : null }
  const row = (s: Slot | null, label: string, sub: string, cents: number, stage: Stage, kind: Kind, canDrop: boolean) => (
    <div key={s?.id ?? `${kind}:${label}:${sub}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: `0.5px solid ${C.line}`, fontSize: 13.5, fontWeight: 600 }}>
      <span style={{ width: 30, flex: 'none', ['--c2' as string]: HUE[stage] }}><Drawing spec={{ scene: SCENE[kind] }} now={s?.status === 'done'} name="" rating="" t={(x) => x} /></span>
      <span style={{ flex: 1, minWidth: 0 }}>{label}<small style={{ display: 'block', fontWeight: 500, color: C.mute, fontSize: 11.5, marginTop: 1 }}>{sub}</small></span>
      {s && chip(s)}
      <span style={{ fontSize: 12.5, color: cents ? C.ink : C.mute, fontWeight: 700, width: 46, textAlign: 'right' }}>{cents ? dollars(cents) : 'Free'}</span>
      {canDrop && s && <button type="button" aria-label="Take it off" disabled={busy != null} onClick={() => dropSlot(s)} style={{ width: 24, height: 24, borderRadius: 99, border: `0.5px solid ${C.line}`, background: '#fff', color: C.mute, display: 'grid', placeItems: 'center', cursor: 'pointer', flex: 'none' }}>{busy === (s.id ?? '') ? <Loader2 size={10} className="mvp-spin" /> : <X size={11} />}</button>}
    </div>
  )

  if (err && !data) return <div className="cr" style={{ padding: 24, color: '#c92d32', fontSize: 13 }}>{err}</div>
  if (!m || !data) return <div style={{ padding: 40, textAlign: 'center', color: C.mute }}><Loader2 size={18} className="mvp-spin" /></div>

  const name = MONTH_NAME(m.month)
  const title = state === 'draft' ? `Plan ${name}` : state === 'on' ? `${name}, on` : name
  const subtitle = state === 'on' ? `Day ${data.elapsed} of ${data.days}. ${on.filter((s) => s.status === 'done').length} done, ${on.filter((s) => s.status === 'minted').length} with the team.` : state === 'done' ? 'What it did.' : null
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
  const weeks = (() => { const g = new Map<string, Slot[]>(); for (const s of on) { const k = weekOf(s.date); g.set(k, [...(g.get(k) ?? []), s]) } return [...g.entries()].sort(([a], [b]) => a.localeCompare(b)) })()
  const firstDow = dt(`${m.month}-01`).getDay()
  const today = new Date().toISOString().slice(0, 10)
  const eventsOn = (iso: string) => events.filter((e) => e.startIso.slice(0, 10) === iso)

  return (
    <div className="cr" style={{ padding: '2px 16px 0', color: C.ink, maxWidth: 480, margin: '0 auto', boxSizing: 'border-box' }}>
      <style>{DRAW_CSS}{`@keyframes pm-in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}.pm-in{animation:pm-in .24s cubic-bezier(.2,.7,.2,1)}.pm-day:active{transform:scale(.96)}@media(prefers-reduced-motion:reduce){.pm-in{animation:none}}`}</style>

      {/* the month and its subject */}
      <div style={{ minWidth: 0 }}>
        <h1 style={h1}>{title}</h1>
        {editing
          ? <input autoFocus defaultValue={m.subject ?? ''} placeholder="Fall menu, Halloween…" maxLength={80} onBlur={(e) => saveSubject(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(false) }} style={{ display: 'block', marginTop: 4, width: '100%', font: 'inherit', fontSize: 13, fontWeight: 600, padding: '5px 10px', borderRadius: 10, border: `1px solid ${C.ink}`, color: C.ink, boxSizing: 'border-box' }} />
          : <small onClick={() => { if (state === 'draft') setEditing(true) }} style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.mute, marginTop: 4, lineHeight: 1.3, cursor: state === 'draft' ? 'text' : 'default', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{subtitle ?? (m.subject ?? <span style={{ color: C.faint }}>What is {name} about? Tap to say.</span>)}</small>}
      </div>
      {/* the lean: three ways to tilt the month, each saying what it changes */}
      {state === 'draft' && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', gap: 2, padding: 3, borderRadius: 99, background: '#f2f2f5' }}>
            {LEANS.map(([kk, l]) => <button key={kk} type="button" disabled={busy != null} onClick={() => relean(kk)} style={{ flex: 1, fontSize: 12.5, fontWeight: 800, padding: '7px 0', borderRadius: 99, border: 0, background: lean === kk ? '#fff' : 'transparent', color: lean === kk ? C.ink : C.mute, boxShadow: lean === kk ? '0 1px 3px rgba(0,0,0,.12)' : 'none', font: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' }}>{busy === 'lean' && lean === kk ? <Loader2 size={11} className="mvp-spin" /> : l}</button>)}
          </div>
          <div style={{ fontSize: 11.5, color: C.mute, marginTop: 5, textAlign: 'center' }}>{LEANS.find((x) => x[0] === lean)?.[2]}.</div>
        </div>
      )}

      {/* the season: this month and the two after it. Tap to move. */}
      {data.season?.length > 1 && (
        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          {data.season.map((sm) => { const here = sm.month === m.month; const st = sm.status === 'started' ? 'on' : sm.status === 'done' ? 'done' : 'draft'; return (
            <button key={sm.month} type="button" onClick={() => { if (!here) go(sm.month) }} style={{ flex: 1, minWidth: 0, textAlign: 'left', font: 'inherit', border: 0, background: here ? C.ink : '#f6f6f8', color: here ? '#fff' : C.ink, borderRadius: 12, padding: '7px 9px', cursor: here ? 'default' : 'pointer' }}>
              <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 4 }}><b style={{ fontSize: 12.5 }}>{MONTH_NAME(sm.month).slice(0, 3)}</b><small style={{ fontSize: 10, fontWeight: 700, color: here ? 'rgba(255,255,255,.7)' : st === 'on' ? C.greenDk : C.mute }}>{st === 'on' ? 'on' : st === 'done' ? 'done' : sm.total ? dollars(sm.total) : ''}</small></span>
              <span style={{ display: 'block', fontSize: 11, marginTop: 1, color: here ? 'rgba(255,255,255,.75)' : C.mute, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sm.occasions.length ? sm.occasions.map((o) => `${o.emoji} ${o.name}`).join(' · ') : sm.subject ?? `${sm.pieces} pieces`}</span>
            </button>) })}
        </div>
      )}

      {/* what the month adds: one row, estimates */}
      {state === 'draft' && (
        <div style={{ display: 'flex', gap: 4, marginTop: 10, overflowX: 'auto', scrollbarWidth: 'none' }}>
          {(['aware', 'interest', 'action', 'order', 'keep'] as Stage[]).map((st) => { const s = stageOf[st]; return <span key={st} style={{ flex: '1 0 auto', textAlign: 'center', padding: '6px 8px', borderRadius: 12, background: '#f6f6f8', minWidth: 0 }}><b style={{ display: 'block', fontFamily: DISPLAY, fontSize: 15, letterSpacing: '-.02em', color: HUE[st] }}>{s?.add != null ? `+${about(s.add)}` : '—'}</b><small style={{ display: 'block', fontSize: 9.5, fontWeight: 700, color: C.mute, letterSpacing: '.03em', textTransform: 'uppercase', marginTop: 1 }}>{STAGE_WORD[st]}</small></span> })}
        </div>
      )}
      {state !== 'draft' && data.actual && (
        <div style={{ display: 'flex', gap: 4, marginTop: 10 }}>
          {(['aware', 'interest', 'action', 'order', 'keep'] as Stage[]).map((st) => { const s = stageOf[st]; const a = data.actual?.[st] ?? null; return <span key={st} style={{ flex: 1, textAlign: 'center', padding: '6px 4px', borderRadius: 12, background: '#f6f6f8', minWidth: 0 }}><b style={{ display: 'block', fontFamily: DISPLAY, fontSize: 15, letterSpacing: '-.02em', color: HUE[st] }}>{fmt(a)}</b><small style={{ display: 'block', fontSize: 9.5, fontWeight: 700, color: C.mute, marginTop: 1 }}>of {about(s?.planned ?? null)}</small></span> })}
        </div>
      )}
      {state === 'draft' && <div style={{ fontSize: 11, color: C.mute, marginTop: 4, textAlign: 'center' }}>Estimates from your own posts, not a promise. Tap a day to see what is on it.</div>}

      {/* the view */}
      <div style={{ display: 'flex', gap: 4, padding: 3, borderRadius: 12, background: '#f2f2f5', marginTop: 12 }}>
        {([['month', 'Month'], ['list', 'List'], ['money', 'Money'], ['rhythm', 'Rhythm']] as const).map(([k, l]) => <button key={k} type="button" onClick={() => setView(k)} style={{ flex: 1, font: 'inherit', fontSize: 13, fontWeight: 700, padding: '8px 0', borderRadius: 9, border: 0, background: view === k ? '#fff' : 'transparent', color: view === k ? C.ink : C.mute, boxShadow: view === k ? '0 1px 3px rgba(0,0,0,.10)' : 'none', cursor: 'pointer' }}>{l}</button>)}
      </div>

      {view === 'month' && (
        <div className="pm-in">
          {on.some(allMonth) && <div style={{ display: 'flex', gap: 6, marginTop: 12, overflowX: 'auto', scrollbarWidth: 'none' }}><span style={{ fontSize: 11, fontWeight: 700, color: C.mute, alignSelf: 'center', flex: 'none' }}>All month</span>{on.filter(allMonth).map((s) => <span key={s.id ?? s.kind} style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, padding: '4px 9px 4px 5px', borderRadius: 99, background: '#f6f6f8', ['--c2' as string]: HUE[s.stage] }}><span style={{ width: 18, display: 'block' }}><Drawing spec={{ scene: SCENE[s.kind] }} name="" rating="" t={(x) => x} /></span>{s.label}</span>)}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3, marginTop: 10 }}>
            {WD.map((w) => <span key={w} style={{ fontSize: 10.5, fontWeight: 700, color: C.faint, textAlign: 'center', padding: '2px 0 4px' }}>{w.slice(0, 1)}</span>)}
            {Array.from({ length: firstDow }).map((_, i) => <span key={`b${i}`} />)}
            {Array.from({ length: data.days }).map((_, i) => {
              const iso = `${m.month}-${String(i + 1).padStart(2, '0')}`
              const here = on.filter((x) => x.date === iso && !allMonth(x))
              const posts = here.filter((x) => x.kind === 'post'); const rest = here.filter((x) => x.kind !== 'post')
              const ev = eventsOn(iso)
              const past = iso < today; const isToday = iso === today
              const occ = data.season.find((s) => s.month === m.month)?.occasions.find((o) => o.date === iso)
              return (
                <button key={iso} type="button" className="pm-day" onClick={() => setDay(iso)} style={{ font: 'inherit', border: 0, background: here.length || ev.length ? '#fff' : '#fafafb', boxShadow: here.length || ev.length ? '0 1px 2px rgba(0,0,0,.05), 0 0 0 0.5px #e6e6ea' : 'inset 0 0 0 0.5px #eeeef1', color: past ? C.faint : C.ink, borderRadius: 12, padding: '6px 3px 5px', cursor: 'pointer', minHeight: 62, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, transition: 'transform .12s' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, lineHeight: 1, width: 20, height: 20, borderRadius: 99, display: 'grid', placeItems: 'center', background: isToday ? C.ink : 'transparent', color: isToday ? '#fff' : undefined }}>{occ ? occ.emoji : i + 1}</span>
                  <span style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 2, width: '100%' }}>
                    {rest.slice(0, 3).map((x) => <span key={x.id ?? `${x.kind}:${x.date}`} style={{ width: 18, display: 'block', opacity: x.status === 'done' ? .55 : 1, ['--c2' as string]: HUE[x.stage] }}><Drawing spec={{ scene: SCENE[x.kind] }} now={x.status === 'done'} name="" rating="" t={(y) => y} /></span>)}
                    {rest.length > 3 && <span style={{ fontSize: 9.5, fontWeight: 800, color: C.mute, alignSelf: 'center' }}>+{rest.length - 3}</span>}
                  </span>
                  <span style={{ display: 'flex', gap: 2, height: 5, marginTop: 'auto' }}>{posts.map((x) => <span key={x.id ?? x.date} style={{ width: 5, height: 5, borderRadius: 99, background: HUE.aware, opacity: x.status === 'done' ? .4 : .8 }} />)}{ev.slice(0, 3).map((e) => <span key={e.id} style={{ width: 5, height: 5, borderRadius: 99, background: '#c9c9d0' }} />)}</span>
                </button>)
            })}
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 10.5, color: C.mute, fontWeight: 600, justifyContent: 'center', flexWrap: 'wrap' }}><span><span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: 99, background: HUE.aware, marginRight: 4, verticalAlign: 'middle' }} />a post</span><span><span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: 99, background: '#c9c9d0', marginRight: 4, verticalAlign: 'middle' }} />already on your calendar</span><span>a drawing is a piece</span></div>
        </div>
      )}

      {view === 'list' && (
        <div className="pm-in">
          {weeks.map(([wk, rows]) => {
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
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0 0', fontSize: 14, fontWeight: 800 }}><span>{name}</span><span>{dollars(m.total)}</span></div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>{getting.map(([n, w, k]) => <span key={w} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, padding: '5px 9px 5px 5px', borderRadius: 99, background: '#f6f6f8', ['--c2' as string]: HUE[KIND_STAGE[k]] }}><span style={{ width: 20, display: 'block' }}><Drawing spec={{ scene: SCENE[k] }} name="" rating="" t={(x) => x} /></span>{n} {w}</span>)}</div>
          {historyHref && <a href={historyHref} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 18, padding: '12px 0', borderTop: `0.5px solid ${C.line}`, fontSize: 14, fontWeight: 600, color: C.ink, textDecoration: 'none' }}><span style={{ flex: 1 }}>Campaigns that already ran</span><ChevronRight size={16} color={C.faint} /></a>}
        </div>
      )}

      {view === 'money' && (
        <div className="pm-in">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 14 }}><b style={{ fontFamily: DISPLAY, fontSize: 28, letterSpacing: '-.03em', fontWeight: 600 }}>{dollars(m.total)}</b>{m.budgetCents ? <span style={{ fontSize: 12.5, color: m.total > m.budgetCents ? '#c92d32' : C.mute, fontWeight: 700 }}>of your {dollars(m.budgetCents)} a month</span> : null}</div>
          {m.budgetCents ? <div style={{ height: 6, borderRadius: 99, background: '#eeeef1', marginTop: 8, overflow: 'hidden' }}><div style={{ width: `${Math.min(100, m.total / m.budgetCents * 100)}%`, height: '100%', background: m.total > m.budgetCents ? '#c92d32' : C.greenDk, borderRadius: 99 }} /></div> : null}
          {byKind.map(([label, cents, when]) => <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: `0.5px solid ${C.line}`, fontSize: 13.5, fontWeight: 600 }}><span style={{ flex: 1 }}>{label}<small style={{ display: 'block', fontWeight: 500, color: C.mute, fontSize: 11.5, marginTop: 1 }}>{when}</small></span><span style={{ fontWeight: 700 }}>{dollars(cents)}</span></div>)}
          <div style={{ fontSize: 12, color: C.mute, marginTop: 10, lineHeight: 1.45 }}>Posts, the taste, the review ask and the team card are free. Nothing is charged today; each paid piece is approved before it is charged.</div>
          {state === 'draft' && <div style={{ fontSize: 12, color: C.mute, marginTop: 8, lineHeight: 1.45 }}>{MONTH_NAME(monthAfter(m.month))} drafts itself near the end of {name}. Nothing starts without you.</div>}
        </div>
      )}

      {view === 'rhythm' && (() => { const r = rh ?? data.rhythm; const step = (k: keyof Rhythm, lo: number, hi: number) => (v: number) => setRh({ ...r, [k]: Math.max(lo, Math.min(hi, v)) }); const rows: [keyof Rhythm, string, string, number, number][] = [['posts_week', 'Posts', 'a week', 0, 7], ['graphics_week', 'Graphics', 'a week', 0, 3], ['reels_month', 'Reels', 'a month', 0, 8], ['shoots_month', 'Shoot days', 'a month', 0, 2], ['creator_quarter', 'Creator visits', 'a quarter', 0, 3]]; const dirty = rh != null && JSON.stringify(rh) !== JSON.stringify(data.rhythm); return (
        <div className="pm-in">
          <div style={{ fontSize: 13, color: C.mute, marginTop: 14, lineHeight: 1.45 }}>Set once. Every month starts from this, and the holidays add their own pieces on top. {data.rhythmSet ? 'This is yours.' : 'This is our read of your budget until you change it.'}</div>
          {rows.map(([k, l, unit, lo, hi]) => <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: `0.5px solid ${C.line}`, fontSize: 14, fontWeight: 600 }}><span style={{ flex: 1 }}>{l}<small style={{ display: 'block', fontWeight: 500, color: C.mute, fontSize: 11.5 }}>{unit}</small></span><button type="button" aria-label="Fewer" onClick={() => step(k, lo, hi)(r[k] - 1)} style={{ width: 32, height: 32, borderRadius: 99, border: `1px solid ${C.line}`, background: '#fff', font: 'inherit', fontSize: 16, cursor: 'pointer' }}>−</button><b style={{ width: 22, textAlign: 'center', fontFamily: DISPLAY, fontSize: 18 }}>{r[k]}</b><button type="button" aria-label="More" onClick={() => step(k, lo, hi)(r[k] + 1)} style={{ width: 32, height: 32, borderRadius: 99, border: `1px solid ${C.line}`, background: '#fff', font: 'inherit', fontSize: 16, cursor: 'pointer' }}>+</button></div>)}
          <button type="button" disabled={!dirty || busy != null} onClick={() => saveRhythm(r)} style={{ ...cta, marginTop: 14, justifyContent: 'center', gap: 8, opacity: dirty ? 1 : .5 }}>{busy === 'rhythm' ? <Loader2 size={16} className="mvp-spin" /> : <Check size={16} />} Keep this rhythm</button>
          <div style={{ fontSize: 11.5, color: C.mute, marginTop: 8, textAlign: 'center' }}>Changes the months you have not started. Started months keep their pieces.</div>
        </div>) })()}

      {err && <div style={{ fontSize: 12.5, color: '#c92d32', marginTop: 10, textAlign: 'center' }}>{err}</div>}
      {data.off && <div style={{ marginTop: 10, fontSize: 12.5, color: '#8a5a0c', fontWeight: 600, textAlign: 'center' }}>Not switched on yet. The team has to run one update first.</div>}
      {started && <div className="pm-in" style={{ marginTop: 10, border: `0.5px solid ${C.line}`, borderRadius: 14, padding: '10px 12px', fontSize: 13, lineHeight: 1.45 }}><b>{name} is on.</b> {started.minted} thing{started.minted === 1 ? '' : 's'} went to the team. Graphics and Reels follow a week before their date. Every paid piece waits for your OK.{started.errors.map((e, i) => <div key={i} style={{ color: '#8a5a0c', marginTop: 4 }}>{e}</div>)}</div>}

      {/* Start: a bar that stays at the bottom while you scroll */}
      <div style={{ position: 'sticky', bottom: 0, padding: '12px 0 12px', background: 'linear-gradient(180deg, rgba(255,255,255,0) 0%, #fff 30%)', marginTop: 14 }}>
        {state === 'done' ? <a href={`?clientId=${clientId}&month=${monthAfter(m.month)}`} style={{ ...cta, textDecoration: 'none' }}><span>Plan {MONTH_NAME(monthAfter(m.month))}</span><ArrowRight size={18} /></a>
          : state === 'on' ? <a href={`/dashboard?clientId=${clientId}`} style={{ ...cta, textDecoration: 'none' }}><span>See it on Home</span><ArrowRight size={18} /></a>
          : <button type="button" disabled={busy != null || data.off} onClick={() => setConfirm(true)} style={{ ...cta, opacity: data.off ? .5 : 1 }}><span>Start {name}</span><span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}><span style={{ fontWeight: 600, opacity: .8 }}>{dollars(m.total)}</span><ArrowRight size={18} /></span></button>}
      </div>

      {/* a day, tapped */}
      {day && (() => { const here = on.filter((x) => x.date === day && !allMonth(x)); const ev = eventsOn(day); const occ = data.season.find((s) => s.month === m.month)?.occasions.find((o) => o.date === day); return (
        <div role="dialog" aria-modal="true" onClick={() => setDay(null)} style={sheet}>
          <div className="cr pm-in" onClick={(e) => e.stopPropagation()} style={sheetIn}>
            <style>{DRAW_CSS}</style>
            <div style={{ width: 38, height: 4, borderRadius: 99, background: '#e2e2e7', margin: '0 auto 10px' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0 6px' }}><span style={{ width: 34 }} /><span style={{ flex: 1, textAlign: 'center', fontFamily: DISPLAY, fontSize: 18, fontWeight: 600 }}>{occ ? `${occ.emoji} ${occ.name} · ` : ''}{niceDate(day)}</span><button type="button" onClick={() => setDay(null)} aria-label="Close" style={{ width: 34, height: 34, borderRadius: 99, border: `0.5px solid ${C.line}`, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={16} /></button></div>
            {here.length === 0 && ev.length === 0 && <div style={{ fontSize: 13, color: C.mute, padding: '8px 0' }}>Nothing planned this day.</div>}
            {here.map((s) => row(s, `${s.options.emoji ? `${s.options.emoji} ` : ''}${s.kind === 'post' ? 'A post' : s.label}`, s.why ?? (s.kind === 'post' ? 'From the shoot, for your OK' : ''), s.cents, s.stage, s.kind, s.status === 'planned' && s.kind !== 'post'))}
            {ev.length > 0 && <><div style={k2}>Already on your calendar</div>{ev.map((e) => <a key={e.id} href={e.href ?? '#'} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: `0.5px solid ${C.line}`, fontSize: 13.5, fontWeight: 600, color: C.ink, textDecoration: 'none' }}><span style={{ width: 7, height: 7, borderRadius: 99, background: '#c9c9d0', flex: 'none' }} /><span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}</span><small style={{ color: C.mute, fontSize: 11.5 }}>{e.status}</small></a>)}</>}
            {state !== 'done' && <button type="button" onClick={() => { setAdding(day); setDay(null) }} style={{ ...cta, marginTop: 14, justifyContent: 'center', gap: 8 }}><Plus size={16} /> Add something on {niceDate(day)}</button>}
          </div>
        </div>) })()}

      {/* add something, on a day */}
      {adding && (() => { const tiles = m.tiles ?? []; const groups = (['aware', 'interest', 'action', 'keep'] as Stage[]).map((st) => [st, tiles.filter((t) => t.stage === st)] as const).filter(([, ts]) => ts.length); return (
        <div role="dialog" aria-modal="true" onClick={() => setAdding(null)} style={sheet}>
          <div className="cr pm-in" onClick={(e) => e.stopPropagation()} style={sheetIn}>
            <style>{DRAW_CSS}</style>
            <div style={{ width: 38, height: 4, borderRadius: 99, background: '#e2e2e7', margin: '0 auto 10px' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0 6px' }}><span style={{ width: 34 }} /><span style={{ flex: 1, textAlign: 'center', fontFamily: DISPLAY, fontSize: 18, fontWeight: 600 }}>Add on {niceDate(adding)}</span><button type="button" onClick={() => setAdding(null)} aria-label="Close" style={{ width: 34, height: 34, borderRadius: 99, border: `0.5px solid ${C.line}`, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={16} /></button></div>
            {groups.map(([st, ts]) => (
              <div key={st}>
                <div style={k2}>{STAGE_WORD[st]}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginTop: 8 }}>
                  {ts.map((t) => <button key={t.kind} type="button" disabled={busy != null} onClick={() => addSlot(t, adding)} style={{ borderRadius: 16, padding: '12px 6px 10px', textAlign: 'center', background: '#fff', border: '1.5px dashed #c9c9d0', font: 'inherit', color: C.ink, cursor: 'pointer', ['--c2' as string]: HUE[st] }}><span style={{ width: 36, margin: '0 auto 6px', display: 'block' }}><Drawing spec={{ scene: SCENE[t.kind] }} name="" rating="" t={(x) => x} /></span><b style={{ display: 'block', fontSize: 12, lineHeight: 1.2 }}>{t.label}</b><small style={{ display: 'block', fontSize: 10.5, color: C.mute, marginTop: 2 }}>{t.cents ? dollars(t.cents) : 'Free'}</small><span style={{ width: 22, height: 22, borderRadius: 99, background: C.ink, color: '#fff', display: 'grid', placeItems: 'center', margin: '6px auto 0' }}>{busy === t.kind ? <Loader2 size={11} className="mvp-spin" /> : <Plus size={12} />}</span></button>)}
                </div>
              </div>
            ))}
            {tiles.find((t) => t.why) && <div style={{ fontSize: 12, color: C.mute, marginTop: 12, lineHeight: 1.45 }}>{tiles.filter((t) => t.why).map((t) => t.why).join('. ')}.</div>}
          </div>
        </div>) })()}

      {/* start: what happens, and what we need from you */}
      {confirm && (
        <div role="dialog" aria-modal="true" onClick={() => setConfirm(false)} style={sheet}>
          <div className="cr pm-in" onClick={(e) => e.stopPropagation()} style={sheetIn}>
            <div style={{ width: 38, height: 4, borderRadius: 99, background: '#e2e2e7', margin: '0 auto 10px' }} />
            <div style={{ fontFamily: DISPLAY, fontSize: 23, fontWeight: 600, letterSpacing: '-.02em', margin: '4px 2px 12px' }}>Start {name}</div>
            {[
              shoot ? ['The shoot day books', `${niceDate(shoot.date)}. Paid before the day.`] : null,
              creator ? [`${m.creator?.name.split(' ')[0] ?? 'The creator'} gets the ask`, 'They say yes in their own time.'] : null,
              count('post') ? [`${count('post')} posts are ordered`, 'Written from the shoot. Each one waits for your OK.'] : null,
              count('graphic') || count('reel') || count('print') ? ['Graphics and Reels follow', 'Each becomes a request a week before its date.'] : null,
              ['Nothing is charged today', 'Every paid piece is approved first.'],
            ].filter(Boolean).map((r, i) => <div key={i} style={{ display: 'flex', gap: 10, padding: '9px 0', borderBottom: `0.5px solid ${C.line}`, fontSize: 14, fontWeight: 600 }}><Check size={16} color={C.greenDk} style={{ flex: 'none', marginTop: 2 }} /><span>{r![0]}<small style={{ display: 'block', fontWeight: 500, color: C.mute, fontSize: 12, marginTop: 2 }}>{r![1]}</small></span></div>)}
            {needs.length > 0 && <><div style={{ ...k2, margin: '14px 0 2px' }}>What we need from you</div>{needs.map(([t, d], i) => <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: `0.5px solid ${C.line}`, fontSize: 13.5, fontWeight: 600 }}><span style={{ width: 22, height: 22, borderRadius: 99, background: C.greenSoft, color: C.greenDk, display: 'grid', placeItems: 'center', flex: 'none', fontSize: 11, fontWeight: 800 }}>{i + 1}</span><span>{t}<small style={{ display: 'block', fontWeight: 500, color: C.mute, fontSize: 11.5, marginTop: 1 }}>{d}</small></span></div>)}</>}
            <button type="button" disabled={busy != null} onClick={start} style={{ ...cta, marginTop: 14, justifyContent: 'center', gap: 8 }}>{busy === 'start' ? <Loader2 size={16} className="mvp-spin" /> : <Check size={16} />} Start {name}, {dollars(m.total)} after approval</button>
            <button type="button" onClick={() => setConfirm(false)} style={{ ...cta, marginTop: 10, justifyContent: 'center', background: '#fff', color: C.ink, border: `0.5px solid ${C.line}` }}>Not yet</button>
          </div>
        </div>
      )}
    </div>
  )
}
