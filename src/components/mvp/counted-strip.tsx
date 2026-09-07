'use client'
/**
 * CountedStrip — "Counted, as promised", under the Home funnel.
 *
 * One row per order, the count its Create card named, the day it started, the number before.
 * Renders nothing when the client has no orders (the funnel stays the whole page, per the
 * owner). Never more than three rows; the rest live on Campaigns. Tones: green up, red down,
 * ink flat, grey waiting, mint done.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Row { id: string; label: string; sub: string; value: string; small: string; tone: 'up' | 'down' | 'flat' | 'wait' | 'done' | 'off'; state: string; campaignId: string | null; requestId: string | null }

const TONE: Record<Row['tone'], string> = { up: '#2e9a78', down: '#c92d32', flat: '#1d1d1f', wait: '#aeaeb2', done: '#2e9a78', off: '#6e6e73' }

export default function CountedStrip({ clientId }: { clientId?: string }) {
  const [rows, setRows] = useState<Row[]>([])
  useEffect(() => {
    if (!clientId) return
    let alive = true
    fetch(`/api/dashboard/promises?clientId=${clientId}`)
      .then((r) => r.json())
      .then((j) => { if (alive && Array.isArray(j?.rows)) setRows(j.rows) })
      .catch(() => {})
    return () => { alive = false }
  }, [clientId])
  if (!rows.length) return null
  return (
    <section aria-label="Counted, as promised" style={{ margin: '6px 0 0' }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#aeaeb2', padding: '8px 2px 6px' }}>Counted, as promised</div>
      <div style={{ display: 'grid', gap: 8 }}>
        {rows.map((r) => {
          const href = r.campaignId ? `/dashboard/campaigns/${r.campaignId}` : r.requestId ? '/dashboard/orders' : '/dashboard/campaigns'
          const numTone = TONE[r.tone]
          return (
            <Link key={r.id} href={href} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 1px 2px rgba(0,0,0,.04), 0 6px 20px rgba(0,0,0,.05)', padding: '11px 14px', display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center', borderLeft: r.state === 'held' ? '3px solid #d99a1e' : r.state === 'not_counted' ? '3px solid #e6e6ea' : undefined }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: "'Cal Sans', Inter, system-ui, sans-serif", fontSize: 14, color: '#1d1d1f' }}>{r.label}</div>
                  <div style={{ fontSize: 12.5, color: '#6e6e73', marginTop: 2 }}>{r.sub}</div>
                </div>
                <div style={{ textAlign: 'right', lineHeight: 1.05 }}>
                  <div style={{ fontFamily: "'Cal Sans', Inter, system-ui, sans-serif", fontSize: r.value.length > 9 ? 15 : 20, color: numTone, fontVariantNumeric: 'normal' }}>{r.value}</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: r.tone === 'up' ? '#2e9a78' : r.tone === 'down' ? '#c92d32' : '#aeaeb2', marginTop: 3 }}>{r.small}</div>
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
