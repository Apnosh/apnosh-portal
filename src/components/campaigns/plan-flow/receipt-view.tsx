'use client'

/**
 * CampaignReceiptView — the shared receipt body: an itemized order card (Setup / Content / Monthly with
 * per-line prices + subtotals + grand total), an honest billing note, the go-live timeline, and the
 * next-steps line. Rendered both by the post-ship "You're all set" screen and the Billing > Orders
 * receipt page, so the two never drift. Renders just the cards; the parent owns the column + scroll.
 */

import { useMemo, useState } from 'react'
import { CalendarDays, ChevronDown, Flag, Sparkles, Repeat } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { C, money, DISPLAY } from '@/components/campaigns/ui'
import { lineTotal, type CampaignDraft, type CampaignReceipt } from '@/lib/campaigns/types'
import { deriveSchedule } from '@/lib/campaigns/schedule'
import { aggregateGoLive, addBusinessDays } from '@/lib/campaigns/aggregate-golive'
import { TYPE_ICON } from '@/components/campaigns/content-menu/add-piece-modal'

// Tiny pure helpers, kept in step with the plan-flow Summary so the receipt reads the same.
const serviceLabel = (p: CampaignReceipt['creatives'][number]['producer'], creatorName?: string) =>
  p === 'creator' ? (creatorName ?? 'A creator') : p === 'diy' ? 'You' : p === 'ai' ? 'AI draft' : 'Your team'
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
export function fmtDay(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(`${iso}T00:00:00Z`)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}
function shiftISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10)
}
const TYPE_TINT: Record<string, { tint: string; fg: string }> = {
  reel: { tint: '#FAECE7', fg: '#993C1D' }, photo: { tint: '#E6F1FB', fg: '#185FA5' }, story: { tint: '#FBEAF0', fg: '#993556' },
  post: { tint: '#E1F5EE', fg: '#0F6E56' }, email: { tint: '#FAEEDA', fg: '#854F0B' }, sms: { tint: '#EEEDFE', fg: '#534AB7' },
}
const tintFor = (type: string) => TYPE_TINT[type] ?? { tint: C.bg, fg: C.mute }

type TRow = { iso: string; kind: 'setup' | 'work' | 'draft' | 'post'; title: string; sub?: string }
const rowColor = (k: TRow['kind']) => (k === 'setup' ? '#3f72c4' : k === 'work' ? '#ba7517' : k === 'draft' ? C.greenDk : C.green)

// The same critical-path rollout the plan-flow Summary shows, rebuilt from the schedule + go-live estimate.
function buildTimeline(sched: ReturnType<typeof deriveSchedule>, go: ReturnType<typeof aggregateGoLive>, today: string) {
  const posts = [...sched.beats].sort((a, b) => a.postISO.localeCompare(b.postISO))
  const firstDraft = sched.firstDraftISO
  const hasShots = sched.beats.some((b) => ['reel', 'photo', 'story'].includes(b.type))
  const floor = (iso: string) => (iso < today ? today : iso)
  const rows: TRow[] = []
  if (go.setup.present && go.setup.byISO) {
    const more = go.setup.services.length > 2 ? ` +${go.setup.services.length - 2} more` : ''
    rows.push({ iso: go.setup.byISO, kind: 'setup', title: 'Setup done', sub: go.setup.services.slice(0, 2).join(', ') + more })
  }
  if (firstDraft) {
    rows.push({ iso: floor(shiftISO(firstDraft, -3)), kind: 'work', title: hasShots ? 'Photo + video shoot' : 'We start creating', sub: hasShots ? 'We come film + shoot your dishes' : 'We write and design everything' })
    rows.push({ iso: floor(firstDraft), kind: 'draft', title: 'First drafts for your OK', sub: 'Approve before anything goes live' })
  }
  for (const b of posts) rows.push({ iso: b.postISO, kind: 'post', title: b.label || cap(b.type) })
  if (!firstDraft && go.hasGoLive) {
    rows.push({ iso: addBusinessDays(today, 2), kind: 'work', title: 'We get to work', sub: go.creative.present ? 'Setup, plus filming and creating your content' : 'Getting your foundations set up' })
    if (go.creative.present) rows.push({ iso: addBusinessDays(today, Math.max(go.daysToFirstPost.max, 1)), kind: 'post', title: 'First content goes live', sub: 'Estimate, give or take a few days' })
  }
  rows.sort((a, b) => a.iso.localeCompare(b.iso))
  const hasDate = sched.mode === 'start' || sched.mode === 'event'
  const headline = hasDate && sched.firstPostLabel ? `First posts ${sched.firstPostLabel}`
    : go.hasGoLive && go.phrase ? `Live in ${go.phrase}`
    : go.phrase ? `Starts in ${go.phrase}` : ''
  const headlineSub = sched.tooSoon ? 'That date is tight for the full build, so we start right away.'
    : sched.mode === 'estimate' ? 'Estimate. Lock a start date to confirm.'
    : sched.mode === 'none' && go.hasGoLive ? 'Rough estimate, we confirm exact dates once you start.'
    : ''
  return { rows, headline, headlineSub }
}

/** Compute the at-a-glance go-live phrase for a header chip, without rendering the receipt. */
export function goLivePhraseFor(draft: CampaignDraft, receipt: CampaignReceipt, todayISO: string, doneSetupIds?: readonly string[]): string {
  const sched = deriveSchedule({ targetDate: draft.targetDate, occasion: draft.occasion, contentBeats: draft.brief?.contentBeats }, todayISO)
  const go = aggregateGoLive(receipt.services, sched, todayISO, { doneSetupIds: doneSetupIds ?? [] })
  return go.phrase ? (go.hasGoLive ? `Live in ${go.phrase}` : `Starts in ${go.phrase}`) : 'We confirm dates once you start'
}

export default function CampaignReceiptView({ restaurant, orderId, draft, receipt, dateISO, doneSetupIds }: {
  restaurant: string
  orderId: string
  draft: CampaignDraft
  receipt: CampaignReceipt
  /** The order date printed on the receipt (defaults to today). */
  dateISO?: string
  /** Setup serviceIds already in place — skipped in the go-live estimate (no re-quoting done setup). */
  doneSetupIds?: readonly string[]
}) {
  // Anchor everything (timeline + printed date) at the order date when given, so a historical receipt
  // reproduces the rollout as it was planned at ship — not a misleading "from now" estimate. The
  // post-ship screen passes no dateISO, so it anchors at today (the ship moment), unchanged.
  const today = dateISO || new Date().toISOString().slice(0, 10)
  const printDate = today
  const [openG, setOpenG] = useState<Record<string, boolean>>({ content: true })

  const m = useMemo(() => {
    const { creatives, services, bill } = receipt
    const sched = deriveSchedule({ targetDate: draft.targetDate, occasion: draft.occasion, contentBeats: draft.brief?.contentBeats }, today)
    const go = aggregateGoLive(services, sched, today, { doneSetupIds: doneSetupIds ?? [] })
    const setupSvc = services.filter((it) => it.cadence.kind === 'one-time')
    const monthlySvc = services.filter((it) => it.cadence.kind === 'recurring')
    const perOccSvc = services.filter((it) => it.cadence.kind === 'per-occurrence')
    const setupTotal = setupSvc.reduce((s, it) => s + lineTotal(it), 0)
    const contentTotal = Math.max(0, bill.oneTimeOnDelivery - setupTotal)
    const groups = ([
      setupSvc.length ? { key: 'setup', Icon: Flag, fg: '#3f72c4', label: 'Setup', sub: 'One-time, to get you live', total: setupTotal, suffix: '' } : null,
      (creatives.length || perOccSvc.length) ? { key: 'content', Icon: Sparkles, fg: C.greenDk, label: 'Content we make', sub: 'Charged as each piece ships', total: contentTotal, suffix: '' } : null,
      monthlySvc.length ? { key: 'monthly', Icon: Repeat, fg: C.mute, label: 'Every month', sub: 'Ongoing, pause anytime', total: bill.perMonth, suffix: '/mo' } : null,
    ].filter(Boolean) as { key: string; Icon: LucideIcon; fg: string; label: string; sub: string; total: number; suffix: string }[])
    const timeline = buildTimeline(sched, go, today)
    return { bill, go, sched, creatives, setupSvc, monthlySvc, perOccSvc, groups, timeline }
  }, [receipt, draft, today, doneSetupIds])

  const { bill, go, sched, creatives, setupSvc, monthlySvc, perOccSvc, groups, timeline } = m
  const orderNo = 'APN-' + String(orderId || printDate.replace(/-/g, '')).replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase()
  const grandTotal = `${money(bill.oneTimeOnDelivery)}${bill.perMonth > 0 ? ` + ${money(bill.perMonth)}/mo` : ''}`

  return (
    <>
      {/* receipt card */}
      <div style={{ border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'hidden', background: '#fff' }}>
        {/* perforated top edge */}
        <div style={{ height: 9, background: `radial-gradient(circle at 6px 9px, ${C.bg} 4.5px, transparent 5px) 0 0 / 12px 9px repeat-x` }} />
        {/* meta strip */}
        <div style={{ padding: '11px 14px 12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, fontWeight: 700, letterSpacing: '.04em', color: C.faint, fontVariantNumeric: 'tabular-nums' }}>
            <span>ORDER&nbsp; {orderNo}</span><span>{fmtDay(printDate)}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{restaurant}</span>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.05em', color: C.greenDk, background: C.greenSoft, borderRadius: 5, padding: '2px 6px', flexShrink: 0 }}>PLACED</span>
          </div>
          {/* Defuse the invoice read at the point of the receipt framing: this is a plan, not a charge. */}
          <div style={{ fontSize: 11, color: C.faint, marginTop: 5 }}>Plan placed. Nothing charged yet.</div>
        </div>
        <div style={{ borderTop: `1px dashed ${C.line}` }} />

        {/* grouped, itemized */}
        {groups.map((g) => {
          const isOpen = openG[g.key] ?? false
          return (
            <div key={g.key} style={{ borderTop: `1px dashed ${C.line}` }}>
              <button onClick={() => setOpenG((o) => ({ ...o, [g.key]: !isOpen }))} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 11, padding: '11px 13px', background: '#fff', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ width: 30, height: 30, borderRadius: 8, background: `${g.fg}1a`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><g.Icon size={15} color={g.fg} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{g.label}</div>
                  <div style={{ fontSize: 11, color: C.faint }}>{g.sub}</div>
                </div>
                <span style={{ fontSize: 14, fontWeight: 700, color: g.total === 0 ? C.green : C.ink, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{g.total === 0 ? 'Free' : `${money(g.total)}${g.suffix}`}</span>
                <ChevronDown size={16} color={C.faint} style={{ flexShrink: 0, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
              </button>
              {isOpen && (
                <div style={{ background: '#fafafa', borderTop: `1px solid ${C.line}` }}>
                  {g.key === 'content' && creatives.map((c) => { const tt = tintFor(c.type); const Icon = TYPE_ICON[c.type]; return (
                    <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 13px 9px 26px', borderTop: `1px solid ${C.line}` }}>
                      <span style={{ width: 25, height: 25, borderRadius: 7, background: tt.tint, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{Icon ? <Icon size={13} color={tt.fg} /> : null}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.3, color: C.ink }}>{c.label}</div>
                        <div style={{ fontSize: 10.5, color: C.greenDk, marginTop: 1 }}>Made by {serviceLabel(c.producer, c.creatorName)}</div>
                      </div>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: c.cents === 0 ? C.green : C.ink, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{c.cents === 0 ? 'Free' : money(c.cents / 100)}</span>
                    </div>
                  ) })}
                  {(g.key === 'setup' ? setupSvc : g.key === 'monthly' ? monthlySvc : perOccSvc).map((it) => (
                    <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 13px 10px 26px', borderTop: `1px solid ${C.line}` }}>
                      <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.plain || it.name}</div>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: C.ink, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{it.cadence.kind === 'recurring' ? `${money(it.price)}/mo` : money(lineTotal(it))}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 13px', borderTop: `1px dashed ${C.line}`, fontSize: 11, color: C.mute }}>
                    Subtotal&nbsp;<b style={{ color: C.ink, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{g.total === 0 ? 'Free' : `${money(g.total)}${g.suffix}`}</b>
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {bill.optedOutCount > 0 && (
          <div style={{ borderTop: `1px dashed ${C.line}`, padding: '8px 13px', fontSize: 11, color: C.faint }}>
            You skipped {bill.optedOutCount} {bill.optedOutCount === 1 ? 'piece' : 'pieces'}, saved {money(bill.optedOutSaved)}
          </div>
        )}

        {/* grand total */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '13px 14px', borderTop: `1.5px solid ${C.line}` }}>
          <span style={{ fontFamily: DISPLAY, fontSize: 15, fontWeight: 700, color: C.ink }}>Total</span>
          <span style={{ fontSize: 18, fontWeight: 700, color: C.ink, fontVariantNumeric: 'tabular-nums' }}>{grandTotal}</span>
        </div>
      </div>

      {/* honest billing note */}
      <div style={{ background: C.greenSoft, borderRadius: 12, padding: '11px 13px', margin: '12px 0', fontSize: 12, color: C.greenDk, lineHeight: 1.5 }}>
        <b style={{ fontWeight: 700 }}>Nothing upfront.</b> Each piece is charged only when it ships, after you approve it.{bill.perMonth > 0 ? ' Ads bill monthly while the campaign runs, pause anytime.' : ''}
      </div>

      {/* timeline summary */}
      <div style={{ border: `1px solid ${C.line}`, borderRadius: 14, padding: '14px 14px 4px', background: '#fff' }}>
        {timeline.headline && (
          <div style={{ marginBottom: 13 }}>
            <div style={{ fontFamily: DISPLAY, fontSize: 18, fontWeight: 600, color: C.ink, letterSpacing: '-.01em' }}>{timeline.headline}</div>
            {timeline.headlineSub && <div style={{ fontSize: 11.5, color: sched.tooSoon ? '#b8860b' : C.mute, marginTop: 2 }}>{timeline.headlineSub}</div>}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: C.faint, marginBottom: 12 }}><CalendarDays size={12} /> How it rolls out</div>
        {timeline.rows.length === 0 ? <div style={{ fontSize: 12, color: C.faint, paddingBottom: 10 }}>Dates set once it&rsquo;s live.</div> : timeline.rows.map((r, i) => (
          <div key={i} style={{ display: 'flex', gap: 10 }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: rowColor(r.kind), width: 42, flexShrink: 0, textAlign: 'right', paddingTop: 1, fontVariantNumeric: 'tabular-nums' }}>{fmtDay(r.iso)}</span>
            <div style={{ width: 12, flexShrink: 0, position: 'relative' }}>
              {i < timeline.rows.length - 1 && <span style={{ position: 'absolute', left: 5, top: 8, bottom: -14, width: 2, background: C.line }} />}
              <span style={{ position: 'absolute', left: r.kind === 'post' ? 2 : 0, top: r.kind === 'post' ? 4 : 2, width: r.kind === 'post' ? 8 : 12, height: r.kind === 'post' ? 8 : 12, borderRadius: 8, background: rowColor(r.kind), boxShadow: '0 0 0 3px #fff' }} />
            </div>
            <div style={{ flex: 1, minWidth: 0, paddingBottom: 13 }}>
              <div style={{ fontSize: 12.5, fontWeight: r.kind === 'post' ? 400 : 600, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</div>
              {r.sub && <div style={{ fontSize: 10.5, color: C.faint, marginTop: 1 }}>{r.sub}</div>}
            </div>
          </div>
        ))}
        {go.recurring.present && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', paddingBottom: 10 }}>
            <span style={{ width: 42, flexShrink: 0 }} />
            <div style={{ width: 12, flexShrink: 0, display: 'flex', justifyContent: 'center' }}><Repeat size={11} color={C.faint} /></div>
            <div style={{ fontSize: 12, color: C.mute }}>Then runs every month</div>
          </div>
        )}
      </div>

      {/* next steps */}
      <div style={{ fontSize: 11, color: C.mute, margin: '13px 2px 0', lineHeight: 1.5 }}>
        <b style={{ color: C.ink, fontWeight: 600 }}>When you start:</b> every piece lands in Content for your approval first. Nothing posts until you say so.{sched.firstDraftLabel ? ` First draft around ${sched.firstDraftLabel}.` : ''}{go.gates.filter((g) => !/approval/i.test(g)).slice(0, 2).map((g) => ` ${g}`).join('')}
      </div>
    </>
  )
}
