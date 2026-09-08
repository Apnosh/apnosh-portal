'use client'

/**
 * Shared bottom nav for the apnosh-mvp owner experience:
 * Home / Campaigns / + Create / Inbox / More. (Orders lives inside Campaigns since 2026-09-04;
 * Inbox is the chat with your team, notifications are the bell in the top row.)
 */

import Link from 'next/link'
import { Home as HomeIcon, CalendarDays, Plus, MessageCircle, Menu } from 'lucide-react'

const C = { green: '#4abd98', greenDk: '#2e9a78', line: '#e6e6ea', navOff: '#6e6e73' } // mute, not faint: a 10.5px label at 2.2:1 was unreadable

/**
 * THE NAV'S FOOTPRINT, WRITTEN ONCE.
 *
 * The nav floats over the scroll (position:absolute), so the scroller has to reserve room for it
 * or the last row of every screen sits underneath it. It did: at 520×1000 the people row on Home
 * ran to y 958 and the nav covered 940–993, and no amount of scrolling freed it, because the
 * scroller only padded 42px while the nav takes 64.
 *
 * The two numbers now live here, beside the styles that USE them, and the shell derives its
 * padding from them, so the padding and the nav can never drift apart again.
 *
 *   NAV_HEIGHT  8 (pad) + 21 (icon) + 4 (gap) + 13 (the 10.5px label's line) + 8 (pad) = 54
 *   NAV_BOTTOM  the gap under the nav, or the safe area when the phone has one
 *   NAV_GAP     breathing room, so the last row does not kiss the glass
 *
 *   NAV_RESERVE = 54 + 10 + 12 = 76, plus env(safe-area-inset-bottom) on a phone with a chin.
 */
export const NAV_HEIGHT = 54
export const NAV_BOTTOM = 10
export const NAV_GAP = 12
/** what any scroller under this nav must keep free at its bottom, in px (before the safe area) */
export const NAV_RESERVE = NAV_HEIGHT + NAV_BOTTOM + NAV_GAP

// 'inbox' (alerts) and 'messages' are reached from the HEADER now (not bottom tabs), so when either is
// the active key none of the bottom items highlight — that's intentional.
export type NavKey = 'home' | 'campaigns' | 'orders' | 'inbox' | 'more' | 'messages' | 'create'

export default function BottomNav({ active }: { active: NavKey }) {
  return (
    <nav className="mvp-nav" style={{ position: 'absolute', left: 12, right: 12, bottom: `max(${NAV_BOTTOM}px, env(safe-area-inset-bottom))`, zIndex: 5, overflow: 'visible', borderRadius: 999, background: 'rgba(255,255,255,0.72)', backdropFilter: 'saturate(180%) blur(18px)', WebkitBackdropFilter: 'saturate(180%) blur(18px)', border: '1px solid rgba(255,255,255,0.8)', boxShadow: '0 2px 4px rgba(0,0,0,.04), 0 12px 32px rgba(0,0,0,.12)', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', boxSizing: 'border-box', minHeight: `calc(${NAV_HEIGHT}px + env(safe-area-inset-bottom))`, padding: '8px 8px calc(8px + env(safe-area-inset-bottom))' }}>
      <Item href="/dashboard" icon={<HomeIcon size={21} />} label="Home" on={active === 'home'} />
      <Item href="/dashboard/campaigns" icon={<CalendarDays size={21} />} label="Campaigns" on={active === 'campaigns'} />
      <Link href="/dashboard/campaigns/new" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, textDecoration: 'none', minWidth: 56 }}>
        {/* on the Create screen the + reads lit like the other tabs: a mint halo and a green label */}
        <span style={{ width: 26, height: 26, borderRadius: 99, background: C.greenDk, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: active === 'create' ? '0 0 0 4px rgba(74,189,152,.28), 0 4px 14px rgba(46,154,120,.45)' : '0 4px 12px rgba(46,154,120,.30)', transition: 'box-shadow .2s' }}><Plus size={16} strokeWidth={2.6} /></span>
        <span style={{ fontSize: 10.5, fontWeight: active === 'create' ? 700 : 600, color: active === 'create' ? C.greenDk : C.navOff }}>Create</span>
      </Link>
      <Item href="/dashboard/messages" icon={<MessageCircle size={21} />} label="Inbox" on={active === 'messages' || active === 'inbox'} />
      <Item href="/dashboard/more" icon={<Menu size={21} />} label="More" on={active === 'more'} />
    </nav>
  )
}

function Item({ href, icon, label, on }: { href: string; icon: React.ReactNode; label: string; on?: boolean }) {
  return (
    <Link href={href} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, textDecoration: 'none', color: on ? C.greenDk : C.navOff, transition: 'color .18s', minWidth: 56 }}>
      <span className={on ? 'mvp-tab-on' : undefined} style={{ display: 'flex' }}>{icon}</span>
      <span style={{ fontSize: 10.5, fontWeight: on ? 700 : 500 }}>{label}</span>
    </Link>
  )
}
