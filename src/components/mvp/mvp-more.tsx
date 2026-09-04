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
import { BrandOrMark } from './mvp-insights'
import { CARD_SHADOW } from './kit'
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

type Row = { label: string; sub: string; href: string; Icon: typeof Store; /** a network this row is about — its real mark leads instead of the icon */ brand?: string | string[] }

const GROUPS: { title: string; rows: Row[] }[] = [
  {
    title: 'Your business',
    rows: [
      { label: 'Results', sub: 'Proof from your weeks', href: '/dashboard/results', Icon: TrendingUp },
      { label: 'Business info & hours', sub: 'Hours, menu, photos', href: '/dashboard/business-info', Icon: Store },
      { label: 'Brand & audience', sub: 'Voice, audience, competitors', href: '/dashboard/business-info/brand', Icon: Palette },
      { label: 'Connected accounts', sub: 'Instagram, Google, Yelp', href: '/dashboard/connected-accounts', Icon: Plug , brand: ['google', 'instagram'] },
      // Google Business Profile: an always-on entry to the in-portal viewer/editor
      // (no campaignId → 'view' lane; Pro owners edit here and it writes back to Google).
      // It is also still reachable as a campaign deliverable via ?campaignId=.
      { label: 'Google Business Profile', sub: 'See and fix what Google shows', href: '/dashboard/google-profile', Icon: MapPin , brand: 'google' },
      { label: 'Google order buttons', sub: 'Where Order and Reserve send people', href: '/dashboard/order-buttons', Icon: ShoppingBag , brand: 'google' },
      { label: 'Reply to reviews', sub: 'The ones still waiting, worst first', href: '/dashboard/review-replies', Icon: Star , brand: 'google' },
      { label: 'Your other listings', sub: 'Yelp, Apple Maps and the rest, matching Google', href: '/dashboard/listings', Icon: MapPin , brand: 'yelp' },
      { label: 'Your social profiles', sub: 'Five platforms, complete and matching', href: '/dashboard/social-profiles', Icon: Share2 , brand: ['instagram', 'tiktok'] },
      { label: 'Get measurable', sub: 'Search Console and Analytics, so you can see what works', href: '/dashboard/measure', Icon: LineChart },
      { label: 'Photos & files', sub: 'Logo, photos, videos', href: '/dashboard/assets', Icon: ImageIcon },
      { label: 'Your goals', sub: 'What to focus on', href: '/dashboard/goals', Icon: Target },
    ],
  },
  {
    title: 'Help',
    rows: [
      { label: 'Contact support', sub: 'Talk to your team', href: '/dashboard/messages', Icon: Headset },
      { label: 'Help & FAQ', sub: 'Quick answers', href: '/dashboard/help', Icon: HelpCircle },
    ],
  },
  {
    title: 'Plan & account',
    rows: [
      { label: 'Plan & billing', sub: 'Plan, invoices, card', href: '/dashboard/billing', Icon: CreditCard },
      { label: 'Agreements', sub: 'Read & sign', href: '/dashboard/agreements', Icon: FileText },
      { label: 'Settings', sub: 'Login, password, alerts, dark mode', href: '/dashboard/settings', Icon: Settings },
    ],
  },
]

export default function MvpMore({ name, location, tier, query = '' }: { name: string; location?: string | null; tier?: string | null; /** the top row's search — filters every row by name or description */ query?: string }) {
  const q = query.trim().toLowerCase()
  const groups = q ? GROUPS.map((g) => ({ ...g, rows: g.rows.filter((r) => `${r.label} ${r.sub}`.toLowerCase().includes(q)) })).filter((g) => g.rows.length > 0) : GROUPS
  const initials = name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || 'A'
  const planLabel = tier && tier !== 'Internal' ? `${tier} plan` : null

  return (
    <div style={{ background: '#fff', minHeight: '100%', padding: '14px 18px 28px', fontFamily: "'Inter',system-ui,sans-serif", boxSizing: 'border-box' }}>
      <style>{MORE_CSS}</style>

      {/* the business, as a profile card: the same mint→gold ring the app uses for its avatar */}
      <Link href="/dashboard/business-info" className="mvp-row" style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#fff', borderRadius: 18, boxShadow: CARD_SHADOW, padding: 14, textDecoration: 'none', color: 'inherit', marginBottom: 18 }}>
        <span style={{ display: 'block', width: 54, height: 54, borderRadius: '50%', padding: 2, background: 'linear-gradient(135deg, #4abd98 0%, #8ee5c6 45%, #ffd58a 100%)', boxShadow: '0 1px 2px rgba(0,0,0,.04), 0 6px 20px rgba(0,0,0,.08)', boxSizing: 'border-box', flexShrink: 0 }}>
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', borderRadius: '50%', background: '#fff', fontSize: 19, fontWeight: 800, letterSpacing: '-.02em', color: C.greenDk, fontFamily: DISPLAY }}>{initials}</span>
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 19, fontWeight: 600, color: C.ink, fontFamily: DISPLAY, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
            {planLabel && <span style={{ fontSize: 11, fontWeight: 700, color: C.greenDk, background: C.greenSoft, borderRadius: 99, padding: '2px 8px' }}>{planLabel}</span>}
            {location && <span style={{ fontSize: 12.5, color: C.mute }}>{location}</span>}
            {!planLabel && !location && <span style={{ fontSize: 12.5, color: C.mute }}>Manage your business</span>}
          </span>
        </span>
        <ChevronRight size={18} color={C.faint} style={{ flexShrink: 0 }} />
      </Link>

      {q && groups.length === 0 && <div style={{ padding: '30px 18px', textAlign: 'center', color: '#6e6e73', fontSize: 13.5 }}>Nothing matches &ldquo;{query.trim()}&rdquo;.</div>}
      {groups.map(group => (
        <div key={group.title} style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 15.5, fontWeight: 600, letterSpacing: '-.01em', color: C.ink, padding: '0 6px 8px' }}>{group.title}</div>
          <div style={{ background: '#fff', borderRadius: 18, boxShadow: CARD_SHADOW, overflow: 'hidden' }}>
            {group.rows.map((r, i) => (
              <div key={r.href}>
                {i > 0 && <div style={{ height: '0.5px', background: C.line, marginLeft: 61 }} />}
                <Link href={r.href} className="mvp-row" style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '12px 14px', textDecoration: 'none', color: 'inherit' }}>
                  {r.brand
                    ? <span style={{ width: 36, display: 'inline-flex', justifyContent: 'center', flexShrink: 0 }}>{(Array.isArray(r.brand) ? r.brand : [r.brand]).map((b, k) => <span key={b} style={{ width: 30, height: 30, borderRadius: 99, background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,.05), 0 3px 10px rgba(0,0,0,.09)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginLeft: k ? -10 : 0 }}><BrandOrMark provider={b} size={16} /></span>)}</span>
                    : <span style={{ width: 36, height: 36, borderRadius: 11, background: C.greenSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><r.Icon size={18} color={C.greenDk} /></span>}
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 15, fontWeight: 600, color: C.ink, lineHeight: 1.25 }}>{r.label}</span>
                    <span style={{ display: 'block', fontSize: 12.5, color: C.mute, marginTop: 1 }}>{r.sub}</span>
                  </span>
                  <ChevronRight size={18} color={C.faint} style={{ flexShrink: 0 }} />
                </Link>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div style={{ background: '#fff', borderRadius: 16, boxShadow: CARD_SHADOW, overflow: 'hidden', marginBottom: 14 }}>
        <button type="button" onClick={() => { void signOut() }} className="mvp-row" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 13, padding: '13px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', font: 'inherit' }}>
          <span style={{ width: 34, height: 34, borderRadius: 9, background: C.coralSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><LogOut size={18} color={C.coral} /></span>
          <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: C.coral }}>Sign out</span>
        </button>
      </div>

      <div style={{ textAlign: 'center', fontSize: 12, color: C.faint, padding: '8px 0 4px' }}>Apnosh</div>
    </div>
  )
}
