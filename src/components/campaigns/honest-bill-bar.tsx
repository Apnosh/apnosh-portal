'use client'

/**
 * The honest bill — a sticky bar that re-totals live as the owner toggles
 * pieces on, off, DIY or "I have it". The whole "only pay for what you need"
 * promise made visible: one number that only ever reflects what they kept.
 */
import { summarize, type BillingSummary, type LineItem } from '@/lib/campaigns/types'
import { C, DISPLAY, money } from './ui'

/** `bill` overrides the line summary when given (a Content-Menu campaign passes
 *  campaignBill so the solo-visit surcharge is in the on-delivery figure). */
export default function HonestBillBar({ items, note, bill }: { items: LineItem[]; note?: string; bill?: BillingSummary }) {
  const s = bill ?? summarize(items)
  const free = s.oneTimeOnDelivery === 0 && s.perMonth === 0

  return (
    <div style={{ background: '#fff', borderTop: `1px solid ${C.line}`, padding: '10px 16px', boxShadow: '0 -6px 20px rgba(0,0,0,0.05)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.mute }}>Your honest bill</span>
        <span key={`${s.oneTimeOnDelivery}-${s.perMonth}`} style={{ fontFamily: DISPLAY, fontSize: 18, fontWeight: 600, color: C.ink, animation: 'billpop .25s ease' }}>
          {free ? 'Free' : (
            <>
              {s.oneTimeOnDelivery > 0 && <span>{money(s.oneTimeOnDelivery)}<span style={{ fontSize: 11.5, color: C.mute, fontWeight: 400 }}> on delivery</span></span>}
              {s.oneTimeOnDelivery > 0 && s.perMonth > 0 && <span style={{ color: C.faint }}> · </span>}
              {s.perMonth > 0 && <span>{money(s.perMonth)}<span style={{ fontSize: 11.5, color: C.mute, fontWeight: 400 }}>/mo</span></span>}
            </>
          )}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 3 }}>
        <span style={{ fontSize: 10.5, color: C.faint, lineHeight: 1.3 }}>{note ?? 'Nothing is charged until a piece ships.'}</span>
        {s.optedOutSaved > 0 && (
          <span style={{ fontSize: 11, fontWeight: 600, color: C.green, whiteSpace: 'nowrap' }}>Saving {money(s.optedOutSaved)} · {s.optedOutCount} you’ll handle</span>
        )}
      </div>
      <style>{`@keyframes billpop{0%{transform:scale(.92);opacity:.5}100%{transform:scale(1);opacity:1}}`}</style>
    </div>
  )
}
