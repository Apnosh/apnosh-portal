'use client'
/**
 * ANNOUNCE AS A MENU (owner 2026-09-18): items, options, a cart.
 * ================================================================
 * Every piece is an item with a picture, one line, a price and Add. Tap an item and its options
 * open like a menu item: the required choice first, then extras with a price each. The picker
 * (announce-suggest) pre-adds the usual for this kind, each with one line of why. The bottom
 * bar is the cart: how many things, how many people, the total.
 */
import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Check, Loader2 } from 'lucide-react'
import { C, DISPLAY } from '../tokens'
import { Drawing, type Scene } from './drawings'
import type { ItemId, ItemPick } from '@/lib/plan/suggest'

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
  photos: { name: 'Photos', line: 'A shoot day. Add other things to the list', scene: 'photos', hue: '#6a39de', group: 'make', hasOptions: true },
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
    case 'photos': return p.shootFor(1 + ((o.list as string[] | undefined)?.length ?? 0))
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
    case 'graphic': { const where = (o.where as string[] | undefined) ?? ['post']; return [where.includes('post') ? 'Post + Story' : '', where.includes('tent') ? 'table tent' : '', where.includes('poster') ? 'poster' : '', o.priceOn ? 'price on it' : '', o.spanish ? 'Spanish' : '', extra?.readyBy ? `ready ${nice(extra.readyBy)}` : 'ready in 2 days'].filter(Boolean).join(' · ') }
    case 'video': return [Number(o.count) > 1 ? `${o.count} Reels` : '', o.filmed === 'clips' ? 'From your clips' : o.filmed === 'creator' ? `Filmed when ${profile?.name.split(' ')[0] ?? 'the creator'} visits` : o.filmed === 'shoot' ? 'On the shoot day' : 'We come film it', o.style === 'chef' ? 'the chef making it' : o.style === 'room' ? 'the room and the dish' : 'the dish up close', o.tiktok ? 'TikTok cut' : ''].filter(Boolean).join(' · ')
    case 'photos': return `${p.shootLabel(1 + ((o.list as string[] | undefined)?.length ?? 0))}${(o.list as string[] | undefined)?.length ? ` · ${(o.list as string[]).join(', ')}` : ''}`
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

export default function AnnounceMenu({ clientId, items, setItems, me, prices, media, hasVideo, platformsWord, bestHourWord, readyBy, open, setOpen, onGo, total, reach, posting, writing, ready }: {
  clientId: string; items: ItemPick[]; setItems: (f: (x: ItemPick[]) => ItemPick[]) => void; me: MenuMe | null; prices: MenuPrices; media: number; hasVideo: boolean; platformsWord: string; bestHourWord: string; readyBy: string | null
  open: ItemId | null; setOpen: (id: ItemId | null) => void; onGo: () => void; total: number; reach: number | null; posting: boolean; writing: boolean; ready: boolean
}) {
  const [profile, setProfile] = useState<CreatorProfile | null>(null)
  const [fits, setFits] = useState<Fit[]>([])
  const creatorItem = items.find((x) => x.id === 'creator')
  const slug = (creatorItem?.options.slug as string | undefined) ?? me?.creator?.slug ?? null
  useEffect(() => {
    if (!slug) return
    fetch(`/api/dashboard/influencers?clientId=${clientId}&slug=${encodeURIComponent(slug)}`, { cache: 'no-store' }).then(async (r) => { const j = await r.json().catch(() => ({})); if (r.ok) setProfile(j.profile) }).catch(() => {})
  }, [slug, clientId])
  useEffect(() => {
    if (open !== 'creator' || fits.length) return
    fetch(`/api/dashboard/influencers?clientId=${clientId}&fit=1`, { cache: 'no-store' }).then(async (r) => { const j = await r.json().catch(() => ({})); if (r.ok) setFits((j.fit ?? []).filter((f: Fit) => f.card)) }).catch(() => {})
  }, [open, clientId, fits.length])
  const patch = (id: ItemId, f: (it: ItemPick) => Partial<ItemPick>) => setItems((xs) => xs.map((it) => (it.id === id ? { ...it, ...f(it) } : it)))
  const setOpt = (id: ItemId, o: Record<string, unknown>) => patch(id, (it) => ({ options: { ...it.options, ...o } }))
  const toggle = (id: ItemId) => patch(id, (it) => ({ on: !it.on }))

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
  if (open) {
    const it = items.find((x) => x.id === open)!
    const m = META[open]
    const o = it.options
    const cents = itemCents(it, prices, profile)
    const done = () => { patch(open, () => ({ on: true })); setOpen(null) }
    const head = <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 8px' }}><button type="button" onClick={() => setOpen(null)} aria-label="Back" style={{ width: 34, height: 34, borderRadius: 99, border: `0.5px solid ${C.line}`, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><ArrowLeft size={16} /></button><span style={{ flex: 1, fontFamily: DISPLAY, fontSize: 18, fontWeight: 600, letterSpacing: '-.01em' }}>{m.name}</span><b style={{ fontSize: 17 }}>{cents ? dollars(cents) : 'Free'}</b></div>
    const foot = <button type="button" onClick={done} style={cta}><span>{it.on ? 'Done' : 'Add to the plan'}</span><span>{cents ? dollars(cents) : 'Free'}</span></button>
    const where = (o.where as string[] | undefined) ?? ['post']
    const tw = (k: string) => setOpt('graphic', { where: where.includes(k) ? where.filter((x) => x !== k) : [...where, k] })
    return (
      <div>
        {head}
        {open === 'graphic' && <>
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
          <Opt kind="rb" on={o.from !== 'own' && o.from !== 'shoot'} label="Our photos" small="Stock, in your style" onClick={() => setOpt('graphic', { from: 'ours' })} />
          <Opt kind="rb" on={o.from === 'shoot'} label="The shoot" small={items.find((x) => x.id === 'photos')?.on ? 'From the shoot day' : 'Add Photos first'} onClick={() => setOpt('graphic', { from: 'shoot' })} />
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginTop: 14 }}>A note for the designer<span style={{ fontWeight: 500, color: C.faint, marginLeft: 4 }}>optional</span><input value={String(o.note ?? '')} onChange={(e) => setOpt('graphic', { note: e.target.value })} placeholder="Use the blue plates" style={input} /></label>
          {foot}
        </>}
        {open === 'video' && <>
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
          <div style={h3}>Also</div>
          <Opt kind="cb" on={o.captions !== false} label="Captions burned in" price="free" onClick={() => setOpt('video', { captions: o.captions === false })} />
          <Opt kind="cb" on={!!o.tiktok} label="A second cut for TikTok" price="+$60" onClick={() => setOpt('video', { tiktok: !o.tiktok })} />
          <Opt kind="cb" on={!!o.spanish} label="Spanish captions" price="+$25" onClick={() => setOpt('video', { spanish: !o.spanish })} />
          {foot}
        </>}
        {open === 'photos' && <>
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
        {open === 'boost' && <>
          <Hero scene="boost" hue={m.hue} /><div style={{ fontSize: 12.5, color: C.mute, marginTop: 8, lineHeight: 1.45 }}>Your own ad money, to people nearby, after it posts. About 150 people a dollar.</div>
          <div style={h3}>How much</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{[1000, 2000, 4000, 10000, 20000].map((v) => <button key={v} type="button" onClick={() => setOpt('boost', { cents: v })} style={chip(Number(o.cents) === v)}>${v / 100}</button>)}<input type="number" min={5} max={500} value={Math.round((Number(o.cents) || 2000) / 100)} onChange={(e) => setOpt('boost', { cents: Math.max(500, Math.min(50000, Math.round(Number(e.target.value) || 0) * 100)) })} style={{ ...input, width: 84, marginTop: 0, padding: '7px 10px', fontSize: 13 }} /></div>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.greenDk, marginTop: 10 }}>About {(((Number(o.cents) || 2000) / 100) * 150).toLocaleString()} people nearby</div>
          <div style={h3}>For how long</div>
          <div style={{ display: 'flex', gap: 6 }}>{[2, 3, 7].map((d) => <button key={d} type="button" onClick={() => setOpt('boost', { days: d })} style={chip((Number(o.days) || 3) === d)}>{d} days</button>)}</div>
          {foot}
        </>}
        {open === 'creator' && <>
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
        {open === 'print' && <>
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
        {open === 'offer' && <>
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
  return (
    <div>
      {GROUPS.map((g) => (
        <div key={g.id}>
          <div style={h3}>{g.label}</div>
          {items.filter((x) => META[x.id].group === g.id).map((it) => {
            const m = META[it.id]; const minC = it.id === 'graphic' ? prices.graphic : it.id === 'video' ? prices.video : it.id === 'photos' ? prices.shootFor(1) : it.id === 'print' ? prices.print : it.id === 'boost' ? 2000 : it.id === 'creator' ? (profile?.offers[0]?.startingCents ?? me?.creator?.fromCents ?? it.cents) : 0; const cents = it.on ? itemCents(it, prices, profile) : minC; const free = m.free || cents === 0
            const sum = itemSummary(it, prices, profile, { platforms: platformsWord, bestHour: bestHourWord, readyBy })
            const av = it.id === 'creator' ? (profile?.avatarUrl ?? null) : null
            const name = it.id === 'creator' && profile && it.on ? `${profile.name.split(' ')[0]} posts it` : m.name
            return (
              <div key={it.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 0', borderBottom: `0.5px solid ${C.line}`, opacity: it.on || !it.why.startsWith('No ') ? 1 : .6 }}>
                <button type="button" onClick={() => (m.hasOptions ? setOpen(it.id) : toggle(it.id))} aria-label={m.name} style={{ width: 64, height: 64, borderRadius: 14, flex: 'none', display: 'grid', placeItems: 'center', background: it.id === 'creator' && it.on ? 'linear-gradient(135deg,#f6c1dc,#c2418f)' : `${m.hue}1f`, border: 0, cursor: 'pointer', overflow: 'hidden', ['--c2' as string]: m.hue }}>
                  {av && it.on ? <img src={av} alt="" style={{ width: 64, height: 64, objectFit: 'cover' }} /> : it.id === 'creator' && it.on ? <span style={{ color: '#fff', fontWeight: 800, fontSize: 18 }}>{initials(profile?.name ?? me?.creator?.name ?? 'C')}</span> : <span style={{ width: 44 }}><Drawing spec={{ scene: m.scene }} name="" rating="" t={(s) => s} /></span>}
                </button>
                <button type="button" onClick={() => (m.hasOptions ? setOpen(it.id) : toggle(it.id))} style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 0, padding: 0, font: 'inherit', color: C.ink, cursor: 'pointer' }}>
                  <b style={{ display: 'block', fontSize: 14.5 }}>{name}</b>
                  {it.on ? <small style={{ ...sub, color: C.greenDk, fontWeight: 700 }}>✓ {sum}</small> : <small style={sub}>{m.line}</small>}
                  {it.why && <small style={{ ...sub, fontSize: 11.5, marginTop: 2 }}>{it.why}</small>}
                </button>
                <span style={{ marginLeft: 'auto', textAlign: 'right', flex: 'none' }}>
                  <b style={{ display: 'block', fontSize: 13.5, color: free ? C.greenDk : C.ink, whiteSpace: 'nowrap' }}>{free ? 'Free' : it.on || !m.hasOptions ? dollars(cents) : `from ${dollars(cents)}`}</b>
                  <button type="button" onClick={() => (it.on ? toggle(it.id) : m.hasOptions ? setOpen(it.id) : toggle(it.id))} style={{ marginTop: 6, fontSize: 12, fontWeight: 800, padding: '6px 12px', borderRadius: 99, border: `1.5px solid ${C.ink}`, background: it.on ? C.ink : '#fff', color: it.on ? '#fff' : C.ink, cursor: 'pointer', font: 'inherit' }}>{it.on ? 'Added' : 'Add'}</button>
                </span>
              </div>
            )
          })}
        </div>
      ))}
      <div style={{ position: 'sticky', bottom: 0, background: '#fff', paddingTop: 10, marginTop: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: C.mute, padding: '0 2px 2px' }}><span><b style={{ color: C.ink }}>{onCount} thing{onCount === 1 ? '' : 's'}</b>{reach != null ? ` · about ${round2(reach).toLocaleString()} people` : ''}</span><span>{me?.budgetCents != null ? `Inside your $${Math.round(me.budgetCents / 100)}` : 'Picked for you'}</span></div>
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
