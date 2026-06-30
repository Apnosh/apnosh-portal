'use client'

/**
 * The campaign review page (for a builder/brief campaign) — redesigned so the ONE thing
 * the owner does is decide how each creative is made and see what it costs. "What you're
 * getting" is the hero: every piece is a row showing who makes it + the price, tappable to
 * open the service popup (team / a creator / AI / yourself), with the creator pick folded
 * in. The hands-on control + the plan details demote to quiet lines. Replaces the old
 * stack of PlayCards + "Who steers the creative?" + "Your creators".
 */
import { useState } from 'react'
import { Check, Camera, ChevronRight, ChevronDown, CalendarDays, User, Building2, Sparkles, Hand } from 'lucide-react'
import { C, GRAD, money } from '@/components/campaigns/ui'
import { summarize, type LineItem, type BillingSummary, type PieceProducer } from '@/lib/campaigns/types'
import { reconcileBeatsToLines } from '@/lib/campaigns/catalog'
import { deriveSchedule } from '@/lib/campaigns/schedule'
import { vibeForCampaign, creativeRolesForCampaign } from '@/lib/campaigns/creators'
import { planCampaignPieces, type PlannedPiece } from '@/lib/campaigns/work-orders-core'
import { PIECE_BY_TYPE } from '@/lib/campaigns/content-menu/manifest'
import { AUDIENCES, CHANNELS } from '@/lib/campaigns/data/campaign-templates'
import type { SavedCampaign, CampaignProgress, CampaignCharges } from '@/lib/campaigns/view'
import DeliveriesCard from '@/components/campaigns/deliveries-card'
import LineCard from '@/components/campaigns/line-card'
import ServicePicker from './service-picker'
import { TYPE_ICON } from './add-piece-modal'

const CONTROL: { value: SavedCampaign['creativeControl']; label: string; sub: string }[] = [
  { value: 'handoff', label: 'We run with it', sub: 'we make each piece; you approve before it posts' },
  { value: 'approve_concept', label: 'Run the idea by me', sub: 'you OK the concept before we produce it' },
  { value: 'owner_directs', label: "I'll direct it", sub: 'you write the brief; we execute' },
]

const serviceLabel = (p: PieceProducer, creatorName?: string) =>
  p === 'creator' ? (creatorName ?? 'A creator') : p === 'diy' ? 'You' : p === 'ai' ? 'AI draft' : 'Your team'
const serviceIcon = (p: PieceProducer) => (p === 'creator' ? User : p === 'ai' ? Sparkles : p === 'diy' ? Hand : Building2)

/** A brief campaign's honest bill, priced by the SERVICE choices: producer-aware content
 *  total (DIY $0, AI fee, shoot surcharge) over the non-content services. */
export function producerAwareBill(items: LineItem[], pieces: { priceCents: number }[]): BillingSummary {
  const base = summarize(items.filter((it) => it.included && !/^content-/.test(it.serviceId ?? '')))
  const content = pieces.reduce((sum, p) => sum + p.priceCents, 0) / 100
  return { ...base, oneTimeOnDelivery: base.oneTimeOnDelivery + content }
}

function fmtDay(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(`${iso}T00:00:00Z`)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}
function fmtShipped(iso: string): string {
  const d = new Date(iso); if (isNaN(d.getTime())) return ''
  const now = new Date()
  return d.toLocaleDateString('en-US', d.getFullYear() === now.getFullYear() ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function CampaignReviewBody({ camp, progress, charges, onSetProducer, onSetCreativeControl, onSetStart, onToggleInclude }: {
  camp: SavedCampaign
  progress: CampaignProgress | null
  charges: CampaignCharges | null
  onSetProducer: (key: string, producer: PieceProducer) => void
  onSetCreativeControl: (mode: string) => void
  onSetStart: (iso: string) => void
  onToggleInclude: (id: string) => void
}) {
  const [picker, setPicker] = useState<{ key: string; type: string; label: string; producer: PieceProducer; creatorName?: string } | null>(null)
  const [planOpen, setPlanOpen] = useState(false)
  const [controlOpen, setControlOpen] = useState(false)

  const items = camp.draft.items
  const core = items.filter((i) => i.included)
  const recommended = items.filter((i) => !i.included)
  const brief = camp.draft.brief
  const shipped = camp.status === 'shipped'
  const liveSince = shipped && camp.shippedAt ? fmtShipped(camp.shippedAt) : ''
  const todayISO = new Date().toISOString().slice(0, 10)

  // The dated pieces, resolved to their chosen service + price (aligned by index to sched).
  const pieces = planCampaignPieces(camp, todayISO)
  const planBeats = brief ? reconcileBeatsToLines(items, brief.contentBeats) : []
  const sched = deriveSchedule({ targetDate: camp.draft.targetDate, occasion: camp.draft.occasion, contentBeats: planBeats }, todayISO)
  const roles = creativeRolesForCampaign(core, camp.creatorChoices ?? {}, vibeForCampaign(camp.draft.goalKey, camp.draft.occasion))
  const creatorByDisc = new Map(roles.map((r) => [r.discipline, r.creator]))
  const creatorFor = (p: PlannedPiece) => (p.discipline ? creatorByDisc.get(p.discipline)?.name : undefined)

  const onSite = pieces.filter((p) => p.shootDayId)
  const remote = pieces.filter((p) => !p.shootDayId)
  const soloVisit = onSite.length === 1
  const control = CONTROL.find((c) => c.value === (camp.creativeControl ?? 'handoff')) ?? CONTROL[0]
  const services = core.filter((it) => !/^content-/.test(it.serviceId ?? ''))
  const bill = producerAwareBill(items, pieces)

  function Piece({ p, i }: { p: PlannedPiece; i: number }) {
    const def = PIECE_BY_TYPE[p.type]
    const Icon = TYPE_ICON[p.type] ?? Camera
    const SvcIcon = serviceIcon(p.producer)
    const noun = (def?.label ?? p.type).replace(/^An? /, '')
    const date = fmtDay(sched.beats[i]?.postISO ?? p.postISO)
    const cName = creatorFor(p)
    return (
      <div style={{ padding: '11px 13px', borderTop: i === 0 ? 'none' : `1px solid ${C.line}` }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
          <Icon size={16} color={C.faint} style={{ flexShrink: 0, transform: 'translateY(2px)' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: C.ink }}>{p.label || noun}</div>
            <div style={{ fontSize: 11.5, color: C.faint }}>{[date && `posts ${date}`, !p.shootDayId && p.discipline ? 'no shoot' : ''].filter(Boolean).join(' · ')}</div>
          </div>
        </div>
        {!shipped ? (
          <button onClick={() => setPicker({ key: p.key, type: p.type, label: p.label || noun, producer: p.producer, creatorName: cName })}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, marginTop: 9, padding: '9px 11px', border: `1px solid ${C.line}`, borderRadius: 12, background: '#fff', cursor: 'pointer', textAlign: 'left' }}>
            <SvcIcon size={16} color={p.producer === 'diy' ? C.faint : C.greenDk} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, color: C.ink }}>Made by <b style={{ fontWeight: 600 }}>{serviceLabel(p.producer, cName)}</b></div>
              <div style={{ fontSize: 10.5, color: C.faint }}>tap to change how it&rsquo;s made</div>
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: p.producer === 'diy' ? C.green : C.ink }}>{money(p.priceCents / 100)}</span>
            <ChevronRight size={15} color={C.faint} style={{ flexShrink: 0 }} />
          </button>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 8, fontSize: 12, color: C.mute }}>
            <SvcIcon size={14} color={C.faint} /> Made by {serviceLabel(p.producer, cName)} · {money(p.priceCents / 100)}
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: shipped ? C.greenSoft : '#eef0ef', color: shipped ? C.greenDk : C.mute, borderRadius: 99, padding: '4px 11px', fontWeight: 700, fontSize: 11.5, marginBottom: 10 }}>
        <span style={{ width: 6, height: 6, borderRadius: 99, background: shipped ? C.green : C.faint }} />{shipped ? (liveSince ? `Live since ${liveSince}` : 'Live') : 'Draft'}
      </div>
      <h1 style={{ fontWeight: 600, fontSize: 24, margin: '0 0 4px', lineHeight: 1.15 }}>{camp.draft.name}</h1>
      {brief && <p style={{ fontSize: 13, color: C.mute, margin: '0 0 14px' }}>{brief.objective}{brief.projected ? ` · ${brief.projected}` : ''}</p>}

      {/* shipped progress */}
      {shipped && progress && (
        <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, padding: '11px 13px', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>{progress.live > 0 ? `${progress.live} of ${progress.total} live` : `Preparing ${progress.total} ${progress.total === 1 ? 'piece' : 'pieces'}`}</span>
            {progress.nextDueISO && <span style={{ fontSize: 11.5, color: C.mute }}>next {fmtDay(progress.nextDueISO)}</span>}
          </div>
          <div style={{ marginTop: 8, height: 5, borderRadius: 3, background: C.line, overflow: 'hidden', display: 'flex' }}><div style={{ width: `${Math.round((progress.live / Math.max(1, progress.total)) * 100)}%`, background: C.green }} /></div>
        </div>
      )}
      {shipped && charges && charges.count > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, padding: '10px 13px', marginBottom: 12 }}>
          <span style={{ fontSize: 12.5, color: C.mute }}>Billable so far<span style={{ display: 'block', fontSize: 11, color: C.faint, marginTop: 1 }}>One charge per delivered piece</span></span>
          <span style={{ fontSize: 15, fontWeight: 800 }}>${(charges.accruedCents / 100).toFixed(charges.accruedCents % 100 === 0 ? 0 : 2)}<span style={{ fontSize: 11.5, fontWeight: 600, color: C.faint }}> · {charges.count} {charges.count === 1 ? 'piece' : 'pieces'}</span></span>
        </div>
      )}

      {/* hands-on control — one compact line */}
      {!shipped && pieces.length > 0 && (
        <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, marginBottom: 12, overflow: 'hidden' }}>
          <button onClick={() => setControlOpen((o) => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '10px 13px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
            <Hand size={15} color={C.mute} />
            <div style={{ flex: 1 }}><div style={{ fontSize: 12.5, color: C.ink }}>{control.label}</div><div style={{ fontSize: 10.5, color: C.faint }}>{control.sub}</div></div>
            <ChevronDown size={16} color={C.faint} style={{ transform: controlOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
          </button>
          {controlOpen && (
            <div style={{ borderTop: `1px solid ${C.line}`, padding: '6px 8px 8px' }}>
              {CONTROL.map((c) => (
                <button key={c.value} onClick={() => { onSetCreativeControl(c.value); setControlOpen(false) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 9px', borderRadius: 9, border: 'none', cursor: 'pointer', textAlign: 'left', background: c.value === control.value ? C.greenSoft : 'transparent' }}>
                  <div style={{ flex: 1 }}><div style={{ fontSize: 12.5, color: c.value === control.value ? C.greenDk : C.ink }}>{c.label}</div><div style={{ fontSize: 10.5, color: C.faint }}>{c.sub}</div></div>
                  {c.value === control.value && <Check size={14} color={C.greenDk} />}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* THE HERO: what you're getting */}
      {pieces.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '4px 2px 8px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: C.faint }}>What you&rsquo;re getting</div>
            {!shipped && (
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: C.mute }}>
                <CalendarDays size={12} /> {sched.mode === 'event' ? 'Toward' : 'Starts'}
                <input type="date" value={(camp.draft.targetDate ?? '').slice(0, 10)} onChange={(e) => onSetStart(e.target.value)} style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: '3px 6px', fontSize: 11, color: C.ink, fontFamily: 'inherit', background: '#fff' }} />
              </label>
            )}
          </div>

          {onSite.length > 0 && (
            <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'hidden', marginBottom: 9 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 13px', background: C.bg, borderBottom: `1px solid ${C.line}` }}>
                <Camera size={16} color={C.mute} />
                <span style={{ fontSize: 12, fontWeight: 700, flex: 1 }}>Your shoot · {onSite.length} {onSite.length === 1 ? 'piece' : 'pieces'} · one visit</span>
                {!shipped && (soloVisit
                  ? <span style={{ fontSize: 10.5, color: '#9a5a00', background: 'rgba(245,170,70,0.16)', borderRadius: 6, padding: '2px 6px' }}>solo visit +$75</span>
                  : <span style={{ fontSize: 10.5, color: C.greenDk, background: C.greenSoft, borderRadius: 6, padding: '2px 6px' }}>batched · no visit fee</span>)}
              </div>
              {onSite.map((p) => <Piece key={p.key} p={p} i={pieces.indexOf(p)} />)}
            </div>
          )}

          {remote.length > 0 && (
            <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'hidden', marginBottom: 9 }}>
              {onSite.length > 0 && <div style={{ padding: '9px 13px', fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: C.faint, background: C.bg, borderBottom: `1px solid ${C.line}` }}>No shoot needed</div>}
              {remote.map((p) => <Piece key={p.key} p={p} i={pieces.indexOf(p)} />)}
            </div>
          )}
          {!shipped && sched.tooSoon && (
            <div style={{ fontSize: 11, color: '#9a5a00', background: 'rgba(245,170,70,0.14)', borderRadius: 8, padding: '6px 9px', marginBottom: 9, lineHeight: 1.4 }}>That date is sooner than we can produce these. Pick a later date to give the team runway.</div>
          )}
        </>
      )}

      {/* services (non-content lines) — quiet */}
      {services.length > 0 && (
        <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'hidden', marginBottom: 9 }}>
          <div style={{ padding: '9px 13px', fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: C.faint, background: C.bg, borderBottom: `1px solid ${C.line}` }}>Always-on</div>
          {services.map((it, i) => (
            <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px', borderTop: i === 0 ? 'none' : `1px solid ${C.line}` }}>
              <Building2 size={16} color={C.faint} style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13.5, color: C.ink }}>{it.plain || it.name}</div>{it.does && <div style={{ fontSize: 11, color: C.faint }}>{it.does}</div>}</div>
              <span style={{ fontSize: 12.5, color: C.mute, flexShrink: 0 }}>{it.cadence.kind === 'recurring' ? `${money(it.price)}/mo` : money(it.price)}</span>
            </div>
          ))}
        </div>
      )}

      {/* shipped: finish setup + deliveries */}
      {shipped && (
        <>
          <a href={`/dashboard/campaigns/${camp.draft.id}/ready`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: GRAD, color: '#fff', borderRadius: 14, padding: '13px 16px', textDecoration: 'none', margin: '4px 0 12px' }}>
            <span><span style={{ fontWeight: 800, fontSize: 14 }}>Finish setup</span><span style={{ display: 'block', fontSize: 11.5, opacity: 0.9, marginTop: 1 }}>A few quick things so we nail this</span></span>
            <span style={{ fontWeight: 800, fontSize: 18 }}>→</span>
          </a>
          <DeliveriesCard campaignId={camp.draft.id} />
        </>
      )}

      {/* plan summary — collapsed */}
      {brief && (
        <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'hidden', marginTop: 4 }}>
          <button onClick={() => setPlanOpen((o) => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '11px 13px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
            <div style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: C.mute }}>The plan{brief.offer ? ` · ${brief.offer.label}` : ''}</div>
            <ChevronDown size={16} color={C.faint} style={{ transform: planOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
          </button>
          {planOpen && (
            <div style={{ padding: '0 13px 10px' }}>
              {brief.offer && <Row k="Offer" v={brief.offer.label} />}
              <Row k="Goal" v={brief.kpi} />
              <Row k="Who" v={brief.audienceIds.map((a) => AUDIENCES[a]?.label ?? a).join(', ') || '—'} />
              <Row k="Where" v={brief.channelIds.map((c) => CHANNELS[c]?.label ?? c).join(', ') || '—'} />
            </div>
          )}
        </div>
      )}

      {/* go further */}
      {recommended.length > 0 && !shipped && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.faint, marginBottom: 8 }}>Go further</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recommended.map((it) => <LineCard key={it.id} item={it} onToggleInclude={() => onToggleInclude(it.id)} />)}
          </div>
        </div>
      )}

      {/* shipped bill echo */}
      {shipped && (
        <div style={{ marginTop: 14, fontSize: 12, color: C.faint, textAlign: 'center' }}>
          {bill.oneTimeOnDelivery > 0 ? `$${bill.oneTimeOnDelivery} on delivery` : ''}{bill.oneTimeOnDelivery > 0 && bill.perMonth > 0 ? ' · ' : ''}{bill.perMonth > 0 ? `$${bill.perMonth}/mo` : ''}
        </div>
      )}

      {picker && (
        <ServicePicker type={picker.type} label={picker.label} producer={picker.producer} creatorName={picker.creatorName}
          onPick={(prod) => { onSetProducer(picker.key, prod); setPicker(null) }} onClose={() => setPicker(null)} />
      )}
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '7px 0', borderBottom: '1px solid #f3f6f4', fontSize: 13 }}>
      <span style={{ color: C.mute, flexShrink: 0 }}>{k}</span>
      <span style={{ fontWeight: 600, textAlign: 'right', color: C.ink }}>{v}</span>
    </div>
  )
}
