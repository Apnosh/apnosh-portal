'use client'

/**
 * MVP Campaigns — the RESULTS story: launched campaigns only (in production /
 * live / done), outcome-forward cards wired to real campaigns from /api/campaigns.
 * The MONEY story (cart, plan prices, billed-so-far, receipts) lives on the
 * Orders tab — cards here deliberately carry no dollar amounts. Both tabs open
 * the same campaign detail page, where all actions (and the honest bill) live.
 */

import { useState, useEffect } from 'react'
import { Segmented, CARD_SHADOW } from './kit'
import { outcomeLine, type CampaignOutcome } from '@/lib/campaigns/outcome-view'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import MvpCalendar from './mvp-calendar'
import { useClient } from '@/lib/client-context'
import {
  ArrowRight, CalendarDays, Check, ChevronLeft, ChevronRight, Clock, Loader2, Minus, Plus, TrendingDown, TrendingUp, ShoppingBag } from 'lucide-react'
import { campaignCardVM, type CampCard, type SavedCampaign, type CampaignProgress } from '@/lib/campaigns/view'
import { upcomingOccasions } from '@/lib/design/occasions'
import { RATE_CARD } from '@/lib/design/rate-card'
import { campaignHue, gradOf, glow, hueOf, tint, type HueKey } from './hues'
import { Megaphone, Ticket, Tag, Moon, MapPin, Heart, Star, ShoppingCart, Users, Share2, Sparkles, FileText, AlertCircle } from 'lucide-react'

/* one glyph per goal hue; the campaign card's tile */
const GLYPH: Record<HueKey, typeof Megaphone> = {
  mint: Sparkles, announce: Megaphone, event: Ticket, deal: Tag, nights: Moon, newfaces: MapPin, regulars: Heart,
  reviews: Star, online: ShoppingCart, catering: Users, brand: Share2, amber: Clock, grey: FileText, red: AlertCircle,
}
type HuedCard = CampCard & { hue: HueKey }

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

export default function MvpCampaigns({ view: viewProp }: { view?: 'list' | 'calendar' } = {}) {
  const { client, loading: clientLoading } = useClient()
  const [saved, setSaved] = useState<SavedCampaign[] | null>(null)
  const [progress, setProgress] = useState<Record<string, CampaignProgress>>({})
  const [outcomes, setOutcomes] = useState<Record<string, CampaignOutcome>>({})
  const [error, setError] = useState<string | null>(null)
  const [viewState, setView] = useState<'list' | 'calendar'>('list')
  const view = viewProp ?? viewState // the top row owns List/Calendar now (2026-09-04); the inline control is the fallback
  const [tab, setTab] = useState<Tab>('all')

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
  const cards: HuedCard[] = (saved ?? []).map((c) => {
    const o = outcomes[c.draft.id]
    const line = o ? outcomeLine(o) : null
    const vm = campaignCardVM(c, progress[c.draft.id], line ? { ...line, spark: o.spark } : null)
    return { ...vm, hue: campaignHue({ goalKey: c.draft.goalKey, templateId: c.draft.sourceCatalogId, name: c.draft.name }) }
  }).filter((c) => c.kind !== 'draft')
  const counts: Record<Tab, number> = {
    all: cards.length,
    live: cards.filter((c) => c.kind === 'live').length,
    production: cards.filter((c) => c.pill === 'In production').length,
    done: cards.filter((c) => c.kind === 'done').length,
  }
  const shown = tab === 'all' ? cards
    : tab === 'live' ? cards.filter((c) => c.kind === 'live')
    : tab === 'production' ? cards.filter((c) => c.pill === 'In production')
    : cards.filter((c) => c.kind === 'done')

  const loading = clientLoading || saved === null
  const empty = !loading && cards.length === 0 && !error

  return (
    <div style={{ fontFamily: "'Inter',system-ui,sans-serif", color: C.ink, background: '#fff', minHeight: '100%', overflowY: 'auto', paddingBottom: 28 }}>
      <style>{ANIM}</style>
      <div style={{ background: '#fff', padding: '14px 18px 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 15, color: C.ink, fontWeight: 600 }}>Campaigns</div>
      </div>

      <div style={{ padding: '16px 18px 0' }}>
        {!empty && viewProp == null && (
          <div style={{ display: 'inline-flex', borderRadius: 999, padding: 3, marginBottom: 18, background: 'rgba(240,241,240,0.72)', backdropFilter: 'saturate(180%) blur(16px)', WebkitBackdropFilter: 'saturate(180%) blur(16px)', border: '1px solid rgba(255,255,255,0.75)', boxShadow: '0 1px 2px rgba(0,0,0,.04), 0 8px 24px rgba(0,0,0,.08)' }}>
            {([['list', 'List'], ['calendar', 'Calendar']] as const).map(([k, l]) => {
              const on = view === k
              return <button key={k} onClick={() => setView(k)} style={{ border: 'none', borderRadius: 999, padding: '7px 18px', fontSize: 13, fontWeight: on ? 700 : 500, color: on ? C.ink : C.mute, background: on ? '#fff' : 'transparent', boxShadow: on ? '0 2px 6px rgba(0,0,0,.12)' : 'none', cursor: 'pointer', transition: 'all .15s' }}>{l}</button>
            })}
          </div>
        )}

        {/* Orders moved in here from its own tab (owner 2026-09-04): one row through to receipts */}
        <Link href="/dashboard/orders" className="mvp-row" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', marginBottom: 14, borderRadius: 16, background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,.04), 0 6px 20px rgba(0,0,0,.05)', textDecoration: 'none', color: 'inherit' }}>
          <span style={{ width: 38, height: 38, borderRadius: 12, background: gradOf('mint'), boxShadow: glow('mint', 0.28), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><ShoppingBag size={18} /></span>
          <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600, color: C.ink }}>Orders</span>
          <ChevronRight size={17} color={C.faint} />
        </Link>

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
            <div style={{ marginBottom: 16 }}>
              <Segmented items={[['all', 'All'], ['live', 'Live'], ['production', 'In progress'], ['done', 'History']]} value={tab} onChange={setTab} counts={counts} />
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
    <div style={{ background: '#fff', border: `0.5px dashed ${C.line}`, borderRadius: 18, padding: '34px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 48, height: 48, borderRadius: 14, background: gradOf('mint'), boxShadow: glow('mint'), display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={24} color="#fff" /></div>
      <div style={{ fontFamily: DISPLAY, fontSize: 19, fontWeight: 600 }}>No campaigns yet</div>
      <div style={{ fontSize: 13, color: C.mute, lineHeight: 1.5, maxWidth: 280 }}>Start one and your strategist runs it — you just approve. Pick a goal and we build the plan.</div>
      <Link href="/dashboard/campaigns/new" style={{ marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 6, background: C.ink, color: '#fff', textDecoration: 'none', borderRadius: 12, padding: '11px 18px', fontWeight: 700, fontSize: 14 }}><Plus size={16} strokeWidth={2.5} /> New campaign</Link>
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
  const pill = c.kind === 'done'
    ? { bg: '#eef0ef', fg: C.mute }
    : needsYou || c.pill === 'In production'
      ? { bg: '#FEF4E4', fg: '#8A5A12' }
      : { bg: C.greenSoft, fg: C.greenDk }
  const ts = (t: 'up' | 'down' | 'flat') => t === 'up' ? { c: C.greenDk, I: TrendingUp } : t === 'down' ? { c: C.red, I: TrendingDown } : { c: C.mute, I: Minus }
  const strip: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 14, margin: '10px 0 0', padding: '8px 10px', borderRadius: 12, background: '#f5f5f7' }
  const big: React.CSSProperties = { display: 'block', fontFamily: DISPLAY, fontSize: 15, fontWeight: 600, color: C.ink, fontVariantNumeric: 'normal', lineHeight: 1.1 }
  const small: React.CSSProperties = { fontSize: 11, color: C.mute }

  return (
    <Link href={c.href} style={{ display: 'flex', textDecoration: 'none', color: 'inherit', overflow: 'hidden', background: '#fff', borderRadius: 18, boxShadow: CARD_SHADOW, marginBottom: 10 }}>
      <div style={{ width: 6, flexShrink: 0, background: `linear-gradient(${h1}, ${h2})` }} />
      <div style={{ flex: 1, minWidth: 0, padding: '12px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 38, height: 38, borderRadius: 12, background: gradOf(c.hue), boxShadow: glow(c.hue, 0.3), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Glyph size={18} /></span>
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
        {c.perf == null && c.blurb && c.when && (
          <div style={{ fontSize: 12.5, color: C.mute, lineHeight: 1.35, marginTop: 8 }}>{c.blurb}</div>
        )}

        {c.action && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginTop: 10 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 32, padding: '0 14px', borderRadius: 16, fontFamily: DISPLAY, fontSize: 13, fontWeight: 600, color: needsYou ? '#fff' : C.ink, background: needsYou ? gradOf(c.hue) : '#f0f0f2', boxShadow: needsYou ? `0 6px 16px ${tint(c.hue, 0.4, 1)}` : 'none' }}>{c.action} <ArrowRight size={14} /></span>
          </div>
        )}
      </div>
    </Link>
  )
}

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
