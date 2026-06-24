'use client'

/**
 * /dashboard/campaigns/[id] — the campaign's lifecycle surface.
 * Shows the complete plan as transparent, editable plays, the honest bill,
 * and a path-aware gate: DIY/AI self-ship; the strategist path sits in review
 * ("Apnosh is building this") until the owner taps Approve & ship. Edits
 * persist via PATCH; nothing is charged until a piece ships.
 */
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ChevronLeft, Loader2, Trash2, Rocket, Check, CalendarDays } from 'lucide-react'
import { playsFrom } from '@/lib/campaigns/plays'
import { summarize, type LineItem, type OptOutReason } from '@/lib/campaigns/types'
import { deriveSchedule } from '@/lib/campaigns/schedule'
import { reconcileBeatsToLines } from '@/lib/campaigns/catalog'
import { vibeForCampaign } from '@/lib/campaigns/creators'
import type { SavedCampaign, CampaignProgress } from '@/lib/campaigns/view'
import { AUDIENCES, CHANNELS } from '@/lib/campaigns/data/campaign-templates'
import PlayCard from '@/components/campaigns/play-card'
import LineCard from '@/components/campaigns/line-card'
import CreatorsCard from '@/components/campaigns/creators-card'
import CreativeControl from '@/components/campaigns/creative-control'
import DeliveriesCard from '@/components/campaigns/deliveries-card'
import HonestBillBar from '@/components/campaigns/honest-bill-bar'
import { C, DISPLAY, GRAD } from '@/components/campaigns/ui'

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [camp, setCamp] = useState<SavedCampaign | null>(null)
  const [progress, setProgress] = useState<CampaignProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    fetch(`/api/campaigns/${id}`)
      .then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Load failed (${r.status})`); return r.json() })
      .then((j) => { if (live) { setCamp(j.campaign as SavedCampaign); setProgress((j.progress as CampaignProgress) ?? null) } })
      .catch((e) => { if (live) setError(e.message) })
    return () => { live = false }
  }, [id])

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
  function setCreativeControl(mode: string) {
    if (!camp) return
    setCamp({ ...camp, creativeControl: mode as SavedCampaign['creativeControl'] })  // optimistic
    fetch(`/api/campaigns/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { creative_control: mode } }) }).catch(() => {})
  }

  async function ship() {
    if (!camp) return
    setBusy(true)
    const shippedAt = new Date().toISOString()
    // Re-send the owner's last-seen creator picks so mint dispatches to exactly
    // who they chose, even if an incremental save earlier failed.
    await fetch(`/api/campaigns/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { status: 'shipped', phase: 'monitor', shipped_at: shippedAt, creator_choices: camp.creatorChoices ?? {} } }) }).catch(() => {})
    setCamp({ ...camp, status: 'shipped', phase: 'monitor', shippedAt })
    setBusy(false)
    // The ship just materialized the pieces; pull live progress so the mirror
    // replaces the static banner without a manual reload.
    fetch(`/api/campaigns/${id}`).then((r) => r.json()).then((j) => setProgress((j.progress as CampaignProgress) ?? null)).catch(() => {})
  }
  async function del() {
    setBusy(true)
    await fetch(`/api/campaigns/${id}`, { method: 'DELETE' }).catch(() => {})
    router.push('/dashboard/campaigns')
  }

  const shipped = camp?.status === 'shipped'
  const path = camp?.draft.path ?? 'strategist'

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: C.bg, display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 480, background: '#fff', display: 'flex', flexDirection: 'column', boxShadow: '0 0 40px rgba(0,0,0,0.06)', height: '100dvh' }}>
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: `1px solid ${C.line}` }}>
          <button onClick={() => router.push('/dashboard/campaigns')} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: C.mute, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}><ChevronLeft size={18} /> Campaigns</button>
          {camp && !shipped && <button onClick={del} disabled={busy} aria-label="Delete" style={{ background: 'none', border: 'none', color: C.faint, cursor: 'pointer', padding: 4 }}><Trash2 size={18} /></button>}
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '18px 16px 28px' }}>
          {error ? <div style={{ color: '#c0392b', fontSize: 13.5, padding: '20px 0', textAlign: 'center' }}>{error}</div>
            : !camp ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '40px 0', color: C.faint }}><Loader2 size={16} className="animate-spin" /> Loading…</div>
            : <Detail camp={camp} progress={progress} onToggleOptOut={toggleOptOut} onToggleInclude={toggleInclude} onRemove={remove} onSetQty={setQty} onSetStart={setStartDate} onChooseCreator={chooseCreator} onSetCreativeControl={setCreativeControl} />}
        </div>

        {camp && (
          <>
            {!shipped && <HonestBillBar items={camp.draft.items} note={path === 'strategist' ? 'Approving is free. Each piece bills only when it ships.' : 'Nothing is charged until a piece ships.'} />}
            <div style={{ flexShrink: 0, borderTop: `1px solid ${C.line}`, padding: '12px 16px calc(12px + env(safe-area-inset-bottom))', background: '#fff' }}>
              {shipped ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, color: C.greenDk, fontWeight: 700, fontSize: 14, background: C.greenSoft, borderRadius: 12, padding: 13 }}><Check size={16} /> {path === 'diy' ? 'Live in your plan' : 'Live, and your team is on it'}</div>
              ) : (
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => router.push('/dashboard/campaigns')} disabled={busy} style={{ flex: '0 0 auto', minWidth: 104, background: '#fff', color: C.ink, border: `1.5px solid ${C.line}`, borderRadius: 12, padding: 14, fontWeight: 700, fontSize: 15, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>Save draft</button>
                  <button onClick={ship} disabled={busy} style={{ flex: 1, background: GRAD, color: '#fff', border: 'none', borderRadius: 12, padding: 14, fontWeight: 700, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: busy ? 0.7 : 1 }}>
                    {busy ? <Loader2 size={17} className="animate-spin" /> : <Rocket size={17} />}
                    {path === 'strategist' ? 'Approve & ship' : path === 'diy' ? 'Schedule it' : 'Ship it'}
                  </button>
                </div>
              )}
              {!shipped && <div style={{ fontSize: 11.5, color: C.faint, textAlign: 'center', marginTop: 8, lineHeight: 1.4 }}>Saved as a draft already. Save to come back later, or approve to hand it to your team.</div>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Detail({ camp, progress, onToggleOptOut, onToggleInclude, onRemove, onSetQty, onSetStart, onChooseCreator, onSetCreativeControl }: {
  camp: SavedCampaign
  progress: CampaignProgress | null
  onToggleOptOut: (id: string, r: OptOutReason) => void
  onToggleInclude: (id: string) => void
  onRemove: (id: string) => void
  onSetQty: (id: string, qty: number) => void
  onSetStart: (iso: string) => void
  onChooseCreator: (discipline: string, creatorId: string) => void
  onSetCreativeControl: (mode: string) => void
}) {
  const items = camp.draft.items
  const core = items.filter((i) => i.included)
  const recommended = items.filter((i) => !i.included)
  const plays = playsFrom(core)
  const brief = camp.draft.brief
  const bill = summarize(items)
  const shipped = camp.status === 'shipped'
  const inReview = !shipped && camp.phase === 'review'
  const liveSince = shipped && camp.shippedAt ? fmtShipped(camp.shippedAt) : ''
  const diy = camp.draft.path === 'diy'

  return (
    <div>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: shipped ? C.greenSoft : '#eef0ef', color: shipped ? C.greenDk : C.mute, borderRadius: 99, padding: '4px 11px', fontWeight: 700, fontSize: 11.5, marginBottom: 10 }}>
        <span style={{ width: 6, height: 6, borderRadius: 99, background: shipped ? C.green : C.faint }} />{shipped ? (liveSince ? `Live since ${liveSince}` : 'Live') : inReview ? 'In review' : 'Draft'}
      </div>
      <h1 style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 24, margin: '0 0 4px', lineHeight: 1.15 }}>{camp.draft.name}</h1>
      {brief && <p style={{ fontSize: 13, color: C.mute, margin: '0 0 14px' }}>{brief.objective}{brief.projected ? ` · ${brief.projected}` : ''}</p>}

      {/* path/lifecycle banner */}
      {inReview && camp.draft.path === 'strategist' && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: C.greenSoft, color: C.greenDk, borderRadius: 12, padding: '11px 12px', marginBottom: 14, fontSize: 12.5, fontWeight: 600, lineHeight: 1.45 }}>
          <span style={{ fontSize: 14 }}>◆</span><span>Apnosh is building every piece you kept. Review the plan below, then tap <b>Approve &amp; ship</b> when it looks right. Approving doesn’t charge you.</span>
        </div>
      )}
      {shipped && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: C.greenSoft, color: C.greenDk, borderRadius: 12, padding: '11px 12px', marginBottom: 14, fontSize: 12.5, fontWeight: 600, lineHeight: 1.45 }}>
          <Check size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            <b>{liveSince ? `Live since ${liveSince}.` : 'Live.'}</b>{' '}
            {diy
              ? 'This plan is yours to run. Post each piece when you are ready, and you are only billed for a piece when it ships.'
              : progress
                ? 'You are only billed for a piece when it ships.'
                : 'Your team is preparing each piece now. You are only billed for a piece when it ships.'}
          </span>
        </div>
      )}

      {/* live progress mirror — real per-piece status, not a static "preparing" */}
      {shipped && progress && !diy && (
        <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, padding: '11px 13px', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{progress.live > 0 ? `${progress.live} of ${progress.total} live` : `Preparing ${progress.total} ${progress.total === 1 ? 'piece' : 'pieces'}`}</span>
            {progress.nextDueISO && <span style={{ fontSize: 11.5, color: C.mute }}>next {fmtDue(progress.nextDueISO)}</span>}
          </div>
          <div style={{ marginTop: 8, height: 5, borderRadius: 3, background: C.line, overflow: 'hidden', display: 'flex' }}>
            <div style={{ width: `${Math.round((progress.live / Math.max(1, progress.total)) * 100)}%`, height: '100%', background: C.green }} />
            <div style={{ width: `${Math.round((progress.queued / Math.max(1, progress.total)) * 100)}%`, height: '100%', background: C.greenLine }} />
          </div>
          {(progress.awaitingYou > 0 || progress.queued > 0 || progress.inProgress > 0) && (
            <div style={{ fontSize: 11, color: C.mute, marginTop: 7 }}>{[progress.awaitingYou > 0 ? `${progress.awaitingYou} need your OK` : '', progress.queued > 0 ? `${progress.queued} scheduled` : '', progress.inProgress > 0 ? `${progress.inProgress} in production` : ''].filter(Boolean).join(' · ')}</div>
          )}
        </div>
      )}

      {/* the plays */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {plays.map((p) => (
          <PlayCard key={p.key} play={p} defaultOpen={false} onToggleOptOut={onToggleOptOut} onToggleInclude={onToggleInclude} onRemove={onRemove} onSetQty={onSetQty} />
        ))}
      </div>

      {!shipped && <CreativeControl value={camp.creativeControl} onChange={onSetCreativeControl} />}

      <CreatorsCard items={core} overrides={camp.creatorChoices ?? {}} vibe={vibeForCampaign(camp.draft.goalKey, camp.draft.occasion)} onChoose={onChooseCreator} />

      {shipped && !diy && <DeliveriesCard campaignId={camp.draft.id} />}

      {recommended.length > 0 && !shipped && (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.faint, marginBottom: 8 }}>Go further</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recommended.map((it) => <LineCard key={it.id} item={it} onToggleInclude={() => onToggleInclude(it.id)} />)}
          </div>
        </div>
      )}

      {/* brief */}
      {brief && (
        <div style={{ marginTop: 16, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 18, padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.green, marginBottom: 10 }}>The plan</div>
          {brief.offer && <Row k="Offer" v={brief.offer.label} />}
          <Row k="Goal" v={brief.kpi} />
          <Row k="Who" v={brief.audienceIds.map((a) => AUDIENCES[a]?.label ?? a).join(', ') || '—'} />
          <Row k="Where" v={brief.channelIds.map((c) => CHANNELS[c]?.label ?? c).join(', ') || '—'} />
          {(() => {
            const planBeats = reconcileBeatsToLines(camp.draft.items, brief.contentBeats)
            if (!planBeats.length) return null
            const now = new Date()
            const todayISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
            const sched = deriveSchedule({ targetDate: camp.draft.targetDate, occasion: camp.draft.occasion, contentBeats: planBeats }, todayISO)
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
                  <div style={{ fontSize: 11, color: '#9a5a00', background: 'rgba(245,170,70,0.14)', borderRadius: 8, padding: '6px 9px', marginBottom: 8, lineHeight: 1.4 }}>Estimated dates. Pick a start date above to lock the schedule.</div>
                )}
                {sched.beats.map((b, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '6px 0', fontSize: 12.5, borderTop: i === 0 ? 'none' : `1px solid ${C.line}` }}>
                    <span style={{ flexShrink: 0, width: 86, fontSize: 11.5, fontWeight: 700, color: C.greenDk }}>{b.postLabel}</span>
                    <span style={{ flex: 1, minWidth: 0, color: C.ink }}>{b.label}<span style={{ color: C.faint }}> · {b.relLabel}</span></span>
                    {b.channel && <span style={{ flexShrink: 0, fontSize: 11, color: C.faint }}>{b.channel}</span>}
                  </div>
                ))}
                {sched.tooSoon ? (
                  <div style={{ fontSize: 11, color: '#9a5a00', background: 'rgba(245,170,70,0.14)', borderRadius: 8, padding: '6px 9px', marginTop: 9, lineHeight: 1.4 }}>That date is sooner than we can produce these pieces. Pick a later date above to give the team runway.</div>
                ) : (
                  <div style={{ fontSize: 11, color: C.mute, marginTop: 9, lineHeight: 1.4 }}>We&rsquo;ll send the first draft for your OK around <b>{sched.firstDraftLabel}</b>. Nothing posts until you approve it.</div>
                )}
              </div>
            )
          })()}
        </div>
      )}

      {shipped && (
        <div style={{ marginTop: 14, fontSize: 12, color: C.faint, textAlign: 'center' }}>
          {bill.oneTimeOnDelivery > 0 ? `$${bill.oneTimeOnDelivery} on delivery` : ''}{bill.oneTimeOnDelivery > 0 && bill.perMonth > 0 ? ' · ' : ''}{bill.perMonth > 0 ? `$${bill.perMonth}/mo` : ''}
        </div>
      )}
    </div>
  )
}

function fmtShipped(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const now = new Date()
  return d.toLocaleDateString('en-US', d.getFullYear() === now.getFullYear() ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' })
}

// Date-only ISO (YYYY-MM-DD) formatted UTC-safe, so a piece due date never
// shows the previous day for owners west of UTC.
function fmtDue(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '7px 0', borderBottom: '1px solid #f3f6f4', fontSize: 13 }}>
      <span style={{ color: C.mute, flexShrink: 0 }}>{k}</span>
      <span style={{ fontWeight: 600, textAlign: 'right', color: C.ink }}>{v}</span>
    </div>
  )
}
