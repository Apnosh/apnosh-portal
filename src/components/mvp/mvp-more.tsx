'use client'

/**
 * /dashboard/more — the owner's More tab (owner 2026-09-05: "make it simple").
 *
 * The profile owns the business facts: logo, name, what and where, open now, their goals,
 * and five quick buttons (Info, Hours, Menu, Photos, Brand). Under it, six rows and Sign out.
 * Every row says what is inside it or what it is set to. Words stay at a fifth-grade level.
 */

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, Store, Clock, UtensilsCrossed, Image as ImageIcon, Palette, SlidersHorizontal, Heart, CreditCard, Plug, KeyRound, LifeBuoy, Sparkles, LogOut } from 'lucide-react'
import { signOut } from '@/lib/supabase/hooks'
import { gradOf, hueOf, type HueKey } from './hues'
import { Mark } from './mark'

const C = { green: '#4abd98', greenDk: '#2e9a78', ink: '#1d1d1f', mute: '#6e6e73', faint: '#aeaeb2', line: '#e6e6ea', coral: '#c92d32' }
const DISPLAY = "'Cal Sans','Inter',sans-serif"

const MORE_CSS = `
.mvp-row{transition:background .12s ease}
.mvp-row:active{background:#f1f5f4}
@media (hover:hover){.mvp-row:hover{background:#f7faf9}}
`

const GOAL_HUE: Record<string, HueKey> = {
  more_foot_traffic: 'newfaces', regulars_more_often: 'regulars', more_online_orders: 'online', more_reservations: 'event',
  better_reputation: 'reviews', be_known_for: 'brand', fill_slow_times: 'nights', grow_catering: 'catering',
}

interface MoreData {
  profile: { name: string; logoUrl: string | null; cuisine: string | null; city: string | null; tier: string | null; hours: unknown; goals: { slug: string; name: string }[] }
  settings: { approveFirst: boolean; favorites: string[] }
  people: { id: string; name: string }[]
  toRate: { id: string }[]
}

/* "Open now · closes 9 pm" from the weekly hours on the Google listing, read on the phone's clock.
   Hours arrive in one of two shapes (our editor's {mon:[{open,close}]} or Google's periods);
   both are tried, and the line is simply hidden when neither fits. */
function openLine(hours: unknown): { open: boolean; text: string } | null {
  if (!hours || typeof hours !== 'object') return null
  const now = new Date()
  const keys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  const day = keys[now.getDay()]
  const mins = now.getHours() * 60 + now.getMinutes()
  const toMin = (t: string) => { const m = /^(\d{1,2}):?(\d{2})?/.exec(t); if (!m) return null; return Number(m[1]) * 60 + Number(m[2] ?? 0) }
  const fmt = (t: string) => { const mm = toMin(t); if (mm == null) return t; const h = Math.floor(mm / 60), m = mm % 60; const ap = h >= 12 ? 'pm' : 'am'; const hh = ((h + 11) % 12) + 1; return m ? `${hh}:${String(m).padStart(2, '0')} ${ap}` : `${hh} ${ap}` }
  const h = hours as Record<string, unknown>
  let spans: { open: string; close: string }[] = []
  const ours = h[day]
  if (Array.isArray(ours)) spans = ours.filter((s) => s && typeof s === 'object' && 'open' in (s as object)).map((s) => s as { open: string; close: string })
  else if (Array.isArray(h.periods)) {
    const names = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']
    spans = (h.periods as Array<{ openDay?: string; openTime?: string | { hours?: number; minutes?: number }; closeTime?: string | { hours?: number; minutes?: number } }>)
      .filter((p) => p.openDay === names[now.getDay()])
      .map((p) => {
        const t = (x: string | { hours?: number; minutes?: number } | undefined) => typeof x === 'string' ? x : x ? `${x.hours ?? 0}:${String(x.minutes ?? 0).padStart(2, '0')}` : ''
        return { open: t(p.openTime), close: t(p.closeTime) }
      })
  }
  if (spans.length === 0) return null
  for (const s of spans) {
    const a = toMin(s.open), b = toMin(s.close)
    if (a == null || b == null) continue
    const closeM = b <= a ? b + 24 * 60 : b
    if (mins >= a && mins < closeM) return { open: true, text: `Open now · closes ${fmt(s.close)}` }
  }
  const next = spans.map((s) => toMin(s.open)).filter((x): x is number => x != null && x > mins).sort((a, b) => a - b)[0]
  if (next != null) { const s = spans.find((x) => toMin(x.open) === next)!; return { open: false, text: `Closed · opens ${fmt(s.open)}` } }
  return { open: false, text: 'Closed today' }
}

export default function MvpMore({ name, tier, query = '', clientId }: { name: string; location?: string | null; tier?: string | null; query?: string; clientId?: string | null }) {
  const [data, setData] = useState<MoreData | null>(null)
  useEffect(() => {
    if (!clientId) return
    let live = true
    fetch(`/api/dashboard/more?clientId=${clientId}`).then((r) => (r.ok ? r.json() : null)).then((j) => { if (live && j?.profile) setData(j as MoreData) }).catch(() => {})
    return () => { live = false }
  }, [clientId])
  const p = data?.profile
  const shownName = p?.name || name
  const initials = shownName.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || 'A'
  const line = [p?.cuisine, p?.city].filter(Boolean).join(' · ')
  const open = useMemo(() => openLine(p?.hours), [p?.hours])
  const planWord = (p?.tier ?? tier) && (p?.tier ?? tier) !== 'Internal' ? `${p?.tier ?? tier} plan` : 'Your plan'
  const toRate = data?.toRate.length ?? 0
  const favs = data?.settings.favorites.length ?? 0

  const rows: { label: string; sub?: string; href: string; Icon: typeof Store; hue: HueKey; pill?: { text: string; tone: 'amber' | 'good' | 'plain' } }[] = [
    { label: 'Your settings', sub: data ? (data.settings.approveFirst ? 'You approve first · alerts · look' : 'We post for you · alerts · look') : 'Approvals, alerts, look', href: '/dashboard/preferences', Icon: SlidersHorizontal, hue: 'mint' },
    { label: 'People you have worked with', sub: favs ? `${favs} favorite${favs === 1 ? '' : 's'}` : 'Favorites and ratings', href: '/dashboard/people', Icon: Heart, hue: 'catering', pill: toRate ? { text: `${toRate} to rate`, tone: 'amber' } : undefined },
    { label: 'Plan and billing', sub: planWord, href: '/dashboard/billing', Icon: CreditCard, hue: 'nights' },
    { label: 'Connected accounts', sub: 'Google, Instagram, and more', href: '/dashboard/connected-accounts', Icon: Plug, hue: 'nights' },
    { label: 'Login and password', href: '/dashboard/settings', Icon: KeyRound, hue: 'grey' },
    { label: 'Get help', sub: 'Message us, questions, feedback', href: '/dashboard/get-help', Icon: LifeBuoy, hue: 'mint' },
    { label: "What's new", sub: 'The latest changes', href: '/dashboard/whats-new', Icon: Sparkles, hue: 'brand' },
  ]
  const q = query.trim().toLowerCase()
  const shown = q ? rows.filter((r) => `${r.label} ${r.sub ?? ''}`.toLowerCase().includes(q)) : rows
  const groups: { title: string; hue: HueKey; keys: string[] }[] = [
    { title: 'You', hue: 'mint', keys: ['Your settings', 'People you have worked with'] },
    { title: 'Account', hue: 'nights', keys: ['Plan and billing', 'Connected accounts', 'Login and password'] },
    { title: 'Help', hue: 'grey', keys: ['Get help', "What's new"] },
  ]
  const quick: { label: string; href: string; Icon: typeof Store; hue: HueKey }[] = [
    { label: 'Info', href: '/dashboard/business-info', Icon: Store, hue: 'newfaces' },
    { label: 'Hours', href: '/dashboard/business-info/hours', Icon: Clock, hue: 'newfaces' },
    { label: 'Menu', href: '/dashboard/business-info/menu', Icon: UtensilsCrossed, hue: 'catering' },
    { label: 'Photos', href: '/dashboard/assets', Icon: ImageIcon, hue: 'catering' },
    { label: 'Brand', href: '/dashboard/business-info/brand', Icon: Palette, hue: 'brand' },
  ]
  const pillStyle = (tone: 'amber' | 'good' | 'plain'): React.CSSProperties => tone === 'amber' ? { background: '#fbf3e4', color: '#8a5a0c' } : tone === 'good' ? { background: '#eaf7f3', color: C.greenDk } : { background: '#f0f0f2', color: C.mute }

  return (
    <div style={{ background: '#fff', minHeight: '100%', padding: '6px 16px 24px', fontFamily: "'Inter',system-ui,sans-serif", boxSizing: 'border-box' }}>
      <style>{MORE_CSS}</style>

      {!q && (
        <>
          {/* the profile: their place, at a glance */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '6px 2px 0' }}>
            <Link href="/dashboard/assets" aria-label="Change your logo" style={{ width: 64, height: 64, borderRadius: 18, overflow: 'hidden', background: '#eaf7f3', color: C.greenDk, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: DISPLAY, fontSize: 22, fontWeight: 600, flexShrink: 0, textDecoration: 'none' }}>
              {p?.logoUrl ? <img src={p.logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
            </Link>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 600, color: C.ink, lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shownName}</div>
              {line && <div style={{ fontSize: 13, color: C.mute, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{line}</div>}
              {open && <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: open.open ? C.greenDk : C.mute, marginTop: 5 }}><span style={{ width: 7, height: 7, borderRadius: 4, background: open.open ? C.greenDk : C.faint }} />{open.text}</div>}
            </div>
          </div>

          {/* their goals, in each goal's colour; a nudge when none are set */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12, padding: '0 2px' }}>
            {(p?.goals?.length ? p.goals : []).map((g) => { const hue = GOAL_HUE[g.slug] ?? 'mint'; return <Link key={g.slug} href="/dashboard/goals" style={{ fontSize: 11.5, fontWeight: 600, padding: '5px 10px', borderRadius: 99, background: hueTint(hue), color: hueInk(hue), textDecoration: 'none' }}>{g.name}</Link> })}
            {p && p.goals.length === 0 && <Link href="/dashboard/goals" style={{ fontSize: 11.5, fontWeight: 600, padding: '5px 10px', borderRadius: 99, background: '#eaf7f3', color: C.greenDk, textDecoration: 'none' }}>Pick your goals</Link>}
          </div>

          {/* the five things owners touch most */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14, padding: '0 6px' }}>
            {quick.map((qk) => (
              <Link key={qk.label} href={qk.href} className="mvp-press" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, color: C.ink, textDecoration: 'none' }}>
                <Mark hue={qk.hue} size={40}><qk.Icon size={22} /></Mark>{qk.label}
              </Link>
            ))}
          </div>
        </>
      )}

      {q && shown.length === 0 && <div style={{ padding: '30px 18px', textAlign: 'center', color: C.mute, fontSize: 13.5 }}>Nothing matches &ldquo;{query.trim()}&rdquo;.</div>}
      {groups.map((g) => {
        const list = shown.filter((r) => g.keys.includes(r.label))
        if (list.length === 0) return null
        return (
          <div key={g.title} style={{ marginTop: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 600, letterSpacing: '.01em', color: C.mute, padding: '0 4px 4px' }}><span style={{ width: 7, height: 7, borderRadius: 4, background: gradOf(g.hue) }} />{g.title}</div>
            {list.map((r) => (
              <Link key={r.href} href={r.href} className="mvp-row" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 2px', minHeight: 48, boxSizing: 'border-box', textDecoration: 'none', color: 'inherit', borderRadius: 12 }}>
                <Mark hue={r.hue} size={36}><r.Icon size={18} /></Mark>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 15, fontWeight: 500, color: C.ink, lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.label}</span>
                  {r.sub && <span style={{ display: 'block', fontSize: 12.5, color: C.mute, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.sub}</span>}
                </span>
                {r.pill && <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 99, padding: '3px 8px', flexShrink: 0, ...pillStyle(r.pill.tone) }}>{r.pill.text}</span>}
                <ChevronRight size={16} color={C.faint} style={{ flexShrink: 0 }} />
              </Link>
            ))}
          </div>
        )
      })}

      {!q && (
        <button type="button" onClick={() => { void signOut() }} className="mvp-row" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '6px 2px', minHeight: 48, marginTop: 18, boxSizing: 'border-box', borderRadius: 12, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', font: 'inherit' }}>
          <Mark hue="red" size={36}><LogOut size={18} /></Mark>
          <span style={{ flex: 1, fontSize: 15, fontWeight: 500, color: C.coral }}>Sign out</span>
        </button>
      )}
    </div>
  )
}

/* soft tint + deep ink of a hue, for the goal chips */
const hueTint = (h: HueKey) => hueOf(h)[0] + '29'
const hueInk = (h: HueKey) => hueOf(h)[1]
