'use client'

/**
 * CampaignWork — the "On the way" order tracker for a shipped campaign, with every item AT ITS OWN
 * STAGE: Order received (real shipped_at) -> your part (real readiness) -> Setting up (setup-class
 * services) -> Being made (content pieces + creative services) -> a real terminal: Live and running
 * (ongoing services), Going live (content-only, real posted counts) or Live (nothing ongoing). Each
 * stage carries its items (first 3 visible, the rest one tap) and its own estimate from that class's
 * turnaround window. Honest rules: the only real timestamps are shipped_at + the pieces' own stages;
 * service flips are window ESTIMATES (footnote says so); dropped pieces never count as "out"; ONE
 * current dot = the first unfinished stage. The page FREEZES (stages gray, no dates) only in the setup
 * phase — leftover setup after work has started shows as a non-freezing amber strip instead, and a
 * done campaign never demands setup. Posted pieces live in Results, never here.
 */
import { useState } from 'react'
import { Check, ChevronRight, ClipboardList, BadgeCheck, Wrench, Film, RefreshCw, Send, MessageCircle } from 'lucide-react'
import { C, DISPLAY, EYEBROW, AMBER_GRAD, SHADOW_CARD, SHADOW_HERO } from '@/components/campaigns/ui'
import { serviceView, type ServiceView } from '@/lib/campaigns/tracker/journey'
import { turnaroundFor } from '@/lib/campaigns/data/service-turnaround'
import { serviceClassWindowDays, type ShippedPhase } from '@/lib/campaigns/view'
import { PieceCompactRow, piecePrio, fmtShort } from './piece-tracker'
import { setupOwed, type ReadinessReport } from '@/lib/campaigns/readiness-types'
import type { GoLiveEstimate } from '@/lib/campaigns/aggregate-golive'
import type { LineItem } from '@/lib/campaigns/types'
import type { TrackerPiece } from '@/lib/campaigns/tracker/types'

type LIcon = typeof Check
type NodeState = 'done' | 'current' | 'future'
type Node = { key: string; title: string; sub: string; state: NodeState; Icon: LIcon; amber?: boolean; pulse?: boolean; rows?: React.ReactNode[] }

function svcClass(it: LineItem): 'setup' | 'creative' | 'recurring' | 'other' {
  const t = it.serviceId ? turnaroundFor(it.serviceId) : undefined
  return t?.class ?? 'other'
}

export default function CampaignWork({ pieces, nowPieceId, items, goLive, doneSetupIds, shippedAtISO, confirmedAtISO, readiness, phase, progressLabel, whenLine, onFinishSetup, onRequestChange }: {
  pieces: TrackerPiece[]
  nowPieceId: string | null
  items: LineItem[]
  goLive: GoLiveEstimate
  doneSetupIds: string[]
  shippedAtISO: string | null
  /** when a human on the team confirmed the order (real, from /admin/campaign-orders).
   *  null = shipped, still waiting on the team; undefined = pre-feature data (treated as taken on). */
  confirmedAtISO: string | null | undefined
  readiness: ReadinessReport | null
  phase: ShippedPhase
  /** "2 of 5 done" — shown in the hero header while making (the Now card owns it in live/done). */
  progressLabel?: string
  /** the one honest when-line ("Next piece goes live Jul 8"), shown under the hero title. */
  whenLine?: string | null
  onFinishSetup: () => void
  onRequestChange: () => void
}) {
  const [nowMs] = useState(() => Date.now())   // one clock reading per mount keeps render pure
  const doneSet = new Set(doneSetupIds)
  // setup already in place (Google connected...) never re-shows as pending — same rule aggregateGoLive uses.
  // Owner-run lines (producer 'diy', the free self-serve gbp version) are NOT team work: the readiness
  // page owns them as the owner's own task. Showing one here would frame it as "your team setting up",
  // and (since the class-window math skips diy) would strand a finished owner-run campaign at a
  // forever-current "Setting up" node.
  const services = items.filter((it) => it.included && !it.optOut && it.producer !== 'diy' && !(it.serviceId && doneSet.has(it.serviceId)))

  // Real SETUP owed (null = readiness unknown while the page itself says setup is owed).
  const owed: number | null = readiness ? setupOwed(readiness).length : phase === 'setup' ? null : 0
  // FROZEN only in the setup phase: stages gray, no dates. In any phase the pulsing button below is
  // the ONE setup door. A done campaign never demands setup.
  const frozen = phase === 'setup'
  const hadSetup = (readiness?.total ?? 0) > 0

  // ── the stage buckets: every item at its own stage; dropped pieces are OUT of the flow (they show
  //    as "Stopped" in Results) and never count as posted ──
  const setupSvcs = services.filter((it) => svcClass(it) === 'setup')
  const creativeSvcs = services.filter((it) => svcClass(it) === 'creative')
  const runningSvcs = services.filter((it) => svcClass(it) === 'recurring' || svcClass(it) === 'other')
  const unposted = pieces.filter((p) => p.stage !== 'posted' && p.stage !== 'gathering' && p.stage !== 'dropped')
  const makingRows = unposted.filter((p) => p.id !== nowPieceId).sort((a, b) => piecePrio(b) - piecePrio(a))
  const postedCount = pieces.filter((p) => p.stage === 'posted' || p.stage === 'gathering').length
  const liveTotal = pieces.filter((p) => p.stage !== 'dropped').length

  // The ONE setup door: a loud, pulsing button below the timeline — it has to pop, because the spine
  // does not move until the owner's part is done. Shows in every phase but done.
  const needsYou = (owed === null || owed > 0) && phase !== 'done'
  const needsYouButton = needsYou ? (
    <button onClick={onFinishSetup} className="cw-pulseAmber cw-press" style={{ marginTop: 12, width: '100%', minHeight: 58, borderRadius: 12, border: 'none', cursor: 'pointer', background: AMBER_GRAD, color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
      <span style={{ fontSize: 15, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        We need {typeof owed === 'number' && owed > 0 ? `${owed} ${owed === 1 ? 'thing' : 'things'}` : 'a few things'} from you <ChevronRight size={17} />
      </span>
      <span style={{ fontSize: 11.5, opacity: 0.92 }}>Finish this so the timeline keeps moving</span>
    </button>
  ) : null

  if (!services.length && !pieces.length) {
    return needsYouButton ? <div style={{ marginTop: 24 }}>{needsYouButton}</div> : null
  }

  // ── one clock: per-stage upper-bound windows from shipped_at ──
  const shippedMs = shippedAtISO ? new Date(shippedAtISO).getTime() : NaN
  const haveClock = !isNaN(shippedMs)
  const elapsed = haveClock ? (nowMs - shippedMs) / 86400000 : 0
  const stageDate = (calDays: number) => (haveClock && calDays > 0 ? fmtShort(new Date(shippedMs + calDays * 86400000).toISOString()) : '')
  const pastWindow = (calDays: number) => haveClock && calDays > 0 && elapsed >= calDays
  const setupDays = serviceClassWindowDays(services, 'setup')
  const creativeDays = serviceClassWindowDays(services, 'creative')
  const startByDays = serviceClassWindowDays(services, 'recurring')

  // ── stage completion: real piece stages beat estimates; a posted piece proves production was
  //    reached even when the clock is missing ──
  const setupStageDone = !frozen && (setupSvcs.length === 0 || pastWindow(setupDays) || postedCount > 0)
  const makingStageDone = !frozen && unposted.length === 0 && (creativeSvcs.length === 0 || pastWindow(creativeDays) || !haveClock)
  const postingDone = liveTotal > 0 && postedCount === liveTotal

  // A human confirming the order is REAL (confirmed_at, stamped from /admin/campaign-orders). A
  // posted piece proves the team took it on even if the button was never tapped, and pre-feature
  // campaigns (undefined) never regress to "waiting" — reality wins over the missing tap.
  const confirmedDone = confirmedAtISO !== null || postedCount > 0

  // ── the sequence, decided before any node renders: one current dot = the first unfinished stage;
  //    frozen (setup phase) or an unconfirmed order keeps every stage future. Every plan shape has a
  //    terminal, so nothing strands. ──
  const halted = frozen || !confirmedDone
  const hasSetupNode = setupSvcs.length > 0
  const hasMakingNode = unposted.length > 0 || creativeSvcs.length > 0
  const terminal: 'running' | 'posting' | 'ready' = runningSvcs.length > 0 ? 'running' : pieces.length > 0 ? 'posting' : 'ready'
  const order: string[] = [...(hasSetupNode ? ['setup'] : []), ...(hasMakingNode ? ['making'] : []), terminal]
  const complete: Record<string, boolean> = { setup: setupStageDone, making: makingStageDone, running: false, posting: postingDone, ready: false }
  const currentKey = halted ? null : order.find((k) => !complete[k]) ?? order[order.length - 1]
  const stateOf = (k: string): NodeState => {
    if (halted) return 'future'
    if (k === currentKey) return 'current'
    if (complete[k]) return 'done'
    return order.indexOf(k) < order.indexOf(currentKey!) ? 'done' : 'future'
  }

  const svcRow = (it: LineItem, word?: string, hideEta?: boolean) => <ServiceCard key={it.id} line={it} word={word} hideEta={hideEta} />
  const nodes: Node[] = [
    { key: 'received', title: 'Order received', sub: haveClock ? `Sent to your team · ${fmtShort(shippedAtISO)}` : 'Sent to your team', state: 'done', Icon: ClipboardList },
  ]
  if (frozen) {
    nodes.push({ key: 'you', title: 'A few things from you', sub: typeof owed === 'number' && owed > 0 ? `${owed} to finish` : 'Finish the setup so we can move', state: 'current', Icon: ClipboardList, amber: true })
  } else if (hadSetup && owed === 0) {
    nodes.push({ key: 'you', title: 'Your part is done', sub: 'Nothing waiting on you', state: 'done', Icon: ClipboardList })
  }
  // Order confirmed sits after the owner's part; its dot PULSES until a human confirms it, so an
  // unconfirmed order is visibly the thing everyone is waiting on.
  nodes.push({
    key: 'confirmed', title: 'Order confirmed',
    sub: confirmedAtISO ? `Confirmed · ${fmtShort(confirmedAtISO)}` : confirmedDone ? 'Your team took it on' : 'Your team is looking it over now',
    state: confirmedDone ? 'done' : frozen ? 'future' : 'current', Icon: BadgeCheck, pulse: !confirmedDone,
  })
  if (hasSetupNode) {
    const st = stateOf('setup')
    nodes.push({
      key: 'setup', title: 'Setting up',
      sub: frozen ? 'We start what we can while we wait'
        : st === 'current' && stageDate(setupDays) && !pastWindow(setupDays) ? `${setupSvcs.length} ${setupSvcs.length === 1 ? 'service' : 'services'} · done around ${stageDate(setupDays)}`
        : `${setupSvcs.length} ${setupSvcs.length === 1 ? 'service' : 'services'}`,
      state: st, Icon: Wrench, rows: setupSvcs.map((it) => svcRow(it)),
    })
  }
  if (hasMakingNode) {
    const st = stateOf('making')
    const parts: string[] = []
    if (unposted.length) parts.push(`${unposted.length} ${unposted.length === 1 ? 'piece' : 'pieces'}`)
    if (creativeSvcs.length) parts.push(`${creativeSvcs.length} ${creativeSvcs.length === 1 ? 'service' : 'services'}`)
    const d = !frozen && st === 'current' && creativeSvcs.length > 0 && !pastWindow(creativeDays) ? stageDate(creativeDays) : ''
    nodes.push({
      key: 'making', title: 'Creatives',
      sub: parts.join(' · ') + (d ? (unposted.length > 0 ? ` · services ready around ${d}` : ` · ready around ${d}`) : ''),
      state: st, Icon: Film,
      rows: [...makingRows.map((p) => <PieceCompactRow key={p.id} p={p} />), ...creativeSvcs.map((it) => svcRow(it))],
    })
  }
  if (terminal === 'running') {
    const st = stateOf('running')
    nodes.push({
      key: 'running', title: 'Live and running',
      sub: frozen ? 'Soon after your part is done' : st === 'current' ? 'Keeping it going for you' : stageDate(startByDays) && !pastWindow(startByDays) ? `Starts by ${stageDate(startByDays)}` : 'Your team confirms the date',
      state: st, Icon: RefreshCw,
      // row words follow the node: never a green "Running" under a gray or frozen stage
      rows: runningSvcs.map((it) => svcRow(it, st === 'current' ? 'Running' : 'Starts soon', svcClass(it) === 'other')),
    })
  } else if (terminal === 'posting') {
    nodes.push({
      key: 'posting', title: 'Going live',
      sub: postedCount > 0 ? `${postedCount} of ${liveTotal} out · results below` : liveTotal === 0 ? 'Stopped · results below' : 'Each piece posts on its date',
      state: stateOf('posting'), Icon: Send,
    })
  } else {
    const st = stateOf('ready')
    nodes.push({
      key: 'ready', title: 'Live',
      sub: frozen ? 'Soon after your part is done' : st === 'current' ? 'Everything is in place' : 'Once the work above is done',
      state: st, Icon: Send,
    })
  }

  return (
    <div style={{ marginTop: 24 }}>
      {/* THE hero: the timeline is the page's main event while work is in flight */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: whenLine ? 2 : 10 }}>
        <div style={phase === 'live' || phase === 'done' ? EYEBROW : { fontFamily: DISPLAY, fontWeight: 600, fontSize: 20, letterSpacing: '-.01em', color: C.ink }}>On the way</div>
        {progressLabel && <span style={{ fontSize: 13, fontWeight: 600, color: C.mute, fontVariantNumeric: 'tabular-nums' }}>{progressLabel}</span>}
      </div>
      {whenLine && <div style={{ fontSize: 13, fontWeight: 600, color: C.greenDk, marginBottom: 10 }}>{whenLine}</div>}
      <div style={phase === 'setup' || phase === 'production'
        ? { background: 'linear-gradient(180deg, rgba(74,189,152,0.05) 0%, rgba(255,255,255,0) 90px), #fff', border: '1px solid rgba(74,189,152,0.28)', borderRadius: 18, padding: 18, boxShadow: SHADOW_HERO }
        : { background: '#fff', border: `1px solid ${C.line}`, borderRadius: 18, padding: 18, boxShadow: SHADOW_CARD }}>
        {nodes.map((n, i, arr) => {
          const last = i === arr.length - 1
          return (
            <div key={n.key} style={{ display: 'flex', gap: 13 }}>
              <div style={{ position: 'relative', width: 34, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
                <TimelineDot state={n.state} Icon={n.Icon} amber={n.amber} pulse={n.pulse} />
                {!last && <div style={{ position: 'absolute', left: 16, top: 34, bottom: -6, width: 2, background: n.state === 'done' ? (arr[i + 1].state === 'done' ? C.green : 'linear-gradient(180deg,#4abd98 0%,#e6e6ea 100%)') : C.line }} />}
              </div>
              <div style={{ paddingBottom: last ? 0 : 18, minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: n.state === 'future' ? 500 : 600, color: n.amber ? C.amberFg : n.state === 'future' ? C.mute : C.ink }}>{n.title}</div>
                <div style={{ fontSize: 11.5, color: n.amber ? C.amberFg : C.mute, opacity: n.amber ? 0.85 : 1, marginTop: 1 }}>{n.sub}</div>
                {n.rows && n.rows.length > 0 && <NodeRows rows={n.rows} />}
              </div>
            </div>
          )
        })}
        <button onClick={onRequestChange} className="cw-press" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 14, height: 44, padding: '0 13px', borderRadius: 10, border: `1px solid ${C.line}`, cursor: 'pointer', background: '#fff', color: C.greenDk, fontSize: 13, fontWeight: 600 }}>
          <MessageCircle size={13} /> Request a change
        </button>
      </div>
      {needsYouButton}
      <div style={{ fontSize: 11, color: C.mute, marginTop: 8, lineHeight: 1.45 }}>
        {goLive.gates.length > 0 && <>{goLive.gates.join(' ')} </>}Estimated. Your team confirms the real dates.
      </div>
    </div>
  )
}

/** A stage's items: all tucked behind one tap, so the spine stays clean by default. */
function NodeRows({ rows }: { rows: React.ReactNode[] }) {
  return (
    <details className="cw-det" style={{ marginTop: 6 }}>
      <summary style={{ cursor: 'pointer', listStyle: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: C.greenDk, padding: '8px 0', margin: '-4px 0' }}>
        <ChevronRight size={14} className="cw-chev" /> {rows.length === 1 ? 'See it' : `See all ${rows.length}`}
      </summary>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>{rows}</div>
    </details>
  )
}

function TimelineDot({ state, Icon, amber, pulse }: { state: NodeState; Icon: LIcon; amber?: boolean; pulse?: boolean }) {
  if (state === 'done') return <span style={{ display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: 99, background: C.green, color: '#fff' }}><Check size={17} strokeWidth={2.8} /></span>
  if (state === 'current') return <span className={amber ? 'cw-pulseAmber' : pulse ? 'cw-pulseGreen' : 'cw-breathe'} style={{ display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: 99, background: amber ? C.amberBg : C.greenSoft, border: `2px solid ${amber ? C.amberDot : C.green}`, color: amber ? C.amberFg : C.greenDk, boxSizing: 'border-box' }}><Icon size={16} /></span>
  // a pulsing FUTURE dot = "everyone is waiting on this" (an unconfirmed order behind the owner's part)
  return <span className={pulse ? 'cw-pulseGreen' : undefined} style={{ display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: 99, background: '#fff', border: `1.5px solid ${pulse ? C.green : C.line}`, color: pulse ? C.greenDk : C.faint, boxSizing: 'border-box' }}><Icon size={16} /></span>
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div style={{ ...EYEBROW, marginBottom: 10 }}>{children}</div>
}

/** One service: name + what it does, a status word + the real turnaround ETA on the right. `word`
 *  overrides the class-derived status so a row never claims more than its node (e.g. "Starts soon"
 *  under a future "Live and running"); hideEta drops the ETA for services with no turnaround data
 *  (never the placeholder). Icon is green only when the word is "Running". */
function ServiceCard({ line, word, hideEta }: { line: LineItem; word?: string; hideEta?: boolean }) {
  const v: ServiceView = serviceView(line)
  const shown = word ?? v.statusWord
  const running = shown === 'Running'
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: C.bg, borderRadius: 12, padding: '10px 12px' }}>
      <span style={{ width: 18, height: 18, borderRadius: 99, background: running ? C.greenSoft : '#fff', color: running ? C.greenDk : C.faint, display: 'grid', placeItems: 'center', flexShrink: 0, marginTop: 1 }}><Check size={11} strokeWidth={3} /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{v.name}</div>
        {v.does && <div style={{ fontSize: 11.5, color: C.mute, marginTop: 1, lineHeight: 1.4 }}>{v.does}</div>}
      </div>
      <div style={{ flexShrink: 0, textAlign: 'right' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: running ? C.greenDk : C.mute }}>{shown}</div>
        {!hideEta && <div style={{ fontSize: 10.5, color: C.faint, marginTop: 2, whiteSpace: 'nowrap' }}>{v.etaLabel}</div>}
      </div>
    </div>
  )
}
