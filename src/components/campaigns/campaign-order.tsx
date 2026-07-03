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

function lineMoney(it: LineItem): string {
  const t = money(lineTotal(it))
  if (it.cadence.kind === 'recurring') return `${t}/${it.cadence.every === 'weekly' ? 'wk' : 'mo'}`
  return t
}

export default function OrderSummary({ camp }: { camp: SavedCampaign }) {
  const items = camp.draft.items.filter((i) => i.included && !i.optOut)
  const plays = playsFrom(items)
  const bill = summarize(camp.draft.items)
  const brief = camp.draft.brief
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

      {/* the receipt total */}
      {totals.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, borderTop: `1px solid ${C.line}`, paddingTop: 10, fontSize: 13, fontWeight: 700, color: C.ink }}>
          <span>Total</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{totals.join(' · ')}</span>
        </div>
      )}
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
