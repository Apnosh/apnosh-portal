'use client'
/**
 * THE INFLUENCER MARKETPLACE (owner 2026-09-17: "design the marketplace properly").
 * =================================================================================
 * Hiring a creator is trusting a person, so the page leads with proof: who watches them, where
 * those people live, what their last posts did, what past collabs did for other restaurants.
 * Booking is a brief, not a chat. Every number on the screen is a row; a missing number says so.
 *
 * Three views in one file: the shelf, a profile, and the book sheet on top of the profile.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, Check, ChevronRight, Loader2, X, Star, MapPin, Clock, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import MvpShell from '../mvp-shell'
import { C, DISPLAY } from '../tokens'
import { BrandOrMark } from '../mvp-insights'
import { Drawing } from '../create/drawings'

type Tier = { id: string; name: string; priceCents: number; deliverables: string[]; note?: string }
interface Platform { platform: string; handle: string; followers?: number | null; avg_views?: number | null; engagement?: number | null; url?: string | null; verified_at?: string | null }
interface Audience { city: string | null; platforms: Platform[]; followers: number | null; avgViews: number | null; engagement: number | null; localPct: number | null; ages: string | null; cuisines: string[]; styles: string[]; languages: string[]; responseHours: number | null; postsWithinDays: number; partySize: number; mealCapCents: number; repostOk: boolean; whitelistCents: number | null; verifiedAt: string | null }
interface Post { id: string; kind: 'sample' | 'collab'; platform: string; url: string | null; thumb: string | null; caption: string | null; views: number | null; likes: number | null; saves: number | null; comments: number | null; linkTaps: number | null; postedAt: string | null; restaurant: string | null; listing: string | null; note: string | null }
interface Offer { slug: string; title: string; summary: string | null; productId: string | null; startingCents: number | null; tiers: Tier[]; deliverables: string[]; options: { id: string; label: string; priceDeltaCents: number }[]; intake: { id: string; label: string; hint?: string; required?: boolean }[]; turnaroundDays: number | null; bookingShape: string; slotMinutes: number | null }
interface Card { id: string; slug: string; name: string; avatarUrl: string | null; bio: string | null; verified: boolean; tier: string; avgRating: number | null; collabs: number; serviceArea: string[]; audience: Audience | null; fromCents: number | null; offerCount: number; sample: Post[]; example: boolean }
interface Profile extends Card { offers: Offer[]; posts: Post[]; collabsDone: Post[]; reviews: { stars: number; comment: string | null; when: string; restaurant: string | null }[]; schedule: { available: boolean; confirmMode: 'instant' | 'request'; timezone: string | null; slots: { date: string; start: string; end: string }[] } }
interface Fit { slug: string; score: number; reasons: string[]; tag: string }
interface Me { name: string; cuisine: string | null; city: string | null; state: string; handle: string | null }
interface Line { key: string; label: string; detail: string; date: string | null; cost: number | null; status: string; ref: { kind: string; id: string | null; href?: string } | null; why?: string }

const fmt = (v: number | null | undefined) => (v == null ? '' : v >= 1_000_000 ? `${(v / 1e6).toFixed(1)}M` : v >= 10_000 ? `${Math.round(v / 1000)}k` : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)))
const dollars = (c: number | null | undefined) => (c == null ? '' : `$${Math.round(c / 100).toLocaleString()}`)
const nice = (iso: string | null) => { if (!iso) return ''; const d = new Date(iso.slice(0, 10) + 'T12:00:00'); return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) }
const hour = (t: string) => { const [h, m] = t.split(':').map(Number); const ap = h >= 12 ? 'pm' : 'am'; return `${((h + 11) % 12) + 1}${m ? ':' + String(m).padStart(2, '0') : ''} ${ap}` }
const initials = (n: string) => n.split(' ').filter(Boolean).slice(0, 2).map((x) => x[0]?.toUpperCase()).join('')
const GRADS = ['linear-gradient(135deg,#f6c1dc,#c2418f)', 'linear-gradient(135deg,#b9d4ff,#3b6fd4)', 'linear-gradient(135deg,#ffe3b3,#d99a1e)', 'linear-gradient(135deg,#cfeee1,#2e9a78)', 'linear-gradient(135deg,#d9cff7,#6a39de)']
const grad = (s: string) => GRADS[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % GRADS.length]
const PLAT: Record<string, string> = { instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube', facebook: 'Facebook' }
const FILTERS: { id: string; label: string }[] = [{ id: 'near', label: 'Near you' }, { id: 'instagram', label: 'Instagram' }, { id: 'tiktok', label: 'TikTok' }, { id: 'under300', label: 'Under $300' }, { id: 'verified', label: 'Reach verified' }]

const h2: React.CSSProperties = { fontFamily: DISPLAY, fontSize: 22, fontWeight: 600, letterSpacing: '-.02em', margin: '4px 0 10px', lineHeight: 1.15 }
const h3: React.CSSProperties = { fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.mute, margin: '20px 0 8px' }
const sub: React.CSSProperties = { display: 'block', fontWeight: 500, color: C.mute, fontSize: 12, marginTop: 2, lineHeight: 1.35 }
const chip = (on: boolean): React.CSSProperties => ({ fontSize: 12.5, fontWeight: 700, padding: '7px 12px', borderRadius: 99, border: `1.5px solid ${on ? C.ink : C.line}`, background: on ? C.ink : '#fff', color: on ? '#fff' : C.ink, cursor: 'pointer', font: 'inherit', whiteSpace: 'nowrap' })
const pill = (t: string, tone: 'ok' | 'mute' | 'pink' = 'mute'): React.CSSProperties => ({ display: 'inline-block', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 99, background: tone === 'ok' ? C.greenSoft : tone === 'pink' ? '#fbe8f3' : '#f2f2f5', color: tone === 'ok' ? C.greenDk : tone === 'pink' ? '#c2418f' : C.mute, marginRight: 4, marginTop: 4, whiteSpace: 'nowrap' })
const cta: React.CSSProperties = { marginTop: 14, width: '100%', height: 50, borderRadius: 99, border: 0, background: C.ink, color: '#fff', fontWeight: 700, fontSize: 15, font: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', textDecoration: 'none' }
const input: React.CSSProperties = { display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 6, border: `0.5px solid ${C.line}`, borderRadius: 12, padding: '11px 12px', fontSize: 14.5, fontWeight: 500, font: 'inherit', color: C.ink, background: '#fff', outline: 'none' }
const rowS: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderBottom: `0.5px solid ${C.line}`, fontSize: 14, fontWeight: 600 }

function Avatar({ name, url, size = 56 }: { name: string; url: string | null; size?: number }) {
  return url ? <img src={url} alt="" style={{ width: size, height: size, borderRadius: 99, objectFit: 'cover', flex: 'none' }} /> : <span style={{ width: size, height: size, borderRadius: 99, flex: 'none', background: grad(name), display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 800, fontSize: size * 0.32 }}>{initials(name)}</span>
}
function Num({ b, s }: { b: string; s: string }) { return <div style={{ background: '#f6f6f8', borderRadius: 12, padding: '8px 6px', textAlign: 'center' }}><b style={{ display: 'block', fontSize: 15, letterSpacing: '-.01em' }}>{b}</b><small style={{ display: 'block', color: C.mute, fontSize: 10.5, marginTop: 2, lineHeight: 1.2 }}>{s}</small></div> }
function Switch({ on, set }: { on: boolean; set: (v: boolean) => void }) { return <button type="button" role="switch" aria-checked={on} onClick={() => set(!on)} style={{ width: 40, height: 24, borderRadius: 99, border: 0, background: on ? C.greenDk : C.line, position: 'relative', cursor: 'pointer', flex: 'none' }}><span style={{ position: 'absolute', top: 2, left: on ? 18 : 2, width: 20, height: 20, borderRadius: 99, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.2)', transition: 'left .15s' }} /></button> }
function PostTile({ p }: { p: Post }) {
  const inner = <div style={{ aspectRatio: '4/5', borderRadius: 12, overflow: 'hidden', position: 'relative', background: p.thumb ? `center/cover url(${p.thumb})` : grad(p.id) }}>
    {p.views != null && <span style={{ position: 'absolute', left: 6, bottom: 6, fontSize: 11, fontWeight: 700, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,.5)' }}>{fmt(p.views)} views</span>}
    <span style={{ position: 'absolute', top: 6, right: 6, width: 18, height: 18, borderRadius: 99, background: 'rgba(255,255,255,.9)', display: 'grid', placeItems: 'center' }}><BrandOrMark provider={p.platform} size={12} /></span>
  </div>
  return p.url ? <a href={p.url} target="_blank" rel="noreferrer" style={{ display: 'block' }}>{inner}</a> : inner
}

export default function InfluencersPage({ clientId, initialSlug }: { clientId: string; initialSlug: string | null }) {
  const [cards, setCards] = useState<Card[] | null>(null)
  const [fit, setFit] = useState<Fit[]>([])
  const [me, setMe] = useState<Me | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [slug, setSlug] = useState<string | null>(initialSlug)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [filters, setFilters] = useState<Set<string>>(new Set(['near']))
  const [booking, setBooking] = useState(false)
  useEffect(() => {
    fetch(`/api/dashboard/influencers?clientId=${clientId}`, { cache: 'no-store' }).then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Could not read the marketplace'); setCards(j.cards ?? []); setFit(j.fit ?? []); setMe(j.me ?? null) }).catch((e) => setErr(e instanceof Error ? e.message : 'Could not read the marketplace'))
  }, [clientId])
  useEffect(() => {
    if (!slug) { setProfile(null); return }
    setProfile(null)
    fetch(`/api/dashboard/influencers?clientId=${clientId}&slug=${encodeURIComponent(slug)}`, { cache: 'no-store' }).then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Not on the marketplace'); setProfile(j.profile) }).catch((e) => setErr(e instanceof Error ? e.message : 'Not on the marketplace'))
    try { const u = new URL(window.location.href); u.searchParams.set('slug', slug); window.history.replaceState(null, '', u.toString()) } catch { /* fine */ }
  }, [slug, clientId])
  const back = () => { setSlug(null); try { const u = new URL(window.location.href); u.searchParams.delete('slug'); window.history.replaceState(null, '', u.toString()) } catch { /* fine */ } }

  const shown = useMemo(() => {
    if (!cards) return []
    const score = new Map(fit.map((f) => [f.slug, f.score]))
    return cards.filter((c) => {
      const a = c.audience
      if (filters.has('instagram') && !a?.platforms.some((p) => p.platform === 'instagram')) return false
      if (filters.has('tiktok') && !a?.platforms.some((p) => p.platform === 'tiktok')) return false
      if (filters.has('under300') && (c.fromCents == null || c.fromCents > 30000)) return false
      if (filters.has('verified') && !a?.verifiedAt) return false
      return true
    }).sort((x, y) => (score.get(y.slug) ?? 0) - (score.get(x.slug) ?? 0))
  }, [cards, fit, filters])
  const toggle = (id: string) => setFilters((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  /* ── the shelf ── */
  if (!slug) return (
    <MvpShell active="create" title="Influencers" back="/dashboard/campaigns/new" focus>
      <div className="cr" style={{ padding: '4px 16px 40px', color: C.ink }}>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, marginTop: 6 }}>{FILTERS.map((f) => <button key={f.id} type="button" onClick={() => toggle(f.id)} style={chip(filters.has(f.id))}>{f.label}</button>)}</div>
        {cards && <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, fontSize: 12.5 }}><span><b>{shown.length} creator{shown.length === 1 ? '' : 's'}</b> <span style={{ color: C.mute }}>post about food{me?.city ? ` near ${me.city}` : me?.state ? ` in ${me.state}` : ''}</span></span><span style={{ color: C.mute, fontWeight: 700 }}>Best fit first</span></div>}
        {!cards && !err && <div style={{ padding: 40, textAlign: 'center', color: C.mute }}><Loader2 size={18} className="mvp-spin" /></div>}
        {err && <div style={{ fontSize: 12.5, color: '#c92d32', marginTop: 10 }}>{err}</div>}
        {cards && !shown.length && <div style={{ marginTop: 24, textAlign: 'center' }}><span style={{ display: 'inline-block', width: 90 }}><Drawing spec={{ scene: 'creator' }} name="" rating="" t={(s) => s} /></span><div style={{ fontSize: 14, fontWeight: 600, marginTop: 8 }}>Nobody listed here yet</div><div style={{ fontSize: 12.5, color: C.mute, marginTop: 4, lineHeight: 1.45 }}>{filters.size > 1 ? 'Try fewer filters.' : 'The team still knows who to call. Ask from Create.'}</div></div>}
        {shown.map((c) => {
          const a = c.audience; const f = fit.find((x) => x.slug === c.slug)
          return <button key={c.slug} type="button" onClick={() => setSlug(c.slug)} style={{ display: 'block', width: '100%', textAlign: 'left', border: `0.5px solid ${C.line}`, borderRadius: 20, padding: 12, marginTop: 10, background: '#fff', font: 'inherit', color: C.ink, cursor: 'pointer' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <Avatar name={c.name} url={c.avatarUrl} />
              <span style={{ flex: 1, minWidth: 0 }}><b style={{ display: 'block', fontSize: 15 }}>{c.name}</b><small style={sub}>{a?.platforms.map((p) => '@' + p.handle.replace(/^@/, '')).slice(0, 1).join('')}{a?.city ? ` · ${a.city}` : ''}</small></span>
              {c.avgRating != null && c.collabs > 0 && <span style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}><Star size={11} fill={C.ink} /> {c.avgRating.toFixed(1)} · {c.collabs}</span>}
            </div>
            {a ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, marginTop: 10 }}><Num b={fmt(a.followers) || '—'} s="followers" /><Num b={fmt(a.avgViews) || '—'} s="views a post" /><Num b={a.localPct != null ? `${a.localPct}%` : '—'} s={`watch from ${a.city ?? 'nearby'}`} /></div> : <div style={{ fontSize: 12, color: C.mute, marginTop: 8 }}>Reach not connected yet</div>}
            <div style={{ marginTop: 4 }}>{a?.verifiedAt && <span style={pill('Reach verified', 'ok')}>Reach verified</span>}{f?.tag && <span style={pill(f.tag, 'pink')}>{f.tag}</span>}{(a?.cuisines ?? []).slice(0, 3).map((x) => <span key={x} style={pill(x)}>{x}</span>)}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, fontSize: 12.5, color: C.mute }}><span>{c.fromCents != null ? `From ${dollars(c.fromCents)} + a meal` : 'Quote'}{a ? ` · posts within ${a.postsWithinDays} days` : ''}{a?.responseHours ? ` · replies in ${a.responseHours < 24 ? `${a.responseHours}h` : 'a day'}` : ''}</span><ChevronRight size={16} /></div>
          </button>
        })}
        {cards && cards.length > 0 && <div style={{ fontSize: 12, color: C.mute, textAlign: 'center', marginTop: 16, lineHeight: 1.45 }}>Numbers come from their connected accounts. Not sure who? <Link href={`/dashboard/campaigns/new?clientId=${clientId}&open=influencers`} style={{ color: C.ink, fontWeight: 700 }}>Pick one for me</Link></div>}
      </div>
    </MvpShell>
  )

  /* ── the profile ── */
  const p = profile
  const a = p?.audience ?? null
  const first = p?.name.split(' ')[0] ?? ''
  const reach = a?.avgViews ?? a?.followers ?? null
  return (
    <MvpShell active="create" title={p?.name ?? ''} back="/dashboard/influencers" focus>
      <div className="cr" style={{ padding: '4px 16px 110px', color: C.ink }}>
        <button type="button" onClick={back} style={{ display: 'flex', alignItems: 'center', gap: 4, border: 0, background: 'none', font: 'inherit', fontSize: 12.5, fontWeight: 700, color: C.mute, cursor: 'pointer', padding: '4px 0' }}><ArrowLeft size={14} /> All creators</button>
        {!p && !err && <div style={{ padding: 40, textAlign: 'center', color: C.mute }}><Loader2 size={18} className="mvp-spin" /></div>}
        {err && !p && <div style={{ fontSize: 12.5, color: '#c92d32', marginTop: 10 }}>{err}</div>}
        {p && <>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginTop: 8 }}>
            <Avatar name={p.name} url={p.avatarUrl} size={72} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: DISPLAY, fontSize: 21, fontWeight: 600, letterSpacing: '-.02em' }}>{p.name}</div>
              <div style={{ fontSize: 12, color: C.mute, marginTop: 2 }}>{a?.platforms.length ? a.platforms.map((x) => `@${x.handle.replace(/^@/, '')}`).join(' · ') : p.serviceArea.join(', ')}</div>
              <div style={{ fontSize: 12, color: C.mute, marginTop: 2, display: 'flex', gap: 10, flexWrap: 'wrap' }}>{a?.city && <span><MapPin size={11} /> {a.city}</span>}{a?.responseHours != null && <span><Clock size={11} /> replies in about {a.responseHours < 24 ? `${a.responseHours} hour${a.responseHours === 1 ? '' : 's'}` : 'a day'}</span>}</div>
              <div>{a?.verifiedAt && <span style={pill('ok', 'ok')}>Reach verified</span>}{p.avgRating != null && p.collabs > 0 ? <span style={pill('m')}>★ {p.avgRating.toFixed(1)} · {p.collabs} collab{p.collabs === 1 ? '' : 's'}</span> : <span style={pill('m')}>New here</span>}{p.example && <span style={pill('m')}>Example profile</span>}</div>
            </div>
          </div>

          <div style={h3}>{first ? `Who watches ${first}` : 'The audience'}</div>
          {a ? <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
              <Num b={fmt(a.followers) || '—'} s="followers" /><Num b={fmt(a.avgViews) || '—'} s="views a post, last 30 days" /><Num b={a.engagement != null ? `${a.engagement}%` : '—'} s="engagement" />
              <Num b={a.localPct != null ? `${a.localPct}%` : '—'} s={`watch from ${a.city ?? 'nearby'}`} /><Num b={a.ages ?? '—'} s="most of them" /><Num b={`${a.postsWithinDays} days`} s="from visit to post" />
            </div>
            {a.platforms.length > 1 && <div style={{ marginTop: 8 }}>{a.platforms.map((x) => <div key={x.platform} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, padding: '6px 0', borderBottom: `0.5px solid ${C.line}` }}><BrandOrMark provider={x.platform} size={16} /><span style={{ flex: 1 }}>{PLAT[x.platform] ?? x.platform} · @{x.handle.replace(/^@/, '')}</span><span style={{ color: C.mute }}>{fmt(x.followers) ? `${fmt(x.followers)} followers` : ''}{x.avg_views ? ` · ${fmt(x.avg_views)} views` : ''}</span>{x.url && <a href={x.url} target="_blank" rel="noreferrer" style={{ color: C.mute }}><ExternalLink size={13} /></a>}</div>)}</div>}
            <div style={{ fontSize: 12, color: a.verifiedAt ? C.greenDk : '#8a5a0c', fontWeight: 600, marginTop: 8, lineHeight: 1.4 }}>{a.verifiedAt ? `Verified from ${first}'s connected account, ${nice(a.verifiedAt.slice(0, 10))}.` : `Reported by ${first}, not verified yet. Verified means a connected account.`}{reach && a.localPct != null ? ` A post of yours reaches about ${fmt(Math.round(reach * a.localPct / 100))} people nearby.` : ''}</div>
          </> : <div style={{ fontSize: 13, color: C.mute }}>{first} has not connected an account yet, so there are no numbers to show. Ask before you book.</div>}

          {p.posts.length > 0 && <><div style={h3}>{first}&apos;s recent restaurant posts</div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>{p.posts.map((x) => <PostTile key={x.id} p={x} />)}</div><div style={{ fontSize: 12, color: C.mute, marginTop: 6 }}>Tap one to open it.</div></>}

          {(p.bio || a?.styles.length || a?.cuisines.length) && <><div style={h3}>About</div>{p.bio && <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>{p.bio}</div>}<div style={{ marginTop: 6 }}>{[...(a?.styles ?? []), ...(a?.cuisines ?? [])].map((x) => <span key={x} style={pill(x)}>{x}</span>)}{a?.languages.length ? <span style={pill('m')}>{a.languages.join(', ')}</span> : null}</div></>}

          <div style={h3}>What {first} offers</div>
          {p.offers.map((o) => <div key={o.slug} style={{ border: `1.5px solid ${C.line}`, borderRadius: 16, padding: '10px 12px', marginTop: 8 }}><span style={{ float: 'right', fontWeight: 800, fontSize: 14 }}>{o.tiers.length > 1 ? `from ${dollars(o.startingCents)}` : dollars(o.startingCents) || 'Quote'}</span><b style={{ display: 'block', fontSize: 14 }}>{o.title}</b><small style={sub}>{o.summary ?? o.deliverables.join(', ')}</small>{o.tiers.length > 1 && <small style={{ ...sub, color: C.ink }}>{o.tiers.map((t) => t.name).join(' · ')}</small>}</div>)}
          <div style={{ fontSize: 12, color: C.mute, marginTop: 8, lineHeight: 1.45 }}>Every price is {first}&apos;s. Plus the meal, on you{a ? `, up to ${dollars(a.mealCapCents)} for ${a.partySize}` : ''}. Nothing is charged until the post is up.</div>

          {p.collabsDone.length > 0 && <><div style={h3}>Past collabs and what they did</div>{p.collabsDone.map((x) => <div key={x.id} style={{ padding: '9px 0', borderBottom: `0.5px solid ${C.line}`, fontSize: 13, lineHeight: 1.4 }}><b style={{ display: 'block', fontSize: 12, color: C.mute, marginBottom: 2 }}>{x.restaurant ?? 'A restaurant'}{x.listing ? ` · ${x.listing}` : ''}{x.postedAt ? ` · ${nice(x.postedAt)}` : ''}</b>{[x.views != null ? `${fmt(x.views)} views` : '', x.likes != null ? `${fmt(x.likes)} likes` : '', x.saves != null ? `${fmt(x.saves)} saves` : '', x.linkTaps != null ? `${fmt(x.linkTaps)} link taps` : ''].filter(Boolean).join(' · ')}{x.note ? ` · ${x.note}` : ''}{x.url && <a href={x.url} target="_blank" rel="noreferrer" style={{ marginLeft: 6, color: C.mute }}><ExternalLink size={12} /></a>}</div>)}</>}

          {p.reviews.length > 0 && <><div style={h3}>From restaurants</div>{p.reviews.map((r, i) => <div key={i} style={{ padding: '9px 0', borderBottom: `0.5px solid ${C.line}`, fontSize: 13, lineHeight: 1.4 }}><b style={{ display: 'block', fontSize: 12, color: C.mute, marginBottom: 2 }}>{'★'.repeat(r.stars)} {r.restaurant ?? ''} · {nice(r.when)}</b>{r.comment}</div>)}</>}

          <div style={h3}>How it works</div>
          {[[`You book, ${first} says yes within a day`, p.schedule.confirmMode === 'instant' ? 'Or right away: instant booking is on' : 'Or suggests another time'], ['The visit', 'Your team gets a card: who is coming, what to serve, the meal is on you'], [`The post, within ${a?.postsWithinDays ?? 5} days`, 'Tagged, location on, #ad where the law wants it. You see it first'], ['The numbers, a week later', `Views, saves, new followers, in Coming up. Then ${first} is paid`]].map(([b, s], i) => <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '9px 0', borderBottom: `0.5px solid ${C.line}` }}><span style={{ width: 22, height: 22, borderRadius: 99, flex: 'none', border: `1.5px solid ${C.line}`, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 800 }}>{i + 1}</span><span><b style={{ display: 'block', fontSize: 14 }}>{b}</b><small style={sub}>{s}</small></span></div>)}
        </>}
      </div>
      {p && <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, padding: '10px 16px calc(14px + env(safe-area-inset-bottom))', background: 'linear-gradient(180deg, rgba(255,255,255,0), #fff 30%)', display: 'flex', gap: 8, maxWidth: 480, margin: '0 auto', zIndex: 5 }}>
        <Link href={`/dashboard/bookings?clientId=${clientId}`} style={{ ...cta, marginTop: 0, flex: '0 0 40%', background: '#fff', color: C.ink, border: `0.5px solid ${C.line}` }}>Message</Link>
        <button type="button" onClick={() => setBooking(true)} disabled={!p.offers.length} style={{ ...cta, marginTop: 0, flex: 1, opacity: p.offers.length ? 1 : .5 }}>Book {first}</button>
      </div>}
      {p && booking && <BookSheet clientId={clientId} p={p} me={me} onClose={() => setBooking(false)} />}
    </MvpShell>
  )
}

/* ── the book sheet: package, time, the brief, the plan ── */
function BookSheet({ clientId, p, me, onClose }: { clientId: string; p: Profile; me: Me | null; onClose: () => void }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose])
  useEffect(() => { const y = window.scrollY; const b = document.body.style; const prev = { position: b.position, top: b.top, width: b.width, overflow: b.overflow }; b.position = 'fixed'; b.top = `-${y}px`; b.width = '100%'; b.overflow = 'hidden'; return () => { b.position = prev.position; b.top = prev.top; b.width = prev.width; b.overflow = prev.overflow; window.scrollTo(0, y) } }, [])
  const [vv, setVv] = useState<{ h: number; top: number } | null>(null)
  useEffect(() => { const v = window.visualViewport; const read = () => setVv(v ? { h: Math.round(v.height), top: Math.round(v.offsetTop) } : null); read(); v?.addEventListener('resize', read); v?.addEventListener('scroll', read); return () => { v?.removeEventListener('resize', read); v?.removeEventListener('scroll', read) } }, [])
  const a = p.audience
  const first = p.name.split(' ')[0]
  const [offer, setOffer] = useState<Offer>(p.offers[0])
  const [tier, setTier] = useState<Tier | null>(p.offers[0]?.tiers[0] ?? null)
  const days = useMemo(() => Array.from(new Set(p.schedule.slots.map((s) => s.date))).slice(0, 10), [p.schedule.slots])
  const [date, setDate] = useState<string | null>(days[0] ?? null)
  const times = useMemo(() => p.schedule.slots.filter((s) => s.date === date), [p.schedule.slots, date])
  const [start, setStart] = useState<string | null>(null)
  useEffect(() => { setStart(times.find((t) => Number(t.start.slice(0, 2)) >= 17)?.start ?? times[0]?.start ?? null) }, [times])
  const [tryIt, setTryIt] = useState('')
  const [know, setKnow] = useState('')
  const [avoid, setAvoid] = useState('')
  const [when, setWhen] = useState('')
  const [tag, setTag] = useState(true)
  const [repost, setRepost] = useState(a?.repostOk ?? true)
  const [whitelist, setWhitelist] = useState(false)
  const [code, setCode] = useState(true)
  const [step, setStep] = useState<'brief' | 'plan' | 'done'>('brief')
  const [posting, setPosting] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [result, setResult] = useState<{ plan: Line[]; total: number; status: string } | null>(null)
  const fee = tier?.priceCents ?? offer?.startingCents ?? 0
  const total = fee + (whitelist && a?.whitelistCents != null ? a.whitelistCents : 0)
  const codeWord = `${first.replace(/[^a-z]/gi, '').toUpperCase().slice(0, 8)}10`
  const postBy = (d: string | null) => d ? new Date(Date.parse(d + 'T12:00:00') + (a?.postsWithinDays ?? 5) * 86400000).toISOString().slice(0, 10) : null
  const preview: Line[] = useMemo(() => {
    const visit = date
    const pb = postBy(visit)
    const plus7 = pb ? new Date(Date.parse(pb + 'T12:00:00') + 7 * 86400000).toISOString().slice(0, 10) : null
    return [
      { key: 'ask', label: `${first} gets the ask`, detail: `${visit ? `${nice(visit)}${start ? `, ${hour(start)}` : ''}, ` : ''}${offer.title}${tier ? `, ${tier.name.toLowerCase()}` : ''}. The brief goes with it`, date: new Date().toISOString().slice(0, 10), cost: null, status: 'with_team', ref: null, why: p.schedule.confirmMode === 'instant' && start ? 'Instant booking is on, so it is on the calendar at once' : `${first} says yes within a day, or offers another time` },
      { key: 'team', label: 'Tell the team', detail: `One card: ${first}, party of ${a?.partySize ?? 2}${start ? `, ${hour(start)}` : ''}, ${tryIt || 'what to serve'}. The meal is on us${code ? `. ${codeWord} is live` : ''}`, date: visit ? new Date(Date.parse(visit + 'T12:00:00') - 86400000).toISOString().slice(0, 10) : null, cost: null, status: 'later', ref: null },
      { key: 'visit', label: 'The visit', detail: visit ? 'A reminder that morning' : `${first} offers two dates`, date: visit, cost: null, status: 'later', ref: null },
      { key: 'post', label: `${first}'s post goes up`, detail: `Within ${a?.postsWithinDays ?? 5} days. You see the link first${tag ? '. Tagged, location on' : ''}`, date: pb, cost: fee, status: 'later', ref: null, why: 'Nothing is charged until it is up' },
      ...(whitelist && a?.whitelistCents != null ? [{ key: 'whitelist', label: 'Boost it from their handle', detail: 'Their post as your ad. Set the budget in Boost', date: pb, cost: a.whitelistCents, status: 'later', ref: null }] : []),
      ...(repost ? [{ key: 'repost', label: 'Repost it', detail: `${first}'s post on your account, credited, at your best hour`, date: pb, cost: null, status: 'later', ref: null, why: 'Their post reaches their people. Yours reaches yours' }] : []),
      { key: 'results', label: 'What it did', detail: `Views, saves, new followers${code ? `, ${codeWord} used` : ''}. In Coming up`, date: plus7, cost: null, status: 'later', ref: null },
      { key: 'paid', label: `${first} is paid`, detail: 'Apnosh pays them. You are charged only then', date: plus7, cost: null, status: 'later', ref: null },
    ]
  }, [date, start, offer, tier, tryIt, tag, repost, whitelist, code, fee, a, first, codeWord, p.schedule.confirmMode]) // eslint-disable-line react-hooks/exhaustive-deps
  const send = async () => {
    setPosting(true); setErr(null)
    try {
      const r = await fetch('/api/dashboard/influencers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, slug: p.slug, listingSlug: offer.slug, tierName: tier?.name, date: date ?? undefined, start: start ?? undefined, brief: { try: tryIt, know, avoid, when, party: a?.partySize ?? 2, tag, repost, whitelist, code } }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Could not send the ask')
      setResult({ plan: j.plan, total: j.total, status: j.status }); setStep('done')
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not send the ask') }
    setPosting(false)
  }
  if (!mounted) return null
  const Line_ = ({ l }: { l: Line }) => <div style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: `0.5px solid ${C.line}`, alignItems: 'flex-start' }}><span style={{ width: 62, flex: 'none', fontSize: 12, fontWeight: 700, color: C.mute, paddingTop: 2 }}>{l.date ? nice(l.date).replace(/^(\w+), /, '$1 ') : ''}</span><span style={{ flex: 1, minWidth: 0 }}><b style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>{l.label}</b><small style={sub}>{l.detail}</small>{l.why && <small style={{ ...sub, color: C.greenDk, fontWeight: 600 }}>{l.why}</small>}</span>{l.cost != null && l.cost > 0 && <b style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{dollars(l.cost)}</b>}</div>
  return createPortal(
    <div className="cr" role="dialog" aria-modal="true" aria-label={`Book ${first}`} style={{ position: 'fixed', left: 0, right: 0, top: vv ? vv.top : 0, height: vv ? vv.h : '100dvh', zIndex: 80, background: 'rgba(20,22,26,.42)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', touchAction: 'none' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, maxHeight: vv ? vv.h - 16 : '92dvh', overflowY: 'auto', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', touchAction: 'pan-y', background: '#fff', borderRadius: '24px 24px 0 0', padding: '10px 18px calc(24px + env(safe-area-inset-bottom))', boxSizing: 'border-box', color: C.ink }}>
        <div style={{ width: 38, height: 4, borderRadius: 99, background: '#e2e2e7', margin: '0 auto 10px' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0 10px' }}>
          {step === 'plan' ? <button type="button" onClick={() => setStep('brief')} aria-label="Back" style={{ width: 34, height: 34, borderRadius: 99, border: `0.5px solid ${C.line}`, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><ArrowLeft size={16} /></button> : <span style={{ width: 34 }} />}
          <span style={{ flex: 1, textAlign: 'center', fontFamily: DISPLAY, fontSize: 18, fontWeight: 600, letterSpacing: '-.01em' }}>{step === 'done' ? 'Sent' : `Book ${first}`}</span>
          <button type="button" onClick={onClose} aria-label="Close" style={{ width: 34, height: 34, borderRadius: 99, border: `0.5px solid ${C.line}`, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={16} /></button>
        </div>
        {step === 'brief' && <>
          {p.offers.length > 1 && <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>{p.offers.map((o) => <button key={o.slug} type="button" onClick={() => { setOffer(o); setTier(o.tiers[0] ?? null) }} style={chip(offer.slug === o.slug)}>{o.title}</button>)}</div>}
          <div style={h2}>{offer.title}</div>
          {offer.tiers.length > 1 ? <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(3, offer.tiers.length)},1fr)`, gap: 6 }}>{offer.tiers.map((t) => <button key={t.id} type="button" onClick={() => setTier(t)} style={{ border: `1.5px solid ${tier?.id === t.id ? C.ink : C.line}`, boxShadow: tier?.id === t.id ? `inset 0 0 0 1px ${C.ink}` : 'none', borderRadius: 12, padding: '8px 6px', textAlign: 'center', background: '#fff', font: 'inherit', color: C.ink, cursor: 'pointer' }}><b style={{ display: 'block', fontSize: 12.5 }}>{t.name}</b><small style={{ display: 'block', color: C.mute, fontSize: 10.5, marginTop: 2, lineHeight: 1.25 }}>{t.deliverables.slice(0, 2).join(', ')}</small><em style={{ display: 'block', fontStyle: 'normal', fontWeight: 800, fontSize: 13, marginTop: 4 }}>{dollars(t.priceCents)}</em></button>)}</div> : <div style={{ fontSize: 13, color: C.mute }}>{offer.deliverables.join(' · ')}{offer.startingCents != null ? ` · ${dollars(offer.startingCents)}` : ''}</div>}
          <div style={h3}>When</div>
          {days.length ? <>
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>{days.map((d) => { const dt = new Date(d + 'T12:00:00'); return <button key={d} type="button" onClick={() => setDate(d)} style={{ flex: 'none', minWidth: 52, border: `1.5px solid ${date === d ? C.ink : C.line}`, boxShadow: date === d ? `inset 0 0 0 1px ${C.ink}` : 'none', borderRadius: 12, padding: '8px 0', textAlign: 'center', fontSize: 12, fontWeight: 700, background: '#fff', font: 'inherit', color: C.ink, cursor: 'pointer' }}><small style={{ display: 'block', fontWeight: 600, color: C.mute, fontSize: 10.5 }}>{dt.toLocaleDateString('en-US', { weekday: 'short' })}</small>{dt.getDate()}</button> })}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>{times.map((t) => <button key={t.start} type="button" onClick={() => setStart(t.start)} style={chip(start === t.start)}>{hour(t.start)}</button>)}</div>
            <div style={{ fontSize: 12, color: C.greenDk, fontWeight: 600, marginTop: 6 }}>{first}&apos;s open times{p.schedule.timezone ? `, ${p.schedule.timezone.split('/').pop()?.replace('_', ' ')}` : ''}.</div>
          </> : <><div style={{ fontSize: 13, color: C.mute }}>{first} has not opened a calendar. Say when works and {first} offers two dates.</div><input value={when} onChange={(e) => setWhen(e.target.value)} placeholder="A weekend evening in October" style={input} /></>}
          <div style={h3}>The brief</div>
          <label style={{ display: 'block', fontSize: 13.5, fontWeight: 600, marginTop: 8 }}>What should {first} try?</label><input value={tryIt} onChange={(e) => setTryIt(e.target.value)} placeholder="The new pork belly bánh mì, and the egg coffee" style={input} />
          <label style={{ display: 'block', fontSize: 13.5, fontWeight: 600, marginTop: 12 }}>What should people know?</label><input value={know} onChange={(e) => setKnow(e.target.value)} placeholder="Family run since 2009. Open till 10 on weekends" style={input} />
          <div style={{ ...rowS, marginTop: 6 }}><span>Party of {a?.partySize ?? 2}<small style={sub}>{first} brings {(a?.partySize ?? 2) > 1 ? 'a friend' : 'nobody'}. The meal cap is {dollars(a?.mealCapCents ?? 6000)}</small></span></div>
          <div style={rowS}><span>Tag us and the location<small style={sub}>{me?.handle ? `@${me.handle.replace(/^@/, '')}, ` : ''}{me?.name ?? 'your restaurant'}</small></span><Switch on={tag} set={setTag} /></div>
          {(a?.repostOk ?? true) && <div style={rowS}><span>You can repost it<small style={sub}>{first}&apos;s post on your account, credited</small></span><Switch on={repost} set={setRepost} /></div>}
          {a?.whitelistCents != null && <div style={rowS}><span>Boost it as an ad from {first}&apos;s handle<small style={sub}>+{dollars(a.whitelistCents)}. Ads in their voice reach further</small></span><Switch on={whitelist} set={setWhitelist} /></div>}
          <div style={rowS}><span>A code for {first}&apos;s followers<small style={sub}>{codeWord}, 10% off. The team counts it</small></span><Switch on={code} set={setCode} /></div>
          <label style={{ display: 'block', fontSize: 13.5, fontWeight: 600, marginTop: 12 }}>Anything to avoid?</label><input value={avoid} onChange={(e) => setAvoid(e.target.value)} placeholder="No mention of the old location" style={input} />
          <button type="button" onClick={() => setStep('plan')} disabled={!tryIt.trim()} style={{ ...cta, opacity: tryIt.trim() ? 1 : .5 }}>See the plan</button>
        </>}
        {step === 'plan' && <>
          <div style={h2}>Here is the plan</div>
          <div>{preview.map((l) => <Line_ key={l.key} l={l} />)}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 15, padding: '12px 0 0' }}><span>{first}&apos;s fee</span><span>{dollars(total)}</span></div>
          <div style={{ fontSize: 12, color: C.mute, marginTop: 4, lineHeight: 1.45 }}>Plus the meal, about {dollars(a?.mealCapCents ?? 6000)}. Nothing is charged until the post is up.</div>
          {err && <div style={{ fontSize: 12.5, color: '#c92d32', marginTop: 10 }}>{err}</div>}
          <button type="button" onClick={send} disabled={posting} style={{ ...cta, opacity: posting ? .6 : 1 }}>{posting ? <Loader2 size={16} className="mvp-spin" /> : null} {posting ? 'Sending' : 'Send the ask'}</button>
          <button type="button" onClick={() => setStep('brief')} style={{ ...cta, marginTop: 8, background: '#fff', color: C.ink, border: `0.5px solid ${C.line}` }}>Change something</button>
        </>}
        {step === 'done' && result && <>
          <div style={{ padding: '14px 4px 6px', textAlign: 'center' }}><span style={{ display: 'inline-flex', width: 56, height: 56, borderRadius: 99, background: C.greenSoft, color: C.greenDk, alignItems: 'center', justifyContent: 'center' }}><Check size={26} strokeWidth={2.5} /></span><div style={{ ...h2, marginTop: 12 }}>{result.status === 'confirmed' ? `${first} is booked` : `Sent to ${first}`}</div></div>
          <div>{result.plan.map((l) => <Line_ key={l.key} l={l} />)}</div>
          <Link href={`/dashboard/bookings?clientId=${clientId}`} style={cta}>See it in your bookings</Link>
          <button type="button" onClick={onClose} style={{ ...cta, marginTop: 8, background: '#fff', color: C.ink, border: `0.5px solid ${C.line}` }}>Done</button>
        </>}
      </div>
    </div>, document.body)
}
