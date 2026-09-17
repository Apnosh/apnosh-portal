'use client'
/**
 * INFLUENCERS (owner 2026-09-17): two doors. Find one for me, or browse the marketplace.
 * =====================================================================================
 * Find one for me is honest about what it is: a team that knows the creators picks two, with a
 * reason each, and the owner approves. The marketplace door opens the real list, filtered to
 * food creators in their state. Both start from the count that is actually there.
 */
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, Check, Loader2, X } from 'lucide-react'
import Link from 'next/link'
import { C, DISPLAY } from '../tokens'
import { Drawing } from './drawings'

interface Ctx { creators: number; state: string; monthlyBudget: number | null; city: string | null }
interface Line { key: string; label: string; detail: string; date: string | null; cost: number | null; status: string; ref: { kind: string; id: string | null; href?: string } | null; why?: string }
const GOALS = ['New faces nearby', 'Fill a slow night', 'Launch a dish', 'Show off the place']
const COMPS = ['A meal on us', 'A meal plus $100', 'A meal plus $250', 'Flexible']
const WINDOWS = ['The next two weeks', 'This month', 'A date I have in mind']
const POSTS = ['A Reel and a Story', 'A Reel', 'A Story', 'A post and a Story']
const niceDate = (iso: string | null) => { if (!iso) return ''; const d = new Date(iso.slice(0, 10) + 'T12:00:00'); return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) }
const dollars = (c: number | null) => (c == null ? '' : `$${Math.round(c / 100).toLocaleString()}`)

export default function InfluencersSheet({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose])
  useEffect(() => {
    const y = window.scrollY; const b = document.body.style
    const prev = { position: b.position, top: b.top, width: b.width, overflow: b.overflow }
    b.position = 'fixed'; b.top = `-${y}px`; b.width = '100%'; b.overflow = 'hidden'
    return () => { b.position = prev.position; b.top = prev.top; b.width = prev.width; b.overflow = prev.overflow; window.scrollTo(0, y) }
  }, [])
  const [vv, setVv] = useState<{ h: number; top: number } | null>(null)
  useEffect(() => {
    const v = window.visualViewport
    const read = () => setVv(v ? { h: Math.round(v.height), top: Math.round(v.offsetTop) } : null)
    read(); v?.addEventListener('resize', read); v?.addEventListener('scroll', read)
    return () => { v?.removeEventListener('resize', read); v?.removeEventListener('scroll', read) }
  }, [])
  const [ctx, setCtx] = useState<Ctx | null>(null)
  useEffect(() => { fetch(`/api/dashboard/growth-plan?clientId=${clientId}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((j) => { if (j) setCtx(j) }).catch(() => {}) }, [clientId])

  const [step, setStep] = useState<'door' | 'ask' | 'plan' | 'done'>('door')
  const [goal, setGoal] = useState(GOALS[0])
  const [comp, setComp] = useState(COMPS[0])
  const [win, setWin] = useState(WINDOWS[0])
  const [when, setWhen] = useState('')
  const [post, setPost] = useState(POSTS[0])
  const [who, setWho] = useState('')
  const [posting, setPosting] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [result, setResult] = useState<{ plan: Line[]; errors: string[] } | null>(null)

  const preview = useMemo((): Line[] => {
    const today = new Date().toISOString().slice(0, 10)
    const inFive = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10)
    return [
      { key: 'ask', label: 'The team looks', detail: 'Two picks with a reason each: local, your kind of food, their audience', date: today, cost: null, status: 'with_team', ref: null, why: 'There is no matching engine yet. People who know the creators do this by hand' },
      { key: 'pick', label: 'You approve a pick', detail: 'One tap in your thread', date: inFive, cost: null, status: 'later', ref: null },
      { key: 'visit', label: 'The visit', detail: `${comp}. A date you both agree`, date: null, cost: null, status: 'later', ref: null, why: comp === 'A meal on us' ? 'Most local creators come for the meal when the place looks good on camera' : 'A fee gets a firmer date and a bigger audience' },
      { key: 'post', label: 'Their post', detail: `${post}, tagged, and we repost it`, date: null, cost: null, status: 'later', ref: null },
      { key: 'results', label: 'What it did', detail: 'Their views and yours, and new followers, in Insights', date: null, cost: null, status: 'later', ref: null },
    ]
  }, [comp, post])

  const commit = async () => {
    if (posting) return
    setPosting(true); setErr(null)
    try {
      const r = await fetch('/api/dashboard/growth-plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, kind: 'influencers', goal, comp, window: win === 'A date I have in mind' && when ? niceDate(when) : win, post, who, whys: Object.fromEntries(preview.filter((l) => l.why).map((l) => [l.key, l.why])) }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Could not send it')
      setResult({ plan: Array.isArray(j.plan) ? j.plan : [], errors: Array.isArray(j.errors) ? j.errors : [] })
      setStep('done')
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not send it') }
    setPosting(false)
  }

  if (!mounted) return null
  const hue = '#6a39de'
  const chip = (on: boolean): React.CSSProperties => ({ fontSize: 12.5, fontWeight: 700, padding: '7px 12px', borderRadius: 99, border: `1.5px solid ${on ? C.ink : C.line}`, background: on ? C.ink : '#fff', color: on ? '#fff' : C.ink, cursor: 'pointer', font: 'inherit' })
  const cta: React.CSSProperties = { marginTop: 18, width: '100%', height: 50, borderRadius: 99, border: 0, background: C.ink, color: '#fff', fontWeight: 700, fontSize: 15, font: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', textDecoration: 'none' }
  const h2: React.CSSProperties = { fontFamily: DISPLAY, fontSize: 23, fontWeight: 600, letterSpacing: '-.02em', margin: '4px 2px 12px', lineHeight: 1.15 }
  const h3: React.CSSProperties = { fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.mute, margin: '18px 0 8px' }
  const sub: React.CSSProperties = { display: 'block', fontWeight: 500, color: C.mute, fontSize: 12, marginTop: 2 }
  const input: React.CSSProperties = { display: 'block', width: '100%', marginTop: 6, border: `0.5px solid ${C.line}`, borderRadius: 12, padding: '11px 12px', fontSize: 14.5, fontWeight: 500, color: C.ink, background: '#fff', font: 'inherit', boxSizing: 'border-box', outline: 'none' }
  const Line_ = ({ l }: { l: Line }) => (
    <div style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: `0.5px solid ${C.line}`, alignItems: 'flex-start' }}>
      <span style={{ width: 62, flex: 'none', fontSize: 12, fontWeight: 700, color: C.mute, paddingTop: 2 }}>{l.date ? niceDate(l.date).replace(/^(\w+), /, '$1 ') : 'Soon'}</span>
      <span style={{ flex: 1, minWidth: 0 }}><b style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>{l.label}</b><small style={sub}>{l.detail}</small>{l.why && <small style={{ ...sub, color: C.greenDk, fontWeight: 600 }}>{l.why}</small>}</span>
      {l.cost != null && l.cost > 0 && <b style={{ fontSize: 13 }}>{dollars(l.cost)}</b>}
    </div>
  )

  return createPortal(
    <div className="cr" role="dialog" aria-modal="true" aria-label="Influencers" style={{ position: 'fixed', left: 0, right: 0, top: vv ? vv.top : 0, height: vv ? vv.h : '100dvh', zIndex: 80, background: 'rgba(20,22,26,.42)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', touchAction: 'none' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, maxHeight: vv ? vv.h - 16 : '92dvh', overflowY: 'auto', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', touchAction: 'pan-y', background: '#fff', borderRadius: '24px 24px 0 0', padding: '10px 18px calc(24px + env(safe-area-inset-bottom))', boxSizing: 'border-box', color: C.ink, ['--c2' as string]: hue } as React.CSSProperties}>
        <div style={{ width: 38, height: 4, borderRadius: 99, background: '#e2e2e7', margin: '0 auto 10px' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0 10px' }}>
          {step === 'ask' || step === 'plan' ? <button type="button" onClick={() => setStep(step === 'plan' ? 'ask' : 'door')} aria-label="Back" style={{ width: 34, height: 34, borderRadius: 99, border: `0.5px solid ${C.line}`, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><ArrowLeft size={16} /></button> : <span style={{ width: 34 }} />}
          <span style={{ flex: 1, textAlign: 'center', fontFamily: DISPLAY, fontSize: 18, fontWeight: 600, letterSpacing: '-.01em' }}>Influencers</span>
          <button type="button" onClick={onClose} aria-label="Close" style={{ width: 34, height: 34, borderRadius: 99, border: `0.5px solid ${C.line}`, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={16} /></button>
        </div>

        {step === 'door' && (
          <>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              <span style={{ width: 72, flex: 'none' }}><Drawing spec={{ scene: 'creator' }} name="" rating="" t={(s) => s} /></span>
              <div style={h2}>Get a creator in the door</div>
            </div>
            <div style={{ fontSize: 13, color: C.mute, lineHeight: 1.45, marginTop: -4 }}>{ctx ? (ctx.creators > 0 ? `${ctx.creators} food creator${ctx.creators === 1 ? '' : 's'} on the marketplace in ${ctx.state}.` : `No food creators listed for ${ctx.state} yet. The team still knows who to call.`) : ''}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 16 }}>
              <button type="button" onClick={() => setStep('ask')} style={{ border: `1.5px solid ${C.line}`, borderRadius: 18, padding: '16px 12px', background: '#fff', cursor: 'pointer', font: 'inherit', color: C.ink, textAlign: 'center' }}>
                <span style={{ display: 'block', width: 60, margin: '0 auto 8px' }}><Drawing spec={{ scene: 'dm' }} name="" rating="" t={(s) => s} /></span>
                <b style={{ display: 'block', fontSize: 14 }}>Pick one for me</b><small style={{ display: 'block', color: C.mute, fontSize: 11.5, marginTop: 4, lineHeight: 1.35 }}>Say the goal and the comp. The team sends two picks with a reason each.</small>
              </button>
              <Link href={`/dashboard/marketplace?category=food_influencer&clientId=${clientId}`} style={{ border: `1.5px solid ${C.line}`, borderRadius: 18, padding: '16px 12px', background: '#fff', font: 'inherit', color: C.ink, textAlign: 'center', textDecoration: 'none' }}>
                <span style={{ display: 'block', width: 60, margin: '0 auto 8px' }}><Drawing spec={{ scene: 'grid' }} name="" rating="" t={(s) => s} /></span>
                <b style={{ display: 'block', fontSize: 14 }}>Browse the marketplace</b><small style={{ display: 'block', color: C.mute, fontSize: 11.5, marginTop: 4, lineHeight: 1.35 }}>See who is listed, what they charge, and book a date yourself.</small>
              </Link>
            </div>
            <div style={{ fontSize: 12, color: C.mute, marginTop: 14, lineHeight: 1.5 }}>Either way nothing is charged until you approve their delivery.</div>
          </>
        )}

        {step === 'ask' && (
          <>
            <div style={h2}>What is it for?</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{GOALS.map((g) => <button key={g} type="button" onClick={() => setGoal(g)} style={chip(goal === g)}>{g}</button>)}</div>
            <div style={h3}>What they get</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{COMPS.map((c) => <button key={c} type="button" onClick={() => setComp(c)} style={chip(comp === c)}>{c}</button>)}</div>
            <div style={{ fontSize: 12, color: C.greenDk, fontWeight: 600, marginTop: 8, lineHeight: 1.4 }}>{comp === 'A meal on us' ? 'Most local creators come for the meal when the place looks good on camera. Start here.' : comp === 'Flexible' ? 'The team asks each pick what they need and tells you before anything is agreed.' : 'A fee gets a firmer date and a bigger audience. The team confirms the number with the pick.'}</div>
            <div style={h3}>When</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{WINDOWS.map((w) => <button key={w} type="button" onClick={() => setWin(w)} style={chip(win === w)}>{w}</button>)}</div>
            {win === 'A date I have in mind' && <input type="date" value={when} onChange={(e) => setWhen(e.target.value)} style={input} />}
            <div style={h3}>What they post</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{POSTS.map((p) => <button key={p} type="button" onClick={() => setPost(p)} style={chip(post === p)}>{p}</button>)}</div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginTop: 14 }}>Anyone you already like<span style={{ fontWeight: 500, color: C.faint, marginLeft: 4 }}>optional</span><input type="text" value={who} onChange={(e) => setWho(e.target.value)} placeholder="@seattlefoodie, or the kind of account" style={input} /></label>
            <button type="button" onClick={() => setStep('plan')} style={cta}>Next</button>
          </>
        )}

        {step === 'plan' && (
          <>
            <div style={h2}>Here is the plan</div>
            <div>{preview.map((l) => <Line_ key={l.key} l={l} />)}</div>
            {err && <div style={{ fontSize: 12.5, color: '#c92d32', marginTop: 10 }}>{err}</div>}
            <button type="button" onClick={commit} disabled={posting} style={{ ...cta, opacity: posting ? .6 : 1 }}>{posting ? <Loader2 size={16} className="mvp-spin" /> : null} {posting ? 'Sending' : 'Ask the team'}</button>
            <div style={{ fontSize: 12, color: C.mute, textAlign: 'center', marginTop: 10, lineHeight: 1.45 }}>No charge now. The creator is paid only when you approve what they made.</div>
          </>
        )}

        {step === 'done' && result && (
          <>
            <div style={{ padding: '14px 4px 6px', textAlign: 'center' }}>
              <span style={{ display: 'inline-flex', width: 56, height: 56, borderRadius: 99, background: C.greenSoft, color: C.greenDk, alignItems: 'center', justifyContent: 'center' }}><Check size={26} strokeWidth={2.5} /></span>
              <div style={{ ...h2, marginTop: 12 }}>The team is looking</div>
            </div>
            <div>{result.plan.map((l) => <Line_ key={l.key} l={l} />)}</div>
            {result.errors.map((e, i) => <div key={i} style={{ fontSize: 12.5, color: '#c92d32', marginTop: 10 }}>{e}</div>)}
            <button type="button" onClick={onClose} style={cta}>Done</button>
            <div style={{ fontSize: 12.5, color: C.mute, textAlign: 'center', marginTop: 10 }}>The picks land in your thread and on Coming up.</div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
