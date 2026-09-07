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
import { useMvpTheme } from './mvp-theme'
import { useLang } from './mvp-language'

interface Row { id: string; label: string; sub: string; value: string; small: string; tone: 'up' | 'down' | 'flat' | 'wait' | 'done' | 'off'; state: string; campaignId: string | null; requestId: string | null }


export default function CountedStrip({ clientId }: { clientId?: string }) {
  const [rows, setRows] = useState<Row[]>([])
  const { C } = useMvpTheme()
  const { T } = useLang()
  const TONE: Record<Row['tone'], string> = { up: C.greenDk, down: C.coral, flat: C.ink, wait: C.mute, done: C.greenDk, off: C.mute }
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
    <section aria-label={T('Counted, as promised')} style={{ margin: '6px 0 0' }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: C.mute, padding: '8px 2px 6px' }}>{T('Counted, as promised')}</div>
      <div style={{ display: 'grid', gap: 8 }}>
        {rows.map((r) => {
          const href = r.campaignId ? `/dashboard/campaigns/${r.campaignId}` : r.requestId ? `/dashboard/requests/${r.requestId}` : '/dashboard/campaigns'
          const numTone = TONE[r.tone]
          return (
            <Link key={r.id} href={href} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div style={{ background: C.card, borderRadius: 16, boxShadow: '0 1px 2px rgba(0,0,0,.04), 0 6px 20px rgba(0,0,0,.05)', border: `1px solid ${C.line}`, padding: '11px 14px', display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center', borderLeft: r.state === 'held' ? `3px solid ${C.amber}` : r.state === 'not_counted' ? `3px solid ${C.line}` : undefined }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: "'Cal Sans', Inter, system-ui, sans-serif", fontSize: 14, color: C.ink }}>{r.label}</div>
                  <div style={{ fontSize: 13, color: C.mute, marginTop: 2 }}>{r.sub}</div>
                </div>
                <div style={{ textAlign: 'right', lineHeight: 1.05 }}>
                  <div style={{ fontFamily: "'Cal Sans', Inter, system-ui, sans-serif", /* The word, not just a number, sits here: "Delivered" (9), "Not counted" (11),
                     * "Being made" (10). At > 9 the nine-character words rendered at the number's
                     * 20px and pushed the card's small line off; > 6 is the first threshold that
                     * catches every word the seven states can print. */
                    fontSize: r.value.length > 6 ? 15 : 20, color: numTone, fontVariantNumeric: 'normal' }}>{r.value}</div>
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: r.tone === 'up' ? C.greenDk : r.tone === 'down' ? C.coral : C.mute, marginTop: 3 }}>{r.small}</div>
                </div>
              </div>
            </Link>
          )
        })}
      </div>
      <div style={{ fontSize: 11.5, color: C.mute, padding: '6px 2px 0' }}>{T('Before and after on your whole listing. It shows what happened, not proof of cause.')}</div>
    </section>
  )
}
