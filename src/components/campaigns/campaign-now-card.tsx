'use client'

/**
 * CampaignNowCard — the interrupt/result card. Since the timeline became the page's hero, this card
 * renders in exactly three situations: a piece NEEDS YOUR OK (any phase — inline View/Approve/Changes
 * on the piece's own spine), the campaign is LIVE (counts + the door to results), or it is DONE (the
 * verdict + run-it-again). Setup lives on the timeline's pulsing button, the when-line lives on the
 * timeline hero, money lives on the order page — this card never repeats them. Honest: verdict words
 * only on settled readings; numbers absent until real.
 */
import { Check, ChevronRight, Sparkles, TrendingUp, Lightbulb } from 'lucide-react'
import { C, DISPLAY, GRAD, SHADOW_CARD } from '@/components/campaigns/ui'
import { PieceSpine } from '@/components/campaigns/tracker/piece-tracker'
import type { CampaignProgress, ShippedPhase } from '@/lib/campaigns/view'
import type { CampaignOutcomes } from '@/lib/campaigns/outcomes/verdict'
import type { TrackerPiece } from '@/lib/campaigns/tracker/types'

export default function CampaignNowCard({ diy, phase, progress, outcomes, nowPiece, readyCount, inboxOwed, showResultsButton, onNextMove, onInbox, onReload }: {
  diy: boolean
  phase: ShippedPhase
  progress: CampaignProgress | null
  outcomes: CampaignOutcomes | null
  /** the ready-for-you piece this card embeds for inline approval — null when none. */
  nowPiece: TrackerPiece | null
  /** how many pieces are genuinely approvable inline right now. */
  readyCount: number
  /** approvals the owner owes that have no inline door here (team-lane reviews) — the inbox link is their ONE door. */
  inboxOwed: number
  showResultsButton: boolean
  onNextMove: () => void
  onInbox: () => void
  onReload: () => Promise<void> | void
}) {
  const total = progress?.total ?? 0
  const live = progress?.live ?? 0
  const queued = progress?.queued ?? 0
  const inProgress = progress?.inProgress ?? 0
  const override = !diy && readyCount > 0 && !!nowPiece
  const rollup = outcomes?.rollup ?? null

  const headline = phase === 'live'
    ? (total === 0 ? 'Your campaign is running' : live === total ? 'All your pieces are out' : `${live} of ${total} are out`)
    : phase === 'done'
      ? doneHeadline(outcomes)
      : phase === 'production' ? 'Your team is on it' : 'Needs your OK'
  const chip = override && headline !== 'Needs your OK' ? 'Needs your OK' : null

  const verdict = rollup?.verdict
  const hasVerdict = phase === 'done' && !!outcomes?.anyData && !!rollup && !rollup.gathering && !!verdict
  const quiet = hasVerdict && (verdict === 'watch' || verdict === 'drop')
  const CtaIcon = quiet ? Lightbulb : Sparkles

  return (
    <div className={override ? 'cw-pulseAmberSoft' : undefined} style={{ background: '#fff', border: `1px solid ${override ? C.amberDot : C.line}`, borderRadius: 18, padding: 16, marginBottom: 0, boxShadow: SHADOW_CARD }}>
      {/* ── HEADLINE ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
          {phase === 'live' && <span className="cw-ping" style={{ width: 8, height: 8, borderRadius: 99, background: C.green, flexShrink: 0 }} />}
          {phase === 'done' && <Check size={18} color={C.greenDk} strokeWidth={2.6} style={{ flexShrink: 0 }} />}
          <div style={{ fontFamily: DISPLAY, fontSize: 20, fontWeight: 600, color: C.ink, lineHeight: 1.2 }}>{headline}</div>
        </div>
        {chip && <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, color: C.amberFg, background: C.amberBg, borderRadius: 99, padding: '4px 10px', marginTop: 1 }}>{chip}</span>}
      </div>

      {/* production interrupt keeps the quick count + bar */}
      {phase === 'production' && total > 0 && (
        <>
          <div style={{ fontSize: 13, color: C.mute, marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>{live} of {total} done</div>
          <div style={{ display: 'flex', gap: 3, marginTop: 8 }}>
            {live > 0 && <span className="cw-grow" style={{ flex: live, height: 7, borderRadius: 99, background: C.green }} />}
            {queued + inProgress > 0 && <span className="cw-grow" style={{ flex: queued + inProgress, height: 7, borderRadius: 99, background: C.greenSoft }} />}
            {total - live - queued - inProgress > 0 && <span className="cw-grow" style={{ flex: total - live - queued - inProgress, height: 7, borderRadius: 99, background: C.line }} />}
          </div>
        </>
      )}

      {/* ── BODY ── */}
      {override && nowPiece && (
        <div style={{ marginTop: 14 }}>
          <PieceSpine piece={nowPiece} onReload={onReload} embed />
          {readyCount > 1 && <div style={{ fontSize: 12, color: C.mute, marginTop: 10, fontVariantNumeric: 'tabular-nums' }}>{readyCount - 1} more after this</div>}
        </div>
      )}

      {phase === 'live' && !override && (
        total === 0
          ? <div style={{ fontSize: 13, color: C.mute, marginTop: 6, lineHeight: 1.45 }}>This runs in the background. Nothing needs your OK.</div>
          : !outcomes?.anyData && <div style={{ fontSize: 13, color: C.mute, marginTop: 6 }}>Just went out. Numbers land in a few days.</div>
      )}

      {phase === 'done' && !hasVerdict && (
        <div style={{ fontSize: 13, color: C.mute, marginTop: 6, lineHeight: 1.45 }}>{rollup?.plain ?? `All ${total} pieces posted. Numbers land a few days after each one.`}</div>
      )}

      {/* approvals with no inline door (team-lane reviews) — this link is their ONE door */}
      {!diy && inboxOwed > 0 && (
        <button onClick={onInbox} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', padding: '10px 0', margin: '-6px 0', marginTop: 12, fontSize: 12.5, fontWeight: 600, color: C.amberFg, fontVariantNumeric: 'tabular-nums' }}>
          {inboxOwed} more {inboxOwed === 1 ? 'needs' : 'need'} your OK in your inbox <ChevronRight size={14} />
        </button>
      )}

      {/* ── CTA ── */}
      {phase === 'live' && showResultsButton && (
        <button onClick={() => { if (typeof document !== 'undefined') document.getElementById('campaign-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }} className="cw-press" style={{ marginTop: 12, width: '100%', height: 48, borderRadius: 12, border: 'none', cursor: 'pointer', background: GRAD, color: '#fff', fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <TrendingUp size={17} /> See every piece
        </button>
      )}
      {phase === 'done' && (
        <button onClick={onNextMove} className="cw-press" style={{ marginTop: 12, width: '100%', height: 48, borderRadius: 12, border: 'none', cursor: 'pointer', background: GRAD, color: '#fff', fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
          <CtaIcon size={16} /> {quiet ? 'Try a different angle' : 'Run it again'}
        </button>
      )}
    </div>
  )
}

function doneHeadline(outcomes: CampaignOutcomes | null): string {
  const r = outcomes?.rollup
  if (!outcomes?.anyData || !r || r.gathering || !r.verdict) return 'Wrapped'
  return r.verdict === 'working' ? 'This worked' : r.verdict === 'watch' ? 'Early, but okay' : 'This was quiet'
}
