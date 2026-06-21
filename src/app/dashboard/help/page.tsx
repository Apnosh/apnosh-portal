'use client'

/**
 * Owner Help & FAQ — apnosh-mvp mobile surface. Reached from More -> Help & FAQ.
 * Search-first, inline-accordion answers (the owner asked for a real FAQ feel),
 * with a human escape hatch to Messages at the bottom. Content lives in
 * src/lib/help/faqs.ts so copy can change without touching this layout.
 */

import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Compass, Bell, Star, Store, CreditCard, FileText, MessageSquare,
  Search, ChevronDown, ChevronRight, Headset,
} from 'lucide-react'
import MvpShell from '@/components/mvp/mvp-shell'
import { MvpDetailHeader, C } from '@/components/mvp/mvp-detail'
import { FAQS, type FaqCategory, type FaqIcon, type FaqItem } from '@/lib/help/faqs'

const ICONS: Record<FaqIcon, typeof Compass> = {
  start: Compass, alerts: Bell, reviews: Star, business: Store,
  billing: CreditCard, agreements: FileText, messages: MessageSquare,
}

function FaqRow({ item, open, onToggle, forceOpen }: { item: FaqItem; open: boolean; onToggle: () => void; forceOpen: boolean }) {
  const isOpen = forceOpen || open
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="mvp-row"
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px', background: 'none', border: 'none', textAlign: 'left', font: 'inherit', cursor: 'pointer' }}
        aria-expanded={isOpen}
      >
        <span style={{ flex: 1, fontSize: 14.5, fontWeight: 600, color: C.ink, lineHeight: 1.3 }}>{item.q}</span>
        <ChevronDown size={18} color={C.faint} style={{ flexShrink: 0, transition: 'transform .18s ease', transform: isOpen ? 'rotate(180deg)' : 'none' }} />
      </button>
      {isOpen && (
        <div style={{ padding: '0 14px 14px' }}>
          <p style={{ fontSize: 14, color: C.mute, lineHeight: 1.5, margin: 0 }}>{item.a}</p>
          {item.link && (
            <Link href={item.link.href} className="mvp-row" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 10, marginLeft: -4, padding: '5px 4px', borderRadius: 8, color: C.greenDk, fontWeight: 600, fontSize: 13.5, textDecoration: 'none' }}>
              {item.link.label}<ChevronRight size={15} />
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

function FaqGroup({ cat, query, openKeys, toggle }: { cat: FaqCategory; query: string; openKeys: Set<string>; toggle: (k: string) => void }) {
  const Icon = ICONS[cat.icon]
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 6px 7px' }}>
        <Icon size={13} color={C.faint} />
        <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.faint }}>{cat.category}</span>
      </div>
      <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, overflow: 'hidden' }}>
        {cat.items.map((item, i) => {
          const key = item.q
          return (
            <React.Fragment key={key}>
              {i > 0 && <div style={{ height: '0.5px', background: C.line }} />}
              <FaqRow item={item} open={openKeys.has(key)} onToggle={() => toggle(key)} forceOpen={query.length > 0} />
            </React.Fragment>
          )
        })}
      </div>
    </div>
  )
}

export default function HelpPage() {
  const [query, setQuery] = useState('')
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set())

  const toggle = (k: string) => setOpenKeys((prev) => {
    const next = new Set(prev)
    if (next.has(k)) next.delete(k); else next.add(k)
    return next
  })

  const q = query.trim().toLowerCase()
  const filtered = useMemo(() => {
    if (!q) return FAQS
    return FAQS
      .map((cat) => ({ ...cat, items: cat.items.filter((it) => it.q.toLowerCase().includes(q) || it.a.toLowerCase().includes(q)) }))
      .filter((cat) => cat.items.length > 0)
  }, [q])

  return (
    <MvpShell active="more" header={<MvpDetailHeader title="Help" subtitle="Find answers or message your team" />}>
      <div style={{ background: C.bg, minHeight: '100%', padding: '14px 14px 28px', fontFamily: "'Inter',system-ui,sans-serif", boxSizing: 'border-box' }}>
        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 18 }}>
          <Search size={17} color={C.faint} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search help"
            aria-label="Search help"
            style={{ width: '100%', border: `1px solid ${C.line}`, borderRadius: 12, padding: '11px 13px 11px 36px', fontSize: 14.5, color: C.ink, fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none', background: '#fff' }}
          />
        </div>

        {filtered.length === 0 ? (
          <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, padding: '30px 20px', textAlign: 'center' }}>
            <Search size={26} color={C.faint} style={{ margin: '0 auto 10px' }} />
            <div style={{ fontSize: 15, fontWeight: 600, color: C.ink }}>No matches</div>
            <div style={{ fontSize: 13.5, color: C.mute, marginTop: 4, lineHeight: 1.45 }}>Try different words, or message your team and we will help.</div>
          </div>
        ) : (
          filtered.map((cat) => (
            <FaqGroup key={cat.category} cat={cat} query={q} openKeys={openKeys} toggle={toggle} />
          ))
        )}

        {/* Human escape hatch */}
        <div style={{ background: C.greenSoft, border: `0.5px solid ${C.line}`, borderRadius: 16, padding: 16, marginTop: 6 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.ink }}>Still need help?</div>
          <div style={{ fontSize: 13, color: C.mute, marginTop: 2 }}>Message your team. We usually reply within a few hours.</div>
          <Link
            href="/dashboard/messages"
            className="mvp-row"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 13, height: 46, borderRadius: 13, background: C.green, color: '#fff', fontSize: 15, fontWeight: 700, textDecoration: 'none' }}
          >
            <Headset size={18} /> Message your team
          </Link>
        </div>
      </div>
    </MvpShell>
  )
}
