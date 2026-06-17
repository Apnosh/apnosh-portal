'use client'

/**
 * Persistent app top bar — the restaurant's identity (avatar + name) on the
 * left, a notifications bell that opens the Inbox on the right. Rendered by
 * MvpShell so it stays put across Home, Campaigns and Inbox (with the bottom
 * nav, this makes the owner experience feel like one app, not separate pages).
 */
import Link from 'next/link'
import { Bell } from 'lucide-react'
import { useClient } from '@/lib/client-context'

const C = { green: '#4abd98', greenDk: '#2e9a78', greenSoft: '#eaf7f3', greenLine: 'rgba(74,189,152,0.32)', ink: '#1d1d1f', line: '#e6e6ea' }
const DISPLAY = "'Cal Sans','Inter',sans-serif"

export default function AppHeader({ unread }: { unread?: boolean }) {
  const { client } = useClient()
  const name = client?.name?.trim() || 'Your restaurant'
  const initial = (name[0] ?? '🍽').toUpperCase()
  return (
    <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '11px 16px', background: '#fff', borderBottom: `1px solid ${C.line}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: C.greenSoft, border: `1px solid ${C.greenLine}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: C.greenDk, flexShrink: 0 }}>{initial}</div>
        <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 16, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
      </div>
      <Link href="/dashboard/inbox" aria-label="Inbox" style={{ position: 'relative', flexShrink: 0, color: C.ink, display: 'flex', padding: 4 }}>
        <Bell size={20} />
        {unread && <span style={{ position: 'absolute', top: 2, right: 2, width: 8, height: 8, borderRadius: 99, background: C.green, border: '1.5px solid #fff' }} />}
      </Link>
    </div>
  )
}
