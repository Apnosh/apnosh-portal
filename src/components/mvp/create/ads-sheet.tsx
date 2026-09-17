'use client'
/**
 * ADS (owner 2026-09-17): pick the platforms, more than one allowed.
 * =================================================================
 * Instagram and Facebook, and TikTok, can go live from the client's own ad account through the
 * Boost screen, so those lines open Boost with the goal already set, or say to connect the
 * account first. Google has no adapter here, so it is a team line at the paid-ads price: spend
 * at cost plus a share. A weekly amount, a number of weeks, and a check-in at the end.
 */
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, Check, Loader2, X } from 'lucide-react'
import { C, DISPLAY } from '../tokens'
import { Drawing } from './drawings'
import { BrandOrMark } from '../mvp-insights'

type Plat = 'meta' | 'tiktok' | 'google'
interface AdsRead { connected: boolean; platforms: { platform: string; payer: string | null; available: boolean; minDaily: number }[]; history: { perDollar: number } | null; peerRate: { perDollar: number } | null }
interface Line { key: string; label: string; detail: string; date: string | null; cost: number | null; status: string; ref: { kind: string; id: string | null; href?: string } | null; why?: string }
const PLATS: { id: Plat; label: string; icon: string; small: string }[] = [
  { id: 'meta', label: 'Instagram and Facebook', icon: 'instagram', small: 'Boost your best post to people nearby' },
  { id: 'tiktok', label: 'TikTok', icon: 'tiktok', small: 'Boost your own videos. $20 a day at least' },
  { id: 'google', label: 'Google', icon: 'google', small: 'Search and Maps, run by the team' },
]
const WEEKLY = [25, 50, 100, 200]
const WEEKS = [2, 4, 8]
const niceDate = (iso: string | null) => { if (!iso) return ''; const d = new Date(iso.slice(0, 10) + 'T12:00:00'); return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) }
const dollars = (c: number | null) => (c == null ? '' : `$${Math.round(c / 100).toLocaleString()}`)

export default function AdsSheet({ clientId, onClose }: { clientId: string; onClose: () => void }) {
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
  const [ads, setAds] = useState<AdsRead | null>(null)
  const [adsErr, setAdsErr] = useState<string | null>(null)
  useEffect(() => { fetch(`/api/dashboard/ads?clientId=${clientId}`, { cache: 'no-store' }).then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Could not read your ad accounts'); return j as AdsRead }).then(setAds).catch((e) => setAdsErr(e instanceof Error ? e.message : 'Could not read your ad accounts')) }, [clientId])

  const [step, setStep] = useState<'pick' | 'plan' | 'done'>('pick')
  const [plats, setPlats] = useState<Set<Plat>>(new Set(['meta']))
  const [weekly, setWeekly] = useState(50)
  const [weeks, setWeeks] = useState(4)
  const [creative, setCreative] = useState(false)
  const [posting, setPosting] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [result, setResult] = useState<{ plan: Line[]; errors: string[]; total: number } | null>(null)

  const live = (p: Plat) => !!ads?.platforms.find((x) => x.platform === p)?.payer
  const rate = ads?.history?.perDollar && ads.history.perDollar > 0 ? { n: ads.history.perDollar, word: 'at your own rate' } : ads?.peerRate?.perDollar ? { n: ads.peerRate.perDollar, word: 'at the rate other Apnosh restaurants see' } : { n: 150, word: 'at a plain local average' }
  const people = Math.round(weekly * weeks * rate.n)
  const NAMES: Record<Plat, string> = { meta: 'Instagram and Facebook', tiktok: 'TikTok', google: 'Google' }
  const preview = useMemo((): Line[] => {
    const today = new Date().toISOString().slice(0, 10)
    const L: Line[] = []
    for (const p of PLATS.map((x) => x.id).filter((p) => plats.has(p))) {
      if (p === 'google') L.push({ key: 'google', label: 'Google ads', detail: `$${weekly} a week for ${weeks} weeks, run and tuned by the team. Spend at cost plus a share, $300 a month minimum`, date: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10), cost: weekly * weeks * 100, status: 'with_team', ref: null, why: 'Google is the one place people search with dinner already in mind' })
      else L.push({ key: p, label: `${NAMES[p]}: boost your best post`, detail: live(p) ? `$${weekly} a week for ${weeks} weeks, from your own ad account. Open Boost and press go` : `Connect your ${NAMES[p]} ad account on Boost first, then this runs from it`, date: today, cost: weekly * weeks * 100, status: 'later', ref: null, why: p === 'meta' ? 'Your own followers see it free. Boost reaches the people nearby who do not follow yet' : 'TikTok needs $20 a day at least, and only your own posts can be boosted' })
    }
    if (creative) L.push({ key: 'creative', label: 'The ad creative', detail: 'One concept in every size, from the desk', date: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10), cost: 35000 + 3500, status: 'needs_payment', ref: null, why: 'A boosted post is the post. An ad made for it does better when the run is longer' })
    L.push({ key: 'checkin', label: 'The check-in', detail: 'People reached, taps, and what each person cost, per platform', date: new Date(Date.now() + weeks * 7 * 86400000).toISOString().slice(0, 10), cost: null, status: 'later', ref: null, why: 'Ad numbers live in the ad account. Boost shows them; the team reports Google in your thread' })
    return L
  }, [plats, weekly, weeks, creative, ads]) // eslint-disable-line react-hooks/exhaustive-deps
  const total = preview.reduce((s, l) => s + (l.cost ?? 0), 0)

  const commit = async () => {
    if (posting || plats.size === 0) return
    setPosting(true); setErr(null)
    try {
      const r = await fetch('/api/dashboard/growth-plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, kind: 'ads', platforms: [...plats], weekly, weeks, people, creative, live: { meta: live('meta'), tiktok: live('tiktok') }, whys: Object.fromEntries(preview.filter((l) => l.why).map((l) => [l.key, l.why])) }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Could not save it')
      setResult({ plan: Array.isArray(j.plan) ? j.plan : [], errors: Array.isArray(j.errors) ? j.errors : [], total: Number(j.total) || 0 })
      setStep('done')
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save it') }
    setPosting(false)
  }

  if (!mounted) return null
  const hue = '#2e73b6'
  const chip = (on: boolean): React.CSSProperties => ({ fontSize: 12.5, fontWeight: 700, padding: '7px 12px', borderRadius: 99, border: `1.5px solid ${on ? C.ink : C.line}`, background: on ? C.ink : '#fff', color: on ? '#fff' : C.ink, cursor: 'pointer', font: 'inherit' })
  const cta: React.CSSProperties = { marginTop: 18, width: '100%', height: 50, borderRadius: 99, border: 0, background: C.ink, color: '#fff', fontWeight: 700, fontSize: 15, font: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', textDecoration: 'none' }
  const h2: React.CSSProperties = { fontFamily: DISPLAY, fontSize: 23, fontWeight: 600, letterSpacing: '-.02em', margin: '4px 2px 12px', lineHeight: 1.15 }
  const h3: React.CSSProperties = { fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.mute, margin: '18px 0 8px' }
  const sub: React.CSSProperties = { display: 'block', fontWeight: 500, color: C.mute, fontSize: 12, marginTop: 2 }
  const rowS: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderBottom: `0.5px solid ${C.line}`, fontSize: 14, fontWeight: 600 }
  const Tick = ({ on }: { on: boolean }) => <span style={{ width: 22, height: 22, borderRadius: 7, border: `1.5px solid ${on ? C.ink : C.line}`, background: on ? C.ink : '#fff', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>{on && <Check size={14} strokeWidth={3} />}</span>
  const Line_ = ({ l }: { l: Line }) => (
    <div style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: `0.5px solid ${C.line}`, alignItems: 'flex-start' }}>
      <span style={{ width: 62, flex: 'none', fontSize: 12, fontWeight: 700, color: C.mute, paddingTop: 2 }}>{l.date ? niceDate(l.date).replace(/^(\w+), /, '$1 ') : 'Soon'}</span>
      <span style={{ flex: 1, minWidth: 0 }}><b style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>{l.label}</b><small style={sub}>{l.detail}</small>{l.why && <small style={{ ...sub, color: C.greenDk, fontWeight: 600 }}>{l.why}</small>}{l.ref?.href && (l.key === 'meta' || l.key === 'tiktok') && <a href={l.ref.href} style={{ display: 'inline-block', marginTop: 6, fontSize: 12.5, fontWeight: 700, color: C.ink, textDecoration: 'underline' }}>Open Boost</a>}{l.ref?.href && l.status === 'needs_payment' && <a href={l.ref.href} style={{ display: 'inline-block', marginTop: 6, fontSize: 12.5, fontWeight: 700, color: C.ink, textDecoration: 'underline' }}>Pay to start</a>}</span>
      {l.cost != null && l.cost > 0 && <b style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{dollars(l.cost)}</b>}
    </div>
  )

  return createPortal(
    <div className="cr" role="dialog" aria-modal="true" aria-label="Ads" style={{ position: 'fixed', left: 0, right: 0, top: vv ? vv.top : 0, height: vv ? vv.h : '100dvh', zIndex: 80, background: 'rgba(20,22,26,.42)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', touchAction: 'none' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, maxHeight: vv ? vv.h - 16 : '92dvh', overflowY: 'auto', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', touchAction: 'pan-y', background: '#fff', borderRadius: '24px 24px 0 0', padding: '10px 18px calc(24px + env(safe-area-inset-bottom))', boxSizing: 'border-box', color: C.ink, ['--c2' as string]: hue } as React.CSSProperties}>
        <div style={{ width: 38, height: 4, borderRadius: 99, background: '#e2e2e7', margin: '0 auto 10px' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0 10px' }}>
          {step === 'plan' ? <button type="button" onClick={() => setStep('pick')} aria-label="Back" style={{ width: 34, height: 34, borderRadius: 99, border: `0.5px solid ${C.line}`, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><ArrowLeft size={16} /></button> : <span style={{ width: 34 }} />}
          <span style={{ flex: 1, textAlign: 'center', fontFamily: DISPLAY, fontSize: 18, fontWeight: 600, letterSpacing: '-.01em' }}>Ads</span>
          <button type="button" onClick={onClose} aria-label="Close" style={{ width: 34, height: 34, borderRadius: 99, border: `0.5px solid ${C.line}`, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={16} /></button>
        </div>

        {step === 'pick' && (
          <>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              <span style={{ width: 72, flex: 'none' }}><Drawing spec={{ scene: 'ad' }} name="" rating="" t={(s) => s} /></span>
              <div style={h2}>Where should the ads run?</div>
            </div>
            {adsErr && <div style={{ fontSize: 12.5, color: '#8a5a0c', marginTop: 4 }}>{adsErr}. Instagram and Facebook lines will say to connect first.</div>}
            <div style={{ marginTop: 4 }}>
              {PLATS.map((p) => { const on = plats.has(p.id); const l = p.id !== 'google' && live(p.id)
                return <button key={p.id} type="button" onClick={() => setPlats((s) => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n })} style={{ ...rowS, width: '100%', background: 'none', border: 0, borderBottom: `0.5px solid ${C.line}`, cursor: 'pointer', font: 'inherit', textAlign: 'left', color: C.ink }}>
                  <span style={{ width: 30, flex: 'none', display: 'flex', justifyContent: 'center' }}><BrandOrMark provider={p.icon} size={22} /></span>
                  <span style={{ flex: 1 }}><b style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>{p.label}</b><small style={sub}>{p.small}{p.id !== 'google' ? (ads ? (l ? '. Ad account connected' : '. Ad account not connected yet') : '') : ''}</small></span>
                  <Tick on={on} />
                </button> })}
            </div>
            <div style={h3}>How much a week</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{WEEKLY.map((w) => <button key={w} type="button" onClick={() => setWeekly(w)} style={chip(weekly === w)}>${w}</button>)}</div>
            <div style={h3}>For how long</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{WEEKS.map((w) => <button key={w} type="button" onClick={() => setWeeks(w)} style={chip(weeks === w)}>{w} weeks</button>)}</div>
            <div style={{ fontSize: 12, color: C.greenDk, fontWeight: 600, marginTop: 10, lineHeight: 1.4 }}>${weekly} a week for {weeks} weeks is ${weekly * weeks}. {rate.word.charAt(0).toUpperCase() + rate.word.slice(1)}, about {rate.n} people a dollar, that is roughly {people.toLocaleString()} people nearby{plats.has('google') ? ', on the social platforms. Google is measured by the team' : ''}.</div>
            <div style={{ ...rowS, marginTop: 8 }}><span>Make the ad creative<small style={sub}>One concept in every size, $385 from the desk. Off means the post is the ad</small></span><button type="button" role="switch" aria-checked={creative} onClick={() => setCreative((c) => !c)} style={{ width: 40, height: 24, borderRadius: 99, border: 0, background: creative ? C.greenDk : C.line, position: 'relative', flex: 'none', cursor: 'pointer', padding: 0 }}><span style={{ position: 'absolute', top: 2, left: creative ? 18 : 2, width: 20, height: 20, borderRadius: 99, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.2)', transition: 'left .15s' }} /></button></div>
            <button type="button" onClick={() => setStep('plan')} disabled={plats.size === 0} style={{ ...cta, opacity: plats.size === 0 ? .5 : 1 }}>Next</button>
          </>
        )}

        {step === 'plan' && (
          <>
            <div style={h2}>Here is the plan</div>
            <div>{preview.map((l) => <Line_ key={l.key} l={l} />)}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 15, padding: '12px 0 0' }}><span>Ad spend and creative</span><span>{dollars(total)}</span></div>
            {err && <div style={{ fontSize: 12.5, color: '#c92d32', marginTop: 10 }}>{err}</div>}
            <button type="button" onClick={commit} disabled={posting} style={{ ...cta, opacity: posting ? .6 : 1 }}>{posting ? <Loader2 size={16} className="mvp-spin" /> : null} {posting ? 'Saving' : 'Set it up'}</button>
            <div style={{ fontSize: 12, color: C.mute, textAlign: 'center', marginTop: 10, lineHeight: 1.45 }}>Nothing is charged here. Boost charges your own ad account when you press go there. Google is agreed with the team first.</div>
          </>
        )}

        {step === 'done' && result && (
          <>
            <div style={{ padding: '14px 4px 6px', textAlign: 'center' }}>
              <span style={{ display: 'inline-flex', width: 56, height: 56, borderRadius: 99, background: C.greenSoft, color: C.greenDk, alignItems: 'center', justifyContent: 'center' }}><Check size={26} strokeWidth={2.5} /></span>
              <div style={{ ...h2, marginTop: 12 }}>Set up</div>
            </div>
            <div>{result.plan.map((l) => <Line_ key={l.key} l={l} />)}</div>
            {result.errors.map((e, i) => <div key={i} style={{ fontSize: 12.5, color: '#c92d32', marginTop: 10 }}>{e}</div>)}
            {result.plan.some((l) => (l.key === 'meta' || l.key === 'tiktok') && l.ref?.href) && <a href={result.plan.find((l) => (l.key === 'meta' || l.key === 'tiktok') && l.ref?.href)!.ref!.href} style={cta}>Open Boost and press go</a>}
            <button type="button" onClick={onClose} style={{ ...cta, background: '#fff', color: C.ink, border: `0.5px solid ${C.line}` }}>Done</button>
            <div style={{ fontSize: 12.5, color: C.mute, textAlign: 'center', marginTop: 10 }}>It is on Coming up.</div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
