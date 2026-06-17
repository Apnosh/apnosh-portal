'use client'

/**
 * Shared bottom nav for the apnosh-mvp owner experience:
 * Home / Campaigns / + Request / Notifications / More.
 */

import Link from 'next/link'
import { Home as HomeIcon, CalendarDays, Plus, Inbox, Menu } from 'lucide-react'

const C = { green: '#4abd98', greenDk: '#2e9a78', line: '#e6e6ea', navOff: '#aeaeb2' }

// 'messages' is reached from the header (not a bottom tab), so when it's the
// active key none of the bottom items highlight — that's intentional.
export type NavKey = 'home' | 'campaigns' | 'inbox' | 'more' | 'messages'

export default function BottomNav({ active }: { active: NavKey }) {
  return (
    <nav style={{ flexShrink: 0, position: 'relative', overflow: 'visible', borderTop: `1px solid ${C.line}`, background: '#fff', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', padding: '8px 8px calc(8px + env(safe-area-inset-bottom))' }}>
      <Item href="/dashboard" icon={<HomeIcon size={21} />} label="Home" on={active === 'home'} />
      <Item href="/dashboard/campaigns" icon={<CalendarDays size={21} />} label="Campaigns" on={active === 'campaigns'} />
      <Link href="/dashboard/campaigns/discover" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, textDecoration: 'none', marginTop: -18, position: 'relative', zIndex: 1 }}>
        <span style={{ width: 52, height: 52, borderRadius: '50%', background: C.green, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 16px rgba(74,189,152,0.4)' }}><Plus size={26} /></span>
        <span style={{ fontSize: 10, fontWeight: 500, color: C.navOff }}>Create</span>
      </Link>
      <Item href="/dashboard/inbox" icon={<Inbox size={21} />} label="Alerts" on={active === 'inbox'} />
      <Item href="/dashboard/profile" icon={<Menu size={21} />} label="More" on={active === 'more'} />
    </nav>
  )
}

function Item({ href, icon, label, on }: { href: string; icon: React.ReactNode; label: string; on?: boolean }) {
  return (
    <Link href={href} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, textDecoration: 'none', color: on ? C.greenDk : C.navOff, minWidth: 56 }}>
      {icon}
      <span style={{ fontSize: 10, fontWeight: on ? 600 : 500 }}>{label}</span>
    </Link>
  )
}
