'use client'

/**
 * /dashboard/more — the owner "More" hub in the apnosh-mvp design. An
 * iOS-Settings-style grouped list: a business identity card on top, then the
 * surfaces that don't earn a primary tab (business records, help + tools, plan
 * + account), then sign out.
 *
 * Every row links to a page that already exists. "Contact support" deep-links
 * into the owner's team chat (Messages) rather than opening a second inbox, so
 * there's one conversation with two doors (here + the header chat).
 */

import Link from 'next/link'
import {
  Store, Palette, Plug, Image as ImageIcon, Target,
  Headset, HelpCircle, Sparkles,
  CreditCard, FileText, Settings,
  ChevronRight, LogOut,
} from 'lucide-react'
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

type Row = { label: string; sub: string; href: string; Icon: typeof Store }

const GROUPS: { title: string; rows: Row[] }[] = [
  {
    title: 'Your business',
    rows: [
      { label: 'Business info & hours', sub: 'Hours, menu, photos', href: '/dashboard/business-info', Icon: Store },
      { label: 'Brand & audience', sub: 'Voice, audience, competitors', href: '/dashboard/business-info/brand', Icon: Palette },
      { label: 'Connected accounts', sub: 'Instagram, Google, Yelp', href: '/dashboard/connected-accounts', Icon: Plug },
      { label: 'Photos & files', sub: 'Logo, photos, videos', href: '/dashboard/assets', Icon: ImageIcon },
      { label: 'Your goals', sub: 'What to focus on', href: '/dashboard/goals', Icon: Target },
    ],
  },
  {
    title: 'Help & tools',
    rows: [
      { label: 'Contact support', sub: 'Talk to your team', href: '/dashboard/messages', Icon: Headset },
      { label: 'Help & FAQ', sub: 'Quick answers', href: '/dashboard/help', Icon: HelpCircle },
      { label: 'AI helpers', sub: 'Captions & replies', href: '/dashboard/tools', Icon: Sparkles },
    ],
  },
  {
    title: 'Plan & account',
    rows: [
      { label: 'Plan & billing', sub: 'Plan, invoices, card', href: '/dashboard/billing', Icon: CreditCard },
      { label: 'Agreements', sub: 'Read & sign', href: '/dashboard/agreements', Icon: FileText },
      { label: 'Settings', sub: 'Login, password, alerts', href: '/dashboard/settings', Icon: Settings },
    ],
  },
]

export default function MvpMore({ name, location, tier }: { name: string; location?: string | null; tier?: string | null }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || 'A'
  const planLabel = tier && tier !== 'Internal' ? `${tier} plan` : null
  const subLine = [planLabel, location].filter(Boolean).join(' · ') || 'Manage your business'

  return (
    <div style={{ background: C.bg, minHeight: '100%', padding: '14px 14px 28px', fontFamily: "'Inter',system-ui,sans-serif", boxSizing: 'border-box' }}>
      <style>{MORE_CSS}</style>

      <Link href="/dashboard/business-info" className="mvp-row" style={{ display: 'flex', alignItems: 'center', gap: 13, background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, padding: 14, textDecoration: 'none', color: 'inherit', marginBottom: 22 }}>
        <span style={{ width: 50, height: 50, borderRadius: '50%', background: C.greenSoft, color: C.greenDk, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 18, fontWeight: 700 }}>{initials}</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 19, fontWeight: 600, color: C.ink, fontFamily: DISPLAY, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
          <span style={{ display: 'block', fontSize: 13, color: C.mute, marginTop: 3 }}>{subLine}</span>
        </span>
        <ChevronRight size={18} color={C.faint} style={{ flexShrink: 0 }} />
      </Link>

      {GROUPS.map(group => (
        <div key={group.title} style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.faint, padding: '0 6px 7px' }}>{group.title}</div>
          <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, overflow: 'hidden' }}>
            {group.rows.map((r, i) => (
              <div key={r.href}>
                {i > 0 && <div style={{ height: '0.5px', background: C.line, marginLeft: 61 }} />}
                <Link href={r.href} className="mvp-row" style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '12px 14px', textDecoration: 'none', color: 'inherit' }}>
                  <span style={{ width: 34, height: 34, borderRadius: 9, background: C.greenSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><r.Icon size={18} color={C.greenDk} /></span>
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

      <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, overflow: 'hidden', marginBottom: 14 }}>
        <button type="button" onClick={() => { void signOut() }} className="mvp-row" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 13, padding: '13px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', font: 'inherit' }}>
          <span style={{ width: 34, height: 34, borderRadius: 9, background: C.coralSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><LogOut size={18} color={C.coral} /></span>
          <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: C.coral }}>Sign out</span>
        </button>
      </div>

      <div style={{ textAlign: 'center', fontSize: 12, color: C.faint, padding: '8px 0 4px' }}>Apnosh</div>
    </div>
  )
}
