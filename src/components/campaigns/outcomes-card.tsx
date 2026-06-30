'use client'

/**
 * Owner-facing campaign results (Phase 3). Renders the real per-piece reach/engagement
 * from the outcomes reader, or an honest "still gathering" — never a fabricated number.
 * Shows only on shipped campaigns; returns null when there are no pieces to report on.
 */
import { TrendingUp } from 'lucide-react'
import { C } from '@/components/campaigns/ui'
import type { CampaignOutcomes, PieceOutcome } from '@/lib/campaigns/outcomes/verdict'

const WATCH = '#d99a3a'
const DROP = '#cf8a8a'

function dotColor(p: PieceOutcome): string {
  if (p.state === 'gathering') return C.faint
  const v = p.readout.verdict
  return v === 'working' ? C.green : v === 'drop' ? DROP : WATCH
}

export default function OutcomesCard({ outcomes }: { outcomes: CampaignOutcomes }) {
  const { pieces, anyData, rollup } = outcomes
  if (!pieces.length) return null

  return (
    <div style={{ marginTop: 14, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: '13px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: C.faint, marginBottom: 10 }}>
        <TrendingUp size={13} /> Results so far
      </div>

      {anyData ? (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontFamily: 'inherit', fontSize: 22, fontWeight: 800, color: C.ink, lineHeight: 1.1 }}>{rollup.value}</div>
          <div style={{ fontSize: 12, color: C.mute, marginTop: 3 }}>{rollup.plain}</div>
        </div>
      ) : (
        <div style={{ fontSize: 12.5, color: C.mute, lineHeight: 1.5, marginBottom: 4 }}>
          Results are still gathering. They land a few days after each piece posts, and real reach and engagement show up right here.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 4 }}>
        {pieces.map((p) => (
          <div key={p.draftId} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 0', borderTop: `1px solid ${C.line}` }}>
            <span style={{ width: 7, height: 7, borderRadius: 99, background: dotColor(p), flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.label ?? 'A piece'}</span>
            <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, color: p.state === 'gathering' ? C.faint : C.ink }}>
              {p.state === 'gathering' ? 'gathering…' : p.readout.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
