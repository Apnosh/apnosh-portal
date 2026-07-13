'use client'

/**
 * /dashboard/orders — the owner "Orders" tab: the MONEY story of every campaign,
 * start to finish, as three delivery-app-style tabs (payments only):
 *
 *   Cart     — built but not launched (status 'draft'). Nothing charged.
 *   Ordered  — anything still costing money: running campaigns (kind 'live')
 *              PLUS finished-content campaigns whose monthly lines are still
 *              active ("Monthly program" — progress says done, but recurring
 *              services keep billing until stopped).
 *   History  — closed money: stopped campaigns, and finished ones with no
 *              recurring line left. Shows what each actually billed.
 *
 * First load lands on the first non-empty tab (cart wins ties); after that the
 * tab never auto-jumps.
 *
 * Money is priced the same way the order summary the owner approved was priced:
 * producerAwareBill over planCampaignPieces (DIY $0, AI fee, shoot batching) —
 * NOT the raw line-item list price, which drifts from the owner's producer picks.
 *
 * The Campaigns tab tells the RESULTS story of the same campaigns; both open the
 * same campaign detail page, which is where all actions live (launch, edit, stop).
 * A campaign never disappears from Orders: it slides cart → paying → receipts.
 *
 * Data: GET /api/campaigns?clientId= (same feed as Campaigns), which also returns
 * real billed-so-far totals per launched campaign from campaign_charges (null on
 * lookup failure → rendered as unknown, never as a false "$0"). Discard (cart
 * only) is DELETE /api/campaigns/[id]; the server rejects non-drafts.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import {
  ShoppingBag, Plus, ChevronRight, Trash2, CalendarDays,
  Layers, Loader2, Sparkles, Receipt,
} from 'lucide-react'
import { useClient } from '@/lib/client-context'
import { campaignCardVM, type SavedCampaign, type CampaignProgress, type CampaignCharges, type CampCard } from '@/lib/campaigns/view'
import { summarize, type BillingSummary } from '@/lib/campaigns/types'
import { planCampaignPieces } from '@/lib/campaigns/work-orders-core'
import { readPlanDraft, subscribePlanDraft, type PlanDraftItem } from '@/lib/campaigns/builder/plan-draft'
import { producerAwareBill } from '@/components/campaigns/content-menu/campaign-review-body'
import { GOALS } from '@/lib/campaigns/data/profiles'

const C = {
  green: '#4abd98', greenDk: '#2e9a78', greenSoft: '#eaf7f3', greenLine: 'rgba(74,189,152,0.32)',
  ink: '#1d1d1f', mute: '#6e6e73', faint: '#aeaeb2', line: '#e6e6ea',
  coral: '#c0564f', coralSoft: '#fdeeee', coralLine: 'rgba(192,86,79,0.28)',
  bg: '#f5f5f7', amber: '#8a5a0c', amberBg: '#fbf3e4', amberLine: '#eed9b3',
  blue: '#3a6ea5', blueBg: '#eef3fb', chip: '#eef0ef',
}
const DISPLAY = "'Cal Sans','Inter',sans-serif"

const ORDERS_CSS = `
.mvp-press{transition:transform .16s cubic-bezier(.2,.7,.3,1),box-shadow .16s ease}
.mvp-press:active{transform:scale(.985)}
@media (hover:hover){.mvp-press:hover{transform:translateY(-1px);box-shadow:0 6px 18px rgba(0,0,0,.07)}}
.mvp-row{transition:background .12s ease}
.mvp-row:active{background:#f1f5f4}
@media (hover:hover){.mvp-row:hover{background:#f7faf9}}
.ord-rise{opacity:0;animation:ordRise .5s cubic-bezier(.2,.7,.3,1) forwards}
@keyframes ordRise{from{opacity:0;transform:translateY(9px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.ord-rise{animation:none;opacity:1}.mvp-press{transition:none}}
`

function fmtDate(iso?: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso)
  if (isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function dollars(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString()}`
}

/** "$540/mo" / "$820 one-time" / both — from a producer-aware billing summary. */
function billParts(b: BillingSummary): string[] {
  const parts: string[] = []
  if (b.perMonth > 0) parts.push(`$${Math.round(b.perMonth).toLocaleString()}/mo`)
  if (b.oneTimeOnDelivery > 0) parts.push(`$${Math.round(b.oneTimeOnDelivery).toLocaleString()} one-time`)
  return parts
}

const STATUS_TONE: Record<string, { fg: string; bg: string }> = {
  'Live': { fg: '#2e9a78', bg: '#eaf7f3' },
  'In production': { fg: '#3a6ea5', bg: '#eef3fb' },
  'Needs you': { fg: '#8a5a0c', bg: '#fbf3e4' },
  'Monthly program': { fg: '#2e9a78', bg: '#eaf7f3' },
}

export default function MvpOrders() {
  const { client, loading: clientLoading } = useClient()
  const [saved, setSaved] = useState<SavedCampaign[] | null>(null)
  const [progress, setProgress] = useState<Record<string, CampaignProgress>>({})
  // null = the charges lookup failed — render "unknown", never a false "$0".
  const [charges, setCharges] = useState<Record<string, CampaignCharges> | null>({})
  const [error, setError] = useState<string | null>(null)

  // per-card discard state (cart only)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rowError, setRowError] = useState<Record<string, string>>({})

  // The store's local "View your plan" cart (collect-only, before it becomes a
  // real ordered campaign). Surfaced here as pending so the two carts are linked.
  const [planDraft, setPlanDraft] = useState<PlanDraftItem[]>([])
  useEffect(() => {
    setPlanDraft(readPlanDraft())
    return subscribePlanDraft(() => setPlanDraft(readPlanDraft()))
  }, [])

  // Order tabs: Ordered (billing now) · History (closed). The "Cart" (planned) tab
  // was removed — the plan lives in the campaign store's "View your plan" now.
  const [tab, setTab] = useState<'cart' | 'ordered' | 'history'>('ordered')
  const tabDefaulted = useRef(false)

  useEffect(() => {
    if (!client?.id) return
    let live = true
    setError(null)
    fetch(`/api/campaigns?clientId=${client.id}`)
      .then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Load failed (${r.status})`); return r.json() })
      .then((j) => {
        if (!live) return
        setSaved((j.campaigns ?? []) as SavedCampaign[])
        setProgress((j.progress ?? {}) as Record<string, CampaignProgress>)
        setCharges((j.charges ?? null) as Record<string, CampaignCharges> | null)
      })
      .catch((e) => { if (live) setError(e.message) })
    return () => { live = false }
  }, [client?.id])

  const discard = useCallback(async (id: string) => {
    setBusyId(id)
    setRowError((e) => ({ ...e, [id]: '' }))
    try {
      const r = await fetch(`/api/campaigns/${id}`, { method: 'DELETE' })
      if (!r.ok) {
        const msg = r.status === 409
          ? 'This plan already has work in motion. Open it to stop it instead.'
          : (await r.json().catch(() => ({}))).error || `Couldn't remove it (${r.status})`
        throw new Error(msg)
      }
      setSaved((s) => (s ?? []).filter((c) => c.draft.id !== id))
      // Only close the confirm if it still belongs to this card (the owner may
      // have opened another card's confirm while this delete was in flight).
      setConfirmId((cur) => (cur === id ? null : cur))
    } catch (e) {
      setRowError((er) => ({ ...er, [id]: e instanceof Error ? e.message : 'Something went wrong' }))
    } finally {
      setBusyId(null)
    }
  }, [])

  // One campaign, three money stages: cart (draft) → paying now → receipts.
  const all = saved ?? []
  const vms = new Map<string, CampCard>(all.map((c) => [c.draft.id, campaignCardVM(c, progress[c.draft.id])]))

  // Price every campaign the way its approved order summary was priced: producer-aware
  // (DIY $0, AI fee, shoot batching), not the raw line-item list price.
  const todayISO = new Date().toISOString().slice(0, 10)
  const bills = new Map<string, BillingSummary>(all.map((c) => {
    let b: BillingSummary
    try { b = producerAwareBill(c.draft.items, planCampaignPieces(c, todayISO)) }
    catch { b = summarize(c.draft.items) }
    return [c.draft.id, b]
  }))

  const cart = all.filter((c) => c.status === 'draft')
  // A "done" campaign with an active monthly line is still costing money — it stays
  // in Paying now (as a Monthly program) until stopped. Stop cancels recurring work,
  // so stopped campaigns are genuinely closed and belong in Receipts.
  const stillPaying = (c: SavedCampaign) => c.status !== 'stopped' && (bills.get(c.draft.id)?.perMonth ?? 0) > 0
  const paying = all.filter((c) => {
    const k = vms.get(c.draft.id)?.kind
    return k === 'live' || (k === 'done' && stillPaying(c))
  })
  const receipts = all.filter((c) => {
    const k = vms.get(c.draft.id)?.kind
    return k === 'done' && !stillPaying(c)
  })

  const loading = clientLoading || saved === null
  const nothing = !loading && !error && all.length === 0
  const chUnknown = charges === null

  // First load only: land on the tab that has something in it (cart wins ties,
  // like every delivery app). Never re-jump after that — the owner owns the tab.
  const payingLen = paying.length, receiptsLen = receipts.length
  useEffect(() => {
    if (loading || tabDefaulted.current) return
    tabDefaulted.current = true
    setTab(receiptsLen > 0 && payingLen === 0 ? 'history' : 'ordered')
  }, [loading, payingLen, receiptsLen])

  const cartParts = (() => {
    let perMonth = 0, oneTime = 0
    for (const c of cart) { const b = bills.get(c.draft.id)!; perMonth += b.perMonth; oneTime += b.oneTimeOnDelivery }
    return billParts({ perMonth, oneTimeOnDelivery: oneTime, optedOutCount: 0, optedOutSaved: 0 })
  })()
  const payingMonthly = paying.reduce((s, c) => s + (bills.get(c.draft.id)?.perMonth ?? 0), 0)

  return (
    <div style={{ background: C.bg, minHeight: '100%', padding: '14px 14px 32px', fontFamily: "'Inter',system-ui,sans-serif", boxSizing: 'border-box' }}>
      <style>{ORDERS_CSS}</style>

      {/* header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, padding: '2px 2px 14px' }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontFamily: DISPLAY, fontSize: 23, fontWeight: 600, color: C.ink, lineHeight: 1.1 }}>Orders</h1>
          <p style={{ fontSize: 13, color: C.mute, marginTop: 3 }}>What you&apos;re paying, in one place.</p>
        </div>
        <Link href="/dashboard/campaigns/new" className="mvp-press" style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5, background: C.ink, color: '#fff', borderRadius: 99, padding: '8px 14px 8px 12px', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
          <Plus size={15} /> New
        </Link>
      </div>

      {error && (
        <div style={{ background: C.coralSoft, border: `0.5px solid ${C.coralLine}`, borderRadius: 14, padding: '13px 15px', fontSize: 13.5, color: C.coral, marginBottom: 12 }}>
          Couldn&apos;t load your orders: {error}
        </div>
      )}

      {loading && !error && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '48px 0', color: C.mute }}>
          <Loader2 size={22} className="mvp-spin" color={C.green} />
          <span style={{ fontSize: 13.5 }}>Loading your orders…</span>
        </div>
      )}

      {nothing && <EmptyOrders />}

      {!loading && !error && !nothing && (
        <>
          {/* Order tabs: Cart (planned) · Ordered (billing now) · History (closed) */}
          <div style={{ display: 'flex', gap: 7, marginBottom: 14, overflowX: 'auto', paddingBottom: 2 }}>
            {([['ordered', 'Ordered', paying.length], ['history', 'History', receipts.length]] as const).map(([k, l, n]) => {
              const on = tab === k
              return (
                <button key={k} type="button" onClick={() => setTab(k)} style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 7, border: `1px solid ${on ? C.green : C.line}`, background: on ? C.greenSoft : '#fff', color: on ? C.greenDk : C.mute, borderRadius: 999, padding: '7px 14px', fontSize: 13, fontWeight: on ? 700 : 500, cursor: 'pointer', transition: 'all .15s' }}>
                  {l}<span style={{ minWidth: 17, height: 17, padding: '0 5px', borderRadius: 99, background: on ? C.green : '#eef0ef', color: on ? '#fff' : C.faint, fontSize: 10.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{n}</span>
                </button>
              )
            })}
          </div>

          {/* ── CART — planned, not ordered yet ─────────────────────── */}
          {tab === 'cart' && (<>
          {planDraft.length > 0 && (
            <Link href="/dashboard/campaigns/new" className="mvp-row" style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, padding: '13px 15px', marginBottom: 14, textDecoration: 'none', color: 'inherit', position: 'relative', overflow: 'hidden' }}>
              <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: C.amber }} />
              <span style={{ width: 36, height: 36, borderRadius: 11, background: C.amberBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><ShoppingBag size={17} color={C.amber} /></span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 14.5, fontWeight: 600, color: C.ink }}>In your plan · {planDraft.length} {planDraft.length === 1 ? 'item' : 'items'}</span>
                <span style={{ display: 'block', fontSize: 12.5, color: C.mute, marginTop: 1 }}>Not ordered yet. Review and check out to start it.</span>
              </span>
              <ChevronRight size={17} color={C.faint} />
            </Link>
          )}
          {cartParts.length > 0 && <SectionHead label="When you launch" right={cartParts.join(' + ')} />}
          {cart.length === 0 && planDraft.length === 0 ? (
            <Link href="/dashboard/campaigns/new" className="mvp-row" style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, padding: '13px 15px', marginBottom: 22, textDecoration: 'none', color: 'inherit' }}>
              <span style={{ width: 36, height: 36, borderRadius: 11, background: C.greenSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><ShoppingBag size={17} color={C.greenDk} /></span>
              <span style={{ flex: 1, fontSize: 13.5, color: C.mute }}>Cart&apos;s empty. Plan something new.</span>
              <ChevronRight size={17} color={C.faint} />
            </Link>
          ) : (<>
            <div style={{ marginBottom: 14 }}>
              {cart.map((c, i) => {
                const d = c.draft
                const vm = vms.get(d.id)!
                const inReview = c.phase === 'review'
                const goal = d.goalKey ? GOALS[d.goalKey] : null
                const pieces = d.items.filter((it) => it.included && !it.optOut).length
                const dateLabel = d.occasion ? `For ${d.occasion}` : (d.targetDate ? `Launch by ${fmtDate(d.targetDate)}` : null)
                const confirming = confirmId === d.id
                const cost = billParts(bills.get(d.id)!).join(' + ')

                return (
                  <div key={d.id} className={confirming ? 'ord-rise' : 'mvp-press ord-rise'} style={{ position: 'relative', background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, marginBottom: 11, boxShadow: '0 1px 3px rgba(0,0,0,.04)', overflow: 'hidden', animationDelay: `${Math.min(i, 12) * 0.04}s` }}>
                    <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: inReview ? C.amber : C.faint }} />

                    {confirming ? (
                      <div style={{ padding: '15px 16px 16px' }}>
                        <div style={{ fontSize: 14.5, fontWeight: 600, color: C.ink }}>Remove this plan?</div>
                        <div style={{ fontSize: 12.5, color: C.mute, marginTop: 3 }}>&ldquo;{d.name || 'Untitled plan'}&rdquo; will be deleted for good. You can&apos;t undo this.</div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                          <button type="button" onClick={() => setConfirmId(null)} disabled={busyId === d.id} style={{ flex: 1, padding: '10px 0', borderRadius: 11, border: `0.5px solid ${C.line}`, background: '#fff', color: C.ink, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Keep</button>
                          <button type="button" onClick={() => discard(d.id)} disabled={busyId === d.id} style={{ flex: 1, padding: '10px 0', borderRadius: 11, border: 'none', background: C.coral, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: busyId === d.id ? 0.7 : 1 }}>
                            {busyId === d.id ? <Loader2 size={15} className="mvp-spin" /> : <Trash2 size={15} />} Remove
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <Link href={vm.href} style={{ display: 'block', padding: '13px 44px 12px 16px', textDecoration: 'none', color: 'inherit' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <span style={{ width: 44, height: 44, borderRadius: 12, background: C.greenSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 22, lineHeight: 1 }}>{goal?.icon ?? '📣'}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, borderRadius: 99, padding: '2px 9px', fontSize: 11, fontWeight: 700, background: inReview ? C.amberBg : C.chip, color: inReview ? C.amber : C.mute, border: inReview ? `0.5px solid ${C.amberLine}` : 'none' }}>
                                {inReview ? <Sparkles size={11} /> : null}{vm.pill}
                              </span>
                              <div style={{ fontFamily: DISPLAY, fontSize: 16.5, fontWeight: 600, color: C.ink, lineHeight: 1.2, marginTop: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name || 'Untitled plan'}</div>
                              {goal && <div style={{ fontSize: 12.5, color: C.mute, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{goal.short.charAt(0).toUpperCase() + goal.short.slice(1)}</div>}
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 12, flexWrap: 'wrap' }}>
                            <Meta icon={<Layers size={14} />}>{pieces} {pieces === 1 ? 'piece' : 'pieces'}</Meta>
                            {cost && <Meta icon={<span style={{ fontSize: 13, fontWeight: 700, color: C.greenDk }}>$</span>}><span style={{ color: C.ink, fontWeight: 600 }}>{cost.replace(/^\$/, '')}</span></Meta>}
                            {dateLabel && <Meta icon={<CalendarDays size={14} />}>{dateLabel}</Meta>}
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingTop: 11, borderTop: `0.5px solid ${C.line}` }}>
                            <span style={{ fontSize: 13.5, fontWeight: 600, color: C.greenDk }}>{inReview ? 'Review & approve →' : 'Open & launch →'}</span>
                            <ChevronRight size={17} color={C.faint} />
                          </div>
                        </Link>

                        <button type="button" aria-label="Remove plan" onClick={() => { setConfirmId(d.id); setRowError((e) => ({ ...e, [d.id]: '' })) }} style={{ position: 'absolute', top: 11, right: 11, width: 30, height: 30, borderRadius: 99, border: 'none', background: '#f6f6f8', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}>
                          <Trash2 size={15} color={C.faint} />
                        </button>
                      </>
                    )}

                    {rowError[d.id] && (
                      <div style={{ padding: '0 16px 13px', fontSize: 12.5, color: C.coral }}>{rowError[d.id]}</div>
                    )}
                  </div>
                )
              })}
            </div>
            <Link href="/dashboard/campaigns/new" className="mvp-press" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px 0', borderRadius: 16, border: `1px dashed ${C.greenLine}`, background: '#fff', color: C.greenDk, fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>
              <Plus size={17} /> Plan another campaign
            </Link>
          </>)}
          </>)}

          {/* ── ORDERED — running and billing you now ───────────────── */}
          {tab === 'ordered' && (
            <>
              {payingMonthly > 0 && <SectionHead label="Right now" right={`$${Math.round(payingMonthly).toLocaleString()}/mo`} />}
              {paying.length === 0 ? (
                <div className="ord-rise" style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, padding: '28px 18px', textAlign: 'center', fontSize: 13.5, color: C.mute, lineHeight: 1.5 }}>
                  Nothing running yet.<br />Launch a plan from your cart and it shows up here.
                </div>
              ) : (
              <div className="ord-rise" style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, overflow: 'hidden' }}>
                {paying.map((c, i) => {
                  const d = c.draft
                  const vm = vms.get(d.id)!
                  const goal = d.goalKey ? GOALS[d.goalKey] : null
                  const ch = charges?.[d.id]
                  const b = bills.get(d.id)!
                  // A done-but-recurring campaign reads "Monthly program", not "Done" —
                  // its pieces finished, but the monthly services are still running.
                  const pillLabel = vm.kind === 'done' ? 'Monthly program' : vm.pill
                  const tone = STATUS_TONE[pillLabel] ?? { fg: C.mute, bg: C.chip }
                  const costLabel = b.perMonth > 0 ? `$${Math.round(b.perMonth).toLocaleString()}/mo` : (b.oneTimeOnDelivery > 0 ? `$${Math.round(b.oneTimeOnDelivery).toLocaleString()} one-time` : null)
                  return (
                    <div key={d.id}>
                      {i > 0 && <div style={{ height: '0.5px', background: C.line, marginLeft: 66 }} />}
                      <Link href={vm.href} className="mvp-row" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px', textDecoration: 'none', color: 'inherit' }}>
                        <span style={{ width: 40, height: 40, borderRadius: 11, background: C.greenSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 19, lineHeight: 1 }}>{goal?.icon ?? '📣'}</span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: 14.5, fontWeight: 600, color: C.ink, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name || 'Untitled'}</span>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 3, borderRadius: 99, padding: '1.5px 8px', fontSize: 10.5, fontWeight: 700, background: tone.bg, color: tone.fg }}>{pillLabel}</span>
                        </span>
                        <span style={{ textAlign: 'right', flexShrink: 0 }}>
                          {costLabel && <span style={{ display: 'block', fontFamily: DISPLAY, fontSize: 14.5, fontWeight: 600, color: C.ink }}>{costLabel}</span>}
                          <span style={{ display: 'block', fontSize: 11.5, color: !chUnknown && ch && ch.accruedCents > 0 ? C.greenDk : C.faint, marginTop: 2 }}>
                            {chUnknown ? 'Billed total unavailable' : ch && ch.accruedCents > 0 ? `${dollars(ch.accruedCents)} billed so far` : 'Nothing billed yet'}
                          </span>
                        </span>
                        <ChevronRight size={16} color={C.faint} style={{ flexShrink: 0 }} />
                      </Link>
                    </div>
                  )
                })}
              </div>
              )}
            </>
          )}

          {/* ── HISTORY — closed and settled ────────────────────────── */}
          {tab === 'history' && (
            <>
              {!chUnknown && receipts.length > 0 && <SectionHead label="All time" right={`${dollars(receipts.reduce((s, c) => s + (charges?.[c.draft.id]?.accruedCents ?? 0), 0))} billed`} />}
              {receipts.length === 0 ? (
                <div className="ord-rise" style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, padding: '28px 18px', textAlign: 'center', fontSize: 13.5, color: C.mute, lineHeight: 1.5 }}>
                  No receipts yet.<br />Finished and stopped campaigns land here.
                </div>
              ) : (
              <div className="ord-rise" style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, overflow: 'hidden' }}>
                {receipts.map((c, i) => {
                  const d = c.draft
                  const vm = vms.get(d.id)!
                  const ch = charges?.[d.id]
                  const stopped = c.status === 'stopped'
                  // Stopped: updated_at carries the terminal stop flip — the honest stop date.
                  // Finished: there is no finish stamp, so show the ship date labeled as such.
                  const when = fmtDate(stopped ? c.updatedAt : (c.shippedAt ?? c.updatedAt))
                  const subLabel = stopped
                    ? `Stopped${when ? ` · ${when}` : ''}`
                    : `Finished${when ? ` · started ${when}` : ''}`
                  return (
                    <div key={d.id}>
                      {i > 0 && <div style={{ height: '0.5px', background: C.line, marginLeft: 66 }} />}
                      <Link href={vm.href} className="mvp-row" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', textDecoration: 'none', color: 'inherit' }}>
                        <span style={{ width: 40, height: 40, borderRadius: 11, background: '#f4f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Receipt size={17} color={C.mute} /></span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: C.ink, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name || 'Untitled'}</span>
                          <span style={{ display: 'block', fontSize: 11.5, color: C.mute, marginTop: 2 }}>{subLabel}</span>
                        </span>
                        <span style={{ textAlign: 'right', flexShrink: 0 }}>
                          <span style={{ display: 'block', fontFamily: DISPLAY, fontSize: 14.5, fontWeight: 600, color: chUnknown ? C.faint : C.ink }}>{chUnknown ? '—' : ch && ch.accruedCents > 0 ? dollars(ch.accruedCents) : '$0'}</span>
                          <span style={{ display: 'block', fontSize: 11, color: C.faint, marginTop: 2 }}>{chUnknown ? 'unknown' : 'billed'}</span>
                        </span>
                        <ChevronRight size={16} color={C.faint} style={{ flexShrink: 0 }} />
                      </Link>
                    </div>
                  )
                })}
              </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

function SectionHead({ label, right }: { label: string; right?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, padding: '0 6px 7px' }}>
      <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.faint }}>{label}</span>
      {right && <span style={{ fontFamily: DISPLAY, fontSize: 13, fontWeight: 600, color: C.ink, textAlign: 'right' }}>{right}</span>}
    </div>
  )
}

function Meta({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: C.mute }}>
      <span style={{ color: C.faint, display: 'inline-flex' }}>{icon}</span>
      {children}
    </span>
  )
}

function EmptyOrders() {
  return (
    <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 20, padding: '40px 26px 30px', textAlign: 'center', marginTop: 6 }}>
      <div style={{ width: 60, height: 60, borderRadius: 18, background: C.greenSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
        <ShoppingBag size={27} color={C.greenDk} />
      </div>
      <div style={{ fontFamily: DISPLAY, fontSize: 19, fontWeight: 600, color: C.ink }}>No orders yet</div>
      <div style={{ fontSize: 13.5, color: C.mute, marginTop: 7, lineHeight: 1.5, maxWidth: 280, marginInline: 'auto' }}>
        Plans you build wait here in your cart. Once you launch one, this page tracks what it costs, start to finish.
      </div>
      <Link href="/dashboard/campaigns/new" className="mvp-press" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 20, padding: '12px 22px', borderRadius: 14, background: C.green, color: '#fff', fontSize: 14.5, fontWeight: 600, textDecoration: 'none', boxShadow: '0 6px 16px rgba(74,189,152,0.4)' }}>
        <Plus size={17} /> Plan a campaign
      </Link>
    </div>
  )
}
