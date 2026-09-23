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
import { ArrowLeft, Check, Loader2, Plus } from 'lucide-react'
import { C, DISPLAY } from '../tokens'
import { Drawing, type Scene } from './drawings'
import { MULTI, newUid, type ItemId, type ItemPick, type Ladder } from '@/lib/plan/suggest'

export interface MenuMe { usualReach: number | null; budgetCents: number | null; creator: { slug: string; name: string; fromCents: number | null; nearby: number | null; date?: string | null } | null }
export interface MenuPrices { graphic: number; video: number; print: number; shootFor: (n: number) => number; shootLabel: (n: number) => string }
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
}
const GROUPS: { id: 'make' | 'seen' | 'inside'; label: string }[] = [{ id: 'make', label: 'Make' }, { id: 'seen', label: 'Get it seen' }, { id: 'inside', label: 'In the restaurant' }]

/** the price of an item from its options */
export function itemCents(it: ItemPick, p: MenuPrices, profile?: CreatorProfile | null): number {
  const o = it.options
  switch (it.id) {
    case 'graphic': { const where = (o.where as string[] | undefined) ?? ['post']; return p.graphic + (where.includes('tent') ? 2500 : 0) + (where.includes('poster') ? 2500 : 0) + (o.spanish ? 4000 : 0) }
    case 'video': { const n = Math.max(1, Math.min(3, Number(o.count) || 1)); const each = p.video + (o.style === 'chef' ? 7500 : 0) + (o.tiktok ? 6000 : 0) + (o.spanish ? 2500 : 0); return Math.round(each * n * (n >= 2 ? 0.9 : 1)) + (o.filmed === 'visit' ? 15000 : 0) }
    case 'photos': return o.queue ? 0 : p.shootFor(1 + ((o.list as string[] | undefined)?.length ?? 0))
    case 'boost': return Number(o.cents) || 2000
    case 'creator': { const t = profile?.offers.flatMap((x) => x.tiers).find((x) => x.name === o.tierName); const first = (t?.priceCents ?? profile?.offers[0]?.startingCents ?? it.cents ?? 0) + (o.whitelist && profile?.audience?.whitelistCents ? profile.audience.whitelistCents : 0); const more = ((o.more as { slug: string; fromCents: number | null }[] | undefined) ?? []).reduce((s, m) => s + (m.fromCents ?? 0), 0); return first + more }
    case 'print': return p.print * Math.max(1, ((o.kinds as string[] | undefined) ?? [o.kind === 'poster' ? 'poster' : 'tent']).length)
    default: return 0
  }
}
/** one green line that says what was picked */
export function itemSummary(it: ItemPick, p: MenuPrices, profile?: CreatorProfile | null, extra?: { platforms: string; bestHour: string; readyBy?: string | null }): string {
  const o = it.options
  switch (it.id) {
    case 'post': return `${extra?.platforms ?? 'Your channels'} · Story · ${extra?.bestHour ?? 'your best hour'}`
    case 'graphic': { const where = (o.where as string[] | undefined) ?? ['post']; return [where.includes('post') ? 'Post + Story' : '', where.includes('tent') ? 'table tent' : '', where.includes('poster') ? 'poster' : '', o.from === 'stock' ? 'licensed photos' : o.from === 'shoot' ? 'from the shoot' : '', o.priceOn ? 'price on it' : '', o.look ? String(o.look).toLowerCase() : '', o.spanish ? 'Spanish' : '', extra?.readyBy ? `ready ${nice(extra.readyBy)}` : 'ready in 2 days'].filter(Boolean).join(' · ') }
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
  }
}

const FRESH: Partial<Record<ItemId, Record<string, unknown>>> = {
  graphic: { where: ['post'], priceOn: true, brandKit: true, from: 'ours' },
  video: { count: 1, filmed: 'clips', style: 'dish', captions: true },
  print: { kinds: ['tent'] },
  creator: { code: true, repost: true },
}
/* THE CROWD: a ringed field of the Home funnel's figures, dense in the middle, one figure per 72 people */
function Crowd({ n, seed }: { n: number; seed: number }) {
  const pts = useMemo(() => {
    let s = seed | 0
    const rnd = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
    const cx = 60, cy = 36, rx = 57, ry = 30, out: { x: number; y: number }[] = []
    let tries = 0
    while (out.length < n && tries < n * 20) { tries++; const g1 = (rnd() + rnd() + rnd()) / 1.5 - 1, g2 = (rnd() + rnd() + rnd()) / 1.5 - 1; const x = cx + g1 * rx * 1.05, y = cy + g2 * ry * 1.05 + 3; const dx = (x - cx) / rx, dy = (y - 4 - cy) / ry; if (dx * dx + dy * dy <= 0.94) out.push({ x, y }) }
    return out.sort((p, q) => p.y - q.y)
  }, [n, seed])
  return (
    <svg viewBox="0 0 120 70" width={120} height={70} aria-hidden style={{ flex: 'none', overflow: 'visible' }}>
      <ellipse cx={60} cy={36} rx={57} ry={30} fill="none" stroke="#2e9a78" strokeWidth={0.6} opacity={0.6} />
      {pts.map((p, i) => <g key={i} transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) scale(.4)`}><path d="M -6 9.2 Q -7 0.2 0 -1.6 Q 7 0.2 6 9.2 Z" fill={i % 6 === 2 ? '#4fa17c' : '#2e9a78'} /><circle cx={0} cy={-7.4} r={4.6} fill="#8fd6b8" /></g>)}
    </svg>
  )
}

export default function AnnounceMenu({ clientId, items, setItems, me, prices, media, hasVideo, platformsWord, bestHourWord, readyBy, open, setOpen, onGo, total, reach, posting, writing, ready, preview, dates, usualReach, simplePlans, keep, ladder }: {
  clientId: string; items: ItemPick[]; setItems: (f: (x: ItemPick[]) => ItemPick[]) => void; me: MenuMe | null; prices: MenuPrices; media: number; hasVideo: boolean; platformsWord: string; bestHourWord: string; readyBy: string | null
  open: string | null; setOpen: (uid: string | null) => void; onGo: () => void; total: number; reach: number | null; posting: boolean; writing: boolean; ready: boolean
  /* the calm plan screen (owner 2026-09-18): a small preview, a five-step how-far, date tiles */
  preview?: { name: string; price: string | null; caption: string; image: string | null; video?: boolean; onWords: () => void; onPhoto: () => void }
  dates?: { posts: string | null; ready: string | null; results: string | null }
  usualReach?: number | null
  /* THREE PLANS (owner 2026-09-22): Keep it simple, Recommended, Go bigger, and a text link to build your own.
     No preview, no ladder, no line rows until they build their own. `keep` holds the lines the content screen
     chose (the shoot, the licensed graphic) in every plan. */
  simplePlans?: boolean
  keep?: string[]
  /* the three sets the server built from what it knows (suggest.ts ladderFor); the old ladder is the fallback */
  ladder?: Ladder | null
}) {
  const [profile, setProfile] = useState<CreatorProfile | null>(null)
  const [fits, setFits] = useState<Fit[]>([])
  /* plan first: what is picked, short. Add more opens the whole menu */
  const [mode, setModeRaw] = useState<'plan' | 'add'>('plan')
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
    const done = () => { patchU(open, () => ({ on: true })); setOpen(null); setMode('plan') }
    const head = <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 8px' }}><button type="button" onClick={back} aria-label="Back" style={{ width: 34, height: 34, borderRadius: 99, border: `0.5px solid ${C.line}`, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><ArrowLeft size={16} /></button><span style={{ flex: 1, fontFamily: DISPLAY, fontSize: 18, fontWeight: 600, letterSpacing: '-.01em' }}>{m.name}</span><b style={{ fontSize: 17 }}>{cents ? dollars(cents) : 'Free'}</b></div>
    const foot = <button type="button" onClick={done} style={cta}><span>{it.on ? 'Done' : 'Add to the plan'}</span><span>{cents ? dollars(cents) : 'Free'}</span></button>
    const where = (o.where as string[] | undefined) ?? ['post']
    const tw = (k: string) => setOpt('graphic', { where: where.includes(k) ? where.filter((x) => x !== k) : [...where, k] })
    return (
      <div>
        {head}
        {it.id === 'graphic' && <>
          <Hero scene="graphic" hue={m.hue} /><div style={{ fontSize: 12.5, color: C.mute, marginTop: 8, lineHeight: 1.45 }}>Designed by the desk, ready in 2 days. You approve it before it posts.</div>
          <div style={h3}>Where it goes</div>
          <Opt kind="cb" on={where.includes('post')} label="Post + Story" small="Instagram, Facebook, Google" price="included" onClick={() => tw('post')} />
          <Opt kind="cb" on={where.includes('tent')} label="Table tent" small="Printed, or a file" price="+$25" onClick={() => tw('tent')} />
          <Opt kind="cb" on={where.includes('poster')} label="Window poster" price="+$25" onClick={() => tw('poster')} />
          <div style={h3}>On it</div>
          <Opt kind="cb" on={o.priceOn !== false} label="The price" onClick={() => setOpt('graphic', { priceOn: o.priceOn === false })} />
          <Opt kind="cb" on={o.brandKit !== false} label="Match my brand kit" onClick={() => setOpt('graphic', { brandKit: o.brandKit === false })} />
          <Opt kind="cb" on={!!o.spanish} label="Spanish too" small="A second version" price="+$40" onClick={() => setOpt('graphic', { spanish: !o.spanish })} />
          <div style={h3}>From</div>
          <Opt kind="rb" on={o.from === 'own'} label="Your photo" small={media ? `${media} added` : 'Add one on the first screen'} onClick={() => setOpt('graphic', { from: 'own' })} />
          <Opt kind="rb" on={o.from === 'stock'} label="Licensed photos" small="Stock the desk picks, in your style" onClick={() => setOpt('graphic', { from: 'stock' })} />
          <Opt kind="rb" on={!o.from || o.from === 'ours'} label="Our photos" small="What the desk has on file" onClick={() => setOpt('graphic', { from: 'ours' })} />
          <Opt kind="rb" on={o.from === 'shoot'} label="The shoot" small={items.find((x) => x.id === 'photos')?.on ? 'From the shoot day' : 'Add Photos first'} onClick={() => setOpt('graphic', { from: 'shoot' })} />
          <div style={h3}>The look</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{['Bright', 'Warm', 'Moody', 'Minimal', 'Bold', 'Playful'].map((t) => { const cur = String(o.look ?? '').split(', ').filter(Boolean); const on = cur.includes(t); return <button key={t} type="button" onClick={() => setOpt(it.id, { look: (on ? cur.filter((x) => x !== t) : [...cur, t].slice(-3)).join(', ') })} style={chip(on)}>{t}</button> })}</div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginTop: 14 }}>A note for the designer<span style={{ fontWeight: 500, color: C.faint, marginLeft: 4 }}>optional</span><input value={String(o.note ?? '')} onChange={(e) => setOpt('graphic', { note: e.target.value })} placeholder="Use the blue plates" style={input} /></label>
          {foot}
        </>}
        {it.id === 'video' && <>
          <Hero scene="reel" hue={m.hue} /><div style={{ fontSize: 12.5, color: C.mute, marginTop: 8, lineHeight: 1.45 }}>One Reel, about 15 seconds, cut for Instagram, Facebook and TikTok.</div>
          <div style={h3}>How many</div>
          <div style={{ display: 'flex', gap: 6 }}>{[1, 2, 3].map((n) => <button key={n} type="button" onClick={() => setOpt('video', { count: n })} style={chip((Number(o.count) || 1) === n)}>{n === 1 ? 'One Reel' : `${n} Reels`}</button>)}</div>
          {(Number(o.count) || 1) >= 2 && <div style={{ fontSize: 12, color: C.greenDk, fontWeight: 600, marginTop: 6 }}>Two or more, 10% off each. Different angles of the same dish, or a second dish.</div>}
          <div style={h3}>Filmed</div>
          <Opt kind="rb" on={o.filmed === 'clips'} label="From clips you send" small={hasVideo ? 'You added video' : 'Ten seconds on your phone is plenty'} price={dollars(prices.video)} onClick={() => setOpt('video', { filmed: 'clips' })} />
          {(items.find((x) => x.id === 'creator')?.on || me?.creator) && <Opt kind="rb" on={o.filmed === 'creator'} label={`When ${(profile?.name ?? me?.creator?.name ?? 'the creator').split(' ')[0]} visits`} small={items.find((x) => x.id === 'creator')?.on ? 'Same day, no extra trip' : 'Add the creator too'} price={dollars(prices.video)} onClick={() => setOpt('video', { filmed: 'creator' })} />}
          <Opt kind="rb" on={o.filmed === 'visit'} label="A separate visit" small="We come film it" price="+$150" onClick={() => setOpt('video', { filmed: 'visit' })} />
          <Opt kind="rb" on={o.filmed === 'shoot'} label="On the shoot day" small={items.find((x) => x.id === 'photos')?.on ? 'Same day as the photos' : 'Add Photos first'} price={dollars(prices.video)} onClick={() => setOpt('video', { filmed: 'shoot' })} />
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
        {it.id === 'offer' && <>
          <Hero scene="offer" hue={m.hue} />
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginTop: 14 }}>The offer<input value={String(o.text ?? '')} onChange={(e) => setOpt('offer', { text: e.target.value })} placeholder="Free drink with it this week" style={input} /></label>
          <div style={h3}>How it is counted</div>
          <Opt kind="cb" on={o.code !== false} label="A code the team counts" small="On the team card and the post" price="free" onClick={() => setOpt('offer', { code: o.code === false })} />
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
    setItems((xs) => xs.filter((x) => x.uid === x.id).map((it) => { const v = set[it.id]; return v ? { ...it, on: true, options: v === true ? baseOpts(it) : { ...baseOpts(it), ...v } } : { ...it, on: false } }))
  }
  const currentStep = (() => {
    const onIds = items.filter((x) => x.on).map((x) => x.id).sort().join(',')
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
  const AddRow = ({ it }: { it: ItemPick }) => { const m = META[it.id]; const cents = it.on ? itemCents(it, prices, profile) : minOf(it); const free = m.free || cents === 0; return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '9px 0', borderBottom: `0.5px solid ${C.line}` }}>
      <Thumb it={it} size={44} />
      <button type="button" onClick={() => (m.hasOptions ? setOpen(it.uid) : toggle(it.uid))} style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 0, padding: 0, font: 'inherit', color: C.ink, cursor: 'pointer' }}>
        <b style={{ display: 'block', fontSize: 14 }}>{META[it.id].name}</b><small style={{ ...sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.on ? `✓ ${itemSummary(it, prices, profile, { platforms: platformsWord, bestHour: bestHourWord, readyBy })}` : m.line}</small>{it.why && <small style={{ ...sub, fontSize: 11, color: C.faint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.why}</small>}
      </button>
      <b style={{ fontSize: 13, whiteSpace: 'nowrap', color: free ? C.greenDk : C.ink }}>{free ? 'Free' : `${m.hasOptions && !it.on ? 'from ' : ''}${dollars(cents)}`}</b>
      {MULTI.includes(it.id) && it.on && <button type="button" onClick={() => addNew(it.id)} style={{ fontSize: 11.5, fontWeight: 800, padding: '5px 9px', borderRadius: 99, border: `1.5px solid ${C.line}`, background: '#fff', color: C.ink, cursor: 'pointer', font: 'inherit', flex: 'none', whiteSpace: 'nowrap' }}>＋ Another</button>}
      {(() => { const added = it.on; const act = () => (it.on ? toggle(it.uid) : m.hasOptions ? setOpen(it.uid) : toggle(it.uid)); return <button type="button" onClick={act} aria-label={added ? 'Added, tap to remove' : 'Add'} style={{ width: 34, height: 34, borderRadius: 99, border: `1.5px solid ${added ? C.greenDk : C.ink}`, background: added ? C.greenDk : '#fff', color: added ? '#fff' : C.ink, cursor: 'pointer', display: 'grid', placeItems: 'center', flex: 'none', transition: 'background .18s, border-color .18s' }}>{added ? <span key="on" className="an-pop" style={{ display: 'grid' }}><Check size={16} strokeWidth={3} /></span> : <Plus size={16} strokeWidth={2.5} />}</button> })()}
    </div>
  ) }

  return (
    <div key={mode} className={mode === 'add' ? 'an-fwd' : switched ? 'an-back' : undefined}>
      {mode === 'plan' && simplePlans ? <>
        {(() => {
          /* ONE PLAN AT A TIME (owner 2026-09-22, "that's what the tabs are for"): the pill picks, the page shows
             that plan in effect: the price, the crowd it reaches, every piece in its slot (absent ones as faint
             holes), the days things land. Go bigger is the first step that really adds something. */
          const c1 = costOf(stepSets[1].on)
          const bigger = ladder ? 2 : ([2, 3, 4].find((i) => stepSets[i] && costOf(stepSets[i].on) > c1) ?? 2)
          const three = [0, 1, bigger]
          const titles: Record<number, string> = { 0: 'Keep it simple', 1: 'Recommended', [bigger]: 'Go bigger' }
          const chosen = currentStep
          const pos = three.indexOf(chosen)
          const first = cn ? cn.name.split(' ')[0] : (profile?.name.split(' ')[0] ?? null)
          const SLOTS: { id: ItemId | 'inside'; label: string; scene: Scene; hue: string }[] = [
            { id: 'post', label: 'Post', scene: 'post', hue: '#2e9a78' }, { id: 'inside', label: 'In store', scene: 'dish', hue: '#2e9a78' },
            { id: 'graphic', label: 'Graphic', scene: 'graphic', hue: '#d99a1e' }, { id: 'boost', label: 'Boost', scene: 'boost', hue: '#6a39de' },
            { id: 'creator', label: first ?? 'Creator', scene: 'creator', hue: '#0f97a8' }, { id: 'video', label: 'Video', scene: 'reel', hue: '#3b6fd4' },
            { id: 'print', label: 'Print', scene: 'print', hue: '#d99a1e' }, { id: 'photos', label: 'Shoot', scene: 'photos', hue: '#6a39de' },
          ]
          const isOn = (id: ItemId | 'inside') => (id === 'inside' ? items.some((x) => x.on && META[x.id].group === 'inside') : items.some((x) => x.on && x.id === id))
          const centsOf = (id: ItemId | 'inside') => (id === 'inside' ? 0 : items.filter((x) => x.on && x.id === id).reduce((sum, it) => sum + itemCents(it, prices, profile), 0))
          const slots = SLOTS.filter((sl) => sl.id !== 'photos' || isOn('photos'))
          const n = reach != null ? Math.max(3, Math.min(280, Math.round(reach / 72))) : 0
          const usualX = reach != null && usualReach ? Math.round(reach / usualReach) : null
          const creatorOn = items.find((x) => x.on && x.id === 'creator')
          const beads: { scene: Scene; hue: string; day: string | null; label: string }[] = [
            ...(items.some((x) => x.on && x.id === 'graphic') && dates?.ready ? [{ scene: 'graphic' as Scene, hue: '#d99a1e', day: dates.ready, label: 'Graphic' }] : []),
            ...(dates?.posts ? [{ scene: 'post' as Scene, hue: '#2e9a78', day: dates.posts, label: 'Posts' }] : []),
            ...(creatorOn && typeof creatorOn.options.date === 'string' && creatorOn.options.date ? [{ scene: 'creator' as Scene, hue: '#0f97a8', day: String(creatorOn.options.date), label: `${first ?? 'Creator'} visits` }] : []),
            ...(dates?.results ? [{ scene: 'chart' as Scene, hue: '#2e9a78', day: dates.results, label: 'Results' }] : []),
          ]
          return (
            <div style={{ marginTop: 2 }}>
              <div style={{ position: 'relative', display: 'flex', background: '#f6f6f8', borderRadius: 99, padding: 3 }}>
                {pos >= 0 && <span aria-hidden style={{ position: 'absolute', top: 3, bottom: 3, left: `calc(3px + ${pos} * (100% - 6px) / 3)`, width: 'calc((100% - 6px) / 3)', borderRadius: 99, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.08)', transition: 'left .22s cubic-bezier(.2,.8,.2,1)' }} />}
                {three.map((i, k) => (
                  <button key={i} type="button" onClick={() => applyStep(i)} style={{ position: 'relative', flex: 1, height: 40, borderRadius: 99, border: 0, background: 'none', font: 'inherit', cursor: 'pointer', color: pos === k ? C.ink : C.mute, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1.1 }}>
                    <b style={{ fontSize: 13, fontWeight: 700 }}>{titles[i]}</b>
                    {i === 1 && <small style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: '.08em', color: C.greenDk }}>OUR PICK</small>}
                  </button>
                ))}
              </div>
              <div style={{ marginTop: 12, borderRadius: 22, border: `0.5px solid ${pos >= 0 ? C.ink : C.line}`, background: '#eaf7f3', padding: '14px 14px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                  <div>
                    <b style={{ display: 'block', fontSize: 15, fontWeight: 700 }}>{pos >= 0 ? titles[chosen] : 'Your own plan'}</b>
                    <small style={{ display: 'block', fontSize: 12.5, color: C.mute, marginTop: 2 }}>{picked.map((it) => nameOf(it).toLowerCase()).join(', ') || 'your channels only'}{insideOn.length ? ', in the restaurant' : ''}</small>
                  </div>
                  <b style={{ fontFamily: DISPLAY, fontSize: 30, fontWeight: 700, letterSpacing: '-.03em', lineHeight: 1, whiteSpace: 'nowrap', color: total ? C.ink : C.greenDk }}>{total ? dollars(total) : 'Free'}</b>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 10 }}>
                  <Crowd n={n} seed={chosen + 7} />
                  <div style={{ flex: 1 }}>
                    <b style={{ display: 'block', fontFamily: DISPLAY, fontSize: 24, fontWeight: 700, letterSpacing: '-.02em', lineHeight: 1 }}>{reach != null ? round2(reach).toLocaleString() : '—'}</b>
                    <small style={{ display: 'block', fontSize: 12.5, color: C.mute, marginTop: 3 }}>people{usualX && usualX > 1 ? `, ${usualX}x your usual` : usualReach ? ', your usual' : ''}</small>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 10px', marginTop: 12 }}>
                  {slots.map((sl) => { const on = isOn(sl.id); const c = centsOf(sl.id); return (
                    <div key={sl.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '4px 0', opacity: on ? 1 : .55 }}>
                      <span style={{ width: 40, height: 40, borderRadius: 99, flex: 'none', display: 'grid', placeItems: 'center', background: on ? `color-mix(in srgb, ${sl.hue} 14%, #fff)` : 'transparent', border: on ? 0 : `1.5px dotted ${C.faint}`, ['--c2' as string]: sl.hue, filter: on ? 'none' : 'grayscale(1)', opacity: on ? 1 : .6 }}><span style={{ width: 26 }}><Drawing spec={{ scene: sl.scene }} name="" rating="" t={(x) => x} /></span></span>
                      <span style={{ minWidth: 0 }}><b style={{ display: 'block', fontSize: 13, fontWeight: 700, color: on ? C.ink : C.faint }}>{sl.label}</b>{on && <small style={{ display: 'block', fontSize: 11.5, color: C.mute }}>{c ? dollars(c) : 'Free'}</small>}</span>
                    </div>
                  ) })}
                </div>
              </div>
              {me?.budgetCents != null && total > 0 && (
                <div style={{ fontSize: 12.5, marginTop: 8, textAlign: 'center', color: total > me.budgetCents ? '#8a5a0c' : C.mute }}>{total > me.budgetCents ? `Over your $${Math.round(me.budgetCents / 100).toLocaleString()} monthly budget by ${dollars(total - me.budgetCents)}` : `Inside your $${Math.round(me.budgetCents / 100).toLocaleString()} monthly budget`}</div>
              )}
              {beads.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: C.mute, marginBottom: 8 }}>When it lands</div>
                  <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between' }}>
                    <span aria-hidden style={{ position: 'absolute', left: 20, right: 20, top: 17, height: 0.5, background: C.line }} />
                    {beads.map((bd, i) => (
                      <div key={i} style={{ position: 'relative', flex: 1, textAlign: 'center' }}>
                        <span style={{ width: 34, height: 34, borderRadius: 99, display: 'grid', placeItems: 'center', margin: '0 auto', background: `color-mix(in srgb, ${bd.hue} 14%, #fff)`, ['--c2' as string]: bd.hue }}><span style={{ width: 22 }}><Drawing spec={{ scene: bd.scene }} name="" rating="" t={(x) => x} /></span></span>
                        <b style={{ display: 'block', fontSize: 12, fontWeight: 700, marginTop: 6 }}>{bd.day && bd.day.length === 10 ? nice(bd.day).replace(/^(\w+), /, '$1 ') : bd.day}</b>
                        <small style={{ display: 'block', fontSize: 11, color: C.mute }}>{bd.label}</small>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ textAlign: 'center', marginTop: 12 }}><button type="button" onClick={() => setMode('add')} style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700, color: C.greenDk, border: 0, background: 'none', padding: '6px 10px', cursor: 'pointer' }}>I'll build my own</button></div>
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
        <button type="button" onClick={onGo} disabled={!ready || posting || writing} style={{ ...cta, opacity: ready && !posting ? 1 : .5 }}><span>{posting ? 'Making it happen' : writing ? 'Writing the words' : 'Make it happen'}</span><span>{posting || writing ? <Loader2 size={16} className="mvp-spin" /> : total ? dollars(total) : 'Free'}</span></button>
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
