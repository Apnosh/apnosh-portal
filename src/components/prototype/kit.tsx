'use client'

/**
 * PROTOTYPE KIT — "Service": a brasserie after dark.
 *
 * The first pass of this screen was competent and completely flat: system sans at one size,
 * grey cards in a column, goods drawn as coloured rectangles. It read as a settings page with
 * prices on it. This is the rebuild.
 *
 * The decisions, so they do not get sanded off later:
 *
 *   TYPE     Playfair Display carries every headline, price and name — it is already loaded in
 *            the portal and never used. DM Sans does the interface. Real scale contrast: a
 *            campaign title is 30px against 11px eyebrows, where before everything sat at 13–25.
 *   COLOUR   Deep green-black ground and bone paper, NOT the cream-and-terracotta that every
 *            generated page defaults to. One metal — brass — and it is reserved for money and
 *            for the one thing that needs the owner. Forest/mint means confirmed, nothing else.
 *   LIGHT    Two-layer shadows and a lifted card, so the shop has depth instead of hairlines.
 *   IMAGERY  The goods have to look like goods. Every piece is drawn as a lit subject in a dark
 *            room — warm off-centre core, vignette, highlight arc — tinted by whoever is making
 *            it. At thumbnail size it reads as photography, which is the entire point of a shop.
 */

import React from 'react'
import type { ArtKind } from './data'

/* ─────────────────────────────────────────────────────────────────────────────
   TOKENS
   ──────────────────────────────────────────────────────────────────────────── */

export interface Tokens {
  ink: string; ink2: string; ink3: string; faint: string
  paper: string; paper2: string; card: string; raised: string
  line: string; line2: string
  brass: string; brassSoft: string; brassInk: string
  forest: string; forestSoft: string; forestInk: string
  ember: string; emberSoft: string
  glass: string
  lift: string; liftHi: string
  scrim: string
}

const light: Tokens = {
  ink: '#14100B', ink2: '#4b4438', ink3: '#7d7466', faint: '#a9a091',
  paper: '#F7F4EC', paper2: '#F1EDE2', card: '#FFFFFF', raised: '#FFFFFF',
  line: '#E4DED0', line2: '#EFEADE',
  brass: '#8A6D1B', brassSoft: '#F6EFD9', brassInk: '#6B5312',
  forest: '#14483A', forestSoft: '#E4F0EA', forestInk: '#0F3A2E',
  ember: '#A6431E', emberSoft: '#F9EAE4',
  glass: 'rgba(255,255,255,.82)',
  lift: '0 1px 2px rgba(20,16,11,.05), 0 8px 24px -6px rgba(20,16,11,.10)',
  liftHi: '0 2px 4px rgba(20,16,11,.06), 0 18px 44px -10px rgba(20,16,11,.18)',
  scrim: 'linear-gradient(to top, rgba(10,8,5,.86) 0%, rgba(10,8,5,.30) 55%, rgba(10,8,5,0) 100%)',
}

const dark: Tokens = {
  ink: '#F3EFE4', ink2: '#C4BDAC', ink3: '#8E8878', faint: '#635E52',
  paper: '#0B0F0D', paper2: '#0E1311', card: '#151B18', raised: '#1A211D',
  line: '#28312C', line2: '#1F2723',
  brass: '#D6B15C', brassSoft: '#2A2416', brassInk: '#E8CB84',
  forest: '#5FCBA4', forestSoft: '#122A22', forestInk: '#7FDCBA',
  ember: '#E08A63', emberSoft: '#2C1A12',
  glass: 'rgba(21,27,24,.86)',
  lift: '0 1px 2px rgba(0,0,0,.45), 0 8px 24px -6px rgba(0,0,0,.55)',
  liftHi: '0 2px 4px rgba(0,0,0,.5), 0 18px 44px -10px rgba(0,0,0,.7)',
  scrim: 'linear-gradient(to top, rgba(4,7,6,.92) 0%, rgba(4,7,6,.35) 55%, rgba(4,7,6,0) 100%)',
}

export const TOKENS = { light, dark }
export type Mode = 'light' | 'dark'

/** Playfair for anything that should feel printed. DM Sans for anything operated. */
export const DISPLAY = "var(--font-playfair), 'Playfair Display', Georgia, serif"
export const UI = "var(--font-dm-sans), 'DM Sans', ui-sans-serif, -apple-system, sans-serif"

export function money(n: number): string { return '$' + n.toLocaleString() }

export function initials(name: string): string {
  const w = name.replace('Apnosh ', '').split(/\s+/).filter(Boolean)
  return (w.length > 1 ? w[0][0] + w[1][0] : (w[0] ?? '?').slice(0, 2)).toUpperCase()
}

/* ─────────────────────────────────────────────────────────────────────────────
   MOTION — one stylesheet, injected once. Everything honours reduced motion.
   ──────────────────────────────────────────────────────────────────────────── */

const CSS = `
@keyframes pxRise { from { opacity:0; transform: translateY(14px) } to { opacity:1; transform:none } }
@keyframes pxFade { from { opacity:0 } to { opacity:1 } }
@keyframes pxPulse { 0%,100% { opacity:.35; transform:scale(1) } 50% { opacity:.9; transform:scale(1.45) } }
@keyframes pxSheen { from { transform: translateX(-120%) } to { transform: translateX(220%) } }
.px-rise { animation: pxRise .62s cubic-bezier(.16,.84,.34,1) both }
.px-fade { animation: pxFade .5s ease both }
.px-pulse { animation: pxPulse 2.1s ease-in-out infinite }
.px-tap { transition: transform .18s cubic-bezier(.2,.8,.3,1), box-shadow .22s ease, border-color .22s ease }
.px-tap:active { transform: scale(.985) }
.px-art { transition: transform .5s cubic-bezier(.2,.8,.3,1) }
.px-card:hover .px-art { transform: scale(1.035) }
/* A swipe rail: cards bleed to both edges and snap. Five campaigns stacked vertically was
   2,000px of scrolling; as a rail it is one gesture and half a screen. */
.px-rail { display:flex; gap:12px; overflow-x:auto; scroll-snap-type:x mandatory;
  -webkit-overflow-scrolling:touch; scrollbar-width:none; padding:2px 18px 6px;
  margin:0 -18px; }
.px-rail::-webkit-scrollbar { display:none }
.px-rail > * { scroll-snap-align:start; flex:0 0 auto }
.px-open { overflow:hidden; transition: max-height .34s cubic-bezier(.2,.8,.3,1), opacity .24s ease }
@media (prefers-reduced-motion: reduce) {
  .px-rise, .px-fade, .px-pulse, .px-tap, .px-art, .px-open {
    animation: none !important; transition: none !important }
}
`

export function Motion() {
  return <style dangerouslySetInnerHTML={{ __html: CSS }} />
}

/** Staggered entrance. Index drives the delay so a list arrives as one gesture. */
export function Rise({ i = 0, children, style }: {
  i?: number; children: React.ReactNode; style?: React.CSSProperties
}) {
  return (
    <div className="px-rise" style={{ animationDelay: `${Math.min(i, 8) * 55}ms`, ...style }}>
      {children}
    </div>
  )
}

/**
 * The running total.
 *
 * This used to count up to its new value. Two attempts at that both displayed a price that
 * lagged a full interaction behind: the cards beside it read $190 and $180 while the bar
 * still said $0. The cause was state shadowing the prop through a ref that only settled when
 * an animation frame ran to completion, which React's dev double-invoke reliably interrupts.
 *
 * A tween is decoration. A wrong price is a lie about what someone is being charged, and no
 * amount of polish is worth carrying that risk in the one component whose entire job is to
 * be correct. So it renders the prop, and the money is right by construction.
 */
export function Counter({ value, style }: { value: number; style?: React.CSSProperties }) {
  return <span style={{ fontVariantNumeric: 'tabular-nums', ...style }}>{money(value)}</span>
}

/* ─────────────────────────────────────────────────────────────────────────────
   TYPE
   ──────────────────────────────────────────────────────────────────────────── */

export function Eyebrow({ children, C, tone = 'faint' }: {
  children: React.ReactNode; C: Tokens; tone?: 'faint' | 'brass' | 'forest'
}) {
  return (
    <div style={{
      fontFamily: UI, fontSize: 10, fontWeight: 700, letterSpacing: '.16em',
      textTransform: 'uppercase',
      color: tone === 'brass' ? C.brass : tone === 'forest' ? C.forest : C.faint,
    }}>{children}</div>
  )
}

export function Display({ children, C, size = 30, style }: {
  children: React.ReactNode; C: Tokens; size?: number; style?: React.CSSProperties
}) {
  return (
    <div style={{
      fontFamily: DISPLAY, fontSize: size, fontWeight: 500,
      letterSpacing: size > 26 ? '-.022em' : '-.012em',
      lineHeight: 1.06, color: C.ink, textWrap: 'balance', ...style,
    }}>{children}</div>
  )
}

export function Body({ children, C, size = 13.5, dim, style }: {
  children: React.ReactNode; C: Tokens; size?: number; dim?: boolean; style?: React.CSSProperties
}) {
  return (
    <div style={{
      fontFamily: UI, fontSize: size, lineHeight: 1.5,
      color: dim ? C.ink3 : C.ink2, ...style,
    }}>{children}</div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   SURFACES
   ──────────────────────────────────────────────────────────────────────────── */

export function Card({ children, C, style, onClick, live, label, flat }: {
  children: React.ReactNode; C: Tokens; style?: React.CSSProperties
  onClick?: () => void; live?: boolean; label?: string; flat?: boolean
}) {
  // Cannot be a <button>: several of these wrap a range input, and a button may not contain
  // interactive descendants. So it takes the role and the keys by hand.
  const act = onClick
    ? {
        role: 'button', tabIndex: 0, 'aria-label': label, 'aria-pressed': live,
        onClick,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() }
        },
      }
    : {}
  return (
    <div {...act} className={`px-card ${onClick ? 'px-tap' : ''}`} style={{
      background: C.card,
      border: `1px solid ${live ? C.forest : C.line}`,
      borderRadius: 18,
      boxShadow: flat ? 'none' : C.lift,
      cursor: onClick ? 'pointer' : undefined,
      overflow: 'hidden',
      ...style,
    }}>{children}</div>
  )
}

export function Btn({
  children, onClick, tone = 'solid', size = 'md', disabled, C, full,
}: {
  children: React.ReactNode; onClick?: () => void
  tone?: 'solid' | 'quiet' | 'ghost' | 'brass'; size?: 'sm' | 'md'
  disabled?: boolean; C: Tokens; full?: boolean
}) {
  const base: React.CSSProperties = {
    fontFamily: UI,
    padding: size === 'sm' ? '9px 15px' : '15px 22px',
    fontSize: size === 'sm' ? 12.5 : 14.5,
    fontWeight: 600, letterSpacing: '.005em',
    borderRadius: 13, cursor: disabled ? 'not-allowed' : 'pointer',
    width: full ? '100%' : undefined, textAlign: 'center', lineHeight: 1.2,
  }
  const skin: React.CSSProperties =
    disabled ? { background: C.line2, color: C.faint, border: `1px solid ${C.line}` }
    : tone === 'solid' ? { background: C.ink, color: C.paper, border: '1px solid transparent' }
    : tone === 'brass' ? { background: C.brass, color: '#fff', border: '1px solid transparent' }
    : tone === 'quiet' ? { background: 'transparent', color: C.ink, border: `1px solid ${C.line}` }
    : { background: 'transparent', color: C.ink3, border: '1px solid transparent' }
  return (
    <button type="button" className="px-tap" onClick={disabled ? undefined : onClick}
      disabled={disabled} style={{ ...base, ...skin }}>{children}</button>
  )
}

export function Avatar({ name, kind, C, size = 26 }: {
  name: string; kind: 'person' | 'ai' | 'you' | 'team'; C: Tokens; size?: number
}) {
  const skin =
    kind === 'you' ? { bg: C.forestSoft, fg: C.forest }
    : kind === 'ai' ? { bg: C.brassSoft, fg: C.brass }
    : kind === 'team' ? { bg: C.line2, fg: C.ink2 }
    : { bg: C.forestSoft, fg: C.forestInk }
  return (
    <span style={{
      width: size, height: size, borderRadius: 99, flexShrink: 0,
      background: skin.bg, color: skin.fg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: UI, fontSize: size * 0.36, fontWeight: 700, letterSpacing: '.02em',
    }}>{kind === 'you' ? 'YOU' : initials(name)}</span>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   THE GOODS, DRAWN
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * One frame: a lit subject in a dark room. Warm core offset from centre, a deep vignette,
 * one highlight arc across the top. Three cheap layers, and at thumbnail scale the eye reads
 * it as a photograph rather than a swatch — which is the difference between a shop and a list.
 */
function Frame({ id, hue, seed, r = 5 }: {
  id: string; hue: [string, string]; seed: number; r?: number
}) {
  const cx = 28 + ((seed * 37) % 45)
  const cy = 24 + ((seed * 53) % 40)
  return (
    <>
      <defs>
        <radialGradient id={`${id}-lit`} cx={`${cx}%`} cy={`${cy}%`} r="82%">
          <stop offset="0%" stopColor={hue[1]} stopOpacity="1" />
          <stop offset="34%" stopColor={hue[1]} stopOpacity=".82" />
          <stop offset="100%" stopColor={hue[0]} stopOpacity="1" />
        </radialGradient>
        <linearGradient id={`${id}-vig`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#000" stopOpacity=".26" />
          <stop offset="42%" stopColor="#000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity=".42" />
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" rx={r} fill={`url(#${id}-lit)`} />
      <rect width="100%" height="100%" rx={r} fill={`url(#${id}-vig)`} />
      <ellipse cx={`${cx}%`} cy={`${cy - 8}%`} rx="26%" ry="9%" fill="#fff" opacity=".13" />
    </>
  )
}

const FALLBACK: [string, string] = ['#0d2119', '#3AA277']

export function Art({ kind, C, hue, h = 150 }: {
  kind: ArtKind; C: Tokens; hue?: [string, string]; h?: number
}) {
  const H = hue ?? FALLBACK
  const uid = React.useId().replace(/[:]/g, '')
  const wire = C.line
  /** The surface every artefact sits on: made from its own hue, so it always contrasts the
   *  card regardless of theme, and each good carries a trace of who is making it. */
  const ground = (
    <>
      <defs>
        <linearGradient id={`${uid}-gnd`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={H[0]} />
          <stop offset="100%" stopColor={H[1]} stopOpacity=".38" />
        </linearGradient>
      </defs>
      <rect width="320" height="180" fill={`url(#${uid}-gnd)`} />
    </>
  )
  const wrap = (kids: React.ReactNode, vb = '0 0 320 180') => (
    <svg viewBox={vb} preserveAspectRatio="xMidYMid slice"
      style={{ display: 'block', width: '100%', height: h }} className="px-art">{kids}</svg>
  )

  switch (kind) {
    /* THE COVER — a colour field, not a fake photograph.
       Two rounds were spent trying to fake photography with radial gradients and both read
       as an out-of-focus placeholder. Procedural SVG cannot do photographs. So this stops
       trying: a saturated field, one large graphic disc, a fine grain, and the type carries
       the card. It looks deliberate instead of broken, and a real photo drops into exactly
       this slot later without touching the layout. */
    case 'cover': return wrap(<>
      <defs>
        <linearGradient id={`${uid}-field`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={H[1]} />
          <stop offset="58%" stopColor={H[1]} stopOpacity=".72" />
          <stop offset="100%" stopColor={H[0]} />
        </linearGradient>
        <radialGradient id={`${uid}-disc`} cx="50%" cy="42%" r="58%">
          <stop offset="0%" stopColor="#fff" stopOpacity=".26" />
          <stop offset="70%" stopColor="#fff" stopOpacity=".05" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <filter id={`${uid}-grain`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
      </defs>
      <rect width="320" height="180" fill={`url(#${uid}-field)`} />
      <circle cx="252" cy="52" r="104" fill={`url(#${uid}-disc)`} />
      <circle cx="252" cy="52" r="66" fill="none" stroke="#fff" strokeOpacity=".13" strokeWidth="1" />
      <circle cx="252" cy="52" r="98" fill="none" stroke="#fff" strokeOpacity=".07" strokeWidth="1" />
      {/* a whisper of grain, so the field has a surface rather than looking like flat ink */}
      <rect width="320" height="180" filter={`url(#${uid}-grain)`} opacity=".14"
        style={{ mixBlendMode: 'overlay' }} />
    </>)

    // A contact sheet. Six distinct frames, so "18 photos" looks like photographs.
    case 'photos': return wrap(<>
      <rect width="320" height="180" fill={H[0]} />
      {[0, 1, 2, 3, 4, 5].map((k) => {
        const col = k % 3, row = Math.floor(k / 3)
        return (
          <svg key={k} x={8 + col * 102} y={8 + row * 84} width="96" height="76" overflow="hidden">
            <Frame id={`${uid}-p${k}`} hue={H} seed={k + 1} r={4} />
          </svg>
        )
      })}
    </>)

    // A poster: the photograph doing the work, type over a scrim, one brass rule.
    case 'poster': return wrap(<>
      <defs>
        <linearGradient id={`${uid}-wall`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={H[0]} />
          <stop offset="100%" stopColor={H[1]} stopOpacity=".45" />
        </linearGradient>
      </defs>
      <rect width="320" height="180" fill={`url(#${uid}-wall)`} />
      <rect x="100" y="6" width="120" height="174" rx="3" fill="#000" opacity=".28" />
      <svg x="106" y="0" width="108" height="180" overflow="hidden">
        <Frame id={`${uid}-po`} hue={H} seed={3} r={0} />
        <rect width="108" height="180" fill="#000" opacity=".28" />
        <rect x="16" y="104" width="76" height="9" rx="2" fill="#fff" opacity=".95" />
        <rect x="16" y="120" width="52" height="6" rx="2" fill="#fff" opacity=".6" />
        <rect x="16" y="140" width="34" height="4" rx="2" fill={C.brass} />
      </svg>
    </>)

    // Three posts in a feed, each its own frame, with the caption lines beneath.
    case 'posts': return wrap(<>
      {ground}
      {[0, 1, 2].map((k) => (
        <g key={k}>
          <svg x={10 + k * 102} y="14" width="96" height="96" overflow="hidden">
            <Frame id={`${uid}-s${k}`} hue={H} seed={k * 3 + 2} r={6} />
          </svg>
          <rect x={10 + k * 102} y="120" width={70 - k * 12} height="5" rx="2.5"
            fill="#fff" opacity=".55" />
          <rect x={10 + k * 102} y="132" width={46 + k * 8} height="5" rx="2.5"
            fill="#fff" opacity=".28" />
        </g>
      ))}
    </>)

    // A phone, held vertically, with the reel inside it.
    case 'reel': return wrap(<>
      <defs>
        <linearGradient id={`${uid}-wall`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={H[0]} />
          <stop offset="100%" stopColor={H[1]} stopOpacity=".4" />
        </linearGradient>
      </defs>
      <rect width="320" height="180" fill={`url(#${uid}-wall)`} />
      <rect x="120" y="10" width="80" height="168" rx="14" fill="#000" opacity=".3" />
      <rect x="126" y="6" width="68" height="168" rx="12" fill="#0d0f0e" />
      <svg x="131" y="11" width="58" height="158" overflow="hidden">
        <Frame id={`${uid}-r`} hue={H} seed={6} r={8} />
      </svg>
      <circle cx="160" cy="90" r="17" fill="#fff" opacity=".92" />
      <path d="M155 82 l14 8 -14 8 z" fill="#14100B" />
      <rect x="136" y="156" width="48" height="3" rx="1.5" fill="#fff" opacity=".3" />
      <rect x="136" y="156" width="19" height="3" rx="1.5" fill={C.brass} />
    </>)

    // An event page: cover photo, title, and the button people actually press.
    case 'event': return wrap(<>
      {ground}
      <svg x="0" y="0" width="320" height="92" overflow="hidden">
        <Frame id={`${uid}-e`} hue={H} seed={4} r={0} />
      </svg>
      <rect x="20" y="108" width="150" height="9" rx="3" fill="#14100B" opacity=".82" />
      <rect x="20" y="124" width="98" height="6" rx="3" fill="#14100B" opacity=".3" />
      <rect x="20" y="142" width="76" height="22" rx="11" fill={C.forest} />
      <rect x="104" y="142" width="58" height="22" rx="11" fill={wire} />
    </>)

    // A search result, because that is literally what a Google post shows up as.
    case 'google': return wrap(<>
      {ground}
      <circle cx="38" cy="40" r="18" fill={H[1]} />
      <rect x="68" y="28" width="132" height="9" rx="3" fill="#14100B" opacity=".8" />
      <rect x="68" y="45" width="84" height="6" rx="3" fill={C.brass} opacity=".8" />
      <rect x="20" y="76" width="280" height="6" rx="3" fill={wire} />
      <rect x="20" y="92" width="238" height="6" rx="3" fill={wire} />
      <svg x="20" y="112" width="122" height="52" overflow="hidden">
        <Frame id={`${uid}-g`} hue={H} seed={2} r={7} />
      </svg>
      <rect x="154" y="112" width="90" height="24" rx="12" fill={C.forest} />
    </>)

    // A text thread. Theirs plain, yours in brass, because yours is the one that costs money.
    case 'text': return wrap(<>
      {ground}
      {/* Theirs is a light bubble. Using the theme's line colour made it dark-on-dark against
          the ground, with darker text inside it — invisible in the relay. */}
      <rect x="16" y="24" width="176" height="50" rx="22" fill="#FBF8F1" opacity=".93" />
      <rect x="38" y="42" width="108" height="6" rx="3" fill="#14100B" opacity=".35" />
      <rect x="38" y="56" width="74" height="6" rx="3" fill="#14100B" opacity=".22" />
      <rect x="112" y="98" width="192" height="58" rx="22" fill={C.brass} />
      <rect x="136" y="118" width="128" height="6" rx="3" fill="#fff" opacity=".95" />
      <rect x="136" y="132" width="88" height="6" rx="3" fill="#fff" opacity=".6" />
    </>)

    case 'email': return wrap(<>
      {ground}
      <rect x="36" y="22" width="248" height="136" rx="11" fill="#000" opacity=".26" />
      <rect x="40" y="26" width="240" height="128" rx="10" fill="#FBF8F1" />
      <svg x="40" y="26" width="240" height="54" overflow="hidden">
        <Frame id={`${uid}-m`} hue={H} seed={5} r={0} />
      </svg>
      <rect x="62" y="96" width="150" height="7" rx="3" fill="#14100B" opacity=".7" />
      <rect x="62" y="112" width="196" height="5" rx="2.5" fill={wire} />
      <rect x="62" y="126" width="72" height="18" rx="9" fill={C.brass} />
    </>)

    // The nudge, on the day. A ring that is nearly closed.
    case 'clock': return wrap(<>
      {ground}
      <circle cx="160" cy="90" r="54" fill="#FBF8F1" opacity=".14" />
      <circle cx="160" cy="90" r="54" fill="none" stroke="#FBF8F1" strokeOpacity=".3" strokeWidth="9" />
      <circle cx="160" cy="90" r="54" fill="none" stroke={C.brass} strokeWidth="9"
        strokeLinecap="round" strokeDasharray="286 339" transform="rotate(-90 160 90)" />
      <path d="M160 60 v32 l22 13" stroke="#FBF8F1" strokeWidth="8" fill="none" strokeLinecap="round" />
    </>)

    // Six directories agreeing with each other.
    case 'listing': return wrap(<>
      {ground}
      {[0, 1, 2].map((k) => (
        <g key={k}>
          <rect x="16" y={16 + k * 52} width="288" height="44" rx="10" fill="#FBF8F1" />
          <circle cx="44" cy={38 + k * 52} r="13" fill={k === 0 ? H[1] : H[0]} opacity={1 - k * 0.2} />
          <rect x="68" y={30 + k * 52} width="112" height="6" rx="3" fill="#14100B" opacity=".55" />
          <rect x="68" y={43 + k * 52} width="70" height="5" rx="2.5" fill={wire} />
          <path d={`M262 ${35 + k * 52} l6 6 11-12`} stroke={C.forest} strokeWidth="4.5"
            fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      ))}
    </>)

    case 'stars': return wrap(<>
      {ground}
      {[0, 1, 2, 3, 4].map((k) => (
        <path key={k} d={`M${44 + k * 48} 34 l6.6 13.4 14.8 2.2 -10.7 10.4 2.5 14.7 -13.2-7-13.2 7 2.5-14.7 -10.7-10.4 14.8-2.2z`}
          fill={k < 4 ? C.brass : wire} />
      ))}
      <rect x="30" y="96" width="200" height="7" rx="3.5" fill="#fff" opacity=".5" />
      <rect x="30" y="114" width="150" height="7" rx="3.5" fill="#fff" opacity=".26" />
      <rect x="30" y="140" width="110" height="22" rx="11" fill={C.forest} />
    </>)

    // A menu card, which is the one piece of print every restaurant already understands.
    case 'menu': return wrap(<>
      <defs>
        <linearGradient id={`${uid}-wall`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={H[0]} />
          <stop offset="100%" stopColor={H[1]} stopOpacity=".4" />
        </linearGradient>
      </defs>
      <rect width="320" height="180" fill={`url(#${uid}-wall)`} />
      <rect x="82" y="12" width="156" height="164" rx="7" fill="#000" opacity=".3" />
      <rect x="88" y="8" width="144" height="164" rx="6" fill="#FBF8F1" stroke="#0000" strokeWidth="1.5" />
      <svg x="102" y="20" width="116" height="52" overflow="hidden">
        <Frame id={`${uid}-mn`} hue={H} seed={1} r={4} />
      </svg>
      {[0, 1, 2, 3].map((k) => (
        <g key={k}>
          <rect x="102" y={88 + k * 20} width={74 - (k % 2) * 16} height="5" rx="2.5"
            fill="#14100B" opacity=".38" />
          <rect x="196" y={88 + k * 20} width="22" height="5" rx="2.5" fill={C.brass} opacity=".85" />
        </g>
      ))}
    </>)

    default: return wrap(ground)
  }
}
