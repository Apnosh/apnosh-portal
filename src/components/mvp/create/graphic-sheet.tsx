'use client'
/**
 * THE GRAPHIC, DONE WITH CARE (owner 2026-09-24).
 * ================================================
 * Opens on the post as it will look (the live preview): the words on it, the price, the launch offer,
 * a slide per dish on a carousel. What it says is editable, tucked in one small row under the preview.
 * What the app already knows is said once (photos, sizes, ready day, brand kit), never asked.
 * Then how it is made: the level, said as what you get (not how many designs to pick from), and the
 * maker: the Apnosh design team or a creator from the marketplace, same price either way. Then a box
 * for additional comments, Save, and Remove from plan.
 *
 * One announcement, one graphic (owner): one dish is one post graphic; two or more dishes are one
 * carousel post with a slide for each dish, or a post for each dish. The level changes its quality.
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { Bookmark, CalendarDays, Camera, Check, ChevronRight, Heart, Languages, Layers, MessageCircle, MoreHorizontal, Palette, Printer, Send, Star, Tag, Ticket, Type } from 'lucide-react'
import { C, DISPLAY } from '../tokens'
import { Drawing } from './drawings'
import { itemCents, graphicLayout, graphicDishes, graphicOrders, graphicLevel, includedLevel, LEVEL_NAME, GRAPHIC_LEVEL_WHAT, TIER_SPECS, type GraphicLevel, type MenuPrices } from '@/lib/plan/item-price'
import type { ItemPick } from '@/lib/plan/suggest'

const dollars = (c: number) => `$${Math.round(c / 100).toLocaleString()}`
const GROUND = 'linear-gradient(160deg,#f6d9aa 0%,#d9955a 55%,#9c5a2c 100%)'

interface Maker { vendorId: string; slug: string; name: string; ratingLabel: string; rating: { avg: number; count: number } | null }

export interface GraphicSheetProps {
  item: ItemPick
  prices: MenuPrices
  setOpt: (o: Record<string, unknown>) => void
  bizName: string
  dishes: { name: string; price: string; line?: string }[]
  photo: string | null
  photoSource: 'content' | 'queue' | 'own' | 'stock'
  brandKit: boolean | null
  offer: { text: string; code: string } | null
  printInPlan: boolean
  readyWord: string
  onDone: () => void
  onRemove: (() => void) | null
  doneLabel: string
}

export default function GraphicSheet({ item, prices, setOpt, bizName, dishes, photo, photoSource, brandKit, offer, printInPlan, readyWord, onDone, onRemove, doneLabel }: GraphicSheetProps) {
  const o = item.options
  const list = dishes.length ? dishes : [{ name: 'The dish', price: '', line: '' }]
  const d = graphicDishes(o, prices)
  const layout = graphicLayout(o, prices)
  const orders = graphicOrders(o, prices)
  const inc = o.from === 'shoot' && Number(o.included) > 0
  const incL = includedLevel(o)
  const lv = graphicLevel(o)
  const cents = itemCents(item, prices)
  const priceOn = o.priceOn !== false
  const offerOn = !!offer && o.offerOn !== false
  const spanish = !!o.spanish
  const headline = typeof o.headline === 'string' ? o.headline : ''
  const subline = typeof o.subline === 'string' ? o.subline : ''
  const money = (v: string) => (v ? (/^\d/.test(v) ? `$${v}` : v) : '')
  const tierPre = (l: GraphicLevel) => prices.graphicTiers?.[l] ?? (l === 2 ? prices.graphic : 0)
  const at = (patch: Record<string, unknown>) => itemCents({ ...item, options: { ...o, ...patch } }, prices)
  const [editing, setEditing] = useState(false)
  const [makers, setMakers] = useState<Maker[] | null>(null)
  useEffect(() => { let live = true; fetch('/api/design/makers').then((r) => r.json()).then((j) => { if (live) setMakers(Array.isArray(j?.makers) ? j.makers : []) }).catch(() => { if (live) setMakers([]) }); return () => { live = false } }, [])

  const h: CSSProperties = { display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 16, fontWeight: 700, color: C.ink, margin: '24px 2px 10px' }
  const small: CSSProperties = { fontSize: 12.5, fontWeight: 500, color: C.mute }

  /* one slide: the photo (or its ground), the words, the price, the offer */
  const slide = (dish: { name: string; price: string; line?: string }, i: number, single: boolean) => {
    const big = single && headline.trim() ? headline.trim() : dish.name
    const line = single ? subline.trim() : ''
    return (
      <div key={i} style={{ flex: 'none', width: single ? '100%' : '86%', scrollSnapAlign: 'start', position: 'relative', aspectRatio: '4 / 5', borderRadius: 14, overflow: 'hidden', background: photo ? `center/cover url(${photo})` : GROUND }}>
        {!photo && <span aria-hidden style={{ position: 'absolute', left: '50%', top: '38%', transform: 'translate(-50%,-50%)', width: 92, opacity: .35, ['--c2' as string]: '#7a4a24' }}><Drawing spec={{ scene: 'dish' }} name="" rating="" t={(x) => x} /></span>}
        {!photo && <span style={{ position: 'absolute', left: 0, right: 0, top: '58%', textAlign: 'center', fontSize: 11, fontWeight: 600, color: '#fff', opacity: .8 }}>{photoSource === 'content' || photoSource === 'queue' ? 'Your content day photo goes here' : 'Your photo goes here'}</span>}
        <span style={{ position: 'absolute', left: 12, top: 11, fontSize: 9.5, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: '#fff', opacity: .85 }}>{bizName || 'Your restaurant'}</span>
        {spanish && <span style={{ position: 'absolute', left: 12, top: 28, height: 18, padding: '0 6px', borderRadius: 6, background: 'rgba(255,255,255,.9)', color: C.ink, fontSize: 10, fontWeight: 800, display: 'inline-flex', alignItems: 'center' }}>ES too</span>}
        {priceOn && money(dish.price) && <span style={{ position: 'absolute', right: 10, top: 10, minWidth: 52, height: 52, padding: '0 6px', boxSizing: 'border-box', borderRadius: 99, background: '#f5c542', color: C.ink, display: 'grid', placeItems: 'center', fontFamily: DISPLAY, fontSize: 18, fontWeight: 800, boxShadow: '0 2px 8px rgba(0,0,0,.18)' }}>{money(dish.price)}</span>}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '40px 14px 14px', background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,.55) 100%)' }}>
          <b style={{ display: 'block', fontFamily: DISPLAY, fontSize: 28, fontWeight: 800, lineHeight: 1.02, letterSpacing: '-.02em', color: '#fff', textWrap: 'balance' }}>{big}</b>
          {line && <span style={{ display: 'block', marginTop: 6, fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,.92)', lineHeight: 1.3 }}>{line}</span>}
          {offerOn && offer && <span style={{ display: 'inline-flex', alignItems: 'center', marginTop: 8, height: 24, padding: '0 9px', borderRadius: 7, background: '#f5c542', color: C.ink, fontSize: 11.5, fontWeight: 800, maxWidth: '100%', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{offer.text}{offer.code ? ` · ${offer.code}` : ''}</span>}
        </div>
      </div>
    )
  }
  const slides = layout === 'single' ? [list[0]] : list

  const toggle = (on: boolean, set: () => void, label: string) => (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={set} style={{ flex: 'none', width: 46, height: 28, borderRadius: 99, border: 0, padding: 3, background: on ? C.greenDk : '#e6e6ea', cursor: 'pointer', display: 'flex', justifyContent: on ? 'flex-end' : 'flex-start', transition: 'background .15s' }}>
      <span style={{ width: 22, height: 22, borderRadius: 99, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }} />
    </button>
  )
  const switchRow = (icon: ReactNode, label: string, sub: string, right: ReactNode) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0' }}>
      <span style={{ width: 32, height: 32, borderRadius: 10, background: '#fff', display: 'grid', placeItems: 'center', flex: 'none', color: C.ink }}>{icon}</span>
      <span style={{ flex: 1, minWidth: 0 }}><b style={{ display: 'block', fontSize: 14.5, fontWeight: 600 }}>{label}</b><small style={{ ...small, display: 'block', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</small></span>
      {right}
    </div>
  )
  const box: CSSProperties = { display: 'block', width: '100%', boxSizing: 'border-box', height: 46, borderRadius: 12, border: '1.5px solid transparent', background: '#fff', padding: '0 12px', fontFamily: 'inherit', fontSize: 16, color: C.ink, outline: 'none' }
  const lab: CSSProperties = { display: 'block', fontSize: 12.5, fontWeight: 600, color: C.mute, marginBottom: 6, padding: '0 2px' }

  const levels: GraphicLevel[] = inc ? ([incL, 3] as GraphicLevel[]).filter((l, i, a) => a.indexOf(l) === i) : [1, 2, 3]
  const levelPrice = (l: GraphicLevel) => {
    if (inc) return l === incL ? 'Included' : `+${dollars((tierPre(l) - tierPre(incL)) * orders)}`
    return dollars(at({ level: l }))
  }
  const facts: { label: string; value: ReactNode; icon: ReactNode }[] = [
    { label: 'Photos', icon: <Camera size={14} />, value: photoSource === 'content' ? 'Content day' : photoSource === 'queue' ? 'Next shoot' : photoSource === 'stock' ? 'Licensed' : 'Yours' },
    { label: 'Sizes', icon: <Layers size={14} />, value: <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 3 }}>4 <span aria-hidden style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 2, marginLeft: 2 }}>{[[8, 10], [7, 12], [11, 6], [10, 8]].map(([w, hh], k) => <i key={k} style={{ width: w, height: hh, border: `1.3px solid ${C.mute}`, borderRadius: 2 }} />)}</span></span> },
    { label: 'Ready', icon: <CalendarDays size={14} />, value: readyWord || 'In 2 days' },
    { label: 'Brand kit', icon: <Palette size={14} />, value: brandKit ? 'On file' : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>None yet <a href="/dashboard/assets" target="_blank" rel="noreferrer" aria-label="Add your logo and colors" style={{ width: 18, height: 18, borderRadius: 99, background: C.greenSoft, color: C.greenDk, display: 'inline-grid', placeItems: 'center', fontWeight: 800, fontSize: 13, textDecoration: 'none' }}>+</a></span> },
  ]
  const saysSummary = [layout === 'single' ? (headline.trim() || list[0].name) : `${d} dishes`, priceOn ? 'price' : '', offerOn ? 'the offer' : '', spanish ? 'Spanish too' : ''].filter(Boolean).join(' · ')
  const makerId = typeof o.makerVendorId === 'string' ? o.makerVendorId : ''

  return (
    <div>
      {/* the post as it will look */}
      <div style={{ border: `1px solid ${C.line}`, borderRadius: 20, background: '#fff', overflow: 'hidden', boxShadow: '0 1px 3px rgba(29,29,31,.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px' }}>
          <span style={{ width: 28, height: 28, borderRadius: 99, background: C.greenSoft, color: C.greenDk, display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 800, flex: 'none' }}>{(bizName || 'Y').slice(0, 1).toUpperCase()}</span>
          <b style={{ flex: 1, fontSize: 13.5 }}>{bizName || 'Your restaurant'}</b>
          <MoreHorizontal size={18} color={C.mute} />
        </div>
        <div className="mvp-hscroll" style={{ display: 'flex', gap: 8, overflowX: slides.length > 1 ? 'auto' : 'visible', scrollSnapType: 'x mandatory', padding: '0 12px', scrollbarWidth: 'none' }}>
          {slides.map((x, i) => slide(x, i, layout === 'single'))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 14px 10px', color: C.ink }}>
          <Heart size={20} /><MessageCircle size={20} /><Send size={20} />
          <span style={{ flex: 1, display: 'flex', justifyContent: 'center', gap: 4 }}>{slides.length > 1 && slides.map((_, i) => <i key={i} style={{ width: 6, height: 6, borderRadius: 99, background: i === 0 ? C.greenDk : '#d6d6db' }} />)}</span>
          <Bookmark size={20} />
        </div>
        {/* WHAT IT SAYS (owner): small and tucked away; tap to change the words and what is on it */}
        <div style={{ borderTop: `0.5px solid ${C.line}`, background: editing ? C.bg : '#fff' }}>
          <button type="button" aria-expanded={editing} onClick={() => setEditing(!editing)} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '11px 14px', border: 0, background: 'none', fontFamily: 'inherit', textAlign: 'left', cursor: 'pointer', color: C.ink }}>
            <Type size={16} color={C.mute} />
            <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><b style={{ fontSize: 14, fontWeight: 600 }}>What it says</b><small style={{ ...small, marginLeft: 8 }}>{saysSummary}</small></span>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.greenDk }}>{editing ? 'Close' : 'Edit'}</span>
            <ChevronRight size={16} color={C.faint} style={{ transform: editing ? 'rotate(-90deg)' : 'rotate(90deg)', transition: 'transform .15s' }} />
          </button>
          {editing && (
            <div style={{ padding: '2px 14px 12px' }}>
              {layout === 'single' && <>
                <label style={{ display: 'block' }}><span style={lab}>Big words</span><input value={headline} onChange={(e) => setOpt({ headline: e.target.value.slice(0, 60) })} placeholder={list[0].name} style={box} /></label>
                <label style={{ display: 'block', marginTop: 10 }}><span style={lab}>Small words <span style={{ fontWeight: 500, color: C.faint }}>optional</span></span><input value={subline} onChange={(e) => setOpt({ subline: e.target.value.slice(0, 90) })} placeholder={list[0].line || 'Now at the counter'} style={box} /></label>
              </>}
              <div style={{ marginTop: layout === 'single' ? 8 : 0 }}>
                {switchRow(<Tag size={16} />, 'The price', list.map((x) => money(x.price)).filter(Boolean).join(', ') || 'No price given', toggle(priceOn, () => setOpt({ priceOn: !priceOn }), 'The price on it'))}
                {offer && switchRow(<Ticket size={16} />, 'The launch offer', `${offer.text}${offer.code ? ` · ${offer.code}` : ''}`, toggle(offerOn, () => setOpt({ offerOn: !offerOn }), 'The launch offer on it'))}
                {switchRow(<Languages size={16} />, 'Spanish too', `A second version · +${dollars(4000 * orders)}`, toggle(spanish, () => setOpt({ spanish: !spanish }), 'Spanish too'))}
              </div>
            </div>
          )}
        </div>
      </div>
      {slides.length > 1 && <div style={{ ...small, marginTop: 6, textAlign: 'center' }}>{layout === 'carousel' ? `One post, ${d} slides. Swipe to see each` : `${d} posts, one for each dish. Swipe to see each`}</div>}

      {/* what the app already knows, said once */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginTop: 10, padding: '10px 10px', borderRadius: 14, background: C.bg }}>
        {facts.map((f) => (
          <div key={f.label} style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: C.mute }}>{f.icon}{f.label}</div>
            <div style={{ fontSize: 13, fontWeight: 700, marginTop: 3, color: C.ink, whiteSpace: 'nowrap' }}>{f.value}</div>
          </div>
        ))}
      </div>
      {printInPlan && <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, ...small }}><Printer size={14} /> The table tent uses this design</div>}

      {/* two or more dishes: one carousel post, or a post each */}
      {d > 1 && <>
        <div style={h}>Your {d} dishes</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {([['carousel', 'One post', 'A slide for each dish'], ['each', 'A post each', `${d} separate posts`]] as const).map(([k, label, sub]) => {
            const on = layout === k
            const c = at({ layout: k })
            return (
              <button key={k} type="button" onClick={() => setOpt({ layout: k })} aria-pressed={on} style={{ textAlign: 'left', padding: '12px 12px', borderRadius: 16, border: `1.5px solid ${on ? C.greenDk : C.line}`, background: on ? C.greenSoft : '#fff', fontFamily: 'inherit', cursor: 'pointer', color: C.ink }}>
                <b style={{ display: 'block', fontSize: 15 }}>{label}</b>
                <small style={{ ...small, display: 'block', marginTop: 2 }}>{sub}</small>
                <b style={{ display: 'block', marginTop: 8, fontSize: 14, color: inc && !c ? C.greenDk : C.ink }}>{inc ? (c ? `+${dollars(c)}` : 'Included') : dollars(c)}</b>
              </button>
            )
          })}
        </div>
      </>}

      {/* the level: what you get, not how many designs to pick from */}
      <div style={h}>How it is made <span style={small}>{orders > 1 ? 'for each post' : layout === 'carousel' ? 'for the whole post' : 'for the post'}</span></div>
      <div style={{ display: 'grid', gap: 8 }}>
        {levels.map((l) => {
          const on = lv === l
          const s = TIER_SPECS[l]
          const price = levelPrice(l)
          return (
            <button key={l} type="button" onClick={() => setOpt({ level: l })} aria-pressed={on} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, textAlign: 'left', padding: '13px 14px', borderRadius: 16, border: `1.5px solid ${on ? C.greenDk : C.line}`, background: on ? C.greenSoft : '#fff', fontFamily: 'inherit', cursor: 'pointer', color: C.ink }}>
              <span aria-hidden style={{ marginTop: 2, width: 20, height: 20, borderRadius: 99, border: on ? 0 : `1.5px solid ${C.line}`, background: on ? C.greenDk : '#fff', display: 'grid', placeItems: 'center', flex: 'none' }}>{on && <Check size={12} color="#fff" strokeWidth={3} />}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <b style={{ flex: 1, fontFamily: DISPLAY, fontSize: 16, fontWeight: 700, letterSpacing: '-.01em' }}>{LEVEL_NAME[l]}</b>
                  <b style={{ fontSize: 14, color: price === 'Included' ? C.greenDk : C.ink, whiteSpace: 'nowrap' }}>{price}</b>
                </span>
                <span style={{ display: 'block', fontSize: 13.5, marginTop: 3, lineHeight: 1.35 }}>{GRAPHIC_LEVEL_WHAT[l]}</span>
                <span style={{ display: 'block', ...small, marginTop: 3 }}>{`${s.revisionRounds} round${s.revisionRounds === 1 ? '' : 's'} of changes`}{s.sourceFiles ? ' · the file you can edit' : ''}</span>
              </span>
            </button>
          )
        })}
      </div>

      {/* the maker: the Apnosh design team or a creator, same price either way */}
      <div style={h}>Made by <span style={small}>same price either way</span></div>
      <div style={{ borderTop: `0.5px solid ${C.line}` }}>
        {[{ vendorId: '', slug: '', name: 'The Apnosh design team', ratingLabel: 'Our designers', rating: null } as Maker, ...(makers ?? [])].map((m) => {
          const on = makerId === m.vendorId
          return (
            <div key={m.vendorId || 'team'} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: `0.5px solid ${C.line}` }}>
              <button type="button" onClick={() => setOpt({ makerVendorId: m.vendorId || undefined, makerName: m.vendorId ? m.name : undefined })} aria-pressed={on} style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 12, border: 0, background: 'none', padding: 0, fontFamily: 'inherit', textAlign: 'left', cursor: 'pointer', color: C.ink }}>
                <span style={{ width: 38, height: 38, borderRadius: 99, background: m.vendorId ? '#ece7fb' : C.greenSoft, color: m.vendorId ? '#6a39de' : C.greenDk, display: 'grid', placeItems: 'center', fontSize: 15, fontWeight: 800, flex: 'none' }}>{m.name.slice(0, 1)}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ display: 'block', fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</b>
                  <small style={{ ...small, display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 1 }}>{m.rating ? <Star size={12} fill="#f5b400" color="#f5b400" /> : null}{m.ratingLabel}</small>
                </span>
                <span aria-hidden style={{ width: 22, height: 22, borderRadius: 99, border: on ? 0 : `1.5px solid ${C.line}`, background: on ? C.greenDk : '#fff', display: 'grid', placeItems: 'center', flex: 'none' }}>{on && <Check size={13} color="#fff" strokeWidth={3} />}</span>
              </button>
              {m.slug && <a href={`/marketplace/${m.slug}`} target="_blank" rel="noreferrer" style={{ fontSize: 13, fontWeight: 700, color: C.greenDk, textDecoration: 'none', flex: 'none' }}>View work</a>}
            </div>
          )
        })}
        {makers === null && <div style={{ ...small, padding: '10px 0' }}>Finding creators near you…</div>}
      </div>

      {/* anything else for the designer */}
      <label style={{ display: 'block', marginTop: 22 }}>
        <span style={{ display: 'block', fontSize: 16, fontWeight: 700, color: C.ink, margin: '0 2px 10px' }}>Additional comments</span>
        <textarea rows={3} value={String(o.note ?? '')} onChange={(e) => setOpt({ note: e.target.value.slice(0, 400) })} placeholder="Anything the designer should know" style={{ display: 'block', width: '100%', boxSizing: 'border-box', borderRadius: 12, border: '1.5px solid transparent', background: C.bg, padding: 12, fontFamily: 'inherit', fontSize: 16, lineHeight: 1.4, color: C.ink, outline: 'none', resize: 'none' }} />
      </label>

      <button type="button" onClick={onDone} style={{ marginTop: 16, width: '100%', height: 52, borderRadius: 99, border: 0, background: C.ink, color: '#fff', fontFamily: 'inherit', fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: cents ? 'space-between' : 'center', padding: '0 22px', cursor: 'pointer' }}>
        <span>{doneLabel}</span>{cents > 0 && <span>{inc ? `+${dollars(cents)}` : dollars(cents)}</span>}
      </button>
      {onRemove && <div style={{ textAlign: 'center', marginTop: 8 }}><button type="button" onClick={onRemove} style={{ fontFamily: 'inherit', fontSize: 14, fontWeight: 700, color: '#c92d32', border: 0, background: 'none', padding: '8px 10px', cursor: 'pointer' }}>Remove from plan</button></div>}
    </div>
  )
}
