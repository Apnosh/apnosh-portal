'use client'

/**
 * Persistent app top bar (DoorDash-style). Left: the current location as a
 * dropdown — tap to switch between locations an owner manages. Right: settings
 * and messages. Alerts live in the bottom nav, so there's no header bell.
 * Rendered by MvpShell so it stays put across the owner app screens.
 */
import { useState } from 'react'
import Link from 'next/link'
import { MessageCircle, Settings, ChevronDown, Check } from 'lucide-react'
import { useClient } from '@/lib/client-context'

const C = { green: '#4abd98', greenDk: '#2e9a78', greenSoft: '#eaf7f3', greenLine: 'rgba(74,189,152,0.32)', ink: '#1d1d1f', mute: '#6e6e73', faint: '#aeaeb2', line: '#e6e6ea' }
const DISPLAY = "'Cal Sans','Inter',sans-serif"

export default function AppHeader(_props: { unread?: boolean }) {
  const { client, availableClients, switchClient } = useClient()
  const name = client?.name?.trim() || 'Your restaurant'
  const initial = (name[0] ?? '🍽').toUpperCase()
  const [open, setOpen] = useState(false)
  const locations = availableClients.length ? availableClients : (client?.id ? [{ id: client.id, name }] : [])

  return (
    <div style={{ position: 'relative', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '9px 10px 9px 12px', background: '#fff', borderBottom: `1px solid ${C.line}` }}>
      {/* location switcher */}
      <button onClick={() => setOpen((o) => !o)} style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0, background: 'none', border: 'none', padding: '4px 4px 4px 0', cursor: 'pointer' }}>
        <div style={{ width: 30, height: 30, borderRadius: '50%', background: C.greenSoft, border: `1px solid ${C.greenLine}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: C.greenDk, flexShrink: 0 }}>{initial}</div>
        <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 16, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 150 }}>{name}</span>
        <ChevronDown size={16} color={C.mute} style={{ flexShrink: 0, transition: 'transform .15s', transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>

      {/* right: settings · messages */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
        <IconLink href="/dashboard/settings" label="Settings"><Settings size={19} /></IconLink>
        <IconLink href="/dashboard/messages" label="Messages"><MessageCircle size={19} /></IconLink>
      </div>

      {/* dropdown */}
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 30 }} />
          <div style={{ position: 'absolute', top: 'calc(100% - 1px)', left: 10, zIndex: 31, minWidth: 230, maxWidth: 300, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, boxShadow: '0 10px 30px rgba(0,0,0,.15)', padding: 6, animation: 'hdrpop .15s ease' }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.faint, padding: '6px 10px 4px' }}>{locations.length > 1 ? 'Your locations' : 'Location'}</div>
            {locations.map((loc) => {
              const active = loc.id === client?.id
              return (
                <button key={loc.id} onClick={() => { setOpen(false); if (!active) switchClient(loc.id) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, background: active ? C.greenSoft : 'none', border: 'none', borderRadius: 10, padding: '9px 10px', cursor: 'pointer', textAlign: 'left' }}>
                  <div style={{ width: 26, height: 26, borderRadius: '50%', background: active ? C.green : '#eef0ef', color: active ? '#fff' : C.mute, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{(loc.name[0] ?? '•').toUpperCase()}</div>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: active ? 700 : 500, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{loc.name}</span>
                  {active && <Check size={15} color={C.greenDk} style={{ flexShrink: 0 }} />}
                </button>
              )
            })}
          </div>
          <style>{`@keyframes hdrpop{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}`}</style>
        </>
      )}
    </div>
  )
}

function IconLink({ href, label, dot, children }: { href: string; label: string; dot?: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} aria-label={label} style={{ position: 'relative', width: 36, height: 36, borderRadius: '50%', color: C.ink, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {children}
      {dot && <span style={{ position: 'absolute', top: 6, right: 6, width: 8, height: 8, borderRadius: 99, background: C.green, border: '1.5px solid #fff' }} />}
    </Link>
  )
}
