'use client'

/**
 * Shared bottom nav for the apnosh-mvp owner experience:
 * Home / Campaigns / + Create / Orders / More.
 */

import Link from 'next/link'
import { Home as HomeIcon, CalendarDays, Plus, ShoppingBag, Menu } from 'lucide-react'

const C = { green: '#4abd98', greenDk: '#2e9a78', line: '#e6e6ea', navOff: '#aeaeb2' }

// 'inbox' (alerts) and 'messages' are reached from the HEADER now (not bottom tabs), so when either is
// the active key none of the bottom items highlight — that's intentional.
export type NavKey = 'home' | 'campaigns' | 'orders' | 'inbox' | 'more' | 'messages'

export default function BottomNav({ active }: { active: NavKey }) {
  return (
    <nav style={{ position: 'absolute', left: 12, right: 12, bottom: 'max(10px, env(safe-area-inset-bottom))', zIndex: 5, overflow: 'visible', borderRadius: 999, background: 'rgba(255,255,255,0.72)', backdropFilter: 'saturate(180%) blur(18px)', WebkitBackdropFilter: 'saturate(180%) blur(18px)', border: '1px solid rgba(255,255,255,0.8)', boxShadow: '0 2px 4px rgba(0,0,0,.04), 0 12px 32px rgba(0,0,0,.12)', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', padding: '8px 8px calc(8px + env(safe-area-inset-bottom))' }}>
      <Item href="/dashboard" icon={<HomeIcon size={21} />} label="Home" on={active === 'home'} />
      <Item href="/dashboard/campaigns" icon={<CalendarDays size={21} />} label="Campaigns" on={active === 'campaigns'} />
      <Link href="/dashboard/campaigns/new" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, textDecoration: 'none', minWidth: 56 }}>
        <span style={{ width: 26, height: 26, borderRadius: 99, background: C.greenDk, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(46,154,120,.30)' }}><Plus size={16} strokeWidth={2.6} /></span>
        <span style={{ fontSize: 10.5, fontWeight: 600, color: C.navOff }}>Create</span>
      </Link>
      <Item href="/dashboard/orders" icon={<ShoppingBag size={21} />} label="Orders" on={active === 'orders'} />
      <Item href="/dashboard/more" icon={<Menu size={21} />} label="More" on={active === 'more'} />
    </nav>
  )
}

function Item({ href, icon, label, on }: { href: string; icon: React.ReactNode; label: string; on?: boolean }) {
  return (
    <Link href={href} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, textDecoration: 'none', color: on ? C.greenDk : C.navOff, minWidth: 56 }}>
      {icon}
      <span style={{ fontSize: 10.5, fontWeight: on ? 700 : 500 }}>{label}</span>
    </Link>
  )
}
