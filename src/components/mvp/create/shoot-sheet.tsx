'use client'
/**
 * THE SHOOT DAY (owner 2026-09-17): "a shoot would include multiple campaigns".
 * =============================================================================
 * Behind the Photos tile. A shoot day is a visit with a shot list. You write the list, the
 * price follows its length, nobody picks a size: one or two things is a quick visit, three or
 * four is half a day, five or six is a full day. Booked once, the list grows until the day.
 * When it outgrows the day, the sheet says so and the team confirms the bigger day before
 * shooting. Nothing is charged twice.
 */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Loader2, X, Plus } from 'lucide-react'
import { C, DISPLAY } from '../tokens'
import { Drawing } from './drawings'
import type { AnnounceKind } from './announce-sheet'

type Tier = 'standard' | 'full' | 'works'
interface Attached { label: string; kind: string; planId: string | null; pieces: string[]; at: string }
interface Shoot { id: string; requestId: string | null; date: string | null; tier: Tier; tierLabel: string; photos: number; spots: number; used: number; left: number; attached: Attached[]; cents: number | null; status: string; needs: Tier | null; needsLabel: string | null; upgradeCents: number | null; href: string | null }
interface Read { shoot: Shoot | null; suggest: { id: string; kind: string; label: string; date: string | null }[]; tiers: { id: Tier; label: string; small: string; spots: number; photos: number; cents: number | null }[] }
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
  const [date, setDate] = useState('')
  const [items, setItems] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [adding, setAdding] = useState('')
  const addItem = () => { const v = draft.trim(); if (!v) return; setItems((x) => [...x, v].slice(0, 6)); setDraft('') }
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
  const tierFor = (n: number) => tiers.find((t) => n <= t.spots) ?? tiers[tiers.length - 1] ?? null
  const size = tierFor(Math.max(1, items.length))
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
                  {pill(`${shoot.tierLabel} · about ${shoot.photos} photos`, 'mute')}
                  {shoot.needs ? pill(`${shoot.needsLabel} now`, 'warn') : pill(`${shoot.used} thing${shoot.used === 1 ? '' : 's'} on the list`, 'ok')}
                  {shoot.status === 'awaiting_payment' || shoot.cents == null ? null : pill(dollars(shoot.cents), 'mute')}
                </div>
              </div>
            </div>

            <div style={h3}>The shot list</div>
            {shoot.attached.length === 0 && <div style={{ fontSize: 13, color: C.mute, padding: '6px 0 4px' }}>Nothing on it yet. Add something below.</div>}
            {shoot.attached.map((x, i) => (
              <div key={i} style={rowS}>
                <span style={{ width: 24, height: 24, borderRadius: 99, background: '#f2f2f5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, flex: 'none' }}>{i + 1}</span>
                <span style={{ flex: 1, minWidth: 0 }}>{x.label}<small style={sub}>{KIND_WORD[x.kind] ?? x.kind}{x.pieces.length ? ` · ${x.pieces.join(', ')}` : ''}</small></span>
                <button type="button" aria-label="Take it off the day" disabled={busy != null} onClick={() => post({ action: 'detach', shootId: shoot.id, index: i }, `d${i}`)} style={{ width: 28, height: 28, borderRadius: 99, border: `0.5px solid ${C.line}`, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: C.mute }}>{busy === `d${i}` ? <Loader2 size={12} className="mvp-spin" /> : <X size={12} />}</button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}><input value={adding} onChange={(e) => setAdding(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && adding.trim()) { post({ action: 'attach', shootId: shoot.id, label: adding.trim(), kind: 'shot', pieces: ['photos'] }, 'add'); setAdding('') } }} placeholder="The patio, the tiramisu, the team" style={{ ...input, flex: 1, width: 'auto', marginTop: 0, padding: '10px 12px', fontWeight: 500 }} /><button type="button" disabled={busy != null || !adding.trim()} onClick={() => { post({ action: 'attach', shootId: shoot.id, label: adding.trim(), kind: 'shot', pieces: ['photos'] }, 'add'); setAdding('') }} style={{ fontSize: 12.5, fontWeight: 700, padding: '7px 14px', borderRadius: 99, border: 0, background: C.ink, color: '#fff', cursor: 'pointer', font: 'inherit', opacity: adding.trim() ? 1 : .5 }}>{busy === 'add' ? <Loader2 size={12} className="mvp-spin" /> : 'Add'}</button></div>
            {shoot.needs ? <div style={{ marginTop: 10, fontSize: 12.5, color: '#8a5a0c', lineHeight: 1.45 }}><b>{shoot.used} things makes it {shoot.needsLabel?.toLowerCase()}.</b> About {data.tiers.find((t) => t.id === shoot.needs)?.photos} photos{shoot.upgradeCents != null ? `, +${dollars(shoot.upgradeCents)}` : ''}. The team confirms with you before the day. Nothing is charged until you agree.</div> : <div style={{ marginTop: 10, fontSize: 12, color: C.mute, lineHeight: 1.45 }}>{shoot.tierLabel} covers up to {shoot.spots} things. Add more and it becomes a bigger day; the team confirms the price with you first.</div>}

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

            <div style={h3}>Announce something with it</div>
            <div style={{ fontSize: 12, color: C.mute, marginBottom: 8, lineHeight: 1.45 }}>Start a plan and pick this day as where the picture comes from. It joins the list.</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {([['dish', 'A new dish'], ['deal', 'A deal'], ['event', 'An event'], ['else', 'Something else']] as [AnnounceKind, string][]).map(([k, l]) => <button key={k} type="button" onClick={() => onAnnounce(k)} style={{ fontSize: 12.5, fontWeight: 700, padding: '7px 12px', borderRadius: 99, border: `1.5px solid ${C.line}`, background: '#fff', color: C.ink, cursor: 'pointer', font: 'inherit' }}>{l}</button>)}
            </div>

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
            <div style={{ fontSize: 13, color: C.mute, lineHeight: 1.45, marginTop: -4 }}>A photographer comes once. Write the list of what to shoot. The longer the list, the bigger the day, and every photo lands in your library.</div>
            <div style={h3}>What should we shoot?</div>
            {items.map((it, i) => <div key={i} style={rowS}><span style={{ width: 24, height: 24, borderRadius: 99, background: '#f2f2f5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, flex: 'none' }}>{i + 1}</span><span style={{ flex: 1 }}>{it}</span><button type="button" aria-label="Remove" onClick={() => setItems((x) => x.filter((_, j) => j !== i))} style={{ width: 28, height: 28, borderRadius: 99, border: `0.5px solid ${C.line}`, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: C.mute }}><X size={12} /></button></div>)}
            {items.length < 6 && <div style={{ display: 'flex', gap: 8, marginTop: 10 }}><input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addItem() }} placeholder={items.length ? 'Anything else?' : 'The new ramen, the patio, the team'} style={{ ...input, flex: 1, width: 'auto', marginTop: 0, padding: '10px 12px', fontWeight: 500 }} /><button type="button" onClick={addItem} disabled={!draft.trim()} style={{ fontSize: 12.5, fontWeight: 700, padding: '7px 14px', borderRadius: 99, border: 0, background: C.ink, color: '#fff', cursor: 'pointer', font: 'inherit', opacity: draft.trim() ? 1 : .5 }}>Add</button></div>}
            {size && <div style={{ marginTop: 14, border: `0.5px solid ${C.line}`, borderRadius: 14, padding: '10px 12px' }}><b style={{ display: 'block', fontSize: 14 }}>{size.label}: {Math.max(1, items.length)} thing{items.length === 1 || items.length === 0 ? '' : 's'} · about {size.photos} photos · {dollars(size.cents)}</b><small style={sub}>One or two things is a quick visit. Three or four is half a day. Five or six is a full day. The price follows the list, and you can add to it until the day.</small></div>}
            <div style={rowS}><span>The day<small style={sub}>Leave it and the team offers two dates</small></span><input type="date" min={plusDays(3)} value={date} onChange={(e) => setDate(e.target.value)} style={input} /></div>
            {data.suggest.length > 0 && <div style={{ fontSize: 12, color: C.greenDk, fontWeight: 600, marginTop: 10 }}>{data.suggest.length} plan{data.suggest.length === 1 ? '' : 's'} on Coming up could join the list once it is booked.</div>}
            {err && <div style={{ fontSize: 12.5, color: '#c92d32', marginTop: 10 }}>{err}</div>}
            <button type="button" disabled={busy != null || !items.length} onClick={() => post({ action: 'book', items, date: date || undefined }, 'book')} style={{ ...cta, opacity: busy || !items.length ? .6 : 1 }}>{busy === 'book' ? <Loader2 size={16} className="mvp-spin" /> : <Check size={16} />} {items.length ? `Book the day, ${dollars(size?.cents ?? null)}` : 'Add something to shoot first'}</button>
            <div style={{ fontSize: 12, color: C.mute, textAlign: 'center', marginTop: 10, lineHeight: 1.45 }}>Paid before the day. The order opens next with a Pay link.</div>
          </>
        )}
        {err && !data && <div style={{ fontSize: 12.5, color: '#c92d32', marginTop: 10 }}>{err}</div>}
      </div>
    </div>,
    document.body,
  )
}
