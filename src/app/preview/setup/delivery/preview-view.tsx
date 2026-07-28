'use client'

import { C, Panel, H, Fine, Section, Note } from '@/components/mvp/walkthrough-kit'
import { money, type ItemAdvice, type MenuReport } from '@/lib/delivery/menu-fix'

const TONE: Record<ItemAdvice['verdict'], string> = {
  ok: C.green, underpriced: C.amber, losing: C.coral, drop: C.coral,
}
const WORD: Record<ItemAdvice['verdict'], string> = {
  ok: 'holds up', underpriced: 'raise it', losing: 'losing money', drop: 'take it off',
}

export default function PreviewDeliveryView({ report }: { report: MenuReport }) {
  return (
    <Panel>
      <H>{report.headline}</H>
      <Fine>
        On {report.app.label} at {Math.round(report.rate * 100)}% of every order.
      </Fine>
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
      </Section>
      {report.caveats.map((c) => <Note key={c}>{c}</Note>)}
    </Panel>
  )
}
