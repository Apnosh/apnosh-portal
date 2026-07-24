'use client'

/**
 * Creator app shell — the same full-screen frame the owner app uses (MvpShell): full-bleed
 * on phones, a centered phone-width frame on desktop, with a persistent bottom nav. Each
 * creator surface (Work / Bookings / Store / Hours / Earnings) renders inside the scroll
 * frame, so the whole creator experience feels like one mobile app, matching the restaurant's.
 */

import { usePathname } from 'next/navigation'
import CreatorNav, { type CKey } from '@/components/creator/creator-nav'

const SHELL_CSS = `
.creator-shell{position:fixed;top:0;left:0;right:0;height:100vh;height:100dvh;z-index:40;background:#f0f0f3;display:flex;justify-content:center;overflow:hidden;font-family:'Inter',system-ui,sans-serif}
.creator-frame{width:100%;background:#fff;display:flex;flex-direction:column;min-height:0}
.creator-scroll{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch}
@media (min-width:560px){.creator-frame{max-width:480px;box-shadow:0 0 40px rgba(0,0,0,0.06)}}
.mvp-row{transition:background .12s ease}
.mvp-row:active{background:#f1f5f4}
@media (hover:hover){.mvp-row:hover{background:#f7faf9}}
.mvp-press{transition:transform .16s cubic-bezier(.2,.7,.3,1),box-shadow .16s ease}
.mvp-press:active{transform:scale(.985)}
@media (hover:hover){.mvp-press:hover{transform:translateY(-1px);box-shadow:0 6px 18px rgba(0,0,0,.07)}}
.mvp-spin{animation:mvpspin .8s linear infinite}
@keyframes mvpspin{to{transform:rotate(360deg)}}
`

function activeOf(path: string): CKey {
  if (path.startsWith('/creator/bookings')) return 'bookings'
  if (path.startsWith('/creator/storefront')) return 'storefront'
  if (path.startsWith('/creator/availability')) return 'hours'
  if (path.startsWith('/creator/earnings')) return 'earnings'
  return 'work'
}

export default function CreatorLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  return (
    <div className="creator-shell">
      <style>{SHELL_CSS}</style>
      <div className="creator-frame">
        <div className="creator-scroll">{children}</div>
        <CreatorNav active={activeOf(path)} />
      </div>
    </div>
  )
}
