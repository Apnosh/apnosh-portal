'use client'
/**
 * THE SHOOT DAY (owner 2026-09-17): "a shoot would include multiple campaigns".
 * =============================================================================
 * Behind the Photos tile. One day, booked once, filled over the week. It shows what is on the
 * day, the spots left, the price, and the upcoming plans that could ride on it. Booking a day
 * is the photos order at the desk; the room comes from the desk's own tiers. Each plan on the
 * day takes a spot. Past the room, the day says which tier it needs now and the team confirms
 * before shooting. Nothing is charged twice.
 */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Loader2, X, Plus } from 'lucide-react'
import { C, DISPLAY } from '../tokens'
import { Drawing } from './drawings'
import type { AnnounceKind } from './announce-sheet'

type Tier = 'standard' | 'full' | 'works'
interface Attached { label: string; kind: string; planId: string | null; pieces: string[]; at: string }
interface Shoot { id: string; requestId: string | null; date: string | null; tier: Tier; tierLabel: string; spots: number; used: number; left: number; attached: Attached[]; cents: number | null; status: string; needs: Tier | null; upgradeCents: number | null; href: string | null }
interface Read { shoot: Shoot | null; suggest: { id: string; kind: string; label: string; date: string | null }[]; tiers: { id: Tier; label: string; small: string; spots: number; cents: number | null }[] }
const KIND_WORD: Record<string, string> = { dish: 'new dish', deal: 'deal', event: 'event', hours: 'hours', hiring: 'hiring', open: 'opening', holiday: 'holiday', else: 'news', post: 'post', update: 'update' }
const niceDate = (iso: string | null) => { if (!iso) return ''; const d = new Date(iso.slice(0, 10) + 'T12:00:00'); return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) }
const dollars = (c: number | null) => (c == null ? '' : `$${Math.round(c / 100).toLocaleString()}`)
const plusDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

export default function ShootSheet({ clientId, onClose, onAnnounce }: { clientId: string; onClose: () => void; onAnnounce: (kind: AnnounceKind) => void }) {
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

  const [data, setData] = useState<Read | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [tier, setTier] = useState<Tier>('standard')
  const [date, setDate] = useState('')
  const [note, setNote] = useState('')
  const load = () => fetch(`/api/dashboard/shoot?clientId=${clientId}`, { cache: 'no-store' }).then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Could not read your shoot'); setData(j as Read) }).catch((e) => setErr(e instanceof Error ? e.message : 'Could not read your shoot'))
  useEffect(() => { load() }, [clientId]) // eslint-disable-line react-hooks/exhaustive-deps

  const post = async (body: Record<string, unknown>, key: string) => {
    setBusy(key); setErr(null)
    try {
      const r = await fetch('/api/dashboard/shoot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, ...body }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Could not save it')
      await load()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save it') }
    setBusy(null)
  }

  if (!mounted) return null
  const hue = '#6a39de'
  const shoot = data?.shoot ?? null
  const tiers = data?.tiers ?? []
  const cta: React.CSSProperties = { marginTop: 18, width: '100%', height: 50, borderRadius: 99, border: 0, background: C.ink, color: '#fff', fontWeight: 700, fontSize: 15, font: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', textDecoration: 'none' }
  const h2: React.CSSProperties = { fontFamily: DISPLAY, fontSize: 23, fontWeight: 600, letterSpacing: '-.02em', margin: '4px 2px 12px', lineHeight: 1.15 }
  const h3: React.CSSProperties = { fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.mute, margin: '18px 0 8px' }
  const sub: React.CSSProperties = { display: 'block', fontWeight: 500, color: C.mute, fontSize: 12, marginTop: 2 }
  const rowS: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderBottom: `0.5px solid ${C.line}`, fontSize: 14, fontWeight: 600 }
  const input: React.CSSProperties = { width: 'auto', padding: '7px 10px', fontSize: 13, borderRadius: 10, border: `0.5px solid ${C.line}`, font: 'inherit', color: C.ink, background: '#fff' }
  const pill = (txt: string, tone: 'ok' | 'warn' | 'mute') => <span style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 9px', borderRadius: 99, background: tone === 'ok' ? C.greenSoft : tone === 'warn' ? '#fff4e0' : '#f2f2f5', color: tone === 'ok' ? C.greenDk : tone === 'warn' ? '#8a5a0c' : C.mute, whiteSpace: 'nowrap' }}>{txt}</span>

  return createPortal(
    <div className="cr" role="dialog" aria-modal="true" aria-label="Shoot day" style={{ position: 'fixed', left: 0, right: 0, top: vv ? vv.top : 0, height: vv ? vv.h : '100dvh', zIndex: 80, background: 'rgba(20,22,26,.42)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', touchAction: 'none' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, maxHeight: vv ? vv.h - 16 : '92dvh', overflowY: 'auto', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', touchAction: 'pan-y', background: '#fff', borderRadius: '24px 24px 0 0', padding: '10px 18px calc(24px + env(safe-area-inset-bottom))', boxSizing: 'border-box', color: C.ink, ['--c2' as string]: hue }}>
        <div style={{ width: 38, height: 4, borderRadius: 99, background: '#e2e2e7', margin: '0 auto 10px' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0 10px' }}>
          <span style={{ width: 34 }} />
          <span style={{ flex: 1, textAlign: 'center', fontFamily: DISPLAY, fontSize: 18, fontWeight: 600, letterSpacing: '-.01em' }}>Shoot day</span>
          <button type="button" onClick={onClose} aria-label="Close" style={{ width: 34, height: 34, borderRadius: 99, border: `0.5px solid ${C.line}`, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={16} /></button>
        </div>

        {!data && !err && <div style={{ padding: 30, textAlign: 'center', color: C.mute }}><Loader2 size={18} className="mvp-spin" /></div>}

        {data && shoot && (
          <>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              <span style={{ width: 72, flex: 'none' }}><Drawing spec={{ scene: 'photos' }} name="" rating="" t={(s) => s} /></span>
              <div>
                <div style={{ ...h2, margin: 0 }}>{shoot.date ? niceDate(shoot.date) : 'Day to be picked'}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                  {pill(`${shoot.tierLabel} · ${shoot.spots} ${shoot.spots === 1 ? 'spot' : 'spots'}`, 'mute')}
                  {shoot.needs ? pill(`Needs ${data.tiers.find((t) => t.id === shoot.needs)?.label ?? 'a bigger day'}`, 'warn') : pill(shoot.left > 0 ? `${shoot.left} left` : 'Full', shoot.left > 0 ? 'ok' : 'mute')}
                  {shoot.status === 'awaiting_payment' || shoot.cents == null ? null : pill(dollars(shoot.cents), 'mute')}
                </div>
              </div>
            </div>

            <div style={h3}>On the day</div>
            {shoot.attached.length === 0 && <div style={{ fontSize: 13, color: C.mute, padding: '6px 0 4px' }}>Nothing yet. Add a plan below, or start one from Announce and pick this day as the source.</div>}
            {shoot.attached.map((x, i) => (
              <div key={i} style={rowS}>
                <span style={{ width: 24, height: 24, borderRadius: 99, background: '#f2f2f5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, flex: 'none' }}>{i + 1}</span>
                <span style={{ flex: 1, minWidth: 0 }}>{x.label}<small style={sub}>{KIND_WORD[x.kind] ?? x.kind}{x.pieces.length ? ` · ${x.pieces.join(', ')}` : ''}</small></span>
                <button type="button" aria-label="Take it off the day" disabled={busy != null} onClick={() => post({ action: 'detach', shootId: shoot.id, index: i }, `d${i}`)} style={{ width: 28, height: 28, borderRadius: 99, border: `0.5px solid ${C.line}`, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: C.mute }}>{busy === `d${i}` ? <Loader2 size={12} className="mvp-spin" /> : <X size={12} />}</button>
              </div>
            ))}
            {shoot.needs && <div style={{ marginTop: 10, fontSize: 12.5, color: '#8a5a0c', lineHeight: 1.45 }}><b>{shoot.used} on the day is more than {shoot.tierLabel} holds.</b> It needs {data.tiers.find((t) => t.id === shoot.needs)?.label}{shoot.upgradeCents != null ? `, +${dollars(shoot.upgradeCents)}` : ''}. The team confirms with you before the day. Nothing is charged until you agree.</div>}

            {data.suggest.length > 0 && (
              <>
                <div style={h3}>While we are there</div>
                {data.suggest.map((s) => (
                  <div key={s.id} style={rowS}>
                    <span style={{ flex: 1, minWidth: 0 }}>{s.label}<small style={sub}>{KIND_WORD[s.kind] ?? s.kind}{s.date ? ` · ${niceDate(s.date)}` : ''}</small></span>
                    <button type="button" disabled={busy != null} onClick={() => post({ action: 'attach', shootId: shoot.id, label: s.label, kind: s.kind, planId: s.id, pieces: ['photos'] }, s.id)} style={{ fontSize: 12.5, fontWeight: 700, padding: '7px 12px', borderRadius: 99, border: `1.5px solid ${C.line}`, background: '#fff', color: C.ink, cursor: 'pointer', font: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>{busy === s.id ? <Loader2 size={12} className="mvp-spin" /> : <Plus size={12} />} Add</button>
                  </div>
                ))}
              </>
            )}

            <div style={h3}>Something new for the day</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {([['dish', 'A new dish'], ['deal', 'A deal'], ['event', 'An event'], ['else', 'Something else']] as [AnnounceKind, string][]).map(([k, l]) => <button key={k} type="button" onClick={() => onAnnounce(k)} style={{ fontSize: 12.5, fontWeight: 700, padding: '7px 12px', borderRadius: 99, border: `1.5px solid ${C.line}`, background: '#fff', color: C.ink, cursor: 'pointer', font: 'inherit' }}>{l}</button>)}
            </div>
            <div style={{ fontSize: 12, color: C.mute, marginTop: 8 }}>Pick the day as the source on the first screen and it lands here.</div>

            {err && <div style={{ fontSize: 12.5, color: '#c92d32', marginTop: 10 }}>{err}</div>}
            {shoot.href && <a href={shoot.href} style={cta}>{shoot.status === 'awaiting_payment' ? 'Pay to book the day' : 'Open the order'}</a>}
            <button type="button" onClick={onClose} style={{ ...cta, background: '#fff', color: C.ink, border: `0.5px solid ${C.line}` }}>Done</button>
          </>
        )}

        {data && !shoot && (
          <>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              <span style={{ width: 72, flex: 'none' }}><Drawing spec={{ scene: 'creator' }} name="" rating="" t={(s) => s} /></span>
              <div style={h2}>Book a shoot day</div>
            </div>
            <div style={{ fontSize: 13, color: C.mute, lineHeight: 1.45, marginTop: -4 }}>One day, several plans. A new dish, the deal, the event: each takes a spot, and every photo lands in your library for the next ones too.</div>
            <div style={h3}>How big a day</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {tiers.map((t) => <button key={t.id} type="button" onClick={() => setTier(t.id)} style={{ border: `1.5px solid ${tier === t.id ? C.ink : C.line}`, boxShadow: tier === t.id ? `inset 0 0 0 1px ${C.ink}` : 'none', borderRadius: 14, padding: '10px 8px', background: '#fff', cursor: 'pointer', font: 'inherit', color: C.ink, textAlign: 'left' }}><b style={{ display: 'block', fontSize: 13 }}>{t.label}</b><small style={{ display: 'block', color: C.mute, fontSize: 11, marginTop: 2, lineHeight: 1.35 }}>{t.small}</small><b style={{ display: 'block', fontSize: 12.5, marginTop: 4 }}>{dollars(t.cents)}</b></button>)}
            </div>
            <div style={rowS}><span>The day<small style={sub}>Leave it and the team offers two dates</small></span><input type="date" min={plusDays(3)} value={date} onChange={(e) => setDate(e.target.value)} style={input} /></div>
            <div style={rowS}><span style={{ flex: 1 }}>What to shoot first<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="The new ramen, the patio, the team" style={{ ...input, display: 'block', width: '100%', marginTop: 6, boxSizing: 'border-box', fontWeight: 500 }} /></span></div>
            {data.suggest.length > 0 && <div style={{ fontSize: 12, color: C.greenDk, fontWeight: 600, marginTop: 10 }}>{data.suggest.length} plan{data.suggest.length === 1 ? '' : 's'} on Coming up could ride on this day. Add them once it is booked.</div>}
            {err && <div style={{ fontSize: 12.5, color: '#c92d32', marginTop: 10 }}>{err}</div>}
            <button type="button" disabled={busy != null} onClick={() => post({ action: 'book', tier, date: date || undefined, note }, 'book')} style={{ ...cta, opacity: busy ? .6 : 1 }}>{busy === 'book' ? <Loader2 size={16} className="mvp-spin" /> : <Check size={16} />} Book the day, {dollars(tiers.find((t) => t.id === tier)?.cents ?? null)}</button>
            <div style={{ fontSize: 12, color: C.mute, textAlign: 'center', marginTop: 10, lineHeight: 1.45 }}>Paid before the day. The order opens next with a Pay link.</div>
          </>
        )}
        {err && !data && <div style={{ fontSize: 12.5, color: '#c92d32', marginTop: 10 }}>{err}</div>}
      </div>
    </div>,
    document.body,
  )
}
