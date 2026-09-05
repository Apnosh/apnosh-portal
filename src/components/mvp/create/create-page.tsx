'use client'

/**
 * Create (owner 2026-09-05, the round-4 design built out).
 *
 * Browse: a describe-it box on top, a goal rail, then shelves in three sizes: quick asks (small),
 * campaigns (standard), the programs we run monthly (big), and the setups (rows). Search reads
 * plain words with four filters. Guide me asks three questions and hands back a starter shelf with
 * a why for each pick. A product page says what it costs, when, what you do, where it shows up,
 * what you get, and what happens after you order. Order hands off to the builder that already
 * exists (/campaigns/new/build), the Request Desk for creative asks, or the design order.
 *
 * Honest by construction: cards that are not fully built wear "Coming soon" and do not sell.
 * Every price, turnaround and availability comes from the same modules the builder uses.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, ChevronDown, ChevronLeft, ChevronRight, Check, Search, Sparkles, X, Megaphone, Ticket, Tag, Moon, MapPin, Heart, Star, ShoppingCart, Users, Share2, Eye, Lightbulb, MousePointerClick, DoorOpen, Repeat, Loader2, Compass, Image as ImageIcon, Store, Camera, Video, Mail, PenLine, Gift, Clock, Wrench, BarChart3 } from 'lucide-react'
import MvpShell from '../mvp-shell'
import TopRow from '../top-row'
import { useClient } from '@/lib/client-context'
import { gradOf, hueOf, tint, type HueKey } from '../hues'
import { Mark } from '../mark'
import { GOALS, GOAL_CARDS, FILTERS, GUIDE_QS, QUICK_IDS, SEASON_IDS, PROGRAM_IDS, SETUP_IDS, SITUATION_GOAL, isBuyable, matchWord, searchCards, shelfCard, shelfCards, starterPicks, type FilterKey, type ShelfCard, type ShelfGoal, type ShelfStage } from '@/lib/campaigns/data/shelf'

const C = { ink: '#1d1d1f', mute: '#6e6e73', faint: '#aeaeb2', line: '#e6e6ea', fill: '#f5f5f7', mint: '#4abd98', mintDk: '#2e9a78', mintSoft: '#eaf7f3', amberInk: '#8a5a0c', amberBg: '#fbf3e4' }
const DISPLAY = "'Cal Sans','Inter',sans-serif"
const GLASS: React.CSSProperties = { background: 'rgba(240,241,240,0.72)', border: '1px solid rgba(255,255,255,0.75)', backdropFilter: 'saturate(180%) blur(16px)', WebkitBackdropFilter: 'saturate(180%) blur(16px)' }
const CARD_SHADOW = '0 1px 2px rgba(0,0,0,.04), 0 6px 20px rgba(0,0,0,.05)'

const GOAL_ICON: Record<ShelfGoal, typeof Megaphone> = { foryou: Sparkles, announce: Megaphone, event: Ticket, deal: Tag, nights: Moon, newfaces: MapPin, regulars: Heart, reviews: Star, online: ShoppingCart, catering: Users, brand: Share2 }
const STAGE_ICON: Record<ShelfStage, typeof Eye> = { Awareness: Eye, Interest: Lightbulb, Actions: MousePointerClick, Orders: DoorOpen, Retention: Repeat }
const STAGE_HUE: Record<ShelfStage, HueKey> = { Awareness: 'mint', Interest: 'nights', Actions: 'newfaces', Orders: 'amber', Retention: 'brand' }
const KIND_ICON: Record<string, typeof Store> = { design: ImageIcon, 'creative-graphic': ImageIcon, 'creative-social': Share2, 'creative-video': Video, 'creative-photos': Camera, 'creative-copy': PenLine, 'creative-email': Mail, 'creative-print': Ticket, 'creative-logo': Sparkles, 'creative-website': Store, 'creative-ads': Megaphone, 'creative-menu': Tag, 'creative-other': Wrench, story: ImageIcon, gpost: Store, dish: Camera, reel: Video, graphic: ImageIcon, edit: Video, earlyaccess: Mail, slowoffer: Tag, winback: Heart, promoevent: Ticket, launch: Tag, ticket: Ticket, creator: Users, catering: Users, reviewsplan: Star, giftcard: Gift, shoot: Camera, gbp: Store, listings: MapPin, socialprofiles: Share2, measure: BarChart3, emaildeliver: Mail, deliverymenu: ShoppingCart, friction: ShoppingCart, direct: ShoppingCart, website: Store, localseo: MapPin, pos: ShoppingCart, welcome: Mail, birthday: Gift, news: Mail, loyalty: Heart, nights: Moon, firstvisit: MapPin, regulars: Heart, reach: Megaphone, reviewsreply: Star, socialmgmt: Share2, gbpmgmt: Store }
const iconFor = (c: ShelfCard) => KIND_ICON[c.id] ?? GOAL_ICON[c.goal]
const YOU_ICON: Record<string, typeof Check> = { Nothing: Check, Approve: Eye, 'Show up': Users }

type View = { name: 'browse' } | { name: 'search' } | { name: 'guide' } | { name: 'product'; id: string }

interface Signals { views30d?: number; actions30d?: { directions: number; calls: number; websiteClicks: number }; rating?: number; ratingCount?: number; unrepliedReviews?: number; listingGaps?: string[] }
interface Describe { ok: boolean; reason?: string; situation: string | null; summary: string; unsupported: string[]; when?: string | null }

export default function CreatePage() {
  const router = useRouter()
  const params = useSearchParams()
  const { client } = useClient()
  const clientId = client?.id
  // the view lives in the URL so back works and a product can be shared
  const view: View = useMemo(() => {
    const item = params.get('item'); if (item) return { name: 'product', id: item }
    const v = params.get('view'); if (v === 'search') return { name: 'search' }; if (v === 'guide') return { name: 'guide' }
    return { name: 'browse' }
  }, [params])
  const go = useCallback((v: View) => {
    const qs = new URLSearchParams(params.toString()); qs.delete('item'); qs.delete('view')
    if (v.name === 'product') qs.set('item', v.id); else if (v.name !== 'browse') qs.set('view', v.name)
    router.push(`/dashboard/campaigns/new${qs.toString() ? `?${qs}` : ''}`)
  }, [params, router])
  const back = () => router.back()

  const [goal, setGoal] = useState<ShelfGoal>('foryou')
  const [q, setQ] = useState('')
  const [filters, setFilters] = useState<Record<FilterKey, string>>({ budget: 'any', you: 'any', speed: 'any', kind: 'any' })
  const [sheet, setSheet] = useState<FilterKey | null>(null)
  const [signals, setSignals] = useState<Signals | null>(null)
  const [recs, setRecs] = useState<{ id: string; reason: string }[] | null>(null)
  const [done, setDone] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!clientId) return
    let live = true
    fetch(`/api/dashboard/why-signals?clientId=${clientId}`).then((r) => (r.ok ? r.json() : null)).then((j) => { if (live && j) setSignals(j as Signals) }).catch(() => {})
    fetch(`/api/campaigns/recommend-items?clientId=${clientId}`).then((r) => (r.ok ? r.json() : null)).then((j) => { if (live && Array.isArray(j?.recommended)) setRecs(j.recommended as { id: string; reason: string }[]) }).catch(() => { if (live) setRecs([]) })
    fetch(`/api/campaigns?clientId=${clientId}`).then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (!live || !Array.isArray(j?.campaigns)) return
      const ids = new Set<string>()
      for (const c of j.campaigns as Array<{ status: string; draft?: { sourceCatalogId?: string; sourceCatalogIds?: string[] } }>) {
        if (c.status !== 'shipped') continue
        if (c.draft?.sourceCatalogId) ids.add(c.draft.sourceCatalogId)
        for (const x of c.draft?.sourceCatalogIds ?? []) ids.add(x)
      }
      setDone(ids)
    }).catch(() => {})
    return () => { live = false }
  }, [clientId])

  /* why-now lines from the account's own numbers */
  const whyNow = useCallback((c: ShelfCard): string | null => {
    const s = signals; if (!s) return null
    if ((c.id === 'reviewsreply' || c.id === 'reviewsplan') && s.unrepliedReviews) return `${s.unrepliedReviews} reviews are waiting for a reply`
    if (c.id === 'reviewsplan' && s.rating != null && s.rating < 4.3) return `You are at ${s.rating.toFixed(1)} stars`
    if ((c.id === 'gbp' || c.id === 'listings') && s.listingGaps?.length) return `${s.listingGaps.length} thing${s.listingGaps.length === 1 ? '' : 's'} on your listing need fixing`
    if (c.id === 'gpost' && s.views30d) return `${s.views30d.toLocaleString()} people saw your listing this month`
    if (c.id === 'friction' && s.actions30d && s.actions30d.directions > 0) return `${s.actions30d.directions} people asked for directions this month`
    return null
  }, [signals])

  const open = (c: ShelfCard) => go({ name: 'product', id: c.id })
  const order = (c: ShelfCard) => {
    if (!isBuyable(c)) return
    if (c.handoff.kind === 'request') router.push(`/dashboard/requests?type=${c.handoff.type}`)
    else if (c.handoff.kind === 'design') router.push('/dashboard/design/order')
    else router.push(`/dashboard/campaigns/new/build?template=${c.handoff.id}&view=build`)
  }

  /* ── pieces ── */
  const Coming = () => <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: C.mute, background: C.fill, borderRadius: 99, padding: '3px 7px' }}>Coming soon</span>
  const Facts = ({ c, compact }: { c: ShelfCard; compact?: boolean }) => (
    <div style={{ display: 'flex', gap: compact ? 10 : 14, marginTop: 8 }}>
      {([[c.price, 'price'], [c.ready, 'ready in'], [c.you, 'you do']] as [string, string][]).map(([v, l], i) => (
        <div key={l} style={{ minWidth: 0, flex: i === 0 ? '1 1 auto' : '0 0 auto' }}>
          <div style={{ fontFamily: DISPLAY, fontSize: compact ? 12.5 : 14.5, fontWeight: 600, color: C.ink, fontVariantNumeric: 'normal', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v}</div>
          <div style={{ fontSize: 10.5, color: C.faint }}>{l}</div>
        </div>
      ))}
    </div>
  )

  /* small: a quick ask */
  const Mini = ({ c }: { c: ShelfCard }) => {
    const [h1, h2] = hueOf(c.goal); const Icon = iconFor(c); const buy = isBuyable(c)
    return (
      <button type="button" onClick={() => open(c)} className="mvp-press" style={{ flex: '0 0 auto', width: 150, textAlign: 'left', background: '#fff', borderRadius: 16, boxShadow: CARD_SHADOW, padding: 0, border: 'none', cursor: 'pointer', overflow: 'hidden', font: 'inherit', opacity: buy ? 1 : 0.72 }}>
        <div style={{ height: 66, background: `linear-gradient(135deg, ${h1}, ${h2})`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', position: 'relative' }}>
          <Icon size={26} />
          {!buy && <span style={{ position: 'absolute', top: 7, left: 8 }}><Coming /></span>}
        </div>
        <div style={{ padding: '9px 11px 11px' }}>
          <div style={{ fontFamily: DISPLAY, fontSize: 14, fontWeight: 600, color: C.ink, lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.title}</div>
          <div style={{ fontSize: 12, color: C.mute, marginTop: 3, fontVariantNumeric: 'normal' }}><b style={{ color: C.ink, fontFamily: DISPLAY, fontWeight: 600 }}>{c.price}</b> · {c.ready}</div>
        </div>
      </button>
    )
  }
  /* standard: a campaign */
  const Std = ({ c, badge }: { c: ShelfCard; badge?: string | null }) => {
    const [h1, h2] = hueOf(c.goal); const Icon = iconFor(c); const SI = STAGE_ICON[c.stage]; const buy = isBuyable(c)
    return (
      <button type="button" onClick={() => open(c)} className="mvp-press" style={{ flex: '0 0 auto', width: 236, textAlign: 'left', background: '#fff', borderRadius: 18, boxShadow: CARD_SHADOW, padding: 0, border: 'none', cursor: 'pointer', overflow: 'hidden', font: 'inherit', opacity: buy ? 1 : 0.72 }}>
        <div style={{ height: 104, background: `linear-gradient(135deg, ${h1}, ${h2})`, position: 'relative', color: '#fff' }}>
          {(badge || !buy) && <span style={{ position: 'absolute', top: 9, left: 10, right: 10, display: 'flex' }}>{buy ? <span style={{ fontSize: 10.5, fontWeight: 700, background: 'rgba(255,255,255,.22)', borderRadius: 99, padding: '3px 8px', maxWidth: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{badge}</span> : <Coming />}</span>}
          <span style={{ position: 'absolute', left: 12, bottom: 10, display: 'flex' }}><Icon size={30} /></span>
          <span title={`Moves ${c.stage}`} style={{ position: 'absolute', right: 10, bottom: 10, width: 28, height: 28, borderRadius: 99, background: 'rgba(255,255,255,.22)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><SI size={15} /></span>
        </div>
        <div style={{ padding: '10px 12px 12px' }}>
          <div style={{ fontFamily: DISPLAY, fontSize: 15.5, fontWeight: 600, color: C.ink, lineHeight: 1.15 }}>{c.title}</div>
          <div style={{ fontSize: 12.5, color: C.mute, marginTop: 3, lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{c.sub || c.plain}</div>
          <Facts c={c} compact />
        </div>
      </button>
    )
  }
  /* big: a program we run monthly */
  const Big = ({ c }: { c: ShelfCard }) => {
    const [h1, h2] = hueOf(c.goal); const buy = isBuyable(c)
    return (
      <button type="button" onClick={() => open(c)} className="mvp-press" style={{ display: 'block', width: '100%', textAlign: 'left', background: '#fff', borderRadius: 20, boxShadow: CARD_SHADOW, padding: 0, border: 'none', cursor: 'pointer', overflow: 'hidden', font: 'inherit', marginBottom: 12, opacity: buy ? 1 : 0.78 }}>
        <div style={{ padding: '18px 16px 16px', background: `linear-gradient(135deg, ${h1}, ${h2})`, color: '#fff', position: 'relative' }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, background: 'rgba(255,255,255,.22)', borderRadius: 99, padding: '3px 8px' }}>{buy ? 'We run it monthly' : 'Coming soon'}</span>
          <div style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 600, marginTop: 10, lineHeight: 1.1 }}>{c.title}</div>
          <div style={{ fontSize: 13, opacity: .92, marginTop: 4, maxWidth: 300 }}>{c.plain.split('.')[0]}.</div>
        </div>
        <div style={{ padding: '12px 16px 14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px' }}>
            {c.get.slice(0, 4).map((g) => <div key={g} style={{ display: 'flex', gap: 7, alignItems: 'flex-start', fontSize: 12.5, color: C.ink, lineHeight: 1.3 }}><span style={{ color: h2, marginTop: 2, flexShrink: 0 }}><Check size={13} strokeWidth={3} /></span>{g}</div>)}
          </div>
          <Facts c={c} />
        </div>
      </button>
    )
  }
  /* row: a setup */
  const SetupRow = ({ c }: { c: ShelfCard }) => {
    const Icon = iconFor(c); const isDone = done.has(c.id); const buy = isBuyable(c); const why = whyNow(c)
    return (
      <button type="button" onClick={() => open(c)} className="mvp-press" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '8px 4px', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', font: 'inherit', borderRadius: 12, opacity: buy ? 1 : 0.72 }}>
        <span style={{ width: 22, height: 22, borderRadius: 99, border: `1.5px solid ${isDone ? C.mintDk : C.line}`, background: isDone ? C.mintDk : 'transparent', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{isDone && <Check size={13} strokeWidth={3} />}</span>
        <Mark hue={c.goal} size={34}><Icon size={18} /></Mark>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 15, fontWeight: 500, color: C.ink, textDecoration: isDone ? 'line-through' : 'none', opacity: isDone ? 0.6 : 1 }}>{c.title}</span>
          {(why || !buy) && <span style={{ display: 'block', fontSize: 12, color: why && buy ? C.amberInk : C.mute, marginTop: 1 }}>{buy ? why : 'Coming soon'}</span>}
        </span>
        <span style={{ fontFamily: DISPLAY, fontSize: 13.5, fontWeight: 600, color: C.ink, fontVariantNumeric: 'normal', flexShrink: 0 }}>{isDone ? 'Done' : c.price}</span>
        <ChevronRight size={16} color={C.faint} style={{ flexShrink: 0 }} />
      </button>
    )
  }
  const Sec = ({ t, s, hue, more }: { t: string; s?: string; hue: HueKey; more?: () => void }) => (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '20px 16px 10px' }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: DISPLAY, fontSize: 19, fontWeight: 600, color: C.ink }}><span style={{ width: 8, height: 8, borderRadius: 4, background: gradOf(hue) }} />{t}</div>
        {s && <div style={{ fontSize: 13, color: C.mute, marginTop: 2 }}>{s}</div>}
      </div>
      {more && <button type="button" onClick={more} aria-label="See all" style={{ width: 32, height: 32, border: 'none', background: 'none', color: C.faint, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ChevronRight size={18} /></button>}
    </div>
  )
  const Shelf = ({ children }: { children: React.ReactNode }) => <div className="cc-scroll" style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '2px 16px 8px', scrollbarWidth: 'none' }}>{children}</div>

  /* ── the describe-it box ── */
  const [ask, setAsk] = useState('')
  const [reading, setReading] = useState(false)
  const [read, setRead] = useState<Describe | null>(null)
  const askRef = useRef<HTMLTextAreaElement>(null)
  const describe = async () => {
    const text = ask.trim(); if (!text || reading) return
    setReading(true); setRead(null)
    try {
      const r = await fetch('/api/campaigns/describe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, clientId }) })
      const j = await r.json().catch(() => ({}))
      const res = (j?.result ?? j) as { situation?: string | null; summary?: string; unsupported?: string[]; when?: string | null }
      setRead({ ok: r.ok && j?.ok !== false, reason: j?.reason, situation: res?.situation ?? null, summary: res?.summary ?? '', unsupported: Array.isArray(res?.unsupported) ? res.unsupported : [], when: res?.when ?? null })
      if (res?.situation && SITUATION_GOAL[res.situation]) setGoal(SITUATION_GOAL[res.situation])
    } catch { setRead({ ok: false, reason: 'no answer', situation: null, summary: '', unsupported: [] }) }
    setReading(false)
  }
  const EXAMPLES: [ShelfGoal, string][] = [['event', 'Halloween party Oct 31, want it packed'], ['announce', 'New fall menu lands Sep 18'], ['nights', 'Tuesdays are dead, fill them'], ['catering', 'Get office lunch orders']]
  const SayBox = () => (
    <div style={{ margin: '4px 16px 0', padding: 14, borderRadius: 20, background: 'linear-gradient(135deg, #eaf7f3, #f2f9f6 60%, #f5f5f7)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.mintDk }}><Sparkles size={13} /> Built around your restaurant</div>
      <textarea ref={askRef} value={ask} onChange={(e) => setAsk(e.target.value)} rows={2} placeholder="Say it in a sentence. A date, a dish, a slow night…" style={{ width: '100%', boxSizing: 'border-box', marginTop: 8, border: 'none', background: '#fff', borderRadius: 14, padding: '11px 12px', fontSize: 15, color: C.ink, fontFamily: 'inherit', resize: 'none', outline: 'none', boxShadow: '0 1px 2px rgba(0,0,0,.04)' }} />
      <div className="cc-scroll" style={{ display: 'flex', gap: 6, overflowX: 'auto', marginTop: 8, scrollbarWidth: 'none' }}>
        {EXAMPLES.map(([g, t]) => <button key={t} type="button" onClick={() => { setAsk(t); askRef.current?.focus() }} style={{ flex: '0 0 auto', fontSize: 12, fontWeight: 600, color: hueOf(g === 'foryou' ? 'mint' : g)[1], background: tint(g === 'foryou' ? 'mint' : g, 0.16), border: 'none', borderRadius: 99, padding: '6px 10px', cursor: 'pointer', whiteSpace: 'nowrap' }}>{t}</button>)}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
        <span style={{ flex: 1, fontSize: 12, color: C.mute }}>We read it and suggest a plan. You can change anything.</span>
        <button type="button" onClick={describe} disabled={!ask.trim() || reading} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 38, padding: '0 16px', borderRadius: 19, border: 'none', background: ask.trim() ? gradOf('mint') : '#e3e6e5', color: '#fff', fontFamily: DISPLAY, fontSize: 14, fontWeight: 600, cursor: ask.trim() ? 'pointer' : 'default', boxShadow: ask.trim() ? '0 6px 16px rgba(46,154,120,.35)' : 'none' }}>{reading ? <Loader2 size={15} className="mvp-spin" /> : <ArrowRight size={15} />}{reading ? 'Reading' : 'Plan it'}</button>
      </div>
      {read && (
        <div style={{ marginTop: 12, background: '#fff', borderRadius: 16, padding: 12, boxShadow: '0 1px 2px rgba(0,0,0,.04)' }}>
          {read.ok && read.situation ? (() => {
            const g = SITUATION_GOAL[read.situation] ?? 'announce'
            const picks = GOAL_CARDS[g].map((id) => shelfCard(id)).filter((c): c is ShelfCard => !!c).filter(isBuyable).slice(0, 3)
            const GI = GOAL_ICON[g]
            return (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Mark hue={g} size={32}><GI size={17} /></Mark><div style={{ flex: 1, minWidth: 0 }}><div style={{ fontFamily: DISPLAY, fontSize: 15, fontWeight: 600, color: C.ink }}>{GOALS.find((x) => x.id === g)?.label}</div>{read.summary && <div style={{ fontSize: 12.5, color: C.mute, marginTop: 1 }}>{read.summary}</div>}</div></div>
                {read.unsupported.length > 0 && <div style={{ fontSize: 12, color: C.amberInk, background: C.amberBg, borderRadius: 10, padding: '7px 10px', marginTop: 8 }}>We do not do {read.unsupported.join(', ')} yet. Everything else is below.</div>}
                <div style={{ marginTop: 8 }}>{picks.map((c) => <button key={c.id} type="button" onClick={() => open(c)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '7px 2px', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', font: 'inherit' }}><Mark hue={c.goal} size={30}>{(() => { const I = iconFor(c); return <I size={16} /> })()}</Mark><span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: C.ink }}>{c.title}</span><span style={{ fontFamily: DISPLAY, fontSize: 13, fontWeight: 600, color: C.ink, fontVariantNumeric: 'normal' }}>{c.price}</span><ChevronRight size={15} color={C.faint} /></button>)}</div>
                {picks[0] && <button type="button" onClick={() => order(picks[0])} style={{ width: '100%', height: 44, marginTop: 6, borderRadius: 22, border: 'none', background: gradOf(g), color: '#fff', fontFamily: DISPLAY, fontSize: 14.5, fontWeight: 600, cursor: 'pointer', boxShadow: `0 6px 16px ${tint(g, 0.4, 1)}` }}>Build this <ArrowRight size={15} style={{ verticalAlign: '-2px' }} /></button>}
              </>
            )
          })() : (
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>We could not read that one.</div>
              <div style={{ fontSize: 12.5, color: C.mute, marginTop: 3, lineHeight: 1.45 }}>Pick a goal above and we show the best ways, or send your words to your strategist and a person reads them.</div>
              <Link href={`/dashboard/messages?to=strategist&draft=${encodeURIComponent(ask)}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 8, fontSize: 13, fontWeight: 700, color: C.mintDk, textDecoration: 'none' }}>Send it to Sam <ArrowRight size={14} /></Link>
            </div>
          )}
        </div>
      )}
    </div>
  )

  const AskBox = () => (
    <div style={{ margin: '18px 16px 0', padding: 14, borderRadius: 18, border: `1.5px dashed ${C.line}` }}>
      <div style={{ fontWeight: 600, color: C.ink, marginBottom: 6 }}>Not seeing it? Ask for anything</div>
      <Link href="/dashboard/requests?type=other" style={{ display: 'flex', alignItems: 'center', gap: 10, height: 42, borderRadius: 21, background: C.fill, padding: '0 6px 0 14px', textDecoration: 'none', color: C.faint, fontSize: 14 }}>Tell us what you need<span style={{ marginLeft: 'auto', width: 32, height: 32, borderRadius: 16, background: gradOf('mint'), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ArrowRight size={15} /></span></Link>
    </div>
  )

  /* ── the goal rail ── */
  const Rail = () => (
    <div className="cc-scroll" style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '4px 16px 8px', scrollbarWidth: 'none' }}>
      {GOALS.map((g) => { const on = goal === g.id; const GI = GOAL_ICON[g.id]; const hue: HueKey = g.id === 'foryou' ? 'mint' : g.id
        return <button key={g.id} type="button" onClick={() => setGoal(g.id)} style={{ flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px 0 8px', borderRadius: 17, border: 'none', background: on ? gradOf(hue) : C.fill, color: on ? '#fff' : C.ink, fontSize: 12.5, fontWeight: on ? 700 : 500, cursor: 'pointer', boxShadow: on ? `0 6px 14px ${tint(hue, 0.35, 1)}` : 'none', whiteSpace: 'nowrap' }}><GI size={14} color={on ? '#fff' : hueOf(hue)[1]} />{g.short}</button> })}
    </div>
  )

  /* ── views ── */
  const cards = shelfCards()
  const goalMeta = GOALS.find((g) => g.id === goal)!
  const SearchBar = ({ live }: { live?: boolean }) => live ? (
    <div style={{ ...GLASS, height: 40, borderRadius: 20, display: 'flex', alignItems: 'center', gap: 8, padding: '0 8px 0 14px' }}>
      <Search size={16} color={C.faint} />
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search campaigns" style={{ flex: 1, minWidth: 0, border: 'none', background: 'none', fontSize: 14, color: C.ink, fontFamily: 'inherit', outline: 'none' }} />
      {q && <button type="button" onClick={() => setQ('')} aria-label="Clear" style={{ width: 26, height: 26, borderRadius: 13, border: 'none', background: '#e3e6e5', color: C.mute, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={13} /></button>}
    </div>
  ) : (
    <button type="button" onClick={() => go({ name: 'search' })} style={{ ...GLASS, height: 40, borderRadius: 20, display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', width: '100%', color: C.faint, fontSize: 14, cursor: 'text', fontFamily: 'inherit' }}><Search size={16} /> Search campaigns</button>
  )

  const browse = () => {
    const forYou = goal === 'foryou'
    const goalIds = forYou ? (recs?.length ? recs.map((r) => r.id) : GOAL_CARDS.newfaces.slice(0, 4)) : GOAL_CARDS[goal]
    const goalCards = goalIds.map((id) => cards[id]).filter((c): c is ShelfCard => !!c)
    return (
      <>
        <SayBox />
        {!forYou ? (
          <>
            <Sec t={goalMeta.label} s="The best ways, in order" hue={goal} />
            <Shelf>{goalCards.filter((c) => c.kind !== 'setup').map((c) => c.kind === 'program' ? <div key={c.id} style={{ flex: '0 0 auto', width: 300 }}><Big c={c} /></div> : c.kind === 'quick' ? <Mini key={c.id} c={c} /> : <Std key={c.id} c={c} badge={whyNow(c)} />)}</Shelf>
            {goalCards.some((c) => c.kind === 'setup') && <div style={{ padding: '0 12px' }}>{goalCards.filter((c) => c.kind === 'setup').map((c) => <SetupRow key={c.id} c={c} />)}</div>}
          </>
        ) : (
          <>
            {recs && recs.length > 0 && (<><Sec t="For you" s="From your own numbers" hue="mint" /><Shelf>{recs.map((r) => cards[r.id]).filter((c): c is ShelfCard => !!c).slice(0, 6).map((c) => <Std key={c.id} c={c} badge={recs.find((r) => r.id === c.id)?.reason ?? null} />)}</Shelf></>)}
            <Sec t="Quick asks" s="One thing, done in days" hue="announce" more={() => { setFilters((f) => ({ ...f, kind: 'quick' })); go({ name: 'search' }) }} />
            <Shelf>{QUICK_IDS.map((id) => cards[id]).filter((c): c is ShelfCard => !!c).map((c) => <Mini key={c.id} c={c} />)}</Shelf>
            <Sec t="Campaigns for the season" s="A few pieces over a couple of weeks" hue="event" more={() => { setFilters((f) => ({ ...f, kind: 'campaign' })); go({ name: 'search' }) }} />
            <Shelf>{SEASON_IDS.filter((id) => !(recs ?? []).slice(0, 6).some((r) => r.id === id)).map((id) => cards[id]).filter((c): c is ShelfCard => !!c).map((c) => <Std key={c.id} c={c} badge={whyNow(c)} />)}</Shelf>
            <Sec t="Let us run it" s="Month after month, with a read of what moved" hue="nights" />
            <div style={{ padding: '0 16px' }}>{PROGRAM_IDS.map((id) => cards[id]).filter((c): c is ShelfCard => !!c).slice(0, 2).map((c) => <Big key={c.id} c={c} />)}</div>
            <Sec t="Set up once" s="The basics, ticked off as you go" hue="newfaces" more={() => { setFilters((f) => ({ ...f, kind: 'setup' })); go({ name: 'search' }) }} />
            <div style={{ padding: '0 12px' }}>{SETUP_IDS.map((id) => cards[id]).filter((c): c is ShelfCard => !!c).map((c) => <SetupRow key={c.id} c={c} />)}</div>
          </>
        )}
        <div style={{ margin: '18px 16px 0' }}>
          <button type="button" onClick={() => go({ name: 'guide' })} className="mvp-press" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 18, border: 'none', background: '#fff', boxShadow: CARD_SHADOW, cursor: 'pointer', textAlign: 'left', font: 'inherit' }}>
            <Mark hue="mint" size={38}><Compass size={20} /></Mark>
            <span style={{ flex: 1 }}><span style={{ display: 'block', fontFamily: DISPLAY, fontSize: 15.5, fontWeight: 600, color: C.ink }}>Not sure? Guide me</span><span style={{ display: 'block', fontSize: 12.5, color: C.mute, marginTop: 1 }}>Three questions, then three picks</span></span>
            <ChevronRight size={17} color={C.faint} />
          </button>
        </div>
        <AskBox />
        <div style={{ height: 24 }} />
      </>
    )
  }

  const search = () => {
    const hits = searchCards(q).filter((c) => (Object.keys(FILTERS) as FilterKey[]).every((k) => FILTERS[k].test(c, filters[k])))
    const active = (Object.keys(FILTERS) as FilterKey[]).filter((k) => filters[k] !== 'any')
    return (
      <>
        <div className="cc-scroll" style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '4px 16px 8px', scrollbarWidth: 'none' }}>
          {(Object.keys(FILTERS) as FilterKey[]).map((k) => { const on = filters[k] !== 'any'; const lab = on ? FILTERS[k].opts.find((o) => o[0] === filters[k])![1] : FILTERS[k].label
            return <button key={k} type="button" onClick={() => setSheet(k)} style={{ flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', gap: 4, height: 32, padding: '0 10px 0 12px', borderRadius: 16, border: 'none', background: on ? C.ink : C.fill, color: on ? '#fff' : C.ink, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>{lab}<ChevronDown size={13} /></button> })}
          {active.length > 0 && <button type="button" onClick={() => setFilters({ budget: 'any', you: 'any', speed: 'any', kind: 'any' })} style={{ flex: '0 0 auto', height: 32, padding: '0 12px', borderRadius: 16, border: 'none', background: C.fill, color: C.mute, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Clear {active.length}</button>}
        </div>
        {!q && <div style={{ margin: '4px 16px 0', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: C.mute }}><Lightbulb size={14} color={C.amberInk} />Plain words work: try flyer, menu photos, TikTok, Yelp, coupons</div>}
        <div style={{ padding: '16px 16px 6px', fontFamily: DISPLAY, fontSize: 19, fontWeight: 600, color: C.ink }}>{hits.length} {hits.length === 1 ? 'result' : 'results'}{q ? ` for “${q}”` : ''}</div>
        {hits.length === 0 ? (
          <div style={{ padding: '20px 16px', color: C.mute, fontSize: 13.5, lineHeight: 1.5 }}><b style={{ color: C.ink }}>Nothing matches yet.</b> Loosen a filter, or just tell us what you need.</div>
        ) : (
          <div style={{ padding: '0 12px' }}>
            {hits.map((c) => { const Icon = iconFor(c); const mw = matchWord(c, q); const buy = isBuyable(c)
              return <button key={c.id} type="button" onClick={() => open(c)} className="mvp-press" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '8px 4px', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', font: 'inherit', borderRadius: 12, opacity: buy ? 1 : 0.72 }}>
                <Mark hue={c.goal} size={34}><Icon size={18} /></Mark>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 15, fontWeight: 500, color: C.ink }}>{c.title}</span>
                  <span style={{ display: 'block', fontSize: 12, color: C.mute, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{!buy ? 'Coming soon' : mw ? `matches “${mw}”` : c.sub || c.plain}</span>
                </span>
                <span style={{ textAlign: 'right', flexShrink: 0 }}><span style={{ display: 'block', fontFamily: DISPLAY, fontSize: 14, fontWeight: 600, color: C.ink, fontVariantNumeric: 'normal' }}>{c.price}</span><span style={{ display: 'block', fontSize: 11, color: C.faint }}>{c.ready}</span></span>
              </button> })}
          </div>
        )}
        <AskBox />
        <div style={{ height: 24 }} />
      </>
    )
  }

  const [answers, setAnswers] = useState<string[]>([])
  const guide = () => {
    const step = answers.length
    const s = signals
    const path: [string, string, typeof Eye, string, HueKey][] = [
      ['found', 'Found', Eye, s?.views30d ? `${s.views30d.toLocaleString()} saw your listing this month` : 'How many people see you', 'mint'],
      ['tempt', 'Tempted', Lightbulb, s?.rating ? `${s.rating.toFixed(1)} stars · ${s.ratingCount ?? 0} reviews` : 'What they think when they look', 'nights'],
      ['slow', 'Come in', DoorOpen, s?.actions30d ? `${s.actions30d.directions} asked for directions` : 'Who actually comes', 'amber'],
      ['back', 'Come back', Repeat, 'Who comes twice', 'brand'],
    ]
    if (step < GUIDE_QS.length) {
      const qq = GUIDE_QS[step]
      return (
        <div style={{ padding: '6px 16px 24px' }}>
          <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>{GUIDE_QS.map((_, i) => <span key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= step ? C.mintDk : C.line }} />)}</div>
          <div style={{ fontFamily: DISPLAY, fontSize: 24, fontWeight: 600, color: C.ink, lineHeight: 1.1 }}>{qq.q}</div>
          <div style={{ fontSize: 13.5, color: C.mute, marginTop: 4 }}>{qq.s}</div>
          <div style={{ marginTop: 14 }}>{qq.opts.map(([v, t, sub]) => <button key={v} type="button" onClick={() => setAnswers((a) => [...a, v])} className="mvp-press" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', marginBottom: 8, borderRadius: 16, border: 'none', background: '#fff', boxShadow: CARD_SHADOW, cursor: 'pointer', textAlign: 'left', font: 'inherit' }}><span style={{ flex: 1 }}><span style={{ display: 'block', fontSize: 15, fontWeight: 600, color: C.ink }}>{t}</span>{sub && <span style={{ display: 'block', fontSize: 12.5, color: C.mute, marginTop: 1 }}>{sub}</span>}</span><ChevronRight size={16} color={C.faint} /></button>)}</div>
          {step > 0 && <button type="button" onClick={() => setAnswers((a) => a.slice(0, -1))} style={{ marginTop: 6, border: 'none', background: 'none', color: C.mute, fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0 }}>Back a step</button>}
          {step === 0 && (
            <div style={{ marginTop: 22 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: C.mute, padding: '0 4px 6px' }}>How a guest reaches you</div>
              {path.map(([id, t, I, n, hue]) => <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 4px' }}><Mark hue={hue} size={34}><I size={18} /></Mark><span style={{ flex: 1 }}><span style={{ display: 'block', fontSize: 14.5, fontWeight: 600, color: C.ink }}>{t}</span><span style={{ display: 'block', fontSize: 12, color: C.mute }}>{n}</span></span></div>)}
            </div>
          )}
        </div>
      )
    }
    const [hurt, you, bud] = answers
    const picks = starterPicks(hurt, you, bud)
    const stage = path.find((p) => p[0] === hurt) ?? path[0]
    const total = picks.reduce((t, c) => t + c.priceN, 0)
    return (
      <div style={{ padding: '6px 16px 24px' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: hueOf(stage[4])[1], background: tint(stage[4], 0.16), borderRadius: 99, padding: '5px 10px' }}>Where it sits: {stage[1]} · {stage[3]}</div>
        <div style={{ fontFamily: DISPLAY, fontSize: 24, fontWeight: 600, color: C.ink, marginTop: 8, lineHeight: 1.1 }}>Your starter shelf</div>
        <div style={{ fontSize: 13.5, color: C.mute, marginTop: 4 }}>Three picks that fit what you said. About {total ? `$${total.toLocaleString()}` : 'a quote'} to start.</div>
        <div style={{ marginTop: 12 }}>{picks.map((c) => { const Icon = iconFor(c); const why = whyNow(c) ?? c.plain.split('.')[0]
          return <button key={c.id} type="button" onClick={() => open(c)} className="mvp-press" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', marginBottom: 8, borderRadius: 16, border: 'none', background: '#fff', boxShadow: CARD_SHADOW, cursor: 'pointer', textAlign: 'left', font: 'inherit' }}><Mark hue={c.goal} size={36}><Icon size={18} /></Mark><span style={{ flex: 1, minWidth: 0 }}><span style={{ display: 'block', fontSize: 15, fontWeight: 600, color: C.ink }}>{c.title}</span><span style={{ display: 'block', fontSize: 12.5, color: C.mute, marginTop: 1, lineHeight: 1.35 }}>{why}</span></span><span style={{ fontFamily: DISPLAY, fontSize: 14, fontWeight: 600, color: C.ink, fontVariantNumeric: 'normal', flexShrink: 0 }}>{c.price}</span></button> })}</div>
        {picks[0] && <button type="button" onClick={() => order(picks[0])} style={{ width: '100%', height: 48, marginTop: 4, borderRadius: 24, border: 'none', background: gradOf('mint'), color: '#fff', fontFamily: DISPLAY, fontSize: 15, fontWeight: 600, cursor: 'pointer', boxShadow: '0 6px 16px rgba(46,154,120,.35)' }}>Start with the first one <ArrowRight size={15} style={{ verticalAlign: '-2px' }} /></button>}
        <button type="button" onClick={() => setAnswers([])} style={{ display: 'block', margin: '12px auto 0', border: 'none', background: 'none', color: C.mute, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Start over</button>
      </div>
    )
  }

  const product = (id: string) => {
    const c = cards[id]
    if (!c) return <div style={{ padding: 30, textAlign: 'center', color: C.mute }}>That one is not on the shelf. <button type="button" onClick={() => go({ name: 'browse' })} style={{ border: 'none', background: 'none', color: C.mintDk, fontWeight: 700, cursor: 'pointer', font: 'inherit' }}>Back to Create</button></div>
    const [h1, h2] = hueOf(c.goal); const Icon = iconFor(c); const SI = STAGE_ICON[c.stage]; const buy = isBuyable(c); const YI = YOU_ICON[c.you] ?? Check
    const TL: [string, string, boolean][] = c.kind === 'setup'
      ? [['Day 0', 'You order. We read what you already have.', false], ['Day 1', 'We start the work and send you anything we need.', false], ['Day 3', 'You check the result. One tap, or a note.', true], [c.ready, 'Done, and on your Home.', false]]
      : c.kind === 'program'
        ? [['Day 0', 'You order. We read your menu, photos and calendar.', false], ['Week 1', 'The first pieces land for your OK.', true], ['Every week', 'New pieces go out on the plan.', false], ['Monthly', 'A read of what moved, on Insights.', false]]
        : [['Day 0', 'You order. We read your menu, photos and calendar.', false], ['Day 1', 'We draft it.', false], ['Day 2', 'You approve in Inbox. One tap, or a note.', true], [c.ready, 'It goes out.', false]]
    const goesWith = GOAL_CARDS[c.goal].filter((x) => x !== c.id).map((x) => cards[x]).filter((x): x is ShelfCard => !!x).slice(0, 4)
    const why = whyNow(c)
    return (
      <div style={{ paddingBottom: 90 }}>
        <div style={{ margin: '4px 16px 0', borderRadius: 22, padding: '18px 16px 16px', background: `linear-gradient(135deg, ${h1}, ${h2})`, color: '#fff', position: 'relative', overflow: 'hidden' }}>
          <span aria-hidden style={{ position: 'absolute', right: '-18%', top: '-45%', width: '65%', aspectRatio: '1', borderRadius: '50%', background: 'rgba(255,255,255,.14)' }} />
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 44, height: 44, borderRadius: 14, background: 'rgba(255,255,255,.22)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon size={22} /></span>
            <span style={{ flex: 1 }} />
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, background: 'rgba(255,255,255,.22)', borderRadius: 99, padding: '4px 10px' }}><SI size={13} /> Moves {c.stage}</span>
          </div>
          <div style={{ position: 'relative', fontFamily: DISPLAY, fontSize: 26, fontWeight: 600, marginTop: 14, lineHeight: 1.05 }}>{c.title}</div>
          {why && buy && <div style={{ position: 'relative', fontSize: 13, opacity: .95, marginTop: 6 }}>{why}</div>}
          {!buy && <div style={{ position: 'relative', marginTop: 8 }}><span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', background: 'rgba(255,255,255,.25)', borderRadius: 99, padding: '4px 9px' }}>Coming soon</span></div>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, margin: '12px 16px 0' }}>
          {([[c.price, 'price'], [c.ready, 'ready in'], [c.you, 'you do'], [String(c.channels.length), c.channels.length === 1 ? 'channel' : 'channels']] as [string, string][]).map(([v, l]) => <div key={l} style={{ textAlign: 'center', padding: '10px 4px', borderRadius: 14, background: C.fill }}><div style={{ fontFamily: DISPLAY, fontSize: 14.5, fontWeight: 600, color: C.ink, fontVariantNumeric: 'normal', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v}</div><div style={{ fontSize: 10.5, color: C.faint, marginTop: 2 }}>{l}</div></div>)}
        </div>
        <div style={{ padding: '18px 16px 0' }}>
          <div style={{ fontFamily: DISPLAY, fontSize: 17, fontWeight: 600, color: C.ink }}>In plain words</div>
          <div style={{ fontSize: 14.5, color: C.ink, lineHeight: 1.5, marginTop: 4 }}>{c.plain}</div>
        </div>
        <div style={{ padding: '18px 16px 0' }}>
          <div style={{ fontFamily: DISPLAY, fontSize: 17, fontWeight: 600, color: C.ink }}>What you get</div>
          {c.get.map((g) => <div key={g} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 14, color: C.ink, lineHeight: 1.4, marginTop: 6 }}><span style={{ color: h2, marginTop: 2, flexShrink: 0 }}><Check size={15} strokeWidth={3} /></span>{g}</div>)}
        </div>
        <div style={{ padding: '18px 16px 0' }}>
          <div style={{ fontFamily: DISPLAY, fontSize: 17, fontWeight: 600, color: C.ink }}>What happens after you order</div>
          {TL.map(([d, t, you], i) => <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginTop: 8 }}><span style={{ width: 10, height: 10, borderRadius: 5, marginTop: 5, background: you ? gradOf(c.goal) : C.line, flexShrink: 0 }} /><span style={{ width: 68, flexShrink: 0, fontSize: 12, fontWeight: 700, color: you ? h2 : C.mute, marginTop: 1 }}>{d}</span><span style={{ flex: 1, fontSize: 13.5, color: C.ink, lineHeight: 1.4 }}>{you ? <b>{t}</b> : t}</span></div>)}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.mute, marginTop: 10 }}><YI size={14} color={h2} /> The coloured dots are you. Everything else is us.</div>
        </div>
        <div style={{ padding: '18px 16px 0' }}>
          <div style={{ fontFamily: DISPLAY, fontSize: 17, fontWeight: 600, color: C.ink }}>Where it shows up</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>{c.channels.map((x) => <span key={x} style={{ fontSize: 12, fontWeight: 600, color: C.ink, background: C.fill, borderRadius: 99, padding: '5px 10px' }}>{x}</span>)}</div>
        </div>
        {goesWith.length > 0 && (<><Sec t="Goes well with" hue={c.goal} /><Shelf>{goesWith.map((x) => <Mini key={x.id} c={x} />)}</Shelf></>)}
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: 'calc(84px + env(safe-area-inset-bottom))', display: 'flex', justifyContent: 'center', pointerEvents: 'none', zIndex: 5 }}>
          <div style={{ ...GLASS, pointerEvents: 'auto', width: 'calc(100% - 32px)', maxWidth: 448, borderRadius: 24, padding: '8px 8px 8px 16px', display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 10px 30px rgba(0,0,0,.12)' }}>
            <span style={{ flex: 1, minWidth: 0 }}><span style={{ display: 'block', fontFamily: DISPLAY, fontSize: 18, fontWeight: 600, color: C.ink, fontVariantNumeric: 'normal' }}>{c.price}</span><span style={{ display: 'block', fontSize: 11.5, color: C.mute, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.cadence} · {c.you.toLowerCase()} · {c.ready}</span></span>
            {buy
              ? <button type="button" onClick={() => order(c)} style={{ height: 44, padding: '0 18px', borderRadius: 22, border: 'none', background: gradOf(c.goal), color: '#fff', fontFamily: DISPLAY, fontSize: 15, fontWeight: 600, cursor: 'pointer', boxShadow: `0 6px 16px ${tint(c.goal, 0.4, 1)}`, display: 'inline-flex', alignItems: 'center', gap: 6 }}>{c.handoff.kind === 'request' ? 'Ask for a quote' : 'Order'} <ArrowRight size={15} /></button>
              : <Link href={`/dashboard/messages?to=strategist&draft=${encodeURIComponent(`I want ${c.title} when it is ready.`)}`} style={{ height: 44, padding: '0 16px', borderRadius: 22, background: C.fill, color: C.ink, fontFamily: DISPLAY, fontSize: 14, fontWeight: 600, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>Tell me when</Link>}
          </div>
        </div>
      </div>
    )
  }

  /* ── the filter sheet ── */
  const FilterSheet = () => sheet ? (
    <>
      <div onClick={() => setSheet(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.28)', zIndex: 40 }} />
      <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 41, display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: '100%', maxWidth: 480, background: '#fff', borderRadius: '22px 22px 0 0', padding: '10px 16px calc(18px + env(safe-area-inset-bottom))' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: C.line, margin: '0 auto 12px' }} />
          <div style={{ fontFamily: DISPLAY, fontSize: 19, fontWeight: 600, color: C.ink, marginBottom: 8 }}>{FILTERS[sheet].label}</div>
          {FILTERS[sheet].opts.map(([v, t, s]) => { const on = filters[sheet] === v
            return <button key={v} type="button" onClick={() => { setFilters((f) => ({ ...f, [sheet]: v })); setSheet(null) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '11px 4px', border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer', font: 'inherit' }}><span style={{ width: 20, height: 20, borderRadius: 10, border: `2px solid ${on ? C.mintDk : C.line}`, background: on ? C.mintDk : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>{on && <Check size={12} strokeWidth={3} />}</span><span style={{ flex: 1 }}><span style={{ display: 'block', fontSize: 15, fontWeight: on ? 700 : 500, color: C.ink }}>{t}</span>{s && <span style={{ display: 'block', fontSize: 12.5, color: C.mute }}>{s}</span>}</span></button> })}
        </div>
      </div>
    </>
  ) : null

  const title = view.name === 'guide' ? 'Guide me' : view.name === 'product' ? (cards[view.id]?.title ?? 'Create') : null
  const backTo = view.name === 'browse' ? undefined : '/dashboard/campaigns/new'
  return (
    <MvpShell active="create" header={
      <div style={{ flexShrink: 0, background: '#fff' }}>
        <div style={{ padding: '0 0 2px' }}><TopRow back={backTo} middle={view.name === 'search' ? <SearchBar live /> : view.name === 'browse' ? <SearchBar /> : <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 17, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', textAlign: 'center' }}>{title}</span>} /></div>
        {view.name === 'browse' && <Rail />}
      </div>
    }>
      <div style={{ background: '#fff', minHeight: '100%', fontFamily: "'Inter',system-ui,sans-serif" }}>
        <style>{`.cc-scroll::-webkit-scrollbar{display:none}`}</style>
        {view.name === 'browse' && browse()}
        {view.name === 'search' && search()}
        {view.name === 'guide' && guide()}
        {view.name === 'product' && product(view.id)}
      </div>
      <FilterSheet />
      {view.name !== 'browse' && view.name !== 'product' && (
        <button type="button" onClick={back} aria-label="Back" style={{ display: 'none' }}><ChevronLeft /></button>
      )}
    </MvpShell>
  )
}
