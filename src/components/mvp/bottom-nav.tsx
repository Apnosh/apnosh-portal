'use client'

/**
 * Shared bottom nav for the apnosh-mvp owner experience:
 * Home / Campaigns / + Create / Inbox / More. (Orders lives inside Campaigns since 2026-09-04;
 * Inbox is the chat with your team, notifications are the bell in the top row.)
 */

import React from 'react'
import Link from 'next/link'
import { Home as HomeIcon, CalendarDays, Plus, MessageCircle, Menu } from 'lucide-react'

/* The nav's green is the Insights graph's bright green, not the kit's deep mint (owner 2026-09-11:
   the mint "felt off" on the pale seat). The seat is a light wash of the same hue. */
const C = { green: '#1fc47a', greenOn: '#17ad6b', seat: 'rgba(31,196,122,.15)', line: '#e6e6ea', navOff: '#6e6e73' }

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
 *   NAV_HEIGHT  6 (pad) + 54 (the icon's seat) + 6 (pad) = 66 (icons only, taller, owner 2026-09-11)
 *   NAV_BOTTOM  the gap under the nav, or the safe area when the phone has one
 *   NAV_GAP     breathing room, so the last row does not kiss the glass
 *
 *   NAV_RESERVE = 54 + 10 + 12 = 76, plus env(safe-area-inset-bottom) on a phone with a chin.
 */
export const NAV_HEIGHT = 66
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
    <nav className="mvp-nav" style={{ position: 'absolute', left: 12, right: 12, bottom: `max(${NAV_BOTTOM}px, env(safe-area-inset-bottom))`, zIndex: 5, overflow: 'visible', borderRadius: 999, background: 'rgba(255,255,255,0.88)', backdropFilter: 'saturate(180%) blur(18px)', WebkitBackdropFilter: 'saturate(180%) blur(18px)', border: `1px solid ${C.line}`, boxShadow: '0 1px 2px rgba(0,0,0,.06), 0 12px 34px rgba(0,0,0,.16)', height: NAV_HEIGHT, display: 'flex', alignItems: 'stretch', justifyContent: 'space-between', padding: '0 6px' }}>
      <Item href="/dashboard" label="Home" on={active === 'home'}><HomeIcon /></Item>
      <Item href="/dashboard/campaigns" label="Campaigns" on={active === 'campaigns'}><CalendarDays /></Item>
      {/* Create is a tab like the others now (owner 2026-09-11), not a floating disc */}
      <Item href="/dashboard/campaigns/new" label="Create" on={active === 'create'} big><Plus /></Item>
      <Item href="/dashboard/messages" label="Inbox" on={active === 'messages' || active === 'inbox'}><MessageCircle /></Item>
      <Item href="/dashboard/more" label="More" on={active === 'more'}><Menu /></Item>
    </nav>
  )
}

function Item({ href, label, on, big, children }: { href: string; label: string; on?: boolean; /** the Create plus: a big bare plus, no circle (owner 2026-09-11) */ big?: boolean; children: React.ReactElement<{ size?: number; strokeWidth?: number; fill?: string; fillOpacity?: number }> }) {
  /* the glyph itself carries the state: thicker stroke and a tinted fill when on */
  const icon = React.cloneElement(children, big ? { size: 34, strokeWidth: on ? 3 : 2.6 } : { size: 28, strokeWidth: on ? 2.4 : 2, fill: on ? 'currentColor' : 'none', fillOpacity: on ? 0.22 : 0 })
  return (
    <Link href={href} aria-label={label} title={label} aria-current={on ? 'page' : undefined}
      /* THE SEAT IS THE WHOLE SLOT (owner 2026-09-11: "cover a lot more"): each tab owns a fifth of
         the bar, top to bottom, and the lit one fills it in mint. No glow (owner, same day). */
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, alignSelf: 'stretch', margin: '5px 2px', borderRadius: 999, textDecoration: 'none', color: on ? C.greenOn : C.navOff, background: on ? C.seat : 'transparent', transition: 'color .18s, background .18s' }}>
      <span className={on ? 'mvp-tab-on' : undefined} style={{ display: 'flex' }}>{icon}</span>
    </Link>
  )
}
