'use client'
/**
 * THE GRAPHIC, DONE WITH CARE (owner 2026-09-24, "go with A, but the cards are better").
 * =====================================================================================
 * The graphic's options open on the post as it will look (A, the live preview): the dish on the photo,
 * the price, the launch offer when it is on, one slide per dish on a carousel. Everything the app already
 * knows is said once, never asked: where the photos come from, the four sizes, the ready day, whether a
 * brand kit is on file. The level is B's package cards: what each level gives, in plain words.
 *
 * One announcement, one graphic (owner): one dish is one post graphic; two or more dishes are one
 * carousel post with a slide for each dish, or a post for each dish. The level changes its quality.
 */
import type { CSSProperties, ReactNode } from 'react'
import { Bookmark, CalendarDays, Camera, Check, FilePen, Heart, Languages, Layers, Lock, MessageCircle, MoreHorizontal, Palette, Printer, RotateCcw, Send, Tag, Ticket, Type, X } from 'lucide-react'
import { C, DISPLAY } from '../tokens'
import { Drawing } from './drawings'
import { itemCents, graphicLayout, graphicDishes, graphicOrders, graphicLevel, includedLevel, LEVEL_NAME, TIER_SPECS, type GraphicLevel, type MenuPrices } from '@/lib/plan/item-price'
import type { ItemPick } from '@/lib/plan/suggest'

const dollars = (c: number) => `$${Math.round(c / 100).toLocaleString()}`
const LOOKS = ['Bright', 'Warm', 'Moody', 'Minimal', 'Bold', 'Playful'] as const
/* the photo's ground until the real photo exists, tinted by the first look picked */
const GROUND: Record<string, { bg: string; ink: string; scrim: boolean }> = {
  Warm: { bg: 'linear-gradient(160deg,#f6d9aa 0%,#d9955a 55%,#9c5a2c 100%)', ink: '#fff', scrim: true },
  Bright: { bg: 'linear-gradient(160deg,#fff1c7 0%,#f7b867 60%,#e9824a 100%)', ink: '#fff', scrim: true },
  Moody: { bg: 'linear-gradient(160deg,#6b4630 0%,#2e1d14 70%,#160d08 100%)', ink: '#fff', scrim: false },
  Minimal: { bg: 'linear-gradient(160deg,#faf7f1 0%,#ece3d6 100%)', ink: C.ink, scrim: false },
  Bold: { bg: 'linear-gradient(160deg,#f07b3f 0%,#c7361c 60%,#7e1a0c 100%)', ink: '#fff', scrim: true },
  Playful: { bg: 'linear-gradient(160deg,#ffd6e3 0%,#ffc27a 50%,#8fd1ff 100%)', ink: '#fff', scrim: true },
}

export interface GraphicSheetProps {
  item: ItemPick
  prices: MenuPrices
  setOpt: (o: Record<string, unknown>) => void
  bizName: string
  dishes: { name: string; price: string }[]
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
  const list = dishes.length ? dishes : [{ name: 'The dish', price: '' }]
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
  const looks = String(o.look ?? '').split(', ').filter(Boolean)
  const ground = GROUND[looks[0] ?? 'Warm'] ?? GROUND.Warm
  const money = (v: string) => (v ? (/^\d/.test(v) ? `$${v}` : v) : '')
  const tierPre = (l: GraphicLevel) => prices.graphicTiers?.[l] ?? (l === 2 ? prices.graphic : 0)
  const at = (patch: Record<string, unknown>) => itemCents({ ...item, options: { ...o, ...patch } }, prices)


  const h: CSSProperties = { display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 16, fontWeight: 700, color: C.ink, margin: '24px 2px 10px' }
  const small: CSSProperties = { fontSize: 12.5, fontWeight: 500, color: C.mute }

  /* one slide: the photo (or its ground), the dish, the price, the offer */
  const slide = (dish: { name: string; price: string }, i: number) => (
    <div key={i} style={{ flex: 'none', width: list.length > 1 && layout !== 'single' ? '86%' : '100%', scrollSnapAlign: 'start', position: 'relative', aspectRatio: '4 / 5', borderRadius: 14, overflow: 'hidden', background: photo ? `center/cover url(${photo})` : ground.bg }}>
      {!photo && <span aria-hidden style={{ position: 'absolute', left: '50%', top: '38%', transform: 'translate(-50%,-50%)', width: 92, opacity: .35, ['--c2' as string]: '#7a4a24' }}><Drawing spec={{ scene: 'dish' }} name="" rating="" t={(x) => x} /></span>}
      {!photo && <span style={{ position: 'absolute', left: 0, right: 0, top: '58%', textAlign: 'center', fontSize: 11, fontWeight: 600, color: ground.ink, opacity: .75 }}>{photoSource === 'content' || photoSource === 'queue' ? 'Your content day photo goes here' : 'Your photo goes here'}</span>}
      <span style={{ position: 'absolute', left: 12, top: 11, fontSize: 9.5, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: ground.ink, opacity: .85 }}>{bizName || 'Your restaurant'}</span>
      {spanish && <span style={{ position: 'absolute', left: 12, top: 28, height: 18, padding: '0 6px', borderRadius: 6, background: 'rgba(255,255,255,.9)', color: C.ink, fontSize: 10, fontWeight: 800, display: 'inline-flex', alignItems: 'center' }}>ES too</span>}
      {priceOn && money(dish.price) && <span style={{ position: 'absolute', right: 10, top: 10, minWidth: 52, height: 52, padding: '0 6px', boxSizing: 'border-box', borderRadius: 99, background: '#f5c542', color: C.ink, display: 'grid', placeItems: 'center', fontFamily: DISPLAY, fontSize: 18, fontWeight: 800, boxShadow: '0 2px 8px rgba(0,0,0,.18)' }}>{money(dish.price)}</span>}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '40px 14px 14px', background: ground.scrim || photo ? 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,.55) 100%)' : 'none' }}>
        <b style={{ display: 'block', fontFamily: DISPLAY, fontSize: 28, fontWeight: 800, lineHeight: 1.02, letterSpacing: '-.02em', color: photo ? '#fff' : ground.ink, textWrap: 'balance' }}>{dish.name}</b>
        {offerOn && offer && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8, height: 24, padding: '0 9px', borderRadius: 7, background: '#f5c542', color: C.ink, fontSize: 11.5, fontWeight: 800, maxWidth: '100%', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{offer.text}{offer.code ? ` · ${offer.code}` : ''}</span>}
      </div>
    </div>
  )
  const slides = layout === 'single' ? [list[0]] : list

  const toggle = (on: boolean, set: () => void, label: string) => (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={set} style={{ flex: 'none', width: 46, height: 28, borderRadius: 99, border: 0, padding: 3, background: on ? C.greenDk : '#e6e6ea', cursor: 'pointer', display: 'flex', justifyContent: on ? 'flex-end' : 'flex-start', transition: 'background .15s' }}>
      <span style={{ width: 22, height: 22, borderRadius: 99, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }} />
    </button>
  )
  const onRow = (icon: ReactNode, label: string, sub: string, right: ReactNode) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: `0.5px solid ${C.line}` }}>
      <span style={{ width: 36, height: 36, borderRadius: 11, background: C.bg, display: 'grid', placeItems: 'center', flex: 'none', color: C.ink }}>{icon}</span>
      <span style={{ flex: 1, minWidth: 0 }}><b style={{ display: 'block', fontSize: 15, fontWeight: 600 }}>{label}</b><small style={{ ...small, display: 'block', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</small></span>
      {right}
    </div>
  )

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

  return (
    <div>
      {/* A: the post as it will look */}
      <div style={{ border: `1px solid ${C.line}`, borderRadius: 20, background: '#fff', overflow: 'hidden', boxShadow: '0 1px 3px rgba(29,29,31,.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px' }}>
          <span style={{ width: 28, height: 28, borderRadius: 99, background: C.greenSoft, color: C.greenDk, display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 800, flex: 'none' }}>{(bizName || 'Y').slice(0, 1).toUpperCase()}</span>
          <b style={{ flex: 1, fontSize: 13.5 }}>{bizName || 'Your restaurant'}</b>
          <MoreHorizontal size={18} color={C.mute} />
        </div>
        <div className="mvp-hscroll" style={{ display: 'flex', gap: 8, overflowX: slides.length > 1 ? 'auto' : 'visible', scrollSnapType: 'x mandatory', padding: '0 12px', scrollbarWidth: 'none' }}>
          {slides.map((x, i) => slide(x, i))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 14px 12px', color: C.ink }}>
          <Heart size={20} /><MessageCircle size={20} /><Send size={20} />
          <span style={{ flex: 1, display: 'flex', justifyContent: 'center', gap: 4 }}>{slides.length > 1 && slides.map((_, i) => <i key={i} style={{ width: 6, height: 6, borderRadius: 99, background: i === 0 ? C.greenDk : '#d6d6db' }} />)}</span>
          <Bookmark size={20} />
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
          {([['carousel', 'One post', `A slide for each dish`], ['each', 'A post each', `${d} separate posts`]] as const).map(([k, label, sub]) => {
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

      {/* B: the level as package cards, in plain words */}
      <div style={h}>How much design <span style={small}>{orders > 1 ? 'for each post' : layout === 'carousel' ? 'for the whole post' : 'for the post'}</span></div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${levels.length}, 1fr)`, gap: 8 }}>
        {levels.map((l) => {
          const on = lv === l
          const s = TIER_SPECS[l]
          const row = (icon: ReactNode, text: string, muted = false) => <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7, marginTop: 8, color: muted ? C.faint : C.ink }}><span style={{ flex: 'none', marginTop: 1, color: muted ? C.faint : C.mute }}>{icon}</span><span style={{ fontSize: 12.5, lineHeight: 1.3, fontWeight: 500 }}>{text}</span></div>
          return (
            <button key={l} type="button" onClick={() => setOpt({ level: l })} aria-pressed={on} style={{ position: 'relative', textAlign: 'left', padding: '12px 12px 13px', borderRadius: 16, border: `1.5px solid ${on ? C.greenDk : C.line}`, background: on ? C.greenSoft : '#fff', fontFamily: 'inherit', cursor: 'pointer', color: C.ink, minWidth: 0 }}>
              <span aria-hidden style={{ position: 'absolute', top: 11, right: 11, width: 20, height: 20, borderRadius: 99, border: on ? 0 : `1.5px solid ${C.line}`, background: on ? C.greenDk : '#fff', display: 'grid', placeItems: 'center' }}>{on && <Check size={12} color="#fff" strokeWidth={3} />}</span>
              <b style={{ display: 'block', fontFamily: DISPLAY, fontSize: 16, fontWeight: 700, letterSpacing: '-.01em', paddingRight: 22 }}>{LEVEL_NAME[l]}</b>
              <b style={{ display: 'block', marginTop: 2, fontSize: 14, color: levelPrice(l) === 'Included' ? C.greenDk : C.ink }}>{levelPrice(l)}{!inc && orders > 1 ? '' : ''}</b>
              {row(<Layers size={14} />, `${s.concepts} design${s.concepts === 1 ? '' : 's'} to pick from`)}
              {row(<RotateCcw size={14} />, `${s.revisionRounds} round${s.revisionRounds === 1 ? '' : 's'} of changes`)}
              {s.sourceFiles ? row(<FilePen size={14} />, 'The file you can edit') : row(<X size={14} />, 'No file to edit', true)}
            </button>
          )
        })}
      </div>

      {/* what goes on it */}
      <div style={h}>On it</div>
      <div style={{ borderBottom: `0.5px solid ${C.line}` }}>
        {onRow(<Type size={17} />, 'Dish name', list.map((x) => x.name).join(', '), <span style={{ ...small, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Lock size={13} /> Always</span>)}
        {onRow(<Tag size={17} />, 'Price', list.map((x) => money(x.price)).filter(Boolean).join(', ') || 'No price given', toggle(priceOn, () => setOpt({ priceOn: !priceOn }), 'Price on it'))}
        {offer && onRow(<Ticket size={17} />, 'The launch offer', `${offer.text}${offer.code ? ` · ${offer.code}` : ''}`, toggle(offerOn, () => setOpt({ offerOn: !offerOn }), 'The launch offer on it'))}
        {onRow(<Languages size={17} />, 'Spanish too', `A second version · +${dollars(4000 * orders)}`, toggle(spanish, () => setOpt({ spanish: !spanish }), 'Spanish too'))}
      </div>

      {/* the look and a note, both optional */}
      <div style={h}>The look <span style={small}>optional</span></div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {LOOKS.map((t) => { const on = looks.includes(t); return <button key={t} type="button" aria-pressed={on} onClick={() => setOpt({ look: (on ? looks.filter((x) => x !== t) : [...looks, t].slice(-3)).join(', ') })} style={{ height: 36, padding: '0 14px', borderRadius: 99, border: `1.5px solid ${on ? C.ink : C.line}`, background: on ? C.ink : '#fff', color: on ? '#fff' : C.ink, fontFamily: 'inherit', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>{t}</button> })}
      </div>
      <label style={{ display: 'block', marginTop: 14 }}>
        <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: C.mute, marginBottom: 6, padding: '0 2px' }}>Note for the designer</span>
        <input value={String(o.note ?? '')} onChange={(e) => setOpt({ note: e.target.value })} placeholder="Use the blue plates" style={{ display: 'block', width: '100%', boxSizing: 'border-box', height: 48, borderRadius: 12, border: '1.5px solid transparent', background: C.bg, padding: '0 12px', fontFamily: 'inherit', fontSize: 16, color: C.ink, outline: 'none' }} />
      </label>

      {onRemove && <div style={{ textAlign: 'center', marginTop: 16 }}><button type="button" onClick={onRemove} style={{ fontFamily: 'inherit', fontSize: 14, fontWeight: 700, color: '#c92d32', border: 0, background: 'none', padding: '6px 10px', cursor: 'pointer' }}>Remove from plan</button></div>}
      <button type="button" onClick={onDone} style={{ marginTop: 10, width: '100%', height: 52, borderRadius: 99, border: 0, background: C.ink, color: '#fff', fontFamily: 'inherit', fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 22px', cursor: 'pointer' }}>
        <span>{doneLabel}</span><span>{inc && !cents ? 'Included' : inc ? `+${dollars(cents)}` : dollars(cents)}</span>
      </button>
    </div>
  )
}
