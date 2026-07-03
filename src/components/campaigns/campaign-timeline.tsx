'use client'

/**
 * CampaignTimeline — the campaign's lifecycle spine, the visible backbone of a shipped campaign. It tells
 * the whole story on real dates: Shipped, then every piece with BOTH its "draft for your OK" date
 * (deriveSchedule.draftReadyISO) and its post date (postISO), then a results destination. "Done" is
 * COUNT-based (the earliest N beats where N = posted count), never a fragile per-beat join, so it never
 * marks the wrong node. Planned dates read planned and dim; a posted node is a green check with no
 * fabricated actual date (exact posted dates live per-piece in the results card).
 */

import { Check } from 'lucide-react'
import { C } from '@/components/campaigns/ui'
import type { DerivedSchedule } from '@/lib/campaigns/schedule'

const AMBER_FG = '#9a5a00'
const AMBER_BG = 'rgba(245,170,70,0.14)'

function fmtShort(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

type PieceState = 'done' | 'next' | 'planned'
type Row =
  | { key: string; kind: 'shipped'; title: string; date: string }
  | { key: string; kind: 'piece'; state: PieceState; title: string; channel?: string; okDate: string; postLabel: string; postFuture: boolean }
  | { key: string; kind: 'results'; ready: boolean; value: string | null }

export default function CampaignTimeline({ shippedAtISO, sched, postedCount, anyData, resultValue }: {
  shippedAtISO: string | null
  sched: DerivedSchedule
  postedCount: number
  anyData: boolean
  resultValue: string | null
}) {
  const now = new Date()
  const todayISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  // Date-ordered beats so the earliest-posted-first, count-based "done" is correct.
  const beats = [...sched.beats].sort((a, b) => (a.postISO || '').localeCompare(b.postISO || ''))
  const done = Math.max(0, Math.min(postedCount, beats.length))
  const nextIdx = done < beats.length ? done : -1
  const nextBeat = nextIdx >= 0 ? beats[nextIdx] : null
  const nextFuture = nextBeat ? (nextBeat.postISO || '') >= todayISO : false

  const nextLine = nextBeat
    ? (nextFuture ? `Next: ${nextBeat.label} posts ${nextBeat.postLabel}` : `Next: ${nextBeat.label}, posting soon`)
    : (beats.length > 0 && done >= beats.length)
      ? 'All your pieces are out.'
      : sched.firstDraftLabel ? `Next draft for your OK around ${sched.firstDraftLabel}` : ''

  const rows: Row[] = []
  if (shippedAtISO) rows.push({ key: 'shipped', kind: 'shipped', title: 'Shipped', date: fmtShort(shippedAtISO) })
  beats.forEach((b, i) => {
    const state: PieceState = i < done ? 'done' : i === nextIdx ? 'next' : 'planned'
    rows.push({ key: `b${i}`, kind: 'piece', state, title: b.label, channel: b.channel, okDate: fmtShort(b.draftReadyISO), postLabel: b.postLabel, postFuture: (b.postISO || '') >= todayISO })
  })
  // A GBP-led / no-content-beats campaign gets one honest "running" node instead of an empty middle.
  if (!beats.length && shippedAtISO) rows.push({ key: 'running', kind: 'piece', state: 'done', title: 'Running', channel: undefined, okDate: '', postLabel: '', postFuture: false })
  if (shippedAtISO) rows.push({ key: 'results', kind: 'results', ready: anyData && !!resultValue, value: resultValue })
  if (!rows.length) return null

  const reached = (r: Row) => r.kind === 'shipped' || (r.kind === 'piece' && r.state === 'done') || (r.kind === 'results' && r.ready)

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: C.faint, marginBottom: 4 }}>The journey</div>
      {nextLine && <div style={{ fontSize: 12.5, color: C.mute, marginBottom: 3 }}>{nextLine}</div>}
      {done === 0 && beats.length > 0 && <div style={{ fontSize: 11.5, color: C.faint, marginBottom: 12 }}>Nothing posts until you approve each draft.</div>}
      {done > 0 && <div style={{ marginBottom: 12 }} />}
      {sched.mode === 'estimate' && <div style={{ fontSize: 11, color: AMBER_FG, background: AMBER_BG, borderRadius: 8, padding: '6px 9px', marginBottom: 10, lineHeight: 1.4 }}>These dates are estimates. Set a go live date to lock them.</div>}
      {sched.tooSoon && <div style={{ fontSize: 11, color: AMBER_FG, background: AMBER_BG, borderRadius: 8, padding: '6px 9px', marginBottom: 10, lineHeight: 1.4 }}>That date is sooner than the team can produce these. Pick a later go live date.</div>}

      <div>
        {rows.map((r, i) => {
          const last = i === rows.length - 1
          const lineSolid = reached(r)
          const dotKind = r.kind === 'shipped' ? 'done' : r.kind === 'results' ? (r.ready ? 'done' : 'planned') : r.state
          return (
            <div key={r.key} style={{ display: 'flex', gap: 12 }}>
              <div style={{ position: 'relative', width: 18, flexShrink: 0 }}>
                <Dot kind={dotKind} />
                {!last && <div style={{ position: 'absolute', left: 8, top: 17, bottom: -5, width: 2, background: lineSolid ? C.green : C.line }} />}
              </div>
              <div style={{ paddingBottom: last ? 0 : 18, minWidth: 0, flex: 1 }}>{rowBody(r)}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function rowBody(r: Row) {
  if (r.kind === 'shipped') {
    return (
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>Shipped</div>
        <div style={{ fontSize: 11.5, color: C.mute, marginTop: 1 }}>{r.date}</div>
      </div>
    )
  }
  if (r.kind === 'results') {
    return (
      <div style={{ opacity: r.ready ? 1 : 0.72 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: C.ink }}>{r.ready ? 'Results are in' : 'Results'}</div>
        <div style={{ fontSize: 11.5, color: r.ready ? C.greenDk : C.mute, marginTop: 1 }}>{r.ready ? r.value : 'Reach and engagement land a few days after each piece posts.'}</div>
      </div>
    )
  }
  // piece
  const titleRow = (
    <div style={{ fontSize: 13, fontWeight: r.state === 'next' ? 700 : 500, color: r.state === 'next' ? C.greenDk : C.ink }}>
      {r.title}{r.channel && <span style={{ color: r.state === 'next' ? C.greenDk : C.faint, fontWeight: 400, opacity: r.state === 'next' ? 0.85 : 1 }}> · {r.channel}</span>}
    </div>
  )
  if (r.state === 'done') {
    return (
      <div>
        {titleRow}
        <div style={{ fontSize: 11.5, color: C.greenDk, marginTop: 1 }}>Posted</div>
      </div>
    )
  }
  // next / planned share the two-date sub (draft for OK, then posts)
  const sub = (
    <div style={{ marginTop: 3, display: 'flex', flexDirection: 'column', gap: 1 }}>
      {r.okDate && <div style={{ fontSize: 11.5, color: r.state === 'next' ? C.greenDk : C.mute }}>Draft for your OK · {r.okDate}</div>}
      <div style={{ fontSize: 11.5, color: r.state === 'next' ? C.greenDk : C.mute }}>{r.postFuture ? `Posts · ${r.postLabel}` : 'Posting soon'}</div>
    </div>
  )
  if (r.state === 'next') {
    return <div style={{ background: C.greenSoft, borderRadius: 10, padding: '8px 11px' }}>{titleRow}{sub}</div>
  }
  return <div style={{ opacity: 0.72 }}>{titleRow}{sub}</div>
}

function Dot({ kind }: { kind: PieceState }) {
  if (kind === 'done') {
    return <span style={{ display: 'grid', placeItems: 'center', width: 17, height: 17, borderRadius: 99, background: C.green, color: '#fff' }}><Check size={11} strokeWidth={3} /></span>
  }
  if (kind === 'next') {
    return <span style={{ display: 'block', width: 17, height: 17, borderRadius: 99, background: C.greenSoft, border: `2px solid ${C.green}`, boxSizing: 'border-box' }} />
  }
  return <span style={{ display: 'block', width: 13, height: 13, margin: '2px', borderRadius: 99, background: '#fff', border: '2px solid #c8c8cf', boxSizing: 'border-box' }} />
}
