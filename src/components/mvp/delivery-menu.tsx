'use client'

/**
 * DeliveryMenu — the owner-run walkthrough for "Price your delivery menu".
 *
 * One screen rather than three, deliberately. The other setup cards walk an owner through changes
 * one at a time because each one is a separate fiddly job in a separate place. This is a single
 * job done once in a spreadsheet-shaped view: which app, what they take, and the new price for
 * every dish. Splitting that into steps would be ceremony.
 *
 * WHAT IT WILL NOT DO. It cannot read or change an app menu, and never says otherwise. The two
 * numbers it needs that we cannot know, the commission rate and the food cost, are asked for or
 * declared missing rather than assumed.
 */

import { useCallback, useEffect, useState } from 'react'
import { C, Panel, H, Fine, Section, Note, Loading, Bad } from './walkthrough-kit'
import { APP_KEYS, APPS, money, type AppKey, type ItemAdvice, type MenuReport } from '@/lib/delivery/menu-fix'

const TONE: Record<ItemAdvice['verdict'], string> = {
  ok: C.green, underpriced: C.amber, losing: C.coral, drop: C.coral,
}
const WORD: Record<ItemAdvice['verdict'], string> = {
  ok: 'holds up', underpriced: 'raise it', losing: 'losing money', drop: 'take it off',
}

export default function DeliveryMenu({ campaignId }: { campaignId?: string }) {
  void campaignId
  const [app, setApp] = useState<AppKey>('doordash')
  const [rate, setRate] = useState(0.30)
  const [report, setReport] = useState<MenuReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(true)

  const load = useCallback(async () => {
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/dashboard/delivery-menu?app=${app}&rate=${rate}`)
      const body = await res.json()
      if (!res.ok) { setError(body?.error ?? 'We could not read your menu.'); setReport(null) }
      else setReport(body as MenuReport)
    } catch { setError('We could not read your menu.') } finally { setBusy(false) }
  }, [app, rate])

  useEffect(() => { void load() }, [load])

  return (
    <Panel>
      <Section title="Which app">
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {APP_KEYS.map((k) => {
            const on = k === app
            return (
              <button key={k} onClick={() => setApp(k)}
                style={{ border: `1px solid ${on ? C.green : C.line}`, background: on ? C.greenSoft : '#fff',
                  color: on ? C.greenDk : C.mute, borderRadius: 999, padding: '5px 11px',
                  fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                {APPS[k].label}
              </button>
            )
          })}
        </div>
      </Section>

      <Section title="What they take">
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 6 }}>
          {[0.15, 0.20, 0.25, 0.30].map((r) => {
            const on = Math.abs(r - rate) < 0.001
            return (
              <button key={r} onClick={() => setRate(r)}
                style={{ border: `1px solid ${on ? C.green : C.line}`, background: on ? C.greenSoft : '#fff',
                  color: on ? C.greenDk : C.mute, borderRadius: 999, padding: '5px 13px',
                  fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                {Math.round(r * 100)}%
              </button>
            )
          })}
        </div>
        <Fine>{APPS[app].note}</Fine>
      </Section>

      {busy && <Loading>Working out your prices</Loading>}
      {error && !busy && <Bad>{error}</Bad>}

      {report && !busy && (
        <>
          <H>{report.headline}</H>
          <Section title="Every dish">
            {report.advice.map((a) => (
              <div key={a.item.id} style={{ display: 'flex', gap: 9, padding: '8px 0', borderBottom: `1px solid ${C.line}`, alignItems: 'flex-start' }}>
                <span style={{ width: 7, height: 7, borderRadius: 99, background: TONE[a.verdict], flexShrink: 0, marginTop: 6 }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>{a.item.name}</span>
                    <span style={{ fontSize: 12, color: TONE[a.verdict] }}>{WORD[a.verdict]}</span>
                    {a.verdict !== 'ok' && a.verdict !== 'drop' && (
                      <span style={{ fontSize: 12.5, color: C.greenDk, fontWeight: 600 }}>{money(a.suggested)}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12.5, color: C.mute, lineHeight: 1.45, marginTop: 2 }}>{a.line}</div>
                </div>
              </div>
            ))}
            {!report.advice.length && <Fine>No menu on file yet. Send us your menu and this fills in.</Fine>}
          </Section>

          {report.caveats.map((c) => <Note key={c}>{c}</Note>)}
        </>
      )}
    </Panel>
  )
}
