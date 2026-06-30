'use client'

/**
 * The detail-page body for a Content-Menu campaign (no brief) — the cart aesthetic kept
 * after ship: the shoot group + ready-now group, read-mostly, plus the live progress and
 * billable-so-far. Drafts get a "Continue building" link back into the menu. Rendered by
 * the campaign detail page in place of the legacy plays view for menu campaigns.
 */
import { Camera, Check } from 'lucide-react'
import { C, money } from '@/components/campaigns/ui'
import { campaignBill, shootDaysFromLines, SOLO_VISIT_SURCHARGE_CENTS } from '@/lib/campaigns/catalog'
import type { LineItem } from '@/lib/campaigns/types'
import type { SavedCampaign, CampaignProgress, CampaignCharges } from '@/lib/campaigns/view'
import { PIECE_BY_TYPE, pieceNeedsVisit } from '@/lib/campaigns/content-menu/manifest'
import { TYPE_ICON } from './add-piece-modal'
import DeliveriesCard from '@/components/campaigns/deliveries-card'

const SUR = SOLO_VISIT_SURCHARGE_CENTS / 100
const typeOf = (it: LineItem) => (it.serviceId ?? '').replace(/^content-/, '')
const handlerLabel = (p?: LineItem['producer']) => (p === 'creator' ? 'A creator' : p === 'diy' ? 'You' : 'Your team')

export default function MenuCampaignBody({ camp, progress, charges }: { camp: SavedCampaign; progress: CampaignProgress | null; charges: CampaignCharges | null }) {
  const items = camp.draft.items.filter((i) => i.included)
  const shipped = camp.status === 'shipped'
  const bill = campaignBill(camp.draft.items)
  const onSiteCount = shootDaysFromLines(camp.draft.items)[0]?.onSiteCount ?? 0
  const solo = onSiteCount === 1
  const shootItems = items.filter((i) => pieceNeedsVisit(typeOf(i), i.brief) && i.producer !== 'diy')
  const restItems = items.filter((i) => !(pieceNeedsVisit(typeOf(i), i.brief) && i.producer !== 'diy'))
  const liveSince = shipped && camp.shippedAt ? fmt(camp.shippedAt) : ''

  return (
    <div>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: shipped ? C.greenSoft : '#eef0ef', color: shipped ? C.greenDk : C.mute, borderRadius: 99, padding: '4px 11px', fontWeight: 700, fontSize: 11.5, marginBottom: 10 }}>
        <span style={{ width: 6, height: 6, borderRadius: 99, background: shipped ? C.green : C.faint }} />{shipped ? (liveSince ? `Live since ${liveSince}` : 'Live') : 'Draft'}
      </div>
      <h1 style={{ fontWeight: 600, fontSize: 24, margin: '0 0 14px', lineHeight: 1.15 }}>{camp.draft.name}</h1>

      {/* live progress mirror */}
      {shipped && progress && (
        <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, padding: '11px 13px', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>{progress.live > 0 ? `${progress.live} of ${progress.total} live` : `Preparing ${progress.total} ${progress.total === 1 ? 'piece' : 'pieces'}`}</span>
            {progress.nextDueISO && <span style={{ fontSize: 11.5, color: C.mute }}>next {fmtDue(progress.nextDueISO)}</span>}
          </div>
          <div style={{ marginTop: 8, height: 5, borderRadius: 3, background: C.line, overflow: 'hidden', display: 'flex' }}>
            <div style={{ width: `${Math.round((progress.live / Math.max(1, progress.total)) * 100)}%`, background: C.green }} />
          </div>
        </div>
      )}

      {/* billable so far */}
      {shipped && charges && charges.count > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, padding: '10px 13px', marginBottom: 12 }}>
          <span style={{ fontSize: 12.5, color: C.mute }}>Billable so far<span style={{ display: 'block', fontSize: 11, color: C.faint, marginTop: 1 }}>One charge per delivered piece</span></span>
          <span style={{ fontSize: 15, fontWeight: 800 }}>${(charges.accruedCents / 100).toFixed(charges.accruedCents % 100 === 0 ? 0 : 2)}<span style={{ fontSize: 11.5, fontWeight: 600, color: C.faint }}> · {charges.count} {charges.count === 1 ? 'piece' : 'pieces'}</span></span>
        </div>
      )}

      {/* the shoot group */}
      {shootItems.length > 0 && (
        <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'hidden', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '11px 13px', background: C.bg, borderBottom: `1px solid ${C.line}` }}>
            <Camera size={17} color={C.mute} />
            <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 700 }}>Your shoot · {onSiteCount} {onSiteCount === 1 ? 'piece' : 'pieces'}</div><div style={{ fontSize: 11, color: C.faint }}>one visit</div></div>
          </div>
          {shootItems.map((it) => <ReadRow key={it.id} it={it} />)}
          <div style={{ padding: '9px 13px', borderTop: `1px solid ${C.line}`, background: solo ? 'rgba(245,170,70,0.10)' : C.greenSoft }}>
            <span style={{ fontSize: 12, color: solo ? '#9a5a00' : C.greenDk }}>{solo ? `Solo visit · +${money(SUR)}` : `Batched — one visit for ${onSiteCount} pieces. No solo-visit fee.`}</span>
          </div>
        </div>
      )}

      {/* ready-now group */}
      {restItems.length > 0 && (
        <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'hidden', marginBottom: 12 }}>
          <div style={{ padding: '9px 13px', fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: C.faint, background: C.bg, borderBottom: `1px solid ${C.line}` }}>Ready now · no visit needed</div>
          {restItems.map((it) => <ReadRow key={it.id} it={it} />)}
        </div>
      )}

      {/* honest total */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '4px 2px', fontSize: 14 }}>
        <span style={{ color: C.mute }}>{shipped ? 'Billed as each ships' : 'On delivery'}</span>
        <span style={{ fontWeight: 700 }}>{money(bill.oneTimeOnDelivery)}{bill.perMonth > 0 ? ` · ${money(bill.perMonth)}/mo` : ''}</span>
      </div>

      {!shipped && (
        <a href={`/dashboard/campaigns/new?draft=${camp.draft.id}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 14, background: '#fff', border: `1.5px solid ${C.line}`, borderRadius: 12, padding: 13, fontWeight: 600, fontSize: 13.5, color: C.ink, textDecoration: 'none' }}>Continue building →</a>
      )}

      {shipped && (
        <>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: C.greenSoft, color: C.greenDk, borderRadius: 12, padding: '11px 12px', margin: '14px 0', fontSize: 12.5, fontWeight: 600, lineHeight: 1.45 }}>
            <Check size={15} style={{ flexShrink: 0, marginTop: 1 }} /><span>Your team is on each piece. You&rsquo;re only billed for a piece when it ships.</span>
          </div>
          <DeliveriesCard campaignId={camp.draft.id} />
        </>
      )}
    </div>
  )
}

function ReadRow({ it }: { it: LineItem }) {
  const type = typeOf(it)
  const def = PIECE_BY_TYPE[type]
  const Icon = TYPE_ICON[type] ?? Camera
  const free = it.producer === 'diy'
  const dish = it.brief?.featuring?.trim()
  const qty = Math.max(1, it.qty ?? 1)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px', borderTop: `1px solid ${C.line}` }}>
      <Icon size={18} color={C.faint} style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{def?.label?.replace(/^An? /, '') ?? type}{dish ? ` · ${dish}` : ''}{qty > 1 ? ` ×${qty}` : ''}</div>
        <div style={{ fontSize: 11, color: C.faint }}>{handlerLabel(it.producer)}</div>
      </div>
      <span style={{ fontSize: 13, color: free ? C.green : C.mute, flexShrink: 0 }}>{free ? 'Free' : money(it.price * qty)}</span>
    </div>
  )
}

function fmt(iso: string): string {
  const d = new Date(iso); if (isNaN(d.getTime())) return ''
  const now = new Date()
  return d.toLocaleDateString('en-US', d.getFullYear() === now.getFullYear() ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' })
}
function fmtDue(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`); if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}
