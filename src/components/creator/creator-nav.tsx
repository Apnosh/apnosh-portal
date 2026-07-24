'use client'

/**
 * Bottom nav for the creator app — mirrors the owner's mvp bottom-nav so a creator's
 * phone experience matches the restaurant's: Work / Bookings / Store / Hours / Earnings.
 * Fixed to the bottom of the creator shell (see creator/layout.tsx), with safe-area padding.
 */

import Link from 'next/link'
import { Inbox, CalendarCheck, Store, Clock, Wallet } from 'lucide-react'

const C = { green: '#4abd98', greenDk: '#2e9a78', line: '#e6e6ea', navOff: '#aeaeb2' }

export type CKey = 'work' | 'bookings' | 'storefront' | 'hours' | 'earnings'

export default function CreatorNav({ active }: { active: CKey }) {
  return (
    <nav style={{ flexShrink: 0, borderTop: `1px solid ${C.line}`, background: '#fff', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', padding: '8px 8px calc(8px + env(safe-area-inset-bottom))' }}>
      <Item href="/creator/work" icon={<Inbox size={21} />} label="Work" on={active === 'work'} />
      <Item href="/creator/bookings" icon={<CalendarCheck size={21} />} label="Bookings" on={active === 'bookings'} />
      <Item href="/creator/storefront" icon={<Store size={21} />} label="Store" on={active === 'storefront'} />
      <Item href="/creator/availability" icon={<Clock size={21} />} label="Hours" on={active === 'hours'} />
      <Item href="/creator/earnings" icon={<Wallet size={21} />} label="Earnings" on={active === 'earnings'} />
    </nav>
  )
}

function Item({ href, icon, label, on }: { href: string; icon: React.ReactNode; label: string; on?: boolean }) {
  return (
    <Link href={href} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, textDecoration: 'none', color: on ? C.greenDk : C.navOff, minWidth: 52 }}>
      {icon}
      <span style={{ fontSize: 10, fontWeight: on ? 600 : 500 }}>{label}</span>
    </Link>
  )
}
