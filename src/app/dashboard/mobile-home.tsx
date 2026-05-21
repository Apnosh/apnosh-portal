'use client'

/**
 * Mobile home — the redesigned, data-wired phone dashboard.
 *
 * Thin wrapper that composes the two ported components:
 *   MobileHomeHero     — metric switcher, big number, avg + trend,
 *                        Week/Month/Year bar chart, trend mini-graph,
 *                        breakdown cards (from homeMetrics)
 *   MobileHomeSections — Needs you, This week recap, Your channels,
 *                        Plan (from homeSections)
 *
 * Handles loading (skeleton) and load-failure (error) up top; once data
 * is present each component renders its own empty / not-connected /
 * no-data states.
 */

import { MobileHomeHero } from '@/components/dashboard/mobile-home-hero'
import { MobileHomeSections } from '@/components/dashboard/mobile-home-sections'
import type { HomeMetrics } from '@/lib/dashboard/get-home-metrics'
import type { HomeSectionsData } from '@/lib/dashboard/get-home-sections'

interface Props {
  homeMetrics: HomeMetrics | null
  homeSections: HomeSectionsData | null
  loading?: boolean
  failed?: boolean
}

const EMPTY_SECTIONS: HomeSectionsData = {
  needs: [], plan: [], channels: [],
  week: { shipped: 0, items: '', strategist: null },
}

function Skeleton() {
  return (
    <div className="m-home" aria-hidden>
      <div className="spot">
        <div className="mh-skel skel-eyebrow" />
        <div className="mh-skel skel-num" />
        <div className="mh-skel skel-chart" />
        <div className="skel-cards">
          {[0, 1, 2, 3].map(i => <div key={i} className="mh-skel skel-card" />)}
        </div>
      </div>
      <div className="skel-rows">
        <div className="mh-skel skel-eyebrow" style={{ marginBottom: 0 }} />
        {[0, 1, 2].map(i => <div key={i} className="mh-skel skel-line" />)}
      </div>
    </div>
  )
}

function ErrorState() {
  return (
    <div className="m-home">
      <div className="mh-error">
        <p className="er-t">Couldn&rsquo;t load your dashboard</p>
        <p className="er-s">Check your connection and try again.</p>
        <button type="button" onClick={() => { if (typeof window !== 'undefined') window.location.reload() }}>Try again</button>
      </div>
    </div>
  )
}

export default function MobileHome({ homeMetrics, homeSections, loading, failed }: Props) {
  if (loading) return <Skeleton />
  if (failed) return <ErrorState />
  return (
    <>
      <MobileHomeHero metrics={homeMetrics?.metrics ?? []} />
      <MobileHomeSections data={homeSections ?? EMPTY_SECTIONS} />
    </>
  )
}
