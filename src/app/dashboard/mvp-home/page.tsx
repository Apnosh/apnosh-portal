'use client'

/**
 * /dashboard/mvp-home — full-screen owner Home, faithful to the apnosh-mvp
 * design. Renders edge-to-edge OVER the portal chrome (fixed inset:0) with
 * the design's own header + bottom nav, so it matches the design screenshot
 * top-to-bottom. Wired to real data via the shared transform.
 *
 * This is the review surface for the redesign; once approved it becomes the
 * owner's actual home.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Home as HomeIcon, CalendarDays, Plus, Inbox, Menu } from 'lucide-react'
import { useClient } from '@/lib/client-context'
import MvpHome, { type MvpHomeData } from '@/components/mvp/mvp-home'
import { transformHome } from '@/components/mvp/home-transform'

const C = { green: '#4abd98', greenDk: '#2e9a78', ink: '#1d1d1f', faint: '#aeaeb2', line: '#e6e6ea', navOff: '#aeaeb2' }

// Design sample content (from apnosh-mvp lib/api.ts) — shown on this review
// surface only when the client has no real approvals / monthly review yet.
const SAMPLE_APPROVALS: MvpHomeData['approvals'] = [
  { id: 's1', tag: 'POST', timing: 'By 5pm', title: 'Kimchi Burger reel', subtitle: 'For Saturday lunch · drafted by your team', emoji: '🌶️', image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=320&q=80&auto=format&fit=crop' },
  { id: 's2', tag: 'DESIGN', timing: 'No rush', title: 'Summer menu poster', subtitle: 'Studio applied your notes', emoji: '🍑', image: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=320&q=80&auto=format&fit=crop' },
]
const SAMPLE_REVIEW: MvpHomeData['review'] = { prevMonthLabel: 'May', cycleLabel: 'June', budget: 800 }

export default function MvpHomePage() {
  const { client, loading: clientLoading } = useClient()
  const [data, setData] = useState<MvpHomeData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!client?.id) return
    let live = true
    setError(null)
    fetch(`/api/dashboard/load?clientId=${client.id}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Load failed (${r.status})`)
        return r.json()
      })
      .then((json) => {
        if (!live) return
        const d = transformHome(json.homeMetrics, json.agenda, client.name ?? '·')
        // Review surface: where real data is empty (Do Si has no pending
        // approvals / monthly review yet), fall back to the design's sample
        // content so the full design can be evaluated. The real /dashboard
        // shows real data only.
        if (d.approvals.length === 0) d.approvals = SAMPLE_APPROVALS
        if (!d.review) d.review = SAMPLE_REVIEW
        setData(d)
      })
      .catch((e) => { if (live) setError(e.message) })
    return () => { live = false }
  }, [client?.id, client?.name])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: '#fff', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {clientLoading || (!data && !error) ? (
          <Centered>Loading your numbers…</Centered>
        ) : error ? (
          <Centered>Couldn&apos;t load: {error}</Centered>
        ) : data ? (
          <MvpHome data={data} />
        ) : (
          <Centered>No client found for this account.</Centered>
        )}
      </div>
      <BottomNav />
    </div>
  )
}

function BottomNav() {
  return (
    <nav style={{ flexShrink: 0, borderTop: `1px solid ${C.line}`, background: '#fff', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', padding: '8px 8px calc(8px + env(safe-area-inset-bottom))', position: 'relative' }}>
      <NavItem href="/dashboard" icon={<HomeIcon size={21} />} label="Home" active />
      <NavItem href="/dashboard/calendar" icon={<CalendarDays size={21} />} label="Campaigns" />
      <Link href="/dashboard/requests/new" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, textDecoration: 'none', marginTop: -18 }}>
        <span style={{ width: 52, height: 52, borderRadius: '50%', background: C.green, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 16px rgba(74,189,152,0.4)' }}><Plus size={26} /></span>
        <span style={{ fontSize: 10, fontWeight: 500, color: C.navOff }}>Request</span>
      </Link>
      <NavItem href="/dashboard/inbox" icon={<Inbox size={21} />} label="Inbox" />
      <NavItem href="/dashboard/profile" icon={<Menu size={21} />} label="More" />
    </nav>
  )
}

function NavItem({ href, icon, label, active }: { href: string; icon: React.ReactNode; label: string; active?: boolean }) {
  const col = active ? C.greenDk : C.navOff
  return (
    <Link href={href} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, textDecoration: 'none', color: col, minWidth: 56 }}>
      {icon}
      <span style={{ fontSize: 10, fontWeight: active ? 600 : 500 }}>{label}</span>
    </Link>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', color: '#6e6e73', fontSize: 14, fontFamily: "'Inter',system-ui,sans-serif" }}>
      {children}
    </div>
  )
}
