'use client'
/**
 * ANNOUNCE AS A MENU (owner 2026-09-18): items, options, a cart.
 * ================================================================
 * Every piece is an item with a picture, one line, a price and Add. Tap an item and its options
 * open like a menu item: the required choice first, then extras with a price each. The picker
 * (announce-suggest) pre-adds the usual for this kind, each with one line of why. The bottom
 * bar is the cart: how many things, how many people, the total.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Check, ChevronRight, Loader2, Plus, Minus, Trash2, X } from 'lucide-react'
import { C, DISPLAY } from '../tokens'
import { Drawing, type Scene } from './drawings'
import GraphicSheet from './graphic-sheet'
import PieceThumb from './piece-thumb'
import { MULTI, newUid, PACKAGES, PACKAGE_EXTRA, packageFor, type ItemId, type ItemPick, type Ladder, type PackageTier } from '@/lib/plan/suggest'
import { SERVICE_FEE_RATE } from '@/lib/campaigns/checkout-bill'

export interface MenuMe { usualReach: number | null; budgetCents: number | null; creator: { slug: string; name: string; fromCents: number | null; nearby: number | null; date?: string | null } | null; connected?: { instagram: boolean; facebook: boolean; google: boolean; website: boolean; ordering: boolean; apps: boolean } }
import { itemCents, feeBaseCents, graphicLevel, graphicLayout, graphicDishes, videoLevel, LEVEL_NAME, VIDEO_LEVEL_NAME, GRAPHIC_LEVEL_LINE, VIDEO_LEVEL_LINE, type MenuPrices, type GraphicLevel, type VideoLevel } from '@/lib/plan/item-price'
export { itemCents, type MenuPrices }
interface CreatorProfile { name: string; slug: string; avatarUrl: string | null; audience: { nearby?: number | null; followers: number | null; avgViews: number | null; localPct: number | null; city: string | null; mealCapCents: number; partySize: number; repostOk: boolean; whitelistCents: number | null; responseHours: number | null } | null; offers: { slug: string; title: string; tiers: { id: string; name: string; priceCents: number; deliverables: string[] }[]; startingCents: number | null }[]; schedule: { slots: { date: string; start: string }[]; confirmMode: string }; avgRating: number | null; collabs: number }
interface Fit { slug: string; tag: string; reasons: string[]; card?: { name: string; avatarUrl: string | null; fromCents: number | null; audience: { avgViews: number | null; localPct: number | null; followers: number | null } | null } }

const dollars = (c: number | null | undefined) => (c == null ? '' : `$${Math.round(c / 100).toLocaleString()}`)
const fmt = (v: number) => (v >= 10_000 ? `${Math.round(v / 1000)}k` : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)))
const nice = (iso: string | null | undefined) => { if (!iso) return ''; const d = new Date(iso.slice(0, 10) + 'T12:00:00'); return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) }
const hour = (t: string) => { const [h, m] = t.split(':').map(Number); const ap = h >= 12 ? 'pm' : 'am'; return `${((h + 11) % 12) + 1}${m ? ':' + String(m).padStart(2, '0') : ''} ${ap}` }
const initials = (n: string) => n.split(' ').filter(Boolean).slice(0, 2).map((x) => x[0]?.toUpperCase()).join('')
const round2 = (n: number) => { const m = Math.pow(10, Math.max(0, String(Math.round(n)).length - 2)); return Math.round(n / m) * m }

const META: Record<ItemId, { name: string; line: string; scene: Scene; hue: string; group: 'make' | 'seen' | 'inside'; free?: boolean; hasOptions?: boolean }> = {
  post: { name: 'Post it', line: 'Your channels, a Story, menus, the team told', scene: 'post', hue: '#2e9a78', group: 'make', free: true },
  graphic: { name: 'A graphic', line: 'Designed for the post, with the price on it', scene: 'graphic', hue: '#d99a1e', group: 'make', hasOptions: true },
  video: { name: 'A video', line: 'A Reel, from your clips or filmed here', scene: 'reel', hue: '#0f97a8', group: 'make', hasOptions: true },
  photos: { name: 'A shoot', line: 'A photographer comes. Add other things to the list', scene: 'photos', hue: '#6a39de', group: 'make', hasOptions: true },
  boost: { name: 'Boost it', line: 'Ad money to people nearby', scene: 'boost', hue: '#d99a1e', group: 'seen', hasOptions: true },
  creator: { name: 'A creator posts it', line: 'A local food creator visits and posts', scene: 'creator', hue: '#c2418f', group: 'seen', hasOptions: true },
  print: { name: 'Print', line: 'A table tent or a window poster', scene: 'print', hue: '#d99a1e', group: 'seen', hasOptions: true },
  apps: { name: 'Feature it on DoorDash', line: 'A promo on the item, two weeks', scene: 'apps', hue: '#c92d32', group: 'seen', free: true },
  taste: { name: 'A taste at the counter', line: 'Free bites, all week. On the team card', scene: 'dish', hue: '#2e9a78', group: 'inside', free: true },
  review: { name: 'Ask for a review', line: 'With the check, two weeks', scene: 'review', hue: '#d99a1e', group: 'inside', free: true },
  sign: { name: 'Guest photo sign', line: 'Post it, tag us, dessert is on us', scene: 'story', hue: '#c2418f', group: 'inside', free: true },
  offer: { name: 'Launch offer', line: 'A code, free drink with it this week', scene: 'offer', hue: '#3b6fd4', group: 'inside', free: true, hasOptions: true },
  custom: { name: 'Something else', line: 'Not on the menu? Say what you need. The team quotes it', scene: 'else', hue: '#8a928e', group: 'make', free: true, hasOptions: true },
}
const GROUPS: { id: 'make' | 'seen' | 'inside'; label: string }[] = [{ id: 'make', label: 'Make' }, { id: 'seen', label: 'Get it seen' }, { id: 'inside', label: 'In the restaurant' }]

/** the price of an item from its options */
/** one green line that says what was picked */
export function itemSummary(it: ItemPick, p: MenuPrices, profile?: CreatorProfile | null, extra?: { platforms: string; bestHour: string; readyBy?: string | null }): string {
  const o = it.options
  switch (it.id) {
    case 'post': return `${extra?.platforms ?? 'Your channels'} · Story · ${extra?.bestHour ?? 'your best hour'}`
    case 'graphic': { const where = (o.where as string[] | undefined) ?? ['post']; return [Number(o.count) > 1 ? `${o.count} graphics` : '', where.includes('post') ? 'Post + Story' : '', where.includes('tent') ? 'table tent' : '', where.includes('poster') ? 'poster' : '', o.from === 'stock' ? 'licensed photos' : o.from === 'shoot' ? 'from the shoot' : '', o.priceOn ? 'price on it' : '', o.look ? String(o.look).toLowerCase() : '', o.spanish ? 'Spanish' : '', extra?.readyBy ? `ready ${nice(extra.readyBy)}` : 'ready in 2 days'].filter(Boolean).join(' · ') }
    case 'video': return [Number(o.count) > 1 ? `${o.count} Reels` : '', o.filmed === 'clips' ? 'From your clips' : o.filmed === 'creator' ? `Filmed when ${profile?.name.split(' ')[0] ?? 'the creator'} visits` : o.filmed === 'shoot' ? 'On the shoot day' : 'We come film it', o.style === 'chef' ? 'the chef making it' : o.style === 'room' ? 'the room and the dish' : 'the dish up close', o.tiktok ? 'TikTok cut' : ''].filter(Boolean).join(' · ')
    case 'photos': return o.queue ? `On the next content day, not booked yet${(o.list as string[] | undefined)?.length ? ` · ${(o.list as string[]).join(', ')}` : ''}` : `${p.shootLabel(1 + ((o.list as string[] | undefined)?.length ?? 0))}${(o.list as string[] | undefined)?.length ? ` · ${(o.list as string[]).join(', ')}` : ''}`
    case 'boost': return `$${Math.round((Number(o.cents) || 2000) / 100)} · ${o.days ?? 3} days · about ${((Number(o.cents) || 2000) / 100 * 150).toLocaleString()} people`
    case 'creator': return [profile?.name ?? 'A creator', ...(((o.more as { name: string }[] | undefined) ?? []).map((m) => `and ${m.name.split(' ')[0]}`)), o.tierName ? String(o.tierName) : '', o.date ? `${nice(String(o.date))}${o.start ? `, ${hour(String(o.start))}` : ''}` : 'date to pick', o.code ? `${(profile?.name.split(' ')[0] ?? 'CREATOR').replace(/[^a-z]/gi, '').toUpperCase().slice(0, 8)}10` : ''].filter(Boolean).join(' · ')
    case 'print': { const ks = (o.kinds as string[] | undefined) ?? [o.kind === 'poster' ? 'poster' : 'tent']; return ks.map((k) => (k === 'poster' ? 'Window poster' : k === 'insert' ? 'Menu insert' : 'Table tent')).join(' and ') }
    case 'apps': return 'A promo on the item, two weeks'
    case 'taste': return 'All week'
    case 'review': return 'Two weeks'
    case 'sign': return 'A sign with a QR'
    case 'offer': return `${o.text ? String(o.text) : 'Free drink with it this week'}${o.code ? ' · a code' : ''}`
    case 'custom': return o.what ? String(o.what) : 'The team quotes it'
  }
}

const FRESH: Partial<Record<ItemId, Record<string, unknown>>> = {
  custom: { what: '', tell: '', when: '' },
  graphic: { where: ['post'], priceOn: true, from: 'stock' },
  video: { count: 1, filmed: 'clips', style: 'dish', captions: true },
  print: { kinds: ['tent'] },
  creator: { code: true, repost: true },
}
export default function AnnounceMenu({ clientId, items, setItems, me, prices, media, hasVideo, platformsWord, bestHourWord, readyBy, open, setOpen, onGo, total, reach, posting, writing, ready, preview, dates, dishList, bizName, photoPreview, brandKit, usualReach, simplePlans, keep, ladder, reachParts, orderButton, startDay, ctaLabel, laneInit }: {
  clientId: string; items: ItemPick[]; setItems: (f: (x: ItemPick[]) => ItemPick[]) => void; me: MenuMe | null; prices: MenuPrices; media: number; hasVideo: boolean; platformsWord: string; bestHourWord: string; readyBy: string | null
  open: string | null; setOpen: (uid: string | null) => void; onGo: () => void; total: number; reach: number | null; posting: boolean; writing: boolean; ready: boolean
  /* the calm plan screen (owner 2026-09-18): a small preview, a five-step how-far, date tiles */
  preview?: { name: string; price: string | null; caption: string; image: string | null; video?: boolean; onWords: () => void; onPhoto: () => void }
  dates?: { posts: string | null; ready: string | null; results: string | null }
  /* THE GRAPHIC (owner 2026-09-24): the dishes, the restaurant, the first photo, whether a brand kit is on file */
  dishList?: { name: string; price: string; line?: string }[]; bizName?: string; photoPreview?: string | null; brandKit?: boolean | null
  usualReach?: number | null
  /* THREE PLANS (owner 2026-09-22): Keep it simple, Recommended, Go bigger, and a text link to build your own.
     No preview, no ladder, no line rows until they build their own. `keep` holds the lines the content screen
     chose (the shoot, the licensed graphic) in every plan. */
  simplePlans?: boolean
  keep?: string[]
  /* the three sets the server built from what it knows (suggest.ts ladderFor); the old ladder is the fallback */
  ladder?: Ladder | null
  /* THE LANES (owner 2026-09-23): the honest reach in parts, whether the post gets an Order button, the start day */
  reachParts?: { measured: number | null; video: number; boost: number; creator: number }
  orderButton?: boolean
  startDay?: string
  /* the button's word (Save plan on the lanes page) and which lane opens on arrival */
  ctaLabel?: string
  laneInit?: number | null
}) {
  const [profile, setProfile] = useState<CreatorProfile | null>(null)
  const [fits, setFits] = useState<Fit[]>([])
  /* plan first: what is picked, short. Add more opens the whole menu */
  const [mode, setModeRaw] = useState<'plan' | 'add'>('plan')
  /* the lane that is open for changes (owner 2026-09-23: click into each stage to change or add) */
  const [openLane, setOpenLane] = useState<number | null>(laneInit ?? null)
  const [switched, setSwitched] = useState(false)
  const setMode = (m: 'plan' | 'add') => { setSwitched(true); setModeRaw(m) }
  const openIt = open ? items.find((x) => x.uid === open) ?? null : null
  const creatorItem = (openIt?.id === 'creator' ? openIt : null) ?? items.find((x) => x.id === 'creator' && x.on) ?? items.find((x) => x.id === 'creator') ?? null
  const slug = (creatorItem?.options.slug as string | undefined) ?? me?.creator?.slug ?? null
  useEffect(() => {
    if (!slug) return
    fetch(`/api/dashboard/influencers?clientId=${clientId}&slug=${encodeURIComponent(slug)}`, { cache: 'no-store' }).then(async (r) => { const j = await r.json().catch(() => ({})); if (r.ok) setProfile(j.profile) }).catch(() => {})
  }, [slug, clientId])
  useEffect(() => {
    if (openIt?.id !== 'creator' || fits.length) return
    fetch(`/api/dashboard/influencers?clientId=${clientId}&fit=1`, { cache: 'no-store' }).then(async (r) => { const j = await r.json().catch(() => ({})); if (r.ok) setFits((j.fit ?? []).filter((f: Fit) => f.card)) }).catch(() => {})
  }, [open, clientId, fits.length])
  const patchU = (uid: string, f: (it: ItemPick) => Partial<ItemPick>) => setItems((xs) => xs.map((it) => (it.uid === uid ? { ...it, ...f(it) } : it)))
  /* inside an open sheet, every option write goes to that line */
  const setOpt = (_id: ItemId, o: Record<string, unknown>) => { if (open) patchU(open, (it) => ({ options: { ...it.options, ...o } })) }
  const toggle = (uid: string) => patchU(uid, (it) => ({ on: !it.on }))
  const remove = (uid: string) => setItems((xs) => xs.filter((x) => x.uid !== uid))
  /* a fresh line of a multi type: made off, opened; dropped again if they back out without adding */
  const addNew = (id: ItemId) => { const uid = newUid(id); const tmpl = items.find((x) => x.id === id); setItems((xs) => [...xs, { id, uid, on: false, why: '', options: { ...(FRESH[id] ?? {}), ...(id === 'creator' && tmpl ? { slug: tmpl.options.slug } : {}) }, cents: tmpl?.cents ?? 0 }]); setOpen(uid) }
  const back = () => { if (openIt && !openIt.on && openIt.uid !== openIt.id) remove(openIt.uid); setOpen(null) }

  const h3: React.CSSProperties = { fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.mute, margin: '18px 0 4px' }
  const sub: React.CSSProperties = { display: 'block', fontWeight: 500, color: C.mute, fontSize: 12, marginTop: 2, lineHeight: 1.35 }
  const cta: React.CSSProperties = { marginTop: 10, width: '100%', height: 50, borderRadius: 99, border: 0, background: C.ink, color: '#fff', fontWeight: 700, fontSize: 15, font: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 18px', cursor: 'pointer' }
  const Opt = ({ kind, on, label, small, price, onClick }: { kind: 'rb' | 'cb'; on: boolean; label: string; small?: string; price?: string; onClick: () => void }) => (
    <button type="button" onClick={onClick} style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 10, padding: '11px 0', borderBottom: `0.5px solid ${C.line}`, background: 'none', border: 0, borderBottomStyle: 'solid', font: 'inherit', color: C.ink, cursor: 'pointer', textAlign: 'left', fontSize: 14 }}>
      {kind === 'rb' ? <span style={{ width: 22, height: 22, borderRadius: 99, border: on ? `7px solid ${C.ink}` : `1.5px solid ${C.line}`, flex: 'none', boxSizing: 'border-box' }} /> : <span style={{ width: 22, height: 22, borderRadius: 7, border: `1.5px solid ${on ? C.ink : C.line}`, background: on ? C.ink : '#fff', flex: 'none', display: 'grid', placeItems: 'center', color: '#fff' }}>{on && <Check size={14} strokeWidth={3} />}</span>}
      <span style={{ flex: 1, minWidth: 0 }}>{label}{small && <small style={sub}>{small}</small>}</span>
      {price && <span style={{ fontSize: 13, fontWeight: 700, color: C.mute, whiteSpace: 'nowrap' }}>{price}</span>}
    </button>
  )
  const Days = ({ days, value, onPick }: { days: string[]; value: string | null; onPick: (d: string) => void }) => (
    <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, marginTop: 8 }}>{days.map((d) => { const dt = new Date(d + 'T12:00:00'); const on = value === d; return <button key={d} type="button" onClick={() => onPick(d)} style={{ flex: 'none', minWidth: 52, border: `1.5px solid ${on ? C.ink : C.line}`, boxShadow: on ? `inset 0 0 0 1px ${C.ink}` : 'none', borderRadius: 12, padding: '8px 0', textAlign: 'center', fontSize: 12, fontWeight: 700, background: '#fff', font: 'inherit', color: C.ink, cursor: 'pointer' }}><small style={{ display: 'block', fontWeight: 600, color: C.mute, fontSize: 10.5 }}>{dt.toLocaleDateString('en-US', { weekday: 'short' })}</small>{dt.getDate()}</button> })}</div>
  )
  const chip = (on: boolean): React.CSSProperties => ({ fontSize: 12.5, fontWeight: 700, padding: '7px 12px', borderRadius: 99, border: `1.5px solid ${on ? C.ink : C.line}`, background: on ? C.ink : '#fff', color: on ? '#fff' : C.ink, cursor: 'pointer', font: 'inherit' })
  const input: React.CSSProperties = { display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 6, border: `0.5px solid ${C.line}`, borderRadius: 12, padding: '11px 12px', fontSize: 14.5, fontWeight: 500, font: 'inherit', color: C.ink, background: '#fff', outline: 'none' }
  const Hero = ({ scene, hue }: { scene: Scene; hue: string }) => <div style={{ height: 110, borderRadius: 18, background: `${hue}1f`, display: 'flex', alignItems: 'center', justifyContent: 'center', ['--c2' as string]: hue }}><span style={{ width: 84 }}><Drawing spec={{ scene }} name="" rating="" t={(s) => s} /></span></div>

  /* ── an item's options ── */
  if (open && openIt) {
    const it = openIt
    const m = META[it.id]
    const o = it.options
    const cents = itemCents(it, prices, profile)
    const done = () => { patchU(open, (x) => ({ on: true, options: x.id === 'offer' ? { ...x.options, confirmed: true } : x.options })); setOpen(null); setMode('plan') }
    const head = <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 8px' }}><button type="button" onClick={back} aria-label="Back" style={{ width: 34, height: 34, borderRadius: 99, border: `0.5px solid ${C.line}`, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><ArrowLeft size={16} /></button><span style={{ flex: 1, fontFamily: DISPLAY, fontSize: 18, fontWeight: 600, letterSpacing: '-.01em' }}>{m.name}</span><b style={{ fontSize: 17 }}>{it.id === 'custom' ? 'Quote' : cents ? dollars(cents) : 'Free'}</b></div>
    const foot = <>
      {it.on && <div style={{ textAlign: 'center', marginTop: 14 }}><button type="button" onClick={() => { if (it.uid === it.id) toggle(it.uid); else remove(it.uid); setOpen(null) }} style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700, color: '#c92d32', border: 0, background: 'none', padding: '6px 10px', cursor: 'pointer' }}>Remove from plan</button></div>}
      <button type="button" onClick={done} disabled={it.id === 'custom' && !String(o.what ?? '').trim()} style={{ ...cta, opacity: it.id === 'custom' && !String(o.what ?? '').trim() ? .5 : 1 }}><span>{it.on ? 'Done' : 'Add to the plan'}</span><span>{it.id === 'custom' ? 'Quote to come' : cents ? dollars(cents) : 'Free'}</span></button>
    </>
    const where = (o.where as string[] | undefined) ?? ['post']
    const tw = (k: string) => setOpt('graphic', { where: where.includes(k) ? where.filter((x) => x !== k) : [...where, k] })
    return (
      <div>
        {it.id !== 'graphic' && head}
        {it.id === 'graphic' && (() => {
          const offerIt = items.find((x) => x.on && x.id === 'offer')
          const ph = items.find((x) => x.on && x.id === 'photos')
          return <GraphicSheet item={it} prices={prices} setOpt={(v) => setOpt('graphic', v)} bizName={bizName ?? ''} dishes={dishList ?? []} photo={photoPreview ?? null}
            photoSource={ph?.options.queue ? 'queue' : o.from === 'shoot' ? 'content' : o.from === 'stock' ? 'stock' : 'own'} brandKit={brandKit ?? null}
            offer={offerIt ? { text: String(offerIt.options.text ?? '') || 'A free drink with it this week', code: String(offerIt.options.codeText ?? '') } : null}
            printInPlan={items.some((x) => x.on && x.id === 'print')} readyWord={dates?.ready ? nice(dates.ready).replace(/^(\w+), /, '$1 ') : ''}
            onDone={done} onRemove={it.on ? () => { if (it.uid === it.id) toggle(it.uid); else remove(it.uid); setOpen(null) } : null} doneLabel={it.on ? 'Save' : 'Add to the plan'} />
        })()}
        {it.id === 'video' && <>
          <Hero scene="reel" hue={m.hue} /><div style={{ fontSize: 12.5, color: C.mute, marginTop: 8, lineHeight: 1.45 }}>One Reel, about 15 seconds, cut for Instagram, Facebook and TikTok.</div>
          <div style={h3}>How much editing</div>
          {(() => { const inc = o.filmed === 'shoot' && (Number(o.included) || 0) > 0; const std = prices.video; const wk = prices.videoWorks ?? 70000; const lv = videoLevel(o); return (['standard', 'works'] as VideoLevel[]).map((l) => <Opt key={l} kind="rb" on={lv === l} label={VIDEO_LEVEL_NAME[l]} small={VIDEO_LEVEL_LINE[l]} price={inc ? (l === 'standard' ? 'included' : `+${dollars(wk - std)} each`) : `${dollars(l === 'works' ? wk : std)} each`} onClick={() => setOpt('video', { level: l })} />) })()}
          <div style={h3}>How many</div>
          <div style={{ display: 'flex', gap: 6 }}>{[1, 2, 3].map((n) => <button key={n} type="button" onClick={() => setOpt('video', { count: n })} style={chip((Number(o.count) || 1) === n)}>{n === 1 ? 'One Reel' : `${n} Reels`}</button>)}</div>
          {(Number(o.count) || 1) >= 2 && <div style={{ fontSize: 12, color: C.greenDk, fontWeight: 600, marginTop: 6 }}>Two or more, 10% off each. Different angles of the same dish, or a second dish.</div>}
          <div style={h3}>Filmed</div>
          <Opt kind="rb" on={o.filmed === 'clips'} label="From clips you send" small={hasVideo ? 'You added video' : 'Ten seconds on your phone is plenty'} price={dollars(videoLevel(o) === 'works' ? prices.videoWorks ?? 70000 : prices.video)} onClick={() => setOpt('video', { filmed: 'clips' })} />
          {(items.find((x) => x.id === 'creator')?.on || me?.creator) && <Opt kind="rb" on={o.filmed === 'creator'} label={`When ${(profile?.name ?? me?.creator?.name ?? 'the creator').split(' ')[0]} visits`} small={items.find((x) => x.id === 'creator')?.on ? 'Same day, no extra trip' : 'Add the creator too'} price={dollars(videoLevel(o) === 'works' ? prices.videoWorks ?? 70000 : prices.video)} onClick={() => setOpt('video', { filmed: 'creator' })} />}
          <Opt kind="rb" on={o.filmed === 'visit'} label="A separate visit" small="We come film it" price="+$150" onClick={() => setOpt('video', { filmed: 'visit' })} />
          <Opt kind="rb" on={o.filmed === 'shoot'} label="On the shoot day" small={items.find((x) => x.id === 'photos')?.on ? 'Same day as the photos' : 'Add Photos first'} price="in the day" onClick={() => setOpt('video', { filmed: 'shoot' })} />
          <div style={h3}>Style</div>
          <Opt kind="rb" on={!o.style || o.style === 'dish'} label="The dish, up close" small="Steam, the cut, the first bite" onClick={() => setOpt('video', { style: 'dish' })} />
          <Opt kind="rb" on={o.style === 'chef'} label="The chef making it" small="30 seconds" price="+$75" onClick={() => setOpt('video', { style: 'chef' })} />
          <Opt kind="rb" on={o.style === 'room'} label="The room and the dish" onClick={() => setOpt('video', { style: 'room' })} />
          <div style={h3}>The look</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{['Bright', 'Warm', 'Moody', 'Minimal', 'Bold', 'Playful'].map((t) => { const cur = String(o.look ?? '').split(', ').filter(Boolean); const on = cur.includes(t); return <button key={t} type="button" onClick={() => setOpt(it.id, { look: (on ? cur.filter((x) => x !== t) : [...cur, t].slice(-3)).join(', ') })} style={chip(on)}>{t}</button> })}</div>
          <div style={h3}>Also</div>
          <Opt kind="cb" on={o.captions !== false} label="Captions burned in" price="free" onClick={() => setOpt('video', { captions: o.captions === false })} />
          <Opt kind="cb" on={!!o.tiktok} label="A second cut for TikTok" price="+$60" onClick={() => setOpt('video', { tiktok: !o.tiktok })} />
          <Opt kind="cb" on={!!o.spanish} label="Spanish captions" price="+$25" onClick={() => setOpt('video', { spanish: !o.spanish })} />
          {foot}
        </>}
        {it.id === 'photos' && <>
          <Hero scene="photos" hue={m.hue} /><div style={{ fontSize: 12.5, color: C.mute, marginTop: 8, lineHeight: 1.45 }}>A photographer comes once. The longer the list, the bigger the day, and every photo lands in your library.</div>
          <div style={h3}>The shot list</div>
          <div style={{ fontSize: 14, padding: '8px 0', borderBottom: `0.5px solid ${C.line}` }}>1. This announcement</div>
          {((o.list as string[] | undefined) ?? []).map((x, i) => <div key={i} style={{ display: 'flex', alignItems: 'center', fontSize: 14, padding: '8px 0', borderBottom: `0.5px solid ${C.line}` }}><span style={{ flex: 1 }}>{i + 2}. {x}</span><button type="button" onClick={() => setOpt('photos', { list: ((o.list as string[]) ?? []).filter((_, j) => j !== i) })} style={{ border: 0, background: 'none', color: C.mute, cursor: 'pointer', font: 'inherit', fontSize: 12, fontWeight: 700 }}>Remove</button></div>)}
          <PhotosAdd onAdd={(v) => setOpt('photos', { list: [...(((o.list as string[]) ?? [])), v].slice(0, 5) })} />
          <div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 10 }}>{prices.shootLabel(1 + (((o.list as string[]) ?? []).length))}</div>
          <div style={{ fontSize: 12, color: C.mute, marginTop: 3, lineHeight: 1.4 }}>One or two things is a quick visit. Three or four is half a day. Five or six is a full day.</div>
          <div style={h3}>The day</div>
          <input type="date" value={String(o.date ?? '')} onChange={(e) => setOpt('photos', { date: e.target.value })} style={{ ...input, width: 'auto', marginTop: 0 }} /><div style={{ fontSize: 12, color: C.mute, marginTop: 6 }}>Leave it and the team offers two dates.</div>
          {foot}
        </>}
        {it.id === 'boost' && <>
          <Hero scene="boost" hue={m.hue} /><div style={{ fontSize: 12.5, color: C.mute, marginTop: 8, lineHeight: 1.45 }}>Your own ad money, to people nearby, after it posts. About 150 people a dollar.</div>
          <div style={h3}>How much</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{[1000, 2000, 4000, 10000, 20000].map((v) => <button key={v} type="button" onClick={() => setOpt('boost', { cents: v })} style={chip(Number(o.cents) === v)}>${v / 100}</button>)}<input type="number" min={5} max={500} value={Math.round((Number(o.cents) || 2000) / 100)} onChange={(e) => setOpt('boost', { cents: Math.max(500, Math.min(50000, Math.round(Number(e.target.value) || 0) * 100)) })} style={{ ...input, width: 84, marginTop: 0, padding: '7px 10px', fontSize: 13 }} /></div>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.greenDk, marginTop: 10 }}>About {(((Number(o.cents) || 2000) / 100) * 150).toLocaleString()} people nearby</div>
          <div style={h3}>For how long</div>
          <div style={{ display: 'flex', gap: 6 }}>{[2, 3, 7].map((d) => <button key={d} type="button" onClick={() => setOpt('boost', { days: d })} style={chip((Number(o.days) || 3) === d)}>{d} days</button>)}</div>
          {foot}
        </>}
        {it.id === 'creator' && <>
          <div style={h3}>Who</div><div style={{ fontSize: 12, color: C.mute, marginTop: -2, marginBottom: 4 }}>Ranked for you. Tap one.</div>
          {(fits.length ? fits : me?.creator ? [{ slug: me.creator.slug, tag: 'Best fit', reasons: [], card: { name: me.creator.name, avatarUrl: null, fromCents: me.creator.fromCents, audience: null } }] : []).map((f) => { const on = slug === f.slug; return <button key={f.slug} type="button" onClick={() => { setOpt('creator', { slug: f.slug, tierName: null, date: null, start: null }); setProfile(null) }} style={{ display: 'flex', width: '100%', gap: 10, alignItems: 'center', padding: '10px 0', borderBottom: `0.5px solid ${C.line}`, background: 'none', border: 0, borderBottomStyle: 'solid', font: 'inherit', color: C.ink, cursor: 'pointer', textAlign: 'left' }}>
            {f.card?.avatarUrl ? <img src={f.card.avatarUrl} alt="" style={{ width: 44, height: 44, borderRadius: 99, objectFit: 'cover', flex: 'none' }} /> : <span style={{ width: 44, height: 44, borderRadius: 99, flex: 'none', background: 'linear-gradient(135deg,#f6c1dc,#c2418f)', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 800, fontSize: 14 }}>{initials(f.card?.name ?? '')}</span>}
            <span style={{ flex: 1, minWidth: 0 }}><b style={{ display: 'block', fontSize: 14 }}>{f.card?.name}{f.tag && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: C.greenDk, background: C.greenSoft, borderRadius: 99, padding: '2px 7px' }}>{f.tag}</span>}</b><small style={sub}>{f.reasons.slice(0, 2).join('. ') || 'A local food creator'}</small></span>
            <span style={{ fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap' }}>{f.card?.fromCents != null ? `from ${dollars(f.card.fromCents)}` : ''}</span>
            <span style={{ width: 22, height: 22, borderRadius: 99, border: on ? `7px solid ${C.ink}` : `1.5px solid ${C.line}`, flex: 'none', boxSizing: 'border-box', marginLeft: 6 }} />
          </button> })}
          {!fits.length && !me?.creator && <div style={{ fontSize: 13, color: C.mute, padding: '8px 0' }}>No creator with verified reach fits yet. The team can still find one: add a note on the first screen.</div>}
          <a href={`/dashboard/influencers?clientId=${clientId}`} style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: C.ink, marginTop: 8 }}>See all creators ›</a>
          {fits.filter((f) => f.slug !== slug).length > 0 && <>
            <div style={h3}>Also book</div>
            {fits.filter((f) => f.slug !== slug).map((f) => { const more = (o.more as { slug: string; name: string; fromCents: number | null }[] | undefined) ?? []; const on = more.some((m) => m.slug === f.slug); return <Opt key={f.slug} kind="cb" on={on} label={f.card?.name ?? f.slug} small={f.reasons[0] ?? 'A local food creator'} price={f.card?.fromCents != null ? `+${dollars(f.card.fromCents)}` : ''} onClick={() => setOpt('creator', { more: on ? more.filter((m) => m.slug !== f.slug) : [...more, { slug: f.slug, name: f.card?.name ?? f.slug, fromCents: f.card?.fromCents ?? null }] })} /> })}
            <div style={{ fontSize: 12, color: C.mute, marginTop: 6 }}>Each gets the same brief and their own date. Two creators in one week reads like a wave.</div>
          </>}
          {profile && <>
            <div style={h3}>What {profile.name.split(' ')[0]} does</div>
            {profile.offers.flatMap((of) => (of.tiers.length ? of.tiers.map((t) => ({ name: t.name, small: `${of.title} · ${t.deliverables.slice(0, 2).join(', ')}`, price: t.priceCents })) : [{ name: of.title, small: '', price: of.startingCents ?? 0 }])).map((t) => <Opt key={t.name} kind="rb" on={(o.tierName ?? profile.offers[0]?.tiers[0]?.name) === t.name} label={t.name} small={t.small} price={dollars(t.price)} onClick={() => setOpt('creator', { tierName: t.name })} />)}
            <div style={h3}>When</div>
            {profile.schedule.slots.length ? <><Days days={Array.from(new Set(profile.schedule.slots.map((s) => s.date))).slice(0, 10)} value={(o.date as string) ?? profile.schedule.slots[0]?.date ?? null} onPick={(d) => setOpt('creator', { date: d, start: profile.schedule.slots.find((s) => s.date === d)?.start ?? null })} /><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>{profile.schedule.slots.filter((s) => s.date === ((o.date as string) ?? profile.schedule.slots[0]?.date)).map((s) => <button key={s.start} type="button" onClick={() => setOpt('creator', { date: s.date, start: s.start })} style={chip(((o.start as string) ?? profile.schedule.slots.find((x) => x.date === ((o.date as string) ?? profile.schedule.slots[0]?.date))?.start) === s.start)}>{hour(s.start)}</button>)}</div></> : <div style={{ fontSize: 13, color: C.mute }}>{profile.name.split(' ')[0]} has no calendar open. The team asks for two dates.</div>}
            <div style={h3}>Extras</div>
            <Opt kind="cb" on={o.code !== false} label={`${profile.name.split(' ')[0].replace(/[^a-z]/gi, '').toUpperCase().slice(0, 8)}10 for their followers`} small="The team counts it" price="free" onClick={() => setOpt('creator', { code: o.code === false })} />
            {profile.audience?.repostOk !== false && <Opt kind="cb" on={o.repost !== false} label="You can repost it" small="Credited" price="free" onClick={() => setOpt('creator', { repost: o.repost === false })} />}
            {profile.audience?.whitelistCents != null && <Opt kind="cb" on={!!o.whitelist} label="Boost their post as your ad" price={`+${dollars(profile.audience.whitelistCents)}`} onClick={() => setOpt('creator', { whitelist: !o.whitelist })} />}
            <div style={{ fontSize: 12, color: C.mute, marginTop: 8, lineHeight: 1.45 }}>Plus the meal, up to {dollars(profile.audience?.mealCapCents ?? 6000)} for {profile.audience?.partySize ?? 2}. Nothing is charged until the post is up.</div>
          </>}
          {slug && !profile && <div style={{ padding: 20, textAlign: 'center', color: C.mute }}><Loader2 size={18} className="mvp-spin" /></div>}
          {foot}
        </>}
        {it.id === 'print' && <>
          <Hero scene="print" hue={m.hue} />
          <div style={h3}>What</div>
          {(() => { const ks = (o.kinds as string[] | undefined) ?? [o.kind === 'poster' ? 'poster' : 'tent']; const tg = (k: string) => setOpt('print', { kinds: ks.includes(k) ? (ks.length > 1 ? ks.filter((x) => x !== k) : ks) : [...ks, k] }); return <>
            <Opt kind="cb" on={ks.includes('tent')} label="Table tent" small="One for every table, from the graphic" price="$25" onClick={() => tg('tent')} />
            <Opt kind="cb" on={ks.includes('poster')} label="Window poster" small="For the front, from the graphic" price="$25" onClick={() => tg('poster')} />
            <Opt kind="cb" on={ks.includes('insert')} label="Menu insert" small="A slip for every menu" price="$25" onClick={() => tg('insert')} />
          </> })()}
          <div style={{ fontSize: 12, color: C.mute, marginTop: 8 }}>Printed, or a file to print yourself. The team quotes printing.</div>
          {foot}
        </>}
        {it.id === 'custom' && <>
          <Hero scene="else" hue={m.hue} /><div style={{ fontSize: 12.5, color: C.mute, marginTop: 8, lineHeight: 1.45 }}>Not on the menu? Say what you need. The team prices it and sends the quote to you.</div>
          <div style={h3}>What do you need?</div>
          <input value={String(o.what ?? '')} onChange={(e) => setOpt('custom', { what: e.target.value })} placeholder="Chalkboard for the window" style={input} />
          <div style={h3}>Tell the team</div>
          <textarea rows={3} value={String(o.tell ?? '')} onChange={(e) => setOpt('custom', { tell: e.target.value })} placeholder="The dish and the price, our colours" style={{ ...input, resize: 'none', lineHeight: 1.45 }} />
          <div style={h3}>When</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="date" value={String(o.when ?? '')} onChange={(e) => setOpt('custom', { when: e.target.value })} style={{ ...input, flex: 1 }} /><button type="button" onClick={() => setOpt('custom', { when: '' })} style={{ height: 40, padding: '0 14px', borderRadius: 99, border: `1.5px solid ${!o.when ? C.ink : C.line}`, background: !o.when ? C.ink : '#fff', color: !o.when ? '#fff' : C.ink, fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>No rush</button></div>
          <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 12, background: '#fff4e0', color: '#8a5a0c', fontSize: 12.5, lineHeight: 1.45 }}>The team quotes it within a day. Nothing is charged until you say yes to the price.</div>
          {foot}
        </>}
        {it.id === 'offer' && <>
          <Hero scene="offer" hue={m.hue} />
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginTop: 14 }}>The offer<input value={String(o.text ?? '')} onChange={(e) => setOpt('offer', { text: e.target.value })} placeholder="Free drink with it this week" style={input} /></label>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginTop: 14 }}>The code<input value={String(o.codeText ?? '')} onChange={(e) => setOpt('offer', { codeText: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) })} placeholder="BANHMI10" style={{ ...input, letterSpacing: '.08em', fontWeight: 700 }} /></label>
          <div style={{ fontSize: 12.5, color: C.greenDk, marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}><Check size={13} /> The team counts the code</div>
          {foot}
        </>}
      </div>
    )
  }

  /* ── the menu ── */
  const onCount = items.filter((x) => x.on).length
  const minOf = (it: ItemPick) => (it.id === 'graphic' ? prices.graphic : it.id === 'video' ? prices.video : it.id === 'photos' ? prices.shootFor(1) : it.id === 'print' ? prices.print : it.id === 'boost' ? 2000 : it.id === 'creator' ? (profile?.offers[0]?.startingCents ?? me?.creator?.fromCents ?? it.cents) : 0)
  const nameOf = (it: ItemPick) => (it.id === 'creator' && profile && it.on ? `${profile.name.split(' ')[0]} posts it` : META[it.id].name)
  const Thumb = ({ it, size }: { it: ItemPick; size: number }) => { const m = META[it.id]; const av = it.id === 'creator' ? (profile?.avatarUrl ?? null) : null; return <span style={{ width: size, height: size, borderRadius: Math.round(size * 0.22), flex: 'none', display: 'grid', placeItems: 'center', background: it.id === 'creator' && it.on ? 'linear-gradient(135deg,#f6c1dc,#c2418f)' : `${m.hue}1f`, overflow: 'hidden', ['--c2' as string]: m.hue }}>{av && it.on ? <img src={av} alt="" style={{ width: size, height: size, objectFit: 'cover' }} /> : it.id === 'creator' && it.on ? <span style={{ color: '#fff', fontWeight: 800, fontSize: size * 0.3 }}>{initials(profile?.name ?? me?.creator?.name ?? 'C')}</span> : <span style={{ width: Math.round(size * 0.7) }}><Drawing spec={{ scene: m.scene }} name="" rating="" t={(s) => s} /></span>}</span> }

  /* THE STEPS: five whole plans, from free to everything, in the order each dollar buys the most.
     The picker's own set is step two. Tapping a step sets the lines; every line stays editable. */
  const cn = me?.creator && me.creator.nearby ? me.creator : null
  /* the picker's own options, kept from the moment the items arrived, so the steps and their
     prices stay put while the owner edits lines */
  const baseline = useRef<Record<string, Record<string, unknown>>>({})
  useEffect(() => { for (const it of items) if (it.uid === it.id && !baseline.current[it.id]) baseline.current[it.id] = { ...it.options } }, [items])
  const baseOpts = (it: ItemPick) => baseline.current[it.id] ?? it.options
  const stepSets = useMemo((): { label: string; note: string; on: Record<string, Record<string, unknown> | true>; }[] => {
    const usualOn: Record<string, Record<string, unknown> | true> = {}
    for (const it of items) if (it.on && it.uid === it.id) usualOn[it.id] = true
    const free: Record<string, Record<string, unknown> | true> = { post: true, taste: true, review: true, sign: true }
    for (const k of keep ?? []) free[k] = true
    const s1 = { ...free, ...usualOn }
    const s2 = { ...s1, ...(cn ? { creator: { slug: cn.slug } } : { boost: { cents: 10000 } }) }
    /* Go bigger: a Reel, print, and the bigger boost, so it reaches further as well as making more */
    const s3 = { ...s2, video: { filmed: cn ? 'creator' : 'clips', count: 1, style: 'dish', captions: true }, print: { kinds: ['poster'] }, boost: { cents: 10000 } }
    const s4 = { ...s3, photos: { list: [], reel: false }, boost: { cents: 10000 } }
    if (ladder) { const k: Record<string, true> = {}; for (const id of keep ?? []) k[id] = true; return [{ label: 'Free', note: ladder.notes.simple, on: { ...ladder.simple, ...k } }, { label: '', note: ladder.notes.recommended, on: { ...ladder.recommended, ...k } }, { label: '', note: ladder.notes.bigger, on: { ...ladder.bigger, ...k } }] }
    return [{ label: 'Free', note: 'Your channels only', on: free }, { label: '', note: 'The usual pick', on: s1 }, { label: '', note: cn ? `${cn.name.split(' ')[0]} posts it` : 'A bigger boost', on: s2 }, { label: '', note: 'A Reel and a poster', on: s3 }, { label: '', note: 'A shoot day too', on: s4 }]
  }, [items.length, cn?.slug, (keep ?? []).join(','), ladder]) // eslint-disable-line react-hooks/exhaustive-deps
  const costOf = (set: Record<string, Record<string, unknown> | true>) => items.filter((x) => x.uid === x.id).reduce((sum, it) => { const v = set[it.id]; if (!v) return sum; const opt = v === true ? baseOpts(it) : { ...baseOpts(it), ...v }; return sum + itemCents({ ...it, on: true, options: opt }, prices, profile) }, 0)
  const applyStep = (n: number) => {
    const set = stepSets[n].on
    /* a level sets the base lines; custom lines the owner wrote ride along untouched */
    setItems((xs) => xs.filter((x) => x.uid === x.id || x.id === 'custom').map((it) => { if (it.id === 'custom') return it; const v = set[it.id]; return v ? { ...it, on: true, options: v === true ? baseOpts(it) : { ...baseOpts(it), ...v } } : { ...it, on: false } }))
  }
  const currentStep = (() => {
    const onIds = items.filter((x) => x.on && x.id !== 'custom').map((x) => x.id).sort().join(',')
    const boostNow = Number(items.find((x) => x.id === 'boost' && x.on)?.options.cents) || 0
    for (let i = 0; i < stepSets.length; i++) {
      const set = stepSets[i].on
      const ids = Object.keys(set).sort().join(',')
      if (ids !== onIds) continue
      const b = set.boost; const bl = items.find((x) => x.uid === 'boost'); const wantB = b === true ? (Number(bl ? baseOpts(bl).cents : 0) || 0) : b ? Number((b as Record<string, unknown>).cents) || 0 : 0
      if (!set.boost || wantB === boostNow) return i
    }
    return -1
  })()
  /* the page opens on Recommended (owner 2026-09-22): the first suggestion is close to it but not the same set,
     so the middle plan is applied once when the ladder arrives, never again after the owner starts editing */
  const seeded = useRef(false)
  /* THE BANDS (owner 2026-09-24): which group is open on the plan page; one at a time */
  const [band, setBand] = useState<string | null>(null)
  /* ADD, BROWSED LIKE THE CREATE PAGE (owner 2026-09-24): the stage tab the add shelf shows; null is For you */
  const [addStage, setAddStage] = useState<string | null>(null)
  useEffect(() => { if (simplePlans && ladder && items.length && !seeded.current) { seeded.current = true; if (currentStep < 0) applyStep(1) } }, [ladder, items.length]) // eslint-disable-line react-hooks/exhaustive-deps
  const stepLabels = stepSets.map((st, i) => (i === 0 ? 'Free' : dollars(costOf(st.on))))
  /* a step that adds nothing (the shoot was already on) is not a step */
  const stepIdx = stepSets.map((_, i) => i).filter((i, k, arr) => i === 0 || costOf(stepSets[i].on) !== costOf(stepSets[arr[k - 1]].on))

  /* PLAN MODE: one short row per picked line; the free in-restaurant things as one row */
  const picked = items.filter((x) => x.on && META[x.id].group !== 'inside')
  const insideOn = items.filter((x) => x.on && META[x.id].group === 'inside')
  const PlanRow = ({ it }: { it: ItemPick }) => { const m = META[it.id]; const cents = itemCents(it, prices, profile); const sum = itemSummary(it, prices, profile, { platforms: platformsWord, bestHour: bestHourWord, readyBy }); return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '9px 0', borderBottom: `0.5px solid ${C.line}` }}>
      <Thumb it={it} size={44} />
      <button type="button" onClick={() => (m.hasOptions ? setOpen(it.uid) : toggle(it.uid))} style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 0, padding: 0, font: 'inherit', color: C.ink, cursor: 'pointer' }}>
        <b style={{ display: 'block', fontSize: 14 }}>{nameOf(it)}</b><small style={{ ...sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sum}</small>
      </button>
      <b style={{ fontSize: 13.5, whiteSpace: 'nowrap', color: cents ? C.ink : C.greenDk }}>{cents ? dollars(cents) : 'Free'}</b>
      <button type="button" aria-label="Remove" onClick={() => (it.uid === it.id ? toggle(it.uid) : remove(it.uid))} style={{ width: 26, height: 26, borderRadius: 99, border: `0.5px solid ${C.line}`, background: '#fff', color: C.mute, cursor: 'pointer', display: 'grid', placeItems: 'center', fontSize: 14, lineHeight: 1, flex: 'none' }}>×</button>
    </div>
  ) }

  /* ADD MODE: the whole menu, grouped, rows one line each */
  const AddRow = ({ it, tag }: { it: ItemPick; tag?: string }) => { const m = META[it.id]; const cents = it.on ? itemCents(it, prices, profile) : minOf(it); const free = m.free || cents === 0; return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '9px 0', borderBottom: `0.5px solid ${C.line}` }}>
      <Thumb it={it} size={44} />
      <button type="button" onClick={() => (m.hasOptions ? setOpen(it.uid) : toggle(it.uid))} style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 0, padding: 0, font: 'inherit', color: C.ink, cursor: 'pointer' }}>
        <b style={{ display: 'block', fontSize: 14 }}>{META[it.id].name}{tag && !it.on && <span style={{ marginLeft: 6, fontSize: 9.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: C.greenDk, background: C.greenSoft, borderRadius: 99, padding: '2px 6px', verticalAlign: 'middle' }}>{tag}</span>}</b><small style={{ ...sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.on ? `✓ ${itemSummary(it, prices, profile, { platforms: platformsWord, bestHour: bestHourWord, readyBy })}` : m.line}</small>{it.why && <small style={{ ...sub, fontSize: 11, color: C.faint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.why}</small>}
      </button>
      <b style={{ fontSize: 13, whiteSpace: 'nowrap', color: free ? C.greenDk : C.ink }}>{free ? 'Free' : `${m.hasOptions && !it.on ? 'from ' : ''}${dollars(cents)}`}</b>
      {m.hasOptions && it.on && <button type="button" onClick={() => setOpen(it.uid)} aria-label={it.id === 'creator' ? 'Swap the creator' : 'Change the options'} style={{ fontSize: 11.5, fontWeight: 800, padding: '5px 9px', borderRadius: 99, border: `1.5px solid ${C.line}`, background: '#fff', color: C.ink, cursor: 'pointer', fontFamily: 'inherit', flex: 'none', whiteSpace: 'nowrap' }}>{it.id === 'creator' ? 'Swap' : 'Change'}</button>}
      {MULTI.includes(it.id) && it.on && it.id !== 'creator' && <button type="button" onClick={() => addNew(it.id)} style={{ fontSize: 11.5, fontWeight: 800, padding: '5px 9px', borderRadius: 99, border: `1.5px solid ${C.line}`, background: '#fff', color: C.ink, cursor: 'pointer', font: 'inherit', flex: 'none', whiteSpace: 'nowrap' }}>＋ Another</button>}
      {(() => { const added = it.on; const act = () => (it.on ? toggle(it.uid) : m.hasOptions ? setOpen(it.uid) : toggle(it.uid)); return <button type="button" onClick={act} aria-label={added ? 'Added, tap to remove' : 'Add'} style={{ width: 34, height: 34, borderRadius: 99, border: `1.5px solid ${added ? C.greenDk : C.ink}`, background: added ? C.greenDk : '#fff', color: added ? '#fff' : C.ink, cursor: 'pointer', display: 'grid', placeItems: 'center', flex: 'none', transition: 'background .18s, border-color .18s' }}>{added ? <span key="on" className="an-pop" style={{ display: 'grid' }}><Check size={16} strokeWidth={3} /></span> : <Plus size={16} strokeWidth={2.5} />}</button> })()}
    </div>
  ) }

  return (
    <div key={mode} className={mode === 'add' ? 'an-fwd' : switched ? 'an-back' : undefined}>
      {mode === 'plan' && simplePlans ? <>
        {(() => {
          /* THE CART, WITH REAL PRODUCTS (owner 2026-09-24): every line is a product with a spec, a quantity where one
             makes sense, a price, and a state that says whether it is ready to buy. Rows are laid out like a DoorDash
             item: the disc, the bold name, a chevron; the choices as short lines; at the bottom the stepper or bin and
             the state chip on the left, the price on the right. Then Add to your plan, then the subtotal. */
          const three = ladder ? [0, 1, 2] : [0, 1, ([2, 3, 4].find((i) => stepSets[i] && costOf(stepSets[i].on) > costOf(stepSets[1].on)) ?? 2)]
          const titles: Record<number, string> = { [three[0]]: 'Just be seen', [three[1]]: 'Drive actions', [three[2]]: 'The full push' }
          const chosen = currentStep
          const pos = three.indexOf(chosen)
          const day = (iso: string | null | undefined) => (iso && iso.length === 10 ? nice(iso).replace(/^(\w+), /, '$1 ') : iso ?? '')
          const chans = platformsWord ? platformsWord.split(', ') : []
          const postName = chans.length ? `Post on ${chans.length > 1 ? `${chans.slice(0, -1).join(', ')} and ${chans[chans.length - 1]}` : chans[0]}` : 'Post on your channels'
          type Row = { key: string; uid: string; id: ItemId; name: string; lines: string[]; price: string; cents: number; state: { ok: boolean; word: string }; count?: number; onMinus?: () => void; onPlus?: () => void; onBin: () => void; blocks: boolean }
          const rows: Row[] = []
          const on = (id: ItemId) => items.filter((x) => x.on && x.id === id)
          const ready = (word = 'Ready') => ({ ok: true, word })
          const needs = (word: string) => ({ ok: false, word })
          for (const it of on('post')) rows.push({ key: it.uid, uid: it.uid, id: 'post', name: postName, lines: [day(dates?.posts) ? `${day(dates?.posts)}, ${bestHourWord}` : bestHourWord, ...(it.options.story !== false ? ['Story included'] : []), ...(orderButton ? ['Order button on'] : [])], price: 'Free', cents: 0, state: ready(), onBin: () => toggle(it.uid), blocks: false })
          for (const it of on('boost')) { const c = Math.round((Number(it.options.cents) || 2000) / 100); rows.push({ key: it.uid, uid: it.uid, id: 'boost', name: 'Boost the post', lines: [`${c <= 20 ? 'Small' : c >= 100 ? 'Big' : 'Standard'}, $${c}`, `${Number(it.options.days) || 3} days`, `About ${(c * 150).toLocaleString()} nearby, est.`], price: dollars(itemCents(it, prices, profile)), cents: itemCents(it, prices, profile), state: ready(), onBin: () => toggle(it.uid), blocks: false }) }
          for (const it of on('creator')) { const picked = !!it.options.slug && (profile || cn); const nm = profile?.name ?? cn?.name ?? null; const code = nm ? `${nm.split(' ')[0].replace(/[^a-z]/gi, '').toUpperCase().slice(0, 8)}10` : ''; rows.push({ key: it.uid, uid: it.uid, id: 'creator', name: 'Creator visit and post', lines: picked && nm ? [nm, ...(it.options.date ? [day(String(it.options.date))] : []), ...(it.options.code !== false ? [`Code ${code}`] : [])] : [`${Math.max(1, fits.length)} near you, ranked`, 'Visits, eats, posts it'], price: picked ? dollars(itemCents(it, prices, profile)) : `from ${dollars(itemCents(it, prices, profile))}`, cents: itemCents(it, prices, profile), state: picked ? ready() : needs('Choose a creator'), onBin: () => (it.uid === it.id ? toggle(it.uid) : remove(it.uid)), blocks: !picked }) }
          for (const it of on('graphic')) { const lay = graphicLayout(it.options, prices); const dn = graphicDishes(it.options, prices); const inc = it.options.from === 'shoot' && Number(it.options.included) > 0; const c = itemCents(it, prices, profile); const lvl = graphicLevel(it.options); rows.push({ key: it.uid, uid: it.uid, id: 'graphic', name: lay === 'carousel' ? `Carousel post, ${dn} slides` : lay === 'each' ? `${dn} graphics, one per dish` : `Instagram graphic${it.options.priceOn !== false ? ', price on it' : ''}`, lines: [inc ? 'With the content day' : it.options.from === 'shoot' ? 'From the next shoot' : it.options.from === 'stock' ? 'On a licensed photo' : 'From your photo', `${LEVEL_NAME[lvl]}: ${GRAPHIC_LEVEL_LINE(lvl)}`, `Ready ${day(dates?.ready) || 'in 2 days'}`], price: c ? (inc ? `+${dollars(c)}` : dollars(c)) : inc ? 'Included' : 'Free', cents: c, state: ready(), onBin: () => (it.uid === it.id ? toggle(it.uid) : remove(it.uid)), blocks: false }) }
          for (const it of on('video')) { const n = Math.max(1, Number(it.options.count) || 1); const f = it.options.filmed; const src = f === 'shoot' ? 'From the shoot' : f === 'clips' ? (hasVideo ? 'From your clips' : 'Send clips from your phone') : f === 'creator' ? `${(profile?.name ?? cn?.name ?? 'The creator').split(' ')[0]} films it` : 'We come film it'; const incV = f === 'shoot' ? (Number(it.options.included) || 0) : 0; const cV = itemCents(it, prices, profile); rows.push({ key: it.uid, uid: it.uid, id: 'video', name: 'Reel', lines: [f === 'shoot' ? (incV ? `${incV} in the content day${n > incV ? `, ${n - incV} extra at $${PACKAGE_EXTRA.video / 100}` : ''}` : `From the shoot, $${PACKAGE_EXTRA.video / 100} each`) : src, `${VIDEO_LEVEL_NAME[videoLevel(it.options)]}: ${VIDEO_LEVEL_LINE[videoLevel(it.options)].split(' · ').slice(0, 2).join(', ')}`], price: cV ? dollars(cV) : incV ? 'Included' : 'Free', cents: cV, state: ready(), count: n, onMinus: () => (n <= 1 ? (it.uid === it.id ? toggle(it.uid) : remove(it.uid)) : patchU(it.uid, (x) => ({ options: { ...x.options, count: n - 1 } }))), onPlus: () => patchU(it.uid, (x) => ({ options: { ...x.options, count: Math.min(6, n + 1) } })), onBin: () => (it.uid === it.id ? toggle(it.uid) : remove(it.uid)), blocks: false }) }
          for (const it of on('photos')) { const n = Number(it.options.photos) || 15; const pk = it.options.tier ? PACKAGES[it.options.tier as PackageTier] : null; rows.push({ key: it.uid, uid: it.uid, id: 'photos', name: it.options.queue ? 'Next content shoot' : pk ? `Content day, ${pk.label}` : `Content shoot, ${PACKAGES[packageFor(n)].label}`, lines: it.options.queue ? [`${n} photos`, 'Waits for the next visit'] : [pk ? `${pk.photos} photos, ${pk.reels} Reel${pk.reels === 1 ? '' : 's'} and the post graphic${pk.graphicLevel === 3 ? ' (The works)' : ''}` : `${n} photos`, it.options.date ? day(String(it.options.date)) : 'Team offers two dates'], price: it.options.queue ? 'Paid when booked' : dollars(itemCents(it, prices, profile)), cents: itemCents(it, prices, profile), state: ready(), onBin: () => toggle(it.uid), blocks: false }) }
          for (const it of on('print')) { const kinds = (it.options.kinds as string[] | undefined) ?? ['tent']; for (const k of kinds) rows.push({ key: `${it.uid}-${k}`, uid: it.uid, id: 'print', name: k === 'poster' ? 'Window poster print' : 'Table tent print', lines: [k === 'poster' ? '1 poster, from the graphic' : '25 cards, from the graphic', `Delivered ${day(dates?.ready) || 'in 3 days'}`], price: dollars(prices.print), cents: prices.print, state: ready(), onBin: () => { const rest = kinds.filter((x) => x !== k); if (rest.length) patchU(it.uid, (x) => ({ options: { ...x.options, kinds: rest } })); else toggle(it.uid) }, blocks: false }) }
          for (const it of on('taste')) rows.push({ key: it.uid, uid: it.uid, id: 'taste', name: 'Taste at the counter', lines: [`All week from ${day(startDay) || 'the start'}`, 'On the team card'], price: 'Free', cents: 0, state: ready(), onBin: () => toggle(it.uid), blocks: false })
          for (const it of on('offer')) { const okd = it.options.confirmed === true; const txt = String(it.options.text ?? '') || 'A free drink with it this week'; const code = String(it.options.codeText ?? ''); rows.push({ key: it.uid, uid: it.uid, id: 'offer', name: 'Launch offer with a code', lines: [txt, code ? `Code ${code}` : 'Code to fill in'], price: 'Free', cents: 0, state: okd ? ready() : needs((code ? 'Check the code' : 'Fill in the code')), onBin: () => toggle(it.uid), blocks: !okd }) }
          for (const it of on('apps')) rows.push({ key: it.uid, uid: it.uid, id: 'apps', name: 'DoorDash feature', lines: ['Two weeks on the item'], price: 'Free', cents: 0, state: me?.connected?.apps ? ready() : needs('Connect DoorDash'), onBin: () => toggle(it.uid), blocks: false })
          for (const it of on('review')) rows.push({ key: it.uid, uid: it.uid, id: 'review', name: 'Review ask with the check', lines: ['Two weeks', 'The printed card'], price: 'Free', cents: 0, state: ready(), onBin: () => toggle(it.uid), blocks: false })
          for (const it of on('sign')) rows.push({ key: it.uid, uid: it.uid, id: 'sign', name: 'Guest photo sign', lines: ['1 sign', 'Post it, tag us'], price: 'Free', cents: 0, state: ready(), onBin: () => toggle(it.uid), blocks: false })
          for (const it of on('custom')) rows.push({ key: it.uid, uid: it.uid, id: 'custom', name: String(it.options.what ?? '') || 'Something else', lines: [String(it.options.tell ?? '') || 'The team quotes it', it.options.when ? day(String(it.options.when)) : 'No rush'], price: 'Quote to come', cents: 0, state: needs('Quote pending'), onBin: () => remove(it.uid), blocks: false })
          /* THREE GROUPS (owner 2026-09-24), the way an owner thinks, not the funnel: we make it, people see it, they
             come in. A group shows only when the plan has it. */
          const GROUPS: { key: string; name: string; hue: string; ids: ItemId[] }[] = [
            { key: 'make', name: 'What we make', hue: '#3b6fd4', ids: ['photos', 'graphic', 'video'] },
            { key: 'seen', name: 'Where people see it', hue: '#2e9a78', ids: ['post', 'boost', 'creator', 'apps'] },
            { key: 'room', name: 'At your restaurant', hue: '#6a39de', ids: ['print', 'taste', 'offer', 'review', 'sign'] },
            { key: 'custom', name: 'Just for you', hue: '#8a928e', ids: ['custom'] },
          ]
          const groups = GROUPS.map((g) => ({ g, rows: rows.filter((r) => g.ids.includes(r.id)).sort((x, y) => g.ids.indexOf(x.id) - g.ids.indexOf(y.id)) })).filter((x) => x.rows.length)
          const groupOf = (id: ItemId) => GROUPS.find((g) => g.ids.includes(id))?.key ?? null
          /* THE STAGES (owner 2026-09-24): the Create page's five, in its colors, for the plan and the add shelf alike */
          const SHELF: { key: string; hue: string; ids: ItemId[] }[] = [
            { key: 'Awareness', hue: '#2e9a78', ids: ['post', 'boost', 'creator'] },
            { key: 'Interest', hue: '#3b6fd4', ids: ['photos', 'graphic', 'video', 'print'] },
            { key: 'Actions', hue: '#6a39de', ids: ['taste', 'offer'] },
            { key: 'Orders', hue: '#d99a1e', ids: ['apps'] },
            { key: 'Retention', hue: '#0f97a8', ids: ['review', 'sign'] },
          ]
          const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
          const listWords = (ws: string[]) => (ws.length <= 1 ? ws[0] ?? '' : ws.length <= 3 ? `${ws.slice(0, -1).join(', ')} and ${ws[ws.length - 1]}` : `${ws.slice(0, 2).join(', ')} and ${ws.length - 2} more`)
          /* one plain line under each group's name, so it reads without opening */
          const summary = (key: string): string => {
            if (key === 'make') {
              const ph = on('photos')[0]
              if (ph && ph.options.queue) return 'From your next content shoot'
              if (ph) { const t = (ph.options.tier as PackageTier) || packageFor(Number(ph.options.photos) || 15); return t === 'standard' ? 'A quick visit for photos and video' : `${cap(PACKAGES[t].label)} of photos and video` }
              const g = on('graphic').reduce((n, x) => n + (Number(x.options.count) || 1), 0), v = on('video').reduce((n, x) => n + (Number(x.options.count) || 1), 0)
              return cap(listWords([g ? `${g} graphic${g === 1 ? '' : 's'}` : '', v ? `${v} Reel${v === 1 ? '' : 's'}` : ''].filter(Boolean)))
            }
            if (key === 'seen') {
              const b = on('boost')[0]
              return cap(listWords([on('post').length ? 'a post' : '', b ? `a $${Math.round((Number(b.options.cents) || 2000) / 100)} boost` : '', on('creator').length ? 'a creator' : '', on('apps').length ? 'DoorDash' : ''].filter(Boolean)))
            }
            if (key === 'room') {
              const pr = on('print')[0]; const kinds = (pr?.options.kinds as string[] | undefined) ?? ['tent']
              return cap(listWords([pr ? (kinds.includes('tent') ? 'a table card' : 'a poster') : '', on('taste').length ? 'a taste' : '', on('offer').length ? 'an offer' : '', on('review').length ? 'review asks' : '', on('sign').length ? 'a photo sign' : ''].filter(Boolean)))
            }
            return 'Quoted by the team'
          }
          const missing = rows.filter((r) => r.blocks)
          const offIds: ItemId[] = ['creator', 'boost', 'video', 'photos', 'print', 'graphic', 'taste', 'offer', 'apps', 'review', 'sign']
          const offRows = offIds.map((id) => { const lines = items.filter((x) => x.id === id); return lines.find((x) => x.uid === id) ?? lines[0] }).filter((x): x is ItemPick => !!x && !x.on)
          const offName: Record<string, string> = { creator: 'Creator visit and post', boost: 'Boost the post', video: 'Reel', photos: 'Content shoot, a quick visit', print: 'Table tent print', graphic: 'Instagram graphic, price on it', taste: 'Taste at the counter', offer: 'Launch offer with a code', apps: 'DoorDash feature', review: 'Review ask with the check', sign: 'Guest photo sign' }
          const offLines: Record<string, string[]> = { creator: ['A local creator visits and posts', `${Math.max(1, fits.length)} near you, ranked`], boost: ['Shown to people nearby', '3 days'], video: ['From your clips, or filmed here', '15 to 30 seconds'], photos: ['15 photos, one visit', 'Team offers two dates'], print: ['25 cards, from the graphic'], graphic: ['Designed for the post', 'Ready in 2 days'], taste: ['All week', 'On the team card'], offer: ['A code the team counts'], apps: ['Two weeks on the item'], review: ['Two weeks', 'The printed card'], sign: ['1 sign', 'Post it, tag us'] }
          const recTag = (id: ItemId) => (ladder && (ladder.bigger[id] || ladder.recommended[id]) ? 'Recommended' : null)
          /* WHAT IT LOOKS LIKE (owner 2026-09-24): each piece as a tiny example of itself, not an icon */
          const offerCode = String(items.find((x) => x.id === 'offer')?.options.codeText ?? '')
          const creatorName = profile?.name ?? cn?.name ?? undefined
          const photosN = (() => { const ph = items.find((x) => x.on && x.id === 'photos'); return ph ? (ph.options.tier ? PACKAGES[ph.options.tier as PackageTier].photos : Number(ph.options.photos) || 15) : undefined })()
          const thumbFor = (id: string, w: number, key?: string) => <PieceThumb id={id} w={w} dish={dishList?.[0]} biz={bizName} variant={key?.endsWith('-poster') ? 'poster' : undefined} code={offerCode} creator={creatorName} photos={photosN} />
          const chipName: Record<string, string> = { creator: 'Creator visit', boost: 'Boost the post', video: 'Reel', photos: 'Content day', print: 'Table tent', graphic: 'Graphic', taste: 'Taste', offer: 'Launch offer', apps: 'DoorDash feature', review: 'Review ask', sign: 'Photo sign' }
          /* THE ORIGINAL ITEM CARDS (owner 2026-09-24): an opened group shows its items the way the cart did */
          const chip = (st: { ok: boolean; word: string }) => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 24, padding: '0 9px', borderRadius: 99, fontSize: 11.5, fontWeight: 700, background: st.ok ? C.greenSoft : '#fff4e0', color: st.ok ? C.greenDk : '#8a5a0c' }}>{st.ok ? <Check size={11} strokeWidth={3} /> : <span style={{ width: 6, height: 6, borderRadius: 99, background: '#d99a1e' }} />}{st.word}</span>
          const cartRow = (r: Row, first: boolean) => (
            <div key={r.key} style={{ borderTop: first ? 0 : `0.5px solid ${C.line}`, padding: '14px 0' }}>
              <div role="button" tabIndex={0} onClick={() => setOpen(r.uid)} onKeyDown={(e) => { if (e.key === 'Enter') setOpen(r.uid) }} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer' }}>
                {thumbFor(r.id, 48, r.key)}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}><b style={{ flex: 1, fontSize: 15, lineHeight: 1.25 }}>{r.name}</b><ChevronRight size={18} color={C.faint} style={{ flex: 'none', marginTop: 1 }} /></div>
                  <div style={{ marginTop: 4 }}>{r.lines.slice(0, 4).map((l, i) => <div key={i} style={{ fontSize: 13, color: C.mute, lineHeight: 1.45, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l}</div>)}</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 10, paddingLeft: 68 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {r.count != null ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', border: `1px solid ${C.line}`, borderRadius: 99, height: 32, overflow: 'hidden' }}>
                      <button type="button" aria-label={r.count === 1 ? 'Remove' : 'One fewer'} onClick={r.onMinus} style={{ width: 32, height: 32, border: 0, background: 'none', display: 'grid', placeItems: 'center', cursor: 'pointer', color: C.ink }}>{r.count === 1 ? <Trash2 size={13} /> : <Minus size={13} />}</button>
                      <b style={{ minWidth: 16, textAlign: 'center', fontSize: 13.5 }}>{r.count}</b>
                      <button type="button" aria-label="One more" onClick={r.onPlus} disabled={r.count >= 6} style={{ width: 32, height: 32, border: 0, background: 'none', display: 'grid', placeItems: 'center', cursor: 'pointer', color: r.count >= 6 ? C.faint : C.ink }}><Plus size={13} /></button>
                    </span>
                  ) : <button type="button" aria-label="Remove" onClick={r.onBin} style={{ width: 32, height: 32, borderRadius: 99, border: `1px solid ${C.line}`, background: 'none', display: 'grid', placeItems: 'center', cursor: 'pointer', color: C.ink }}><Trash2 size={13} /></button>}
                  {chip(r.state)}
                </div>
                <b style={{ fontSize: 15, whiteSpace: 'nowrap', color: r.cents || r.price.startsWith('from') ? C.ink : C.greenDk }}>{r.price}</b>
              </div>
            </div>
          )
          const bandRow = (r: Row) => {
            const extra = r.lines.map((l) => l.match(/(\d+) extra at (\$[\d,]+)/)).find(Boolean)
            const note = !r.state.ok ? r.state.word : extra ? `${extra[1]} extra, ${extra[2]}` : ''
            const priceIsFree = !r.cents && !r.price.startsWith('from') && !/Quote|Paid/.test(r.price)
            return (
              <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, padding: '8px 8px 8px 14px', minHeight: 52, boxSizing: 'border-box', borderRadius: 14, background: '#fff' }}>
                <button type="button" onClick={() => setOpen(r.uid)} style={{ flex: 1, minWidth: 0, border: 0, background: 'none', padding: '4px 0', textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer', color: C.ink }}>
                  <b style={{ display: 'block', fontSize: 15, fontWeight: 600, lineHeight: 1.25 }}>{r.name}</b>
                  {note && <small style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginTop: 2, color: r.state.ok ? '#3b6fd4' : '#8a5a0c' }}>{note}</small>}
                </button>
                {r.count != null && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', background: C.bg, borderRadius: 99, height: 32, flex: 'none' }}>
                    <button type="button" aria-label="One fewer" onClick={r.onMinus} style={{ width: 30, height: 32, border: 0, background: 'none', display: 'grid', placeItems: 'center', cursor: 'pointer', color: C.ink }}><Minus size={14} /></button>
                    <b style={{ minWidth: 14, textAlign: 'center', fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>{r.count}</b>
                    <button type="button" aria-label="One more" onClick={r.onPlus} disabled={r.count >= 6} style={{ width: 30, height: 32, border: 0, background: 'none', display: 'grid', placeItems: 'center', cursor: 'pointer', color: r.count >= 6 ? C.faint : C.ink }}><Plus size={14} /></button>
                  </span>
                )}
                <b style={{ fontSize: 14.5, whiteSpace: 'nowrap', flex: 'none', fontVariantNumeric: 'tabular-nums', color: priceIsFree ? (r.price === 'Included' ? C.mute : C.greenDk) : C.ink, fontWeight: priceIsFree && r.price === 'Included' ? 600 : 700 }}>{r.price}</b>
                <button type="button" aria-label={`Remove ${r.name}`} onClick={r.onBin} style={{ width: 28, height: 28, borderRadius: 99, border: 0, background: C.bg, display: 'grid', placeItems: 'center', cursor: 'pointer', color: C.mute, flex: 'none' }}><X size={14} strokeWidth={2.4} /></button>
              </div>
            )
          }
          /* the short name under each picture (owner 2026-09-24): what it is, no sentence */
          const tileLabel = (r: Row): string => {
            const n = r.count ?? 1
            switch (r.id) {
              case 'photos': return /Next/.test(r.name) ? 'Next shoot' : 'Photoshoot'
              case 'graphic': { const lay = graphicLayout(items.find((x) => x.uid === r.uid)?.options ?? {}, prices); return lay === 'carousel' ? 'Carousel' : lay === 'each' ? `${graphicDishes(items.find((x) => x.uid === r.uid)?.options ?? {}, prices)} graphics` : 'Graphic' }
              case 'video': return `${n} Reel${n === 1 ? '' : 's'}`
              case 'post': return 'Post'
              case 'boost': return 'Boost'
              case 'creator': return 'Creator'
              case 'apps': return 'DoorDash'
              case 'print': return r.name.replace(/ print$/, '').replace(/^Window poster$/, 'Poster')
              case 'taste': return 'Taste'
              case 'offer': return 'Offer'
              case 'review': return 'Review ask'
              case 'sign': return 'Photo sign'
              default: return r.name
            }
          }
          const bandView = ({ g, rows: rs }: { g: typeof GROUPS[number]; rows: Row[] }) => {
            const open = band === g.key
            const cents = rs.reduce((n, r) => n + r.cents, 0)
            const needy = rs.find((r) => r.blocks)
            const totalWord = g.key === 'custom' ? 'Quote' : cents ? dollars(cents) : 'Free'
            return (
              <div key={g.key} style={{ marginTop: 8, borderRadius: 18, background: `color-mix(in srgb, ${g.hue} 9%, #fff)`, border: `1.5px solid ${open ? `color-mix(in srgb, ${g.hue} 30%, #fff)` : 'transparent'}`, overflow: 'hidden' }}>
                <button type="button" aria-expanded={open} onClick={() => setBand(open ? null : g.key)} style={{ display: 'block', width: '100%', padding: '12px 14px 13px', border: 0, background: 'none', fontFamily: 'inherit', textAlign: 'left', cursor: 'pointer', color: C.ink }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 99, background: g.hue, flex: 'none' }} />
                    <b style={{ fontFamily: DISPLAY, fontSize: 16, fontWeight: 700, letterSpacing: '-.02em' }}>{g.name}</b>
                    {needy && <span aria-label={needy.state.word} style={{ width: 8, height: 8, borderRadius: 99, background: '#d99a1e', flex: 'none' }} />}
                    <b style={{ marginLeft: 'auto', fontFamily: DISPLAY, fontSize: 17, fontWeight: 700, letterSpacing: '-.02em', whiteSpace: 'nowrap', color: totalWord === 'Free' ? C.greenDk : C.ink }}>{totalWord}</b>
                    <ChevronRight size={18} color={C.faint} style={{ flex: 'none', marginRight: -4, transform: open ? 'rotate(-90deg)' : 'rotate(90deg)', transition: 'transform .15s' }} />
                  </span>
                  {!open && (
                    <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                      {rs.map((r) => (
                        <span key={r.key} style={{ width: 62, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                          <span style={{ position: 'relative', display: 'block' }}>
                            {thumbFor(r.id, 52, r.key)}
                            {r.blocks && <span style={{ position: 'absolute', top: -3, right: -3, width: 11, height: 11, borderRadius: 99, background: '#d99a1e', border: '2px solid #fff' }} />}
                          </span>
                          <span style={{ fontSize: 11.5, fontWeight: 600, lineHeight: 1.2, textAlign: 'center', color: C.ink }}>{tileLabel(r)}</span>
                          {r.blocks && <span style={{ marginTop: -3, fontSize: 10.5, fontWeight: 700, lineHeight: 1.2, textAlign: 'center', color: '#8a5a0c' }}>{r.state.word}</span>}
                        </span>
                      ))}
                    </span>
                  )}
                </button>
                {open && <div style={{ margin: '0 10px 10px', padding: '0 14px', borderRadius: 16, background: '#fff' }}>{rs.map((r, i) => cartRow(r, i === 0))}</div>}
              </div>
            )
          }
          return (
            <div style={{ marginTop: 2 }}>
              {/* THE LEVELS (owner 2026-09-24): our pick is the one that invites; the other two stay quiet */}
              <div style={{ position: 'relative', display: 'flex', background: C.bg, borderRadius: 99, padding: 3, marginTop: 14 }}>
                {pos >= 0 && <span aria-hidden style={{ position: 'absolute', top: 3, bottom: 3, left: `calc(3px + ${pos} * (100% - 6px) / 3)`, width: 'calc((100% - 6px) / 3)', borderRadius: 99, background: pos === 1 ? C.greenSoft : '#fff', border: pos === 1 ? `1.5px solid ${C.greenDk}` : `1px solid ${C.line}`, boxSizing: 'border-box', boxShadow: pos === 1 ? '0 4px 14px rgba(46,154,120,.22)' : '0 1px 3px rgba(0,0,0,.08)', transition: 'left .2s, background .2s' }} />}
                {three.map((i, k) => { const pick = k === 1; const sel = pos === k; return (
                  <button key={i} type="button" onClick={() => applyStep(i)} style={{ position: 'relative', flex: 1, height: pick ? 50 : 44, alignSelf: 'center', borderRadius: 99, border: 0, background: 'none', fontFamily: 'inherit', cursor: 'pointer', color: pick ? C.ink : sel ? C.ink : C.mute, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1.15 }}>
                    {pick && <span style={{ position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)', height: 20, padding: '0 8px', borderRadius: 99, background: C.greenDk, color: '#fff', fontSize: 10.5, fontWeight: 800, letterSpacing: '.01em', display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', boxShadow: '0 2px 6px rgba(46,154,120,.3)' }}>★ Our pick</span>}
                    <b style={{ fontSize: pick ? 14 : 12.5, fontWeight: pick || sel ? 800 : 600 }}>{titles[i]}</b>
                    <small style={{ fontSize: pick ? 12 : 10.5, fontWeight: 700, color: pick ? C.greenDk : sel ? C.mute : C.faint }}>{costOf(stepSets[i].on) ? dollars(costOf(stepSets[i].on)) : 'Free'}</small>
                  </button>
                ) })}
              </div>
              {pos < 0 && <div style={{ fontSize: 12, color: C.mute, marginTop: 8, textAlign: 'center' }}>Your own mix. <button type="button" onClick={() => applyStep(three[1])} style={{ fontFamily: 'inherit', fontSize: 12, fontWeight: 700, color: C.greenDk, border: 0, background: 'none', padding: 0, cursor: 'pointer' }}>Back to our pick</button></div>}
              {(() => {
                /* IN YOUR PLAN, BY STAGE (owner 2026-09-24, "that way for the stages as well"): each stage the plan
                   reaches is a Create-page row, its name with its color dot and its total, then its pieces as picture
                   cards (the piece drawn as itself, the plan's name, the price). Tap a card to change or remove it. */
                const rails = [...SHELF.map((st) => ({ key: st.key, hue: st.hue, rs: rows.filter((r) => st.ids.includes(r.id)).sort((x, y) => st.ids.indexOf(x.id) - st.ids.indexOf(y.id)) })), { key: 'Just for you', hue: '#8a928e', rs: rows.filter((r) => r.id === 'custom') }].filter((x) => x.rs.length)
                const planCard = (r: Row, hue: string) => (
                  <button key={r.key} type="button" onClick={() => setOpen(r.uid)} style={{ flex: 'none', width: 148, scrollSnapAlign: 'start', border: 0, background: 'none', padding: 0, textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer', color: C.ink, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ position: 'relative', height: 116, borderRadius: 16, background: `color-mix(in srgb, ${hue} 14%, #fff)`, display: 'grid', placeItems: 'center', marginBottom: 6, overflow: 'hidden' }}>
                      {thumbFor(r.id, 62, r.key)}
                      {r.count != null && r.count > 1 && <em style={{ position: 'absolute', right: 8, top: 8, fontStyle: 'normal', fontWeight: 800, fontSize: 11, padding: '3px 8px', borderRadius: 99, background: 'rgba(255,255,255,.95)', color: C.ink }}>×{r.count}</em>}
                      {r.blocks && <em style={{ position: 'absolute', left: 8, bottom: 8, fontStyle: 'normal', fontWeight: 700, fontSize: 10.5, padding: '4px 9px', borderRadius: 99, background: '#fff4e0', color: '#8a5a0c', display: 'inline-flex', alignItems: 'center', gap: 5 }}><i style={{ width: 6, height: 6, borderRadius: 99, background: '#d99a1e' }} />{r.state.word}</em>}
                    </span>
                    <b style={{ fontSize: 14.5, fontWeight: 700, lineHeight: 1.25, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{r.name}</b>
                    <small style={{ fontSize: 12.5, fontWeight: 600, color: r.cents ? C.mute : C.greenDk, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.price}</small>
                  </button>
                )
                return (
                  <div style={{ marginTop: 6 }}>
                    {rails.map(({ key, hue, rs }) => {
                      const cents = rs.reduce((n, r) => n + r.cents, 0)
                      return (
                        <div key={key} style={{ marginTop: 18 }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                            <b style={{ fontFamily: DISPLAY, fontSize: 18, fontWeight: 700, letterSpacing: '-.02em', display: 'inline-flex', alignItems: 'center', gap: 8 }}><i style={{ width: 8, height: 8, borderRadius: 99, background: hue }} />{key}{rs.some((r) => r.blocks) && <i aria-label="Needs you" style={{ width: 8, height: 8, borderRadius: 99, background: '#d99a1e' }} />}</b>
                            <b style={{ fontSize: 15, fontWeight: 700, color: cents ? C.ink : C.greenDk, fontVariantNumeric: 'tabular-nums' }}>{key === 'Just for you' ? 'Quote' : cents ? dollars(cents) : 'Free'}</b>
                          </div>
                          <div className="mvp-hscroll" style={{ display: 'flex', gap: 12, overflowX: 'auto', scrollSnapType: 'x mandatory', scrollPaddingInline: 16, margin: '10px -16px 0', padding: '2px 16px 4px', scrollbarWidth: 'none', alignItems: 'flex-start' }}>
                            {rs.map((r) => planCard(r, hue))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
              {(() => {
                /* ADD TO YOUR PLAN, BROWSED LIKE THE CREATE PAGE (owner 2026-09-24): the same stage tabs (For you, then
                   the five stages in their colors), and under each, that stage's pieces as picture cards: a tinted
                   picture with the stage tag and the piece drawn as itself, the name, the price. Pieces already in
                   the plan say so and open their options; the rest add. Something else closes every shelf. */
                const stageOf = (id: ItemId) => SHELF.find((x) => x.ids.includes(id)) ?? SHELF[0]
                const base = (id: ItemId) => items.find((x) => x.id === id && x.uid === x.id) ?? items.find((x) => x.id === id)
                const forYou = offRows.filter((it) => recTag(it.id))
                const list: ItemPick[] = addStage == null
                  ? (forYou.length ? forYou : offRows)
                  : (SHELF.find((x) => x.key === addStage)?.ids ?? []).map(base).filter((x): x is ItemPick => !!x)
                const chipS = (on: boolean, hue: string): React.CSSProperties => ({ flex: 'none', height: 34, padding: '0 13px', borderRadius: 99, border: `1.5px solid ${hue}`, background: on ? hue : '#fff', color: on ? '#fff' : hue, fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' })
                const card = (it: ItemPick) => {
                  const st = stageOf(it.id); const m = META[it.id]; const cents = minOf(it); const free = m.free || cents === 0; const inPlan = it.on
                  /* in the plan: say it the way the plan does, with the plan's own price */
                  const row = inPlan ? rows.find((x) => x.uid === it.uid) : undefined
                  const tap = () => { const k = groupOf(it.id); if (k) setBand(k); if (inPlan || (m.hasOptions && !free)) setOpen(it.uid); else toggle(it.uid) }
                  return (
                    <button key={it.uid} type="button" onClick={tap} style={{ flex: 'none', width: 148, scrollSnapAlign: 'start', border: 0, background: 'none', padding: 0, textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer', color: C.ink, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ position: 'relative', height: 116, borderRadius: 16, background: `color-mix(in srgb, ${st.hue} 14%, #fff)`, display: 'grid', placeItems: 'center', marginBottom: 6, overflow: 'hidden' }}>
                        <em style={{ position: 'absolute', left: 8, top: 8, zIndex: 2, fontStyle: 'normal', fontWeight: 700, fontSize: 10, padding: '3px 8px', borderRadius: 99, background: 'rgba(255,255,255,.95)', color: st.hue, display: 'inline-flex', alignItems: 'center', gap: 4 }}><i style={{ width: 5, height: 5, borderRadius: 99, background: st.hue }} />{st.key}</em>
                        <span style={{ marginTop: 14 }}>{thumbFor(it.id, 62)}</span>
                        {inPlan
                          ? <em style={{ position: 'absolute', left: 8, bottom: 8, fontStyle: 'normal', fontWeight: 700, fontSize: 10.5, padding: '4px 9px', borderRadius: 99, background: C.ink, color: '#fff', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Check size={11} strokeWidth={3} /> In your plan</em>
                          : <span style={{ position: 'absolute', right: 8, bottom: 8, width: 26, height: 26, borderRadius: 99, background: '#fff', display: 'grid', placeItems: 'center', boxShadow: '0 1px 3px rgba(29,29,31,.14)' }}><Plus size={15} strokeWidth={2.8} color={C.greenDk} /></span>}
                      </span>
                      <b style={{ fontSize: 14.5, fontWeight: 700, lineHeight: 1.25, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{row?.name ?? offName[it.id] ?? m.name}</b>
                      <small style={{ fontSize: 12.5, color: C.mute, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row ? row.price : free ? 'Free' : `${m.hasOptions ? 'from ' : ''}${dollars(cents)}`}{!inPlan && recTag(it.id) ? ' · Recommended' : ''}</small>
                    </button>
                  )
                }
                return (
                  <div style={{ marginTop: 22 }}>
                    <b style={{ display: 'block', fontFamily: DISPLAY, fontSize: 18, fontWeight: 700, letterSpacing: '-.02em' }}>Add to your plan</b>
                    <div className="mvp-hscroll" style={{ display: 'flex', gap: 6, overflowX: 'auto', margin: '12px -16px 0', padding: '0 16px', scrollbarWidth: 'none' }}>
                      <button type="button" onClick={() => setAddStage(null)} style={chipS(addStage == null, C.greenDk)}>For you</button>
                      {SHELF.map((x) => <button key={x.key} type="button" onClick={() => setAddStage(x.key)} style={chipS(addStage === x.key, x.hue)}>{x.key}</button>)}
                    </div>
                    <div className="mvp-hscroll" style={{ display: 'flex', gap: 12, overflowX: 'auto', scrollSnapType: 'x mandatory', scrollPaddingInline: 16, margin: '14px -16px 0', padding: '2px 16px 4px', scrollbarWidth: 'none', alignItems: 'flex-start' }}>
                      {list.map(card)}
                      <button type="button" onClick={() => { const uid = newUid('custom'); setItems((xs) => [...xs, { id: 'custom', uid, on: false, why: '', options: { ...(FRESH.custom ?? {}) }, cents: 0 }]); setBand('custom'); setOpen(uid) }} style={{ flex: 'none', width: 148, scrollSnapAlign: 'start', border: 0, background: 'none', padding: 0, textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer', color: C.ink, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ position: 'relative', height: 116, borderRadius: 16, background: C.bg, display: 'grid', placeItems: 'center', marginBottom: 6 }}>{thumbFor('custom', 62)}</span>
                        <b style={{ fontSize: 14.5, fontWeight: 700, lineHeight: 1.25 }}>Something else</b>
                        <small style={{ fontSize: 12.5, color: C.mute }}>The team quotes it</small>
                      </button>
                    </div>
                  </div>
                )
              })()}
              {(() => {
                /* THE SUMMARY (owner 2026-09-24): the offer's code when the plan has one, then the money. The fee is
                   exact; tax is worked out by Stripe at payment (it depends on where the business is), so it is named
                   there rather than guessed here. */
                const offer = items.find((x) => x.on && x.id === 'offer')
                const code = String(offer?.options.codeText ?? '')
                const confirmed = offer?.options.confirmed === true
                const fee = Math.round(feeBaseCents(items, prices, profile) * SERVICE_FEE_RATE)
                const line = (l: React.ReactNode, v: React.ReactNode, strong = false) => <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, padding: strong ? '12px 0 0' : '6px 0', fontSize: strong ? 17 : 15, fontWeight: strong ? 800 : 500, color: C.ink }}><span>{l}</span><span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: strong ? 800 : 600 }}>{v}</span></div>
                return (
                  <div style={{ marginTop: 22 }}>
                    <b style={{ display: 'block', fontFamily: DISPLAY, fontSize: 18, fontWeight: 700, letterSpacing: '-.02em', marginBottom: 10 }}>Summary</b>
                    <div style={{ border: `1px solid ${C.line}`, borderRadius: 20, padding: '10px 16px 14px', background: '#fff' }}>
                      {offer && (
                        <div style={{ padding: '6px 0 12px', marginBottom: 6, borderBottom: `0.5px solid ${C.line}` }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: C.mute, marginBottom: 6 }}>Launch offer code</div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <input value={code} onChange={(e) => { const v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12); patchU(offer.uid, (x) => ({ options: { ...x.options, codeText: v, confirmed: false } })) }} placeholder="BANHMI10" aria-label="Launch offer code" style={{ flex: 1, minWidth: 0, height: 44, borderRadius: 12, border: `1.5px solid ${confirmed ? 'transparent' : '#e9c98a'}`, background: confirmed ? C.bg : '#fffaf0', padding: '0 12px', fontFamily: 'inherit', fontSize: 16, fontWeight: 700, letterSpacing: '.04em', color: C.ink, outline: 'none' }} />
                            <button type="button" disabled={!code} onClick={() => patchU(offer.uid, (x) => ({ options: { ...x.options, confirmed: true } }))} style={{ flex: 'none', height: 44, padding: '0 14px', borderRadius: 12, border: 0, background: confirmed ? C.greenSoft : C.ink, color: confirmed ? C.greenDk : '#fff', fontFamily: 'inherit', fontSize: 14, fontWeight: 700, cursor: code ? 'pointer' : 'default', opacity: code ? 1 : .5, display: 'inline-flex', alignItems: 'center', gap: 6 }}>{confirmed ? <><Check size={15} strokeWidth={3} /> Set</> : 'Use it'}</button>
                          </div>
                          {!confirmed && <div style={{ fontSize: 12.5, color: '#8a5a0c', fontWeight: 600, marginTop: 6 }}>Check the code, then tap Use it</div>}
                        </div>
                      )}
                      {line('Subtotal', total ? dollars(total) : 'Free')}
                      {line(<span>Fees &amp; estimated tax<small style={{ display: 'block', fontSize: 12, color: C.mute, fontWeight: 500, marginTop: 1 }}>{Math.round(SERVICE_FEE_RATE * 100)}% service fee on what we make. Tax is added at payment if it applies</small></span>, fee ? dollars(fee) : '$0')}
                      <div style={{ borderTop: `0.5px solid ${C.line}`, marginTop: 6 }}>{line('Total', total ? dollars(total + fee) : 'Free', true)}</div>
                      {rows.some((r) => r.id === 'custom') && <div style={{ fontSize: 12, color: C.mute, marginTop: 6 }}>Custom items are quoted after you order. Nothing is charged until you say yes.</div>}
                    </div>
                  </div>
                )
              })()}
            </div>
          )
        })()}
      </> : mode === 'plan' ? <>
        {preview && (
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 10, border: `0.5px solid ${C.line}`, borderRadius: 16 }}>
            <button type="button" onClick={preview.onPhoto} aria-label="Change the photo" style={{ width: 96, height: 96, borderRadius: 12, flex: 'none', position: 'relative', border: 0, padding: 0, cursor: 'pointer', overflow: 'hidden', background: preview.image ? `center/cover url(${preview.image})` : 'linear-gradient(160deg,#f3e3c8,#c98a3a)' }}>
              {!preview.image && <span style={{ position: 'absolute', left: 8, top: 8, right: 8, color: '#fff', fontWeight: 800, fontSize: 12, textAlign: 'left', lineHeight: 1.15, textShadow: '0 1px 3px rgba(0,0,0,.35)' }}>{preview.name}</span>}
              {preview.video && <span style={{ position: 'absolute', right: 6, top: 6, background: 'rgba(255,255,255,.92)', borderRadius: 99, padding: '2px 7px', fontSize: 10, fontWeight: 800 }}>Reel</span>}
              {preview.price && <span style={{ position: 'absolute', left: 6, bottom: 6, background: C.ink, color: '#fff', fontWeight: 800, padding: '3px 7px', borderRadius: 7, fontSize: 12 }}>{preview.price}</span>}
            </button>
            <button type="button" onClick={preview.onWords} style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 0, padding: 0, font: 'inherit', color: C.ink, cursor: 'pointer' }}>
              <b style={{ display: 'block', fontSize: 14, marginBottom: 2 }}>{preview.name}</b>
              <span style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontSize: 12.5, lineHeight: 1.4 }}>{preview.caption || (writing ? 'Writing the words…' : 'Tap to write the words')}</span>
              <small style={{ display: 'block', color: C.mute, fontSize: 11.5, marginTop: 4 }}>Tap to change the photo or the words</small>
            </button>
          </div>
        )}
        <div style={{ marginTop: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><b style={{ fontSize: 17, letterSpacing: '-.01em' }}>How far should it go?</b><span style={{ fontSize: 13, color: C.greenDk, fontWeight: 700 }}>{currentStep >= 0 ? (me?.budgetCents != null && total <= me.budgetCents && currentStep > 1 ? `Inside your $${Math.round(me.budgetCents / 100)}` : stepSets[currentStep].note) : 'Your own mix'}</span></div>
          <div style={{ display: 'flex', gap: 4, marginTop: 10 }}>{stepIdx.map((i) => <button key={i} type="button" onClick={() => applyStep(i)} aria-label={`Step ${stepIdx.indexOf(i) + 1}, ${stepLabels[i]}`} style={{ flex: 1, height: 22, border: 0, background: 'none', padding: '7px 0', cursor: 'pointer' }}><span style={{ display: 'block', height: 8, borderRadius: 99, background: currentStep >= i ? C.ink : C.line, transition: 'background .15s' }} /></button>)}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 11.5, color: C.mute, fontWeight: 600 }}>{stepIdx.map((i) => { const l = stepLabels[i]; return <span key={i} style={{ color: currentStep === i ? C.ink : C.mute, fontWeight: currentStep === i ? 800 : 600 }}>{l}</span> })}</div>
          <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><span style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.03em' }}>{reach != null ? round2(reach).toLocaleString() : '—'}<small style={{ fontSize: 12, fontWeight: 600, color: C.mute, marginLeft: 6, letterSpacing: 0 }}>people, about</small></span><span style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-.02em' }}>{total ? dollars(total) : 'Free'}</span></div>
          <div style={{ fontSize: 11, color: C.mute, marginTop: 4 }}>Tap a step. Each one is a whole plan.{me?.budgetCents != null ? ` Your budget is $${Math.round(me.budgetCents / 100).toLocaleString()}.` : ''}{usualReach ? ` Your posts usually reach about ${usualReach.toLocaleString()}.` : ''}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '18px 0 4px' }}><span style={h3}>Your plan</span></div>
        {picked.map((it) => <PlanRow key={it.uid} it={it} />)}
        {insideOn.length > 0 && <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '9px 0', borderBottom: `0.5px solid ${C.line}` }}>
          <span style={{ width: 44, height: 44, borderRadius: 10, flex: 'none', display: 'grid', placeItems: 'center', background: '#eaf7f3', ['--c2' as string]: '#2e9a78' }}><span style={{ width: 30 }}><Drawing spec={{ scene: 'dish' }} name="" rating="" t={(s) => s} /></span></span>
          <button type="button" onClick={() => setMode('add')} style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 0, padding: 0, font: 'inherit', color: C.ink, cursor: 'pointer' }}><b style={{ display: 'block', fontSize: 14 }}>In the restaurant</b><small style={{ ...sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{insideOn.map((x) => META[x.id].name.toLowerCase()).join(', ')}</small></button>
          <b style={{ fontSize: 13.5, color: C.greenDk }}>Free</b>
        </div>}
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}><button type="button" onClick={() => setMode('add')} style={{ fontSize: 13, fontWeight: 800, padding: '9px 16px', borderRadius: 99, border: `1.5px solid ${C.line}`, background: '#fff', font: 'inherit', color: C.ink, cursor: 'pointer' }}>＋ Add more</button></div>
        {dates && <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>{[['Posts', dates.posts], ['Graphic ready', items.some((x) => x.on && x.id === 'graphic') ? dates.ready : '—'], ['Results', dates.results]].map(([k, v]) => <div key={k} style={{ flex: 1, background: '#f6f6f8', borderRadius: 12, padding: '8px 10px', fontSize: 11.5, color: C.mute }}>{k}<b style={{ display: 'block', color: C.ink, fontSize: 12.5, marginTop: 1 }}>{v ? (v.length === 10 ? nice(v).replace(/^(\w+), /, '$1 ') : v) : '—'}</b></div>)}</div>}
      </> : <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '18px 0 4px' }}><button type="button" onClick={() => setMode('plan')} aria-label="Back to the plan" style={{ width: 30, height: 30, borderRadius: 99, border: `0.5px solid ${C.line}`, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><ArrowLeft size={14} /></button><span style={{ ...h3, margin: 0 }}>Add more</span><button type="button" onClick={() => setMode('plan')} style={{ marginLeft: 'auto', border: 0, background: 'none', font: 'inherit', fontSize: 12.5, fontWeight: 800, color: C.ink, cursor: 'pointer' }}>Done</button></div>
        {GROUPS.map((g) => (
          <div key={g.id}>
            <div style={{ ...h3, margin: '14px 0 2px', fontSize: 11 }}>{g.label}</div>
            {(Object.keys(META) as ItemId[]).filter((id) => META[id].group === g.id).map((id) => { const lines = items.filter((x) => x.id === id); const first = lines.find((x) => x.uid === id) ?? lines[0]; return first ? <AddRow key={id} it={first} /> : null })}
          </div>
        ))}
      </>}
      <div style={{ paddingTop: 10, marginTop: 6 }}>
        {mode === 'add' && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: C.mute, padding: '0 2px 2px' }}><span><b style={{ color: C.ink }}>{onCount} thing{onCount === 1 ? '' : 's'}</b>{reach != null ? ` · about ${round2(reach).toLocaleString()} people` : ''}</span></div>}
        {(() => {
          /* what still needs a choice before the order can go on (the creator, the offer's code) */
          const missing = simplePlans && mode === 'plan' ? items.filter((x) => x.on && ((x.id === 'creator' && !x.options.slug) || (x.id === 'offer' && x.options.confirmed !== true))) : []
          if (missing.length) { const first = missing[0]; const word = first.id === 'creator' ? 'Choose a creator' : String(first.options.codeText ?? '') ? 'Check the code' : 'Fill in the code'; return <button type="button" onClick={() => setOpen(first.uid)} style={{ ...cta, background: '#f6f6f8', color: C.mute }}><span>{word} to continue</span><span style={{ fontSize: 13, fontWeight: 600 }}>{missing.length} left</span></button> }
          return <button type="button" onClick={onGo} disabled={!ready || posting || writing} style={{ ...cta, opacity: ready && !posting ? 1 : .5 }}><span>{posting ? 'Making it happen' : writing ? 'Writing the words' : (ctaLabel ?? 'Make it happen')}</span><span>{posting || writing ? <Loader2 size={16} className="mvp-spin" /> : total ? dollars(simplePlans ? total + Math.round(feeBaseCents(items, prices, profile) * SERVICE_FEE_RATE) : total) : 'Free'}</span></button>
        })()}
        <div style={{ fontSize: 12, color: C.mute, textAlign: 'center', marginTop: 8, lineHeight: 1.45 }}>Nothing posts without your okay. It all lands in Coming up.</div>
      </div>
    </div>
  )
}
function PhotosAdd({ onAdd }: { onAdd: (v: string) => void }) {
  const [v, setV] = useState('')
  const add = () => { const t = v.trim(); if (t) { onAdd(t); setV('') } }
  return <div style={{ display: 'flex', gap: 8, marginTop: 8 }}><input value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add() }} placeholder="The patio, the team, the tiramisu" style={{ flex: 1, border: `0.5px solid ${C.line}`, borderRadius: 12, padding: '10px 12px', fontSize: 13.5, font: 'inherit', color: C.ink, outline: 'none' }} /><button type="button" onClick={add} style={{ fontSize: 12.5, fontWeight: 700, padding: '7px 14px', borderRadius: 99, border: 0, background: C.ink, color: '#fff', cursor: 'pointer', font: 'inherit' }}>Add</button></div>
}
