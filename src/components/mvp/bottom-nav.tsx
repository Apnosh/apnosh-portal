'use client'

/**
 * Shared bottom nav for the apnosh-mvp owner experience:
 * Home / Campaigns / + Create / Inbox / More. (Orders lives inside Campaigns since 2026-09-04;
 * Inbox is the chat with your team, notifications are the bell in the top row.)
 */

import React from 'react'
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
 *   NAV_HEIGHT  6 (pad) + 46 (the icon's seat) + 6 (pad) = 58 (icons only, owner 2026-09-11)
 *   NAV_BOTTOM  the gap under the nav, or the safe area when the phone has one
 *   NAV_GAP     breathing room, so the last row does not kiss the glass
 *
 *   NAV_RESERVE = 54 + 10 + 12 = 76, plus env(safe-area-inset-bottom) on a phone with a chin.
 */
export const NAV_HEIGHT = 58
export const NAV_BOTTOM = 10
export const NAV_GAP = 12
/** what any scroller under this nav must keep free at its bottom, in px (before the safe area) */
export const NAV_RESERVE = NAV_HEIGHT + NAV_BOTTOM + NAV_GAP

// 'inbox' (alerts) and 'messages' are reached from the HEADER now (not bottom tabs), so when either is
// the active key none of the bottom items highlight — that's intentional.
export type NavKey = 'home' | 'campaigns' | 'orders' | 'inbox' | 'more' | 'messages' | 'create'

/* ICONS ONLY (owner 2026-09-11): no words, bigger glyphs, and the one in force sits on a soft
   mint seat with the glyph filled in its colour and a faint glow, the way modern tab bars do. */
export default function BottomNav({ active }: { active: NavKey }) {
  return (
    <nav className="mvp-nav" style={{ position: 'absolute', left: 12, right: 12, bottom: `max(${NAV_BOTTOM}px, env(safe-area-inset-bottom))`, zIndex: 5, overflow: 'visible', borderRadius: 999, background: 'rgba(255,255,255,0.72)', backdropFilter: 'saturate(180%) blur(18px)', WebkitBackdropFilter: 'saturate(180%) blur(18px)', border: '1px solid rgba(255,255,255,0.75)', boxShadow: '0 1px 2px rgba(0,0,0,.04), 0 10px 30px rgba(0,0,0,.10)', height: NAV_HEIGHT, display: 'flex', alignItems: 'center', justifyContent: 'space-around', padding: '0 8px' }}>
      <Item href="/dashboard" label="Home" on={active === 'home'}><HomeIcon /></Item>
      <Item href="/dashboard/campaigns" label="Campaigns" on={active === 'campaigns'}><CalendarDays /></Item>
      <Link href="/dashboard/campaigns/new" aria-label="Create" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 46, height: 46, textDecoration: 'none' }}>
        {/* the + is always lit; on the Create screen it gains the halo the other tabs get */}
        <span style={{ width: 36, height: 36, borderRadius: 99, background: `linear-gradient(135deg, ${C.green}, ${C.greenDk})`, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: active === 'create' ? '0 0 0 5px rgba(74,189,152,.22), 0 6px 16px rgba(46,154,120,.45)' : '0 4px 12px rgba(46,154,120,.30)', transition: 'box-shadow .18s' }}>
          <Plus size={22} strokeWidth={2.6} />
        </span>
      </Link>
      <Item href="/dashboard/messages" label="Inbox" on={active === 'messages' || active === 'inbox'}><MessageCircle /></Item>
      <Item href="/dashboard/more" label="More" on={active === 'more'}><Menu /></Item>
    </nav>
  )
}

function Item({ href, label, on, children }: { href: string; label: string; on?: boolean; children: React.ReactElement<{ size?: number; strokeWidth?: number; fill?: string; fillOpacity?: number }> }) {
  /* the glyph itself carries the state: thicker stroke and a tinted fill when on */
  const icon = React.cloneElement(children, { size: 25, strokeWidth: on ? 2.4 : 1.9, fill: on ? 'currentColor' : 'none', fillOpacity: on ? 0.2 : 0 })
  return (
    <Link href={href} aria-label={label} title={label} aria-current={on ? 'page' : undefined}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 46, height: 46, borderRadius: 16, textDecoration: 'none', color: on ? C.greenDk : C.navOff, background: on ? 'rgba(74,189,152,.14)' : 'transparent', boxShadow: on ? '0 0 0 1px rgba(74,189,152,.10), 0 6px 16px rgba(46,154,120,.18)' : 'none', transition: 'color .18s, background .18s, box-shadow .18s' }}>
      <span className={on ? 'mvp-tab-on' : undefined} style={{ display: 'flex' }}>{icon}</span>
    </Link>
  )
}
