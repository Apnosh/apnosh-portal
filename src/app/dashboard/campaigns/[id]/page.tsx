'use client'

/**
 * /dashboard/campaigns/[id] — the campaign's lifecycle surface.
 * Shows the complete plan as transparent, editable plays, the honest bill,
 * and a path-aware gate: DIY/AI self-ship; the strategist path sits in review
 * ("Apnosh is building this") until the owner taps Approve & ship. Edits
 * persist via PATCH; nothing is charged until a piece ships.
 */
import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Loader2, Trash2, Rocket, Check, CalendarDays, Users, FileText, Ban, Filter } from 'lucide-react'
import { playsFrom } from '@/lib/campaigns/plays'
import { type LineItem, type OptOutReason } from '@/lib/campaigns/types'
import { deriveSchedule } from '@/lib/campaigns/schedule'
import { aggregateGoLive } from '@/lib/campaigns/aggregate-golive'
import { reconcileBeatsToLines } from '@/lib/campaigns/catalog'
import { vibeForCampaign, creativeRolesForCampaign } from '@/lib/campaigns/creators'
import { planCampaignPieces } from '@/lib/campaigns/work-orders-core'
import { shippedStatus, ownerSetupComplete, servicesSettingUp, ownerRunWorkDone, type SavedCampaign, type CampaignProgress } from '@/lib/campaigns/view'
import { AUDIENCES, CHANNELS } from '@/lib/campaigns/data/campaign-templates'
import PlayCard from '@/components/campaigns/play-card'
import LineCard from '@/components/campaigns/line-card'
import CreatorsCard from '@/components/campaigns/creators-card'
import CreativeControl from '@/components/campaigns/creative-control'
import HonestBillBar from '@/components/campaigns/honest-bill-bar'
import CampaignNowCard from '@/components/campaigns/campaign-now-card'
import CampaignResults, { hasResults } from '@/components/campaigns/campaign-results'
import CampaignWork from '@/components/campaigns/tracker/campaign-work'
import CampaignTeamCard from '@/components/campaigns/campaign-team-card'
import ContactSupport from '@/components/campaigns/contact-support'
import { fmtShort } from '@/components/campaigns/tracker/piece-tracker'
import ActivityFeed from '@/components/campaigns/tracker/activity-feed'
import type { CampaignOutcomes } from '@/lib/campaigns/outcomes/verdict'
import type { TrackerPiece, ActivityEvent } from '@/lib/campaigns/tracker/types'
import type { ReadinessReport } from '@/lib/campaigns/readiness-types'
import { C, DISPLAY, GRAD, SHADOW_CARD, EYEBROW } from '@/components/campaigns/ui'
import MotionStyles from '@/components/campaigns/motion-styles'

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [camp, setCamp] = useState<SavedCampaign | null>(null)
  const [progress, setProgress] = useState<CampaignProgress | null>(null)
  const [outcomes, setOutcomes] = useState<CampaignOutcomes | null>(null)
  const [pieces, setPieces] = useState<TrackerPiece[]>([])
  const [activity, setActivity] = useState<ActivityEvent[]>([])
  const [readiness, setReadiness] = useState<ReadinessReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Ship-only failure, shown inline over the footer (the footer's Ship button is the retry).
  const [shipError, setShipError] = useState<string | null>(null)

  // One reload for everything — the tracker re-fetches this after an approve/changes so the merged
  // pieces + activity re-derive server-side (never a client-side re-merge; the payload lacks join keys).
  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/campaigns/${id}`)
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Load failed (${r.status})`)
      const j = await r.json()
      setCamp(j.campaign as SavedCampaign)
      setProgress((j.progress as CampaignProgress) ?? null)
      setOutcomes((j.outcomes as CampaignOutcomes) ?? null)
      setPieces((j.pieces as TrackerPiece[]) ?? [])
      setActivity((j.activity as ActivityEvent[]) ?? [])
      setReadiness((j.readiness as ReadinessReport) ?? null)
    } catch (e) { setError(e instanceof Error ? e.message : 'Load failed') }
  }, [id])
  useEffect(() => { load() }, [load])

  function patchItems(items: LineItem[]) {
    if (!camp) return
    setCamp({ ...camp, draft: { ...camp.draft, items } })  // optimistic
    fetch(`/api/campaigns/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) }).catch(() => {})
  }
  const mutate = (fn: (items: LineItem[]) => LineItem[]) => { if (camp) patchItems(fn(camp.draft.items)) }
  const toggleOptOut = (lid: string, r: OptOutReason) => mutate((items) => items.map((x) => (x.id === lid ? { ...x, optOut: x.optOut === r ? undefined : r } : x)))
  const toggleInclude = (lid: string) => mutate((items) => items.map((x) => (x.id === lid ? { ...x, included: !x.included, optOut: undefined } : x)))
  const remove = (lid: string) => mutate((items) => items.map((x) => (x.id === lid ? { ...x, included: false, optOut: undefined } : x)))
  const setQty = (lid: string, qty: number) => mutate((items) => items.map((x) => (x.id === lid ? { ...x, qty: Math.max(1, qty) } : x)))
  function setStartDate(iso: string) {
    if (!camp) return
    setCamp({ ...camp, draft: { ...camp.draft, targetDate: iso || undefined } })  // optimistic
    fetch(`/api/campaigns/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { target_date: iso } }) }).catch(() => {})
  }
  async function chooseCreator(discipline: string, creatorId: string) {
    if (!camp) return
    const prev = camp.creatorChoices ?? {}
    const next = { ...prev, [discipline]: creatorId }
    setCamp({ ...camp, creatorChoices: next })  // optimistic
    const r = await fetch(`/api/campaigns/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { creator_choices: next } }) }).catch(() => null)
    if (!r || !r.ok) {
      // Don't lie about a saved pick: roll back so the card shows the real
      // state. Ship also re-sends choices, so the last-seen pick still wins.
      setCamp((c) => (c ? { ...c, creatorChoices: prev } : c))
      if (typeof window !== 'undefined') window.alert('Could not save your creator pick. Check your connection and try again.')
    }
  }
  async function setCreativeControl(mode: string) {
    if (!camp) return
    const prev = camp.creativeControl
    setCamp({ ...camp, creativeControl: mode as SavedCampaign['creativeControl'] })  // optimistic
    const r = await fetch(`/api/campaigns/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { creative_control: mode } }) }).catch(() => null)
    if (!r || !r.ok) {
      setCamp((c) => (c ? { ...c, creativeControl: prev } : c))
      if (typeof window !== 'undefined') window.alert('Could not save that. Check your connection and try again.')
    }
  }
  // Per-piece producer: who makes this piece, the in-house team or its creator.
  // Send only the delta (the PATCH merges + caps it) and roll back on failure.
  async function setProducer(key: string, producer: 'team' | 'creator') {
    if (!camp) return
    const prev = camp.producerChoices ?? {}
    if (prev[key] === producer) return
    setCamp({ ...camp, producerChoices: { ...prev, [key]: producer } })  // optimistic
    const r = await fetch(`/api/campaigns/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { producer_choices: { [key]: producer } } }) }).catch(() => null)
    if (!r || !r.ok) {
      setCamp((c) => (c ? { ...c, producerChoices: prev } : c))
      if (typeof window !== 'undefined') window.alert('Could not save who makes this piece. Check your connection and try again.')
    }
  }

  async function ship() {
    if (!camp) return
    setBusy(true); setShipError(null)
    const shippedAt = new Date().toISOString()
    // Re-send the owner's last-seen creator picks so mint dispatches to exactly
    // who they chose, even if an incremental save earlier failed.
    const r = await fetch(`/api/campaigns/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { status: 'shipped', phase: 'monitor', shipped_at: shippedAt, creator_choices: camp.creatorChoices ?? {} } }) }).catch(() => null)
    if (!r || !r.ok) {
      // The status flip never landed: the campaign is still a draft, so no optimistic
      // "shipped" state and no navigation — a false success would hide an unplaced order.
      setShipError("That didn't go through. Nothing was ordered. Try again.")
      setBusy(false)
      return
    }
    setCamp({ ...camp, status: 'shipped', phase: 'monitor', shippedAt })
    setBusy(false)
    // Land on the "Get it ready" checklist (team-run campaigns only — DIY mints
    // no orders, so there's nothing for the team to need from the owner).
    if (camp.draft.path !== 'diy') router.push(`/dashboard/campaigns/${id}/ready`)
    else fetch(`/api/campaigns/${id}`).then((r) => r.json()).then((j) => { setProgress((j.progress as CampaignProgress) ?? null); setOutcomes((j.outcomes as CampaignOutcomes) ?? null) }).catch(() => {})
  }
  async function del() {
    setBusy(true)
    await fetch(`/api/campaigns/${id}`, { method: 'DELETE' }).catch(() => {})
    router.push('/dashboard/campaigns')
  }

  // Terminal stop: nothing new starts or posts; in-flight work finishes and bills.
  async function stop() {
    if (!camp) return
    if (typeof window !== 'undefined' && !window.confirm('Stop this campaign? Nothing new will start or post. Work already being made finishes and bills as normal. This cannot be undone.')) return
    setBusy(true)
    const r = await fetch(`/api/campaigns/${id}/stop`, { method: 'POST' }).catch(() => null)
    setBusy(false)
    if (r && r.ok) { void load() }
    else if (typeof window !== 'undefined') window.alert('Could not stop the campaign. Try again.')
  }

  // 'stopped' renders the shipped-style view (history + settlement), never the draft editor.
  const shipped = camp?.status === 'shipped' || camp?.status === 'stopped'
  const path = camp?.draft.path ?? 'strategist'

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: C.bg, display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 480, background: '#fff', display: 'flex', flexDirection: 'column', boxShadow: '0 0 40px rgba(0,0,0,0.06)', height: '100dvh' }}>
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: `1px solid ${C.line}` }}>
          <button onClick={() => router.push('/dashboard/campaigns')} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: C.mute, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}><ChevronLeft size={18} /> Campaigns</button>
          {camp && !shipped && <button onClick={del} disabled={busy} aria-label="Delete" style={{ background: 'none', border: 'none', color: C.faint, cursor: 'pointer', width: 44, height: 44, display: 'grid', placeItems: 'center', margin: '-13px -13px -13px 0' }}><Trash2 size={18} /></button>}
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '18px 16px 32px', background: 'radial-gradient(120% 300px at 50% 0%, rgba(74,189,152,0.07), rgba(255,255,255,0) 100%)' }}>
          <MotionStyles />
          {error ? <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 18, boxShadow: SHADOW_CARD, padding: '24px 20px', textAlign: 'center', fontSize: 13.5, color: C.red }}>{error}</div>
            : !camp ? (
              <div>
                <div className="cw-skel" style={{ width: 96, height: 24, borderRadius: 99, marginBottom: 12 }} />
                <div className="cw-skel" style={{ width: '70%', height: 28, borderRadius: 8, marginBottom: 6 }} />
                <div className="cw-skel" style={{ width: '50%', height: 14, borderRadius: 7, marginBottom: 18 }} />
                <div className="cw-skel" style={{ width: '100%', height: 120, borderRadius: 18, marginBottom: 14 }} />
                <div className="cw-skel" style={{ width: '100%', height: 280, borderRadius: 18 }} />
              </div>
            )
            : <Detail camp={camp} progress={progress} outcomes={outcomes} pieces={pieces} activity={activity} readiness={readiness} onReload={load} onToggleOptOut={toggleOptOut} onToggleInclude={toggleInclude} onRemove={remove} onSetQty={setQty} onSetStart={setStartDate} onChooseCreator={chooseCreator} onSetCreativeControl={setCreativeControl} onSetProducer={setProducer} onStop={stop} />}
        </div>

        {/* Footer only while a draft: bill + Save/Ship. Once shipped, the header pill + Now card carry the
            state — a third status voice down here would just repeat them. */}
        {camp && !shipped && (
          <>
            <HonestBillBar items={camp.draft.items} note={path === 'strategist' ? 'Approving is free. Each piece bills only when it ships.' : 'Nothing is charged until a piece ships.'} />
            <div style={{ flexShrink: 0, borderTop: `1px solid ${C.line}`, padding: '12px 16px calc(12px + env(safe-area-inset-bottom))', background: '#fff' }}>
              {shipError && <div style={{ fontSize: 12.5, color: C.red, textAlign: 'center', marginBottom: 8 }}>{shipError}</div>}
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => router.push('/dashboard/campaigns')} disabled={busy} style={{ flex: '0 0 auto', minWidth: 104, height: 48, background: '#fff', color: C.ink, border: `1px solid ${C.line}`, borderRadius: 12, padding: '0 14px', fontWeight: 600, fontSize: 15, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>Save draft</button>
                <button onClick={ship} disabled={busy} className="cw-press" style={{ flex: 1, height: 48, background: GRAD, color: '#fff', border: 'none', borderRadius: 12, padding: '0 14px', fontWeight: 600, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: busy ? 0.7 : 1 }}>
                  {busy ? <Loader2 size={17} className="animate-spin" /> : <Rocket size={17} />}
                  {path === 'strategist' ? 'Approve & ship' : path === 'diy' ? 'Schedule it' : 'Ship it'}
                </button>
              </div>
              <div style={{ fontSize: 11.5, color: C.faint, textAlign: 'center', marginTop: 8, lineHeight: 1.4 }}>Saved as a draft already. Save to come back later, or approve to hand it to your team.</div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Detail({ camp, progress, outcomes, pieces, activity, readiness, onReload, onToggleOptOut, onToggleInclude, onRemove, onSetQty, onSetStart, onChooseCreator, onSetCreativeControl, onSetProducer, onStop }: {
  camp: SavedCampaign
  progress: CampaignProgress | null
  outcomes: CampaignOutcomes | null
  pieces: TrackerPiece[]
  activity: ActivityEvent[]
  readiness: ReadinessReport | null
  onReload: () => Promise<void> | void
  onToggleOptOut: (id: string, r: OptOutReason) => void
  onToggleInclude: (id: string) => void
  onRemove: (id: string) => void
  onSetQty: (id: string, qty: number) => void
  onSetStart: (iso: string) => void
  onChooseCreator: (discipline: string, creatorId: string) => void
  onSetCreativeControl: (mode: string) => void
  onSetProducer: (key: string, producer: 'team' | 'creator') => void
  onStop: () => void
}) {
  const router = useRouter()
  const items = camp.draft.items
  const core = items.filter((i) => i.included)
  const recommended = items.filter((i) => !i.included)
  const plays = playsFrom(core)
  const brief = camp.draft.brief
  const stopped = camp.status === 'stopped'
  const shipped = camp.status === 'shipped' || stopped   // stopped renders the shipped-style view
  const inReview = !shipped && camp.phase === 'review'
  const diy = camp.draft.path === 'diy'
  const st = shipped ? shippedStatus(progress, (camp.draft.brief?.contentBeats?.length ?? 0) > 0, ownerSetupComplete(camp), servicesSettingUp(camp), ownerRunWorkDone(camp)) : null

  // One narrator: pick the piece the Now card embeds (a genuinely approvable ready piece first, then in
  // production the top piece), the honest when-line inputs, and hand the same ids to the bands so
  // nothing renders twice. All from data the page already loads.
  const sv = shipped && st ? (() => {
    const now = new Date()
    const todayISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const sched = deriveSchedule({ targetDate: camp.draft.targetDate, occasion: camp.draft.occasion, contentBeats: brief?.contentBeats ?? [] }, todayISO)
    const doneSetupIds = readiness?.doneSetupIds ?? []
    const goLive = aggregateGoLive(core.filter((i) => !i.optOut), sched, todayISO, { doneSetupIds })
    const alive = pieces.filter((p) => p.stage !== 'posted' && p.stage !== 'gathering' && p.stage !== 'dropped')
    // Inline-approvable = ready_for_you (always creator lane) with the order to PATCH. awaitingYou can
    // also count team-lane reviews that have no inline door here — those get the one inbox link instead.
    const readyPieces = pieces.filter((p) => p.stage === 'ready_for_you' && p.canApprove && p.orderId)
    const nowPiece = readyPieces[0] ?? null
    const inboxOwed = Math.max(0, (progress?.awaitingYou ?? 0) - readyPieces.length)
    const nextGoLiveISO = alive.filter((p) => p.goLiveISO).map((p) => p.goLiveISO!).sort()[0] ?? null
    // the timeline hero's header facts (the timeline is the page's main event while making)
    const making = st.phase === 'setup' || st.phase === 'production'
    const hasBeats = (brief?.contentBeats?.length ?? 0) > 0
    const whenLine = making && (progress?.live ?? 0) === 0
      ? (nextGoLiveISO ? `Next piece goes live ${fmtShort(nextGoLiveISO)}` : goLive.phrase && hasBeats ? `First piece live in ${goLive.phrase}.` : null)
      : null
    const progressLabel = making && (progress?.total ?? 0) > 0 ? `${progress!.live} of ${progress!.total} done` : undefined
    return { goLive, doneSetupIds, readyCount: readyPieces.length, nowPiece, inboxOwed, whenLine, progressLabel }
  })() : null

  // Reusable plan pieces — shown expanded while a draft, tucked under "See the full plan" once shipped.
  const playsBlock = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {plays.map((p) => (
        <PlayCard key={p.key} play={p} defaultOpen={false} onToggleOptOut={onToggleOptOut} onToggleInclude={onToggleInclude} onRemove={onRemove} onSetQty={onSetQty} />
      ))}
    </div>
  )
  const creatorsBlock = (
    <CreatorsCard items={core} overrides={camp.creatorChoices ?? {}} vibe={vibeForCampaign(camp.draft.goalKey, camp.draft.occasion)} onChoose={onChooseCreator} />
  )
  const briefBlock = brief ? (
    <div style={{ marginTop: 16, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 18, padding: 16 }}>
      <div style={{ ...EYEBROW, marginBottom: 10 }}>The plan</div>
      {brief.offer && <Row k="Offer" v={brief.offer.label} />}
      <Row k="Goal" v={brief.kpi} />
      <Row k="Who" v={brief.audienceIds.map((a) => AUDIENCES[a]?.label ?? a).join(', ') || '—'} />
      <Row k="Where" v={brief.channelIds.map((c) => CHANNELS[c]?.label ?? c).join(', ') || '—'} />
      {/* The content calendar is draft-only; once shipped, the dated Journey timeline above owns this. */}
      {!shipped && (() => {
        const planBeats = reconcileBeatsToLines(camp.draft.items, brief.contentBeats)
        if (!planBeats.length) return null
        const now = new Date()
        const todayISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
        const sched = deriveSchedule({ targetDate: camp.draft.targetDate, occasion: camp.draft.occasion, contentBeats: planBeats }, todayISO)
        // Per-piece producer routing, aligned 1:1 with sched.beats (same
        // reconcile + schedule). creatorByDisc is the candidate creator we'd
        // hand a piece to if the owner picks "creator", shown on the toggle.
        const pieces = planCampaignPieces(camp, todayISO)
        const roles = creativeRolesForCampaign(core, camp.creatorChoices ?? {}, vibeForCampaign(camp.draft.goalKey, camp.draft.occasion))
        const creatorByDisc = new Map(roles.map((r) => [r.discipline, r.creator]))
        const showProducer = !shipped && !diy
        return (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.line}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, color: C.mute }}><CalendarDays size={13} /> Content calendar</div>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: C.mute }}>
                {sched.mode === 'event' ? 'Toward' : 'Starts'}
                <input type="date" value={(camp.draft.targetDate ?? '').slice(0, 10)} onChange={(e) => onSetStart(e.target.value)} style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: '3px 6px', fontSize: 11, color: C.ink, fontFamily: 'inherit', background: '#fff' }} />
              </label>
            </div>
            {sched.mode === 'estimate' && (
              <div style={{ fontSize: 11, color: C.amberFg, background: C.amberBg, borderRadius: 8, padding: '6px 9px', marginBottom: 8, lineHeight: 1.4 }}>Estimated dates. Pick a start date above to lock the schedule.</div>
            )}
            {sched.beats.map((b, i) => {
              const piece = pieces[i]
              const cand = piece?.discipline ? creatorByDisc.get(piece.discipline) : undefined
              return (
                <div key={i} style={{ padding: '6px 0', borderTop: i === 0 ? 'none' : `1px solid ${C.line}` }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', fontSize: 12.5 }}>
                    <span style={{ flexShrink: 0, width: 86, fontSize: 11.5, fontWeight: 700, color: C.greenDk }}>{b.postLabel}</span>
                    <span style={{ flex: 1, minWidth: 0, color: C.ink }}>{b.label}<span style={{ color: C.faint }}> · {b.relLabel}</span></span>
                    {b.channel && <span style={{ flexShrink: 0, fontSize: 11, color: C.faint }}>{b.channel}</span>}
                  </div>
                  {showProducer && piece && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginTop: 5, paddingLeft: 96 }}>
                      {piece.discipline && cand ? (
                        <>
                          <span style={{ fontSize: 10.5, color: C.faint, flexShrink: 0 }}>Made by</span>
                          <ProducerSeg active={piece.producer === 'team'} onClick={() => onSetProducer(piece.key!, 'team')}>Your team</ProducerSeg>
                          <ProducerSeg active={piece.producer === 'creator'} onClick={() => onSetProducer(piece.key!, 'creator')}>{cand.name}</ProducerSeg>
                        </>
                      ) : (
                        <span style={{ fontSize: 10.5, color: C.faint }}>Made by your team</span>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
            {sched.tooSoon ? (
              <div style={{ fontSize: 11, color: C.amberFg, background: C.amberBg, borderRadius: 8, padding: '6px 9px', marginTop: 9, lineHeight: 1.4 }}>That date is sooner than we can produce these pieces. Pick a later date above to give the team runway.</div>
            ) : (
              <div style={{ fontSize: 11, color: C.mute, marginTop: 9, lineHeight: 1.4 }}>We&rsquo;ll send the first draft for your OK around <b>{sched.firstDraftLabel}</b>. Nothing posts until you approve it.</div>
            )}
          </div>
        )
      })()}
    </div>
  ) : null
  return (
    <div>
      {/* Header pill: the state, named before anything else renders. Draft style unchanged. */}
      {!shipped ? (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: C.bg, color: C.mute, borderRadius: 99, padding: '4px 10px', fontWeight: 700, fontSize: 11, marginBottom: 12 }}>
          <span style={{ width: 6, height: 6, borderRadius: 99, background: C.faint }} />{inReview ? 'In review' : 'Draft'}
        </div>
      ) : st && (() => {
        const pal = st.phase === 'setup' ? { bg: C.amberBg, fg: C.amberFg, dot: C.amberDot }
          : st.phase === 'production' ? { bg: '#eef0ef', fg: C.mute, dot: C.faint }
          : { bg: C.greenSoft, fg: C.greenDk, dot: C.green }
        return (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: pal.bg, color: pal.fg, borderRadius: 99, padding: '4px 10px', fontWeight: 700, fontSize: 11, marginBottom: 12 }}>
            {st.phase === 'done' ? <Check size={11} strokeWidth={3} /> : <span className={st.phase === 'live' ? 'cw-ping' : undefined} style={{ width: 6, height: 6, borderRadius: 99, background: pal.dot }} />}{st.label}
          </div>
        )
      })()}
      <h1 style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 24, margin: '0 0 4px', lineHeight: 1.15, letterSpacing: '-.02em' }}>{camp.draft.name}</h1>
      {brief && <p style={{ fontSize: 13.5, color: C.mute, margin: '0 0 20px' }}>{brief.objective}{!shipped && brief.projected ? ` · ${brief.projected}` : ''}</p>}

      {/* path/lifecycle banner (strategist draft awaiting the owner's OK) */}
      {inReview && camp.draft.path === 'strategist' && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: C.greenSoft, color: C.greenDk, borderRadius: 12, padding: '11px 12px', marginBottom: 14, fontSize: 12.5, fontWeight: 600, lineHeight: 1.45 }}>
          <span style={{ fontSize: 14 }}>◆</span><span>Apnosh is building every piece you kept. Review the plan below, then tap <b>Approve &amp; ship</b> when it looks right. Approving doesn’t charge you.</span>
        </div>
      )}

      {shipped && st && sv ? (
        <div className="cw-stagger">
          {/* stopped: the terminal banner leads — history and billing stay visible below */}
          {stopped && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: '#f4f4f6', color: C.ink, borderRadius: 12, padding: '11px 12px', marginBottom: 14, fontSize: 12.5, fontWeight: 600, lineHeight: 1.45 }}>
              <Ban size={14} style={{ flexShrink: 0, marginTop: 1, color: C.mute }} />
              <span>This campaign is stopped. Nothing new starts or posts. Anything already in flight finished and billed as normal.</span>
            </div>
          )}
          {/* the interrupt/result card: a piece needing your OK (any phase), or the live/done story */}
          {(st.phase === 'live' || st.phase === 'done' || sv.readyCount > 0) && (
            <CampaignNowCard
              diy={diy}
              phase={st.phase}
              progress={progress}
              outcomes={outcomes}
              nowPiece={sv.nowPiece}
              readyCount={sv.readyCount}
              inboxOwed={sv.inboxOwed}
              showResultsButton={hasResults(outcomes, pieces)}
              onNextMove={() => router.push('/dashboard/campaigns/new')}
              onInbox={() => router.push('/dashboard/inbox')}
              onReload={onReload}
            />
          )}
          {/* the ONE home for outcomes — the real target of "See every piece" */}
          <div id="campaign-results"><CampaignResults outcomes={outcomes} pieces={pieces} /></div>
          {/* THE HERO: the timeline, with the pulsing needs-you button right under it */}
          <CampaignWork
            pieces={pieces}
            nowPieceId={sv.nowPiece?.id ?? null}
            items={camp.draft.items}
            goLive={sv.goLive}
            doneSetupIds={sv.doneSetupIds}
            shippedAtISO={camp.shippedAt}
            // tri-state passthrough: undefined means the confirmed_at column doesn't exist yet
            // (pre-migration) and must NOT collapse to null, or every shipped legacy campaign
            // would pulse "looking it over" forever
            confirmedAtISO={camp.confirmedAt}
            readiness={readiness}
            phase={st.phase}
            progressLabel={sv.progressLabel}
            whenLine={sv.whenLine}
            onFinishSetup={() => router.push(`/dashboard/campaigns/${camp.draft.id}/ready`)}
            onRequestChange={() => router.push('/dashboard/messages?to=strategist')}
          />
          {/* who handles everything: Apnosh runs setup, matched creators make the creative — changeable */}
          <CampaignTeamCard camp={camp} onChoose={onChooseCreator} onOpenTeam={() => router.push(`/dashboard/campaigns/${camp.draft.id}/team`)} />
          {/* the order receipt, its own page */}
          <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <LinkRow Icon={Filter} label="See it as a funnel" sub="Where people dropped off, stage by stage" onClick={() => router.push(`/dashboard/campaigns/${camp.draft.id}/results`)} />
            <LinkRow Icon={FileText} label="View order details" sub="Everything you ordered, with prices" onClick={() => router.push(`/dashboard/campaigns/${camp.draft.id}/order`)} />
            {/* terminal stop — quiet by design; the confirm dialog carries the consequences */}
            {!stopped && <LinkRow Icon={Ban} label="Stop this campaign" sub="Nothing new starts or posts. In-flight work finishes and bills." onClick={onStop} />}
          </div>
          {/* the running log of real, timestamped production events */}
          <ActivityFeed events={activity} />
          {/* the bottom escape: a real form that lands in Messages */}
          <ContactSupport campaignName={camp.draft.name} />
        </div>
      ) : (
        <>
          {playsBlock}
          <div style={{ marginTop: 12 }}>
            <LinkRow Icon={Filter} label="See it as a funnel" sub="Add plays stage by stage and watch it respond" onClick={() => router.push(`/dashboard/campaigns/${camp.draft.id}/results`)} />
          </div>
          <CreativeControl value={camp.creativeControl} onChange={onSetCreativeControl} />
          {creatorsBlock}
          {recommended.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <div style={{ ...EYEBROW, marginBottom: 8 }}>Go further</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {recommended.map((it) => <LineCard key={it.id} item={it} onToggleInclude={() => onToggleInclude(it.id)} />)}
              </div>
            </div>
          )}
          {briefBlock}
        </>
      )}
    </div>
  )
}

/** A quiet reference door: icon + label + where it goes, one per row. */
function LinkRow({ Icon, label, sub, onClick }: { Icon: typeof Users; label: string; sub: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="cw-press" style={{ display: 'flex', alignItems: 'center', gap: 11, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: '13px 14px', boxShadow: SHADOW_CARD, cursor: 'pointer', textAlign: 'left', width: '100%' }}>
      <span style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 11, background: C.greenSoft, color: C.greenDk, display: 'grid', placeItems: 'center' }}><Icon size={16} /></span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: C.ink }}>{label}</span>
        <span style={{ display: 'block', fontSize: 11.5, color: C.mute, marginTop: 1 }}>{sub}</span>
      </span>
      <ChevronRight size={16} color={C.faint} style={{ flexShrink: 0 }} />
    </button>
  )
}

function ProducerSeg({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      style={{
        flexShrink: 0, borderRadius: 99, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', lineHeight: 1.3,
        border: `1px solid ${active ? C.green : C.line}`,
        background: active ? C.greenSoft : '#fff',
        color: active ? C.greenDk : C.mute,
      }}
    >
      {children}
    </button>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '7px 0', borderBottom: `1px solid ${C.line}`, fontSize: 13 }}>
      <span style={{ color: C.mute, flexShrink: 0 }}>{k}</span>
      <span style={{ fontWeight: 600, textAlign: 'right', color: C.ink }}>{v}</span>
    </div>
  )
}
