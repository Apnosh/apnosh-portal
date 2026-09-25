'use client'
/**
 * WHAT IT LOOKS LIKE (owner 2026-09-24): "the things just look like the graphic example, the reel
 * example". Every piece on the plan page shows a tiny example of the real thing instead of an icon:
 * the graphic as a post with the dish and its price, the Reel as a vertical video, the content day as
 * a grid of photos, the offer as a coupon with its code, the table tent as a tent card on a table.
 * Drawn in plain HTML and CSS at one base size (100 x 125) and scaled, so every piece matches.
 */
import type { CSSProperties, ReactNode } from 'react'
import { Heart, MessageCircle, Play, Send, Star, Camera } from 'lucide-react'

const FOOD_GROUND = 'linear-gradient(160deg,#f6d9aa 0%,#d9955a 55%,#9c5a2c 100%)'
const money = (v?: string) => (v ? (/^\d/.test(v) ? `$${v}` : v) : '')

/* a little plated dish: a bun with greens, drawn with shapes */
function Food({ size = 44, style }: { size?: number; style?: CSSProperties }) {
  const s = size
  return (
    <div aria-hidden style={{ position: 'relative', width: s, height: s * 0.62, ...style }}>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: s * 0.2, borderRadius: '50%', background: 'rgba(255,255,255,.85)', boxShadow: '0 1px 2px rgba(0,0,0,.12)' }} />
      <div style={{ position: 'absolute', left: s * 0.1, right: s * 0.1, bottom: s * 0.1, height: s * 0.34, borderRadius: `${s * 0.2}px ${s * 0.2}px ${s * 0.08}px ${s * 0.08}px`, background: 'linear-gradient(180deg,#e9a45b,#b86a2c)' }} />
      <div style={{ position: 'absolute', left: s * 0.14, right: s * 0.14, bottom: s * 0.2, height: s * 0.07, borderRadius: 4, background: '#5fa35a' }} />
      <div style={{ position: 'absolute', left: s * 0.3, bottom: s * 0.25, width: s * 0.09, height: s * 0.09, borderRadius: 99, background: '#d9483b' }} />
      <div style={{ position: 'absolute', left: s * 0.58, bottom: s * 0.26, width: s * 0.08, height: s * 0.08, borderRadius: 99, background: '#d9483b' }} />
    </div>
  )
}

export interface PieceThumbProps {
  id: string
  /** outer width in px; height is 1.25 x */
  w: number
  dish?: { name: string; price: string }
  biz?: string
  /** print: 'tent' | 'poster' */
  variant?: string
  code?: string
  creator?: string
  photos?: number
  radius?: number
}

export default function PieceThumb({ id, w, dish, biz, variant, code, creator, photos, radius }: PieceThumbProps) {
  const k = w / 100
  const name = dish?.name || 'Your new dish'
  const price = money(dish?.price)
  const initial = (biz || 'Y').slice(0, 1).toUpperCase()
  const frame = (bg: string, children: ReactNode) => (
    <div style={{ width: w, height: w * 1.25, borderRadius: radius ?? Math.max(8, w * 0.14), overflow: 'hidden', flex: 'none', position: 'relative', background: bg, boxShadow: '0 1px 2px rgba(29,29,31,.08)' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: 100, height: 125, transform: `scale(${k})`, transformOrigin: 'top left' }}>{children}</div>
    </div>
  )
  const abs = (s: CSSProperties): CSSProperties => ({ position: 'absolute', ...s })
  const title = (t: string, s: CSSProperties) => <div style={{ fontFamily: "'Cal Sans','Inter',sans-serif", fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1.02, ...s }}>{t}</div>
  const bars = (n: number, top: number, color = '#e6e6ea') => Array.from({ length: n }, (_, i) => <div key={i} style={abs({ left: 8, top: top + i * 7, width: i === n - 1 ? 50 : 80, height: 4, borderRadius: 3, background: color })} />)

  switch (id) {
    case 'graphic':
      return frame(FOOD_GROUND, <>
        <div style={abs({ left: 7, top: 7, fontSize: 5.5, fontWeight: 800, letterSpacing: '.1em', color: 'rgba(255,255,255,.85)', textTransform: 'uppercase' })}>{biz || 'Your place'}</div>
        {price && <div style={abs({ right: 6, top: 6, width: 24, height: 24, borderRadius: 99, background: '#f5c542', display: 'grid', placeItems: 'center', fontSize: 8.5, fontWeight: 900, color: '#1d1d1f' })}>{price}</div>}
        <Food size={52} style={abs({ left: 24, top: 34 })} />
        <div style={abs({ left: 0, right: 0, bottom: 0, height: 52, background: 'linear-gradient(180deg,rgba(0,0,0,0),rgba(0,0,0,.55))' })} />
        {title(name, abs({ left: 7, right: 7, bottom: 8, fontSize: 12, color: '#fff' }))}
      </>)
    case 'video':
      return frame('linear-gradient(170deg,#6b3f22 0%,#2b1a12 100%)', <>
        <Food size={58} style={abs({ left: 21, top: 30, opacity: .75 })} />
        <div style={abs({ left: 7, top: 7, fontSize: 7, fontWeight: 800, color: '#fff' })}>Reels</div>
        <div style={abs({ left: 36, top: 44, width: 28, height: 28, borderRadius: 99, background: 'rgba(255,255,255,.92)', display: 'grid', placeItems: 'center' })}><Play size={13} fill="#1d1d1f" color="#1d1d1f" style={{ marginLeft: 2 }} /></div>
        <div style={abs({ right: 6, bottom: 22, display: 'flex', flexDirection: 'column', gap: 6, color: '#fff' })}><Heart size={9} /><MessageCircle size={9} /><Send size={9} /></div>
        <div style={abs({ left: 7, right: 22, bottom: 8, fontSize: 7.5, fontWeight: 700, color: '#fff', lineHeight: 1.2 })}>{name}</div>
      </>)
    case 'photos': {
      const tiles = ['linear-gradient(150deg,#f3c98b,#c47a3a)', 'linear-gradient(150deg,#dfeee0,#7fb07c)', 'linear-gradient(150deg,#f7dcc2,#d7925d)', 'linear-gradient(150deg,#fbe7b0,#e2a13e)']
      return frame('#fff', <>
        {tiles.map((t, i) => <div key={i} style={abs({ left: 6 + (i % 2) * 45, top: 6 + Math.floor(i / 2) * 50, width: 43, height: 48, borderRadius: 7, background: t, overflow: 'hidden' })}>{i !== 1 && <Food size={30} style={{ position: 'absolute', left: 6, top: 14 }} />}</div>)}
        <div style={abs({ left: 6, right: 6, bottom: 6, height: 15, borderRadius: 99, background: '#1d1d1f', color: '#fff', fontSize: 7.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 })}><Camera size={8} />{photos ? `${photos} photos` : 'Photos'}</div>
      </>)
    }
    case 'post':
    case 'boost':
      return frame('#fff', <>
        <div style={abs({ left: 7, top: 7, width: 12, height: 12, borderRadius: 99, background: '#eaf7f3', color: '#2e9a78', fontSize: 7, fontWeight: 900, display: 'grid', placeItems: 'center' })}>{initial}</div>
        <div style={abs({ left: 23, top: 8, width: 44, height: 4, borderRadius: 3, background: '#1d1d1f' })} />
        {id === 'boost' ? <div style={abs({ left: 23, top: 14, fontSize: 5.5, fontWeight: 700, color: '#6e6e73' })}>Sponsored</div> : <div style={abs({ left: 23, top: 14, width: 26, height: 3, borderRadius: 3, background: '#e6e6ea' })} />}
        <div style={abs({ left: 0, right: 0, top: 24, height: 60, background: FOOD_GROUND, overflow: 'hidden' })}><Food size={46} style={{ position: 'absolute', left: 27, top: 14 }} /></div>
        {id === 'boost' && <div style={abs({ left: 0, right: 0, top: 84, height: 12, background: '#2e9a78', color: '#fff', fontSize: 6.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 7px' })}><span>Order now</span><span>›</span></div>}
        <div style={abs({ left: 7, top: id === 'boost' ? 100 : 89, display: 'flex', gap: 5, color: '#1d1d1f' })}><Heart size={8} /><MessageCircle size={8} /><Send size={8} /></div>
        {id === 'post' && bars(2, 101)}
        {id === 'post' && <div style={abs({ right: 7, top: 88, display: 'flex', gap: 2 })}>{['#e1306c', '#1877f2', '#34a853'].map((c) => <i key={c} style={{ width: 6, height: 6, borderRadius: 99, background: c }} />)}</div>}
      </>)
    case 'creator':
      return frame('linear-gradient(160deg,#ece7fb,#d9cff7)', <>
        <div style={abs({ left: 30, top: 12, width: 40, height: 40, borderRadius: 99, background: 'conic-gradient(#e1306c,#f5b400,#e1306c)', padding: 2.5, boxSizing: 'border-box' })}><div style={{ width: '100%', height: '100%', borderRadius: 99, background: '#fff', display: 'grid', placeItems: 'center', fontSize: 15, fontWeight: 900, color: '#6a39de' }}>{(creator || 'C').slice(0, 1)}</div></div>
        <div style={abs({ left: 0, right: 0, top: 56, textAlign: 'center', fontSize: 8, fontWeight: 800, color: '#1d1d1f' })}>{creator ? creator.split(' ')[0] : 'A local creator'}</div>
        <div style={abs({ left: 14, right: 14, top: 70, height: 46, borderRadius: 7, background: FOOD_GROUND, overflow: 'hidden' })}><Food size={36} style={{ position: 'absolute', left: 18, top: 10 }} /></div>
      </>)
    case 'print':
      if (variant === 'poster') return frame('#e6eef9', <>
        <div style={abs({ left: 18, top: 10, width: 64, height: 98, borderRadius: 3, background: '#fff', boxShadow: '0 2px 5px rgba(0,0,0,.15)', overflow: 'hidden' })}>
          <div style={{ height: 50, background: FOOD_GROUND, position: 'relative' }}><Food size={38} style={{ position: 'absolute', left: 13, top: 12 }} /></div>
          {title(name, { fontSize: 8.5, color: '#1d1d1f', padding: '5px 5px 0' })}
          {price && <div style={{ fontSize: 8.5, fontWeight: 900, color: '#d99a1e', padding: '2px 5px' }}>{price}</div>}
        </div>
      </>)
      return frame('#fbf3e3', <>
        <div style={abs({ left: 12, top: 18, width: 76, height: 74, background: '#fff', clipPath: 'polygon(12% 0, 88% 0, 100% 100%, 0 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 8, boxSizing: 'border-box' })}>
          <Food size={30} />
          {title(name, { fontSize: 7.5, color: '#1d1d1f', textAlign: 'center', padding: '4px 10px 0' })}
          {price && <div style={{ fontSize: 8, fontWeight: 900, color: '#d99a1e', marginTop: 2 }}>{price}</div>}
        </div>
        <div style={abs({ left: 4, right: 4, top: 92, height: 7, borderRadius: 3, background: '#b98a5a' })} />
      </>)
    case 'taste':
      return frame('#e3f3ee', <>
        <div style={abs({ left: 18, top: 24, width: 64, height: 64, borderRadius: 99, background: '#fff', boxShadow: '0 2px 5px rgba(0,0,0,.1)' })} />
        {[[34, 42], [52, 38], [44, 58], [60, 56]].map(([x, y], i) => <div key={i} style={abs({ left: x, top: y, width: 12, height: 9, borderRadius: 4, background: 'linear-gradient(180deg,#e9a45b,#b86a2c)' })} />)}
        {[[38, 36], [56, 32], [48, 52], [64, 50]].map(([x, y], i) => <div key={i} style={abs({ left: x, top: y, width: 1.5, height: 10, background: '#8a6a4a', transform: 'rotate(-10deg)' })} />)}
        <div style={abs({ left: 0, right: 0, bottom: 12, textAlign: 'center', fontSize: 8.5, fontWeight: 800, color: '#2e9a78' })}>Free taste</div>
      </>)
    case 'offer':
      return frame('#e6eef9', <>
        <div style={abs({ left: 10, top: 30, width: 80, height: 62, borderRadius: 8, background: '#fff', boxShadow: '0 2px 5px rgba(0,0,0,.1)' })} />
        <div style={abs({ left: 5, top: 54, width: 10, height: 12, borderRadius: 99, background: '#e6eef9' })} />
        <div style={abs({ right: 5, top: 54, width: 10, height: 12, borderRadius: 99, background: '#e6eef9' })} />
        <div style={abs({ left: 10, right: 10, top: 38, textAlign: 'center', fontSize: 9, fontWeight: 900, color: '#3b6fd4' })}>FREE DRINK</div>
        <div style={abs({ left: 20, right: 20, top: 60, borderTop: '1.2px dashed #c9d6ee' })} />
        <div style={abs({ left: 10, right: 10, top: 67, textAlign: 'center', fontSize: 8.5, fontWeight: 800, letterSpacing: '.06em', color: '#1d1d1f', fontFamily: 'ui-monospace, Menlo, monospace' })}>{code || 'CODE10'}</div>
      </>)
    case 'review':
      return frame('#fbf3e3', <>
        <div style={abs({ left: 12, top: 22, width: 76, height: 80, borderRadius: 8, background: '#fff', boxShadow: '0 2px 5px rgba(0,0,0,.08)' })} />
        <div style={abs({ left: 20, top: 34, display: 'flex', gap: 2 })}>{[0, 1, 2, 3, 4].map((i) => <Star key={i} size={10} fill="#f5b400" color="#f5b400" />)}</div>
        <div style={abs({ left: 20, top: 52, fontSize: 8.5, fontWeight: 800, color: '#1d1d1f' })}>Review us</div>
        <div style={abs({ left: 20, top: 66, width: 58, height: 4, borderRadius: 3, background: '#e6e6ea' })} />
        <div style={abs({ left: 20, top: 74, width: 40, height: 4, borderRadius: 3, background: '#e6e6ea' })} />
      </>)
    case 'sign':
      return frame('#fbe9ee', <>
        <div style={abs({ left: 20, top: 16, width: 60, height: 70, borderRadius: 6, background: '#fff', boxShadow: '0 2px 5px rgba(0,0,0,.1)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5 })}>
          <Camera size={16} color="#c2418f" />
          <div style={{ fontSize: 8, fontWeight: 800, color: '#1d1d1f', textAlign: 'center', lineHeight: 1.15 }}>Post it,<br />tag us</div>
        </div>
        <div style={abs({ left: 30, top: 86, width: 3, height: 22, background: '#b98a5a', transform: 'rotate(8deg)' })} />
        <div style={abs({ left: 67, top: 86, width: 3, height: 22, background: '#b98a5a', transform: 'rotate(-8deg)' })} />
      </>)
    case 'apps':
      return frame('#fff', <>
        <div style={abs({ left: 0, right: 0, top: 0, height: 22, background: '#eb1700', color: '#fff', fontSize: 8, fontWeight: 900, display: 'flex', alignItems: 'center', paddingLeft: 7 })}>Featured</div>
        <div style={abs({ left: 7, top: 30, width: 34, height: 34, borderRadius: 6, background: FOOD_GROUND, overflow: 'hidden' })}><Food size={26} style={{ position: 'absolute', left: 4, top: 10 }} /></div>
        <div style={abs({ left: 46, top: 32, width: 46, height: 5, borderRadius: 3, background: '#1d1d1f' })} />
        <div style={abs({ left: 46, top: 42, width: 36, height: 4, borderRadius: 3, background: '#e6e6ea' })} />
        {price && <div style={abs({ left: 46, top: 51, fontSize: 8, fontWeight: 900, color: '#1d1d1f' })}>{price}</div>}
        {bars(3, 76)}
      </>)
    default:
      return frame('#f5f5f7', <div style={abs({ inset: 8, borderRadius: 10, border: '1.5px dashed #c9c9d0', display: 'grid', placeItems: 'center', fontSize: 26, fontWeight: 300, color: '#6e6e73' })}>+</div>)
  }
}
