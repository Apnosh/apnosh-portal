'use client'

/**
 * Full-screen shell for the apnosh-mvp owner experience. Full-bleed on phones
 * (no side gutters), centered phone-width on desktop. Uses 100dvh so the bottom
 * nav stays visible as the mobile browser chrome shows/hides (fixed inset:0
 * would push it under Safari's toolbar). Sits above the portal chrome (z-60).
 */

import { useEffect, useRef, useState } from 'react'
import BottomNav, { type NavKey } from './bottom-nav'
import TopRow from './top-row'

const SHELL_CSS = `
.mvp-shell{position:fixed;top:0;left:0;right:0;height:100vh;height:100dvh;z-index:60;background:#f0f0f3;display:flex;justify-content:center;overflow:hidden}
.mvp-frame{width:100%;max-width:none;background:#fff;display:flex;flex-direction:column;min-height:0;position:relative}
.mvp-frame-scroll{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;padding-bottom:calc(84px + env(safe-area-inset-bottom))}
.mvp-frame-scroll.mvp-under-top{padding-top:58px}
.mvp-frame-scroll.mvp-short-tail{padding-bottom:calc(42px + env(safe-area-inset-bottom))}
.mvp-frame-top{position:absolute;top:0;left:0;right:0;z-index:6;transition:transform .28s cubic-bezier(.32,.72,.35,1),opacity .22s}
.mvp-frame.mvp-scrolling .mvp-frame-top,.mvp-frame.mvp-scrolling .mvp-home-bar{transform:translateY(-115%);opacity:0;pointer-events:none}
.mvp-home-bar{transition:transform .28s cubic-bezier(.32,.72,.35,1),opacity .22s}
.mvp-nav{transition:transform .28s cubic-bezier(.32,.72,.35,1),opacity .22s;transform-origin:50% 100%}
.mvp-frame.mvp-scrolling .mvp-nav{transform:scale(.84) translateY(4px);opacity:.9}
@media (prefers-reduced-motion:reduce){.mvp-frame-top,.mvp-home-bar,.mvp-nav{transition:none}}
@media (min-width:560px){.mvp-frame{max-width:480px;box-shadow:0 0 40px rgba(0,0,0,0.06)}.mvp-frame.mvp-frame-wide{max-width:920px}}
.mvp-row{transition:background .12s ease,transform .16s cubic-bezier(.2,.7,.3,1)}
.mvp-row:active{background:#f1f5f4;transform:scale(.985)}
@keyframes mvpRise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.mvp-frame-scroll>*{animation:mvpRise .5s cubic-bezier(.2,.7,.3,1) both}
.mvp-frame-scroll>*:nth-child(2){animation-delay:.05s}.mvp-frame-scroll>*:nth-child(3){animation-delay:.1s}.mvp-frame-scroll>*:nth-child(4){animation-delay:.15s}.mvp-frame-scroll>*:nth-child(n+5){animation-delay:.2s}
@keyframes mvpPop{0%{transform:scale(.4);opacity:0}60%{transform:scale(1.18)}100%{transform:scale(1);opacity:1}}
.mvp-pop{animation:mvpPop .45s cubic-bezier(.2,.7,.3,1) .25s both}
@keyframes mvpTabIn{0%{transform:scale(.86)}55%{transform:scale(1.14)}100%{transform:scale(1)}}
.mvp-tab-on{animation:mvpTabIn .38s cubic-bezier(.2,.7,.3,1) both}
@media (prefers-reduced-motion:reduce){.mvp-frame-scroll>*,.mvp-pop,.mvp-tab-on{animation:none}.mvp-row:active{transform:none}}
@media (hover:hover){.mvp-row:hover{background:#f7faf9}}
.mvp-spin{animation:mvpspin .8s linear infinite}
@keyframes mvpspin{to{transform:rotate(360deg)}}
.mvp-input{transition:border-color .12s ease}
.mvp-input:focus{border-color:#4abd98}
`

// `header` replaces the default AppHeader — detail pages reached from a tab
// pass an MvpDetailHeader (back + title) instead of the full app header.
/** Modern-app chrome (owner 2026-09-04): while the page scrolls DOWN the top row slides away and
 *  the nav shrinks, so the content gets the screen; scroll up, or stop for a beat, and both
 *  come back. Returns whether the chrome is tucked right now. */
export function useHideOnScroll(getEl: () => HTMLElement | null): boolean {
  const [tucked, setTucked] = useState(false)
  useEffect(() => {
    const el = getEl(); if (!el) return
    let lastY = el.scrollTop; let timer: ReturnType<typeof setTimeout> | null = null
    const onScroll = () => {
      const y = el.scrollTop
      if (y > lastY + 6 && y > 48) setTucked(true)
      else if (y < lastY - 6 || y <= 24) setTucked(false)
      lastY = y
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => setTucked(false), 800)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => { el.removeEventListener('scroll', onScroll); if (timer) clearTimeout(timer) }
  }, [getEl])
  return tucked
}

export default function MvpShell({ active, unread, header, children, wide, noHeader, middle, title, back, right }: { /** a screen you clicked into: the row's left slot becomes a back chevron to this href */ back?: string; /** replaces the bell (a page's own action) */ right?: React.ReactNode; active: NavKey; unread?: number; header?: React.ReactNode; children: React.ReactNode; wide?: boolean; /** the page's own control for the top row's centre (a search, a segmented) */ middle?: React.ReactNode; /** or just the page's name in the centre */ title?: string; /** the screen draws its own top row (Home's funnel bar) */ noHeader?: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const tucked = useHideOnScroll(() => scrollRef.current)
  return (
    <div className="mvp-shell">
      <style>{SHELL_CSS}</style>
      <div className={`${wide ? 'mvp-frame mvp-frame-wide' : 'mvp-frame'}${tucked ? ' mvp-scrolling' : ''}`}>
        {/* the standard app bar floats over the scroll (glass); a page's own header stays in flow */}
        {noHeader ? null : header ? header : <div className="mvp-frame-top"><TopRow middle={middle} title={title} count={unread} back={back} right={right} /></div>}
        <div ref={scrollRef} className={noHeader ? 'mvp-frame-scroll mvp-short-tail' : header ? 'mvp-frame-scroll' : 'mvp-frame-scroll mvp-under-top'}>{children}</div>
        <BottomNav active={active} />
      </div>
    </div>
  )
}
