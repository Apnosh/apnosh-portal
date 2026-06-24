'use client'

/**
 * Owner-side view of the creative work orders for a shipped campaign — the
 * other end of the creator inbox. Shows who's making each piece, its status,
 * and (once delivered) lets the owner approve or ask for changes. Reads/writes
 * /api/creator/work.
 */
import { useCallback, useEffect, useState } from 'react'
import type { WorkOrder } from '@/lib/campaigns/work-orders'
import { safeHref } from '@/lib/campaigns/work-orders-core'
import { C } from '@/components/campaigns/ui'

const DISC_ICON: Record<string, string> = { Video: '🎬', Photo: '📷', Design: '🎨' }

const STATUS: Record<string, { label: string; fg: string; bg: string }> = {
  offered: { label: 'Sent to creator', fg: '#2563eb', bg: '#eff6ff' },
  accepted: { label: 'Accepted', fg: '#b45309', bg: '#fffbeb' },
  in_progress: { label: 'In production', fg: '#b45309', bg: '#fffbeb' },
  delivered: { label: 'Ready for review', fg: '#7c3aed', bg: '#f5f3ff' },
  approved: { label: 'Approved', fg: C.greenDk, bg: C.greenSoft },
  revision: { label: 'Changes asked', fg: '#be123c', bg: '#fff1f2' },
  declined: { label: 'Declined', fg: C.mute, bg: '#f1f1f3' },
}

export default function DeliveriesCard({ campaignId }: { campaignId: string }) {
  const [orders, setOrders] = useState<WorkOrder[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    const r = await fetch(`/api/creator/work?campaign=${encodeURIComponent(campaignId)}`, { cache: 'no-store' })
    const j = await r.json().catch(() => ({ orders: [] }))
    setOrders(j.orders ?? [])
  }, [campaignId])

  useEffect(() => { load() }, [load])

  const act = useCallback(async (id: string, patch: { status: string; note?: string }) => {
    setBusy(id)
    try {
      await fetch('/api/creator/work', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, ...patch }) })
      await load()
    } finally { setBusy(null) }
  }, [load])

  if (!orders || orders.length === 0) return null

  return (
    <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 16, padding: 16, marginTop: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, marginBottom: 2 }}>Creator deliveries</div>
      <div style={{ fontSize: 11.5, color: C.mute, marginBottom: 12 }}>The creators making your pieces. Approve when the work looks right.</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {orders.map((o) => {
          const s = STATUS[o.status] ?? STATUS.offered
          return (
            <div key={o.id} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, border: `1px solid ${C.line}`, borderRadius: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                  <span style={{ fontSize: 16 }}>{DISC_ICON[o.discipline] ?? '✨'}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.discipline}</div>
                    <div style={{ fontSize: 11.5, color: C.mute }}>
                      {o.creatorName}
                      <a href={`/creator/work?creator=${encodeURIComponent(o.creatorId)}`} target="_blank" rel="noreferrer" style={{ marginLeft: 6, color: C.faint, textDecoration: 'none' }}>see their view ↗</a>
                    </div>
                  </div>
                </div>
                <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 600, color: s.fg, background: s.bg, borderRadius: 99, padding: '3px 9px' }}>{s.label}</span>
              </div>

              {o.note && (
                <div style={{ fontSize: 11.5, color: C.mute }}>Your note: {o.note}</div>
              )}
              {o.status === 'delivered' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {safeHref(o.deliveredUrl) && <a href={safeHref(o.deliveredUrl)!} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 600, color: C.greenDk, textDecoration: 'underline' }}>View work</a>}
                  <button disabled={busy === o.id} onClick={() => act(o.id, { status: 'approved' })} style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: '#fff', background: C.ink, border: 'none', borderRadius: 9, padding: '6px 12px', cursor: 'pointer' }}>Approve</button>
                  <button disabled={busy === o.id} onClick={() => { const note = window.prompt('What should change?'); if (note) act(o.id, { status: 'revision', note }) }} style={{ fontSize: 12, fontWeight: 600, color: C.ink2, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 9, padding: '6px 12px', cursor: 'pointer' }}>Ask for changes</button>
                </div>
              )}
              {o.status === 'approved' && safeHref(o.deliveredUrl) && (
                <a href={safeHref(o.deliveredUrl)!} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 600, color: C.greenDk, textDecoration: 'underline' }}>View delivered work</a>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
