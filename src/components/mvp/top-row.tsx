'use client'
/**
 * The owner app's top row (2026-09-04): one grid on every tab — the business avatar on the
 * LEFT (tap: switch location when there are several, otherwise the More hub), the page's own
 * control dead CENTRE (Home's ranges, Campaigns' List/Calendar, a location-specific search on
 * Inbox / More / Create, or just the page's name), and notifications on the RIGHT. Equal 40px
 * columns either side, so the middle really is the middle. Floats over the scroll as glass.
 */
import { useState } from 'react'
import { useInboxCounts } from './use-inbox-unread'
import Link from 'next/link'
import { Bell, Check, ChevronLeft, Search, X } from 'lucide-react'
import { useClient } from '@/lib/client-context'

const C = { green: '#4abd98', greenDk: '#2e9a78', ink: '#1d1d1f', mute: '#6e6e73', faint: '#aeaeb2', line: '#e6e6ea' }
const DISPLAY = "'Cal Sans','Inter',sans-serif"
export const GLASS: React.CSSProperties = { background: 'rgba(240,241,240,0.72)', backdropFilter: 'saturate(180%) blur(16px)', WebkitBackdropFilter: 'saturate(180%) blur(16px)', border: '1px solid rgba(255,255,255,0.75)', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }

export default function TopRow({ middle, title, count, back, right }: { middle?: React.ReactNode; title?: string; count?: number; /** a screen you clicked INTO (Insights, a campaign, an order): the left slot is a back chevron to this href instead of the avatar (owner 2026-09-04) */ back?: string; /** replaces the bell (a detail page's own action) */ right?: React.ReactNode }) {
  const { client, availableClients, switchClient } = useClient()
  const name = client?.name?.trim() || 'Your restaurant'
  const initial = (name[0] ?? '·').toUpperCase()
  const [open, setOpen] = useState(false)
  const locations = availableClients.length ? availableClients : (client?.id ? [{ id: client.id, name }] : [])
  const multi = locations.length > 1
  /* The bell counts for itself when the page did not hand it a number. */
  const autoCounts = useInboxCounts(client?.id, count === undefined)
  const auto = autoCounts ? autoCounts.unread : null
  /* the badge turns amber while something needs the owner (owner 2026-09-04: "so they know needs you needs attention") */
  const hot = (autoCounts?.needsYou ?? 0) > 0
  const n = count ?? auto ?? 0
  const avatar = (
    <span style={{ display: 'block', width: 40, height: 40, borderRadius: '50%', padding: 2, background: 'linear-gradient(135deg, #4abd98 0%, #8ee5c6 45%, #ffd58a 100%)', boxShadow: '0 1px 2px rgba(0,0,0,.04), 0 6px 20px rgba(0,0,0,.08)', boxSizing: 'border-box' }}>
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', borderRadius: '50%', background: 'rgba(255,255,255,0.86)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', fontSize: 16, fontWeight: 800, letterSpacing: '-.02em', color: C.greenDk, fontFamily: DISPLAY }}>{initial}</span>
    </span>
  )
  return (
    <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '40px minmax(0, 1fr) 40px', alignItems: 'center', gap: 10, padding: '10px 12px 8px' }}>{/* floats over the page like Home's row: no band, no hairline (owner 2026-09-04) */}
      {back
        ? <Link href={back} aria-label="Back" style={{ ...GLASS, width: 40, height: 40, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.ink, textDecoration: 'none', boxSizing: 'border-box' }}><ChevronLeft size={21} /></Link>
        : multi
        ? <button type="button" onClick={() => setOpen((o) => !o)} aria-label={`Switch location (now ${name})`} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer' }}>{avatar}</button>
        : <Link href="/dashboard/more" aria-label={name}>{avatar}</Link>}
      <div style={{ minWidth: 0, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        {middle ?? (title ? <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 17, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</span> : null)}
      </div>
      {right !== undefined ? <div style={{ width: 40, display: 'flex', justifyContent: 'flex-end' }}>{right}</div> : <Link href="/dashboard/inbox" aria-label={n > 0 ? `Notifications (${n})` : 'Notifications'} style={{ ...GLASS, position: 'relative', width: 40, height: 40, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.ink, textDecoration: 'none', boxSizing: 'border-box' }}>
        <Bell size={19} />
        {n > 0 && <span className="mvp-pop" style={{ position: 'absolute', top: -5, right: -6, minWidth: 18, height: 18, padding: '0 5px', boxSizing: 'border-box', borderRadius: 99, background: hot ? '#d99a1e' : C.green, color: '#fff', fontSize: 10.5, fontWeight: 800, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff', boxShadow: '0 1px 3px rgba(0,0,0,.12)' }}>{n > 99 ? '99+' : n}</span>}
      </Link>}
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 30 }} />
          <div style={{ position: 'absolute', top: 'calc(100% - 1px)', left: 10, zIndex: 31, minWidth: 230, maxWidth: 300, background: '#fff', borderRadius: 14, boxShadow: '0 1px 2px rgba(0,0,0,.04), 0 12px 32px rgba(0,0,0,.14)', padding: 6 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.mute, padding: '6px 10px 4px' }}>Your locations</div>
            {locations.map((loc) => {
              const active = loc.id === client?.id
              return (
                <button key={loc.id} type="button" onClick={() => { setOpen(false); if (!active) switchClient(loc.id) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, background: active ? '#f5f5f7' : 'none', border: 'none', borderRadius: 10, padding: '9px 10px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
                  <span style={{ width: 26, height: 26, borderRadius: '50%', background: active ? C.green : '#eef0ef', color: active ? '#fff' : C.mute, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, flexShrink: 0 }}>{(loc.name?.[0] ?? '·').toUpperCase()}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: active ? 700 : 500, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{loc.name}</span>
                  {active && <Check size={15} color={C.greenDk} style={{ flexShrink: 0 }} />}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

/** the middle slot's search: one glass capsule, the placeholder says WHAT it searches */
export function TopSearch({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label style={{ ...GLASS, display: 'flex', alignItems: 'center', gap: 8, borderRadius: 999, height: 40, padding: '0 10px 0 14px', width: '100%', boxSizing: 'border-box', cursor: 'text' }}>
      <Search size={16} color={C.mute} style={{ flexShrink: 0 }} />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', outline: 'none', fontSize: 14.5, color: C.ink, fontFamily: 'inherit', padding: 0 }} />
      {value && (
        <button type="button" onClick={() => onChange('')} aria-label="Clear search" style={{ border: 'none', background: C.line, color: C.mute, width: 20, height: 20, borderRadius: 99, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0, flexShrink: 0 }}><X size={12} /></button>
      )}
    </label>
  )
}

/** the middle slot's segmented control — Home's capsule, 40px tall */
export function TopSegmented<K extends string>({ options, value, onChange }: { options: [K, string][]; value: K; onChange: (k: K) => void }) {
  return (
    <div style={{ ...GLASS, display: 'flex', gap: 2, borderRadius: 999, padding: 3, width: '100%', boxSizing: 'border-box' }}>
      {options.map(([k, label]) => {
        const on = value === k
        return (
          <button key={k} type="button" onClick={() => onChange(k)} style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', border: 'none', background: on ? '#fff' : 'transparent', color: on ? C.ink : C.mute, borderRadius: 999, padding: '9px 0', fontSize: 13.5, fontWeight: on ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit', boxShadow: on ? '0 2px 6px rgba(0,0,0,.12)' : 'none', transition: 'background .15s, color .15s' }}>{label}</button>
        )
      })}
    </div>
  )
}
