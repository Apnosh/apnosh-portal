'use client'

/**
 * /dashboard/more — the owner "More" hub in the apnosh-mvp design. An
 * iOS-Settings-style grouped list: a business identity card on top, then the
 * surfaces that don't earn a primary tab (business records, help, plan
 * + account), then sign out.
 *
 * Every row links to a page that already exists. "Contact support" deep-links
 * into the owner's team chat (Messages) rather than opening a second inbox, so
 * there's one conversation with two doors (here + the header chat).
 */

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { BrandOrMark } from './mvp-insights'
import { CARD_SHADOW } from './kit'
import { gradOf, type HueKey } from './hues'
import { Mark, MARK_SHADOW } from './mark'
import { TrendingUp, ChevronRight, CreditCard, FileText, Headset, HelpCircle, Image as ImageIcon, LineChart, LogOut, MapPin, Palette, Plug, Settings, ShoppingBag, Star, Store, Target, Users, Share2 } from 'lucide-react'
import { signOut } from '@/lib/supabase/hooks'

const C = {
  green: '#4abd98', greenDk: '#2e9a78', greenSoft: '#eaf7f3',
  ink: '#1d1d1f', mute: '#6e6e73', faint: '#aeaeb2',
  line: '#e6e6ea', coral: '#c0564f', coralSoft: '#fdeeee', bg: '#f5f5f7',
}
const DISPLAY = "'Cal Sans','Inter',sans-serif"

const MORE_CSS = `
.mvp-row{transition:background .12s ease}
.mvp-row:active{background:#f1f5f4}
@media (hover:hover){.mvp-row:hover{background:#f7faf9}}
`

/* Every row wears one colour that names what it is about (portal redesign 2026-09-04):
   a network's own mark where a platform is the subject, a gradient glyph elsewhere. */
type Row = { label: string; sub: string; href: string; Icon: typeof Store; /** a network this row is about — its real mark leads instead of the icon */ brand?: string | string[]; hue?: HueKey }

const GROUPS: { title: string; hue: HueKey; rows: Row[] }[] = [
  {
    title: 'Your business',
    hue: 'newfaces',
    rows: [
      { label: 'Results', sub: 'Proof from your weeks', href: '/dashboard/results', Icon: TrendingUp, hue: 'mint' },
      { label: 'Business info', sub: 'Hours, menu, photos', href: '/dashboard/business-info', Icon: Store, hue: 'newfaces' },
      { label: 'Brand', sub: 'Voice, audience, competitors', href: '/dashboard/business-info/brand', Icon: Palette, hue: 'brand' },
      { label: 'Connected accounts', sub: 'Instagram, Google, Yelp', href: '/dashboard/connected-accounts', Icon: Plug, hue: 'nights' },
      // Google Business Profile: an always-on entry to the in-portal viewer/editor
      // (no campaignId → 'view' lane; Pro owners edit here and it writes back to Google).
      // It is also still reachable as a campaign deliverable via ?campaignId=.
      { label: 'Google profile', sub: 'See and fix what Google shows', href: '/dashboard/google-profile', Icon: MapPin , brand: 'google' },
      { label: 'Order buttons', sub: 'Where Order and Reserve send people', href: '/dashboard/order-buttons', Icon: ShoppingBag , brand: 'google' },
      { label: 'Reviews', sub: 'The ones still waiting, worst first', href: '/dashboard/review-replies', Icon: Star , brand: 'google' },
      { label: 'Other listings', sub: 'Yelp, Apple Maps and the rest, matching Google', href: '/dashboard/listings', Icon: MapPin , brand: 'yelp' },
      { label: 'Social profiles', sub: 'Five platforms, complete and matching', href: '/dashboard/social-profiles', Icon: Share2 , brand: ['instagram', 'tiktok'] },
      { label: 'Measure', sub: 'Search Console and Analytics, so you can see what works', href: '/dashboard/measure', Icon: LineChart, hue: 'nights' },
      { label: 'Photos', sub: 'Logo, photos, videos', href: '/dashboard/assets', Icon: ImageIcon, hue: 'catering' },
      { label: 'Goals', sub: 'What to focus on', href: '/dashboard/goals', Icon: Target, hue: 'event' },
    ],
  },
  {
    title: 'Plan & account',
    hue: 'nights',
    rows: [
      { label: 'Billing', sub: 'Plan, invoices, card', href: '/dashboard/billing', Icon: CreditCard, hue: 'nights' },
      { label: 'Team', sub: 'Strategist, photographer, designer', href: '/dashboard/team', Icon: Users, hue: 'catering' },
      { label: 'Agreements', sub: 'Read & sign', href: '/dashboard/agreements', Icon: FileText, hue: 'grey' },
      { label: 'Settings', sub: 'Login, password, alerts, dark mode', href: '/dashboard/settings', Icon: Settings, hue: 'grey' },
    ],
  },
  {
    title: 'Help',
    hue: 'mint',
    rows: [
      { label: 'Support', sub: 'Talk to your team', href: '/dashboard/messages', Icon: Headset, hue: 'mint' },
      { label: 'Help', sub: 'Quick answers', href: '/dashboard/help', Icon: HelpCircle, hue: 'mint' },
    ],
  },
]

/* the three numbers under the profile card, from the badge-count endpoint */
function useMoreStats(clientId?: string | null) {
  const [st, setSt] = useState<{ connected: number; liveCampaigns: number; rating: number | null } | null>(null)
  useEffect(() => {
    if (!clientId) return
    let live = true
    fetch(`/api/dashboard/counts?clientId=${clientId}`).then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (!live || !j?.counts) return
      setSt({ connected: j.counts.connected ?? 0, liveCampaigns: j.counts.liveCampaigns ?? 0, rating: typeof j.counts.rating === 'number' ? j.counts.rating : null })
    }).catch(() => {})
    return () => { live = false }
  }, [clientId])
  return st
}

export default function MvpMore({ name, location, tier, query = '', clientId }: { name: string; location?: string | null; tier?: string | null; /** the top row's search — filters every row by name or description */ query?: string; clientId?: string | null }) {
  const q = query.trim().toLowerCase()
  const stats = useMoreStats(clientId)
  const groups = q ? GROUPS.map((g) => ({ ...g, rows: g.rows.filter((r) => `${r.label} ${r.sub}`.toLowerCase().includes(q)) })).filter((g) => g.rows.length > 0) : GROUPS
  const initials = name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || 'A'
  const planLabel = tier && tier !== 'Internal' ? `${tier} plan` : null

  return (
    <div style={{ background: '#fff', minHeight: '100%', padding: '10px 12px 24px', fontFamily: "'Inter',system-ui,sans-serif", boxSizing: 'border-box' }}>
      <style>{MORE_CSS}</style>

      {/* the business, as a profile card with a gradient avatar (portal redesign 2026-09-04) */}
      <Link href="/dashboard/business-info" className="mvp-row" style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', borderRadius: 18, boxShadow: CARD_SHADOW, padding: '10px 12px', textDecoration: 'none', color: 'inherit', marginBottom: 10 }}>
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 46, height: 46, borderRadius: '50%', background: '#fff', boxShadow: MARK_SHADOW, fontSize: 16, fontWeight: 600, letterSpacing: '-.01em', color: C.greenDk, fontFamily: DISPLAY, flexShrink: 0 }}>{initials}</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 17, fontWeight: 600, color: C.ink, fontFamily: DISPLAY, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
            {planLabel && <span style={{ fontSize: 11, fontWeight: 700, color: C.greenDk, background: C.greenSoft, borderRadius: 99, padding: '2px 8px' }}>{planLabel}</span>}
            {location && <span style={{ fontSize: 12.5, color: C.mute }}>{location}</span>}

          </span>
        </span>
        <ChevronRight size={18} color={C.faint} style={{ flexShrink: 0 }} />
      </Link>

      {!q && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {([
            [stats ? String(stats.connected) : '–', stats?.connected === 1 ? 'connected' : 'connected', '/dashboard/connected-accounts'],
            [stats ? String(stats.liveCampaigns) : '–', stats?.liveCampaigns === 1 ? 'live campaign' : 'live campaigns', '/dashboard/campaigns'],
            [stats ? (stats.rating != null ? `${stats.rating.toFixed(1)}★` : '–') : '–', 'Google rating', '/dashboard/review-replies'],
          ] as const).map(([n, l, href]) => (
            <Link key={l} href={href} className="mvp-row" style={{ flex: 1, background: '#fff', borderRadius: 14, boxShadow: CARD_SHADOW, padding: '10px 6px', textAlign: 'center', textDecoration: 'none', color: 'inherit' }}>
              <span style={{ display: 'block', fontFamily: DISPLAY, fontSize: 17, fontWeight: 600, color: C.ink, fontVariantNumeric: 'normal', lineHeight: 1.1 }}>{n}</span>
              <span style={{ display: 'block', fontSize: 11, color: C.mute, marginTop: 3 }}>{l}</span>
            </Link>
          ))}
        </div>
      )}

      {q && groups.length === 0 && <div style={{ padding: '30px 18px', textAlign: 'center', color: '#6e6e73', fontSize: 13.5 }}>Nothing matches &ldquo;{query.trim()}&rdquo;.</div>}
      {groups.map(group => (
        <div key={group.title} style={{ marginBottom: 16 }}>
          {/* density pass (owner 2026-09-04): one word per row, no sub text, no hairlines — the fixed
              mark column and the aligned labels say what belongs together */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 600, letterSpacing: '.01em', color: C.mute, padding: '0 8px 6px' }}><span style={{ width: 7, height: 7, borderRadius: 4, background: gradOf(group.hue) }} />{group.title}</div>
          <div style={{ background: '#fff', borderRadius: 18, boxShadow: CARD_SHADOW, overflow: 'hidden', padding: '4px 0' }}>
            {group.rows.map((r) => (
              <div key={r.href}>
                <Link href={r.href} className="mvp-row" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 12px 6px 10px', minHeight: 46, boxSizing: 'border-box', textDecoration: 'none', color: 'inherit' }}>
                  {r.brand
                    ? <span style={{ width: 36, display: 'inline-flex', justifyContent: 'center', flexShrink: 0 }}>{(Array.isArray(r.brand) ? r.brand : [r.brand]).map((b, k) => <span key={b} style={{ width: 32, height: 32, borderRadius: 99, background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,.05), 0 3px 10px rgba(0,0,0,.09)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginLeft: k ? -12 : 0, position: 'relative', zIndex: 2 - k }}><BrandOrMark provider={b} size={17} /></span>)}</span>
                    : <Mark hue={r.hue ?? 'mint'} size={36} bare><r.Icon size={18} /></Mark>}
                  <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 500, color: C.ink, lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.label}</span>
                  <ChevronRight size={16} color={C.faint} style={{ flexShrink: 0 }} />
                </Link>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div style={{ background: '#fff', borderRadius: 18, boxShadow: CARD_SHADOW, overflow: 'hidden', marginBottom: 8, padding: '4px 0' }}>
        <button type="button" onClick={() => { void signOut() }} className="mvp-row" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '6px 12px 6px 10px', minHeight: 46, boxSizing: 'border-box', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', font: 'inherit' }}>
          <Mark hue="red" size={36} bare><LogOut size={18} /></Mark>
          <span style={{ flex: 1, fontSize: 15, fontWeight: 500, color: C.coral }}>Sign out</span>
        </button>
      </div>

    </div>
  )
}
