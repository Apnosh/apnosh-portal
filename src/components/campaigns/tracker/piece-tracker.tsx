'use client'

/**
 * Content-piece lifecycle spine (the owner's "on the way" design). PieceSpine renders one piece expanded
 * into its full lifecycle — Brief in, In production, [Your OK], Goes live {date}, First numbers —
 * current step highlighted, approve/changes inline. PieceCompactRow is the one-line status row. Both are
 * exported so the unified CampaignJourney reuses them (no visual drift). Approve/changes reuse PATCH
 * /api/creator/work then re-fetch via onReload.
 */
import { useState } from 'react'
import { FileText, Film, Camera, Smartphone, Palette, Eye, Send, TrendingUp, Check, Sparkles, ExternalLink } from 'lucide-react'
import { C, DISPLAY, EYEBROW, GRAD, SHADOW_CARD } from '@/components/campaigns/ui'
import { stageRank, type Stage } from '@/lib/campaigns/tracker/stages'
import type { TrackerPiece } from '@/lib/campaigns/tracker/types'

const DISC_ICON: Record<string, typeof Film> = { Video: Film, Photo: Camera, Social: Smartphone, Design: Palette }
const WATCH = C.amberDot
const DROP = '#cf8a8a'

export function fmtShort(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
function daysUntil(iso: string | null): number | null {
  if (!iso) return null
  const d = new Date(iso); if (isNaN(d.getTime())) return null
  return Math.ceil((d.getTime() - Date.now()) / 86400000)
}
function friendlyType(channel: string): string {
  return channel === 'Video' ? 'reel' : channel === 'Photo' ? 'photo' : channel === 'Social' ? 'post' : channel === 'Design' ? 'graphic' : 'piece'
}

/** The piece that needs you or is next to go live ranks highest — ready-for-you wins (it needs you). */
export function piecePrio(p: TrackerPiece): number {
  return p.stage === 'ready_for_you' ? 100 : (p.stage === 'dropped' || p.stage === 'posted' || p.stage === 'gathering') ? -1 : stageRank(p.stage)
}

/** "Goes live in N days" chip text for a piece — exported so the Now card owns the chip slot. */
export function pieceChip(p: TrackerPiece): string | null {
  const d = daysUntil(p.goLiveISO)
  if (d == null || d < 0) return null
  return d === 0 ? 'Goes live today' : `Goes live in ${d} ${d === 1 ? 'day' : 'days'}`
}

type NodeState = 'done' | 'current' | 'future'
type LNode = { key: string; title: string; sub: string; Icon: typeof FileText; state: NodeState }

function stageNodeKey(stage: Stage): string {
  if (stage === 'ready_for_you') return 'ok'
  if (stage === 'approved' || stage === 'scheduled') return 'live'
  if (stage === 'posted' || stage === 'gathering') return 'numbers'
  return 'prod'   // making
}

function lifecycle(p: TrackerPiece): LNode[] {
  const type = friendlyType(p.channel)
  const isCreator = p.lane === 'creator'
  const maker = isCreator && p.who !== 'Your team' ? p.who : 'Our team'
  const goLive = fmtShort(p.goLiveISO)
  const raw: Omit<LNode, 'state'>[] = [
    { key: 'brief', title: 'Brief in', sub: 'We know what to make', Icon: FileText },
    { key: 'prod', title: 'In production', sub: `${maker} is making your ${type}`, Icon: Film },
  ]
  if (isCreator) raw.push({ key: 'ok', title: 'Your OK', sub: 'Take a look and say go', Icon: Eye })
  raw.push({ key: 'live', title: goLive ? `Goes live ${goLive}` : 'Goes live', sub: `We post it for you${isCreator ? ' after your OK' : ''}`, Icon: Send })
  // No promised date on the numbers node — each platform reports on its own
  // clock (Instagram in about a day, others slower or not at all), so a fixed
  // "~{date}" would be a promise nothing delivers on.
  raw.push({ key: 'numbers', title: p.readoutValue ? p.readoutValue : 'First numbers', sub: 'Reach and Google actions land here as they come in', Icon: TrendingUp })

  const allDone = !!p.readoutValue
  const curIdx = allDone ? raw.length : raw.findIndex((n) => n.key === stageNodeKey(p.stage))
  return raw.map((n, i) => ({ ...n, state: i < curIdx ? 'done' : i === curIdx ? 'current' : 'future' }))
}

/** The expanded lifecycle card for one piece. embed=true renders it bare (no card shell, no eyebrow,
 *  no footer note) so the Now card can host it as its body without a second narrator. */
export function PieceSpine({ piece, onReload, embed }: { piece: TrackerPiece; onReload: () => Promise<void> | void; embed?: boolean }) {
  const [busy, setBusy] = useState(false)
  const p = piece
  async function act(patch: { status?: string; note?: string; concept_status?: 'approved' | 'changes' }) {
    if (!p.orderId) return
    setBusy(true)
    try {
      await fetch('/api/creator/work', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: p.orderId, ...patch }) })
      await onReload()
    } finally { setBusy(false) }
  }
  const askChanges = () => { const n = typeof window !== 'undefined' ? window.prompt('What should change?') : null; if (n != null) act({ status: 'revision', note: n }) }
  const askConceptTweak = () => { const n = typeof window !== 'undefined' ? window.prompt('What should change about the idea?') : null; if (n) act({ concept_status: 'changes', note: n }) }
  const chip = pieceChip(p)
  const ChannelIcon = DISC_ICON[p.channel] ?? Film

  return (
    <div style={embed ? undefined : { border: `1px solid ${C.line}`, borderRadius: 18, padding: 16, background: '#fff', boxShadow: SHADOW_CARD }}>
      {!embed && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, ...EYEBROW }}><Sparkles size={13} /> Up next for you</div>
          {chip && <span style={{ fontSize: 11, fontWeight: 700, color: C.greenDk, background: C.greenSoft, borderRadius: 99, padding: '4px 10px' }}>{chip}</span>}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
        <span style={{ display: 'grid', placeItems: 'center', width: 32, height: 32, borderRadius: 10, background: C.greenSoft, flexShrink: 0 }}><ChannelIcon size={16} color={C.greenDk} /></span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: DISPLAY, fontSize: 16, fontWeight: 600, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.label}</div>
          <div style={{ fontSize: 11.5, color: C.mute, textTransform: 'capitalize' }}>{friendlyType(p.channel)}{p.who !== 'Your team' ? ` · ${p.who}` : ''}</div>
        </div>
      </div>

      {lifecycle(p).map((n, i, arr) => {
        const last = i === arr.length - 1
        return (
          <div key={n.key} style={{ display: 'flex', gap: 12 }}>
            <div style={{ position: 'relative', width: 30, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
              <NodeDot node={n} embed={embed} />
              {!last && <div style={{ position: 'absolute', left: 14, top: 30, bottom: -6, width: 2, background: n.state === 'done' ? C.green : C.line }} />}
            </div>
            <div style={{ paddingBottom: last ? 0 : 16, minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: n.state === 'future' ? 500 : 600, color: n.state === 'future' ? C.mute : C.ink }}>{n.title}</div>
              <div style={{ fontSize: 11.5, color: C.mute, marginTop: 1 }}>{n.sub}</div>
              {n.key === 'ok' && n.state === 'current' && p.canApprove && p.orderId && (
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  {p.previewUrl && <a href={p.previewUrl} target="_blank" rel="noopener noreferrer" style={{ alignSelf: 'center', fontSize: 12, fontWeight: 600, color: C.greenDk, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, padding: '12px 4px', margin: '-12px 0' }}>View <ExternalLink size={11} /></a>}
                  <button disabled={busy} onClick={() => act({ status: 'approved' })} className="cw-press" style={{ flex: 1, height: 44, borderRadius: 10, border: 'none', background: GRAD, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>Approve</button>
                  <button disabled={busy} onClick={askChanges} style={{ flex: 1, height: 44, borderRadius: 10, border: `1px solid ${C.line}`, background: '#fff', color: C.ink, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Changes</button>
                </div>
              )}
              {n.key === 'prod' && n.state === 'current' && p.canReviewConcept && p.orderId && (
                // "Run the idea by me first": the maker cannot start until the owner OKs the
                // idea, so this is the ONLY place that unblocks an approve_concept order.
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: C.amberFg, marginBottom: 8 }}>{p.conceptStatus === 'changes' ? 'You asked for a tweak. Approve the idea when it looks right.' : 'The idea is ready for your OK before work starts.'}</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button disabled={busy} onClick={() => act({ concept_status: 'approved' })} className="cw-press" style={{ flex: 1, height: 44, borderRadius: 10, border: 'none', background: GRAD, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>Approve idea</button>
                    <button disabled={busy} onClick={askConceptTweak} style={{ flex: 1, height: 44, borderRadius: 10, border: `1px solid ${C.line}`, background: '#fff', color: C.ink, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Ask for a tweak</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )
      })}

      {!embed && <div style={{ marginTop: 12, background: C.bg, borderRadius: 10, padding: '9px 11px', fontSize: 11, color: C.mute, lineHeight: 1.45 }}>Numbers roll in after a piece posts. Nothing for you to watch, we surface results here.</div>}
    </div>
  )
}

export function PieceCompactRow({ p, rightOverride }: { p: TrackerPiece; rightOverride?: string }) {
  // A creator-lane drop means the creator said no and the piece still needs someone —
  // say that, not a dead-end "Stopped" (which is what a team-killed piece shows).
  const label = rightOverride ?? (p.stage === 'posted' || p.stage === 'gathering' ? (p.stageAtISO ? `Posted ${fmtShort(p.stageAtISO)}` : 'Posted') : p.stage === 'ready_for_you' ? 'Ready for you' : p.stage === 'scheduled' || p.stage === 'approved' ? (p.goLiveISO ? `Goes live ${fmtShort(p.goLiveISO)}` : 'Scheduled') : p.stage === 'dropped' ? (p.lane === 'creator' ? 'Needs a new maker' : 'Stopped') : 'In production')
  const vColor = p.readoutVerdict === 'working' ? C.green : p.readoutVerdict === 'drop' ? DROP : WATCH
  const ChannelIcon = DISC_ICON[p.channel] ?? Film
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: C.bg, border: 'none', borderRadius: 12, padding: '10px 12px', opacity: p.stage === 'dropped' ? 0.7 : 1 }}>
      <span style={{ display: 'grid', placeItems: 'center', width: 28, height: 28, borderRadius: 8, background: C.greenSoft, flexShrink: 0 }}><ChannelIcon size={14} color={C.greenDk} /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.label}</div>
        <div style={{ fontSize: 11, color: C.mute, textTransform: 'capitalize' }}>{friendlyType(p.channel)}{p.who !== 'Your team' ? ` · ${p.who}` : ''}</div>
      </div>
      {p.readoutValue ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span style={{ width: 6, height: 6, borderRadius: 99, background: vColor }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: C.ink }}>{p.readoutValue}</span>
          {p.postLink && <a href={p.postLink} target="_blank" rel="noopener noreferrer" style={{ color: C.greenDk }}><ExternalLink size={12} /></a>}
        </div>
      ) : (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: p.stage === 'ready_for_you' ? C.amberFg : C.mute }}>{label}</span>
          {p.postLink && (p.stage === 'posted' || p.stage === 'gathering') && <a href={p.postLink} target="_blank" rel="noopener noreferrer" style={{ color: C.greenDk }}><ExternalLink size={12} /></a>}
        </span>
      )}
    </div>
  )
}

function NodeDot({ node, embed }: { node: LNode; embed?: boolean }) {
  const { state, Icon } = node
  if (state === 'done') return <span style={{ display: 'grid', placeItems: 'center', width: 30, height: 30, borderRadius: 99, background: C.green, color: '#fff' }}><Check size={15} strokeWidth={2.8} /></span>
  if (state === 'current') return <span className={embed ? undefined : 'cw-breathe'} style={{ display: 'grid', placeItems: 'center', width: 30, height: 30, borderRadius: 99, background: C.greenSoft, border: `2px solid ${C.green}`, color: C.greenDk, boxSizing: 'border-box' }}><Icon size={14} /></span>
  return <span style={{ display: 'grid', placeItems: 'center', width: 30, height: 30, borderRadius: 99, background: '#fff', border: `1.5px solid ${C.line}`, color: C.faint, boxSizing: 'border-box' }}><Icon size={14} /></span>
}

export default function PieceTracker({ pieces, onReload }: { pieces: TrackerPiece[]; onReload: () => Promise<void> | void }) {
  if (!pieces.length) return null
  const ordered = [...pieces].sort((a, b) => piecePrio(b) - piecePrio(a))
  const upNext = ordered[0]
  const others = ordered.slice(1)
  return (
    <div style={{ marginTop: 16 }}>
      <PieceSpine piece={upNext} onReload={onReload} />
      {others.length > 0 && <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>{others.map((p) => <PieceCompactRow key={p.id} p={p} />)}</div>}
    </div>
  )
}
