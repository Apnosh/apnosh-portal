'use client'

/**
 * Full-screen shell for the apnosh-mvp owner experience. Full-bleed on phones
 * (no side gutters), centered phone-width on desktop. Uses 100dvh so the bottom
 * nav stays visible as the mobile browser chrome shows/hides (fixed inset:0
 * would push it under Safari's toolbar). Sits above the portal chrome (z-60).
 */

import BottomNav, { type NavKey } from './bottom-nav'
import AppHeader from './app-header'

const SHELL_CSS = `
.mvp-shell{position:fixed;top:0;left:0;right:0;height:100vh;height:100dvh;z-index:60;background:#f0f0f3;display:flex;justify-content:center;overflow:hidden}
.mvp-frame{width:100%;max-width:none;background:#fff;display:flex;flex-direction:column;min-height:0}
.mvp-frame-scroll{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch}
@media (min-width:560px){.mvp-frame{max-width:480px;box-shadow:0 0 40px rgba(0,0,0,0.06)}}
.mvp-row{transition:background .12s ease}
.mvp-row:active{background:#f1f5f4}
@media (hover:hover){.mvp-row:hover{background:#f7faf9}}
.mvp-spin{animation:mvpspin .8s linear infinite}
@keyframes mvpspin{to{transform:rotate(360deg)}}
.mvp-input{transition:border-color .12s ease}
.mvp-input:focus{border-color:#4abd98}
`

// `header` replaces the default AppHeader — detail pages reached from a tab
// pass an MvpDetailHeader (back + title) instead of the full app header.
export default function MvpShell({ active, unread, header, children }: { active: NavKey; unread?: number; header?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mvp-shell">
      <style>{SHELL_CSS}</style>
      <div className="mvp-frame">
        {header ?? <AppHeader count={unread} />}
        <div className="mvp-frame-scroll">{children}</div>
        <BottomNav active={active} />
      </div>
    </div>
  )
}
