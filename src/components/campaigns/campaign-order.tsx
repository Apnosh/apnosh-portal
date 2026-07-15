'use client'

/**
 * OrderSummary — the post-ship receipt card. Once a campaign is shipped the plan is an ORDER, so this
 * replaces the draft-time plan editor (PlayCards with opt-out/qty controls) with a read-only receipt:
 * what it is for (the brief facts), every line grouped by play with its price, and the total. Rendered
 * by the order-details page (/dashboard/campaigns/[id]/order) — the only money on a shipped campaign
 * lives there. No editing affordances; changes go through "Request a change".
 */
import { C, money } from '@/components/campaigns/ui'
import { playsFrom } from '@/lib/campaigns/plays'
import { summarize, lineTotal, type LineItem } from '@/lib/campaigns/types'
import { AUDIENCES, CHANNELS } from '@/lib/campaigns/data/campaign-templates'
import type { SavedCampaign } from '@/lib/campaigns/view'

/** The upfront charge-at-checkout receipt (cents), when the order was paid at checkout. */
export interface OrderPayment {
  totalCents: number
  subtotalCents: number
  serviceFeeCents: number
  taxCents: number
  paidAt: string | null
}

function lineMoney(it: LineItem): string {
  const t = money(lineTotal(it))
  if (it.cadence.kind === 'recurring') return `${t}/${it.cadence.every === 'weekly' ? 'wk' : 'mo'}`
  return t
}

const dollars = (cents: number) => money(cents / 100)
function paidDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function OrderSummary({ camp, payment }: { camp: SavedCampaign; payment?: OrderPayment | null }) {
  const items = camp.draft.items.filter((i) => i.included && !i.optOut)
  const plays = playsFrom(items)
  const bill = summarize(camp.draft.items)
  const brief = camp.draft.brief
  // Legacy fallback total (used only when there's no upfront payment on file).
  const totals: string[] = []
  if (bill.oneTimeOnDelivery > 0) totals.push(`$${bill.oneTimeOnDelivery.toLocaleString()} on delivery`)
  if (bill.perMonth > 0) totals.push(`$${bill.perMonth.toLocaleString()}/mo`)

  return (
    <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 16, padding: 16 }}>
        {/* what this order is for */}
        {brief && (
          <div style={{ marginBottom: 14 }}>
            {brief.offer && <Fact k="Offer" v={brief.offer.label} />}
            <Fact k="Goal" v={brief.kpi} />
            <Fact k="Who" v={brief.audienceIds.map((a) => AUDIENCES[a]?.label ?? a).join(', ') || '—'} />
            <Fact k="Where" v={brief.channelIds.map((c) => CHANNELS[c]?.label ?? c).join(', ') || '—'} />
          </div>
        )}

        {/* every line, grouped by the play it belongs to */}
        {plays.map((p) => (
          <div key={p.key} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: C.ink, marginBottom: 4 }}>
              <span style={{ fontSize: 13 }}>{p.icon}</span> {p.title}
            </div>
            {p.items.map((it) => (
              <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '5px 0 5px 21px', fontSize: 12.5 }}>
                <span style={{ color: C.ink2, minWidth: 0 }}>{it.plain || it.name}{(it.qty ?? 1) > 1 ? ` ×${it.qty}` : ''}</span>
                <span style={{ flexShrink: 0, color: C.mute, fontVariantNumeric: 'tabular-nums' }}>{lineMoney(it)}</span>
              </div>
            ))}
          </div>
        ))}

      {/* the receipt total — paid upfront at checkout when we have that record, else the legacy line */}
      {payment ? (
        <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 10, marginTop: 2 }}>
          <MoneyRow k="Items" v={dollars(payment.subtotalCents)} />
          {payment.serviceFeeCents > 0 && <MoneyRow k="Service fee (10%)" v={dollars(payment.serviceFeeCents)} />}
          {payment.taxCents > 0 && <MoneyRow k="Tax" v={dollars(payment.taxCents)} />}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 6, paddingTop: 8, borderTop: `1px solid ${C.line}`, fontSize: 13, fontWeight: 700, color: C.ink }}>
            <span>Paid{paidDate(payment.paidAt) ? ` · ${paidDate(payment.paidAt)}` : ''}</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{dollars(payment.totalCents)}</span>
          </div>
          {bill.perMonth > 0 && <div style={{ fontSize: 11.5, color: C.mute, marginTop: 8 }}>Plus ${bill.perMonth.toLocaleString()}/mo in monthly services, billed each month.</div>}
        </div>
      ) : totals.length > 0 ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, borderTop: `1px solid ${C.line}`, paddingTop: 10, fontSize: 13, fontWeight: 700, color: C.ink }}>
          <span>Total</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{totals.join(' · ')}</span>
        </div>
      ) : null}
    </div>
  )
}

function MoneyRow({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '4px 0', fontSize: 12.5 }}>
      <span style={{ color: C.mute }}>{k}</span>
      <span style={{ color: C.ink2, fontVariantNumeric: 'tabular-nums' }}>{v}</span>
    </div>
  )
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '5px 0', fontSize: 12.5 }}>
      <span style={{ color: C.mute, flexShrink: 0 }}>{k}</span>
      <span style={{ fontWeight: 600, textAlign: 'right', color: C.ink, minWidth: 0 }}>{v}</span>
    </div>
  )
}
