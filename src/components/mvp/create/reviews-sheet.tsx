'use client'
/**
 * GET REVIEWS, the honest version (owner 2026-09-17).
 * ==================================================
 * Starts from what we know: the rating and count on the listing, how many a month, how many are
 * waiting for a reply. One goal. Then only plays with a rail under them: the link, a QR card at
 * the counter, printed table tents, the link on the website, a staff ask card, and replying to
 * every review. No text asks, no email asks: the send rail does not exist, so those lines do not
 * either. The check-in is the listing's own count, 30 days out.
 */
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Copy, Loader2, X, Star } from 'lucide-react'
import { C, DISPLAY } from '../tokens'
import { Drawing } from './drawings'

interface Kit { name: string; rating: number | null; count: number | null; perMonth: number | null; last30: number; unreplied: number; placeId: string | null; reviewUrl: string | null; website: string | null; hasSite: boolean; guests: number }
interface Line { key: string; label: string; detail: string; date: string | null; cost: number | null; status: string; ref: { kind: string; id: string | null; href?: string } | null; why?: string }
type Also = 'print' | 'website' | 'team'

const niceDate = (iso: string | null) => { if (!iso) return ''; const d = new Date(iso.slice(0, 10) + 'T12:00:00'); return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) }

export default function ReviewsSheet({ clientId, onClose, onReply }: { clientId: string; onClose: () => void; onReply: () => void }) {
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

  const [kit, setKit] = useState<Kit | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [step, setStep] = useState<'plan' | 'done'>('plan')
  const [goal, setGoal] = useState(20)
  const [also, setAlso] = useState<Set<Also>>(new Set(['team']))
  const [card, setCard] = useState('')
  const [copied, setCopied] = useState<string | null>(null)
  const [posting, setPosting] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [result, setResult] = useState<{ plan: Line[]; errors: string[] } | null>(null)

  useEffect(() => {
    let live = true
    fetch(`/api/dashboard/reviews/kit?clientId=${clientId}`, { cache: 'no-store' })
      .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Could not read your listing'); return j as Kit })
      .then((k) => { if (!live) return; setKit(k); setAlso(new Set<Also>(['team', ...(k.hasSite ? ['website' as Also] : [])])); setCard(`When a guest says they loved it: "Would you leave us a quick Google review? It really helps a small place like ours." Then point to the card at the counter. Never for a discount, never pushy, only when they are happy.`) })
      .catch((e) => { if (live) setLoadErr(e instanceof Error ? e.message : 'Could not read your listing') })
    return () => { live = false }
  }, [clientId])

  const copy = (what: string, text: string) => { navigator.clipboard?.writeText(text).then(() => { setCopied(what); setTimeout(() => setCopied(null), 1500) }).catch(() => {}) }
  const monthsToGoal = kit?.perMonth ? Math.ceil(goal / kit.perMonth) : null
  const goalWhy = kit
    ? kit.perMonth
      ? `You get about ${kit.perMonth} a month now, so ${goal} more is ${monthsToGoal} month${monthsToGoal === 1 ? '' : 's'} at that pace. A card at the counter and a team that asks usually doubles it.`
      : `Not enough history yet to say how fast you get them. The listing count is the check-in, 30 days out.`
    : ''
  const preview = useMemo((): Line[] => {
    if (!kit) return []
    const today = new Date().toISOString().slice(0, 10)
    const L: Line[] = []
    L.push({ key: 'link', label: 'Your review link', detail: 'On the receipt, in the bio, in every thank-you', date: today, cost: null, status: 'done', ref: null, why: 'One tap from anywhere is how most reviews happen' })
    L.push({ key: 'qr', label: 'The counter card', detail: 'A QR to the link. Print it from here', date: today, cost: null, status: 'done', ref: null, why: 'The happiest guest is the one at the counter right now' })
    if (also.has('print')) L.push({ key: 'print', label: 'Printed table tents', detail: 'The team quotes it and ships it', date: null, cost: null, status: 'with_team', ref: null, why: 'Every table sees it, not only the counter' })
    if (also.has('website') && kit.hasSite) L.push({ key: 'website', label: 'The link on your website', detail: 'Footer and the thank-you page', date: null, cost: null, status: 'with_team', ref: null })
    if (also.has('team')) L.push({ key: 'team', label: 'The team knows the ask', detail: 'One card, sent to everyone on the portal', date: today, cost: null, status: 'done', ref: null, why: 'Asked reviews are most reviews' })
    if (kit.unreplied > 0) L.push({ key: 'reply', label: `Reply to the ${kit.unreplied} waiting`, detail: 'Reply now, from Create', date: today, cost: null, status: 'later', ref: null, why: 'A listing that answers gets more reviews' })
    L.push({ key: 'checkin', label: 'The check-in', detail: `${kit.count != null ? `${kit.count} reviews today` : 'Today\'s count'}, the goal is ${goal} more`, date: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10), cost: null, status: 'later', ref: null, why: 'Google updates the count on the listing, so this one measures itself' })
    return L
  }, [kit, also, goal])

  const commit = async () => {
    if (posting || !kit) return
    setPosting(true); setErr(null)
    try {
      const r = await fetch('/api/dashboard/reviews/kit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, goal, also: [...also], card: also.has('team') ? card : '', whys: Object.fromEntries(preview.filter((l) => l.why).map((l) => [l.key, l.why])) }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Could not make it happen')
      setResult({ plan: Array.isArray(j.plan) ? j.plan : [], errors: Array.isArray(j.errors) ? j.errors : [] })
      setStep('done')
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not make it happen') }
    setPosting(false)
  }

  if (!mounted) return null
  const hue = '#5b53d6'
  const cta: React.CSSProperties = { marginTop: 18, width: '100%', height: 50, borderRadius: 99, border: 0, background: C.ink, color: '#fff', fontWeight: 700, fontSize: 15, font: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer' }
  const chip = (on: boolean): React.CSSProperties => ({ fontSize: 12.5, fontWeight: 700, padding: '7px 12px', borderRadius: 99, border: `1.5px solid ${on ? C.ink : C.line}`, background: on ? C.ink : '#fff', color: on ? '#fff' : C.ink, cursor: 'pointer', font: 'inherit' })
  const h2: React.CSSProperties = { fontFamily: DISPLAY, fontSize: 23, fontWeight: 600, letterSpacing: '-.02em', margin: '4px 2px 12px', lineHeight: 1.15 }
  const h3: React.CSSProperties = { fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.mute, margin: '18px 0 8px' }
  const sub: React.CSSProperties = { display: 'block', fontWeight: 500, color: C.mute, fontSize: 12, marginTop: 2 }
  const rowS: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderBottom: `0.5px solid ${C.line}`, fontSize: 14, fontWeight: 600 }
  const Tick = ({ on }: { on: boolean }) => <span style={{ width: 22, height: 22, borderRadius: 7, border: `1.5px solid ${on ? C.ink : C.line}`, background: on ? C.ink : '#fff', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>{on && <Check size={14} strokeWidth={3} />}</span>
  const Line_ = ({ l }: { l: Line }) => (
    <div style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: `0.5px solid ${C.line}`, alignItems: 'flex-start' }}>
      <span style={{ width: 62, flex: 'none', fontSize: 12, fontWeight: 700, color: C.mute, paddingTop: 2 }}>{l.date ? niceDate(l.date).replace(/^(\w+), /, '$1 ') : 'Soon'}</span>
      <span style={{ flex: 1, minWidth: 0 }}><b style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>{l.label}</b><small style={sub}>{l.detail}</small>{l.why && <small style={{ ...sub, color: C.greenDk, fontWeight: 600 }}>{l.why}</small>}
        {l.ref?.href && l.key === 'qr' && <a href={l.ref.href} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 6, fontSize: 12.5, fontWeight: 700, color: C.ink, textDecoration: 'underline' }}>Open the card</a>}
        {l.ref?.href && l.key === 'link' && <button type="button" onClick={() => copy('link', l.ref!.href!)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 6, fontSize: 12.5, fontWeight: 700, color: C.ink, background: 'none', border: 0, padding: 0, cursor: 'pointer', font: 'inherit', textDecoration: 'underline' }}><Copy size={12} /> {copied === 'link' ? 'Copied' : 'Copy the link'}</button>}
        {l.key === 'reply' && <button type="button" onClick={onReply} style={{ display: 'inline-block', marginTop: 6, fontSize: 12.5, fontWeight: 700, color: C.ink, background: 'none', border: 0, padding: 0, cursor: 'pointer', font: 'inherit', textDecoration: 'underline' }}>Reply now</button>}
      </span>
    </div>
  )

  return createPortal(
    <div className="cr" role="dialog" aria-modal="true" aria-label="Get reviews" style={{ position: 'fixed', left: 0, right: 0, top: vv ? vv.top : 0, height: vv ? vv.h : '100dvh', zIndex: 80, background: 'rgba(20,22,26,.42)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', touchAction: 'none' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, maxHeight: vv ? vv.h - 16 : '92dvh', overflowY: 'auto', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', touchAction: 'pan-y', background: '#fff', borderRadius: '24px 24px 0 0', padding: '10px 18px calc(24px + env(safe-area-inset-bottom))', boxSizing: 'border-box', color: C.ink, ['--c2' as string]: hue } as React.CSSProperties}>
        <div style={{ width: 38, height: 4, borderRadius: 99, background: '#e2e2e7', margin: '0 auto 10px' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0 10px' }}>
          <span style={{ width: 34 }} />
          <span style={{ flex: 1, textAlign: 'center', fontFamily: DISPLAY, fontSize: 18, fontWeight: 600, letterSpacing: '-.01em' }}>Get reviews</span>
          <button type="button" onClick={onClose} aria-label="Close" style={{ width: 34, height: 34, borderRadius: 99, border: `0.5px solid ${C.line}`, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={16} /></button>
        </div>

        {!kit && !loadErr && <div style={{ padding: '30px 0', textAlign: 'center', color: C.mute }}><Loader2 size={20} className="mvp-spin" /></div>}
        {loadErr && <div style={{ fontSize: 13, color: '#c92d32', padding: '10px 0' }}>{loadErr}</div>}

        {kit && step === 'plan' && (
          <>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              <span style={{ width: 84, flex: 'none' }}><Drawing spec={{ scene: 'review' }} name="" rating="" t={(s) => s} /></span>
              <div>
                <div style={h2}>{kit.rating != null ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{kit.rating.toFixed(1)} <Star size={18} fill="#f0a12b" color="#f0a12b" /></span> : 'Your listing'}{kit.count != null && <span style={{ fontSize: 15, color: C.mute, fontWeight: 500, marginLeft: 8 }}>{kit.count} reviews</span>}</div>
                <div style={{ fontSize: 13, color: C.mute, lineHeight: 1.45, marginTop: -6 }}>{kit.perMonth ? `About ${kit.perMonth} a month. ` : ''}{kit.last30} in the last 30 days.{kit.unreplied > 0 ? ` ${kit.unreplied} waiting for a reply.` : ''}</div>
              </div>
            </div>
            {!kit.reviewUrl && <div style={{ fontSize: 13, color: '#8a5a0c', marginTop: 12, lineHeight: 1.45 }}>No Google listing on file yet, so there is no link to ask with. Connect Google first.</div>}

            <div style={h3}>How many more, in 30 days</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{[10, 20, 40].map((g) => <button key={g} type="button" onClick={() => setGoal(g)} style={chip(goal === g)}>+{g}</button>)}</div>
            <div style={{ fontSize: 12, color: C.greenDk, fontWeight: 600, marginTop: 8, lineHeight: 1.4 }}>{goalWhy}</div>

            <div style={h3}>The ask</div>
            {kit.reviewUrl && (
              <div style={{ border: `0.5px solid ${C.line}`, borderRadius: 16, padding: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/dashboard/reviews/qr?clientId=${clientId}&size=240`} alt="" width={84} height={84} style={{ borderRadius: 8, flex: 'none' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ display: 'block', fontSize: 14 }}>The counter card</b>
                  <small style={sub}>A QR straight to Write a review. Print it, or get table tents made.</small>
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                    <a href={`/dashboard/reviews/card?clientId=${clientId}`} target="_blank" rel="noreferrer" style={{ ...chip(true), textDecoration: 'none', display: 'inline-flex' }}>Open the card</a>
                    <button type="button" onClick={() => copy('link', kit.reviewUrl!)} style={{ ...chip(false), display: 'inline-flex', alignItems: 'center', gap: 5 }}><Copy size={12} /> {copied === 'link' ? 'Copied' : 'Copy the link'}</button>
                  </div>
                </div>
              </div>
            )}
            <div style={{ marginTop: 6 }}>
              {([
                ['print', 'Printed table tents', 'The team quotes it and ships it', true],
                ['website', 'The link on your website', kit.hasSite ? 'Footer and the thank-you page' : 'If we run your site', kit.hasSite],
                ['team', 'Tell the team the ask', 'One card: what to say, and when not to', true],
              ] as const).map(([k, label, detail, on]) => (
                <button key={k} type="button" disabled={!on} onClick={() => setAlso((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })} style={{ ...rowS, width: '100%', background: 'none', border: 0, borderBottom: `0.5px solid ${C.line}`, cursor: on ? 'pointer' : 'default', font: 'inherit', textAlign: 'left', color: C.ink, opacity: on ? 1 : .5 }}>
                  <span style={{ flex: 1 }}><b style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>{label}</b><small style={sub}>{detail}</small></span>
                  <Tick on={also.has(k)} />
                </button>
              ))}
            </div>
            {also.has('team') && <textarea value={card} onChange={(e) => setCard(e.target.value.slice(0, 1200))} rows={4} style={{ display: 'block', width: '100%', marginTop: 10, border: `0.5px solid ${C.line}`, borderRadius: 12, padding: '10px 12px', font: 'inherit', fontSize: 13.5, lineHeight: 1.5, color: C.ink, boxSizing: 'border-box', resize: 'none', outline: 'none' }} />}
            <div style={{ fontSize: 12, color: C.mute, marginTop: 10, lineHeight: 1.45 }}>No texts or emails asking for reviews yet. There is no way to send them for you, so they are not on the plan.</div>

            <div style={h3}>The plan</div>
            <div>{preview.map((l) => <Line_ key={l.key} l={l} />)}</div>
            {err && <div style={{ fontSize: 12.5, color: '#c92d32', marginTop: 10 }}>{err}</div>}
            <button type="button" onClick={commit} disabled={posting || !kit.reviewUrl} style={{ ...cta, opacity: posting || !kit.reviewUrl ? .6 : 1 }}>{posting ? <Loader2 size={16} className="mvp-spin" /> : null} {posting ? 'Making it happen' : 'Make it happen'}</button>
          </>
        )}

        {step === 'done' && result && (
          <>
            <div style={{ padding: '14px 4px 6px', textAlign: 'center' }}>
              <span style={{ display: 'inline-flex', width: 56, height: 56, borderRadius: 99, background: C.greenSoft, color: C.greenDk, alignItems: 'center', justifyContent: 'center' }}><Check size={26} strokeWidth={2.5} /></span>
              <div style={{ ...h2, marginTop: 12 }}>The ask is out</div>
            </div>
            <div>{result.plan.map((l) => <Line_ key={l.key} l={l} />)}</div>
            {result.errors.map((e, i) => <div key={i} style={{ fontSize: 12.5, color: '#c92d32', marginTop: 10 }}>{e}</div>)}
            {also.has('team') && card.trim() && <button type="button" onClick={() => copy('card', card)} style={{ ...cta, background: '#fff', color: C.ink, border: `0.5px solid ${C.line}` }}><Copy size={15} /> {copied === 'card' ? 'Copied' : 'Copy the team card'}</button>}
            <button type="button" onClick={onClose} style={cta}>Done</button>
            <div style={{ fontSize: 12.5, color: C.mute, textAlign: 'center', marginTop: 10 }}>The check-in is on Coming up.</div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
