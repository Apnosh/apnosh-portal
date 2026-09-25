'use client'
/**
 * THE DISH, DRAWN (owner 2026-09-25, "let's go with C"): the art for the colorful New dish page.
 * - TAG_DUO: the six Good to know marks, drawn in the app's duotone style (a chili, a leaf, a sprout,
 *   a wheat stalk, a milk drop, a crescent), each in its own hue on its own pastel.
 * - DishHero: the covered dish beside the title. Its lid lifts and it steams once the dish has a name,
 *   the price hangs on it as a tag, and each picked Good to know drops on as a sticker.
 * Self-contained styles (DISH_ART_CSS, prefix da-), so it does not lean on any other sheet.
 */
import type { CSSProperties, ReactNode } from 'react'

export const TAG_THEME: Record<string, { c2: string; p: string; pd: string }> = {
  Spicy: { c2: '#c2418f', p: '#fbe9ee', pd: 'color-mix(in srgb,#c2418f 15%,#fff)' },
  Vegan: { c2: '#2e9a78', p: '#e3f3ee', pd: 'color-mix(in srgb,#2e9a78 15%,#fff)' },
  Vegetarian: { c2: '#0f97a8', p: '#fdf1e6', pd: 'color-mix(in srgb,#d99a1e 15%,#fdf1e6)' },
  'Gluten free': { c2: '#d99a1e', p: '#fbf3e3', pd: 'color-mix(in srgb,#d99a1e 15%,#fff)' },
  'Dairy free': { c2: '#3b6fd4', p: '#e6eef9', pd: 'color-mix(in srgb,#3b6fd4 15%,#fff)' },
  Halal: { c2: '#6a39de', p: '#ece7fb', pd: 'color-mix(in srgb,#6a39de 15%,#fff)' },
}

const TAG_DUO: Record<string, { viewBox: string; body: ReactNode }> = {
  'Spicy': { viewBox: '0 0 40 40', body: <><ellipse className="da-sh" cx="20" cy="37.6" rx="11" ry="1.6"/><path className="da-f3 da-ln" d="M22 15C22 22 19 29 7 34C17 37 27 34 31 26C33 22 33 18 32 15C29 12.5 25 12.5 22 15Z"/><path className="da-f1w2" d="M25 18.8C24.8 23.2 22.4 27.3 17.2 30.6"/><path className="da-f2 da-ln" d="M20.4 15.6C21.6 11.6 30.8 11 33.6 15C31.4 16.8 29.6 15.2 27.4 16.8C25.4 15.4 23 17 20.4 15.6Z"/><path className="da-ln da-nf" d="M27 12.4C27 9 28.6 6.4 32.2 5.4"/></> },
  'Vegan': { viewBox: '0 0 40 40', body: <><ellipse className="da-sh" cx="20" cy="37.6" rx="11" ry="1.6"/><path className="da-f3" d="M9 31C7 18 16 8 33 7Z"/><path className="da-f2" d="M33 7C34 23 24 32 9 31Z"/><path className="da-ln da-nf" d="M9 31C7 18 16 8 33 7C34 23 24 32 9 31Z"/><path className="da-ln da-nf" d="M5.5 34.5L26 14"/></> },
  'Vegetarian': { viewBox: '0 0 40 40', body: <><ellipse className="da-sh" cx="20" cy="37.6" rx="13" ry="1.6"/><path className="da-ln da-nf" d="M20 31V17.5"/><path className="da-f2 da-ln" d="M20 23.5C19 18 14 15 7.5 16C7.5 22 13 25 20 23.5Z"/><path className="da-f3 da-ln" d="M20 19.5C20.5 12 26 7.5 33 8C33 15.5 27.5 20 20 19.5Z"/><path className="da-f4 da-ln" d="M8 35.5C9 30 31 30 32 35.5Z"/></> },
  'Gluten free': { viewBox: '0 0 40 40', body: <><ellipse className="da-sh" cx="20" cy="37.6" rx="11" ry="1.6"/><path className="da-ln da-nf" d="M20 37C20.4 30 20.6 22 20.6 12"/><ellipse className="da-f3 da-ln" cx="15.4" cy="27.4" rx="3.3" ry="5" transform="rotate(-36 15.4 27.4)"/><ellipse className="da-f2 da-ln" cx="25.6" cy="25.4" rx="3.3" ry="5" transform="rotate(36 25.6 25.4)"/><ellipse className="da-f3 da-ln" cx="15.8" cy="19.6" rx="3.3" ry="5" transform="rotate(-36 15.8 19.6)"/><ellipse className="da-f2 da-ln" cx="25.4" cy="17.6" rx="3.3" ry="5" transform="rotate(36 25.4 17.6)"/><ellipse className="da-f3 da-ln" cx="16.4" cy="12.0" rx="3.3" ry="5" transform="rotate(-30 16.4 12.0)"/><ellipse className="da-f2 da-ln" cx="24.8" cy="10.2" rx="3.3" ry="5" transform="rotate(30 24.8 10.2)"/><ellipse className="da-f3 da-ln" cx="20.6" cy="6" rx="2.8" ry="4.3"/></> },
  'Dairy free': { viewBox: '0 0 40 40', body: <><ellipse className="da-sh" cx="20" cy="37.6" rx="11" ry="1.6"/><path className="da-f1 da-ln" d="M20 4.5C16.5 10.5 9.5 17.5 9.5 24.5A10.5 10.5 0 0 0 30.5 24.5C30.5 17.5 23.5 10.5 20 4.5Z"/><path className="da-f2" d="M27.6 18.2C29.6 22 30 26 28.2 29.3C26.2 32.8 22.6 34.6 18.6 34.4C22.4 32.6 25.3 30 26.4 26.3C27.2 23.6 27.7 21 27.6 18.2Z"/><path className="da-ln da-nf" d="M20 4.5C16.5 10.5 9.5 17.5 9.5 24.5A10.5 10.5 0 0 0 30.5 24.5C30.5 17.5 23.5 10.5 20 4.5Z"/><path className="da-s3" d="M14.4 24.6C14.4 21.8 15.6 19.4 17.4 17.2"/><circle className="da-f3 da-ln" cx="31.6" cy="8.6" r="2.7"/><circle className="da-f3" cx="34.6" cy="14.8" r="1.5"/></> },
  'Halal': { viewBox: '0 0 40 40', body: <><ellipse className="da-sh" cx="20" cy="37.6" rx="11" ry="1.6"/><path className="da-f3 da-ln" d="M18.44 8.01A13 13 0 1 0 31.1 25.74A11 11 0 0 1 18.44 8.01Z"/><path className="da-f1w2" d="M10.6 18.4C9.9 22.6 11.4 27 15.2 29.8"/><path className="da-f2 da-ln" d="M30.2 5.6L31.5 8.9L34.8 10.2L31.5 11.5L30.2 14.8L28.9 11.5L25.6 10.2L28.9 8.9Z"/><circle className="da-f4" cx="35" cy="18.4" r="1.5"/></> },
}

/** one Good to know mark, in its own hue */
export function DuoIcon({ tag, size = 37, style }: { tag: string; size?: number; style?: CSSProperties }) {
  const d = TAG_DUO[tag]
  if (!d) return null
  return <svg className="da-dw da-ic" viewBox={d.viewBox} width={size} height={size} aria-hidden focusable="false" style={{ ['--da-c2' as string]: TAG_THEME[tag]?.c2 ?? '#2e9a78', ...style }}>{d.body}</svg>
}

/** the covered dish beside the title: closed until the dish has a name, then the lid lifts */
export function DishHero({ on, price, tags }: { on: boolean; price: string; tags: string[] }) {
  return (
    <div className={`da-dish${on ? ' da-on' : ''}`} aria-hidden>
      <svg className="da-dw da-hd" viewBox="0 0 100 100" focusable="false"><g className="da-all"><ellipse className="da-sh" cx="50" cy="89" rx="36" ry="4"/><ellipse className="da-f1 da-ln" cx="50" cy="79" rx="38" ry="8"/><ellipse className="da-f2" cx="50" cy="78" rx="28" ry="4.5"/><g className="da-food"><path className="da-f4 da-ln" d="M28 72h44v2a5 5 0 0 1-5 5H33a5 5 0 0 1-5-5z"/><rect className="da-f3 da-ln" x="25" y="65" width="50" height="8" rx="4"/><path className="da-f1 da-ln" d="M28 66c0-10 10-14 22-14s22 4 22 14z"/><ellipse className="da-f4" cx="40" cy="60" rx="2.2" ry="1.3"/><ellipse className="da-f4" cx="50" cy="57" rx="2.2" ry="1.3"/><ellipse className="da-f4" cx="60" cy="60" rx="2.2" ry="1.3"/></g><g className="da-steam"><path className="da-ln da-nf" d="M18 47c0-4-4-4-4-8s4-4 4-8M28 43c0-4-4-4-4-8s4-4 4-8"/></g><g className="da-lid"><path className="da-f1 da-ln" d="M40 41a28 24 0 0 1 56 0z"/><path className="da-f2" d="M46 39a22 18 0 0 1 12-16c-5 4-8 10-8 16z"/><rect className="da-f4 da-ln" x="36" y="39" width="64" height="5" rx="2.5"/><circle className="da-f3 da-ln" cx="68" cy="14" r="4"/></g><g className="da-spk"><path className="da-f3 da-ln" d="M17 18L18.96 23.04L24 25L18.96 26.96L17 32L15.04 26.96L10 25L15.04 23.04Z"/><path className="da-f3 da-ln" d="M84 26L85.3 29.2L88.5 30.5L85.3 31.8L84 35L82.7 31.8L79.5 30.5L82.7 29.2Z"/><circle className="da-f3" cx="76" cy="16" r="2.2"/></g></g></svg>
      {price && <span className="da-ptag"><b>{price}</b></span>}
      {tags.length > 0 && <span className={`da-stk${tags.length > 3 ? ' da-many' : ''}`}>{tags.map((t) => <span key={t} className="da-st" style={{ background: TAG_THEME[t]?.p ?? '#fff' }}><DuoIcon tag={t} size={tags.length > 3 ? 21 : 26} /></span>)}</span>}
    </div>
  )
}

export const DISH_ART_CSS = `
.da-dw{display:block;overflow:visible;--da-l:color-mix(in srgb,var(--da-c2,#2e9a78) 28%,#fff);--da-d:color-mix(in srgb,var(--da-c2,#2e9a78) 50%,#fff)}
.da-dw .da-f1{fill:#fff}.da-dw .da-f2{fill:var(--da-l)}.da-dw .da-f3{fill:var(--da-c2)}.da-dw .da-f4{fill:var(--da-d)}
.da-dw .da-f1w2{fill:none;stroke:#fff;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}
.da-dw .da-sh{fill:rgba(29,29,31,.1)}
.da-dw .da-ln{stroke:#1d1d1f;stroke-width:2.5;stroke-linejoin:round;stroke-linecap:round}
.da-dw .da-nf{fill:none}.da-dw .da-thick{stroke-width:3}
.da-ic .da-ln{stroke-width:2.1}.da-ic .da-f1w2{stroke-width:2}
.da-dish{position:relative;flex:none;width:128px;height:112px;border-radius:30px;background:#fdf1e6}
.da-dish>.da-hd{position:absolute;left:14px;top:4px;width:100px;height:100px;--da-c2:#d99a1e}
.da-hd .da-all{transform-box:view-box;transform-origin:50px 91px;transform:scale(1.14);transition:transform .6s cubic-bezier(.22,1,.36,1)}
.da-on .da-all{transform:scale(1)}
.da-hd .da-lid{transform-box:view-box;transform-origin:68px 41px;transform:translate(-18px,34px) rotate(0deg);transition:transform .7s cubic-bezier(.34,1.56,.64,1)}
.da-on .da-lid{transform:translate(0px,0px) rotate(-18deg)}
.da-hd .da-food,.da-hd .da-steam{display:none}
.da-on .da-food,.da-on .da-steam{display:inline}
.da-on .da-spk{display:none}
.da-ptag{position:absolute;right:-8px;bottom:-9px;display:flex;align-items:center;gap:6px;height:32px;padding:0 12px 0 9px;border:2px solid #1d1d1f;border-radius:11px;background:#fff;box-shadow:0 3px 8px rgba(29,29,31,.1);font:800 16px/1 'Cal Sans','Inter',sans-serif;color:#1d1d1f;animation:da-pop .45s cubic-bezier(.34,1.56,.64,1)}
.da-ptag::before{content:"";width:8px;height:8px;border:2px solid #1d1d1f;border-radius:50%;background:#d99a1e}
.da-stk{position:absolute;left:-12px;top:-9px;display:flex;flex-direction:column}
.da-st{display:grid;place-items:center;width:36px;height:36px;border-radius:12px;box-shadow:0 2px 6px rgba(29,29,31,.12);margin-bottom:-8px;animation:da-land .5s cubic-bezier(.34,1.56,.64,1)}
.da-stk.da-many .da-st{width:30px;height:30px;margin-bottom:-11px;border-radius:10px}
@keyframes da-pop{0%{transform:scale(.3)}100%{transform:scale(1)}}
@keyframes da-land{0%{transform:translateY(-14px) scale(1.5) rotate(-20deg)}100%{transform:none}}
@media (prefers-reduced-motion: reduce){.da-hd .da-all,.da-hd .da-lid{transition:none}.da-ptag,.da-st{animation:none}}
`
