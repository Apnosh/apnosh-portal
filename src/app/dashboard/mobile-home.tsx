'use client'

/**
 * Mobile home — the owner phone dashboard, redesigned to match the
 * apnosh-mvp design (yejukim/apnosh-mvp). Renders the ported design Home
 * (components/mvp/mvp-home) wired to the real /api/dashboard/load payload
 * via the shared transform. Logic/data untouched; this is presentation.
 *
 * The previous version (MobileHomeHero + MobileHomeSections) is preserved
 * in git on main; this swap lives on the design/mvp-home branch.
 */

import MvpHome from '@/components/mvp/mvp-home'
import { transformHome, type AgendaItem } from '@/components/mvp/home-transform'
import type { HomeMetrics } from '@/lib/dashboard/get-home-metrics'
import type { HomeSectionsData } from '@/lib/dashboard/get-home-sections'
import type { SinceEvent } from '@/components/dashboard/since-last-checked'

interface Props {
  homeMetrics: HomeMetrics | null
  homeSections: HomeSectionsData | null
  agenda?: AgendaItem[] | null
  avatarText?: string
  sinceLastChecked?: SinceEvent[]
  loading?: boolean
  failed?: boolean
}

function greetingForNow(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', color: '#6e6e73', fontSize: 14, fontFamily: "'Inter',system-ui,sans-serif" }}>
      {children}
    </div>
  )
}

export default function MobileHome({ homeMetrics, agenda, avatarText, loading, failed }: Props) {
  if (loading) return <Frame>Loading your numbers…</Frame>
  if (failed) {
    return (
      <Frame>
        <div>
          <p style={{ color: '#1d1d1f', fontWeight: 600, marginBottom: 4 }}>Couldn&rsquo;t load your dashboard</p>
          <p style={{ marginBottom: 12 }}>Check your connection and try again.</p>
          <button type="button" onClick={() => { if (typeof window !== 'undefined') window.location.reload() }}
            style={{ background: '#4abd98', color: '#fff', border: 'none', borderRadius: 12, padding: '10px 18px', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
            Try again
          </button>
        </div>
      </Frame>
    )
  }

  const data = transformHome(
    homeMetrics as Parameters<typeof transformHome>[0],
    agenda ?? null,
    (avatarText?.[0] ?? '·').toUpperCase(),
    greetingForNow(),
  )
  return <MvpHome data={data} showHeader={false} />
}
