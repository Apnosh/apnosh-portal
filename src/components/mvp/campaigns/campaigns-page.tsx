'use client'
/**
 * CAMPAIGNS (owner 2026-09-22, "rethink the campaigns page" → "would one list be good enough?"):
 * one list of everything ordered or planned. A strip picks the window: Upcoming (from today,
 * every month) or one month. Chips filter to one campaign: a holiday, the month's rhythm, an
 * announcement, an older campaign. The same row everywhere; tap it to adjust the thing on its
 * own page; Take off while the plan still owns it. Plan ahead drafts and starts; this watches.
 */
import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, ChevronRight, CalendarDays, Loader2, X } from 'lucide-react'
import { C } from '../tokens'
import { Drawing, DRAW_CSS, type Scene } from '../create/drawings'

type PieceState = 'needs' | 'coming' | 'team' | 'live' | 'done' | 'stopped' | 'draft'
interface Group { kind: 'occasion' | 'month' | 'announce' | 'campaign' | 'other'; id: string; label: string; emoji?: string }
interface Piece { id: string; source: string; kind: string; label: string; detail: string; date: string | null; allMonth: boolean; state: PieceState; cents: number | null; href: string | null; group: Group; month: string | null; drop?: { month: string; key: string } | null }

const STAGE_OF: Record<string, string> = { post: '#2e9a78', boost: '#2e9a78', creator: '#2e9a78', ad: '#2e9a78', reel: '#3b6fd4', graphic: '#3b6fd4', photos: '#3b6fd4', brand: '#3b6fd4', site: '#3b6fd4', menu: '#3b6fd4', offer: '#6a39de', taste: '#6a39de', sticky: '#6a39de', print: '#6a39de', apps: '#d99a1e', google: '#d99a1e', email: '#d99a1e', review: '#0f97a8', team: '#0f97a8', dish: '#6a39de', else: '#6e6e73' }
const SCENE_OF = (k: string): Scene => (({ post: 'post', boost: 'boost', creator: 'creator', reel: 'reel', graphic: 'graphic', photos: 'photos', print: 'print', offer: 'offer', taste: 'dish', sticky: 'sticky', review: 'review', team: 'grid', brand: 'brand', site: 'site', email: 'email', ad: 'ad', menu: 'sitemenu', apps: 'apps', google: 'google', else: 'else' } as Record<string, Scene>)[k] ?? 'else')
const STATE_WORD: Record<PieceState, [string, string, string]> = { needs: ['needs you', '#fff4e0', '#8a5a0c'], coming: ['coming', '#f2f2f5', '#6e6e73'], team: ['with the team', '#eaf7f3', '#2e9a78'], live: ['live', '#eaf7f3', '#2e9a78'], done: ['done', '#f2f2f5', '#aeaeb2'], stopped: ['stopped', '#fbeaea', '#c92d32'], draft: ['not started', '#f2f2f5', '#aeaeb2'] }
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dt = (iso: string) => new Date(iso + 'T12:00:00')
const nice = (iso: string) => { const d = dt(iso); return `${WD[d.getDay()]} ${MO[d.getMonth()]} ${d.getDate()}` }
const dollars = (c: number) => `$${Math.round(c / 100).toLocaleString()}`
const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
const ymd = (d: Date) => `${ym(d)}-${String(d.getDate()).padStart(2, '0')}`
const MONTH_NAME = (m: string) => new Date(m + '-01T12:00:00').toLocaleDateString('en-US', { month: 'long' })
const weekOf = (iso: string) => { const d = dt(iso); d.setDate(d.getDate() - d.getDay()); return ymd(d) }
const addMonths = (m: string, n: number) => { const [y, mo] = m.split('-').map(Number); return ym(new Date(y, mo - 1 + n, 1)) }

export default function CampaignsPage({ clientId }: { clientId: string }) {
  const q = `?clientId=${clientId}`
  const thisMonth = ym(new Date()); const today = ymd(new Date())
  const [win, setWin] = useState<string>('up') // 'up' or a month
  const [filter, setFilter] = useState<string>('all')
  const [pieces, setPieces] = useState<Piece[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const from = `${addMonths(thisMonth, -1)}-01`; const to = (() => { const [y, mo] = addMonths(thisMonth, 2).split('-').map(Number); return ymd(new Date(y, mo, 0)) })()
  const load = () => fetch(`/api/dashboard/pieces?clientId=${clientId}&from=${from}&to=${to}`, { cache: 'no-store' }).then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Could not read your campaigns'); setPieces(j.pieces as Piece[]) }).catch((e) => setErr(e instanceof Error ? e.message : 'Could not read your campaigns'))
  useEffect(() => { load() }, [clientId]) // eslint-disable-line react-hooks/exhaustive-deps
  const drop = async (p: Piece) => { if (!p.drop) return; setBusy(p.id); try { const r = await fetch('/api/dashboard/plan-month', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, month: p.drop.month, action: 'drop', key: p.drop.key }) }); if (!r.ok) throw new Error('Could not take it off'); await load() } catch (e) { setErr(e instanceof Error ? e.message : 'Could not take it off') } setBusy(null) }

  const months = [addMonths(thisMonth, -1), thisMonth, addMonths(thisMonth, 1), addMonths(thisMonth, 2)]
  /* the window: upcoming is everything from today across the months; a month is that month */
  const inWin = (p: Piece) => win === 'up' ? (p.state !== 'done' && p.state !== 'stopped' && p.state !== 'draft' && (!p.date || p.date >= today)) : (p.month === win || (p.allMonth && p.month == null))
  const windowed = useMemo(() => (pieces ?? []).filter(inWin), [pieces, win]) // eslint-disable-line react-hooks/exhaustive-deps
  /* the chips: every campaign present in the window */
  const chips = useMemo(() => { const g = new Map<string, { group: Group; n: number }>(); for (const p of windowed) { const k = `${p.group.kind}:${p.group.id}`; const c = g.get(k) ?? { group: p.group, n: 0 }; c.n++; g.set(k, c) } const order = { occasion: 0, announce: 1, month: 2, campaign: 3, other: 4 }; return [...g.entries()].sort(([, a], [, b]) => order[a.group.kind] - order[b.group.kind] || b.n - a.n) }, [windowed])
  const shown = useMemo(() => (filter === 'all' ? windowed : windowed.filter((p) => `${p.group.kind}:${p.group.id}` === filter)), [windowed, filter])
  useEffect(() => { if (filter !== 'all' && !chips.some(([k]) => k === filter)) setFilter('all') }, [chips, filter])
  const monthTotal = (m: string) => (pieces ?? []).filter((p) => p.month === m && p.state !== 'draft').reduce((a, p) => a + (p.cents ?? 0), 0)
  const monthState = (m: string) => { const ps = (pieces ?? []).filter((p) => p.month === m); if (!ps.length) return 'none'; if (ps.every((p) => p.state === 'draft')) return 'draft'; if (m < thisMonth) return 'ran'; return 'on' }

  const chip = (s: PieceState) => { const [w, bg, fg] = STATE_WORD[s]; return <span style={{ fontSize: 10.5, fontWeight: 800, padding: '3px 8px', borderRadius: 99, background: bg, color: fg, whiteSpace: 'nowrap', flex: 'none' }}>{w}</span> }
  const row = (p: Piece, opts: { showDate?: boolean; label?: string; sub?: string } = {}) => {
    const faded = p.state === 'draft' || p.state === 'done'
    const tag = filter === 'all' && p.group.kind !== 'month' && p.group.kind !== 'other' ? p.group.label : null
    const inner = (
      <>
        <span style={{ width: 30, flex: 'none', ['--c2' as string]: STAGE_OF[p.kind] ?? '#6e6e73', opacity: faded ? .6 : 1 }}><Drawing spec={{ scene: SCENE_OF(p.kind) }} now={p.state === 'done'} name="" rating="" t={(x) => x} /></span>
        <span style={{ flex: 1, minWidth: 0 }}><span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.group.emoji ? `${p.group.emoji} ` : ''}{opts.label ?? p.label}</span><small style={{ display: 'block', fontWeight: 500, color: C.mute, fontSize: 11.5, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opts.sub ?? [opts.showDate !== false && p.date ? nice(p.date) : p.allMonth ? 'All month' : '', tag && !p.group.emoji ? tag : '', p.detail].filter(Boolean).join(' · ')}</small></span>
        {chip(p.state)}
        <span style={{ fontSize: 12.5, color: p.cents ? C.ink : C.mute, fontWeight: 700, width: 46, textAlign: 'right', flex: 'none' }}>{p.cents ? dollars(p.cents) : 'Free'}</span>
        {p.drop ? <button type="button" aria-label="Take it off" disabled={busy != null} onClick={(e) => { e.preventDefault(); e.stopPropagation(); drop(p) }} style={{ width: 24, height: 24, borderRadius: 99, border: `0.5px solid ${C.line}`, background: '#fff', color: C.mute, display: 'grid', placeItems: 'center', cursor: 'pointer', flex: 'none' }}>{busy === p.id ? <Loader2 size={10} className="mvp-spin" /> : <X size={11} />}</button> : <ChevronRight size={15} color={C.faint} style={{ flex: 'none' }} />}
      </>
    )
    const style: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: `0.5px solid ${C.line}`, fontSize: 13.5, fontWeight: 600, color: faded ? C.mute : C.ink, textDecoration: 'none', cursor: 'pointer' }
    return p.href ? <a key={p.id} href={p.href.includes('?') ? `${p.href}&clientId=${clientId}` : `${p.href}${q}`} style={style}>{inner}</a> : <div key={p.id} style={style}>{inner}</div>
  }
  /* posts collapse by week unless they belong to a holiday or an announcement */
  const collapse = (ps: Piece[]): (Piece & { n?: number; days?: string })[] => {
    const out: (Piece & { n?: number; days?: string })[] = []; const byWeek = new Map<string, Piece[]>()
    for (const p of ps) { if (p.kind === 'post' && p.group.kind === 'month' && p.date) { const k = `${weekOf(p.date)}:${p.state}`; byWeek.set(k, [...(byWeek.get(k) ?? []), p]) } else out.push(p) }
    for (const [, xs] of byWeek) out.push({ ...xs[0], id: `posts:${xs[0].id}`, n: xs.length, days: xs.map((x) => WD[dt(x.date!).getDay()]).join(' · '), drop: null })
    return out.sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'))
  }
  const rows = (ps: Piece[], showDate = true) => collapse(ps).map((p) => row(p, p.n && p.n > 1 ? { label: `${p.n} posts`, sub: p.days } : { showDate }))
  const k2: React.CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: C.mute, margin: '16px 0 2px' }
  const cta: React.CSSProperties = { width: '100%', height: 48, borderRadius: 99, border: 0, background: C.ink, color: '#fff', fontWeight: 700, fontSize: 14.5, font: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 18px', cursor: 'pointer', boxSizing: 'border-box', textDecoration: 'none' }

  if (err && !pieces) return <div className="cr" style={{ padding: 24, color: '#c92d32', fontSize: 13 }}>{err}</div>
  if (!pieces) return <div style={{ padding: 40, textAlign: 'center', color: C.mute }}><Loader2 size={18} className="mvp-spin" /></div>

  /* the sections: upcoming by nearness; a month by week */
  const sections: [string, Piece[], boolean][] = (() => {
    if (win === 'up') {
      const wk = weekOf(today); const nextWk = ymd(new Date(dt(wk).getTime() + 7 * 86400000)); const after = ymd(new Date(dt(wk).getTime() + 14 * 86400000))
      return ([['Needs you', shown.filter((p) => p.state === 'needs'), true], ['This week', shown.filter((p) => p.state !== 'needs' && p.date && p.date < nextWk), true], ['Next week', shown.filter((p) => p.state !== 'needs' && p.date && p.date >= nextWk && p.date < after), true], ['Later', shown.filter((p) => p.state !== 'needs' && p.date && p.date >= after), true], ['All month', shown.filter((p) => p.state !== 'needs' && !p.date), false]] as [string, Piece[], boolean][]).filter(([, ps]) => ps.length)
    }
    const out: [string, Piece[], boolean][] = []
    const am = shown.filter((p) => p.allMonth); if (am.length) out.push(['All month', am, false])
    const byWeek = new Map<string, Piece[]>(); for (const p of shown.filter((p) => !p.allMonth && p.date)) { const k = weekOf(p.date!); byWeek.set(k, [...(byWeek.get(k) ?? []), p]) }
    for (const [wk, ps] of [...byWeek.entries()].sort(([a], [b]) => a.localeCompare(b))) { const ds = ps.map((p) => p.date!).sort(); const a = dt(ds[0]), b = dt(ds[ds.length - 1]); out.push([a.getDate() === b.getDate() ? `${MO[a.getMonth()]} ${a.getDate()}` : `${MO[a.getMonth()]} ${a.getDate()} to ${b.getDate()}`, ps, true]) }
    const nd = shown.filter((p) => !p.allMonth && !p.date); if (nd.length) out.push(['No date yet', nd, false])
    return out
  })()
  const planMonth = win !== 'up' && win >= thisMonth ? win : null
  const st = planMonth ? monthState(planMonth) : null

  return (
    <div className="cr" style={{ padding: '6px 16px 24px', color: C.ink, maxWidth: 480, margin: '0 auto', boxSizing: 'border-box' }}>
      <style>{DRAW_CSS}{`@keyframes cp-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}.cp-in{animation:cp-in .22s cubic-bezier(.2,.7,.2,1)}.cp-chips{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;padding:2px 0}.cp-chips::-webkit-scrollbar{display:none}@media(prefers-reduced-motion:reduce){.cp-in{animation:none}}`}</style>

      {/* the window: upcoming, or one month */}
      <div style={{ display: 'flex', gap: 5 }}>
        <button type="button" onClick={() => setWin('up')} style={{ flex: 1.15, minWidth: 0, textAlign: 'left', font: 'inherit', border: 0, background: win === 'up' ? C.ink : '#f6f6f8', color: win === 'up' ? '#fff' : C.ink, borderRadius: 12, padding: '7px 9px', cursor: 'pointer' }}><b style={{ display: 'block', fontSize: 12.5 }}>Upcoming</b><small style={{ display: 'block', fontSize: 10.5, fontWeight: 700, marginTop: 1, color: win === 'up' ? 'rgba(255,255,255,.75)' : C.mute }}>from today</small></button>
        {months.map((m) => { const here = m === win; const s = monthState(m); const tot = monthTotal(m); return (
          <button key={m} type="button" onClick={() => setWin(m)} style={{ flex: 1, minWidth: 0, textAlign: 'left', font: 'inherit', border: 0, background: here ? C.ink : '#f6f6f8', color: here ? '#fff' : C.ink, borderRadius: 12, padding: '7px 8px', cursor: 'pointer' }}>
            <b style={{ display: 'block', fontSize: 12.5 }}>{MONTH_NAME(m).slice(0, 3)}</b>
            <small style={{ display: 'block', fontSize: 10.5, fontWeight: 700, marginTop: 1, color: here ? 'rgba(255,255,255,.75)' : s === 'on' ? C.greenDk : C.mute, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s === 'none' ? (m < thisMonth ? '—' : 'plan it') : s === 'draft' ? 'drafted' : s === 'ran' ? 'ran' : tot ? dollars(tot) : 'on'}</small>
          </button>) })}
      </div>

      {/* the chips: one campaign at a time */}
      {chips.length > 1 && (
        <div className="cp-chips" style={{ marginTop: 10 }}>
          {[['all', 'All', windowed.length] as [string, string, number], ...chips.map(([k, c]) => [k, `${c.group.emoji ? `${c.group.emoji} ` : ''}${c.group.label}`, c.n] as [string, string, number])].map(([k, l, n]) => <button key={k} type="button" onClick={() => setFilter(k)} style={{ flex: 'none', font: 'inherit', fontSize: 12, fontWeight: 700, padding: '6px 11px', borderRadius: 99, border: `1.5px solid ${filter === k ? C.ink : C.line}`, background: filter === k ? C.ink : '#fff', color: filter === k ? '#fff' : C.ink, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l}<span style={{ opacity: .6, fontWeight: 600 }}>{n}</span></button>)}
        </div>
      )}

      <div className="cp-in" key={`${win}:${filter}`}>
        {st === 'draft' && <a href={`/dashboard/plan${q}&month=${planMonth}`} style={{ ...cta, marginTop: 12 }}><span>Plan {MONTH_NAME(planMonth!)}</span><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 600, opacity: .85 }}>drafted, not started <ArrowRight size={16} /></span></a>}
        {sections.length === 0 && (
          <div style={{ marginTop: 18, border: `0.5px dashed ${C.line}`, borderRadius: 16, padding: '22px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{win === 'up' ? 'Nothing coming up.' : `Nothing on ${MONTH_NAME(win)} yet.`}</div>
            {(win === 'up' || win >= thisMonth) && <a href={`/dashboard/plan${q}${win !== 'up' ? `&month=${win}` : ''}`} style={{ ...cta, marginTop: 12, justifyContent: 'center', gap: 8 }}>{win === 'up' ? 'Plan ahead' : `Plan ${MONTH_NAME(win)}`} <ArrowRight size={16} /></a>}
          </div>
        )}
        {sections.map(([label, ps, showDate]) => <div key={label}><div style={k2}>{label}</div>{rows(ps, showDate)}</div>)}
        {win === 'up' && months.filter((m) => m >= thisMonth && monthState(m) === 'draft').map((m) => <a key={m} href={`/dashboard/plan${q}&month=${m}`} style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, padding: '11px 12px', borderRadius: 14, background: '#f6f6f8', fontSize: 13.5, fontWeight: 600, color: C.ink, textDecoration: 'none' }}><span style={{ flex: 1 }}>{MONTH_NAME(m)} is drafted, not started.<small style={{ display: 'block', fontWeight: 500, color: C.mute, fontSize: 11.5, marginTop: 1 }}>{(pieces ?? []).filter((p) => p.month === m).length} pieces · {dollars((pieces ?? []).filter((p) => p.month === m).reduce((a, p) => a + (p.cents ?? 0), 0))} planned</small></span><span style={{ fontSize: 13, fontWeight: 700, color: C.greenDk, display: 'inline-flex', alignItems: 'center', gap: 4 }}>Plan it <ArrowRight size={14} /></span></a>)}
        {win !== 'up' && sections.length > 0 && (() => { const drafted = shown.every((p) => p.state === 'draft'); const tot = shown.reduce((a, p) => a + (p.cents ?? 0), 0); return <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '12px 0 0', fontSize: 14, fontWeight: 800, color: drafted ? C.mute : C.ink }}><span>{filter === 'all' ? MONTH_NAME(win) : chips.find(([k]) => k === filter)?.[1].group.label}{drafted ? <small style={{ fontWeight: 600, color: C.mute }}> · planned</small> : null}</span><span>{dollars(tot)}</span></div> })()}
        {st === 'on' && filter !== 'all' && chips.find(([k]) => k === filter)?.[1].group.kind === 'occasion' && <a href={`/dashboard/plan${q}&month=${planMonth}`} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '12px 0 2px', fontSize: 13, fontWeight: 700, color: C.greenDk, textDecoration: 'none' }}>Add to {chips.find(([k]) => k === filter)?.[1].group.label} <ArrowRight size={14} /></a>}
      </div>

      <a href={`/dashboard/campaigns/calendar${q}`} style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 18, padding: '11px 0', borderTop: `0.5px solid ${C.line}`, fontSize: 14, fontWeight: 600, color: C.ink, textDecoration: 'none' }}><CalendarDays size={17} color={C.greenDk} /><span style={{ flex: 1 }}>Calendar</span><ChevronRight size={16} color={C.faint} /></a>
      {err && <div style={{ fontSize: 12.5, color: '#c92d32', marginTop: 10, textAlign: 'center' }}>{err}</div>}
    </div>
  )
}
