'use client'

/**
 * CampaignResults — the ONE home for outcomes ("What happened"): the aggregate rollup (or the concrete
 * before -> after proof, never both — they are the same fact), then every posted piece as a readout row.
 * This is the real target of the Now card's "See every piece" button (id=campaign-results lives on the
 * wrapper in page.tsx). Honest: renders null until at least one piece is out or a reading exists — never
 * an empty shell, never a zero. The "numbers take time" sentence lives here and only here.
 */
import { C, DISPLAY, EYEBROW } from '@/components/campaigns/ui'
import { PieceCompactRow } from '@/components/campaigns/tracker/piece-tracker'
import { fmt, type CampaignOutcomes } from '@/lib/campaigns/outcomes/verdict'
import type { TrackerPiece } from '@/lib/campaigns/tracker/types'

const OUT = new Set(['posted', 'gathering', 'dropped'])

/** True once anything real exists to show — gates both this section and the Now card's button. */
export function hasResults(outcomes: CampaignOutcomes | null, pieces: TrackerPiece[]): boolean {
  return !!outcomes?.anyData || pieces.some((p) => OUT.has(p.stage))
}

export default function CampaignResults({ outcomes, pieces }: { outcomes: CampaignOutcomes | null; pieces: TrackerPiece[] }) {
  if (!hasResults(outcomes, pieces)) return null
  const rows = pieces.filter((p) => OUT.has(p.stage))
  const rollup = outcomes?.rollup ?? null
  const proof = outcomes?.proof ?? null
  const showRollup = !proof && !!outcomes?.anyData && !!rollup?.value

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ ...EYEBROW, marginBottom: 10 }}>What happened</div>

      {/* the aggregate — the proof line when we have a real before/after, else the rollup. Same fact, one home. */}
      {proof && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontFamily: DISPLAY, fontSize: 20, fontWeight: 700, color: C.ink, fontVariantNumeric: 'tabular-nums' }}>{fmt(proof.before)} → {fmt(proof.after)} {proof.metricLabel}<span style={{ fontWeight: 500, fontSize: 14, color: C.mute }}> over {proof.days} days</span></div>
          <div style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>Since this campaign started</div>
        </div>
      )}
      {showRollup && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontFamily: DISPLAY, fontSize: 26, fontWeight: 700, color: C.ink, lineHeight: 1.05, letterSpacing: '-.02em', fontVariantNumeric: 'tabular-nums' }}>{rollup!.value}</div>
          <div style={{ fontSize: 13, color: C.mute, marginTop: 3 }}>{rollup!.plain}</div>
        </div>
      )}

      {rows.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map((p) => <PieceCompactRow key={p.id} p={p} rightOverride={p.stage === 'gathering' && !p.readoutValue ? 'Numbers coming' : undefined} />)}
        </div>
      )}

      <div style={{ fontSize: 11, color: C.faint, marginTop: 8, lineHeight: 1.45 }}>Numbers take a week or two after a piece posts.</div>
    </div>
  )
}
