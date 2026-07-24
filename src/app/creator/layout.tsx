'use client'

/**
 * Creator app shell — the same full-screen frame the owner app uses (MvpShell): full-bleed
 * on phones, a centered phone-width frame on desktop, with a persistent bottom nav. Each
 * creator surface (Work / Bookings / Store / Hours / Earnings) renders inside the scroll
 * frame, so the whole creator experience feels like one mobile app, matching the restaurant's.
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { User } from 'lucide-react'
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
  const onAccount = path.startsWith('/creator/account')
  return (
    <div className="creator-shell">
      <style>{SHELL_CSS}</style>
      <div className="creator-frame">
        {/* Top bar: brand + the account door (was missing entirely — no profile/sign-out anywhere). */}
        <header style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', borderBottom: '1px solid #e6e6ea', background: '#fff' }}>
          <Link href="/creator/work" style={{ fontFamily: "'Cal Sans','Inter',sans-serif", fontWeight: 600, fontSize: 15.5, color: '#1d1d1f', textDecoration: 'none', letterSpacing: '-0.2px' }}>Apnosh <span style={{ color: '#2e9a78' }}>Creators</span></Link>
          <Link href="/creator/account" aria-label="Your account" style={{ width: 32, height: 32, borderRadius: '50%', background: onAccount ? '#4abd98' : '#eaf7f3', border: `1px solid ${onAccount ? '#4abd98' : 'rgba(74,189,152,0.32)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: onAccount ? '#fff' : '#2e9a78', flexShrink: 0 }}>
            <User size={17} />
          </Link>
        </header>
        <div className="creator-scroll">{children}</div>
        <CreatorNav active={activeOf(path)} />
      </div>
    </div>
  )
}
