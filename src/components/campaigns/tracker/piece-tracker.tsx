'use client'

/**
 * Content-piece lifecycle spine (the owner's "on the way" design). PieceSpine renders one piece expanded
 * into its full lifecycle — Brief in, In production, [Your OK], Goes live {date}, First numbers —
 * current step highlighted, approve/changes inline. PieceCompactRow is the one-line status row. Both are
 * exported so the unified CampaignJourney reuses them (no visual drift). Approve/changes reuse PATCH
 * /api/creator/work then re-fetch via onReload.
 */
import { useState } from 'react'
import { FileText, Film, Camera, Smartphone, Palette, Eye, Send, TrendingUp, Check, Sparkles, ExternalLink, Star } from 'lucide-react'
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

/** "★ 4.8 (12)" for a maker with a real profile and real ratings — null otherwise.
 *  The honest fallback (team work, unrated creators) is showing nothing extra. */
export function creatorRatingChip(p: TrackerPiece): string | null {
  const r = p.creatorRating
  if (!r || r.count < 1) return null
  return `★ ${r.avg} (${r.count})`
}

/**
 * The one rating capture: 5 stars + an optional comment for a delivered piece of
 * creator work. Renders on the piece spine's review step only (never sprinkled).
 * POSTs /api/dashboard/work-rating; one rating per order, server-enforced.
 */
function RateWork({ orderId, onRated }: { orderId: string; onRated: () => void }) {
  const [stars, setStars] = useState(0)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function send() {
    if (!stars || busy) return
    setBusy(true); setErr(null)
    try {
      const r = await fetch('/api/dashboard/work-rating', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orderId, stars, ...(comment.trim() ? { comment: comment.trim() } : {}) }),
      })
      if (r.ok || r.status === 409) { setDone(true); onRated() }   // 409 = already rated: same end state
      else setErr(((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? 'Could not save your rating. Try again.')
    } catch { setErr('Could not save your rating. Try again.') }
    finally { setBusy(false) }
  }

  if (done) return <div style={{ fontSize: 12, fontWeight: 600, color: C.greenDk, marginTop: 8 }}>Thanks. Your rating helps us match you with the right makers.</div>

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: C.ink2 }}>How was this work?</div>
      <div style={{ display: 'flex', gap: 2, marginTop: 4 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} aria-label={`${n} ${n === 1 ? 'star' : 'stars'}`} disabled={busy} onClick={() => setStars(n)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, lineHeight: 0 }}>
            <Star size={20} fill={n <= stars ? '#f5a93f' : 'none'} color={n <= stars ? '#f5a93f' : C.faint} />
          </button>
        ))}
      </div>
      {stars > 0 && (
        <div style={{ marginTop: 6 }}>
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Anything to add? (optional)"
            maxLength={1000}
            style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${C.line}`, borderRadius: 10, padding: '9px 11px', fontSize: 12.5, color: C.ink, fontFamily: 'inherit', outline: 'none', background: '#fff' }}
          />
          <button disabled={busy} onClick={send} className="cw-press" style={{ marginTop: 6, height: 38, padding: '0 16px', borderRadius: 10, border: 'none', background: GRAD, color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
            {busy ? 'Saving…' : 'Send rating'}
          </button>
        </div>
      )}
      {err && <div style={{ fontSize: 11.5, color: '#be123c', marginTop: 6 }}>{err}</div>}
    </div>
  )
}

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
  // The rating moment: after the owner approves a ratable creator piece, hold the
  // reload and ask "How was this work?" once — skip or send, then the page moves on.
  const [rateAfterApprove, setRateAfterApprove] = useState(false)
  const [rated, setRated] = useState(false)
  const p = piece
  async function act(patch: { status?: string; note?: string; concept_status?: 'approved' | 'changes' }) {
    if (!p.orderId) return
    setBusy(true)
    try {
      const r = await fetch('/api/creator/work', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: p.orderId, ...patch }) })
      if (r.ok && patch.status === 'approved' && p.ratable && !rated) { setRateAfterApprove(true); return }   // rate first, reload after
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
          <div style={{ fontSize: 11.5, color: C.mute, textTransform: 'capitalize' }}>{friendlyType(p.channel)}{p.who !== 'Your team' ? ` · ${p.who}` : ''}{creatorRatingChip(p) ? <span style={{ textTransform: 'none', color: C.amberFg }}> · {creatorRatingChip(p)}</span> : ''}</div>
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
              {n.key === 'ok' && n.state === 'current' && p.canApprove && p.orderId && !rateAfterApprove && (
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  {p.previewUrl && <a href={p.previewUrl} target="_blank" rel="noopener noreferrer" style={{ alignSelf: 'center', fontSize: 12, fontWeight: 600, color: C.greenDk, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, padding: '12px 4px', margin: '-12px 0' }}>View <ExternalLink size={11} /></a>}
                  <button disabled={busy} onClick={() => act({ status: 'approved' })} className="cw-press" style={{ flex: 1, height: 44, borderRadius: 10, border: 'none', background: GRAD, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>Approve</button>
                  <button disabled={busy} onClick={askChanges} style={{ flex: 1, height: 44, borderRadius: 10, border: `1px solid ${C.line}`, background: '#fff', color: C.ink, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Changes</button>
                </div>
              )}
              {n.key === 'ok' && rateAfterApprove && p.orderId && (
                // The one rating capture, right where the owner just reviewed the delivery.
                <div style={{ marginTop: 8, background: C.bg, borderRadius: 12, padding: '10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: C.greenDk }}><Check size={13} strokeWidth={3} /> Approved</div>
                  <RateWork orderId={p.orderId} onRated={() => setRated(true)} />
                  <button onClick={() => onReload()} style={{ marginTop: 8, background: 'none', border: 'none', padding: 0, fontSize: 11.5, fontWeight: 600, color: C.mute, cursor: 'pointer', textDecoration: 'underline' }}>
                    {rated ? 'Continue' : 'Skip for now'}
                  </button>
                </div>
              )}
              {n.key === 'ok' && n.state === 'done' && !rateAfterApprove && p.myStars != null && (
                <div style={{ fontSize: 11.5, color: C.mute, marginTop: 4 }}>You rated this work {p.myStars}/5.</div>
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
  // "Ready for you" is a DOOR, not a label: the approve buttons live in the inbox, and this
  // row used to say ready with nothing to tap (the sim's Omar found the inbox by luck).
  const Row = p.stage === 'ready_for_you' ? 'a' : 'div'
  const rowLink = p.stage === 'ready_for_you' ? { href: '/dashboard/inbox', style: { textDecoration: 'none' } } : {}
  return (
    <Row {...rowLink} style={{ display: 'flex', alignItems: 'center', gap: 10, background: C.bg, border: 'none', borderRadius: 12, padding: '10px 12px', opacity: p.stage === 'dropped' ? 0.7 : 1, textDecoration: 'none', color: 'inherit', cursor: p.stage === 'ready_for_you' ? 'pointer' : undefined }}>
      <span style={{ display: 'grid', placeItems: 'center', width: 28, height: 28, borderRadius: 8, background: C.greenSoft, flexShrink: 0 }}><ChannelIcon size={14} color={C.greenDk} /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.label}</div>
        <div style={{ fontSize: 11, color: C.mute, textTransform: 'capitalize' }}>{friendlyType(p.channel)}{p.who !== 'Your team' ? ` · ${p.who}` : ''}{creatorRatingChip(p) ? <span style={{ textTransform: 'none', color: C.amberFg }}> · {creatorRatingChip(p)}</span> : ''}</div>
      </div>
      {p.readoutValue ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span style={{ width: 6, height: 6, borderRadius: 99, background: vColor }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: C.ink }}>{p.readoutValue}</span>
          {p.postLink && <a href={p.postLink} target="_blank" rel="noopener noreferrer" style={{ color: C.greenDk }}><ExternalLink size={12} /></a>}
        </div>
      ) : (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: p.stage === 'ready_for_you' ? C.amberFg : C.mute }}>{p.stage === 'ready_for_you' ? 'Ready for you. Tap to approve' : label}</span>
          {p.postLink && (p.stage === 'posted' || p.stage === 'gathering') && <a href={p.postLink} target="_blank" rel="noopener noreferrer" style={{ color: C.greenDk }}><ExternalLink size={12} /></a>}
        </span>
      )}
    </Row>
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
