'use client'

/**
 * MVP Campaigns — the RESULTS story: launched campaigns only (in production /
 * live / done), outcome-forward cards wired to real campaigns from /api/campaigns.
 * The MONEY story (cart, plan prices, billed-so-far, receipts) lives on the
 * Orders tab — cards here deliberately carry no dollar amounts. Both tabs open
 * the same campaign detail page, where all actions (and the honest bill) live.
 */

import { useState, useEffect } from 'react'
import { CARD_SHADOW } from './kit'
import { outcomeLine, type CampaignOutcome } from '@/lib/campaigns/outcome-view'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import MvpCalendar from './mvp-calendar'
import { useClient } from '@/lib/client-context'
import { ArrowRight, CalendarDays, Check, ChevronLeft, ChevronRight, Clock, Loader2, Minus, Plus, TrendingDown, TrendingUp, LayoutList } from 'lucide-react'
import { campaignCardVM, type CampCard, type SavedCampaign, type CampaignProgress } from '@/lib/campaigns/view'
import { upcomingOccasions } from '@/lib/design/occasions'
import { RATE_CARD } from '@/lib/design/rate-card'
import { campaignHue, gradOf, hueOf, tint, type HueKey } from './hues'
/* ONE PILL, ONE ACTION, ONE LINE PER STATE — from src/lib/promises/lines.ts, the same table the
   server writes the card's line with. A card must never invent its own word for a state. */
import { PILL_FOR, ACTION_FOR, DONE_STATES, STATE_RANK, type PromiseState } from '@/lib/promises/lines'
import { Mark } from './mark'
import { Megaphone, Ticket, Tag, Moon, MapPin, Heart, Star, ShoppingCart, Users, Share2, Sparkles, FileText, AlertCircle } from 'lucide-react'

/* one glyph per goal hue; the campaign card's tile */
const GLYPH: Record<HueKey, typeof Megaphone> = {
  mint: Sparkles, announce: Megaphone, event: Ticket, deal: Tag, nights: Moon, newfaces: MapPin, regulars: Heart,
  reviews: Star, online: ShoppingCart, catering: Users, brand: Share2, amber: Clock, grey: FileText, red: AlertCircle,
}
type HuedCard = CampCard & { hue: HueKey; promise?: string | null; openUrl?: string | null; /** the seven-state row behind this card, when it has one. The pill, the line, the action AND the tab all read it. */ state?: PromiseState | null; /** where a card with no ledger state sits; desk orders set it so a thing still being made never reads Live */ tab?: 'production' | 'live' | 'done' }
/** The seven states an order lives. The words come from the same table the server reads. */
type OrderState = PromiseState
type LedgerRow = { id: string; label: string; line: string; state: OrderState; campaignId: string | null; requestId: string | null; showsOn: string; openUrl: string | null }
type DeskRow = { id: string; type: string; label: string; orderedOn: string; status: string; dueDate: string | null; workStatus: string | null; line: string | null; state: OrderState | null; openUrl: string | null }


const C = {
  green: '#4abd98', greenDk: '#2e9a78', greenSoft: '#eaf7f3',
  ink: '#1d1d1f', mute: '#6e6e73', faint: '#aeaeb2', line: '#e6e6ea',
  amber: '#8a5a0c', amberBg: '#fbf3e4', amberLine: '#eed9b3', red: '#c0392b', redBg: '#fdecea',
}
const DISPLAY = "'Cal Sans','Inter',sans-serif"

const ANIM = `
@keyframes ccRise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
.cc-stagger>*{animation:ccRise .45s cubic-bezier(.2,.7,.3,1) both}
.cc-stagger>*:nth-child(1){animation-delay:.03s}.cc-stagger>*:nth-child(2){animation-delay:.08s}.cc-stagger>*:nth-child(3){animation-delay:.13s}.cc-stagger>*:nth-child(4){animation-delay:.18s}.cc-stagger>*:nth-child(5){animation-delay:.23s}.cc-stagger>*:nth-child(6){animation-delay:.28s}.cc-stagger>*:nth-child(7){animation-delay:.33s}.cc-stagger>*:nth-child(8){animation-delay:.38s}
.cc-scroll{scrollbar-width:none}.cc-scroll::-webkit-scrollbar{display:none}
@media (prefers-reduced-motion: reduce){.cc-stagger>*{animation:none}}
`

type Tab = 'all' | 'live' | 'production' | 'done'

/**
 * WHICH TAB a card belongs on. One function, read by the tab's NUMBER and by the cards behind it,
 * so the two can never disagree — "Live 1" sat above ten cards that all read Stopped, because the
 * count asked `kind === 'live'` while the pill asked the seven-state row (lines.ts).
 *
 * The states, in the owner's terms:
 *   Counted, Stopped   history
 *   Ordered, Held, In production   we are on it, nothing to see yet
 *   Delivered, Counting   it landed; it is out there working
 *
 * A card with no ledger row behind it (an owner-run plan, an order placed before the ledger) falls
 * back to what the card worked out for itself, which is the old behaviour. A draft is neither Live
 * nor history and never reaches here — campaignCards filters it — but saying so costs one line.
 */
function tabOf(c: HuedCard): Exclude<Tab, 'all'> | null {
  if (c.kind === 'draft') return null
  // not_counted is a ledger row the product cannot count yet, not a place on the shelf: the card
  // keeps its progress words, so the tab must read those too or the count and the pill disagree.
  if (c.state && c.state !== 'not_counted') {
    if (DONE_STATES.has(c.state)) return 'done'
    if (c.state === 'ordered' || c.state === 'held' || c.state === 'production') return 'production'
    return 'live'
  }
  if (c.tab) return c.tab
  if (c.pill === 'In production') return 'production'
  return c.kind === 'done' ? 'done' : 'live'
}

export default function MvpCampaigns({ view: viewProp }: { view?: 'list' | 'calendar' } = {}) {
  const { client, loading: clientLoading } = useClient()
  const [saved, setSaved] = useState<SavedCampaign[] | null>(null)
  const [progress, setProgress] = useState<Record<string, CampaignProgress>>({})
  const [outcomes, setOutcomes] = useState<Record<string, CampaignOutcome>>({})
  const [error, setError] = useState<string | null>(null)
  const [viewState, setView] = useState<'list' | 'calendar'>('list')
  const view = viewProp ?? viewState // the calendar row on the page owns this now (2026-09-11)
  const [tab, setTab] = useState<Tab>('all')
  /* THE LEDGER (order_promises): the promise each order made on Create, carried onto its card;
     plus desk orders (photos, posts, video, print, a website), which have no campaign row and
     were invisible here. Best-effort: an empty read leaves the list exactly as before. */
  const [promises, setPromises] = useState<{ rows: LedgerRow[]; desk: DeskRow[] }>({ rows: [], desk: [] })

  useEffect(() => {
    if (!client?.id) return
    let live = true
    fetch(`/api/dashboard/promises?clientId=${client.id}&all=1`)
      .then((r) => r.json())
      .then((j) => { if (live) setPromises({ rows: Array.isArray(j?.rows) ? j.rows : [], desk: Array.isArray(j?.desk) ? j.desk : [] }) })
      .catch(() => {})
    return () => { live = false }
  }, [client?.id])

  useEffect(() => {
    if (!client?.id) return
    let live = true
    setError(null)
    fetch(`/api/campaigns?clientId=${client.id}`)
      .then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Load failed (${r.status})`); return r.json() })
      .then((j) => { if (live) { setSaved((j.campaigns ?? []) as SavedCampaign[]); setProgress((j.progress ?? {}) as Record<string, CampaignProgress>); setOutcomes((j.outcomes ?? {}) as Record<string, CampaignOutcome>) } })
      .catch((e) => { if (live) setError(e.message) })
    return () => { live = false }
  }, [client?.id])

  // Drafts (unshipped plans) live on the Orders tab now — Campaigns shows only shipped/live/done.
  // One line per card: the row with a number wins, then counting, then held, then not counted.
  const rowRank = (r: LedgerRow) => STATE_RANK[r.state] ?? 8
  const promiseByCampaign = new Map<string, LedgerRow>()
  for (const r of promises.rows) {
    if (!r.campaignId) continue
    const cur = promiseByCampaign.get(r.campaignId)
    if (!cur || rowRank(r) < rowRank(cur)) promiseByCampaign.set(r.campaignId, r)
  }
  const campaignCards: HuedCard[] = (saved ?? []).map((c) => {
    const o = outcomes[c.draft.id]
    const line = o ? outcomeLine(o) : null
    const vm = campaignCardVM(c, progress[c.draft.id], line ? { ...line, spark: o.spark } : null)
    const pr = promiseByCampaign.get(c.draft.id)
    const hued: HuedCard = { ...vm, hue: campaignHue({ goalKey: c.draft.goalKey, templateId: c.draft.sourceCatalogId, name: c.draft.name }), promise: pr?.line ?? null, openUrl: pr?.openUrl ?? null, state: pr?.state ?? null }
    // THE SEVEN STATES. Where a promise row exists it is the truth about where this order stands —
    // one pill, one line, one action, all three from the same row. A card with no ledger row (an
    // owner-run plan, an order placed before the ledger existed) keeps the progress-derived words.
    if (!pr || pr.state === 'not_counted') return hued
    return {
      ...hued,
      state: pr.state,
      kind: DONE_STATES.has(pr.state) ? 'done' as const : pr.state === 'delivered' ? hued.kind : 'live' as const,
      pill: PILL_FOR[pr.state] ?? hued.pill,
      pillIcon: pr.state === 'held' ? 'calendar' as const : pr.state === 'counted' ? 'check' as const : 'dot' as const,
      action: ACTION_FOR[pr.state],
      promise: pr.line,
    }
  }).filter((c) => c.kind !== 'draft')
  /* Desk orders as cards: one row each, in the Create card's own words, linking to the request.
     They read the SAME seven states; the work-order fallback is only for an order with no ledger
     row behind it (a type with no promise spec, or a row written before the ledger existed). */
  const deskCards: HuedCard[] = promises.desk.map((d) => {
    const done = d.workStatus === 'delivered' || d.workStatus === 'approved' || d.status === 'delivered' || d.status === 'closed'
    const making = d.workStatus === 'in_progress' || d.status === 'in_progress'
    const st = d.state
    // Staff see "Overdue" on the same order; the owner must not read "due Aug 21" three weeks later
    // as if it were still ahead of them.
    const today = new Date().toISOString().slice(0, 10)
    const late = !!d.dueDate && !done && d.dueDate < today
    const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return {
      key: `desk:${d.id}`,
      kind: st ? (DONE_STATES.has(st) ? 'done' : done && st === 'delivered' ? 'done' : 'live') : done ? 'done' : 'live',
      title: d.label,
      pill: (st && st !== 'not_counted' ? PILL_FOR[st] : null) ?? (done ? 'Done' : late ? 'Late' : making ? 'Making' : 'Ordered'),
      tab: done ? 'done' : 'production',
      pillIcon: st === 'held' ? 'calendar' : st === 'counted' || (!st && done) ? 'check' : 'dot',
      blurb: '', cost: null, recurring: false, perf: null, review: false,
      href: `/dashboard/requests/${d.id}`,
      action: st ? ACTION_FOR[st] : done ? 'See it' : null,
      when: `Ordered ${day(d.orderedOn)}${d.dueDate && !done ? (late ? ` · was due ${day(d.dueDate)}. We owe you this.` : ` · due ${day(d.dueDate)}`) : ''}`,
      hue: 'mint', promise: d.line, openUrl: d.openUrl, state: st,
    }
  })
  const cards: HuedCard[] = [...campaignCards, ...deskCards]
  const counts: Record<Tab, number> = {
    all: cards.length,
    live: cards.filter((c) => tabOf(c) === 'live').length,
    production: cards.filter((c) => tabOf(c) === 'production').length,
    done: cards.filter((c) => tabOf(c) === 'done').length,
  }
  const shown = tab === 'all' ? cards : cards.filter((c) => tabOf(c) === tab)

  const loading = clientLoading || saved === null
  const empty = !loading && cards.length === 0 && !error

  return (
    <div style={{ fontFamily: "'Inter',system-ui,sans-serif", color: C.ink, background: '#fff', minHeight: '100%', overflowY: 'auto', paddingBottom: 28 }}>
      <style>{ANIM}</style>

      <div style={{ padding: '16px 18px 0' }}>
        {/* The calendar is a row (owner 2026-09-11), where Orders used to be: tap it for the month
            view, tap again for the list. Orders keep their door on the More hub. */}
        {!empty && (
          <button type="button" onClick={() => setView(view === 'calendar' ? 'list' : 'calendar')} className="mvp-row" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 2px', minHeight: 46, marginBottom: 10, borderRadius: 12, width: '100%', border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit' }}>
            <Mark hue="mint" size={36} bare>{view === 'calendar' ? <LayoutList size={18} /> : <CalendarDays size={18} />}</Mark>
            <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 500, color: C.ink }}>{view === 'calendar' ? 'Campaigns' : 'Calendar'}</span>
            <ChevronRight size={17} color={C.faint} />
          </button>
        )}

        {/* the builder card and the occasion rail are gone (owner 2026-09-04): the + tab is the door in */}
        {/* GD-3: the occasion calendar brings graphic demand to the owner. The
            next few national moments, each with enough lead time to order today
            and have the piece in hand — one tap opens the design order
            pre-filled with the occasion and its date. Campaigns page by owner
            call (2026-08-19): Home stays pure dashboard. */}

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '40px 0', color: C.faint, fontSize: 13.5 }}><Loader2 size={16} className="animate-spin" /> Loading your campaigns…</div>
        ) : error ? (
          <div style={{ color: C.red, fontSize: 13.5, padding: '20px 0', textAlign: 'center' }}>Couldn&apos;t load campaigns: {error}</div>
        ) : empty ? (
          <EmptyState />
        ) : view === 'calendar' ? (
          <MvpCalendar clientId={client?.id} campaigns={saved ?? []} />
        ) : (
          <>
            {/* the same tabs Create's stages wear (owner 2026-09-11): a coloured outline each, the
                picked one filled */}
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none', marginBottom: 16, padding: '2px 0' }}>
              {([['all', 'All', '#2e9a78'], ['live', 'Live', '#17ad6b'], ['production', 'In progress', '#3b6fd4'], ['done', 'History', '#6a39de']] as const).map(([k, l, col]) => {
                const on = tab === k
                const n = k === 'all' ? undefined : counts[k]
                return (
                  <button key={k} type="button" onClick={() => setTab(k)} style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 99, border: `1.5px solid ${col}`, background: on ? col : '#fff', color: on ? '#fff' : col, fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', cursor: 'pointer', fontFamily: 'inherit', boxShadow: on ? `0 6px 14px ${col}55` : 'none', transition: 'background .15s, color .15s' }}>
                    <span style={{ width: 7, height: 7, borderRadius: 99, background: on ? 'rgba(255,255,255,.9)' : col }} />{l}{n ? <span style={{ opacity: .85 }}>{n}</span> : null}
                  </button>
                )
              })}
            </div>
            {shown.length === 0 ? (
              <div style={{ background: '#fff', border: `0.5px dashed ${C.line}`, borderRadius: 16, padding: '26px 16px', textAlign: 'center', color: C.faint, fontSize: 13.5 }}>Nothing in this filter.</div>
            ) : (
              <div className="cc-stagger" key={tab}>
                {shown.map((c) => <CampaignCard key={c.key} c={c} />)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div style={{ padding: '34px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <Mark hue="mint" size={48}><Plus size={24} /></Mark>
      <div style={{ fontFamily: DISPLAY, fontSize: 19, fontWeight: 600 }}>No orders yet</div>
      <div style={{ fontSize: 13, color: C.mute, lineHeight: 1.5, maxWidth: 280 }}>Everything you order on Create shows here, from the day you order to the day it is counted.</div>
      <Link href="/dashboard/campaigns/new" style={{ marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 6, background: C.ink, color: '#fff', textDecoration: 'none', borderRadius: 12, padding: '11px 18px', fontWeight: 700, fontSize: 14 }}><Plus size={16} strokeWidth={2.5} /> Open Create</Link>
    </div>
  )
}

function Spark({ values, color }: { values: number[]; color: string }) {
  if (!values || values.length < 2) return null
  const max = Math.max(...values), min = Math.min(...values), range = max - min || 1
  const w = 56, h = 20
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - min) / range) * h}`).join(' ')
  return <svg width={w} height={h} style={{ display: 'block' }}><polyline points={pts} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" /></svg>
}

function CampaignCard({ c }: { c: HuedCard }) {
  /* A campaign looks like its goal (portal redesign 2026-09-04): a colour band and a goal
     glyph per card, status as a pill, the since-launch numbers in a strip, one action. */
  const needsYou = c.kind !== 'draft' && c.review   // shipped but waiting on the owner's setup
  const [h1, h2] = hueOf(c.hue)
  const Glyph = GLYPH[c.hue] ?? Sparkles
  // Waiting on us reads amber; a thing that landed or is counting reads mint; history reads grey.
  const WAITING = c.pill === 'Ordered' || c.pill === 'In production' || c.pill === 'Held'
  const pill = c.kind === 'done'
    ? { bg: '#eef0ef', fg: C.mute }
    : c.pill === 'Late'
      ? { bg: '#fbeaea', fg: '#c92d32' } // the kit's red: a promise we missed, said plainly
    : needsYou || WAITING
      ? { bg: '#FEF4E4', fg: '#8A5A12' }
      : { bg: C.greenSoft, fg: C.greenDk }
  // A delivered order's action OPENS THE THING. It has to be its own link (a file, on someone
  // else's host), which is why the action row sits outside the card's link to the order instead
  // of being nested inside it.
  const openable = !!c.openUrl && c.action === 'Open what landed'
  const ts = (t: 'up' | 'down' | 'flat') => t === 'up' ? { c: C.greenDk, I: TrendingUp } : t === 'down' ? { c: C.red, I: TrendingDown } : { c: C.mute, I: Minus }
  const strip: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 14, margin: '10px 0 0', padding: '8px 10px', borderRadius: 12, background: '#f5f5f7' }
  const big: React.CSSProperties = { display: 'block', fontFamily: DISPLAY, fontSize: 15, fontWeight: 600, color: C.ink, fontVariantNumeric: 'normal', lineHeight: 1.1 }
  const small: React.CSSProperties = { fontSize: 11, color: C.mute }

  return (
    <div className="mvp-row" style={{ display: 'flex', borderRadius: 14, marginBottom: 14 }}>
      <div style={{ width: 4, flexShrink: 0, borderRadius: 2, background: `linear-gradient(${h1}, ${h2})` }} />
      <div style={{ flex: 1, minWidth: 0, padding: '2px 4px 2px 12px' }}>
        <Link href={c.href} style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Mark hue={c.hue} size={38}><Glyph size={18} /></Mark>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 15.5, color: C.ink, lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</div>
            <div style={{ fontSize: 12, color: C.mute, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.when ?? c.blurb}</div>
          </div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: pill.bg, color: pill.fg, borderRadius: 99, padding: '3px 8px', fontWeight: 600, fontSize: 11, flexShrink: 0, whiteSpace: 'nowrap' }}>
            {c.pillIcon === 'check' ? <Check size={11} strokeWidth={3} /> : c.pillIcon === 'calendar' ? <CalendarDays size={11} /> : null}{c.pill}
          </span>
        </div>

        {c.perf?.type === 'trend' && (() => { const s = ts(c.perf.trend); return (
          <div style={strip}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ ...big, color: s.c, display: 'flex', alignItems: 'center', gap: 5 }}><s.I size={14} /> {c.perf.metric}</span>
              <span style={small}>{c.perf.note ? c.perf.note : 'On Google since launch'}</span>
            </div>
            <Spark values={c.perf.spark} color={s.c} />
          </div>
        ) })()}
        {c.perf?.type === 'progress' && (() => { const pct = c.perf.total ? c.perf.live / c.perf.total : 0; return (
          <div style={strip}>
            <div><span style={big}>{c.perf.live} of {c.perf.total}</span><span style={small}>parts live</span></div>
            <div style={{ flex: 1, height: 6, borderRadius: 99, background: '#e6e6ea', overflow: 'hidden' }}><div style={{ width: `${Math.max(5, pct * 100)}%`, height: '100%', background: gradOf(c.hue, 90), borderRadius: 99 }} /></div>
            <span style={{ ...small, fontWeight: 700, color: h2 }}>{Math.round(pct * 100)}%</span>
          </div>
        ) })()}
        {c.perf?.type === 'ready' && (
          <div style={strip}>
            <div><span style={big}>{c.perf.ready}</span><span style={small}>parts ready</span></div>
            <span style={{ ...small, display: 'inline-flex', alignItems: 'center', gap: 5 }}><Clock size={13} /> waiting to go live</span>
          </div>
        )}
        {/* THE PROMISE, CARRIED: the same line Create printed under the price and Home prints on
            the strip, through its life: "Counted after: …" → "Counting · …" → "41 · was 13". */}
        {c.promise && (
          <div style={{ marginTop: 8, fontSize: 12, color: c.promise.startsWith('Not counted') || c.promise.startsWith('Stopped') ? C.mute : C.greenDk, lineHeight: 1.4 }}>{c.promise}</div>
        )}
        </Link>

        {c.action && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginTop: 10 }}>
            {openable ? (
              <a href={c.openUrl as string} target="_blank" rel="noopener noreferrer" style={ACTION_STYLE(needsYou, c.hue)}>{c.action} <ArrowRight size={14} /></a>
            ) : (
              <Link href={c.href} style={ACTION_STYLE(needsYou, c.hue)}>{c.action} <ArrowRight size={14} /></Link>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/* One action button, whichever link it turns out to be. */
const ACTION_STYLE = (needsYou: boolean, hue: HueKey): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 5, height: 32, padding: '0 14px', borderRadius: 16,
  fontFamily: DISPLAY, fontSize: 13, fontWeight: 600, textDecoration: 'none',
  color: needsYou ? '#fff' : C.ink,
  background: needsYou ? gradOf(hue) : '#f0f0f2',
  boxShadow: needsYou ? `0 6px 16px ${tint(hue, 0.4, 1)}` : 'none',
})

/* Month calendar: campaign target dates as dots. */
function CampaignCalendar({ saved }: { saved: SavedCampaign[] }) {
  const [cur, setCur] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() } })
  const first = new Date(cur.y, cur.m, 1)
  const startDow = first.getDay()
  const days = new Date(cur.y, cur.m + 1, 0).getDate()
  const monthLabel = first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const today = new Date()
  const isToday = (d: number) => today.getFullYear() === cur.y && today.getMonth() === cur.m && today.getDate() === d

  const marks: Record<number, number> = {}
  for (const s of saved) {
    const td = s.draft.targetDate
    if (!td) continue
    const d = new Date(td + 'T00:00:00')
    if (d.getFullYear() === cur.y && d.getMonth() === cur.m) marks[d.getDate()] = (marks[d.getDate()] ?? 0) + 1
  }

  const cells: (number | null)[] = [...Array(startDow).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)]
  return (
    <div style={{ background: '#fff', borderRadius: 16, boxShadow: CARD_SHADOW, padding: '14px 14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <button onClick={() => setCur((c) => ({ y: c.m === 0 ? c.y - 1 : c.y, m: c.m === 0 ? 11 : c.m - 1 }))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.mute, padding: 4 }}><ChevronLeft size={18} /></button>
        <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 15 }}>{monthLabel}</span>
        <button onClick={() => setCur((c) => ({ y: c.m === 11 ? c.y + 1 : c.y, m: c.m === 11 ? 0 : c.m + 1 }))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.mute, padding: 4 }}><ChevronRight size={18} /></button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, marginBottom: 4 }}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <div key={i} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: C.faint }}>{d}</div>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
        {cells.map((d, i) => (
          <div key={i} style={{ aspectRatio: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, borderRadius: 9, background: d && isToday(d) ? C.greenSoft : 'transparent' }}>
            {d && <span style={{ fontSize: 12, fontWeight: isToday(d) ? 700 : 500, color: isToday(d) ? C.greenDk : C.ink }}>{d}</span>}
            <div style={{ display: 'flex', gap: 2, height: 4 }}>
              {Array.from({ length: Math.min(3, marks[d ?? -1] ?? 0) }).map((_, j) => <span key={j} style={{ width: 4, height: 4, borderRadius: 99, background: C.green }} />)}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 12, fontSize: 11, color: C.mute }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: 99, background: C.green }} /> Campaign date</span>
      </div>
    </div>
  )
}


/* ── Occasions coming up (GD-3) ──────────────────────────────────────────────
   Pure client-side date math (occasions.ts); shows nothing when no occasion is
   inside the window, so the rail never renders an empty promise. */
function OccasionsRail() {
  const router = useRouter()
  const [drafting, setDrafting] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const occs = upcomingOccasions()
  if (occs.length === 0) return null
  const fmt = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  /* The full ladder on one card (GD-4c): free AI draft (Pro) on top, the paid
   * designer order underneath. The draft lands in approvals, where posting it
   * free and "Have a designer finish this" both already live. */
  const draftIt = async (id: string) => {
    if (drafting) return
    setDrafting(id); setNote(null)
    try {
      const r = await fetch('/api/design/draft', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ occasion: id }) })
      const d = await r.json().catch(() => ({}))
      if (r.ok && d.id) { router.push(`/dashboard/approvals/${d.id}`); return }
      setNote(typeof d.error === 'string' ? d.error : 'Could not make the draft. Try again.')
    } catch {
      setNote('Could not make the draft. Try again.')
    }
    setDrafting(null)
  }
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 15.5, fontWeight: 600, letterSpacing: '-.01em', color: C.ink, padding: '0 2px 8px' }}>Coming up</div>
      {note && <div style={{ fontSize: 12.5, color: '#8a5a0c', background: '#fbf3e4', border: '0.5px solid #eed9b3', borderRadius: 10, padding: '8px 11px', margin: '0 0 8px' }}>{note}</div>}
      <div className="cc-scroll" style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
        {occs.map((o) => (
          <div
            key={o.id}
            className="mvp-row"
            style={{ flex: '0 0 auto', width: 210, background: '#fff', borderRadius: 16, boxShadow: CARD_SHADOW, padding: '13px 14px' }}
          >
            <span style={{ display: 'block', fontSize: 22, lineHeight: 1 }}>{o.emoji}</span>
            <span style={{ display: 'block', fontSize: 14.5, fontWeight: 700, color: C.ink, marginTop: 8, lineHeight: 1.25 }}>{o.name}</span>
            <span style={{ display: 'block', fontSize: 12, color: C.mute, marginTop: 2 }}>
              {fmt(o.dateISO)} · in {o.daysAway} days
            </span>
            <button
              type="button"
              onClick={() => draftIt(o.id)}
              disabled={drafting !== null}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 700, color: '#fff', background: C.greenDk, border: 'none', borderRadius: 999, padding: '7px 12px', marginTop: 10, cursor: 'pointer', opacity: drafting && drafting !== o.id ? 0.5 : 1 }}
            >
              {drafting === o.id ? 'Drafting…' : 'Draft it free'}
              <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.05em', background: 'rgba(255,255,255,0.25)', borderRadius: 5, padding: '1.5px 5px' }}>PRO</span>
            </button>
            <Link
              href={`/dashboard/design/order?occasion=${o.id}`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12.5, fontWeight: 700, color: C.greenDk, textDecoration: 'none', marginTop: 8 }}
            >
              Designer · from ${RATE_CARD.tierBase[1]} <ArrowRight size={13} />
            </Link>
          </div>
        ))}
      </div>
    </div>
  )
}
